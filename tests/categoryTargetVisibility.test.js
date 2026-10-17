/**
 * GET /api/v1/categories and the resolution target - S4 (A7 of the local walkthrough).
 *
 * Traces to: FR-8.4, FR-9.1, FR-2.3, FR-1.3, DEC-012, DEC-015 Addendum A (A1, A7).
 *
 * Basis: the Manager sets the target (category:set-target, FR-8.4) and the Administrator
 * administers categories (category:administer, FR-9.1), yet the list returned
 * { id, code, name, isSecurity } and so hid the current target from both. Decision
 * (walkthrough): the list adds `targetResolutionHours` for an actor holding either of
 * those two operations, and for no one else. Expected values come from that decision
 * and the seeded targets (ROADS 48, LIGHTS unset, SECURITY 24), written before the run.
 *
 * What this does NOT show: that a target is meaningful to a requester (it is withheld
 * because the form does not need it), or the real query.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CAT, harness, serve, login, getJson } from './managementHarness.js';

const FORM_KEYS = ['code', 'id', 'isSecurity', 'name'];
const WITH_TARGET = [...FORM_KEYS, 'targetResolutionHours'];
const listAs = async (base, email) => (await getJson(base, '/categories', await login(base, email))).json();

// Technique: every FR-1.2 role lists the categories. Expected: Manager and Administrator
// receive the target for every category (null where none is set); the other four roles
// receive exactly the form keys and the text of the response contains no target at all.
// Shows: who sees the target, over real HTTP. Does NOT show: the set-target write (A7 tests).
test('A1: targetResolutionHours is returned to the Manager and the Administrator and to no one else - FR-8.4, FR-9.1, DEC-012, NV-166', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const targets = new Map([[CAT.roads, 48], [CAT.lights, null], [CAT.security, 24]]);
    for (const email of ['mgr@example.test', 'admin@example.test']) {
      const list = await listAs(base, email);
      assert.deepEqual(list.map((c) => c.id).sort(), [CAT.roads, CAT.lights, CAT.security].sort(), email);
      for (const c of list) {
        assert.deepEqual(Object.keys(c).sort(), WITH_TARGET, `${email} ${c.code}`);
        assert.equal(c.targetResolutionHours, targets.get(c.id), `${email} ${c.code}`);
      }
    }
    for (const email of ['req@example.test', 'tech@example.test', 'coord@example.test', 'sec@example.test']) {
      const res = await getJson(base, '/categories', await login(base, email));
      const text = await res.text();
      assert.doesNotMatch(text, /targetResolutionHours/, email);
      for (const c of JSON.parse(text)) assert.deepEqual(Object.keys(c).sort(), FORM_KEYS, email);
    }
  });
});

test('A1: the list still holds only the active categories of the campus - FR-9.1', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const list = await listAs(base, 'mgr@example.test');
    assert.equal(list.some((c) => c.id === CAT.old), false, 'the deactivated category is not listed');
  });
});
