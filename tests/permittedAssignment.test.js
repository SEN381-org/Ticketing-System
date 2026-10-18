/**
 * permittedAssignment - what this actor may do about assignment on this request - S6 (A10).
 *
 * Traces to: FR-5.1, FR-5.2, FR-5.3, FR-5.5, FR-6.1, TD-003 (same technique as
 * permittedTransitions), OI-15, DEC-012.
 *
 * Basis: the OI-15 team decision of 17/10/2026 - assignment only in Received (assign an
 * unassigned request) and Assigned, In Progress, On Hold (reassign); never in Resolved,
 * Closed or Rejected - and decision #10 (a Security Officer only on security requests, a
 * Technician only on non-security ones). The client offers an action only when the server
 * says it is permitted, so the flag must never be true where the service would refuse.
 *
 * What this does NOT show: the version, idempotency and campus checks (the route's and the
 * service's, not part of the flag), or the client's use of the flag.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { permittedAssignmentFor } from '../src/domain/permittedAssignment.js';
import { ROLE, STATUS } from '../src/models/_shared.js';
import { CAT, PEOPLE, harness } from './assignmentRuleHarness.js';

const OWNER = 'owner-1';
const OWNED_STATUSES = [STATUS.ASSIGNED, STATUS.IN_PROGRESS, STATUS.ON_HOLD];
const ACTORS = Object.values(PEOPLE);

// The expected flags, written from the two decisions and independent of the code under test.
function expected(doc, actor) {
  const role = actor.roles[0];
  const security = doc.securityCategory;
  const unassigned = doc.assigneeId === null;
  const statusFitsAssign = unassigned ? doc.status === STATUS.RECEIVED : OWNED_STATUSES.includes(doc.status);
  const assign = [ROLE.COORDINATOR, ROLE.MANAGER].includes(role) && !security && statusFitsAssign;
  const accept = ((role === ROLE.TECHNICIAN && !security) || (role === ROLE.SECURITY_OFFICER && security))
    && unassigned && doc.status === STATUS.RECEIVED;
  // decision #10: the pool is Security Officers for a security request, Technicians otherwise.
  const assigneeRoles = assign ? [security ? ROLE.SECURITY_OFFICER : ROLE.TECHNICIAN] : [];
  return { assign, accept, assigneeRoles };
}

const docFor = (status, assigneeId, securityCategory) => ({
  _id: 'r1', campusId: 'campus-1', categoryId: CAT, securityCategory, requesterId: 'req-1',
  status, assigneeId, version: 3,
});

// Technique: exhaustive - 7 statuses x owned or not x security or not x 8 actors (all six
// FR-1.2 roles; the extra two are the second Technician and Security Officer). Expected:
// the flags above. Shows: the flag follows the decisions for every combination. Does NOT
// show: that the service agrees (next test).
test('permittedAssignmentFor matches the decisions for every status, ownership, security flag and actor - FR-5.1, FR-5.5, OI-15, NV-165', () => {
  let anyAssign = 0; let anyAccept = 0;
  for (const status of Object.values(STATUS)) for (const assigneeId of [null, OWNER])
    for (const securityCategory of [false, true]) for (const actor of ACTORS) {
      const doc = docFor(status, assigneeId, securityCategory);
      const got = permittedAssignmentFor(doc, actor);
      const want = expected(doc, actor);
      assert.deepEqual(got, want,
        `${status} / owner=${assigneeId} / security=${securityCategory} / ${actor.id}`);
      if (got.assign) anyAssign += 1;
      if (got.accept) anyAccept += 1;
    }
  assert.ok(anyAssign > 0 && anyAccept > 0, 'the sweep must include permitted cases or it proves nothing');
});

// Technique: for the same combinations, drive the REAL assignment service twice per actor -
// once naming a valid other user (assign or reassign), once naming the actor (accept) - and
// compare success with the flag, in both directions. Expected: success exactly when the flag
// is true; in particular the flag is never true where the service refuses. Shows: one rule,
// two enforcers, in agreement. Does NOT show: version/idempotency refusals.
test('permittedAssignmentFor agrees with the assignment service: true exactly when the service accepts - FR-5.1, FR-5.5, TD-003, NV-165', async () => {
  const succeeds = async (doc, actor, assigneeId) => {
    const h = harness({ doc });
    try { await h.service.assign('r1', assigneeId, actor, h.command()); return true; } catch { return false; }
  };
  for (const status of Object.values(STATUS)) for (const assigneeId of [null, OWNER])
    for (const securityCategory of [false, true]) for (const actor of ACTORS) {
      const doc = docFor(status, assigneeId, securityCategory);
      const flags = permittedAssignmentFor(doc, actor);
      // A valid other user: naming the actor themselves would be an accept, tested below.
      const fitting = securityCategory ? [PEOPLE.so2, PEOPLE.so] : [PEOPLE.tech2, PEOPLE.tech];
      const named = fitting.find((u) => u.id !== actor.id);
      const label = `${status} / owner=${assigneeId} / security=${securityCategory} / ${actor.id}`;
      assert.equal(await succeeds(doc, actor, named.id), flags.assign, `assign: ${label}`);
      assert.equal(await succeeds(doc, actor, actor.id), flags.accept, `accept: ${label}`);
    }
});

test('permittedAssignmentFor: a Requester gets false/false, and a worked case for each flag - FR-5.1, FR-5.2', () => {
  const received = docFor(STATUS.RECEIVED, null, false);
  assert.deepEqual(permittedAssignmentFor(received, PEOPLE.requester), { assign: false, accept: false, assigneeRoles: [] });
  assert.deepEqual(permittedAssignmentFor(received, PEOPLE.coord), { assign: true, accept: false, assigneeRoles: [ROLE.TECHNICIAN] });
  assert.deepEqual(permittedAssignmentFor(received, PEOPLE.tech), { assign: false, accept: true, assigneeRoles: [] });
  assert.deepEqual(permittedAssignmentFor(docFor(STATUS.RESOLVED, OWNER, false), PEOPLE.coord),
    { assign: false, accept: false, assigneeRoles: [] });
});

// Technique: for a request a Coordinator may assign (Received, unassigned, non-security), name
// every person in the fixtures through the REAL service. Expected (decision #10, written before
// the run): the service accepts the named user exactly when their role is in assigneeRoles.
// Shows: the pool the client is told to offer never contains someone the service refuses, and
// never leaves out someone it would accept. Does NOT show: the client's pool query.
test('assigneeRoles agrees with the assignment service: a role is offered exactly when the service accepts that user - decision #10, FR-5.1', async () => {
  const doc = docFor(STATUS.RECEIVED, null, false);
  const coordinator = PEOPLE.coord;
  const { assign, assigneeRoles } = permittedAssignmentFor(doc, coordinator);
  assert.equal(assign, true, 'precondition: the Coordinator may assign this request');
  assert.ok(assigneeRoles.length > 0, 'the pool must not be empty or this proves nothing');
  for (const person of Object.values(PEOPLE)) {
    const h = harness({ doc });
    let accepted = true;
    try { await h.service.assign('r1', person.id, coordinator, h.command()); } catch { accepted = false; }
    const offered = person.roles.some((r) => assigneeRoles.includes(r));
    assert.equal(accepted, offered, `${person.id} (${person.roles.join('+')}): service ${accepted} vs pool ${offered}`);
  }
});
