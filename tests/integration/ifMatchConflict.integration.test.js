/**
 * Case 1 — a stale If-Match returns 412 and changes nothing.
 * Specification: docs/quality/M3_API_Test_Specification.md §4.
 *
 * Traces to: DEC-015 §2, DEC-016 decision 4, FR-6.2, Assignment 2 §3.4.
 *
 * Two members of staff hold the same version of a request. The first commits.
 * The second, still presenting the old ETag, must be refused, and the refusal
 * must write nothing: a history entry for the losing change could never be
 * removed (FR-6.7).
 *
 * Expected results come from DEC-015, not from the code. "the problem body
 * carries the current ETag" is expected to fail against the code as it stands
 * (difference D2 in the specification).
 *
 * What this does NOT show: two transactions racing on the same version. This is
 * a sequential stale write.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { composeApplication } from '../../src/composition.js';
import {
  skip, quiet, useCluster, createFixture, serve, login, postTransition, snapshot,
  newKey, reject, leafValues,
} from './_harness.js';

useCluster();

test('a stale If-Match is refused with 412 and changes nothing — DEC-015 §2, DEC-016', { skip }, async (t) => {
  const fixture = await createFixture();
  const { app } = composeApplication({ log: quiet });
  const staleKey = newKey();

  const { first, stale, before, after } = await serve(app, async (base) => {
    const cookie = await login(base, fixture);
    const first = await postTransition(base, fixture.requestId,
      { cookie, ifMatch: '"v0"', key: newKey(), body: reject('first') });
    const before = await snapshot(fixture.requestId);
    const stale = await postTransition(base, fixture.requestId,
      { cookie, ifMatch: '"v0"', key: staleKey, body: reject('second') });
    const after = await snapshot(fixture.requestId);
    return { first, stale, before, after };
  });

  await t.test('the first change commits', () => {
    assert.equal(first.status, 201);
    assert.equal(first.headers.get('etag'), '"v1"');
  });

  await t.test('the stale request is refused with 412', () => {
    assert.equal(stale.status, 412);
    assert.match(stale.headers.get('content-type') ?? '', /^application\/problem\+json/);
    assert.equal(stale.body?.code, 'PRECONDITION_FAILED');
  });

  await t.test('the request is unchanged', () => {
    assert.deepEqual(after.request, before.request);
    assert.equal(after.request.closure.reason, 'first');
    assert.equal(after.request.version, 1);
  });

  await t.test('no history entry is written', () => {
    assert.equal(after.history.length, 1);
    assert.equal(after.history.some((entry) => entry.idempotencyKey === staleKey), false);
  });

  await t.test('the problem body carries the current ETag', () => {
    // DEC-015 §2 does not name the member, so the value is looked for in any of them.
    assert.ok(leafValues(stale.body).includes('"v1"'),
      `no member of the 412 body is the current ETag "v1": ${stale.text}`);
  });

  await t.test('nothing internal is returned', () => {
    assert.doesNotMatch(stale.text, /Mongo|\n\s+at /);
  });
});
