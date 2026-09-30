/**
 * Verification evidence for the actor stamp — review comment B-2.
 * Referenced from the RTM verification column for CON-015, NFR-1.9.
 *
 * The update document is built by a pure function so the stamp can be asserted
 * without a database. The defect it guards against was invisible: `actor.role`
 * was undefined, Mongoose strips undefined keys, the write succeeded, and every
 * audit row the Atlas trigger produced carried `actorRole: null`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildChangeUpdate } from '../src/repositories/requestRepository.js';
import { ROLE, STATUS } from '../src/models/_shared.js';

const ACTOR = { id: 'user-7', roles: [ROLE.MANAGER, ROLE.TECHNICIAN] };

test('the update stamps a non-null actor role — B-2, CON-015 / NFR-1.9', () => {
  const update = buildChangeUpdate({ status: STATUS.CLOSED }, ACTOR);

  assert.equal(update.$set.lastActorRole, ROLE.MANAGER);
  assert.notEqual(update.$set.lastActorRole, undefined,
    'Mongoose strips undefined keys, so the audit row would carry actorRole: null');
  assert.equal(update.$set.lastActorId, ACTOR.id);
});

test('the stamped role is always one of the FR-1.2 roles', () => {
  const update = buildChangeUpdate({}, ACTOR);
  assert.ok(Object.values(ROLE).includes(update.$set.lastActorRole));
});

test('the change is conditional and increments the version — DEC-016', () => {
  const update = buildChangeUpdate({ status: STATUS.CLOSED }, ACTOR);
  assert.deepEqual(update.$inc, { version: 1 });
});

test('an actor holding no role is refused rather than stamped null — FR-1.2', () => {
  assert.throws(() => buildChangeUpdate({}, { id: 'u', roles: [] }), /at least one role/);
});

test('the caller cannot overwrite the stamp from the $set it passes', () => {
  const update = buildChangeUpdate({ lastActorRole: 'Administrator' }, ACTOR);
  assert.equal(update.$set.lastActorRole, ROLE.MANAGER, 'the stamp is applied last');
});
