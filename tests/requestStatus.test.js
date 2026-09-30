/**
 * Verification evidence for the controlled transition model.
 * Referenced from the RTM verification column for FR-6.1, FR-6.2, FR-6.4, FR-6.5, FR-6.6.
 *
 * These tests assert the BASELINED values of FR-6.1 and FR-1.2. The previous
 * version asserted invented values while citing the same requirement IDs
 * (review comments R-04, R-07), which is the traceability failure this milestone
 * is assessed on.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { STATUS, ROLE, TRANSITIONS, checkTransition, TRANSITION_ROLES }
  from '../src/domain/requestStatus.js';

const REASON = { hasReason: true };
const RESOLVED_OK = { hasResolution: true };

test('the status set is exactly the seven values FR-6.1 baselines', () => {
  assert.deepEqual(Object.values(STATUS), [
    'Received', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Rejected',
  ]);
});

test('the role set is exactly the six values FR-1.2 baselines', () => {
  assert.deepEqual(Object.values(ROLE), [
    'Requester', 'Technician', 'Coordinator', 'Manager', 'Security Officer', 'Administrator',
  ]);
});

test('a new request begins at Received — FR-6.1', () => {
  assert.equal(STATUS.RECEIVED, 'Received');
  assert.ok(Object.hasOwn(TRANSITIONS, STATUS.RECEIVED));
});

test('every status in the transition model is a baselined status value', () => {
  const declared = new Set(Object.values(STATUS));
  for (const [from, moves] of Object.entries(TRANSITIONS)) {
    assert.ok(declared.has(from), `'${from}' is not a baselined status`);
    for (const move of moves) {
      assert.ok(declared.has(move.to), `'${from}' may move to undeclared status '${move.to}'`);
    }
  }
});

test('every status is reachable or is the entry point — FR-6.2', () => {
  const reachable = new Set([STATUS.RECEIVED]);
  for (const moves of Object.values(TRANSITIONS)) for (const m of moves) reachable.add(m.to);
  for (const status of Object.values(STATUS)) {
    assert.ok(reachable.has(status), `'${status}' is in FR-6.1 but unreachable in the model`);
  }
});

test('Closed and Rejected are terminal', () => {
  assert.deepEqual(TRANSITIONS[STATUS.CLOSED], []);
  assert.deepEqual(TRANSITIONS[STATUS.REJECTED], []);
});

test('a permitted move by a permitted role is allowed — FR-6.2', () => {
  const v = checkTransition(STATUS.RECEIVED, STATUS.ASSIGNED, [ROLE.COORDINATOR]);
  assert.equal(v.allowed, true);
});

test('a move that skips a status is refused — FR-6.2', () => {
  const v = checkTransition(STATUS.RECEIVED, STATUS.RESOLVED, [ROLE.TECHNICIAN], RESOLVED_OK);
  assert.equal(v.allowed, false);
  assert.match(v.reason, /may not move to/);
});

test('Resolved requires resolution information — FR-6.5', () => {
  const without = checkTransition(STATUS.IN_PROGRESS, STATUS.RESOLVED, [ROLE.TECHNICIAN]);
  assert.equal(without.allowed, false);
  assert.match(without.reason, /Resolution information/);

  const withIt = checkTransition(STATUS.IN_PROGRESS, STATUS.RESOLVED, [ROLE.TECHNICIAN], RESOLVED_OK);
  assert.equal(withIt.allowed, true);
});

test('Closed and Rejected require a recorded reason — FR-6.6', () => {
  assert.equal(checkTransition(STATUS.RESOLVED, STATUS.CLOSED, [ROLE.MANAGER]).allowed, false);
  assert.equal(checkTransition(STATUS.RESOLVED, STATUS.CLOSED, [ROLE.MANAGER], REASON).allowed, true);
  assert.equal(checkTransition(STATUS.RECEIVED, STATUS.REJECTED, [ROLE.COORDINATOR], REASON).allowed, true);
});

test('a Technician may not close a request — FR-6.4', () => {
  assert.equal(checkTransition(STATUS.RESOLVED, STATUS.CLOSED, [ROLE.TECHNICIAN], REASON).allowed, false);
});

test('a Requester may not move a request at all — FR-6.4', () => {
  for (const [from, moves] of Object.entries(TRANSITIONS)) {
    for (const move of moves) {
      const v = checkTransition(from, move.to, [ROLE.REQUESTER], { ...REASON, ...RESOLVED_OK });
      assert.equal(v.allowed, false, `a Requester must not move '${from}' to '${move.to}'`);
    }
  }
});

test('an Administrator holds no lifecycle authority — FR-6.7 names them explicitly', () => {
  assert.ok(!TRANSITION_ROLES.includes(ROLE.ADMINISTRATOR));
  for (const [from, moves] of Object.entries(TRANSITIONS)) {
    for (const move of moves) {
      const v = checkTransition(from, move.to, [ROLE.ADMINISTRATOR], { ...REASON, ...RESOLVED_OK });
      assert.equal(v.allowed, false);
    }
  }
});

test('a user holding several roles is allowed if any one permits the move — FR-1.2', () => {
  const v = checkTransition(STATUS.RESOLVED, STATUS.CLOSED, [ROLE.TECHNICIAN, ROLE.MANAGER], REASON);
  assert.equal(v.allowed, true);
});

test('an unknown status is refused rather than permitted by default', () => {
  const v = checkTransition('Submitted', STATUS.CLOSED, [ROLE.MANAGER], REASON);
  assert.equal(v.allowed, false);
  assert.match(v.reason, /Unknown status/);
});
