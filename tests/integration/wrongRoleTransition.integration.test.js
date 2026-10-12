/**
 * Case 4 — a role not permitted for a transition is refused with 403.
 * Specification: docs/quality/M3_API_Test_Specification.md §2, difference D5.
 *
 * Traces to: DEC-015 §4 (403: authenticated, operation not permitted for role),
 * FR-1.3, FR-6.4, FR-6.6, NFR-3.3. Defect Register DEF-011.
 *
 * A Technician may attempt transitions, and is authorised for the request's
 * category, so the route boundary and the object-level check both let the
 * request through. Rejecting a request is reserved to a Coordinator or a
 * Manager (FR-6.6), so the refusal comes from the role check in
 * `checkTransition`. The move itself, Received to Rejected, is a legal one:
 * only the role is wrong.
 *
 * Expected results come from DEC-015, not from the code. "the request is
 * refused with 403" is expected to fail against the code as it stands, which
 * answers 422 INVALID_TRANSITION (difference D5).
 *
 * What this does NOT show: the refusal of a member of staff who is not
 * authorised for the request's category. That is a different check
 * (`mayActOnRequest`) and already answers 403.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { composeApplication } from '../../src/composition.js';
import { ROLE, STATUS } from '../../src/models/_shared.js';
import {
  skip, quiet, useCluster, createFixture, serve, login, postTransition, snapshot,
  newKey, reject,
} from './_harness.js';

useCluster();

test('a role not permitted for the transition is refused with 403 — DEC-015 §4', { skip }, async (t) => {
  const fixture = await createFixture({ roles: [ROLE.TECHNICIAN] });
  const { app } = composeApplication({ log: quiet });

  const { refused, before, after } = await serve(app, async (base) => {
    const cookie = await login(base, fixture);
    const before = await snapshot(fixture.requestId);
    const refused = await postTransition(base, fixture.requestId,
      { cookie, ifMatch: '"v0"', key: newKey(), body: reject('not mine to reject') });
    const after = await snapshot(fixture.requestId);
    return { refused, before, after };
  });

  await t.test('the request is refused with 403', () => {
    assert.equal(refused.status, 403);
  });

  await t.test('the refusal is problem details', () => {
    assert.match(refused.headers.get('content-type') ?? '', /^application\/problem\+json/);
    assert.equal(refused.body?.status, refused.status);
  });

  await t.test('the request is unchanged', () => {
    assert.deepEqual(after.request, before.request);
    assert.equal(after.request.status, STATUS.RECEIVED);
    assert.equal(after.request.version, 0);
  });

  await t.test('no history entry is written', () => {
    assert.equal(after.history.length, 0);
  });

  await t.test('nothing internal is returned', () => {
    assert.doesNotMatch(refused.text, /Mongo|\n\s+at /);
  });
});
