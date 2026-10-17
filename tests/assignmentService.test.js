/**
 * Verification evidence for assignment, acceptance, reassignment and the
 * recording of refused attempts - service level.
 *
 * Traces to: FR-5.1, FR-5.2, FR-5.3, FR-5.4, FR-5.5, FR-1.3, AC-FR-5.1 to
 *            AC-FR-5.5, AC-FR-1.3, TD-005, DEC-011, DEC-012, DEC-015, DEC-016.
 *
 * Collaborators are fakes; the unit of work is a fake that records whether it is
 * running and restores the store when the callback throws, so "nothing is
 * written" and "the owner is unchanged" are asserted on state, not on call
 * counts. Expected results are derived from the Then clauses of Acceptance
 * Criteria v0.3 quoted in each test's comment, not from running the code.
 *
 * What this does NOT show: behaviour against a real cluster (rollback is a
 * database guarantee), the unassigned set as a list endpoint (not built by this
 * change; "no longer appears" is shown as assigneeId no longer null, which is
 * what the FR-4.6 index and filter read), or the audit write reaching Atlas.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createAssignmentService } from '../src/services/assignmentService.js';
import { buildAssignmentFilter } from '../src/repositories/requestRepository.js';
import { EVENTS, subscribe, resetSubscriptions } from '../src/events/requestEvents.js';
import { ROLE, STATUS } from '../src/models/_shared.js';
import {
  AssignmentRefusedError, AuthorisationError, IdempotencyConflictError, PreconditionFailedError,
} from '../src/errors.js';

const CAT = 'cat-1';
const T1 = { id: 'tech-1', roles: [ROLE.TECHNICIAN], categoryAuthorisations: [CAT] };
const T2 = { id: 'tech-2', roles: [ROLE.TECHNICIAN], categoryAuthorisations: [CAT] };
const T_OTHER = { id: 'tech-x', roles: [ROLE.TECHNICIAN], categoryAuthorisations: ['cat-2'] };
const COORD = { id: 'coord-1', roles: [ROLE.COORDINATOR], categoryAuthorisations: [CAT] };
const SO = { id: 'so-1', roles: [ROLE.SECURITY_OFFICER], categoryAuthorisations: [CAT] };
const REQUESTER = { id: 'req-1', roles: [ROLE.REQUESTER], categoryAuthorisations: [] };

const userRecords = new Map([T1, T2, T_OTHER, COORD, SO, REQUESTER].map((u) => [u.id, { ...u, _id: u.id, status: 'active' }]));

function harness({ doc = {}, failAppend = false, prior = null, recordRefusal } = {}) {
  const store = {
    doc: {
      _id: 'r1', campusId: 'campus-1', reference: 'CC-2026-000001', categoryId: CAT,
      securityCategory: false, requesterId: 'req-1', status: STATUS.RECEIVED,
      assigneeId: null, assignedAt: null, version: 1, ...doc,
    },
  };
  const state = { inTransaction: false, committed: false, writes: [], appended: [], refusals: [] };
  let tick = 0;
  const clock = () => new Date(Date.UTC(2026, 9, 17, 9, 0, tick++));

  const requests = {
    findById: async () => ({ ...store.doc }),
    // Simulates the repository's conditional update: version AND owner must match.
    applyAssignment: async (id, expectedVersion, expectedOwner, $set, actor, { session } = {}) => {
      state.writes.push({ inTransaction: state.inTransaction, session });
      if (store.doc.version !== expectedVersion || (store.doc.assigneeId ?? null) !== (expectedOwner ?? null)) {
        throw new PreconditionFailedError(id, expectedVersion);
      }
      Object.assign(store.doc, $set, { version: expectedVersion + 1 });
      return { version: store.doc.version };
    },
  };
  const history = {
    findByIdempotencyKey: async () => prior,
    append: async (entry, { session } = {}) => {
      state.appended.push({ entry, inTransaction: state.inTransaction, session });
      if (failAppend) throw new Error('history write failed');
      return { _id: `h${state.appended.length}` };
    },
  };
  const users = { findById: async (id) => userRecords.get(String(id)) ?? null };
  const unitOfWork = {
    run: async (work) => {
      const snapshot = { ...store.doc };
      state.inTransaction = true;
      try {
        const out = await work('session-1');
        state.committed = true;
        return out;
      } catch (error) {
        store.doc = snapshot;                       // rollback
        throw error;
      } finally {
        state.inTransaction = false;
      }
    },
  };
  const service = createAssignmentService({
    requests, users, history, unitOfWork, clock,
    recordRefusal: recordRefusal ?? (async (r) => { state.refusals.push(r); return true; }),
  });
  const command = (version = store.doc.version, key = `k-${Math.random()}`) =>
    ({ expectedVersion: version, idempotencyKey: key, fingerprint: `fp-${key}` });
  return { service, store, state, command };
}

// ---------- AC-FR-5.1 ----------
// Then: the request records that user as its owner and no longer appears in the unassigned set.

test('AC-FR-5.1: a Coordinator assigns an unassigned request; the named user is the owner and the request leaves the unassigned set', async () => {
  const { service, store, command } = harness();
  assert.equal(store.doc.assigneeId, null, 'precondition: the request is unassigned');

  const result = await service.assign('r1', T1.id, COORD, command());

  assert.equal(store.doc.assigneeId, T1.id);
  assert.notEqual(store.doc.assigneeId ?? null, null, 'no longer in the unassigned set (assigneeId null)');
  assert.equal(store.doc.status, STATUS.ASSIGNED, 'Received -> Assigned is made by assignment (N-1)');
  assert.equal(store.doc.version, 2);
  assert.equal(result.action, 'assign');
  assert.equal(result.toAssigneeId, T1.id);
});

test('AC-FR-5.1: a user not authorised for the request category cannot be named, and nothing changes', async () => {
  const { service, store, state, command } = harness();
  await assert.rejects(service.assign('r1', T_OTHER.id, COORD, command()), AssignmentRefusedError);
  assert.equal(store.doc.assigneeId, null);
  assert.equal(store.doc.status, STATUS.RECEIVED);
  assert.equal(state.appended.length, 0);
});

test('AC-FR-5.1: a requester-only user cannot be named as owner (FR-5.1 "staff user")', async () => {
  const { service, store, command } = harness();
  await assert.rejects(service.assign('r1', REQUESTER.id, COORD, command()), AssignmentRefusedError);
  assert.equal(store.doc.assigneeId, null);
});

test('AC-FR-5.1, FR-1.5: on a security-category request only a Security Officer can be named', async () => {
  const sec = harness({ doc: { securityCategory: true } });
  // The Coordinator may not act on a security-category request at all (DEC-012 point 2).
  await assert.rejects(sec.service.assign('r1', SO.id, COORD, sec.command()), AuthorisationError);
  assert.equal(sec.store.doc.assigneeId, null);
});

test('AC-FR-5.1, FR-1.5: a Security Officer may assign a security-category request to a Security Officer, not to a Technician', async () => {
  const ok = harness({ doc: { securityCategory: true } });
  const manager = { id: 'so-0', roles: [ROLE.SECURITY_OFFICER, ROLE.COORDINATOR], categoryAuthorisations: [CAT] };
  await ok.service.assign('r1', SO.id, manager, ok.command());
  assert.equal(ok.store.doc.assigneeId, SO.id);

  const bad = harness({ doc: { securityCategory: true } });
  await assert.rejects(bad.service.assign('r1', T1.id, manager, bad.command()), AssignmentRefusedError);
  assert.equal(bad.store.doc.assigneeId, null);
});

// ---------- AC-FR-5.2 ----------
// Then: that Technician is recorded as the owner of the request.

test('AC-FR-5.2: a Technician authorised for the category accepts an unassigned request and is recorded as owner', async () => {
  const { service, store, command } = harness();
  const result = await service.assign('r1', T1.id, T1, command());
  assert.equal(store.doc.assigneeId, T1.id);
  assert.equal(store.doc.status, STATUS.ASSIGNED);
  assert.equal(result.action, 'accept');
});

test('AC-FR-5.2: a Technician not authorised for the category cannot accept it; refused and recorded', async () => {
  const { service, store, state, command } = harness();
  await assert.rejects(service.assign('r1', T_OTHER.id, T_OTHER, command()), AuthorisationError);
  assert.equal(store.doc.assigneeId, null);
  assert.deepEqual(state.refusals.map((r) => [r.actor.id, r.operation, r.targetId]),
    [[T_OTHER.id, 'request:accept', 'r1']]);
});

// ---------- AC-FR-5.3 ----------
// Then: the system refuses, the recorded owner remains Technician 1, and the refused attempt is recorded.

test('AC-FR-5.3: Technician 2 accepting a request owned by Technician 1 is refused, T1 stays owner, and the attempt is recorded', async () => {
  const { service, store, state, command } = harness({
    doc: { status: STATUS.ASSIGNED, assigneeId: T1.id, version: 2 },
  });

  await assert.rejects(service.assign('r1', T2.id, T2, command()), AssignmentRefusedError);

  assert.equal(store.doc.assigneeId, T1.id, 'the recorded owner remains Technician 1');
  assert.equal(store.doc.version, 2, 'no change to the request');
  assert.equal(state.appended.length, 0, 'no history entry for a refused attempt');
  assert.equal(state.refusals.length, 1, 'the refused attempt is recorded');
  assert.deepEqual(
    { id: state.refusals[0].actor.id, op: state.refusals[0].operation, target: state.refusals[0].targetId },
    { id: T2.id, op: 'request:accept', target: 'r1' });
});

test('AC-FR-5.3: an accept that loses the race to another owner cannot overwrite the owner (conditional on the owner read)', async () => {
  const h = harness();
  // The service reads the request as unassigned; before its write lands, T1 owns it.
  const realFind = h.store;
  const service = createAssignmentService({
    requests: {
      findById: async () => ({ ...realFind.doc }),
      applyAssignment: async (id, v, owner) => {
        realFind.doc.assigneeId = T1.id;                // the other accept commits first
        if ((realFind.doc.assigneeId ?? null) !== (owner ?? null)) throw new PreconditionFailedError(id, v);
        realFind.doc.assigneeId = T2.id;                // would be reached only if the owner were not part of the write
        return { version: v + 1 };
      },
    },
    users: { findById: async () => null },
    history: { findByIdempotencyKey: async () => null, append: async () => ({ _id: 'h' }) },
    unitOfWork: { run: async (work) => work('s') },
  });
  await assert.rejects(service.assign('r1', T2.id, T2, h.command()), PreconditionFailedError);
  assert.equal(realFind.doc.assigneeId, T1.id);
});

test('AC-FR-5.3: the repository update is conditional on the owner the service read (null for an accept)', () => {
  assert.deepEqual(buildAssignmentFilter('r1', 4, null),
    { _id: 'r1', version: 4, anonymisedAt: null, assigneeId: null });
  assert.equal(buildAssignmentFilter('r1', 4, undefined).assigneeId, null, 'undefined is treated as unassigned');
  assert.equal(buildAssignmentFilter('r1', 4, 'tech-1').assigneeId, 'tech-1', 'a reassign names the owner it read');
});

// ---------- AC-FR-5.4 / AC-FR-5.5 ----------

test('AC-FR-5.5: a Coordinator reassigns T1\'s request to T2; T2 is owner and the previous assignment stays in the history entry', async () => {
  const { service, store, state, command } = harness({
    doc: { status: STATUS.IN_PROGRESS, assigneeId: T1.id, version: 3 },
  });
  const result = await service.assign('r1', T2.id, COORD, command());

  assert.equal(store.doc.assigneeId, T2.id);
  assert.equal(store.doc.status, STATUS.IN_PROGRESS, 'a request past Assigned keeps its status');
  assert.equal(result.action, 'reassign');
  const { entry } = state.appended[0];
  assert.equal(entry.changeType, 'assignment');
  assert.equal(entry.fromAssigneeId, T1.id, 'the previous assignment is visible');
  assert.equal(entry.toAssigneeId, T2.id);
  assert.equal(entry.fromStatus, null);
  assert.equal(entry.toStatus, null);
});

test('AC-FR-5.4: the assignment and the reassignment each carry acting user, date and time', async () => {
  const { service, state, command } = harness();
  await service.assign('r1', T1.id, COORD, command());
  await service.assign('r1', T2.id, COORD, command());

  assert.equal(state.appended.length, 2);
  const [first, second] = state.appended.map((a) => a.entry);
  for (const entry of [first, second]) {
    assert.equal(entry.actorId, COORD.id);
    assert.equal(entry.actorRole, ROLE.COORDINATOR);
    assert.ok(entry.occurredAt instanceof Date && !Number.isNaN(entry.occurredAt.getTime()));
  }
  assert.ok(second.occurredAt > first.occurredAt, 'two different times');
  assert.equal(first.toStatus, STATUS.ASSIGNED);
  assert.equal(second.fromAssigneeId, T1.id);
});

test('AC-FR-5.5: reassigning to the current owner is refused and writes nothing', async () => {
  const { service, state, command } = harness({ doc: { status: STATUS.ASSIGNED, assigneeId: T1.id, version: 2 } });
  await assert.rejects(service.assign('r1', T1.id, COORD, command()), AssignmentRefusedError);
  assert.equal(state.appended.length, 0);
});

test('FR-5.1: a closed request cannot be assigned', async () => {
  const { service, store, command } = harness({ doc: { status: STATUS.CLOSED, assigneeId: T1.id, version: 6 } });
  await assert.rejects(service.assign('r1', T2.id, COORD, command()), AssignmentRefusedError);
  assert.equal(store.doc.assigneeId, T1.id);
});

// ---------- AC-FR-1.3 ----------
// Then: the system rejects the operation, makes no change to the request, and records the rejected attempt.

test('AC-FR-1.3: a Technician assigning another user (an operation reserved to the Coordinator) is rejected, changes nothing, and is recorded', async () => {
  const { service, store, state, command } = harness();
  await assert.rejects(service.assign('r1', T2.id, T1, command()), AuthorisationError);
  assert.equal(store.doc.assigneeId, null);
  assert.equal(store.doc.version, 1);
  assert.equal(state.appended.length, 0);
  assert.deepEqual(state.refusals.map((r) => [r.actor.id, r.operation, r.targetId]),
    [[T1.id, 'request:assign', 'r1']]);
});

test('AC-FR-1.3: a failure to record leaves the refusal the same error, not a new one (TD-005 choice)', async () => {
  const { service, command } = harness({ recordRefusal: async () => { throw new Error('audit down'); } });
  await assert.rejects(service.assign('r1', T2.id, T1, command()), AuthorisationError);
});

test('AC-FR-1.3: a stale version or a missing request is not recorded as a refusal', async () => {
  const stale = harness();
  await assert.rejects(stale.service.assign('r1', T1.id, COORD, stale.command(9)), PreconditionFailedError);
  assert.equal(stale.state.refusals.length, 0);
});

// ---------- DEC-016, DEC-011, DEC-015 ----------

test('DEC-016, FR-5.4: the owner update and the history entry both happen inside the unit of work, with its session', async () => {
  const { service, state, command } = harness();
  await service.assign('r1', T1.id, COORD, command());
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].inTransaction, true);
  assert.equal(state.writes[0].session, 'session-1');
  assert.equal(state.appended[0].inTransaction, true);
  assert.equal(state.appended[0].session, 'session-1');
});

test('DEC-016: a failed history append rolls the assignment back and publishes nothing', async () => {
  resetSubscriptions();
  const seen = [];
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'probe', 'DEC-011', (p) => seen.push(p));
  try {
    const { service, store, command } = harness({ failAppend: true });
    await assert.rejects(service.assign('r1', T1.id, COORD, command()), /history write failed/);
    assert.equal(store.doc.assigneeId, null, 'the owner update did not survive without its history entry');
    assert.equal(store.doc.status, STATUS.RECEIVED);
    assert.deepEqual(seen, []);
  } finally { resetSubscriptions(); }
});

test('DEC-011, DEC-016: the first assignment publishes request.status.changed after the transaction resolves; a reassign publishes nothing', async () => {
  resetSubscriptions();
  const seen = [];
  const h = harness();
  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'probe', 'DEC-011', (p) => seen.push({ p, committed: h.state.committed, inTx: h.state.inTransaction }));
  try {
    await h.service.assign('r1', T1.id, COORD, h.command());
    assert.equal(seen.length, 1);
    assert.deepEqual([seen[0].p.fromStatus, seen[0].p.toStatus], [STATUS.RECEIVED, STATUS.ASSIGNED]);
    assert.equal(seen[0].committed, true);
    assert.equal(seen[0].inTx, false);

    await h.service.assign('r1', T2.id, COORD, h.command());
    assert.equal(seen.length, 1, 'a reassign does not change the status');
  } finally { resetSubscriptions(); }
});

test('DEC-015: a stale If-Match is refused before any write', async () => {
  const { service, state, command } = harness();
  await assert.rejects(service.assign('r1', T1.id, COORD, command(7)), PreconditionFailedError);
  assert.equal(state.writes.length, 0);
});

test('DEC-015: a replayed idempotency key returns the original result and writes nothing', async () => {
  const prior = { requestId: 'r1', fromAssigneeId: null, toAssigneeId: T1.id, toStatus: STATUS.ASSIGNED,
                  occurredAt: new Date(), requestVersion: 2, _id: 'h0', idempotencyFingerprint: 'fp-same' };
  const { service, state } = harness({ prior });
  const result = await service.assign('r1', T1.id, COORD, { expectedVersion: 1, idempotencyKey: 'k', fingerprint: 'fp-same' });
  assert.equal(result.replayed, true);
  assert.equal(result.historyId, 'h0');
  assert.equal(state.writes.length, 0);
  assert.equal(state.appended.length, 0);
});

test('DEC-015: the same idempotency key with a different body is refused', async () => {
  const prior = { idempotencyFingerprint: 'fp-original' };
  const { service } = harness({ prior });
  await assert.rejects(
    service.assign('r1', T1.id, COORD, { expectedVersion: 1, idempotencyKey: 'k', fingerprint: 'fp-other' }),
    IdempotencyConflictError);
});
