/**
 * Case 2 — Idempotency-Key is required, and a replay writes nothing.
 * Specification: docs/quality/M3_API_Test_Specification.md §5.
 *
 * Traces to: DEC-015 §3 and §4, FR-6.7, Assignment 2 §4.1.
 *
 * A transition POST that times out leaves the client unable to tell "committed"
 * from "never arrived". Its retry must not write a second history entry,
 * because `requestHistory` is append-only and the duplicate would be permanent.
 *
 * Expected results come from DEC-015, not from the code. These subtests are
 * expected to fail against the code as it stands (specification §2):
 *   2b  same status code, same body, replay header        D1
 *   2c  problem type idempotency-key-reused               D4
 *   2d  same key on a different request                   D3
 *   2e  same body with its members in another order       D3
 * "the replay writes nothing" is separate from them and is expected to pass.
 *
 * What this does NOT show: two requests carrying the same key at the same
 * moment, where the unique {actorId, idempotencyKey} index arbitrates.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { composeApplication } from '../../src/composition.js';
import { STATUS } from '../../src/models/_shared.js';
import {
  skip, quiet, useCluster, createFixture, createRequest, serve, login, postTransition,
  snapshot, entriesForKey, newKey, reject,
} from './_harness.js';

useCluster();

const application = () => composeApplication({ log: quiet }).app;

test('2a a transition without an Idempotency-Key is refused with 400 — DEC-015 §3', { skip }, async (t) => {
  const fixture = await createFixture();

  const { before, res, after } = await serve(application(), async (base) => {
    const cookie = await login(base, fixture);
    const before = await snapshot(fixture.requestId);
    const res = await postTransition(base, fixture.requestId,
      { cookie, ifMatch: '"v0"', body: reject('no key') });
    return { before, res, after: await snapshot(fixture.requestId) };
  });

  await t.test('the request is refused with 400', () => {
    assert.equal(res.status, 400);
    assert.match(res.headers.get('content-type') ?? '', /^application\/problem\+json/);
    assert.equal(res.body?.code, 'IDEMPOTENCY_KEY_REQUIRED');
  });

  await t.test('nothing is written', () => {
    assert.deepEqual(after.request, before.request);
    assert.equal(after.history.length, 0);
  });
});

test('2b a replayed key returns the original result and writes nothing — DEC-015 §3', { skip }, async (t) => {
  const fixture = await createFixture();
  const key = newKey();
  const command = { ifMatch: '"v0"', key, body: reject('duplicate') };

  const { original, afterOriginal, replay, afterReplay } = await serve(application(), async (base) => {
    const cookie = await login(base, fixture);
    const original = await postTransition(base, fixture.requestId, { cookie, ...command });
    const afterOriginal = await snapshot(fixture.requestId);
    const replay = await postTransition(base, fixture.requestId, { cookie, ...command });
    return { original, afterOriginal, replay, afterReplay: await snapshot(fixture.requestId) };
  });

  await t.test('the original commits', () => {
    assert.equal(original.status, 201);
    assert.equal(original.headers.get('etag'), '"v1"');
  });

  await t.test('the replay writes nothing', () => {
    assert.equal(afterReplay.history.length, 1);
    assert.equal(afterReplay.request.version, 1);
    assert.deepEqual(afterReplay.request, afterOriginal.request);
  });

  await t.test('the replay has the same status code', () => {
    assert.equal(replay.status, original.status);
  });

  await t.test('the replay has the same body', () => {
    assert.deepEqual(replay.body, original.body);
  });

  await t.test('the replay is marked Idempotent-Replayed: true', () => {
    assert.equal(replay.headers.get('idempotent-replayed'), 'true');
  });
});

test('2c a key reused with a different body is refused with 422 — DEC-015 §3', { skip }, async (t) => {
  const fixture = await createFixture();
  const key = newKey();

  const { reused, after } = await serve(application(), async (base) => {
    const cookie = await login(base, fixture);
    await postTransition(base, fixture.requestId, { cookie, ifMatch: '"v0"', key, body: reject('duplicate') });
    const reused = await postTransition(base, fixture.requestId,
      { cookie, ifMatch: '"v0"', key, body: reject('something else') });
    return { reused, after: await snapshot(fixture.requestId) };
  });

  await t.test('the request is refused with 422', () => {
    assert.equal(reused.status, 422);
  });

  await t.test('the problem type is idempotency-key-reused', () => {
    assert.match(String(reused.body?.type), /idempotency-key-reused$/);
  });

  await t.test('no second history entry is written', () => {
    assert.equal(after.history.length, 1);
  });
});

test('2d a key used on one request is refused on a different request — DEC-015 §3 fingerprint', { skip }, async (t) => {
  const fixture = await createFixture();
  const other = await createRequest(fixture);
  const otherId = String(other._id);
  const key = newKey();
  const command = { ifMatch: '"v0"', key, body: reject('duplicate') };

  const { crossed, firstAfter, otherAfter } = await serve(application(), async (base) => {
    const cookie = await login(base, fixture);
    await postTransition(base, fixture.requestId, { cookie, ...command });
    const crossed = await postTransition(base, otherId, { cookie, ...command });
    return {
      crossed,
      firstAfter: await snapshot(fixture.requestId),
      otherAfter: await snapshot(otherId),
    };
  });

  await t.test('the request is refused with 422', () => {
    // The fingerprint includes the path, so this is a different request under a used key.
    assert.equal(crossed.status, 422);
  });

  await t.test("the response is not the first request's result", () => {
    assert.notEqual(crossed.body?.requestId, fixture.requestId);
  });

  await t.test('neither request gains a history entry', async () => {
    assert.equal(firstAfter.history.length, 1);
    assert.equal(otherAfter.history.length, 0);
    assert.equal(otherAfter.request.status, STATUS.RECEIVED);
    assert.equal((await entriesForKey(fixture.user._id, key)).length, 1);
  });
});

test('2e the same body with its members in another order is a replay — DEC-015 §3 canonical JSON', { skip }, async (t) => {
  const fixture = await createFixture();
  const key = newKey();
  const reason = 'duplicate';

  const { reordered, after } = await serve(application(), async (base) => {
    const cookie = await login(base, fixture);
    await postTransition(base, fixture.requestId,
      { cookie, ifMatch: '"v0"', key, body: { toStatus: STATUS.REJECTED, reason } });
    const reordered = await postTransition(base, fixture.requestId,
      { cookie, ifMatch: '"v0"', key, body: { reason, toStatus: STATUS.REJECTED } });
    return { reordered, after: await snapshot(fixture.requestId) };
  });

  await t.test('it is not refused as a different payload', () => {
    assert.notEqual(reordered.status, 422);
  });

  await t.test('no second history entry is written', () => {
    assert.equal(after.history.length, 1);
  });
});
