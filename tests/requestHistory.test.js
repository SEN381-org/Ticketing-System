/**
 * History, work record and notifications — GET /requests/:id/history, POST
 * /requests/:id/comments | actions | details, GET /me/notifications.
 *
 * Traces to: AC-FR-2.4, AC-FR-3.3, AC-FR-3.4, AC-FR-6.6, AC-FR-6.7, AC-FR-7.1 to 7.5,
 *            AC-NFR-3.6, AC-NFR-4.4, FR-1.5, FR-3.5, DB-01, DEC-011, DEC-012, DEC-015.
 *
 * HTTP tests use the real createApp, session middleware, auth service, and the real
 * transition, history, work-record and notification services over real HTTP. Only
 * persistence is faked, with the rules the real repositories enforce (a version-
 * conditional applyChange; history ordered by requestVersion).
 *
 * What this does NOT show: behaviour against a real cluster (transactions, the unique
 * index, Atlas role), FR-4.2 full detail display (waiting on a decision), or that
 * the visibility choices for comment and action entries are baselined (recorded as
 * a question; DB-01 and DEC-012 are silent).
 */

import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createApp, routeTable } from '../src/app.js';
import { composeApplication } from '../src/composition.js';
import { createAuthService } from '../src/services/authService.js';
import { createHealthService } from '../src/services/healthService.js';
import { createRequestQueryService } from '../src/services/requestQueryService.js';
import { createStatusTransitionService } from '../src/services/statusTransitionService.js';
import { createRequestHistoryService } from '../src/services/requestHistoryService.js';
import { createWorkRecordService, MAX_ATTEMPTS } from '../src/services/workRecordService.js';
import { createNotificationService } from '../src/services/notificationService.js';
import { registerSubscribers } from '../src/events/subscribers/index.js';
import { resetSubscriptions } from '../src/events/requestEvents.js';
import { historyRepository } from '../src/repositories/historyRepository.js';
import { PreconditionFailedError } from '../src/errors.js';
import { ROLE, STATUS } from '../src/models/_shared.js';

const CAT = 'cat1';
const RID = 'aaaaaaaaaaaaaaaaaaaaaaaa';          // a well-formed ObjectId
const CAMPUS = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const REF = 'CC-2026-000001';

const baseRequest = () => ({
  _id: RID, campusId: CAMPUS, reference: REF, status: STATUS.IN_PROGRESS, version: 1,
  categoryId: CAT, securityCategory: false, requesterId: 'u2',
  description: 'DESCRIPTION-TEXT', location: 'LOCATION-TEXT',
});

const user = (id, email, roles, categoryAuthorisations = [CAT]) => ({
  _id: id, campusId: 'c1', email, displayName: id, passwordHash: 'fake$right', roles,
  categoryAuthorisations, groupIds: [], status: 'active', sessionEpoch: 0,
});
const USERS = [
  user('u1', 'coord@example.test', [ROLE.COORDINATOR]),
  user('u2', 'req@example.test', [ROLE.REQUESTER], []),
  user('u3', 'req2@example.test', [ROLE.REQUESTER], []),
  user('u4', 'tech@example.test', [ROLE.TECHNICIAN], ['other-cat']),
  user('u5', 'mgr@example.test', [ROLE.MANAGER]),
  user('u6', 'admin@example.test', [ROLE.ADMINISTRATOR]),
  user('u8', 'so@example.test', [ROLE.SECURITY_OFFICER]),
];

/** Fake persistence with the rules the real repositories enforce. */
function harness(initial = baseRequest(), { seedHistory = [], applyChangeFails = 0, appendFails = false } = {}) {
  const store = {
    doc: structuredClone(initial), entries: seedHistory.map((e) => structuredClone(e)),
    notifications: [], inRun: false, appendInsideRun: null, applyChangeCalls: 0,
  };
  let clockTick = 0;
  let nextId = 1;
  const clock = () => new Date(Date.UTC(2026, 9, 17, 8, 0, clockTick++));

  const requests = {
    findById: async () => store.doc,
    applyChange: async (id, expected, changes) => {
      store.applyChangeCalls += 1;
      if (applyChangeFails > 0) { applyChangeFails -= 1; throw new PreconditionFailedError(id, expected); }
      if (store.doc.version !== expected) throw new PreconditionFailedError(id, expected);
      if (changes.status) store.doc.status = changes.status;
      if (changes['resolution.summary']) {
        store.doc.resolution = { summary: changes['resolution.summary'], recordedAt: changes['resolution.recordedAt'] };
      }
      store.doc.version = expected + 1;
      return { version: store.doc.version };
    },
  };
  const history = {
    append: async (entry) => {
      store.appendInsideRun = store.inRun;
      if (appendFails) throw new Error('append failed');
      if (store.entries.some((e) => String(e.requestId) === String(entry.requestId) && e.requestVersion === entry.requestVersion)) {
        throw new Error('duplicate {requestId, requestVersion}');          // the unique index
      }
      const stored = { _id: `h${nextId++}`, ...entry };
      store.entries.push(stored);
      return stored;
    },
    listForRequest: async () => [...store.entries].sort((a, b) => a.requestVersion - b.requestVersion),
    findByIdempotencyKey: async (actorId, key) =>
      store.entries.find((e) => String(e.actorId) === String(actorId) && e.idempotencyKey === key) ?? null,
  };
  const unitOfWork = { run: async (work) => { store.inRun = true; try { return await work({}); } finally { store.inRun = false; } } };
  const notifications = {
    create: async (n) => {
      if (store.notifications.some((x) => x.sourceHistoryId === n.sourceHistoryId && x.userId === n.userId)) return;
      store.notifications.push({ _id: `n${store.notifications.length + 1}`, ...n });
    },
    listForUser: async (userId) =>
      store.notifications.filter((n) => String(n.userId) === String(userId)).reverse(),
  };

  resetSubscriptions();
  registerSubscribers({ notifications });        // NotificationSubscriber only, as composed

  const sessions = new Map();
  const users = new Map(USERS.map((u) => [u._id, u]));
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
  const app = createApp({
    authService,
    healthService: createHealthService({ pingDatabase: async () => {} }),
    requestQueryService: createRequestQueryService({ requests }),
    statusTransitionService: createStatusTransitionService({ requests, history, unitOfWork, clock }),
    requestHistoryService: createRequestHistoryService({ requests, history }),
    workRecordService: createWorkRecordService({ requests, history, unitOfWork, clock }),
    notificationService: createNotificationService({ notifications }),
    log: { error() {} },
  });
  return { app, store };
}

beforeEach(() => resetSubscriptions());

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

const history = (base, cookie, id = RID) =>
  fetch(`${base}/api/v1/requests/${id}/history`, { headers: cookie ? { cookie } : {} });

let keyCounter = 0;
const post = (base, cookie, kind, body, { id = RID, key = `key-${++keyCounter}`, headers = {} } = {}) =>
  fetch(`${base}/api/v1/requests/${id}/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}),
               ...(key ? { 'idempotency-key': key } : {}), ...headers },
    body: JSON.stringify(body),
  });

const transition = (base, cookie, toStatus, extra = {}, version) =>
  fetch(`${base}/api/v1/requests/${RID}/transitions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, 'if-match': `"v${version}"`,
               'idempotency-key': `t-${++keyCounter}` },
    body: JSON.stringify({ toStatus, ...extra }),
  });

// ---------- AC-FR-7.1, 7.2, 7.3, 7.4 ----------

// Basis: AC-FR-7.4 "three comments and two actions recorded at different times ... all five
// entries are listed in ascending order of the time recorded." Input: five appends through
// the real route with a clock that advances one second per write, interleaved on purpose
// (c, a, c, a, c). Expected, derived from the AC: five entries, types in that order,
// occurredAt strictly increasing, requestVersion 2..6 ascending.
// Shows: the five entries come back through the interface in recorded order.
// Does NOT show: ordering against a real cluster's index.
test('AC-FR-7.4: three comments and two actions are listed, all five, in ascending order of time recorded', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    for (const [kind, body] of [['comments', 'c1'], ['actions', 'a1'], ['comments', 'c2'], ['actions', 'a2'], ['comments', 'c3']]) {
      assert.equal((await post(base, staff, kind, { body })).status, 201);
    }
    const res = await history(base, staff);
    assert.equal(res.status, 200);
    const { entries } = await res.json();
    assert.equal(entries.length, 5);
    assert.deepEqual(entries.map((e) => [e.changeType, e.body]),
      [['comment', 'c1'], ['action', 'a1'], ['comment', 'c2'], ['action', 'a2'], ['comment', 'c3']]);
    const times = entries.map((e) => Date.parse(e.occurredAt));
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
    assert.equal(new Set(times).size, 5);
    assert.deepEqual(entries.map((e) => e.requestVersion), [2, 3, 4, 5, 6]);
  });
});

test('AC-FR-7.4: the service lists entries in ascending order even when the repository returns them out of order', async () => {
  const doc = baseRequest();
  const rows = [3, 1, 2].map((v) => ({ _id: `h${v}`, requestVersion: v, changeType: 'comment',
    actorId: 'u1', actorRole: ROLE.COORDINATOR, occurredAt: new Date(Date.UTC(2026, 9, 17, 8, 0, v)), body: `b${v}` }));
  const service = createRequestHistoryService({
    requests: { findById: async () => doc }, history: { listForRequest: async () => rows },
  });
  const { entries } = await service.listHistory(RID, { id: 'u1', roles: [ROLE.COORDINATOR], categoryAuthorisations: [CAT] });
  assert.deepEqual(entries.map((e) => e.requestVersion), [1, 2, 3]);
});

test('AC-FR-7.1: a comment by an authorised staff user is stored against the request and visible to another authorised user', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'coord@example.test'), 'comments', { body: 'Contractor booked' });
    assert.equal(res.status, 201);
    assert.equal(store.entries.length, 1);
    assert.equal(store.entries[0].changeType, 'comment');
    assert.equal(String(store.entries[0].requestId), RID);
    const seen = await (await history(base, await login(base, 'mgr@example.test'))).json();
    assert.deepEqual(seen.entries.map((e) => e.body), ['Contractor booked']);
  });
});

test('AC-FR-7.2: an action recorded by an authorised staff user is stored against the request', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'coord@example.test'), 'actions', { body: 'Replaced the fuse' });
    assert.equal(res.status, 201);
    assert.equal(store.entries.length, 1);
    assert.equal(store.entries[0].changeType, 'action');
    assert.equal(store.entries[0].body, 'Replaced the fuse');
  });
});

test('AC-FR-7.3: a retrieved comment and action carry the authoring user, the date and the time', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    await post(base, staff, 'comments', { body: 'one' });
    await post(base, staff, 'actions', { body: 'two' });
    const { entries } = await (await history(base, staff)).json();
    assert.equal(entries.length, 2);
    for (const e of entries) {
      assert.equal(e.actorId, 'u1');
      assert.equal(e.actorRole, ROLE.COORDINATOR);
      assert.ok(!Number.isNaN(Date.parse(e.occurredAt)), 'occurredAt is a date-time');
    }
  });
});

// ---------- DB-01 requestVersion, atomicity, conflict ----------

// Basis: DB-01 §3.3 "requestVersion: the request version this entry PRODUCED", unique per
// request, and the §6 invariant version == max(requestVersion). Expected: after two appends
// from version 1 the entries carry 2 and 3, the request is at 3, and no two entries share a version.
test('DB-01: each append produces the next request version; version equals the highest requestVersion', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    const first = await post(base, staff, 'comments', { body: 'a' });
    const second = await post(base, staff, 'actions', { body: 'b' });
    assert.equal(first.headers.get('etag'), '"v2"');
    assert.equal(second.headers.get('etag'), '"v3"');
    assert.deepEqual(store.entries.map((e) => e.requestVersion), [2, 3]);
    assert.equal(store.doc.version, Math.max(...store.entries.map((e) => e.requestVersion)));
  });
});

test('DEC-016, AC-FR-6.7: the version change and the history append happen inside one unit of work', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    await post(base, await login(base, 'coord@example.test'), 'comments', { body: 'a' });
    assert.equal(store.appendInsideRun, true, 'history.append ran outside unitOfWork.run');
  });
});

test('DEC-015 §4, DEC-016: a write that conflicts once is retried and succeeds', async () => {
  const { app, store } = harness(baseRequest(), { applyChangeFails: 1 });
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'coord@example.test'), 'comments', { body: 'a' });
    assert.equal(res.status, 201);
    assert.equal(store.entries.length, 1);
    assert.equal(store.applyChangeCalls, 2);
  });
});

test('DEC-015 §4: write-conflict retries exhausted is 409 and writes no entry', async () => {
  const { app, store } = harness(baseRequest(), { applyChangeFails: 99 });
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'coord@example.test'), 'comments', { body: 'a' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'WRITE_CONFLICT');
    assert.equal(store.entries.length, 0);
    assert.equal(store.applyChangeCalls, MAX_ATTEMPTS);
  });
});

// ---------- idempotency and validation (DEC-015 §1, §3, §5) ----------

test('DEC-015 §3: Idempotency-Key is required on comments, actions and details (400)', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    const requester = await login(base, 'req@example.test');
    for (const [cookie, kind] of [[staff, 'comments'], [staff, 'actions'], [requester, 'details']]) {
      const res = await post(base, cookie, kind, { body: 'x' }, { key: null });
      assert.equal(res.status, 400, kind);
      assert.equal((await res.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');
    }
    assert.equal(store.entries.length, 0);
  });
});

test('DEC-015 §1: If-Match is not required on an append (201 with no If-Match)', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'coord@example.test'), 'comments', { body: 'x' });
    assert.equal(res.status, 201);
  });
});

test('DEC-015 §3: the same key and body replays the original and writes no second entry; a different body is 422', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    const first = await post(base, staff, 'comments', { body: 'x' }, { key: 'k-1' });
    const replay = await post(base, staff, 'comments', { body: 'x' }, { key: 'k-1' });
    assert.equal(first.status, 201);
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get('idempotent-replayed'), 'true');
    assert.equal((await replay.json()).historyId, (await first.json()).historyId);
    assert.equal(store.entries.length, 1);
    const different = await post(base, staff, 'comments', { body: 'y' }, { key: 'k-1' });
    assert.equal(different.status, 422);
    assert.equal(store.entries.length, 1);
  });
});

test('DEC-015 §5: a blank body, an unknown field, an oversize body and an oversize key are 400 and write nothing', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    for (const body of [{ body: '   ' }, {}, { body: 'x', extra: 1 }, { body: 'x'.repeat(5001) }, { body: 7 }]) {
      assert.equal((await post(base, staff, 'comments', body)).status, 400, JSON.stringify(body).slice(0, 40));
    }
    assert.equal((await post(base, staff, 'comments', { body: 'x' }, { key: 'k'.repeat(65) })).status, 400);
    assert.equal(store.entries.length, 0);
  });
});

test('DEC-015 §4: a malformed request id is 400, not 500, on history and on every append route', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    const requester = await login(base, 'req@example.test');
    assert.equal((await history(base, staff, 'not-an-id')).status, 400);
    assert.equal((await post(base, staff, 'comments', { body: 'x' }, { id: 'not-an-id' })).status, 400);
    assert.equal((await post(base, staff, 'actions', { body: 'x' }, { id: 'not-an-id' })).status, 400);
    assert.equal((await post(base, requester, 'details', { body: 'x' }, { id: 'not-an-id' })).status, 400);
  });
});

// ---------- authorisation: 401 / 403 / 404 ----------

test('DEC-012, AC-FR-1.1: no session is 401 on history, comments, actions, details and notifications, with no data', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    assert.equal((await history(base, null)).status, 401);
    for (const kind of ['comments', 'actions', 'details']) {
      const res = await post(base, null, kind, { body: 'x' });
      assert.equal(res.status, 401, kind);
      assert.doesNotMatch(await res.text(), /CC-2026/);
    }
    assert.equal((await fetch(`${base}/api/v1/me/notifications`)).status, 401);
  });
});

test('FR-7.1, FR-7.2, FR-1.3: a Requester cannot comment or record an action (403); staff cannot add a detail (403)', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const requester = await login(base, 'req@example.test');
    assert.equal((await post(base, requester, 'comments', { body: 'x' })).status, 403);
    assert.equal((await post(base, requester, 'actions', { body: 'x' })).status, 403);
    assert.equal((await post(base, await login(base, 'coord@example.test'), 'details', { body: 'x' })).status, 403);
    assert.equal(store.entries.length, 0);
  });
});

test('FR-4.1, DEC-012: staff not authorised for the category get 403 on history and cannot comment', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const tech = await login(base, 'tech@example.test');
    const res = await history(base, tech);
    assert.equal(res.status, 403);
    assert.doesNotMatch(await res.text(), /CC-2026-000001/);
    assert.equal((await post(base, tech, 'comments', { body: 'x' })).status, 403);
    assert.equal(store.entries.length, 0);
  });
});

test('FR-1.3: an Administrator-only actor is refused the history (403), as the single-request read refuses', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    assert.equal((await history(base, await login(base, 'admin@example.test'))).status, 403);
  });
});

test('DEC-015 §4: a missing request is 404 on history and on every append route', async () => {
  const { app } = harness(null);
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    const requester = await login(base, 'req@example.test');
    assert.equal((await history(base, staff)).status, 404);
    assert.equal((await post(base, staff, 'comments', { body: 'x' })).status, 404);
    assert.equal((await post(base, requester, 'details', { body: 'x' })).status, 404);
  });
});

// Basis: AC-FR-3.6 / DEC-015 §4 (no existence oracle). Expected: a Requester asking for
// another's history, or adding detail to another's request, gets a response identical to the
// one for an identifier that does not exist.
test('FR-3.6: another requester gets the same 404 as a missing request, on history and details', async () => {
  const { app } = harness();
  const { app: missing } = harness(null);
  const shape = async (res) => [res.status, await res.text()];
  let foreignHistory; let foreignDetail; let absentHistory; let absentDetail;
  await serve(app, async (base) => {
    const other = await login(base, 'req2@example.test');
    foreignHistory = await shape(await history(base, other));
    foreignDetail = await shape(await post(base, other, 'details', { body: 'x' }));
  });
  await serve(missing, async (base) => {
    const other = await login(base, 'req2@example.test');
    absentHistory = await shape(await history(base, other));
    absentDetail = await shape(await post(base, other, 'details', { body: 'x' }));
  });
  assert.equal(foreignHistory[0], 404);
  assert.deepEqual(foreignHistory, absentHistory);
  assert.deepEqual(foreignDetail, absentDetail);
});

// ---------- AC-FR-2.4 ----------

test('AC-FR-2.4: a detail added by the requester is stored with the date, time and acting user', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const res = await post(base, await login(base, 'req@example.test'), 'details', { body: 'The gate is also broken' });
    assert.equal(res.status, 201);
    const entry = store.entries[0];
    assert.equal(entry.changeType, 'detail');
    assert.equal(entry.body, 'The gate is also broken');
    assert.equal(entry.actorId, 'u2');
    assert.equal(entry.actorRole, ROLE.REQUESTER);
    assert.ok(entry.occurredAt instanceof Date);
    const { entries } = await (await history(base, await login(base, 'req@example.test'))).json();
    assert.deepEqual(entries.map((e) => [e.changeType, e.body, e.actorId]), [['detail', 'The gate is also broken', 'u2']]);
  });
});

// ---------- AC-FR-3.3, AC-FR-6.6, AC-FR-7.5 through the real transition service ----------

test('AC-FR-3.3: a request moved through two statuses lists each status change, with its date, to the requester', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    assert.equal((await transition(base, staff, STATUS.ON_HOLD, {}, 1)).status, 201);
    assert.equal((await transition(base, staff, STATUS.IN_PROGRESS, {}, 2)).status, 201);
    const { entries } = await (await history(base, await login(base, 'req@example.test'))).json();
    assert.deepEqual(entries.map((e) => [e.changeType, e.fromStatus, e.toStatus]),
      [['status', STATUS.IN_PROGRESS, STATUS.ON_HOLD], ['status', STATUS.ON_HOLD, STATUS.IN_PROGRESS]]);
    for (const e of entries) assert.ok(!Number.isNaN(Date.parse(e.occurredAt)));
  });
});

test('AC-FR-6.6: closing without a reason is refused; resubmitted with one, the reason is stored and shown in the history', async () => {
  const { app, store } = harness({ ...baseRequest(), status: STATUS.RESOLVED, version: 4 });
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    const first = await transition(base, staff, STATUS.CLOSED, {}, 4);
    assert.equal(first.status, 422);
    assert.equal(store.entries.length, 0);
    const second = await transition(base, staff, STATUS.CLOSED, { reason: 'Confirmed fixed with the requester' }, 4);
    assert.equal(second.status, 201);
    const { entries } = await (await history(base, staff)).json();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].toStatus, STATUS.CLOSED);
    assert.equal(entries[0].reason, 'Confirmed fixed with the requester');
  });
});

test('AC-FR-7.5: resolution information recorded at Resolved is stored and visible in the history to staff', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    assert.equal((await transition(base, staff, STATUS.RESOLVED, { resolution: 'Replaced the breaker' }, 1)).status, 201);
    const { entries } = await (await history(base, staff)).json();
    assert.equal(entries[0].toStatus, STATUS.RESOLVED);
    assert.equal(entries[0].resolution, 'Replaced the breaker');
  });
});

// ---------- AC-NFR-3.6, AC-FR-5.4 data ----------

const SEED_ASSIGNED_BY = { actorId: 'u1', actorRole: ROLE.COORDINATOR };
const seedRows = () => [
  { _id: 'h1', requestId: RID, requestVersion: 1, changeType: 'created', fromStatus: null, toStatus: STATUS.RECEIVED,
    body: null, ...SEED_ASSIGNED_BY, actorId: 'u2', actorRole: ROLE.REQUESTER, occurredAt: new Date(Date.UTC(2026, 9, 1, 8, 0, 0)) },
  { _id: 'h2', requestId: RID, requestVersion: 2, changeType: 'assignment', fromAssigneeId: null, toAssigneeId: 'u4',
    ...SEED_ASSIGNED_BY, occurredAt: new Date(Date.UTC(2026, 9, 1, 9, 0, 0)) },
  { _id: 'h3', requestId: RID, requestVersion: 3, changeType: 'status', fromStatus: STATUS.ASSIGNED, toStatus: STATUS.IN_PROGRESS,
    actorId: 'u4', actorRole: ROLE.TECHNICIAN, occurredAt: new Date(Date.UTC(2026, 9, 1, 10, 0, 0)) },
  { _id: 'h4', requestId: RID, requestVersion: 4, changeType: 'comment', body: 'STAFF-COMMENT',
    ...SEED_ASSIGNED_BY, occurredAt: new Date(Date.UTC(2026, 9, 1, 11, 0, 0)) },
  { _id: 'h5', requestId: RID, requestVersion: 5, changeType: 'action', body: 'STAFF-ACTION',
    ...SEED_ASSIGNED_BY, occurredAt: new Date(Date.UTC(2026, 9, 1, 12, 0, 0)) },
  { _id: 'h6', requestId: RID, requestVersion: 6, changeType: 'detail', body: 'REQUESTER-DETAIL',
    actorId: 'u2', actorRole: ROLE.REQUESTER, occurredAt: new Date(Date.UTC(2026, 9, 1, 13, 0, 0)) },
];
const seeded = (overrides = {}) => ({ seedHistory: seedRows(), ...overrides });

test('AC-NFR-3.6: the audit record returns acting user, action and timestamp for a status transition and an assignment', async () => {
  const { app } = harness({ ...baseRequest(), version: 6 }, seeded());
  await serve(app, async (base) => {
    const { entries } = await (await history(base, await login(base, 'coord@example.test'))).json();
    const status = entries.find((e) => e.changeType === 'status');
    const assignment = entries.find((e) => e.changeType === 'assignment');
    assert.deepEqual([status.actorId, status.actorRole, status.occurredAt],
      ['u4', ROLE.TECHNICIAN, '2026-10-01T10:00:00.000Z']);
    assert.deepEqual([assignment.actorId, assignment.actorRole, assignment.occurredAt],
      ['u1', ROLE.COORDINATOR, '2026-10-01T09:00:00.000Z']);
    assert.deepEqual([assignment.fromAssigneeId, assignment.toAssigneeId], [null, 'u4']);
  });
});

// ---------- visibility: requester ----------

// Basis: DB-01 / DEC-012 are silent on who sees comment and action entries. Safer reading,
// recorded as an open question: a requester sees created, status and detail entries of their
// own request, not comment, action or assignment entries.
test('visibility (open question): a requester sees created, status and detail entries, not comments, actions or assignments', async () => {
  const { app } = harness({ ...baseRequest(), version: 6 }, seeded());
  await serve(app, async (base) => {
    const res = await history(base, await login(base, 'req@example.test'));
    const text = await res.text();
    const { entries } = JSON.parse(text);
    assert.deepEqual(entries.map((e) => e.changeType), ['created', 'status', 'detail']);
    assert.doesNotMatch(text, /STAFF-COMMENT|STAFF-ACTION/);
    assert.equal(entries.find((e) => e.changeType === 'status').actorId, null, 'staff identifier withheld');
    assert.equal(entries.find((e) => e.changeType === 'detail').actorId, 'u2');
  });
});

// Basis: AC-NFR-4.4 "a user without the Security Officer role ... no description, comment or
// action content is returned"; FR-1.5 read literally for a requester on their own security
// request; FR-3.5 status mapping. Input: a security request with a seeded comment, action,
// detail and a status entry carrying a reason; the requester owns it. Expected: none of those
// bodies appears anywhere in the response; the internal statuses On Hold/Assigned never appear.
test('AC-NFR-4.4, FR-1.5, FR-3.5: a requester on their own security request receives no comment, action, detail or reason body and only mapped statuses', async () => {
  const rows = seedRows();
  rows[2] = { ...rows[2], fromStatus: STATUS.ASSIGNED, toStatus: STATUS.ON_HOLD, body: 'REASON-TEXT' };
  rows.push({ _id: 'h7', requestId: RID, requestVersion: 7, changeType: 'status', fromStatus: STATUS.ON_HOLD,
    toStatus: STATUS.IN_PROGRESS, body: 'REASON-TWO', actorId: 'u8', actorRole: ROLE.SECURITY_OFFICER,
    occurredAt: new Date(Date.UTC(2026, 9, 1, 14, 0, 0)) });
  const { app } = harness({ ...baseRequest(), securityCategory: true, version: 7 }, { seedHistory: rows });
  await serve(app, async (base) => {
    const res = await history(base, await login(base, 'req@example.test'));
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.doesNotMatch(text, /STAFF-COMMENT|STAFF-ACTION|REQUESTER-DETAIL|REASON-TEXT|REASON-TWO|DESCRIPTION-TEXT/);
    assert.doesNotMatch(text, /On Hold|Assigned/);
    const { entries } = JSON.parse(text);
    for (const e of entries) assert.ok(!('body' in e) && !('reason' in e), `${e.changeType} carries a body`);
    const statuses = entries.filter((e) => e.changeType === 'status');
    for (const s of statuses) assert.notEqual(s.fromStatus, s.toStatus, 'invisible internal steps are dropped');
    assert.deepEqual(statuses.map((s) => s.toStatus), [STATUS.IN_PROGRESS]);
  });
});

// Basis: AC-NFR-4.4 and OI-17 unchanged (today's read refuses staff without Security Officer).
// Input: Manager and Coordinator, both authorised for the category, on a security request.
// Expected: 403 and no seeded content in the body; the Security Officer receives the entries.
test('AC-NFR-4.4, FR-1.5: staff without the Security Officer role are refused a security request history (403) and receive no content', async () => {
  const { app } = harness({ ...baseRequest(), securityCategory: true, version: 6 }, seeded());
  await serve(app, async (base) => {
    for (const email of ['mgr@example.test', 'coord@example.test']) {
      const res = await history(base, await login(base, email));
      assert.equal(res.status, 403, email);
      assert.doesNotMatch(await res.text(), /STAFF-COMMENT|STAFF-ACTION|REQUESTER-DETAIL|CC-2026/);
    }
    const officer = await (await history(base, await login(base, 'so@example.test'))).json();
    assert.equal(officer.entries.length, 6);
    assert.ok(officer.entries.some((e) => e.body === 'STAFF-COMMENT'));
  });
});

test('AC-NFR-4.4, DEC-012: staff without the Security Officer role cannot comment on, or add an action to, a security request', async () => {
  const { app, store } = harness({ ...baseRequest(), securityCategory: true });
  await serve(app, async (base) => {
    const mgr = await login(base, 'mgr@example.test');
    assert.equal((await post(base, mgr, 'comments', { body: 'x' })).status, 403);
    assert.equal((await post(base, mgr, 'actions', { body: 'x' })).status, 403);
    assert.equal(store.entries.length, 0);
    assert.equal((await post(base, await login(base, 'so@example.test'), 'comments', { body: 'x' })).status, 201);
  });
});

// ---------- AC-FR-6.7: no alter or delete operation ----------

const WORK_PATH = /\/(history|comments|actions|details)$/;

// Basis: AC-FR-6.7 "no such operation is available". Expected, from the AC and DEC-015 §1:
// history is GET only; comments, actions and details are POST only; no PUT, PATCH or DELETE
// on any path under /requests/:id other than the entries already specified.
// Shows: the composed route table offers no mutation of an entry, and the vacuity guard
// proves the four routes were actually found. Does NOT show: the Atlas role (layer 3).
test('AC-FR-6.7: the composed route table has no PUT, PATCH or DELETE on history, comments, actions or details', () => {
  const routes = routeTable(composeApplication({ log: { error() {} } }).app);
  const work = routes.filter((r) => WORK_PATH.test(r.path));
  const methodsOf = (suffix) => work.filter((r) => r.path.endsWith(suffix)).map((r) => r.method).sort();
  assert.deepEqual(methodsOf('/history'), ['GET']);
  assert.deepEqual(methodsOf('/comments'), ['POST']);
  assert.deepEqual(methodsOf('/actions'), ['POST']);
  assert.deepEqual(methodsOf('/details'), ['POST']);
  const mutating = routes.filter((r) => ['PUT', 'PATCH', 'DELETE'].includes(r.method) && /\/requests/.test(r.path));
  assert.deepEqual(mutating.map((r) => `${r.method} ${r.path}`), []);
});

test('AC-FR-6.7: PUT, PATCH and DELETE on a history entry or the history itself are not available (404 over HTTP), the entry unchanged', async () => {
  const { app, store } = harness({ ...baseRequest(), version: 6 }, seeded());
  const before = JSON.stringify(store.entries);
  await serve(app, async (base) => {
    const admin = await login(base, 'admin@example.test');
    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      for (const path of [`${RID}/history`, `${RID}/history/h4`, `${RID}/comments/h4`, `${RID}/comments`, `${RID}/actions/h5`, `${RID}/details/h6`]) {
        const res = await fetch(`${base}/api/v1/requests/${path}`, {
          method, headers: { cookie: admin, 'content-type': 'application/json' }, body: method === 'DELETE' ? undefined : '{}',
        });
        assert.equal(res.status, 404, `${method} ${path}`);
      }
    }
  });
  assert.equal(JSON.stringify(store.entries), before);
});

test('AC-FR-6.7, DB-01 layer 1: the history repository interface exposes append and read only', () => {
  assert.deepEqual(Object.keys(historyRepository).sort(), ['append', 'findByIdempotencyKey', 'listForRequest']);
});

// ---------- notifications: AC-FR-3.4, FR-3.5, TD-001 ----------

test('AC-FR-3.4: after staff update a request, the requester has a notification identifying the request and the change', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    assert.equal((await transition(base, await login(base, 'coord@example.test'), STATUS.ON_HOLD, {}, 1)).status, 201);
    // A fresh login is "the next session": the notification is read from the store.
    const res = await fetch(`${base}/api/v1/me/notifications`, { headers: { cookie: await login(base, 'req@example.test') } });
    assert.equal(res.status, 200);
    const { notifications } = await res.json();
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].requestReference, REF);
    assert.equal(notifications[0].requestId, RID);
    assert.equal(notifications[0].kind, 'updated');
    assert.equal(notifications[0].displayStatus, STATUS.ON_HOLD);
    assert.deepEqual(Object.keys(notifications[0]).sort(),
      ['createdAt', 'displayStatus', 'id', 'kind', 'read', 'requestId', 'requestReference']);
  });
});

test('AC-FR-3.4: a rejection produces a notification of kind rejected that carries no reason text', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const staff = await login(base, 'coord@example.test');
    assert.equal((await transition(base, staff, STATUS.REJECTED, { reason: 'Duplicate of CC-2026-000000' }, 1)).status, 201);
    const { notifications } = await (await fetch(`${base}/api/v1/me/notifications`,
      { headers: { cookie: await login(base, 'req@example.test') } })).json();
    assert.deepEqual(notifications.map((n) => n.kind), ['rejected']);
    assert.doesNotMatch(JSON.stringify(notifications), /Duplicate of/);
  });
});

// Basis: FR-3.5 (security request: requester sees only Received, In Progress, Closed) via
// visibleStatusFor. Input: In Progress -> On Hold on a security request by the Security Officer.
// Expected: the requester's notification shows In Progress, never On Hold; it holds no
// description, reason or comment.
test('FR-3.5, FR-1.5: a notification for a security request shows the mapped status and no restricted detail', async () => {
  const { app } = harness({ ...baseRequest(), securityCategory: true });
  await serve(app, async (base) => {
    assert.equal((await transition(base, await login(base, 'so@example.test'), STATUS.ON_HOLD, {}, 1)).status, 201);
    const res = await fetch(`${base}/api/v1/me/notifications`, { headers: { cookie: await login(base, 'req@example.test') } });
    const text = await res.text();
    const { notifications } = JSON.parse(text);
    assert.equal(notifications[0].displayStatus, STATUS.IN_PROGRESS);
    assert.doesNotMatch(text, /On Hold|DESCRIPTION-TEXT|LOCATION-TEXT/);
  });
});

test('FR-3.4, FR-3.6: a user sees only their own notifications', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    await transition(base, await login(base, 'coord@example.test'), STATUS.ON_HOLD, {}, 1);
    for (const email of ['req2@example.test', 'coord@example.test']) {
      const { notifications } = await (await fetch(`${base}/api/v1/me/notifications`,
        { headers: { cookie: await login(base, email) } })).json();
      assert.deepEqual(notifications, [], email);
    }
  });
});
