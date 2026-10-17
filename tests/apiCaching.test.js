/**
 * API responses are per viewer and never cached or revalidated - S1.
 *
 * Traces to: FR-1.5, FR-3.6, TD-003, DEC-012, DEC-015 §1 (the ETag is for If-Match
 * on writes only), NV-161.
 *
 * Basis: GET /api/v1/requests/:id carries ETag "v<version>", which depends on the
 * version alone, while the body differs per viewer. Express answers a matching
 * If-None-Match with 304, so a browser that changed user reused the previous
 * user's cached body, FR-1.5 fields included. The API must answer 200 with the
 * caller's own body whatever conditional headers arrive, and must say no-store.
 *
 * Real createApp, session middleware, auth service, query and transition services
 * over real HTTP; only persistence is faked.
 *
 * What this does NOT show: what a given browser's cache does with no-store; only
 * that the server never answers 304 and sends the directive.
 */

import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { createAuthService } from '../src/services/authService.js';
import { createHealthService } from '../src/services/healthService.js';
import { createRequestQueryService } from '../src/services/requestQueryService.js';
import { createStatusTransitionService } from '../src/services/statusTransitionService.js';
import { ROLE, STATUS } from '../src/models/_shared.js';

const CAT = 'cat1';
const doc = () => ({
  _id: 'r1', reference: 'CC-2026-000001', status: STATUS.ASSIGNED, version: 3,
  categoryId: CAT, securityCategory: true, requesterId: 'u2', submittedById: 'u2',
  submittedAt: new Date('2026-10-01T08:00:00Z'), assigneeId: 'u8',
  location: 'LOC', description: 'DESC-SENTINEL', resolution: {}, closure: {},
});
const account = (id, email, roles) => ({
  _id: id, campusId: 'c1', email, displayName: id, passwordHash: 'fake$right', roles,
  categoryAuthorisations: [CAT], groupIds: [], status: 'active', sessionEpoch: 0,
});

function harness() {
  const store = { doc: doc() };
  const users = new Map([
    ['u2', account('u2', 'req@example.test', [ROLE.REQUESTER])],
    ['u8', account('u8', 'so@example.test', [ROLE.SECURITY_OFFICER])],
  ]);
  const sessions = new Map();
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
  const statusTransitionService = createStatusTransitionService({
    requests: {
      findById: async () => store.doc,
      applyChange: async (id, expected, changes) => {
        store.doc.status = changes.status;
        store.doc.version = expected + 1;
        return { version: store.doc.version };
      },
    },
    history: { findByIdempotencyKey: async () => null, append: async () => ({ _id: 'h1' }) },
    unitOfWork: { run: async (work) => work({}) },
  });
  return createApp({
    authService, healthService: createHealthService({ pingDatabase: async () => {} }),
    statusTransitionService,
    requestQueryService: createRequestQueryService({ requests: { findById: async () => store.doc } }),
    log: { error() {} },
  });
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

const read = (base, cookie, headers = {}) =>
  fetch(`${base}/api/v1/requests/r1`, { headers: { cookie, ...headers } });

/**
 * A GET over node:http. The fetch API adds Cache-Control: no-cache to any request
 * carrying If-None-Match or If-Modified-Since, which makes Express treat it as
 * stale and hides the defect. A browser revalidating its cache sends the bare
 * conditional header, as here.
 */
function conditionalGet(base, cookie, headers) {
  return new Promise((resolve, reject) => {
    http.get(`${base}/api/v1/requests/r1`, { headers: { cookie, ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
}

// Basis: FR-1.5 (the description of a security-category request is for the Security
// Officer only), DEC-015 §1 (ETag serves If-Match, not revalidation). Technique: the
// Security Officer reads and keeps the ETag; the Requester, same version, sends it as
// If-None-Match, which is what a browser does after a user switch. Expected, written
// before running: 200, the Requester's own body, no description key, the sentinel
// nowhere in the text, and never 304. Shows: a conditional GET cannot return another
// viewer's body or an empty 304 the browser fills from its cache. Does NOT show: other
// conditional headers beyond If-None-Match and If-Modified-Since.
test('a conditional GET from another user with the first user ETag is 200 with their own body, never 304 - FR-1.5, DEC-015 §1, NV-161', async () => {
  await serve(harness(), async (base) => {
    const officer = await login(base, 'so@example.test');
    const first = await read(base, officer);
    assert.equal(first.status, 200);
    assert.match(await first.text(), /DESC-SENTINEL/, 'the officer sees the description');
    const etag = first.headers.get('etag');
    assert.equal(etag, '"v3"');

    const requester = await login(base, 'req@example.test');
    for (const conditional of [{ 'if-none-match': etag }, { 'if-none-match': '*' },
      { 'if-modified-since': new Date(Date.now() + 86_400_000).toUTCString() }]) {
      const res = await conditionalGet(base, requester, conditional);
      assert.equal(res.status, 200, JSON.stringify(conditional));
      const { text } = res;
      assert.doesNotMatch(text, /DESC-SENTINEL/);
      const body = JSON.parse(text);
      assert.equal('description' in body, false);
      assert.deepEqual(body.permittedTransitions, []);
      assert.equal(res.headers.etag, etag, 'the ETag header is kept for If-Match');
    }
  });
});

// Basis: the S1 decision (every /api response no-store). Expected, before running:
// the directive on a 200 read, a 201 write, a 401, a 404 and a 400 problem response.
test('every API response carries Cache-Control: no-store, reads, writes and problem responses - DEC-015 §1, FR-1.5', async () => {
  await serve(harness(), async (base) => {
    const officer = await login(base, 'so@example.test');
    const checks = {
      'read 200': await read(base, officer),
      'write 201': await fetch(`${base}/api/v1/requests/r1/transitions`, {
        method: 'POST',
        headers: { cookie: officer, 'content-type': 'application/json', 'if-match': '"v3"', 'idempotency-key': 'k1' },
        body: JSON.stringify({ toStatus: STATUS.IN_PROGRESS }) }),
      'problem 401': await fetch(`${base}/api/v1/requests/r1`),
      'problem 404': await fetch(`${base}/api/v1/nowhere`, { headers: { cookie: officer } }),
      'problem 400': await fetch(`${base}/api/v1/requests/r1/transitions`, {
        method: 'POST', headers: { cookie: officer, 'content-type': 'application/json' }, body: '{}' }),
    };
    assert.equal(checks['write 201'].status, 201);
    assert.equal(checks['problem 401'].status, 401);
    assert.equal(checks['problem 404'].status, 404);
    assert.equal(checks['problem 400'].status, 400);
    for (const [name, res] of Object.entries(checks)) {
      assert.equal(res.headers.get('cache-control'), 'no-store', name);
    }
  });
});

test('the ETag is still sent on reads and If-Match is still required on writes - DEC-015 §1, §3', async () => {
  await serve(harness(), async (base) => {
    const officer = await login(base, 'so@example.test');
    assert.equal((await read(base, officer)).headers.get('etag'), '"v3"');
    const noIfMatch = await fetch(`${base}/api/v1/requests/r1/transitions`, {
      method: 'POST',
      headers: { cookie: officer, 'content-type': 'application/json', 'idempotency-key': 'k2' },
      body: JSON.stringify({ toStatus: STATUS.ASSIGNED }) });
    assert.equal(noIfMatch.status, 428);
  });
});
