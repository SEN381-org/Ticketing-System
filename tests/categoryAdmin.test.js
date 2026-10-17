/**
 * Category target time and deactivation (DEC-015 Addendum A, A7 and A8).
 *
 * Traces to: AC-FR-8.4, AC-FR-9.1, AC-FR-9.2, FR-1.3, DEC-012, DEC-015 Addendum A.
 *
 * Basis: AC-FR-8.4 ("the value is stored"), AC-FR-9.1 ("the category is no longer
 * selectable on the submission form"), the Addendum's status codes. The category
 * list route (A1) belongs to another track, so "no longer selectable" is shown at
 * the repository the list reads: `active` is false and a filter on `active` (what A1
 * applies) excludes it. That the form itself hides it is not shown here.
 *
 * What this does NOT show: the real Category model's `min: 1` bound is enforced by
 * the service before the repository is called; the Mongoose update validator is not
 * exercised without a database.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ROLE } from '../src/models/_shared.js';
import { createCategoryAdminService } from '../src/services/categoryAdminService.js';
import { AuthorisationError, NotFoundError, ValidationError } from '../src/errors.js';
import { CAT, CAMPUS, USER, harness, serve, login, send } from './managementHarness.js';

const TARGET = (id = CAT.lights) => `/categories/${id}/target`;
const DEACT = (id = CAT.lights) => `/categories/${id}/deactivation`;
const MISSING = 'dd0000000000000000000009';

test('A7 / AC-FR-8.4: a Manager sets the target and the value is stored — 200', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const res = await send(base, 'PUT', TARGET(), {
      cookie: await login(base, 'mgr@example.test'), body: { targetResolutionHours: 72 } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: CAT.lights, targetResolutionHours: 72 });
    assert.equal(store.categories.get(CAT.lights).targetResolutionHours, 72);
  });
});

test('A7: 400 for a target below 1, missing, not a number, an unknown field, or a malformed id; 400 without Idempotency-Key — DEC-015 Addendum A', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'mgr@example.test');
    for (const body of [{ targetResolutionHours: 0 }, { targetResolutionHours: -5 }, {},
      { targetResolutionHours: '48' }, { targetResolutionHours: 48, extra: 1 }]) {
      const res = await send(base, 'PUT', TARGET(), { cookie, body });
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal((await res.json()).code, 'INVALID_REQUEST');
    }
    assert.equal((await send(base, 'PUT', TARGET('xyz'), { cookie, body: { targetResolutionHours: 5 } })).status, 400);

    const noKey = await send(base, 'PUT', TARGET(), { cookie, body: { targetResolutionHours: 5 }, key: null });
    assert.equal(noKey.status, 400);
    assert.equal((await noKey.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');
    assert.equal(store.categories.get(CAT.lights).targetResolutionHours, null, 'nothing was stored');
  });
});

test('A7: 404 for an unknown category, 401 without a session — DEC-015 Addendum A', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const res = await send(base, 'PUT', TARGET(MISSING), {
      cookie: await login(base, 'mgr@example.test'), body: { targetResolutionHours: 5 } });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, 'NOT_FOUND');
    assert.equal((await send(base, 'PUT', TARGET(), { body: { targetResolutionHours: 5 } })).status, 401);
  });
});

// Basis: OPERATION_RULES 'category:set-target' = Manager only (FR-8.4 names the Manager); DEC-012 point 1.
test('A7: category:set-target is 403 for every role except Manager, and nothing is stored — FR-8.4, FR-1.3', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    for (const email of ['req@example.test', 'tech@example.test', 'coord@example.test',
      'sec@example.test', 'admin@example.test']) {
      const res = await send(base, 'PUT', TARGET(), {
        cookie: await login(base, email), body: { targetResolutionHours: 5 } });
      assert.equal(res.status, 403, email);
    }
    assert.equal(store.categories.get(CAT.lights).targetResolutionHours, null);
  });
});

test('A8 / AC-FR-9.1: an Administrator deactivates an active category — 201, and the active-only list no longer holds it', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const res = await send(base, 'POST', DEACT(), { cookie: await login(base, 'admin@example.test') });
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { id: CAT.lights, active: false });
    assert.equal(store.categories.get(CAT.lights).active, false);
    const selectable = [...store.categories.values()].filter((c) => c.active).map((c) => c._id);
    assert.ok(!selectable.includes(CAT.lights), 'not selectable');
    assert.ok(selectable.includes(CAT.roads), 'the others are unaffected');
  });
});

test('A8 / DEC-015 §3: a repeated deactivation returns the original 201 and body with Idempotent-Replayed and changes nothing — idempotent', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    const first = await send(base, 'POST', DEACT(), { cookie });
    assert.equal(first.status, 201);
    assert.equal(first.headers.get('idempotent-replayed'), null);
    const again = await send(base, 'POST', DEACT(), { cookie });
    assert.equal(again.status, 201);
    assert.equal(again.headers.get('idempotent-replayed'), 'true');
    assert.deepEqual(await again.json(), { id: CAT.lights, active: false });
    assert.equal(store.categories.get(CAT.lights).active, false);
    // An already-inactive seed category replays too.
    const old = await send(base, 'POST', DEACT(CAT.old), { cookie });
    assert.equal(old.status, 201);
    assert.equal(old.headers.get('idempotent-replayed'), 'true');
  });
});

test('A8: 400 for a malformed id or a missing Idempotency-Key, 404 for an unknown category, 401 without a session', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    assert.equal((await send(base, 'POST', DEACT('nope'), { cookie })).status, 400);
    const noKey = await send(base, 'POST', DEACT(), { cookie, key: null });
    assert.equal(noKey.status, 400);
    assert.equal((await noKey.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');
    assert.equal(store.categories.get(CAT.lights).active, true);
    assert.equal((await send(base, 'POST', DEACT(MISSING), { cookie })).status, 404);
    assert.equal((await send(base, 'POST', DEACT(), {})).status, 401);
  });
});

// Basis: OPERATION_RULES 'category:administer' = Administrator only (FR-9.1 names the Administrator).
test('A8: category:administer is 403 for every role except Administrator, and the category stays active — FR-9.1, FR-1.3', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    for (const email of ['req@example.test', 'tech@example.test', 'coord@example.test',
      'sec@example.test', 'mgr@example.test']) {
      assert.equal((await send(base, 'POST', DEACT(), { cookie: await login(base, email) })).status, 403, email);
    }
    assert.equal(store.categories.get(CAT.lights).active, true);
  });
});

test('service layer refuses a wrong role without reaching the repository — DEC-012 point 2', async () => {
  let touched = false;
  const repo = new Proxy({}, { get: () => async () => { touched = true; return null; } });
  const service = createCategoryAdminService({ categories: repo });
  const requester = { id: USER.req, roles: [ROLE.REQUESTER], campusId: CAMPUS };
  await assert.rejects(service.setTarget(CAT.roads, { targetResolutionHours: 5 }, requester), AuthorisationError);
  await assert.rejects(service.deactivate(CAT.roads, requester), AuthorisationError);
  assert.equal(touched, false);
});

test('service: a missing category is NotFoundError and a bad target is ValidationError', async () => {
  const repo = { setTarget: async () => false, findById: async () => null };
  const service = createCategoryAdminService({ categories: repo });
  const manager = { id: USER.mgr, roles: [ROLE.MANAGER], campusId: CAMPUS };
  await assert.rejects(service.setTarget(CAT.roads, { targetResolutionHours: 5 }, manager), NotFoundError);
  await assert.rejects(service.setTarget(CAT.roads, { targetResolutionHours: 0.5 }, manager), ValidationError);
});
