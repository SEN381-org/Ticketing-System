/**
 * The performance log names the real route pattern for every outcome - S5 (A8).
 *
 * Traces to: NFR-1.11, AC-NFR-1.11, DEC-017 (purpose D), CON-007.
 *
 * Basis: NFR-1.11 asks for one entry per operation naming the operation. Express resets
 * req.baseUrl when next(err) leaves a router, so an error raised after route matching
 * (a 400 from the handler, a 401 or 403 from the guard) was logged as "POST /" or, on the
 * oldest path, "(no route)", while a 201 was logged correctly. Expected, written before
 * the run: the same operation string, "POST /api/v1/requests", for a 201, a 400, a 401 and
 * a 403; a fixed label for a path no route matches; no concrete id in any entry.
 *
 * What this does NOT show: durations (asserted elsewhere to be integers), or shipping the log.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { createAuthService } from '../src/services/authService.js';
import { createHealthService } from '../src/services/healthService.js';
import { createRequestQueryService } from '../src/services/requestQueryService.js';
import { ValidationError } from '../src/errors.js';
import { ROLE, STATUS } from '../src/models/_shared.js';

const account = (id, email, roles) => ({
  _id: id, campusId: 'c1', email, displayName: id, passwordHash: 'fake$right', roles,
  categoryAuthorisations: [], groupIds: [], status: 'active', sessionEpoch: 0,
});

function harness() {
  const users = new Map([
    ['u2', account('u2', 'req@example.test', [ROLE.REQUESTER])],
    ['u4', account('u4', 'tech@example.test', [ROLE.TECHNICIAN])],
  ]);
  const sessions = new Map();
  const logged = [];
  const authService = createAuthService({
    users: {
      findForLogin: async (email) => [...users.values()].find((u) => u.email === email) ?? null,
      findById: async (id) => users.get(String(id)) ?? null,
      updatePasswordHash: async () => {},
    },
    sessions: {
      create: async (s) => { sessions.set(s._id, { ...s }); },
      findById: async (id) => sessions.get(id) ?? null,
      touch: async () => {},
      remove: async (id) => { const s = sessions.get(id) ?? null; sessions.delete(id); return s; },
    },
    audit: { recordSecurityEvent: async () => {} },
    passwords: {
      hash: async (p) => `fake$${p}`,
      verify: async (p, h) => ({ ok: h === `fake$${p}`, needsRehash: false }),
    },
  });
  const requestSubmissionService = {
    submit: async (actor, body) => {
      if (!body.category) throw new ValidationError('category is required');
      return { result: { id: 'r1', version: 1 }, replayed: false };
    },
  };
  const requestQueryService = createRequestQueryService({
    requests: { findById: async () => ({ _id: 'r1', status: STATUS.RECEIVED, version: 1, requesterId: 'someone' }) },
  });
  const app = createApp({
    authService, healthService: createHealthService({ pingDatabase: async () => {} }),
    requestSubmissionService, requestQueryService, statusTransitionService: {},
    log: { error() {}, info: (line) => logged.push(line) },
  });
  return { app, logged };
}

async function serve(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function login(base, email) {
  const res = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'right' }),
  });
  return res.headers.getSetCookie()[0].split(';')[0];
}

const submit = (base, cookie, body) => fetch(`${base}/api/v1/requests`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': 'k1', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});

const perfEntries = (logged) => logged.map((l) => JSON.parse(l)).filter((e) => e.kind === 'perf');

// Technique: one route, four outcomes - 201 (valid), 400 (the handler's ValidationError,
// raised after route matching), 401 (no session) and 403 (a Technician may not submit).
// Expected: each entry's operation is "POST /api/v1/requests" and its outcome the status.
// NV-167: break the recorded mount path and the three error entries stop naming the route.
test('a 201, 400, 401 and 403 from POST /api/v1/requests each log the operation "POST /api/v1/requests" - NFR-1.11, AC-NFR-1.11, NV-167', async () => {
  const { app, logged } = harness();
  await serve(app, async (base) => {
    const requester = await login(base, 'req@example.test');
    const tech = await login(base, 'tech@example.test');
    const before = perfEntries(logged).length;
    assert.equal((await submit(base, requester, { category: 'c', location: 'l', description: 'd' })).status, 201);
    assert.equal((await submit(base, requester, {})).status, 400);
    assert.equal((await submit(base, null, {})).status, 401);
    assert.equal((await submit(base, tech, { category: 'c' })).status, 403);
    await new Promise((resolve) => setImmediate(resolve));
    const entries = perfEntries(logged).slice(before);
    assert.deepEqual(entries.map((e) => [e.operation, e.outcome]), [
      ['POST /api/v1/requests', 201], ['POST /api/v1/requests', 400],
      ['POST /api/v1/requests', 401], ['POST /api/v1/requests', 403],
    ]);
  });
});

test('a 404 from GET /api/v1/requests/:id logs the pattern, not the concrete id - NFR-1.11, CON-007', async () => {
  const { app, logged } = harness();
  await serve(app, async (base) => {
    const requester = await login(base, 'req@example.test');
    const before = perfEntries(logged).length;
    const res = await fetch(`${base}/api/v1/requests/aaaaaaaaaaaaaaaaaaaaaaaa`, { headers: { cookie: requester } });
    assert.equal(res.status, 404);
    await new Promise((resolve) => setImmediate(resolve));
    const [entry] = perfEntries(logged).slice(before);
    assert.equal(entry.operation, 'GET /api/v1/requests/:id');
    assert.equal(logged.join('\n').includes('aaaaaaaaaaaaaaaaaaaaaaaa'), false);
  });
});

test('a path no route matches logs a fixed label - NFR-1.11', async () => {
  const { app, logged } = harness();
  await serve(app, async (base) => {
    const before = perfEntries(logged).length;
    assert.equal((await fetch(`${base}/api/v1/nowhere/at/all`)).status, 404);
    await new Promise((resolve) => setImmediate(resolve));
    const [entry] = perfEntries(logged).slice(before);
    assert.equal(entry.operation, 'GET (no route)');
    assert.equal(entry.outcome, 404);
  });
});
