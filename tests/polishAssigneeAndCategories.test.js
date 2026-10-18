/**
 * Polish pass (server): the assignee's name for the roles that assign, and the
 * category list for the Administrator and in A-Z order.
 *
 * Traces to: FR-5.1, FR-4.1, FR-2.3, FR-9.1, FR-9.2, DEC-012, DEC-015 Addendum A (A1).
 *
 * Basis: `request:assign` is held by the Coordinator and the Manager (OPERATION_RULES);
 * they need to see who a request is assigned to. `category:administer` is held by the
 * Administrator (FR-9.1) and a deactivated category stays on record (FR-9.2) but is not
 * selectable (FR-2.3). Expected values were written from those rules before the run.
 *
 * What this does NOT show: the real User query, or a real cluster's collation (the
 * sort is done in the service, so it holds whatever the store returns).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRequestQueryService } from '../src/services/requestQueryService.js';
import { createRequestListService } from '../src/services/requestListService.js';
import { createCategoryService } from '../src/services/categoryService.js';
import { ROLE, STATUS } from '../src/models/_shared.js';
import { REQUESTS, ACTORS, fakeLists, TA, TB } from './requestListFixtures.js';
import { CAT, CAMPUS, harness, serve, login, getJson } from './managementHarness.js';

const NAMES = new Map([[String(TA), 'Alice Technician'], [String(TB), 'Bob Technician']]);
const fakeUsers = () => {
  const calls = [];
  return {
    calls,
    findDisplayNames: async (ids) => {
      calls.push([...ids]);
      return ids.filter((id) => NAMES.has(String(id))).map((id) => ({ _id: id, displayName: NAMES.get(String(id)) }));
    },
  };
};

// ---------- GET /requests/:id ----------

const CAT_ID = 'cat1';
const doc = (assigneeId) => ({
  reference: 'CC-2026-000001', status: STATUS.ASSIGNED, version: 3, categoryId: CAT_ID, securityCategory: false,
  requesterId: 'u2', submittedById: 'u2', submittedAt: new Date('2026-10-01T08:00:00Z'), assigneeId,
  location: 'L', description: 'D', resolution: {}, closure: {},
});
const readAs = (roles, assigneeId, users = fakeUsers(), id = 'u1') =>
  createRequestQueryService({ requests: { findById: async () => doc(assigneeId) }, users })
    .getRequest('r1', { id, roles, categoryAuthorisations: [CAT_ID] });

// Basis: request:assign holders are the Coordinator and the Manager. Technique: one assigned
// request read by the Coordinator and the Manager. Expected: each receives assigneeName =
// the assignee's displayName. Shows: who receives the name. Does NOT show: HTTP serialisation.
test('GET /requests/:id: assigneeName goes to the Coordinator and the Manager - FR-5.1, DEC-012, NV-171', async () => {
  for (const role of [ROLE.COORDINATOR, ROLE.MANAGER]) {
    const v = await readAs([role], TA);
    assert.equal(v.assigneeName, 'Alice Technician', role);
  }
});

// Technique: the same request read by the Requester (its own) and the Technician. Expected:
// no assigneeName key, the name appears nowhere in the response, and no lookup is made.
test('GET /requests/:id: a Requester and a Technician never receive assigneeName, and cause no lookup - FR-5.1, DEC-012, NV-171', async () => {
  for (const [role, id] of [[ROLE.REQUESTER, 'u2'], [ROLE.TECHNICIAN, 'u1']]) {
    const users = fakeUsers();
    const v = await readAs([role], TA, users, id);
    assert.equal(Object.hasOwn(v, 'assigneeName'), false, role);
    assert.doesNotMatch(JSON.stringify(v), /Alice Technician/, role);
    assert.equal(users.calls.length, 0, `${role}: no lookup is made`);
  }
});

test('GET /requests/:id: assigneeName is null for a Coordinator when the request is unassigned - FR-5.1', async () => {
  const users = fakeUsers();
  const v = await readAs([ROLE.COORDINATOR], null, users);
  assert.equal(v.assigneeName, null);
  assert.equal(users.calls.length, 0);
});

// ---------- GET /requests ----------

// Technique: the whole fixture listed in one page by the Manager. Expected: every item
// carries assigneeName (the name where assigned, null where not), from ONE lookup per page.
test('GET /requests: items carry assigneeName for a Manager, from one lookup per page - FR-4.1, FR-5.1, DEC-012, NV-171', async () => {
  const users = fakeUsers();
  const service = createRequestListService({ lists: fakeLists(REQUESTS), users });
  const { items } = await service.list({ limit: 100 }, ACTORS.managerAll);
  assert.ok(items.length > 3);
  for (const i of items) {
    const expected = i.assigneeId == null ? null : NAMES.get(i.assigneeId);
    assert.ok(Object.hasOwn(i, 'assigneeName'), i.reference);
    assert.equal(i.assigneeName, expected, i.reference);
  }
  assert.ok(items.some((i) => i.assigneeName === 'Alice Technician'));
  assert.equal(users.calls.length, 1, 'one batched lookup for the page, not one per item');
  assert.equal(new Set(users.calls[0]).size, users.calls[0].length, 'ids are de-duplicated');
});

test('GET /requests: a Requester, a Technician and a Security Officer never receive assigneeName - FR-4.1, FR-5.1, DEC-012, NV-171', async () => {
  for (const actor of [ACTORS.requester1, ACTORS.technicianCat1, ACTORS.securityOfficer]) {
    const users = fakeUsers();
    const { items } = await createRequestListService({ lists: fakeLists(REQUESTS), users }).list({ limit: 100 }, actor);
    assert.ok(items.length > 0);
    for (const i of items) assert.equal(Object.hasOwn(i, 'assigneeName'), false, i.reference);
    assert.equal(users.calls.length, 0);
  }
});

// ---------- GET /categories ----------

const cat = (id, name, extra = {}) => ({ _id: id, code: name.toUpperCase().slice(0, 6), name, isSecurity: false, active: true, ...extra });
const repo = (rows) => ({
  listActive: async () => rows.filter((c) => c.active).map((c) => ({ ...c })),
  listAll: async () => rows.map((c) => ({ ...c })),
});
const admin = { id: 'a1', roles: [ROLE.ADMINISTRATOR], campusId: CAMPUS };
const other = (role) => ({ id: 'o1', roles: [role], campusId: CAMPUS });

// Basis: FR-9.2 (deactivated, never deleted), FR-2.3 (only active are selectable), the decision
// of 17/10/2026. Expected: the Administrator gets all four with `active`; every other FR-1.2
// role gets the three active ones, with no `active` key and no trace of the inactive one.
test('GET /categories: only the Administrator receives deactivated categories, with active - FR-9.1, FR-9.2, FR-2.3, NV-172', async () => {
  const rows = [cat('1', 'Roads'), cat('2', 'Lights'), cat('3', 'Parks'), cat('4', 'Old', { active: false })];
  const service = createCategoryService({ categories: repo(rows) });
  const all = await service.listActive(admin);
  assert.deepEqual(all.map((c) => [c.name, c.active]), [['Lights', true], ['Old', false], ['Parks', true], ['Roads', true]]);
  for (const role of Object.values(ROLE).filter((r) => r !== ROLE.ADMINISTRATOR)) {
    const list = await service.listActive(other(role));
    assert.deepEqual(list.map((c) => c.name), ['Lights', 'Parks', 'Roads'], role);
    assert.doesNotMatch(JSON.stringify(list), /"active"|Old/, role);
  }
});

// Technique: names that differ in case, returned by the store in binary order (upper case
// before lower: 'IT support' < 'Zoning' < 'drainage'). Expected: A-Z ignoring case, i.e.
// drainage, IT support, Roads, Zoning, for the Requester's list and the Administrator's.
test('GET /categories: names are sorted A-Z ignoring case - DEC-015 Addendum A (A1)', async () => {
  const rows = [cat('1', 'IT support'), cat('2', 'Zoning'), cat('3', 'drainage'), cat('4', 'Roads')];
  const service = createCategoryService({ categories: repo(rows) });
  const expected = ['drainage', 'IT support', 'Roads', 'Zoning'];
  assert.deepEqual((await service.listActive(other(ROLE.REQUESTER))).map((c) => c.name), expected);
  assert.deepEqual((await service.listActive(admin)).map((c) => c.name), expected);
});

test('GET /categories over HTTP: the Administrator sees the deactivated category with active, a Requester does not - FR-9.1, FR-2.3, NV-172', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const asAdmin = await (await getJson(base, '/categories', await login(base, 'admin@example.test'))).json();
    const old = asAdmin.find((c) => c.id === CAT.old);
    assert.ok(old, 'the deactivated category is listed for the Administrator');
    assert.equal(old.active, false);
    assert.ok(asAdmin.filter((c) => c.id !== CAT.old).every((c) => c.active === true));
    const text = await (await getJson(base, '/categories', await login(base, 'req@example.test'))).text();
    assert.doesNotMatch(text, /"active"/);
    assert.equal(JSON.parse(text).some((c) => c.id === CAT.old), false);
  });
});
