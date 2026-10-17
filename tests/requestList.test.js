/**
 * GET /api/v1/requests and POST /api/v1/requests/search.
 *
 * Traces to: AC-FR-1.1, AC-FR-3.1, AC-FR-3.2, AC-FR-3.5, AC-FR-3.6, AC-FR-4.1,
 *            AC-FR-4.3, AC-FR-4.4, AC-FR-4.5, AC-FR-4.6, FR-1.5, CON-007,
 *            DEC-012, DEC-014, DEC-015 §1 and §4.
 *
 * Service tests use a fake repository (tests/requestListFixtures.js). HTTP tests
 * use the real createApp, session middleware, auth service, guard and list
 * service over real HTTP; only persistence is faked.
 *
 * What this does NOT show: that MongoDB evaluates the filter, the text index or
 * the keyset cursor as the in-memory evaluator does (no database in this suite),
 * or index use. Both are for the integration run against a cluster.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { createAuthService } from '../src/services/authService.js';
import { createHealthService } from '../src/services/healthService.js';
import { createRequestListService } from '../src/services/requestListService.js';
import { createRequestListRouter } from '../src/routes/requestListRoutes.js';
import { LIST_PROJECTION } from '../src/repositories/requestListRepository.js';
import { mayViewRequest, visibleStatusFor } from '../src/domain/accessRules.js';
import { GUARD_NAME } from '../src/middleware/authorise.js';
import { ValidationError, AuthorisationError } from '../src/errors.js';
import { ROLE, STATUS } from '../src/models/_shared.js';
import {
  REQUESTS, ACTORS, fakeLists, oid, CAT1, CAT2, CATS, R1, R2, TA, TB,
} from './requestListFixtures.js';

const ITEM_KEYS = ['assigneeId', 'categoryId', 'id', 'location', 'reference', 'status', 'submittedAt'];

const serviceWith = (rows = REQUESTS) => {
  const lists = fakeLists(rows);
  return { service: createRequestListService({ lists }), lists };
};

async function allPages(service, actor, query = {}) {
  const items = [];
  let cursor;
  for (let i = 0; i < 50; i++) {
    const page = await service.list({ ...query, ...(cursor ? { cursor } : {}) }, actor);
    items.push(...page.items);
    if (!page.nextCursor) return items;
    cursor = page.nextCursor;
  }
  throw new Error('pagination did not terminate');
}

const refsOf = (items) => items.map((i) => i.reference);

// ---------- the main protection: the list equals the fixture filtered by mayViewRequest ----------

// Basis: DEC-012 (one rule set; point 2 is mayViewRequest), FR-4.1 / AC-FR-4.1 ("every
// request their authorisation permits and no request outside it"), FR-3.6, FR-1.5.
// Why: the list could be authorised by a second, different rule from the one the detail
// route uses. Nothing else would notice until a user saw a request they must not see.
// Technique: equivalence, service level. For EVERY actor in the fixture set (all six FR-1.2
// roles, plus a Requester who is also staff, an unauthorised technician, a Security Officer
// with and without the category, and an actor with no role) the list is requested in pages
// of 3 and compared with REQUESTS.filter(mayViewRequest). Fixtures include security and
// non-security requests in three categories and two requesters.
// Expected (from mayViewRequest, written before execution): the two id sets are identical
// for every actor; additionally the expectations are not all empty and not all complete.
// Shows: the filter the service builds, evaluated by the fake evaluator, selects exactly the
// requests mayViewRequest permits. Does NOT show: that MongoDB agrees with the evaluator.
test('the list for every actor equals the fixtures filtered by mayViewRequest — AC-FR-4.1, FR-3.6, FR-1.5, DEC-012', async () => {
  const { service } = serviceWith();
  const sizes = new Set();
  for (const [name, actor] of Object.entries(ACTORS)) {
    const expected = REQUESTS.filter((r) => mayViewRequest(r, actor)).map((r) => r.reference).sort();
    if (['administrator', 'noRole'].includes(name)) {
      // DEC-015 §3 / D11: no role that can view requests is a 403, not an empty list.
      assert.deepEqual(expected, [], `${name}: mayViewRequest permits nothing`);
      await assert.rejects(service.list({}, actor), AuthorisationError, `${name}: list is refused`);
      sizes.add(0);
      continue;
    }
    const actual = refsOf(await allPages(service, actor, { limit: '3' }));
    assert.equal(new Set(actual).size, actual.length, `${name}: a request was listed twice`);
    assert.deepEqual([...actual].sort(), expected, `${name}: list differs from mayViewRequest`);
    sizes.add(expected.length);
  }
  assert.ok(sizes.has(0), 'no actor with an empty expectation: the test could pass vacuously');
  assert.ok([...sizes].some((n) => n > 0 && n < REQUESTS.length), 'no actor with a partial expectation');
  const securityOfficer = refsOf(await allPages(service, ACTORS.securityOfficer));
  assert.ok(securityOfficer.length > 0 && REQUESTS.some((r) => r.securityCategory && securityOfficer.includes(r.reference)),
    'the Security Officer must see the security requests');
});

// ---------- requester list ----------

// Basis: AC-FR-3.1 Then clause. Fixtures: R1 owns six requests, R2 owns four. The AC's
// numbers (3 and 1) are reproduced in the HTTP test below with its own data.
test('a requester\'s list holds only their own requests — AC-FR-3.1, FR-3.6', async () => {
  const { service } = serviceWith();
  const items = await allPages(service, ACTORS.requester1);
  const own = REQUESTS.filter((r) => String(r.requesterId) === R1).map((r) => r.reference).sort();
  assert.deepEqual(refsOf(items).sort(), own);
  assert.ok(items.every((i) => !refsOf(REQUESTS.filter((r) => String(r.requesterId) === R2)).includes(i.reference)));
});

test('a security-category request shows a requester only Received, In Progress or Closed in the list — AC-FR-3.5, FR-3.5', async () => {
  const securityRows = Object.values(STATUS).map((status, n) => ({
    ...REQUESTS[5], _id: oid(0x4000 + n), reference: `CC-2026-9${String(n).padStart(5, '0')}`, status,
  }));
  const { service } = serviceWith(securityRows);
  const items = await allPages(service, ACTORS.requester1);
  assert.equal(items.length, Object.values(STATUS).length);
  const allowed = [STATUS.RECEIVED, STATUS.IN_PROGRESS, STATUS.CLOSED];
  for (const item of items) assert.ok(allowed.includes(item.status), `'${item.status}' shown to a requester`);
  // The inputs must include values that differ from what is shown, or the mapping is untested.
  assert.ok(securityRows.some((r) => !allowed.includes(r.status)));
  assert.equal(items.find((i) => i.reference === 'CC-2026-900001').status,
    visibleStatusFor(STATUS.ASSIGNED, true, ACTORS.requester1));
});

// Basis: FR-3.5 with FR-4.4. Why: a requester who filters by an INTERNAL status could
// learn the hidden value from which security request is returned. Expected (derived from
// FR-3.5): the security request (internal Assigned, shown Received) is returned by
// status=Received and NOT by status=Assigned.
test('a requester\'s status filter matches the status they are shown, not the internal one — FR-3.5, FR-4.4', async () => {
  const { service } = serviceWith();
  const shown = await service.list({ status: STATUS.RECEIVED }, ACTORS.requester1);
  assert.ok(refsOf(shown.items).includes('CC-2026-000006'), 'the security request (internal Assigned) is shown as Received');
  const internal = await service.list({ status: STATUS.ASSIGNED }, ACTORS.requester1);
  assert.ok(!refsOf(internal.items).includes('CC-2026-000006'), 'the filter disclosed an internal status');
  assert.ok(refsOf(internal.items).includes('CC-2026-000002'), 'a non-security Assigned request still matches');
});

test('a requester may order the list by submission date only — FR-3.5, FR-4.5', async () => {
  const { service } = serviceWith();
  await assert.rejects(service.list({ sort: 'status' }, ACTORS.requester1),
    (e) => e instanceof ValidationError && /'sort'/.test(e.message));
  assert.ok((await service.list({ sort: 'submittedAt' }, ACTORS.requester1)).items.length > 0);
});

// ---------- items never carry description, comments or actions ----------

test('a list item has exactly the seven DEC-015 fields and never a description — FR-1.5, DEC-015 §1', async () => {
  const { service } = serviceWith();
  for (const actor of [ACTORS.requester1, ACTORS.coordinatorCat1, ACTORS.securityOfficer]) {
    const { items } = await service.list({}, actor);       // the fake returns whole documents, description included
    assert.ok(items.length > 0);
    for (const item of items) {
      assert.deepEqual(Object.keys(item).sort(), ITEM_KEYS);
      assert.ok(!JSON.stringify(item).includes('private detail'), 'description text reached the response');
    }
  }
});

test('the repository projection selects no description, comment or action field — FR-1.5', () => {
  for (const banned of ['description', 'comments', 'actions', 'details']) {
    assert.ok(!Object.hasOwn(LIST_PROJECTION, banned), `${banned} is projected`);
  }
  assert.deepEqual(Object.keys(LIST_PROJECTION).sort(),
    ['assigneeId', 'categoryId', 'location', 'reference', 'securityCategory', 'status', 'submittedAt']);
});

// ---------- filters and sort ----------

test('filtering by one status lists only requests in that status — AC-FR-4.4', async () => {
  const { service } = serviceWith();
  const statuses = new Set(REQUESTS.map((r) => r.status));
  assert.ok(statuses.size > 1, 'the fixture needs more than one status');
  const { items } = await service.list({ status: STATUS.RECEIVED }, ACTORS.managerAll);
  const expected = REQUESTS.filter((r) => r.status === STATUS.RECEIVED).map((r) => r.reference).sort();
  assert.ok(expected.length > 0 && expected.length < REQUESTS.length);
  assert.deepEqual(refsOf(items).sort(), expected);
  assert.ok(items.every((i) => i.status === STATUS.RECEIVED));
});

test('the default order is submission date, newest first; ascending is available — AC-FR-4.5', async () => {
  const { service } = serviceWith();
  const desc = (await allPages(service, ACTORS.managerAll)).map((i) => i.submittedAt);
  assert.ok(new Set(desc).size > 1, 'the fixture needs different submission dates');
  assert.deepEqual(desc, [...desc].sort().reverse());
  assert.equal(desc[0], REQUESTS.map((r) => r.submittedAt.toISOString()).sort().at(-1));
  const asc = (await allPages(service, ACTORS.managerAll, { sort: 'submittedAt' })).map((i) => i.submittedAt);
  assert.deepEqual(asc, [...asc].sort());
});

test('sorting by status and by category is accepted for staff — FR-4.5', async () => {
  const { service } = serviceWith();
  const byStatus = (await allPages(service, ACTORS.managerAll, { sort: 'status' })).map((i) => i.status);
  assert.deepEqual(byStatus, [...byStatus].sort());
  const byCategory = (await allPages(service, ACTORS.managerAll, { sort: '-categoryId', limit: '4' })).map((i) => i.categoryId);
  assert.deepEqual(byCategory, [...byCategory].sort().reverse());
});

test('pages follow on without gaps or repeats, including requests with the same submission instant — AC-FR-4.5, DEC-015 §1', async () => {
  const { service } = serviceWith();
  const whole = refsOf((await service.list({ limit: '100' }, ACTORS.managerAll)).items);
  const paged = refsOf(await allPages(service, ACTORS.managerAll, { limit: '1' }));
  assert.deepEqual(paged, whole);
  assert.equal(new Set(paged).size, REQUESTS.filter((r) => mayViewRequest(r, ACTORS.managerAll)).length);
  assert.ok(REQUESTS.some((a, i) => REQUESTS.some((b, j) => i < j && +a.submittedAt === +b.submittedAt)), 'the fixture needs a tie');
});

test('categoryId, assigneeId and from/to narrow the list — FR-4.4, FR-4.5', async () => {
  const { service } = serviceWith();
  const actor = ACTORS.managerAll;
  assert.deepEqual(refsOf((await service.list({ categoryId: CAT2 }, actor)).items).sort(),
    REQUESTS.filter((r) => r.categoryId === CAT2).map((r) => r.reference).sort());
  assert.deepEqual(refsOf((await service.list({ assigneeId: TA }, actor)).items).sort(),
    ['CC-2026-000002', 'CC-2026-000008']);
  const ranged = await service.list({ from: '2026-01-03', to: '2026-01-04' }, actor);   // both days inclusive
  assert.deepEqual(refsOf(ranged.items).sort(), ['CC-2026-000003', 'CC-2026-000004']);
  const timed = await service.list({ from: '2026-01-03T09:00:00Z', to: '2026-01-04T08:59:59Z' }, actor);
  assert.deepEqual(refsOf(timed.items), ['CC-2026-000003']);
});

// Basis: AC-FR-4.6. Fixture: request 1 is unassigned in CAT1. Technician TA is authorised
// for CAT1, technician TB is not. Expected (from the AC's Then clause): present for TA,
// absent for TB. `assigneeId=none` is the proposed spelling of the unassigned set.
test('the unassigned set shows an unassigned request to a Technician authorised for its category and not to one who is not — AC-FR-4.6', async () => {
  const { service } = serviceWith();
  const first = await service.list({ assigneeId: 'none' }, ACTORS.technicianCat1);
  const second = await service.list({ assigneeId: 'none' }, ACTORS.technicianCat2);
  assert.ok(refsOf(first.items).includes('CC-2026-000001'));
  assert.ok(!refsOf(second.items).includes('CC-2026-000001'));
  assert.ok(first.items.every((i) => i.assigneeId === null && i.categoryId === CAT1));
  assert.equal(second.items.filter((i) => i.categoryId === CAT1).length, 0);
});

// ---------- 400s ----------

test('invalid query values are 400 and name the parameter — DEC-015 §4', async () => {
  const { service, lists } = serviceWith();
  const cases = [
    [{ status: 'Submitted' }, 'status'],
    [{ status: ['Received', 'Closed'] }, 'status'],
    [{ categoryId: 'abc' }, 'categoryId'],
    [{ categoryId: '{"$ne":null}' }, 'categoryId'],
    [{ categoryId: { $ne: '' } }, 'categoryId'],
    [{ assigneeId: 'nobody' }, 'assigneeId'],
    [{ assigneeId: '12345678901234567890123g' }, 'assigneeId'],
    [{ from: 'yesterday' }, 'from'],
    [{ to: '2026-13-45' }, 'to'],
    [{ from: '2026-02-01', to: '2026-01-01' }, 'from'],
    [{ sort: 'description' }, 'sort'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ limit: 'ten' }, 'limit'],
    [{ limit: '1.5' }, 'limit'],
    [{ cursor: 'not-a-cursor' }, 'cursor'],
    [{ cursor: Buffer.from('{"s":"-submittedAt","v":"x","i":"y"}').toString('base64url') }, 'cursor'],
    [{ colour: 'red' }, 'colour'],
  ];
  for (const [query, name] of cases) {
    await assert.rejects(service.list(query, ACTORS.managerAll),
      (e) => e instanceof ValidationError && e.status === 400 && e.message.includes(`'${name}'`),
      JSON.stringify(query));
  }
  assert.equal(lists.calls.length, 0, 'a rejected query must not reach the repository');
});

test('limit 100 is accepted and returns at most 100 items — DEC-015 §1', async () => {
  const { service, lists } = serviceWith();
  await service.list({ limit: '100' }, ACTORS.managerAll);
  assert.equal(lists.calls[0].limit, 101, 'one extra row is fetched to know whether another page exists');
});

test('a cursor from one sort is refused under another — DEC-015 §1', async () => {
  const { service } = serviceWith();
  const { nextCursor } = await service.list({ limit: '2' }, ACTORS.managerAll);
  assert.ok(nextCursor);
  await assert.rejects(service.list({ cursor: nextCursor, sort: 'status' }, ACTORS.managerAll),
    (e) => e instanceof ValidationError && /'cursor'/.test(e.message));
});

// ---------- search ----------

// Basis: AC-FR-4.3. Fixture: request 4 has "streetlight" in its description (R2's, CAT1).
test('a staff search for a term in a description returns that request, without the description — AC-FR-4.3, FR-1.5', async () => {
  const { service } = serviceWith();
  const { items } = await service.search({ text: 'streetlight' }, ACTORS.coordinatorCat1);
  assert.deepEqual(refsOf(items), ['CC-2026-000004']);
  assert.deepEqual(Object.keys(items[0]).sort(), ITEM_KEYS);
  assert.ok(!JSON.stringify(items).includes('streetlight'));
});

test('search matches a reference exactly — FR-4.3', async () => {
  const { service } = serviceWith();
  const { items } = await service.search({ text: 'CC-2026-000002' }, ACTORS.coordinatorCat1);
  assert.deepEqual(refsOf(items), ['CC-2026-000002']);
});

test('search applies the same authorisation as the list: a request outside the actor\'s categories is not found — AC-FR-4.1, FR-1.5', async () => {
  const { service } = serviceWith();
  const tap = await service.search({ text: 'tap' }, ACTORS.technicianCat2);        // request 1 is in CAT1
  assert.deepEqual(tap.items, []);
  const secret = await service.search({ text: 'confidential' }, ACTORS.managerAll);   // security, no Security Officer role
  assert.deepEqual(secret.items, []);
  const officer = await service.search({ text: 'confidential' }, ACTORS.securityOfficer);
  assert.deepEqual(refsOf(officer.items), ['CC-2026-000006']);
});

// Basis: D11 (integration decision): GET /api/v1/requests and POST /api/v1/requests/search
// refuse an actor with no role that can view requests with 403 FORBIDDEN and no data,
// as GET /api/v1/requests/:id does; a Requester or any staff role keeps its scoped list.
// Expected: 403 problem body naming no reference for Administrator-only and for a user with
// no role; 200 with the scoped list for a Requester and a Technician; the repository untouched.
test('an Administrator-only actor gets 403 FORBIDDEN and no data from the list and the search (and an actor with no role from the list service); a Requester and staff keep their scoped list — D11, FR-3.1, FR-4.1', async () => {
  const baseUser = { campusId: 'c1', passwordHash: 'fake$right', groupIds: [], status: 'active', sessionEpoch: 0 };
  const admin = { ...baseUser, _id: oid(0x2401), email: 'admin@example.test', displayName: 'Admin', roles: [ROLE.ADMINISTRATOR], categoryAuthorisations: [CAT1, CAT2, CATS] };
  const { app, lists } = harness({ users: [admin] });
  await serve(app, async (base) => {
    for (const email of ['admin@example.test']) {      // a user with no role cannot log in; that case is the service-level test above
      const cookie = await login(base, email);
      for (const res of [await getList(base, cookie), await getList(base, cookie, '?assigneeId=none'),
        await postSearch(base, cookie, { text: 'tap' })]) {
        assert.equal(res.status, 403, email);
        const text = await res.text();
        assert.equal(JSON.parse(text).code, 'FORBIDDEN');
        assert.doesNotMatch(text, /CC-2026-|items/);
      }
    }
    assert.equal(lists.calls.length, 0, 'the repository must not be reached');
    const none = { ...ACTORS.noRole, campusId: 'c1' };
    await assert.rejects(createRequestListService({ lists }).list({}, none), AuthorisationError);
    await assert.rejects(createRequestListService({ lists }).search({ text: 'tap' }, none), AuthorisationError);
    assert.equal(lists.calls.length, 0);

    const requester = await getList(base, await login(base, 'req1@example.test'));
    assert.equal(requester.status, 200);
    assert.ok((await requester.json()).items.length > 0);
    const staff = await getList(base, await login(base, 'ta@example.test'));
    assert.equal(staff.status, 200);
    assert.ok((await staff.json()).items.length > 0);
    assert.equal((await postSearch(base, await login(base, 'co@example.test'), { text: 'tap' })).status, 200);
  });
});

// Basis: SCP-019 and the declared Request indexes, which all lead with campusId.
// Expected: the filter every list/search query sends to the repository has a campusId
// clause for the ACTOR'S campus first, and a request of another campus is never listed.
test('every list and search query leads with the actor campusId, and requests of another campus are not listed — SCP-019, FR-4.1', async () => {
  const other = { ...REQUESTS[0], _id: oid(0x3999), reference: 'CC-2026-000999', campusId: 'c2' };
  const { service, lists } = serviceWith([...REQUESTS, other]);
  const items = await allPages(service, ACTORS.managerAll);
  assert.ok(!refsOf(items).includes('CC-2026-000999'));
  await service.search({ text: 'tap' }, ACTORS.managerAll);
  assert.ok(lists.calls.length >= 2);
  for (const call of lists.calls) assert.deepEqual(call.filter.$and[0], { campusId: 'c1' });
  const elsewhere = { ...ACTORS.managerAll, campusId: 'c2' };
  assert.deepEqual(refsOf((await service.list({}, elsewhere)).items), ['CC-2026-000999']);
  await assert.rejects(service.list({}, { ...ACTORS.managerAll, campusId: undefined }), AuthorisationError);
});

test('search is for staff: a Requester is refused, an Administrator-only actor is refused — FR-4.3', async () => {
  const { service, lists } = serviceWith();
  await assert.rejects(service.search({ text: 'tap' }, ACTORS.requester1), AuthorisationError);
  await assert.rejects(service.search({ text: 'tap' }, ACTORS.administrator), AuthorisationError);
  assert.equal(lists.calls.length, 0);
});

test('search needs text and rejects bad filters, naming the parameter — DEC-015 §4', async () => {
  const { service } = serviceWith();
  const actor = ACTORS.managerAll;
  for (const [body, name] of [
    [{}, 'text'], [{ text: '   ' }, 'text'], [{ text: 5 }, 'text'], [{ text: 'x'.repeat(201) }, 'text'],
    [{ text: 'tap', categoryId: 'zz' }, 'categoryId'], [{ text: 'tap', status: 'Nope' }, 'status'],
    [{ text: 'tap', extra: 1 }, 'extra'], [{ text: 'tap', limit: 500 }, 'limit'],
  ]) {
    await assert.rejects(service.search(body, actor),
      (e) => e instanceof ValidationError && e.message.includes(`'${name}'`), JSON.stringify(body).slice(0, 40));
  }
  await assert.rejects(service.search(null, actor), ValidationError);
  await assert.rejects(service.search([], actor), ValidationError);
});

// ---------- HTTP ----------

function harness({ rows = REQUESTS, users: extra = [], lists = fakeLists(rows), log = { error() {} } } = {}) {
  const base = { campusId: 'c1', passwordHash: 'fake$right', groupIds: [], status: 'active', sessionEpoch: 0 };
  const users = new Map([
    { ...base, _id: R1, email: 'req1@example.test', displayName: 'Req1', roles: [ROLE.REQUESTER], categoryAuthorisations: [] },
    { ...base, _id: R2, email: 'req2@example.test', displayName: 'Req2', roles: [ROLE.REQUESTER], categoryAuthorisations: [] },
    { ...base, _id: TA, email: 'ta@example.test', displayName: 'TechA', roles: [ROLE.TECHNICIAN], categoryAuthorisations: [CAT1] },
    { ...base, _id: TB, email: 'tb@example.test', displayName: 'TechB', roles: [ROLE.TECHNICIAN], categoryAuthorisations: [CAT2] },
    { ...base, _id: oid(0x2101), email: 'co@example.test', displayName: 'Coord', roles: [ROLE.COORDINATOR], categoryAuthorisations: [CAT1] },
    { ...base, _id: oid(0x2301), email: 'so@example.test', displayName: 'Sec', roles: [ROLE.SECURITY_OFFICER], categoryAuthorisations: [CATS] },
    ...extra,
  ].map((u) => [String(u._id), u]));
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
  const app = createApp({
    authService,
    healthService: createHealthService({ pingDatabase: async () => {} }),
    requestListService: createRequestListService({ lists }),
    statusTransitionService: {}, requestQueryService: {},
    log,
  });
  return { app, lists };
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

const getList = (base, cookie, qs = '') =>
  fetch(`${base}/api/v1/requests${qs}`, { headers: cookie ? { cookie } : {} });
const postSearch = (base, cookie, body) => fetch(`${base}/api/v1/requests/search`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});

test('an unauthenticated list or search is 401 and returns no request data — AC-FR-1.1, DEC-012', async () => {
  const { app, lists } = harness();
  await serve(app, async (base) => {
    for (const res of [await getList(base, null), await postSearch(base, null, { text: 'tap' })]) {
      assert.equal(res.status, 401);
      const text = await res.text();
      assert.doesNotMatch(text, /CC-2026-/);
      assert.equal(JSON.parse(text).code, 'UNAUTHENTICATED');
    }
    assert.equal(lists.calls.length, 0, 'the repository must not be reached');
  });
});

// Basis: AC-FR-3.1. Given: a requester with three requests and another user with one
// (the AC's own numbers). Expected: exactly the three, in the response body, not the fourth.
test('a requester who has submitted three requests sees those three and not the other user\'s — AC-FR-3.1, AC-FR-3.2', async () => {
  const rows = [
    { ...REQUESTS[0], requesterId: R1, status: STATUS.RECEIVED },
    { ...REQUESTS[1], requesterId: R1, status: STATUS.ASSIGNED },
    { ...REQUESTS[2], requesterId: R1, status: STATUS.IN_PROGRESS },
    { ...REQUESTS[3], requesterId: R2, status: STATUS.RECEIVED },
  ];
  const { app } = harness({ rows });
  await serve(app, async (base) => {
    const res = await getList(base, await login(base, 'req1@example.test'));
    assert.equal(res.status, 200);
    const { items, nextCursor } = await res.json();
    assert.deepEqual(refsOf(items).sort(), ['CC-2026-000001', 'CC-2026-000002', 'CC-2026-000003']);
    assert.ok(!refsOf(items).includes('CC-2026-000004'));
    assert.equal(nextCursor, null);
    // AC-FR-3.2: the current status is shown against each request.
    const shown = Object.fromEntries(items.map((i) => [i.reference, i.status]));
    assert.deepEqual(shown, {
      'CC-2026-000001': STATUS.RECEIVED, 'CC-2026-000002': STATUS.ASSIGNED, 'CC-2026-000003': STATUS.IN_PROGRESS,
    });
  });
});

// Basis: AC-FR-3.6 applied to the list. User X is a requester; user Y's request exists.
// Expected: no trace of Y's request in the body, by reference, id or text, even when X
// asks for it by filter, by search-shaped query, or with Y's category.
test('a requester\'s list never contains another user\'s request or its data — AC-FR-3.6', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'req2@example.test');                  // user X = R2
    for (const qs of ['', '?limit=100', `?categoryId=${CAT1}`, '?assigneeId=none', '?status=Received']) {
      const res = await getList(base, cookie, qs);
      assert.equal(res.status, 200);
      const text = await res.text();
      for (const r of REQUESTS.filter((x) => String(x.requesterId) === R1)) {
        assert.ok(!text.includes(r.reference), `${r.reference} (user Y's) appeared for ${qs || 'the plain list'}`);
        assert.ok(!text.includes(String(r._id)));
      }
      assert.doesNotMatch(text, /private detail|leaking tap/);
    }
  });
});

test('a staff list returns every authorised request and no other — AC-FR-4.1', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const res = await getList(base, await login(base, 'co@example.test'), '?limit=100');
    const { items } = await res.json();
    assert.deepEqual(refsOf(items).sort(),
      REQUESTS.filter((r) => mayViewRequest(r, ACTORS.coordinatorCat1)).map((r) => r.reference).sort());
    assert.equal(items.every((i) => i.categoryId === CAT1), true);
  });
});

test('a Security Officer sees the security-category requests of their category over HTTP; a coordinator does not — FR-1.5', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const so = await (await getList(base, await login(base, 'so@example.test'))).json();
    assert.deepEqual(refsOf(so.items).sort(), ['CC-2026-000006', 'CC-2026-000007']);
    const co = await (await getList(base, await login(base, 'co@example.test'))).json();
    assert.ok(!refsOf(co.items).some((r) => ['CC-2026-000006', 'CC-2026-000007'].includes(r)));
  });
});

test('the unassigned set over HTTP: present for the authorised Technician, absent for the other — AC-FR-4.6', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const a = await (await getList(base, await login(base, 'ta@example.test'), '?assigneeId=none')).json();
    const b = await (await getList(base, await login(base, 'tb@example.test'), '?assigneeId=none')).json();
    assert.ok(refsOf(a.items).includes('CC-2026-000001'));
    assert.ok(!refsOf(b.items).includes('CC-2026-000001'));
  });
});

test('status filter, newest-first order and cursor pagination work over HTTP — AC-FR-4.4, AC-FR-4.5, DEC-015 §1', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'co@example.test');
    const filtered = await (await getList(base, cookie, '?status=Received')).json();
    assert.ok(filtered.items.length > 0 && filtered.items.every((i) => i.status === STATUS.RECEIVED));

    const first = await (await getList(base, cookie, '?limit=2')).json();
    assert.equal(first.items.length, 2);
    assert.ok(first.nextCursor);
    assert.ok(first.items[0].submittedAt >= first.items[1].submittedAt);
    const second = await (await getList(base, cookie, `?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)).json();
    assert.ok(!refsOf(second.items).some((r) => refsOf(first.items).includes(r)));
    assert.ok(second.items[0].submittedAt <= first.items[1].submittedAt);
  });
});

test('malformed ids and values are 400 naming the parameter, never 500, over HTTP — DEC-015 §4', async () => {
  const { app, lists } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'co@example.test');
    for (const [qs, name] of [
      ['?categoryId=not-an-id', 'categoryId'], ['?assigneeId=zzz', 'assigneeId'],
      ['?status[]=Received', 'status'], ['?categoryId[$ne]=x', 'categoryId'],
      ['?limit=1000', 'limit'], ['?from=nope', 'from'], ['?cursor=@@@', 'cursor'],
    ]) {
      const res = await getList(base, cookie, qs);
      assert.equal(res.status, 400, qs);
      const body = await res.json();
      assert.equal(body.code, 'INVALID_REQUEST');
      assert.match(body.detail, new RegExp(`'${name}'`), qs);
    }
    const bad = await postSearch(base, cookie, { text: 'tap', categoryId: 'xyz' });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).detail, /'categoryId'/);
    assert.equal(lists.calls.length, 0);
  });
});

test('search over HTTP: staff find the term, a Requester is 403, the body carries no description — AC-FR-4.3, FR-1.5', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const res = await postSearch(base, await login(base, 'co@example.test'), { text: 'streetlight' });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.deepEqual(refsOf(JSON.parse(text).items), ['CC-2026-000004']);
    assert.doesNotMatch(text, /streetlight/);

    const refused = await postSearch(base, await login(base, 'req2@example.test'), { text: 'streetlight' });
    assert.equal(refused.status, 403);
    assert.doesNotMatch(await refused.text(), /CC-2026-/);
  });
});

// Basis: CON-007 and DEC-015 §1 (search text may be personal information and is not logged).
// Technique: the persistence fake throws an error whose message echoes the query it was
// given, as a driver may; the log sink records everything. Expected: 500 with the generic
// body, and the distinctive text appears in NO logged argument and NOT in the response.
// Also a 400 for a bad filter must not echo the text. Shows: the service does not pass a
// text-bearing error onward. Does NOT show: that the process emits no other log (access logs).
test('the search text is never logged and never echoed, even when persistence fails — CON-007', async () => {
  const secret = 'zq7-distinctive-search-term';
  const logged = [];
  const lists = { findPage: async (filter) => { throw new Error(`driver failure for ${JSON.stringify(filter)}`); } };
  const { app } = harness({ lists, log: { error: (...args) => logged.push(args.map((a) => String(a?.stack ?? a?.message ?? a)).join(' ')) } });
  await serve(app, async (base) => {
    const cookie = await login(base, 'co@example.test');
    const res = await postSearch(base, cookie, { text: secret });
    assert.equal(res.status, 500);
    assert.equal((await res.json()).code, 'INTERNAL_ERROR');
    assert.ok(logged.length > 0, 'the failure itself must still be logged');
    assert.ok(!logged.join('\n').includes(secret), 'the search text reached the log');

    const rejected = await postSearch(base, cookie, { text: secret, categoryId: 'xyz' });
    assert.equal(rejected.status, 400);
    assert.ok(!(await rejected.text()).includes(secret));
  });
});

test('both list routes carry the authorisation guard — NFR-3.3, CON-019', () => {
  const router = createRequestListRouter({ requestListService: {} });
  const routes = router.stack.filter((l) => l.route);
  assert.deepEqual(routes.map((l) => `${Object.keys(l.route.methods)[0].toUpperCase()} ${l.route.path}`),
    ['GET /', 'POST /search']);
  for (const l of routes) assert.ok(l.route.stack.some((h) => h.handle.guardName === GUARD_NAME));
});
