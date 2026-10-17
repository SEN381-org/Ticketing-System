/**
 * In which statuses a request may be assigned, reassigned or accepted - S6 (A10).
 *
 * Traces to: FR-5.1, FR-5.5, FR-5.2, FR-5.3, FR-6.1, OI-15, DEC-012.
 *
 * Basis: team decision of 17/10/2026 (project lead, walkthrough #10), recorded under
 * OI-15: assignment is permitted ONLY in Received (assign an unassigned request) and in
 * Assigned, In Progress and On Hold (reassign, or accept where the unassigned rules
 * apply); it is refused, 422 ASSIGNMENT_REFUSED, in Resolved, Closed and Rejected.
 * Expected results are written from that sentence and FR-5.3 (an accept never replaces
 * an owner), not from running the code.
 *
 * What this does NOT show: that the decision is baselined (it is an OI-15 team
 * decision), or behaviour against a real cluster.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { STATUS } from '../src/models/_shared.js';
import { AssignmentRefusedError } from '../src/errors.js';
import { PEOPLE, harness } from './assignmentRuleHarness.js';

const OWNER = 'owner-1';
const OWNED_STATUSES = [STATUS.ASSIGNED, STATUS.IN_PROGRESS, STATUS.ON_HOLD];
const REFUSED_STATUSES = [STATUS.RESOLVED, STATUS.CLOSED, STATUS.REJECTED];

// Technique: every one of the seven FR-6.1 statuses, with the owner each status normally has
// (none in Received, one afterwards). Expected: reassign succeeds in Assigned, In Progress and
// On Hold and keeps the status; it is refused 422 in Resolved, Closed and Rejected with the
// owner, version and history unchanged. Shows: the status rule for reassign. Does NOT show:
// accept (next test).
test('reassign is permitted in Assigned, In Progress and On Hold and refused in Resolved, Closed and Rejected - FR-5.5, OI-15, NV-164', async () => {
  assert.equal(OWNED_STATUSES.length + REFUSED_STATUSES.length + 1, Object.values(STATUS).length,
    'the three lists and Received cover all seven FR-6.1 statuses');
  for (const status of OWNED_STATUSES) {
    const h = harness({ doc: { status, assigneeId: OWNER, version: 4 } });
    const result = await h.service.assign('r1', PEOPLE.tech2.id, PEOPLE.coord, h.command());
    assert.equal(result.action, 'reassign', status);
    assert.equal(h.store.doc.assigneeId, PEOPLE.tech2.id, status);
    assert.equal(h.store.doc.status, status, `${status}: a reassignment keeps the status`);
  }
  for (const status of REFUSED_STATUSES) {
    const h = harness({ doc: { status, assigneeId: OWNER, version: 4 } });
    await assert.rejects(h.service.assign('r1', PEOPLE.tech2.id, PEOPLE.coord, h.command()),
      (e) => e instanceof AssignmentRefusedError && e.status === 422 && e.code === 'ASSIGNMENT_REFUSED', status);
    assert.equal(h.store.doc.assigneeId, OWNER, status);
    assert.equal(h.store.doc.version, 4, status);
    assert.equal(h.state.appended.length, 0, status);
  }
});

// Technique: an unassigned request in each status, assign by a Coordinator and accept by a
// Technician. Expected: both succeed in Received only (assign makes it Assigned); in every
// other status both are refused 422 and nothing is written. Shows: the unassigned rule.
test('an unassigned request can be assigned or accepted in Received only - FR-5.1, FR-5.2, OI-15, NV-164', async () => {
  for (const status of Object.values(STATUS)) {
    for (const [actor, assigneeId] of [[PEOPLE.coord, PEOPLE.tech.id], [PEOPLE.tech, PEOPLE.tech.id]]) {
      const h = harness({ doc: { status, assigneeId: null } });
      const label = `${actor.roles[0]} in ${status}`;
      if (status === STATUS.RECEIVED) {
        await h.service.assign('r1', assigneeId, actor, h.command());
        assert.equal(h.store.doc.status, STATUS.ASSIGNED, label);
        assert.equal(h.store.doc.assigneeId, PEOPLE.tech.id, label);
      } else {
        await assert.rejects(h.service.assign('r1', assigneeId, actor, h.command()),
          AssignmentRefusedError, label);
        assert.equal(h.store.doc.assigneeId, null, label);
        assert.equal(h.state.appended.length, 0, label);
      }
    }
  }
});

test('an accept on an owned request is refused in every status; the owner stays - FR-5.3', async () => {
  for (const status of Object.values(STATUS)) {
    const h = harness({ doc: { status, assigneeId: OWNER } });
    await assert.rejects(h.service.assign('r1', PEOPLE.tech.id, PEOPLE.tech, h.command()),
      AssignmentRefusedError, status);
    assert.equal(h.store.doc.assigneeId, OWNER, status);
  }
});
