/**
 * Initial verification evidence for FR-6.7 and DEC-011.
 *
 * Referenced from PED §7.5 (end-to-end trace) and from the RTM verification
 * column for FR-6.2, FR-6.3, FR-6.4 and FR-6.7.
 *
 * Collaborators are substituted rather than mocked at the database: the
 * behaviour under test is the ordering and completeness of the transition,
 * which is a property of the service, not of MongoDB. Enforcement of
 * append-only storage at the database is verified separately at M3 against a
 * test cluster; here the exposed interface is asserted instead.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createStatusTransitionService, TransitionError, AuthorisationError }
  from '../src/services/statusTransitionService.js';
import { EVENTS, subscribe, listSubscriptions, resetSubscriptions, setFailureReporter }
  from '../src/events/requestEvents.js';
import { STATUS } from '../src/domain/requestStatus.js';

const DEPT = 'dept-1';
const ACTOR = { id: 'user-9', role: 'Department Staff', departmentId: DEPT };

function harness({ status = STATUS.SUBMITTED, departmentId = DEPT } = {}) {
  const calls = [];
  const appended = [];

  const requests = {
    findById: async () => ({
      _id: 'req-1', status, departmentId, reporterId: 'user-1',
    }),
    updateStatus: async (id, to) => { calls.push(`status:${to}`); },
  };

  const history = {
    append: async (entry) => { calls.push('history'); appended.push(entry); },
  };

  const fixedClock = () => new Date('2026-09-29T10:00:00.000Z');
  const service = createStatusTransitionService({ requests, history, clock: fixedClock });
  return { service, calls, appended };
}

test.beforeEach(() => resetSubscriptions());

test('a permitted transition writes exactly one history entry', async () => {
  const { service, appended } = harness();
  await service.transition('req-1', STATUS.ACKNOWLEDGED, ACTOR);
  assert.equal(appended.length, 1, 'expected exactly one history entry');
});

test('the history entry records the acting user and both statuses — AC-FR-6.7', async () => {
  const { service, appended } = harness();
  await service.transition('req-1', STATUS.ACKNOWLEDGED, ACTOR, { note: 'triaged' });

  const entry = appended[0];
  assert.equal(entry.changeType, 'status');
  assert.equal(entry.fromStatus, STATUS.SUBMITTED, 'prior status must be recorded');
  assert.equal(entry.toStatus, STATUS.ACKNOWLEDGED, 'new status must be recorded');
  assert.equal(entry.actorId, ACTOR.id, 'acting user must be recorded');
  assert.equal(entry.actorRole, ACTOR.role);
  assert.equal(entry.note, 'triaged');
  assert.ok(entry.occurredAt instanceof Date);
});

test('the history entry is appended before the event is published — DEC-011', async () => {
  const { service, calls } = harness();
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'probe', 'test', () => calls.push('event'));

  await service.transition('req-1', STATUS.ACKNOWLEDGED, ACTOR);

  assert.deepEqual(calls, ['status:Acknowledged', 'history', 'event'],
    'the status change and the history entry are direct writes and precede publication');
});

test('an illegal transition is refused and nothing is written — FR-6.2', async () => {
  const { service, calls } = harness({ status: STATUS.CLOSED });
  let published = false;
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'probe', 'test', () => { published = true; });

  await assert.rejects(
    () => service.transition('req-1', STATUS.IN_PROGRESS, ACTOR),
    TransitionError,
  );
  assert.deepEqual(calls, [], 'no status change and no history entry on refusal');
  assert.equal(published, false, 'no event is published on refusal');
});

test('a role that may not perform the move is refused — FR-6.4', async () => {
  const { service, calls } = harness({ status: STATUS.RESOLVED });
  await assert.rejects(
    () => service.transition('req-1', STATUS.CLOSED, ACTOR),   // staff may not close
    TransitionError,
  );
  assert.deepEqual(calls, []);
});

test('an actor outside the owning department is refused — DEC-012 point 2', async () => {
  const { service, calls } = harness({ departmentId: 'dept-2' });
  await assert.rejects(
    () => service.transition('req-1', STATUS.ACKNOWLEDGED, ACTOR),
    AuthorisationError,
  );
  assert.deepEqual(calls, [], 'the object-level check runs before any write');
});

test('a failing subscriber does not fail the transition — DEC-011 containment', async () => {
  const { service, appended } = harness();
  const failures = [];
  setFailureReporter((name, event, error) => failures.push({ name, message: error.message }));

  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'BrokenSubscriber', 'test', () => {
    throw new Error('downstream unavailable');
  });

  const result = await service.transition('req-1', STATUS.ACKNOWLEDGED, ACTOR);

  assert.equal(result.toStatus, STATUS.ACKNOWLEDGED, 'the transition still succeeded');
  assert.equal(appended.length, 1, 'the history entry was still written');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].name, 'BrokenSubscriber');
});

test('the consequences of an event are enumerable from one registry — DEC-011', async () => {
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'NotificationSubscriber', 'FR-3.4 / SCP-004', () => {});
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'ReportingProjectionSubscriber', 'Feature group 8', () => {});

  const names = listSubscriptions()
    .filter((s) => s.event === EVENTS.REQUEST_STATUS_CHANGED)
    .map((s) => s.name);

  assert.deepEqual(names, ['NotificationSubscriber', 'ReportingProjectionSubscriber']);
});
