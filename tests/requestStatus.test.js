/**
 * Verification evidence for the transition table.
 *
 * Referenced from the RTM verification column for FR-6.1, FR-6.2 and FR-6.4.
 *
 * The transition table is data rather than control flow, so it is asserted
 * directly: the rules can be reviewed against the scope commitment in SCP-008
 * without reading the service that applies them.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { STATUS, TRANSITIONS, checkTransition } from '../src/domain/requestStatus.js';

test('a new request begins at Submitted — FR-6.1', () => {
  assert.equal(STATUS.SUBMITTED, 'Submitted');
  assert.ok(Object.hasOwn(TRANSITIONS, STATUS.SUBMITTED));
});

test('every status in the table is a declared status value', () => {
  const declared = new Set(Object.values(STATUS));
  for (const [from, moves] of Object.entries(TRANSITIONS)) {
    assert.ok(declared.has(from), `'${from}' is not a declared status`);
    for (const move of moves) {
      assert.ok(declared.has(move.to), `'${from}' may move to undeclared status '${move.to}'`);
    }
  }
});

test('Closed is terminal — no transition leaves it', () => {
  assert.deepEqual(TRANSITIONS[STATUS.CLOSED], []);
  const verdict = checkTransition(STATUS.CLOSED, STATUS.IN_PROGRESS, 'Administrator');
  assert.equal(verdict.allowed, false);
});

test('a permitted move by a permitted role is allowed — FR-6.2', () => {
  const verdict = checkTransition(STATUS.SUBMITTED, STATUS.ACKNOWLEDGED, 'Department Staff');
  assert.equal(verdict.allowed, true);
});

test('a move that skips a status is refused — FR-6.2', () => {
  const verdict = checkTransition(STATUS.SUBMITTED, STATUS.RESOLVED, 'Department Staff');
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /may not move to/);
});

test('only an Administrator or Department Head may close a request — FR-6.4', () => {
  assert.equal(checkTransition(STATUS.RESOLVED, STATUS.CLOSED, 'Department Staff').allowed, false);
  assert.equal(checkTransition(STATUS.RESOLVED, STATUS.CLOSED, 'Department Head').allowed, true);
  assert.equal(checkTransition(STATUS.RESOLVED, STATUS.CLOSED, 'Administrator').allowed, true);
});

test('a Requester may not move a request at all — FR-6.4', () => {
  for (const [from, moves] of Object.entries(TRANSITIONS)) {
    for (const move of moves) {
      assert.equal(checkTransition(from, move.to, 'Requester').allowed, false,
        `a Requester must not be able to move '${from}' to '${move.to}'`);
    }
  }
});

test('an unknown status is refused rather than permitted by default', () => {
  const verdict = checkTransition('Fabricated', STATUS.CLOSED, 'Administrator');
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /Unknown status/);
});
