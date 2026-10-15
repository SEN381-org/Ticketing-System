/**
 * Case 3 — a failure inside the transaction persists neither write.
 * Specification: docs/quality/M3_API_Test_Specification.md §6.
 *
 * Traces to: AC-NFR-1.10 v0.3 (CR-001), DEC-016 decisions 1 and 3, FR-6.3,
 *            FR-6.7, CON-017.
 *
 * The status change and its history entry must commit together or not at all.
 * The M2 test for this asserted only the order of the two writes, and still
 * passed with the history write moved outside the transaction. This one runs
 * against a real cluster with the real request repository and the real unit of
 * work, and looks at what is stored.
 *
 * The fault is a wrapper around the real history repository. It performs the
 * real insert inside the transaction, reads the request back through the same
 * session, and then throws: after both writes, before commit. The read-back is
 * what stops the case passing trivially, because a fault that fired before any
 * write would also leave both collections unchanged.
 *
 * What this does NOT show: that no auditLog entry appears for the aborted
 * transition (AC-NFR-1.10 v0.3 also requires it, but it depends on the Atlas
 * trigger, which is not deployed to the test cluster); a process death or a
 * dropped connection mid-transaction; a withTransaction retry on a transient
 * error.
 */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';

import { composeApplication } from '../../src/composition.js';
import { createApp } from '../../src/app.js';
import { createUnitOfWork } from '../../src/infrastructure/unitOfWork.js';
import { requestRepository } from '../../src/repositories/requestRepository.js';
import { historyRepository } from '../../src/repositories/historyRepository.js';
import { createStatusTransitionService } from '../../src/services/statusTransitionService.js';
import { EVENTS, subscribe, resetSubscriptions } from '../../src/events/requestEvents.js';
import { STATUS } from '../../src/models/_shared.js';
import {
  skip, quiet, useCluster, createFixture, serve, login, postTransition, snapshot,
  entriesForKey, newKey, reject,
} from './_harness.js';

useCluster();
after(() => resetSubscriptions());

const FAULT_MESSAGE = 'injected fault before commit';

/** The production graph, except that the history repository can be made to fail after its insert. */
function applicationWithFault(probe) {
  const faultyHistory = {
    ...historyRepository,
    append: async (entry, options) => {
      const created = await historyRepository.append(entry, options);
      probe.seenInside = await requestRepository.findById(entry.requestId, options);
      if (probe.armed) throw new Error(FAULT_MESSAGE);
      return created;
    },
  };
  const { services } = composeApplication({ log: quiet });
  return createApp({
    authService:   services.authService,
    healthService: services.healthService,
    statusTransitionService: createStatusTransitionService({
      requests: requestRepository, history: faultyHistory, unitOfWork: createUnitOfWork(),
    }),
    log: quiet,
  });
}

test('a failure after both writes and before commit persists neither — AC-NFR-1.10 v0.3, DEC-016', { skip }, async (t) => {
  const fixture = await createFixture();
  const probe = { armed: false, seenInside: null };
  const key = newKey();
  const command = { ifMatch: '"v0"', key, body: reject('fault injection') };

  const published = [];
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'transaction-boundary-test', 'AC-NFR-1.10', (payload) => {
    if (String(payload.requestId) === fixture.requestId) published.push(payload);
  });

  const run = await serve(applicationWithFault(probe), async (base) => {
    const cookie = await login(base, fixture);
    const before = await snapshot(fixture.requestId);

    probe.armed = true;
    const failed = await postTransition(base, fixture.requestId, { cookie, ...command });
    const seenInside = probe.seenInside;
    const afterFault = await snapshot(fixture.requestId);
    const keyedAfterFault = await entriesForKey(fixture.user._id, key);
    const publishedAfterFault = published.length;

    probe.armed = false;
    const retried = await postTransition(base, fixture.requestId, { cookie, ...command });
    const afterRetry = await snapshot(fixture.requestId);

    return { before, failed, seenInside, afterFault, keyedAfterFault, publishedAfterFault, retried, afterRetry };
  });

  await t.test('the fault fires after the first write', () => {
    assert.equal(run.seenInside?.status, STATUS.REJECTED);
    assert.equal(run.seenInside?.version, 1);
  });

  await t.test('the failure is a generic 500', () => {
    assert.equal(run.failed.status, 500);
    assert.equal(run.failed.body?.code, 'INTERNAL_ERROR');
    assert.equal(run.failed.text.includes(FAULT_MESSAGE), false);
  });

  await t.test('the status change is rolled back', () => {
    assert.deepEqual(run.afterFault.request, run.before.request);
    assert.equal(run.afterFault.request.status, STATUS.RECEIVED);
    assert.equal(run.afterFault.request.version, 0);
  });

  await t.test('the history entry is rolled back', () => {
    assert.equal(run.afterFault.history.length, 0);
    assert.equal(run.keyedAfterFault.length, 0);
  });

  await t.test('no event is published', () => {
    assert.equal(run.publishedAfterFault, 0);
  });

  await t.test('the same key then succeeds', () => {
    assert.equal(run.retried.status, 201);
    assert.equal(run.retried.headers.get('etag'), '"v1"');
    assert.equal(run.afterRetry.history.length, 1);
    assert.equal(published.length, 1);
  });
});
