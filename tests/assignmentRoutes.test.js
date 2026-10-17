/**
 * POST /api/v1/requests/{id}/assignments over real HTTP.
 *
 * Traces to: FR-5.1, FR-5.2, FR-5.3, FR-5.5, FR-1.3, AC-FR-5.3, AC-FR-1.3,
 *            TD-005, NFR-3.3, DEC-012, DEC-015, DEC-016.
 *
 * createApp, the session middleware, the auth service, the real assignment
 * service and the real access-audit service run over real HTTP. Only
 * persistence is faked: a request store with a version- and owner-conditional
 * update, a history list, and an audit list that stands in for the auditLog.
 *
 * What this does NOT show: the same flow against Atlas, or a rendered client.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp, routeTable } from '../src/app.js';
import { createAuthService } from '../src/services/authService.js';
import { createHealthService } from '../src/services/healthService.js';
import { createAssignmentService } from '../src/services/assignmentService.js';
import { createAccessAuditService } from '../src/services/accessAuditService.js';
import { GUARD_NAME } from '../src/middleware/authorise.js';
import { PreconditionFailedError } from '../src/errors.js';
import { ROLE, STATUS } from '../src/models/_shared.js';

const REQ = '65f000000000000000000001';
const CAT = '65f0000000000000000000c1';
const id = (n) => `65f0000000000000000000a${n}`;
const USERS = {
  coord: { _id: id(1), email: 'coord@example.test', roles: [ROLE.COORDINATOR] },
  tech1: { _id: id(2), email: 'tech1@example.test', roles: [ROLE.TECHNICIAN] },
  tech2: { _id: id(3), email: 'tech2@example.test', roles: [ROLE.TECHNICIAN] },
  req:   { _id: id(4), email: 'req@example.test',   roles: [ROLE.REQUESTER] },
  admin: { _id: id(5), email: 'admin@example.test', roles: [ROLE.ADMINISTRATOR] },
};

function harness(doc = {}) {
  const store = {
    doc: { _id: REQ, campusId: 'c1', reference: 'CC-2026-000001', categoryId: CAT, securityCategory: false,
           requesterId: id(4), status: STATUS.RECEIVED, assigneeId: null, version: 1, ...doc },
  };
  const historyRows = [];
  const audit = [];
  const users = new Map(Object.values(USERS).map((u) => [String(u._id), {
    ...u, campusId: 'c1', displayName: u.email, passwordHash: 'fake$right',
    categoryAuthorisations: u.roles.includes(ROLE.REQUESTER) ? [] : [CAT], groupIds: [], status: 'active', sessionEpoch: 0,
  }]));
  const sessions = new Map();
  const authService = createAuthService({
    users: {
      findForLogin: async (email) => [...users.values()].find((u) => u.email === email) ?? null,
      findById: async (uid) => users.get(String(uid)) ?? null,
      updatePasswordHash: async () => {},
    },
    sessions: {
      create: async (s) => { sessions.set(s._id, { ...s }); },
      findById: async (sid) => sessions.get(sid) ?? null,
      touch: async () => {},
      remove: async (sid) => { const s = sessions.get(sid) ?? null; sessions.delete(sid); return s; },
    },
    audit: { recordSecurityEvent: async () => {} },
    passwords: { hash: async (p) => `fake$${p}`, verify: async (p, h) => ({ ok: h === `fake$${p}`, needsRehash: false }) },
  });
  const { recordRefusal } = createAccessAuditService({
    audit: { recordSecurityEvent: async (e) => { audit.push(e); } }, log: { error() {} },
  });
  const assignmentService = createAssignmentService({
    requests: {
      findById: async () => ({ ...store.doc }),
      applyAssignment: async (rid, expected, owner, $set) => {
        if (store.doc.version !== expected || (store.doc.assigneeId ?? null) !== (owner ?? null)) {
          throw new PreconditionFailedError(rid, expected);
        }
        Object.assign(store.doc, $set, { version: expected + 1 });
        return { version: store.doc.version };
      },
    },
    users: { findById: async (uid) => users.get(String(uid)) ?? null },
    history: {
      findByIdempotencyKey: async (actorId, key) => historyRows.find((h) => h.actorId === actorId && h.idempotencyKey === key) ?? null,
      append: async (entry) => { historyRows.push({ ...entry, _id: `h${historyRows.length + 1}` }); return { _id: `h${historyRows.length}` }; },
    },
    unitOfWork: { run: async (work) => work('s') },
    recordRefusal,
  });
  const app = createApp({
    authService, healthService: createHealthService({ pingDatabase: async () => {} }),
    assignmentService, recordRefusal, log: { error() {} },
  });
  return { app, store, historyRows, audit };
}

async function serve(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

async function login(base, who) {
  const res = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: USERS[who].email, password: 'right' }),
  });
  return res.headers.getSetCookie()[0].split(';')[0];
}

let keyCounter = 0;
function post(base, cookie, { target = REQ, assigneeId, ifMatch = '"v1"', key = `key-${keyCounter++}`, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (ifMatch !== null) headers['if-match'] = ifMatch;
  if (key !== null) headers['idempotency-key'] = key;
  return fetch(`${base}/api/v1/requests/${target}/assignments`, {
    method: 'POST', headers, body: JSON.stringify(body ?? { assigneeId }),
  });
}

test('NFR-3.3, DEC-015 §1: the assignments route is registered, guarded, and admits assign or accept', () => {
  const route = routeTable(harness().app).find((r) => r.path === '/api/v1/requests/:id/assignments');
  assert.ok(route, 'POST /requests/:id/assignments is registered');
  assert.equal(route.method, 'POST');
  const guard = route.handlers.find((h) => h.guardName === GUARD_NAME);
  assert.ok(guard);
  assert.equal(guard.operation, 'request:assign|request:accept');
});

test('AC-FR-5.1: a Coordinator assigns over HTTP; 201, new ETag, owner recorded, status Assigned', async () => {
  const { app, store, historyRows } = harness();
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'coord'), { assigneeId: String(USERS.tech1._id) });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('etag'), '"v2"');
    const body = await res.json();
    assert.equal(body.action, 'assign');
    assert.equal(body.status, STATUS.ASSIGNED);
    assert.equal(store.doc.assigneeId, String(USERS.tech1._id));
    assert.equal(historyRows.length, 1);
  });
});

test('AC-FR-5.2: a Technician accepts an unassigned request over HTTP and becomes the owner', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'tech1'), { assigneeId: String(USERS.tech1._id) });
    assert.equal(res.status, 201);
    assert.equal((await res.json()).action, 'accept');
    assert.equal(store.doc.assigneeId, String(USERS.tech1._id));
  });
});

test('AC-FR-5.3: Technician 2 accepting Technician 1\'s request is refused (422 ASSIGNMENT_REFUSED), the owner is unchanged, and the attempt is in the audit log', async () => {
  const { app, store, historyRows, audit } = harness({ status: STATUS.ASSIGNED, assigneeId: String(USERS.tech1._id), version: 2 });
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'tech2'), { assigneeId: String(USERS.tech2._id), ifMatch: '"v2"' });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).code, 'ASSIGNMENT_REFUSED');
    assert.equal(store.doc.assigneeId, String(USERS.tech1._id));
    assert.equal(store.doc.version, 2);
    assert.equal(historyRows.length, 0);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].eventType, 'access.refused.request:accept');
    assert.equal(audit[0].actorId, String(USERS.tech2._id));
    assert.equal(audit[0].documentId, REQ);
  });
});

test('AC-FR-1.3: a Technician assigning another user is 403, changes nothing, and the attempt is in the audit log', async () => {
  const { app, store, audit } = harness();
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'tech1'), { assigneeId: String(USERS.tech2._id) });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'FORBIDDEN');
    assert.equal(store.doc.assigneeId, null);
    assert.equal(store.doc.version, 1);
    assert.deepEqual(audit.map((e) => [e.eventType, e.actorId, e.actorRole]),
      [['access.refused.request:assign', String(USERS.tech1._id), ROLE.TECHNICIAN]]);
  });
});

test('AC-FR-1.3, TD-005: a role the guard refuses (Requester) is 403 and recorded from the guard path', async () => {
  const { app, store, audit } = harness();
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'req'), { assigneeId: String(USERS.tech1._id) });
    assert.equal(res.status, 403);
    assert.equal(store.doc.assigneeId, null);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].eventType, 'access.refused.request:assign|request:accept');
    assert.equal(audit[0].actorRole, ROLE.REQUESTER);
    assert.equal(audit[0].documentId, REQ);
  });
});

test('AC-FR-1.3: an Administrator, who holds neither operation, is refused and recorded', async () => {
  const { app, audit } = harness();
  await serve(app, async (base) => {
    assert.equal((await post(base, await login(base, 'admin'), { assigneeId: String(USERS.tech1._id) })).status, 403);
    assert.equal(audit.length, 1);
  });
});

test('FR-1.1: no session is 401 and is not recorded (no actor to attribute)', async () => {
  const { app, audit } = harness();
  await serve(app, async (base) => {
    assert.equal((await post(base, null, { assigneeId: String(USERS.tech1._id) })).status, 401);
    assert.equal(audit.length, 0);
  });
});

test('FR-5.5: a Coordinator reassigns over HTTP; the history entry keeps the previous owner', async () => {
  const { app, store, historyRows } = harness({ status: STATUS.IN_PROGRESS, assigneeId: String(USERS.tech1._id), version: 4 });
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'coord'), { assigneeId: String(USERS.tech2._id), ifMatch: '"v4"' });
    assert.equal(res.status, 201);
    assert.equal(store.doc.assigneeId, String(USERS.tech2._id));
    assert.equal(store.doc.status, STATUS.IN_PROGRESS);
    assert.equal(historyRows[0].fromAssigneeId, String(USERS.tech1._id));
  });
});

test('DEC-015 §3: a missing Idempotency-Key is 400; a missing If-Match is 428; a stale If-Match is 412', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'coord');
    const to = String(USERS.tech1._id);
    assert.equal((await post(base, cookie, { assigneeId: to, key: null })).status, 400);
    assert.equal((await post(base, cookie, { assigneeId: to, ifMatch: null })).status, 428);
    assert.equal((await post(base, cookie, { assigneeId: to, ifMatch: '"v9"' })).status, 412);
    assert.equal(store.doc.assigneeId, null);
  });
});

test('DEC-015 §3: replaying the same key and body returns the original 201 and body, with Idempotent-Replayed, and writes one history entry only', async () => {
  const { app, historyRows } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'coord');
    const args = { assigneeId: String(USERS.tech1._id), key: 'same-key' };
    const first = await post(base, cookie, args);
    assert.equal(first.status, 201);
    assert.equal(first.headers.get('idempotent-replayed'), null);
    const again = await post(base, cookie, args);
    assert.equal(again.status, 201);
    assert.equal(again.headers.get('idempotent-replayed'), 'true');
    assert.deepEqual(await again.json(), await first.json());
    assert.equal(historyRows.length, 1);
  });
});

test('DEC-015 §5: a malformed request id, a missing or malformed assigneeId and an unknown field are 400, never 500', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'coord');
    const ok = String(USERS.tech1._id);
    assert.equal((await post(base, cookie, { target: 'not-an-id', assigneeId: ok })).status, 400);
    assert.equal((await post(base, cookie, { body: {} })).status, 400);
    assert.equal((await post(base, cookie, { assigneeId: 'nope' })).status, 400);
    assert.equal((await post(base, cookie, { body: { assigneeId: ok, status: 'Closed' } })).status, 400);
  });
});
