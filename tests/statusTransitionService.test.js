/**
 * Verification evidence for FR-6.7, DEC-011, DEC-015 and DEC-016.
 * Referenced from PED §7.5 and the RTM verification column for FR-6.2, FR-6.3,
 * FR-6.4, FR-6.7, NFR-1.10.
 *
 * Collaborators — including the unit of work — are injected, so the ordering,
 * atomicity and authorisation decisions are verified without a database.
 * Rollback itself is a database guarantee and is verified at M3 by fault
 * injection against a test cluster (AC-NFR-1.10 v0.3, CR-001).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createStatusTransitionService } from '../src/services/statusTransitionService.js';
import { EVENTS, subscribe, listSubscriptions, resetSubscriptions, setFailureReporter }
  from '../src/events/requestEvents.js';
import { STATUS, ROLE } from '../src/domain/requestStatus.js';
import { AuthorisationError, PreconditionFailedError, TransitionError,
         IdempotencyConflictError } from '../src/errors.js';

const CAT = 'cat-1';
const ACTOR = { id: 'user-9', roles: [ROLE.TECHNICIAN], categoryAuthorisations: [CAT] };
const AT = new Date('2026-09-30T10:00:00.000Z');

function harness({
  status = STATUS.ASSIGNED, categoryId = CAT, version = 3,
  securityCategory = false, failAppend = false, prior = null,
} = {}) {
  const calls = [];
  const appended = [];
  let committed = false;

  const requests = {
    findById: async () => ({
      _id: 'req-1', status, version, categoryId, campusId: 'campus-1',
      requesterId: 'user-1', reference: 'CC-2026-000123', securityCategory,
      resolution: { summary: null },
    }),
    applyChange: async (id, expected) => { calls.push(`status:${expected}->${expected + 1}`); return { version: expected + 1 }; },
  };

  const history = {
    append: async (entry) => {
      calls.push('history');
      if (failAppend) throw new Error('history write failed');
      appended.push(entry);
      return { _id: 'hist-1' };
    },
    findByIdempotencyKey: async () => prior,
  };

  // A fake unit of work: runs the callback, and records whether it completed.
  const unitOfWork = {
    run: async (work) => { await work('session-1'); committed = true; },
  };

  const service = createStatusTransitionService({ requests, history, unitOfWork, clock: () => AT });
  return { service, calls, appended, didCommit: () => committed };
}

test.beforeEach(() => resetSubscriptions());

test('a permitted transition writes exactly one history entry', async () => {
  const { service, appended } = harness();
  await service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3 });
  assert.equal(appended.length, 1);
});

test('the entry records the acting user, both statuses and the version it produced — AC-FR-6.7', async () => {
  const { service, appended } = harness();
  await service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3, reason: 'starting' });

  const e = appended[0];
  assert.equal(e.changeType, 'status');
  assert.equal(e.fromStatus, STATUS.ASSIGNED);
  assert.equal(e.toStatus, STATUS.IN_PROGRESS);
  assert.equal(e.actorId, ACTOR.id);
  assert.equal(e.actorRole, ROLE.TECHNICIAN);
  assert.equal(e.requestVersion, 4, 'the entry carries the version the change produced');
  assert.equal(e.campusId, 'campus-1');
  assert.equal(e.occurredAt, AT);
});

test('the status change and the history entry are one unit of work — DEC-016', async () => {
  const { service, calls } = harness();
  let published = false;
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'probe', 'test', () => { published = true; });

  await service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3 });

  assert.deepEqual(calls, ['status:3->4', 'history']);
  assert.equal(published, true);
});

test('publication happens after the transaction resolves, not inside it — R-16', async () => {
  const order = [];
  const requests = {
    findById: async () => ({ _id: 'r', status: STATUS.ASSIGNED, version: 1, categoryId: CAT,
                             campusId: 'c', requesterId: 'u', reference: 'CC-2026-000001',
                             securityCategory: false, resolution: {} }),
    applyChange: async () => ({ version: 2 }),
  };
  const history = { append: async () => ({ _id: 'h' }), findByIdempotencyKey: async () => null };
  const unitOfWork = { run: async (work) => { await work('s'); order.push('commit'); } };

  const service = createStatusTransitionService({ requests, history, unitOfWork, clock: () => AT });
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'probe', 'test', () => order.push('publish'));

  await service.transition('r', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 1 });
  assert.deepEqual(order, ['commit', 'publish']);
});

test('a failed history append publishes nothing — R-15', async () => {
  const { service } = harness({ failAppend: true });
  let published = false;
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'probe', 'test', () => { published = true; });

  await assert.rejects(
    () => service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3 }),
    /history write failed/,
  );
  assert.equal(published, false, 'no event may be published for a transition that did not commit');
});

/*
 * DEC-016 atomicity, FR-6.3. The ordering test above asserts only the ORDER of
 * the two writes, so it would still pass if the history write were moved outside
 * the unit of work — the atomicity it was cited for was not verified (found in
 * E. Lindsay's review of the RTM v0.7 cells, posted on PR #67). A fake unit of
 * work cannot roll anything back; what it
 * can prove is that the service performs both writes inside the unit of work,
 * with its session, and that nothing commits when the second write fails.
 * Rollback by the database itself remains M3 (AC-NFR-1.10 v0.3, CR-001).
 */
function atomicityHarness({ failAppend = false } = {}) {
  const SESSION = Object.freeze({ id: 'session-under-test' });
  const writes = [];
  let running = false;
  let committed = false;

  const requests = {
    findById: async () => ({
      _id: 'req-1', status: STATUS.ASSIGNED, version: 3, categoryId: CAT, campusId: 'campus-1',
      requesterId: 'user-1', reference: 'CC-2026-000123', securityCategory: false,
      resolution: { summary: null },
    }),
    applyChange: async (_id, expected, _set, _actor, options) => {
      writes.push({ write: 'request', session: options?.session, insideRun: running });
      return { version: expected + 1 };
    },
  };
  const history = {
    findByIdempotencyKey: async () => null,
    append: async (_entry, options) => {
      writes.push({ write: 'history', session: options?.session, insideRun: running });
      if (failAppend) throw new Error('history write failed');
      return { _id: 'hist-1' };
    },
  };
  const unitOfWork = {
    run: async (work) => {
      running = true;
      try {
        const result = await work(SESSION);
        committed = true;
        return result;
      } finally {
        running = false;
      }
    },
  };

  const service = createStatusTransitionService({ requests, history, unitOfWork, clock: () => AT });
  return { service, writes, SESSION, didCommit: () => committed };
}

test('both writes happen inside the unit of work, with its session — DEC-016, FR-6.3', async () => {
  const { service, writes, SESSION, didCommit } = atomicityHarness();
  await service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3 });

  assert.deepEqual(writes, [
    { write: 'request', session: SESSION, insideRun: true },
    { write: 'history', session: SESSION, insideRun: true },
  ], 'the status change and the history entry must both be written inside unitOfWork.run()');
  assert.equal(didCommit(), true);
});

test('nothing commits when the history write fails — DEC-016, R-15', async () => {
  const { service, writes, didCommit } = atomicityHarness({ failAppend: true });
  let published = false;
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'probe', 'test', () => { published = true; });

  await assert.rejects(
    () => service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3 }),
    /history write failed/,
    'the failure must reach the caller, not be absorbed',
  );
  assert.equal(didCommit(), false, 'the unit of work must not commit when the history write fails');
  assert.equal(published, false, 'no event may be published for a transition that did not commit');
  assert.deepEqual(writes.map((w) => w.write), ['request', 'history'],
    'both writes were attempted inside the one unit of work');
});

test('a stale version is refused before any write — DEC-015 / 412', async () => {
  const { service, calls } = harness({ version: 5 });
  await assert.rejects(
    () => service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3 }),
    PreconditionFailedError,
  );
  assert.deepEqual(calls, []);
});

test('an illegal transition is refused and nothing is written — FR-6.2', async () => {
  const { service, calls } = harness({ status: STATUS.CLOSED });
  await assert.rejects(
    () => service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3 }),
    TransitionError,
  );
  assert.deepEqual(calls, []);
});

test('an actor without category authorisation is refused — DEC-012 point 2, FR-4.1', async () => {
  const { service, calls } = harness({ categoryId: 'cat-other' });
  await assert.rejects(
    () => service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3 }),
    AuthorisationError,
  );
  assert.deepEqual(calls, [], 'the object-level check runs before any write');
});

test('a security-category request is refused to a non Security Officer — FR-1.5', async () => {
  const { service } = harness({ securityCategory: true });
  await assert.rejects(
    () => service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3 }),
    AuthorisationError,
  );

  const so = harness({ securityCategory: true });
  const officer = { id: 'u2', roles: [ROLE.SECURITY_OFFICER], categoryAuthorisations: [CAT] };
  const result = await so.service.transition('req-1', STATUS.IN_PROGRESS, officer, { expectedVersion: 3 });
  assert.equal(result.toStatus, STATUS.IN_PROGRESS);
});

test('a replayed idempotency key returns the original result and writes nothing — DEC-015', async () => {
  const prior = { _id: 'hist-1', requestId: 'req-1', fromStatus: STATUS.ASSIGNED,
                  toStatus: STATUS.IN_PROGRESS, occurredAt: AT, requestVersion: 4,
                  idempotencyFingerprint: 'fp-1' };
  const { service, calls } = harness({ prior });

  const result = await service.transition('req-1', STATUS.IN_PROGRESS, ACTOR,
    { expectedVersion: 3, idempotencyKey: 'key-1', fingerprint: 'fp-1' });

  assert.equal(result.replayed, true);
  assert.deepEqual(calls, [], 'a retry must not write a second immutable history entry');
});

test('the same key with a different body is refused — DEC-015 / 422', async () => {
  const prior = { idempotencyFingerprint: 'fp-1' };
  const { service } = harness({ prior });
  await assert.rejects(
    () => service.transition('req-1', STATUS.IN_PROGRESS, ACTOR,
      { expectedVersion: 3, idempotencyKey: 'key-1', fingerprint: 'fp-DIFFERENT' }),
    IdempotencyConflictError,
  );
});

test('a failing subscriber does not fail the transition — DEC-011 containment', async () => {
  const { service, appended } = harness();
  const failures = [];
  setFailureReporter((name, event, error) => failures.push({ name, message: error.message }));
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'BrokenSubscriber', 'test', () => {
    throw new Error('downstream unavailable');
  });

  const result = await service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3 });

  assert.equal(result.toStatus, STATUS.IN_PROGRESS);
  assert.equal(appended.length, 1);
  assert.equal(failures.length, 1);
});

test('the event payload carries what the subscribers need — FR-3.5, FR-8.2', async () => {
  const { service } = harness();
  let payload;
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'probe', 'test', (p) => { payload = p; });

  await service.transition('req-1', STATUS.IN_PROGRESS, ACTOR, { expectedVersion: 3 });

  for (const field of ['campusId', 'categoryId', 'securityCategory', 'reference', 'historyId']) {
    assert.ok(field in payload, `the payload must carry '${field}'`);
  }
});

test('a Security Officer can close a resolved security-category request — B-1', async () => {
  const { service, appended } = harness({ status: STATUS.RESOLVED, securityCategory: true });
  const officer = { id: 'so-1', roles: [ROLE.SECURITY_OFFICER], categoryAuthorisations: [CAT] };

  const result = await service.transition('req-1', STATUS.CLOSED, officer,
    { expectedVersion: 3, reason: 'Investigation complete' });

  assert.equal(result.toStatus, STATUS.CLOSED);
  assert.equal(appended[0].body, 'Investigation complete');
  assert.equal(appended[0].actorRole, ROLE.SECURITY_OFFICER);
});

test('a Coordinator cannot close a security-category request — B-1, FR-1.5', async () => {
  const { service, calls } = harness({ status: STATUS.RESOLVED, securityCategory: true });
  const coordinator = { id: 'c-1', roles: [ROLE.COORDINATOR], categoryAuthorisations: [CAT] };

  await assert.rejects(
    () => service.transition('req-1', STATUS.CLOSED, coordinator,
      { expectedVersion: 3, reason: 'closing' }),
    AuthorisationError,
  );
  assert.deepEqual(calls, []);
});

test('closing records the reason and the closure clock — FR-6.6, NFR-4.2', async () => {
  const setSeen = [];
  const requests = {
    findById: async () => ({ _id: 'r', status: STATUS.RESOLVED, version: 1, categoryId: CAT,
                             campusId: 'c', requesterId: 'u', reference: 'CC-2026-000001',
                             securityCategory: false, resolution: { summary: 'fixed' } }),
    applyChange: async (_id, _v, $set) => { setSeen.push($set); return { version: 2 }; },
  };
  const history = { append: async () => ({ _id: 'h' }), findByIdempotencyKey: async () => null };
  const service = createStatusTransitionService({
    requests, history, unitOfWork: { run: (w) => w('s') }, clock: () => AT,
  });

  await service.transition('r', STATUS.CLOSED, { id: 'm', roles: [ROLE.MANAGER],
    categoryAuthorisations: [CAT] }, { expectedVersion: 1, reason: 'Resolved to satisfaction' });

  assert.equal(setSeen[0]['closure.reason'], 'Resolved to satisfaction');
  assert.equal(setSeen[0]['closure.closedAt'], AT,
    'closure.closedAt starts the NFR-4.2 retention clock PROC-001 selects on');
});

test('a move to Resolved records the resolution summary, when and by whom — FR-6.5', async () => {
  const setSeen = [];
  const requests = {
    findById: async () => ({ _id: 'r', status: STATUS.IN_PROGRESS, version: 4, categoryId: CAT,
                             campusId: 'c', requesterId: 'u', reference: 'CC-2026-000002',
                             securityCategory: false, resolution: { summary: null } }),
    applyChange: async (_id, _v, $set) => { setSeen.push($set); return { version: 5 }; },
  };
  const history = { append: async () => ({ _id: 'h' }), findByIdempotencyKey: async () => null };
  const service = createStatusTransitionService({
    requests, history, unitOfWork: { run: (w) => w('s') }, clock: () => AT,
  });

  await service.transition('r', STATUS.RESOLVED, ACTOR,
    { expectedVersion: 4, resolutionSummary: 'Replaced the faulty wall socket' });

  const $set = setSeen[0];
  assert.equal($set.status, STATUS.RESOLVED);
  assert.equal($set['resolution.summary'], 'Replaced the faulty wall socket');
  assert.equal($set['resolution.recordedAt'], AT, 'recorded at the transition time');
  assert.equal($set['resolution.recordedById'], ACTOR.id, 'recorded against the acting user');
  assert.deepEqual(Object.keys($set).filter((k) => k.startsWith('closure.')), [],
    'a move to Resolved does not close the request');
});

/*
 * NOT TESTED, DELIBERATELY — do not "fix" this gap without reading OI-15.
 *
 * A request reopened (Resolved -> In Progress) and then resolved again WITHOUT a
 * new summary: today the earlier resolution.* values remain on the request and
 * satisfy FR-6.5, so the second move to Resolved is allowed. Whether that is
 * right is undecided. FR-6.5 does not say, and the reopen rule is recorded as
 * OI-15 for team decision: either the original summary counts, or a reopen
 * clears resolution.* and a new summary is required.
 *
 * A test here would encode one of those two answers and present an open design
 * question as a verified requirement — the failure OI-15 exists to prevent. When
 * OI-15 is settled, test the rule the team agreed.
 */

test('the consequences of an event are enumerable from one registry — DEC-011', async () => {
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'NotificationSubscriber', 'FR-3.4', () => {});
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'ReportingProjectionSubscriber', 'FR-8.1', () => {});
  assert.deepEqual(
    listSubscriptions().map((s) => s.name),
    ['NotificationSubscriber', 'ReportingProjectionSubscriber'],
  );
});
