/**
 * DEC-015 conformance fixes at M4: DEF-007 to DEF-012, NFR-1.11 and TD-006.
 *
 * Traces to: DEF-007 (replay status, body and header, DEC-015 §3), DEF-008 (current
 *            ETag on 412, DEC-015 §2), DEF-009 (fingerprint over method, path and
 *            canonical JSON, DEC-015 §3), DEF-010 (problem type idempotency-key-reused,
 *            DEC-015 §3), DEF-011 (wrong role is 403, DEC-015 §4, FR-6.4, AC-FR-6.4),
 *            DEF-012 (malformed id is 400, DEC-015 §4), NFR-1.11 / AC-NFR-1.11, and
 *            TD-006 (a reject without a reason is refused, FR-6.6 / AC-FR-6.6).
 *
 * Expected results come from those records, written before the code was changed:
 * each case below failed against v3.0-M3-baseline's code in the way the defect
 * describes (the integration run in docs/evidence/M3_API_Test_Run.txt shows the
 * same 15 failures at API level), and passes once the fix is in.
 *
 * The service runs for real; persistence and the unit of work are faked, as in
 * tests/statusTransitionService.test.js. HTTP cases use the real createApp, real
 * session middleware and real auth service over an ephemeral port.
 *
 * What this does NOT show: any of it against a real cluster. The eight API cases
 * in tests/integration/ do that, by hand against the test cluster or in CI once the
 * integration job (TD-008) runs them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { createAuthService } from '../src/services/authService.js';
import { createHealthService } from '../src/services/healthService.js';
import { createRequestQueryService } from '../src/services/requestQueryService.js';
import { createStatusTransitionService } from '../src/services/statusTransitionService.js';
import { requestRepository } from '../src/repositories/requestRepository.js';
import { readCommand } from '../src/routes/requestRoutes.js';
import { checkTransition, STATUS, ROLE } from '../src/domain/requestStatus.js';
import { resetSubscriptions } from '../src/events/requestEvents.js';
import {
  AuthorisationError, IdempotencyConflictError, PreconditionFailedError, TransitionError, ValidationError,
} from '../src/errors.js';

const CAT = 'cat-1';
const AT = new Date('2026-10-17T10:00:00.000Z');
const REQUEST_ID = '6ad32a67bc2f9e02fb090ee9';
const OTHER_ID = '6ad32a67bc2f9e02fb090eea';

test.beforeEach(() => resetSubscriptions());

/** The real service over an in-memory request and history store. */
function serviceHarness({ status = STATUS.RECEIVED, version = 0 } = {}) {
  const stored = new Map([[REQUEST_ID, { _id: REQUEST_ID, status, version, categoryId: CAT,
    campusId: 'c1', requesterId: 'u-req', reference: 'CC-2026-000001', securityCategory: false,
    resolution: { summary: null } }]]);
  const entries = [];
  const requests = {
    findById: async (id) => (stored.has(id) ? { ...stored.get(id) } : null),
    applyChange: async (id, expected, $set) => {
      const r = stored.get(id);
      if (r.version !== expected) throw new PreconditionFailedError(id, expected);
      stored.set(id, { ...r, ...$set, version: expected + 1 });
      return { version: expected + 1 };
    },
  };
  const history = {
    append: async (entry) => { const e = { ...entry, _id: `hist-${entries.length + 1}` }; entries.push(e); return e; },
    findByIdempotencyKey: async (actorId, key) =>
      entries.find((e) => e.actorId === actorId && e.idempotencyKey === key) ?? null,
  };
  const unitOfWork = { run: async (work) => { await work('session-1'); } };
  const service = createStatusTransitionService({ requests, history, unitOfWork, clock: () => AT });
  return { service, stored, entries };
}

const COORDINATOR = { id: 'u-coord', roles: [ROLE.COORDINATOR], categoryAuthorisations: [CAT] };
const TECHNICIAN  = { id: 'u-tech',  roles: [ROLE.TECHNICIAN],  categoryAuthorisations: [CAT] };

// ---------- DEF-011 ----------

test('a role that may not make the move is refused as 403, and nothing is written — DEF-011, DEC-015 §4, AC-FR-6.4', async () => {
  // Expected (DEC-015 §4, 403 row: FR-6.4): AuthorisationError, status unchanged, no entry.
  const { service, stored, entries } = serviceHarness();
  await assert.rejects(
    () => service.transition(REQUEST_ID, STATUS.REJECTED, TECHNICIAN,
      { expectedVersion: 0, reason: 'not mine', idempotencyKey: 'k1', fingerprint: 'f1' }),
    (error) => error instanceof AuthorisationError && error.status === 403 && error.code === 'FORBIDDEN',
  );
  assert.equal(stored.get(REQUEST_ID).status, STATUS.RECEIVED);
  assert.equal(entries.length, 0);
});

test('a move the model does not allow is still 422, not 403 — DEF-011 boundary, FR-6.2', async () => {
  // Expected: the DEF-011 change touches only the role refusal; an illegal move stays 422.
  const { service } = serviceHarness();
  await assert.rejects(
    () => service.transition(REQUEST_ID, STATUS.RESOLVED, COORDINATOR, { expectedVersion: 0 }),
    (error) => error instanceof TransitionError && error.status === 422,
  );
});

// ---------- DEF-007 ----------

test('a replay returns the same result as the original and is marked replayed — DEF-007, DEC-015 §3', async () => {
  // Expected: identical fields (requestId, historyId, fromStatus, toStatus, occurredAt,
  // version), replayed false then true, and no second history entry.
  const { service, entries } = serviceHarness();
  const command = { expectedVersion: 0, reason: 'duplicate', idempotencyKey: 'k1', fingerprint: 'f1' };
  const original = await service.transition(REQUEST_ID, STATUS.REJECTED, COORDINATOR, command);
  const replay = await service.transition(REQUEST_ID, STATUS.REJECTED, COORDINATOR, command);

  const { replayed: r1, ...first } = original;
  const { replayed: r2, ...second } = replay;
  assert.equal(r1, false);
  assert.equal(r2, true);
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)));
  assert.deepEqual(Object.keys(first).sort(),
    ['fromStatus', 'historyId', 'occurredAt', 'requestId', 'toStatus', 'version']);
  assert.equal(entries.length, 1);
});

// ---------- DEF-008 ----------

test('a stale version is refused with the current ETag in the problem body — DEF-008, DEC-015 §2', async () => {
  // Expected: PreconditionFailedError carrying currentEtag "v5" for a request at version 5.
  const { service } = serviceHarness({ version: 5 });
  await assert.rejects(
    () => service.transition(REQUEST_ID, STATUS.REJECTED, COORDINATOR, { expectedVersion: 3, reason: 'x' }),
    (error) => error instanceof PreconditionFailedError && error.extensions?.currentEtag === '"v5"',
  );
});

// ---------- DEF-009, DEF-010 ----------

function fakeReq({ method = 'POST', url = `/api/v1/requests/${REQUEST_ID}/transitions`, body }) {
  const headers = { 'if-match': '"v0"', 'idempotency-key': 'k-1' };
  return { method, originalUrl: url, body, get: (name) => headers[name.toLowerCase()] };
}

test('the same key and body on a different request give a different fingerprint — DEF-009, DEC-015 §3', () => {
  // Expected: the path is part of the fingerprint, so request B cannot replay request A's result.
  const body = { toStatus: STATUS.REJECTED, reason: 'duplicate' };
  const a = readCommand(fakeReq({ body }));
  const b = readCommand(fakeReq({ body, url: `/api/v1/requests/${OTHER_ID}/transitions` }));
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test('the same body with its members in another order has the same fingerprint — DEF-009, DEC-015 §3 canonical JSON', () => {
  // Expected: canonical JSON sorts members, so the reordered body is a replay, not a conflict.
  const a = readCommand(fakeReq({ body: { toStatus: STATUS.REJECTED, reason: 'duplicate' } }));
  const b = readCommand(fakeReq({ body: { reason: 'duplicate', toStatus: STATUS.REJECTED } }));
  assert.equal(a.fingerprint, b.fingerprint);
});

test('a reused key is refused with the problem type idempotency-key-reused — DEF-010, DEC-015 §3', () => {
  const error = new IdempotencyConflictError();
  assert.equal(error.status, 422);
  assert.match(error.type, /\/idempotency-key-reused$/);
});

// ---------- DEF-012 ----------

test('a malformed request id is refused before any read — DEF-012, DEC-015 §4', async () => {
  // Expected: ValidationError (400) from the repository, so Mongoose never casts the id.
  await assert.rejects(() => requestRepository.findById('not-an-id'),
    (error) => error instanceof ValidationError && error.status === 400);
});

// ---------- HTTP: DEF-007, DEF-008, DEF-011, DEF-012, NFR-1.11 ----------

function appHarness({ status = STATUS.RECEIVED, version = 0, requestsOverride } = {}) {
  const users = new Map([
    ['u-coord', { _id: 'u-coord', campusId: 'c1', email: 'coord@example.test', displayName: 'Coordinator Person',
                  passwordHash: 'fake$right', roles: [ROLE.COORDINATOR], categoryAuthorisations: [CAT],
                  groupIds: [], status: 'active', sessionEpoch: 0 }],
    ['u-tech', { _id: 'u-tech', campusId: 'c1', email: 'tech@example.test', displayName: 'Technician Person',
                 passwordHash: 'fake$right', roles: [ROLE.TECHNICIAN], categoryAuthorisations: [CAT],
                 groupIds: [], status: 'active', sessionEpoch: 0 }],
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
    passwords: { hash: async (p) => `fake$${p}`, verify: async (p, h) => ({ ok: h === `fake$${p}`, needsRehash: false }) },
  });
  const { service } = serviceHarness({ status, version });
  const logged = [];
  const log = { error() {}, info: (line) => logged.push(line), log: (line) => logged.push(line) };
  const app = createApp({
    authService,
    healthService: createHealthService({ pingDatabase: async () => {}, release: 'test' }),
    statusTransitionService: service,
    requestQueryService: createRequestQueryService({ requests: requestsOverride ?? requestRepository }),
    log,
  });
  return { app, logged };
}

async function serve(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

const json = (body, headers = {}) => ({ headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function login(base, email) {
  const res = await fetch(`${base}/api/v1/sessions`, { method: 'POST', ...json({ email, password: 'right' }) });
  return res.headers.getSetCookie()[0].split(';')[0];
}

const post = (base, cookie, body, headers) => fetch(`${base}/api/v1/requests/${REQUEST_ID}/transitions`,
  { method: 'POST', ...json(body, { cookie, 'if-match': '"v0"', 'idempotency-key': 'key-1', ...headers }) });

test('over HTTP a replay has the original status, the same body and Idempotent-Replayed: true — DEF-007, DEC-015 §3', async () => {
  await serve(appHarness().app, async (base) => {
    const cookie = await login(base, 'coord@example.test');
    const body = { toStatus: STATUS.REJECTED, reason: 'duplicate' };
    const first = await post(base, cookie, body);
    const firstBody = await first.json();
    const again = await post(base, cookie, body);
    assert.equal(first.status, 201);
    assert.equal(again.status, first.status);
    assert.deepEqual(await again.json(), firstBody);
    assert.equal(again.headers.get('idempotent-replayed'), 'true');
    assert.equal(first.headers.get('idempotent-replayed'), null);
    assert.equal(again.headers.get('etag'), first.headers.get('etag'));
  });
});

test('over HTTP a wrong-role transition is 403 FORBIDDEN — DEF-011, DEC-015 §4, AC-FR-6.4', async () => {
  await serve(appHarness().app, async (base) => {
    const cookie = await login(base, 'tech@example.test');
    const res = await post(base, cookie, { toStatus: STATUS.REJECTED, reason: 'not mine' });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'FORBIDDEN');
  });
});

test('over HTTP a stale If-Match is 412 with the current ETag as a member of the body — DEF-008, DEC-015 §2', async () => {
  await serve(appHarness({ version: 1 }).app, async (base) => {
    const cookie = await login(base, 'coord@example.test');
    const res = await post(base, cookie, { toStatus: STATUS.REJECTED, reason: 'late' });
    assert.equal(res.status, 412);
    const problem = await res.json();
    assert.equal(problem.currentEtag, '"v1"');
    assert.equal(problem.code, 'PRECONDITION_FAILED');
  });
});

test('over HTTP a malformed request id is 400, not 500 — DEF-012, DEC-015 §4', async () => {
  await serve(appHarness().app, async (base) => {
    const cookie = await login(base, 'coord@example.test');
    const res = await fetch(`${base}/api/v1/requests/not-an-id`, { headers: { cookie } });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'INVALID_REQUEST');
  });
});

test('each operation writes one structured performance entry with no personal information — NFR-1.11, AC-NFR-1.11', async () => {
  // Expected: one JSON entry per response, exactly {kind, operation, durationMs, outcome};
  // operation is the route pattern; no e-mail, display name, reason text or concrete id.
  const { app, logged } = appHarness();
  let responses = 0;
  await serve(app, async (base) => {
    await fetch(`${base}/api/v1/health`); responses += 1;
    const cookie = await login(base, 'coord@example.test'); responses += 1;
    await post(base, cookie, { toStatus: STATUS.REJECTED, reason: 'Ms Example at 12 Main Road' }); responses += 1;
    await fetch(`${base}/api/v1/requests/not-an-id`, { headers: { cookie } }); responses += 1;
  });
  await new Promise((resolve) => setImmediate(resolve));
  const entries = logged.map((line) => JSON.parse(line)).filter((e) => e.kind === 'perf');
  assert.equal(entries.length, responses);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['durationMs', 'kind', 'operation', 'outcome']);
    assert.ok(Number.isInteger(entry.durationMs) && entry.durationMs >= 0);
    assert.ok(Number.isInteger(entry.outcome));
  }
  const text = logged.join('\n');
  for (const forbidden of ['coord@example.test', 'Coordinator Person', 'Ms Example', '12 Main Road', REQUEST_ID, 'not-an-id']) {
    assert.equal(text.includes(forbidden), false, `the performance log contains '${forbidden}'`);
  }
  assert.ok(entries.some((e) => e.operation === 'POST /api/v1/requests/:id/transitions' && e.outcome === 201));
});

// ---------- TD-006 ----------

test('a reject without a reason is refused — TD-006, FR-6.6, AC-FR-6.6', () => {
  // Expected: refused, stating that a reason is required; with a reason it is allowed.
  const without = checkTransition(STATUS.RECEIVED, STATUS.REJECTED, [ROLE.COORDINATOR], { hasReason: false });
  assert.equal(without.allowed, false);
  assert.match(without.reason, /reason/i);
  const withReason = checkTransition(STATUS.RECEIVED, STATUS.REJECTED, [ROLE.COORDINATOR], { hasReason: true });
  assert.equal(withReason.allowed, true);
});

// ---------- integration case 2b (17/10/2026): a document whose _id is a getter ----------

test('the original result carries historyId when the repository returns a document — DEF-007, DEC-015 §3', async () => {
  // Expected: historyId equals the stored entry's id even though `_id` is not an own
  // property, as on a Mongoose document; the replay then has the same body.
  class Doc { constructor(data) { Object.assign(this, data); } get _id() { return 'hist-doc-1'; } }
  const entries = [];
  const realAppend = entries.push.bind(entries);
  const history = {
    append: async (entry) => { realAppend({ ...entry, _id: 'hist-doc-1' }); return new Doc(entry); },
    findByIdempotencyKey: async (actorId, key) => entries.find((e) => e.actorId === actorId && e.idempotencyKey === key) ?? null,
  };
  const docService = createStatusTransitionService({
    requests: { findById: async () => ({ _id: REQUEST_ID, status: STATUS.RECEIVED, version: 0, categoryId: CAT,
      campusId: 'c1', requesterId: 'u-req', reference: 'CC-2026-000001', securityCategory: false, resolution: { summary: null } }),
    applyChange: async (id, expected) => ({ version: expected + 1 }) },
    history, unitOfWork: { run: async (work) => { await work('s'); } }, clock: () => AT,
  });
  const command = { expectedVersion: 0, reason: 'duplicate', idempotencyKey: 'k-doc', fingerprint: 'f-doc' };
  const original = await docService.transition(REQUEST_ID, STATUS.REJECTED, COORDINATOR, command);
  const replay = await docService.transition(REQUEST_ID, STATUS.REJECTED, COORDINATOR, command);
  assert.equal(original.historyId, 'hist-doc-1');
  const body = (r) => { const copy = JSON.parse(JSON.stringify(r)); delete copy.replayed; return copy; };
  assert.deepEqual(body(replay), body(original));
});
