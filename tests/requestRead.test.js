/**
 * GET /api/v1/requests/:id — provisional (FR-4.2 is Proposed, OI-01).
 *
 * Traces to: FR-4.2, AC-FR-4.2, AC-FR-7.5, FR-3.5, FR-3.6, FR-1.5, TD-003, DEC-012,
 *            DEC-014, DEC-015 §1, §4 and §6.
 *
 * Service tests use a fake repository. HTTP tests use the real createApp, session
 * middleware and auth service over real HTTP; only persistence is faked.
 *
 * What this does NOT show: behaviour against a real cluster, or the response for a
 * malformed ObjectId (no code handles it; see the report for this change).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { createAuthService } from '../src/services/authService.js';
import { createHealthService } from '../src/services/healthService.js';
import { createRequestQueryService } from '../src/services/requestQueryService.js';
import { createStatusTransitionService } from '../src/services/statusTransitionService.js';
import { visibleStatusFor, mayActOnRequest } from '../src/domain/accessRules.js';
import { checkTransition } from '../src/domain/requestStatus.js';
import { permittedTransitionsFor } from '../src/domain/permittedTransitions.js';
import { AuthorisationError, NotFoundError, PreconditionFailedError } from '../src/errors.js';
import { ROLE, STATUS } from '../src/models/_shared.js';

const CAT = 'cat1';
const baseRequest = {
  reference: 'CC-2026-000001', status: STATUS.ASSIGNED, version: 3,
  categoryId: CAT, securityCategory: false, requesterId: 'u2',
  submittedById: 'u2', submittedAt: new Date('2026-10-01T08:00:00Z'), assigneeId: 'u9',
  location: 'LOC-SENTINEL', description: 'DESC-SENTINEL',
  resolution: { summary: 'RES-SENTINEL', recordedAt: new Date('2026-10-02T08:00:00Z') },
  closure: { reason: 'CLOSE-SENTINEL' },
};
const SENTINELS = ['DESC-SENTINEL', 'RES-SENTINEL', 'CLOSE-SENTINEL'];   // the FR-1.5 fields' values

// Allow-lists: the exact key set each kind of viewer receives (AC-FR-4.2, FR-1.5).
// permittedAssignment added by the decision of 17/10/2026 (OI-15, S6): assign/accept for this actor,
// and assigneeRoles, the pool to offer (decision #10; added 17/10/2026).
const COMMON     = ['assigneeId', 'categoryId', 'id', 'location', 'permittedAssignment', 'permittedTransitions',
                    'reference', 'status', 'submittedAt', 'version'];
const RESTRICTED = ['closureReason', 'description', 'resolution'];   // FR-1.5
const PEOPLE     = ['requesterId', 'submittedById'];                 // staff only
const sortedKeys = (o) => Object.keys(o).sort();
const allowList = (...groups) => groups.flat().sort();
// ASSIGNED is shown to a requester as RECEIVED on a security request (FR-3.5).
const SECURITY_INTERNAL = STATUS.ASSIGNED;

const actorOf = (roles, categoryAuthorisations = [CAT], id = 'u1') => ({ id, roles, categoryAuthorisations });

// ---------- service ----------

const serviceFor = (doc) => createRequestQueryService({ requests: { findById: async () => doc } });

// Basis: AC-FR-4.2 Then clause (category, location, description, status, submission details,
// assignment ... displayed), AC-FR-7.5 (resolution visible in the request detail), FR-1.5,
// DEC-015 §6. Technique: service level, one fixture, four viewer kinds. Expected key sets are
// the allow-lists above, written from FR-1.5 and the decision of 17/10/2026 before running.
// Shows: each viewer kind receives exactly its set. Does NOT show: the HTTP serialisation.
const viewers = {
  'a requester on their own non-security request': [baseRequest, actorOf([ROLE.REQUESTER], [], 'u2'),
    allowList(COMMON, RESTRICTED)],
  'a requester on their own security request': [{ ...baseRequest, securityCategory: true },
    actorOf([ROLE.REQUESTER], [], 'u2'), allowList(COMMON)],
  'staff on a non-security request': [baseRequest, actorOf([ROLE.COORDINATOR]),
    allowList(COMMON, RESTRICTED, PEOPLE)],
  'a Security Officer on a security request': [{ ...baseRequest, securityCategory: true },
    actorOf([ROLE.SECURITY_OFFICER]), allowList(COMMON, RESTRICTED, PEOPLE)],
};
for (const [who, [doc, actor, expected]] of Object.entries(viewers)) {
  test(`service: ${who} receives exactly their allow-list of keys — AC-FR-4.2, FR-1.5, DEC-015 §6`, async () => {
    assert.deepEqual(sortedKeys(await serviceFor(doc).getRequest('r1', actor)), expected);
  });
}

test('service: the allowed viewer receives the stored values — AC-FR-4.2, AC-FR-7.5', async () => {
  const r = await serviceFor(baseRequest).getRequest('r1', actorOf([ROLE.COORDINATOR]));
  assert.equal(r.reference, 'CC-2026-000001');
  assert.equal(r.status, STATUS.ASSIGNED);
  assert.equal(r.version, 3);
  assert.equal(r.categoryId, CAT);
  assert.equal(r.location, 'LOC-SENTINEL');
  assert.equal(r.description, 'DESC-SENTINEL');
  assert.equal(r.assigneeId, 'u9');
  assert.deepEqual(r.resolution, { summary: 'RES-SENTINEL', recordedAt: baseRequest.resolution.recordedAt });
  assert.equal(r.closureReason, 'CLOSE-SENTINEL');
  assert.equal(r.submittedAt, baseRequest.submittedAt);
  assert.equal(r.requesterId, 'u2');
  assert.equal(r.submittedById, 'u2');
});

// NV-152. Basis: FR-1.5 (restricts description, comment history and action history of a
// security-category request to the Security Officer), read literally; OI-16 open.
// Why: a requester on their own security request is not the Security Officer. Technique:
// negative, service level, sentinel values in every restricted field. Expected (before
// running): no restricted key, no sentinel anywhere in the serialised result, no key
// naming a comment, action or history. Shows: the restriction holds for that viewer.
// Does NOT show: that FR-1.5 is meant to exclude the requester (OI-16 is open).
test('service: a requester on their own security request never receives description, resolution, closure reason, comments or actions — FR-1.5, NV-152', async () => {
  const doc = { ...baseRequest, securityCategory: true };
  const result = await serviceFor(doc).getRequest('r1', actorOf([ROLE.REQUESTER], [], 'u2'));
  for (const key of [...RESTRICTED, ...PEOPLE]) assert.equal(key in result, false, `${key} present`);
  assert.deepEqual(Object.keys(result).filter((k) => /comment|action|history/i.test(k)), []);
  const text = JSON.stringify(result);
  for (const sentinel of SENTINELS) assert.doesNotMatch(text, new RegExp(sentinel));
});

// ---------- permittedTransitions (TD-003) ----------

// Basis: TD-003, FR-6.2, FR-6.4, FR-6.5, FR-6.6. Why: the detail view tells the client which
// moves to offer; it must never disagree with the transition route. Technique: exhaustive,
// every status x role x security flag x authorised or not. The expectation asks
// checkTransition about EVERY target status (not only the table's edges) with hasResolution
// and hasReason true, plus mayActOnRequest; the two flags are derived by withholding the
// reason or the resolution. Expected: permittedTransitionsFor equals it. Shows: agreement
// for all 7 x 6 x 2 x 2 combinations. Does NOT show: the version and idempotency checks,
// which belong to the route and are not part of the list.
const ALL_STATUSES = Object.values(STATUS);
const ALL_ROLES = Object.values(ROLE);
function expectedTransitions(doc, actor) {
  if (!mayActOnRequest(doc, actor)) return [];
  const context = { securityCategory: doc.securityCategory };
  return ALL_STATUSES
    .filter((to) => checkTransition(doc.status, to, actor.roles, { ...context, hasResolution: true, hasReason: true }).allowed)
    .map((to) => ({
      toStatus: to,
      requiresReason:     !checkTransition(doc.status, to, actor.roles, { ...context, hasResolution: true, hasReason: false }).allowed,
      requiresResolution: !checkTransition(doc.status, to, actor.roles, { ...context, hasResolution: false, hasReason: true }).allowed,
    }));
}
const byTarget = (list) => [...list].sort((x, y) => (x.toStatus < y.toStatus ? -1 : 1));

test('permittedTransitionsFor agrees with checkTransition and mayActOnRequest for every status, role, security flag and authorisation — TD-003, FR-6.2, FR-6.4, NV-153', () => {
  let nonEmpty = 0;
  for (const status of ALL_STATUSES) for (const role of ALL_ROLES)
    for (const securityCategory of [false, true]) for (const authorised of [true, false]) {
      const doc = { ...baseRequest, status, securityCategory };
      const actor = actorOf([role], authorised ? [CAT] : ['other-cat']);
      const got = permittedTransitionsFor(doc, actor);
      assert.deepEqual(byTarget(got), byTarget(expectedTransitions(doc, actor)),
        `${status} / ${role} / security=${securityCategory} / authorised=${authorised}`);
      if (got.length) nonEmpty += 1;
    }
  assert.ok(nonEmpty > 10, 'the sweep must include permitted moves or it proves nothing');
});

test('permittedTransitionsFor: worked cases from FR-6.5 and FR-6.6, and a Requester gets none — TD-003', () => {
  const inProgress = { ...baseRequest, status: STATUS.IN_PROGRESS };
  assert.deepEqual(byTarget(permittedTransitionsFor(inProgress, actorOf([ROLE.COORDINATOR]))), byTarget([
    { toStatus: STATUS.ON_HOLD,  requiresReason: false, requiresResolution: false },
    { toStatus: STATUS.RESOLVED, requiresReason: false, requiresResolution: true },   // FR-6.5
    { toStatus: STATUS.REJECTED, requiresReason: true,  requiresResolution: false },  // FR-6.6
  ]));
  assert.deepEqual(permittedTransitionsFor(inProgress, actorOf([ROLE.REQUESTER], [], 'u2')), []);
  assert.deepEqual(permittedTransitionsFor({ ...baseRequest, status: STATUS.CLOSED }, actorOf([ROLE.MANAGER])), []);
});

// ---------- permittedAssignment (S6, OI-15) ----------

// Basis: the OI-15 team decision of 17/10/2026 and TD-003. Technique: service level, one
// request per case. Expected, derived from the decision: a Coordinator on an owned Assigned
// request may assign (reassign) and not accept; on a Received unassigned request the same;
// a Technician on a Received unassigned non-security request may accept and not assign; on
// a Resolved request nobody may; a Requester never. Shows: the flag reaches the detail view.
// Does NOT show: every combination (tests/permittedAssignment.test.js sweeps those).
test('service: the read carries permittedAssignment for this actor - FR-5.1, FR-5.2, FR-5.5, OI-15', async () => {
  const received = { ...baseRequest, status: STATUS.RECEIVED, assigneeId: null };
  const read = (doc, actor) => serviceFor(doc).getRequest('r1', actor).then((v) => v.permittedAssignment);
  assert.deepEqual(await read(baseRequest, actorOf([ROLE.COORDINATOR])), { assign: true, accept: false, assigneeRoles: [ROLE.TECHNICIAN] });
  assert.deepEqual(await read(received, actorOf([ROLE.COORDINATOR])), { assign: true, accept: false, assigneeRoles: [ROLE.TECHNICIAN] });
  assert.deepEqual(await read(received, actorOf([ROLE.TECHNICIAN])), { assign: false, accept: true, assigneeRoles: [] });
  assert.deepEqual(await read({ ...baseRequest, status: STATUS.RESOLVED }, actorOf([ROLE.COORDINATOR])),
    { assign: false, accept: false, assigneeRoles: [] });
  assert.deepEqual(await read(received, actorOf([ROLE.REQUESTER], [], 'u2')), { assign: false, accept: false, assigneeRoles: [] });
  assert.deepEqual(await read({ ...received, securityCategory: true }, actorOf([ROLE.REQUESTER], [], 'u2')),
    { assign: false, accept: false, assigneeRoles: [] });
});

test('service: missing request is NotFoundError — DEC-015 §4', async () => {
  await assert.rejects(serviceFor(null).getRequest('r1', actorOf([ROLE.COORDINATOR])), NotFoundError);
});

test('service: staff not authorised for the category get AuthorisationError — FR-4.2 (provisional, OI-01), FR-4.1, DEC-012', async () => {
  await assert.rejects(
    serviceFor(baseRequest).getRequest('r1', actorOf([ROLE.COORDINATOR], ['other-cat'])), AuthorisationError);
});

test('service: non-Security-Officer staff on a security request get AuthorisationError — FR-1.5', async () => {
  const doc = { ...baseRequest, securityCategory: true };
  await assert.rejects(serviceFor(doc).getRequest('r1', actorOf([ROLE.MANAGER])), AuthorisationError);
});

test('service: a requester asking for another requester\'s request gets NotFoundError — FR-3.6, DEC-015 §4', async () => {
  await assert.rejects(
    serviceFor(baseRequest).getRequest('r1', actorOf([ROLE.REQUESTER], [], 'someone-else')), NotFoundError);
});

test('service: an Administrator-only actor is refused with AuthorisationError, not 404 — project-lead decision; DEC-015 §4 is silent, FR-1.3', async () => {
  await assert.rejects(
    serviceFor(baseRequest).getRequest('r1', actorOf([ROLE.ADMINISTRATOR], [CAT], 'adm')), AuthorisationError);
});

// Basis: project-lead decision "staff first" (DEC-015 §4 is silent; FR-1.2 allows several
// roles per user). Why: an actor holding Requester AND a staff role must be judged as staff,
// so a refusal is 403, not the Requester-only 404. NV-41 showed nothing pinned this.
// Technique: negative, service level. Expected: AuthorisationError, derived from the
// decision, not from running the code. Shows: the "&& !isStaff" clause is exercised.
// Does NOT show: that "staff first" is a baselined rule. For an actor who is also the
// request's owner the same rule refuses them too; that is untested and unconfirmed.
test('service: a Requester who also holds a staff role, refused, gets AuthorisationError not 404 — project-lead decision (staff first), FR-1.2', async () => {
  const both = actorOf([ROLE.REQUESTER, ROLE.TECHNICIAN], ['other-cat'], 'u7');
  await assert.rejects(serviceFor(baseRequest).getRequest('r1', both), AuthorisationError);
});

test('service: status is visibleStatusFor output for a requester on a security request — FR-3.5', async () => {
  const doc = { ...baseRequest, securityCategory: true, status: SECURITY_INTERNAL };
  const requester = actorOf([ROLE.REQUESTER], [], 'u2');
  const expected = visibleStatusFor(SECURITY_INTERNAL, true, requester);
  assert.notEqual(expected, SECURITY_INTERNAL, 'the chosen input must differ for the test to mean anything');
  assert.equal(expected, STATUS.RECEIVED);
  assert.equal((await serviceFor(doc).getRequest('r1', requester)).status, expected);
});

// ---------- HTTP ----------

function harness(initial) {
  const store = { doc: initial && { ...initial } };   // a copy: the real transition service mutates it
  const users = new Map([
    ['u1', { _id: 'u1', campusId: 'c1', email: 'coord@example.test', displayName: 'Coord',
             passwordHash: 'fake$right', roles: [ROLE.COORDINATOR], categoryAuthorisations: [CAT],
             groupIds: [], status: 'active', sessionEpoch: 0 }],
    ['u2', { _id: 'u2', campusId: 'c1', email: 'req@example.test', displayName: 'Req',
             passwordHash: 'fake$right', roles: [ROLE.REQUESTER], categoryAuthorisations: [],
             groupIds: [], status: 'active', sessionEpoch: 0 }],
    ['u3', { _id: 'u3', campusId: 'c1', email: 'req2@example.test', displayName: 'Req2',
             passwordHash: 'fake$right', roles: [ROLE.REQUESTER], categoryAuthorisations: [],
             groupIds: [], status: 'active', sessionEpoch: 0 }],
    ['u4', { _id: 'u4', campusId: 'c1', email: 'tech@example.test', displayName: 'Tech',
             passwordHash: 'fake$right', roles: [ROLE.TECHNICIAN], categoryAuthorisations: ['other-cat'],
             groupIds: [], status: 'active', sessionEpoch: 0 }],
    ['u6', { _id: 'u6', campusId: 'c1', email: 'admin@example.test', displayName: 'Admin',
             passwordHash: 'fake$right', roles: [ROLE.ADMINISTRATOR], categoryAuthorisations: [CAT],
             groupIds: [], status: 'active', sessionEpoch: 0 }],
    ['u7', { _id: 'u7', campusId: 'c1', email: 'both@example.test', displayName: 'Both',
             passwordHash: 'fake$right', roles: [ROLE.REQUESTER, ROLE.TECHNICIAN], categoryAuthorisations: ['other-cat'],
             groupIds: [], status: 'active', sessionEpoch: 0 }],
    ['u8', { _id: 'u8', campusId: 'c1', email: 'so@example.test', displayName: 'SO',
             passwordHash: 'fake$right', roles: [ROLE.SECURITY_OFFICER], categoryAuthorisations: [CAT],
             groupIds: [], status: 'active', sessionEpoch: 0 }],
    ['u5', { _id: 'u5', campusId: 'c1', email: 'mgr@example.test', displayName: 'Mgr',
             passwordHash: 'fake$right', roles: [ROLE.MANAGER], categoryAuthorisations: [CAT],
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
    passwords: {
      hash: async (p) => `fake$${p}`,
      verify: async (p, h) => ({ ok: h === `fake$${p}`, needsRehash: false }),
    },
  });
  const healthService = createHealthService({ pingDatabase: async () => {} });
  const requestQueryService = createRequestQueryService({ requests: { findById: async () => store.doc } });
  // The REAL transition service over fake, version-conditional persistence, so the read
  // route and the transition route are driven through one application (ETag round-trip).
  const statusTransitionService = createStatusTransitionService({
    requests: {
      findById: async () => store.doc,
      applyChange: async (id, expected, changes) => {
        if (store.doc.version !== expected) throw new PreconditionFailedError(id, expected);
        store.doc.status = changes.status;
        store.doc.version = expected + 1;
        return { version: store.doc.version };
      },
    },
    history: { findByIdempotencyKey: async () => null, append: async () => ({ _id: 'h1' }) },
    unitOfWork: { run: async (work) => work({}) },
  });
  const app = createApp({
    authService, healthService, statusTransitionService, requestQueryService, log: { error() {} },
  });
  return { app, store };
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

const get = (base, cookie, id = 'r1') =>
  fetch(`${base}/api/v1/requests/${id}`, { headers: cookie ? { cookie } : {} });

test('GET with no session is 401 and carries no request data — AC-FR-1.1, DEC-012', async () => {
  const { app } = harness(baseRequest);
  await serve(app, async (base) => {
    const res = await get(base, null);
    assert.equal(res.status, 401);
    const text = await res.text();
    assert.doesNotMatch(text, /CC-2026-000001/);
    assert.equal(JSON.parse(text).code, 'UNAUTHENTICATED');
  });
});

test('GET 200 for a Coordinator: ETag "v<version>" and exactly the staff allow-list for a non-security request — AC-FR-4.2, DEC-015 §1 and §6', async () => {
  const { app } = harness(baseRequest);
  await serve(app, async (base) => {
    const res = await get(base, await login(base, 'coord@example.test'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('etag'), '"v3"');
    const body = await res.json();
    assert.deepEqual(sortedKeys(body), allowList(COMMON, RESTRICTED, PEOPLE));
    assert.equal(body.reference, 'CC-2026-000001');
    assert.equal(body.status, STATUS.ASSIGNED);
    assert.equal(body.version, 3);
    assert.equal(body.description, 'DESC-SENTINEL');
    assert.deepEqual(body.permittedAssignment, { assign: true, accept: false, assigneeRoles: [ROLE.TECHNICIAN] }, 'OI-15: reassign is open in Assigned');
    assert.deepEqual(body.permittedTransitions.map((t) => t.toStatus).sort(),
      [STATUS.IN_PROGRESS, STATUS.ON_HOLD, STATUS.REJECTED].sort());
  });
});

const httpKeys = {
  'a requester on their own non-security request': ['req@example.test', {}, allowList(COMMON, RESTRICTED)],
  'a requester on their own security request': ['req@example.test', { securityCategory: true }, allowList(COMMON)],
  'a Security Officer on a security request': ['so@example.test', { securityCategory: true }, allowList(COMMON, RESTRICTED, PEOPLE)],
};
for (const [who, [email, patch, expected]] of Object.entries(httpKeys)) {
  test(`GET 200 for ${who} has exactly their allow-list — AC-FR-4.2, FR-1.5, DEC-015 §6`, async () => {
    const { app } = harness({ ...baseRequest, ...patch });
    await serve(app, async (base) => {
      const res = await get(base, await login(base, email));
      assert.equal(res.status, 200);
      assert.deepEqual(sortedKeys(await res.json()), expected);
    });
  });
}

// NV-152 over HTTP: as the service test of the same name; the wire text is searched, not
// only the parsed keys.
test('over HTTP, a requester on their own security request receives no description, resolution, closure reason, comment or action, and no transitions — FR-1.5, TD-003, NV-152', async () => {
  const { app } = harness({ ...baseRequest, securityCategory: true });
  await serve(app, async (base) => {
    const res = await get(base, await login(base, 'req@example.test'));
    assert.equal(res.status, 200);
    const text = await res.text();
    for (const sentinel of SENTINELS) assert.doesNotMatch(text, new RegExp(sentinel));
    const body = JSON.parse(text);
    for (const key of RESTRICTED) assert.equal(key in body, false, `${key} present`);
    assert.deepEqual(Object.keys(body).filter((k) => /comment|action|history/i.test(k)), []);
    assert.deepEqual(body.permittedTransitions, []);
  });
});

test('a refused viewer still gets 403 or 404 and none of the detail — FR-1.5, FR-3.6, DEC-012', async () => {
  const { app } = harness({ ...baseRequest, securityCategory: true });
  await serve(app, async (base) => {
    const staff = await get(base, await login(base, 'mgr@example.test'));
    assert.equal(staff.status, 403);
    const other = await get(base, await login(base, 'req2@example.test'));
    assert.equal(other.status, 404);
    for (const res of [staff, other]) {
      const text = await res.text();
      for (const sentinel of [...SENTINELS, 'LOC-SENTINEL', 'CC-2026-000001']) assert.doesNotMatch(text, new RegExp(sentinel));
    }
  });
});

test('a Coordinator authorised for the category gets 200 — FR-4.2 (provisional, OI-01), FR-4.1', async () => {
  const { app } = harness(baseRequest);
  await serve(app, async (base) => {
    assert.equal((await get(base, await login(base, 'coord@example.test'))).status, 200);
  });
});

test('staff not authorised for the category get 403 with no request data — FR-4.2 (provisional, OI-01), FR-4.1, DEC-012', async () => {
  const { app } = harness(baseRequest);
  await serve(app, async (base) => {
    const res = await get(base, await login(base, 'tech@example.test'));
    assert.equal(res.status, 403);
    assert.doesNotMatch(await res.text(), /CC-2026-000001/);
  });
});

test('a security request viewed by non-Security-Officer staff is 403 — FR-1.5', async () => {
  const { app } = harness({ ...baseRequest, securityCategory: true });
  await serve(app, async (base) => {
    const res = await get(base, await login(base, 'mgr@example.test'));
    assert.equal(res.status, 403);
    assert.doesNotMatch(await res.text(), /CC-2026-000001/);
  });
});

test('an Administrator-only actor viewing an existing request is 403 with no request data — project-lead decision; DEC-015 §4 is silent, FR-1.3', async () => {
  const { app } = harness(baseRequest);
  await serve(app, async (base) => {
    const res = await get(base, await login(base, 'admin@example.test'));
    assert.equal(res.status, 403);
    assert.doesNotMatch(await res.text(), /CC-2026-000001/);
  });
});

test('a requester viewing their own non-security request gets 200 — FR-3.6', async () => {
  const { app } = harness(baseRequest);
  await serve(app, async (base) => {
    const res = await get(base, await login(base, 'req@example.test'));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, STATUS.ASSIGNED);
  });
});

// Basis: FR-3.6 / AC-FR-3.6 (no data, no existence oracle), DEC-015 §4 row 404.
// Why: a refusal that differs from "not found" in ANY observable response part tells the
// requester the id exists. Status and body were compared; headers are compared too.
// Technique: negative, HTTP integration, same session and same URL for both cases.
// Expected: identical status, body and headers except those that vary per response by
// nature. Excluded: `date` only (the server clock at the moment of the response). Nothing
// else is excluded: content-length, content-type, etag (Express derives it from the body),
// set-cookie, connection and keep-alive are deterministic for identical input, so a
// difference in any of them would be a leak.
// Shows: status, body and every header but Date match. Does NOT show: that timing or
// anything below the HTTP header level is indistinguishable.
const VARIABLE_HEADERS = new Set(['date']);
const comparableHeaders = (res) =>
  [...res.headers.entries()].filter(([name]) => !VARIABLE_HEADERS.has(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

test('another user\'s request is indistinguishable from a missing id, in status, body and headers — FR-3.6, DEC-015 §4', async () => {
  const { app, store } = harness(baseRequest);
  await serve(app, async (base) => {
    const cookie = await login(base, 'req2@example.test');
    const notTheirs = await get(base, cookie, 'r1');           // exists, belongs to u2
    const notTheirsBody = await notTheirs.json();
    store.doc = null;
    const missing = await get(base, cookie, 'r1');             // same id, now absent
    const missingBody = await missing.json();
    assert.equal(notTheirs.status, 404);
    assert.equal(missing.status, 404);
    assert.deepEqual(notTheirsBody, missingBody);
    assert.deepEqual(comparableHeaders(notTheirs), comparableHeaders(missing));
    assert.ok(comparableHeaders(missing).length > 0, 'no headers were compared');
  });
});

// Basis/Why/Technique/Expected/Shows: as the service test of the same name above, over
// HTTP. Expected 403 and no request data, from the project-lead decision (staff first).
test('a Requester who also holds a staff role, refused, is 403 with no request data — project-lead decision (staff first), FR-1.2', async () => {
  const { app } = harness(baseRequest);
  await serve(app, async (base) => {
    const res = await get(base, await login(base, 'both@example.test'));
    assert.equal(res.status, 403);
    assert.doesNotMatch(await res.text(), /CC-2026-000001/);
  });
});

test('a requester viewing their own security request sees the mapped status — FR-3.5, DEC-012 point 3', async () => {
  const { app } = harness({ ...baseRequest, securityCategory: true, status: SECURITY_INTERNAL });
  await serve(app, async (base) => {
    const res = await get(base, await login(base, 'req@example.test'));
    assert.equal(res.status, 200);
    const shown = (await res.json()).status;
    assert.notEqual(shown, SECURITY_INTERNAL);
    assert.equal(shown, visibleStatusFor(SECURITY_INTERNAL, true, actorOf([ROLE.REQUESTER], [], 'u2')));
  });
});

test('an unknown request id is 404 NOT_FOUND — DEC-015 §4', async () => {
  const { app } = harness(null);
  await serve(app, async (base) => {
    const res = await get(base, await login(base, 'coord@example.test'));
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, 'NOT_FOUND');
  });
});

// ---------- ETag round-trip: the GET and the transition route agree ----------
//
// Basis: DEC-015 §3 (every request representation carries ETag "v<version>";
// state-changing sub-resources require If-Match; stale -> 412), DEC-016.
// Why: the ETag the GET emits and the If-Match the transition route parses were held
// together only by convention (etagFor and versionFromIfMatch in requestRoutes.js, with
// no test linking them). Changing either alone broke the contract with every ETag test
// green (see NV-33/NV-34 notes). A client that follows the contract (read the ETag, send
// it back) must be accepted; one holding an out-of-date ETag must get 412.
// Technique: API integration through createApp over HTTP; the REAL transition service on
// faked, version-conditional persistence. The header is passed through verbatim.
// Expected (from DEC-015, before execution): 201 for the fresh ETag; 412 for an ETag read
// before another writer bumped the version; after the 412 a fresh GET's ETag is accepted.
// Shows: the two handlers agree end to end. Does NOT show: behaviour against a real
// cluster, or 428 for a missing/malformed If-Match (requestRoutes tests cover that).

const postTransition = (base, cookie, ifMatch, key) => fetch(`${base}/api/v1/requests/r1/transitions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie, 'if-match': ifMatch, 'idempotency-key': key },
  body: JSON.stringify({ toStatus: STATUS.IN_PROGRESS }),
});

test('the ETag from GET, used verbatim as If-Match on the transition route, is accepted — DEC-015 §3', async () => {
  const { app, store } = harness(baseRequest);
  await serve(app, async (base) => {
    const cookie = await login(base, 'coord@example.test');
    const read = await get(base, cookie);
    const etag = read.headers.get('etag');
    assert.ok(etag, 'GET sent no ETag');

    const moved = await postTransition(base, cookie, etag, 'k-roundtrip-1');
    assert.equal(moved.status, 201);
    assert.equal(store.doc.status, STATUS.IN_PROGRESS, 'the transition was not applied');
    assert.equal(store.doc.version, baseRequest.version + 1);

    // The ETag on the transition response is the one a fresh GET now reports.
    const reread = await get(base, cookie);
    assert.equal(moved.headers.get('etag'), reread.headers.get('etag'));
    assert.notEqual(reread.headers.get('etag'), etag);
    assert.equal((await reread.json()).status, STATUS.IN_PROGRESS);
  });
});

test('an ETag read before another writer changed the version is refused 412, and a fresh one is accepted — DEC-015 §3, DEC-016', async () => {
  const { app, store } = harness(baseRequest);
  await serve(app, async (base) => {
    const cookie = await login(base, 'coord@example.test');
    const stale = (await get(base, cookie)).headers.get('etag');

    store.doc.version += 1;                                    // someone else wrote in between

    const refused = await postTransition(base, cookie, stale, 'k-roundtrip-2');
    assert.equal(refused.status, 412);
    assert.equal((await refused.json()).code, 'PRECONDITION_FAILED');
    assert.equal(store.doc.status, STATUS.ASSIGNED, 'a stale write was applied');

    const fresh = (await get(base, cookie)).headers.get('etag');
    assert.notEqual(fresh, stale);
    assert.equal((await postTransition(base, cookie, fresh, 'k-roundtrip-3')).status, 201);
  });
});
