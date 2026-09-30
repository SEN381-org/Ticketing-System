/**
 * The controlled transition model required by FR-6.2.
 *
 * Traces to: FR-6.1 (status set), FR-6.2 (only defined transitions permitted),
 *            FR-6.4 (transitions restricted by role), FR-6.5 (resolution before
 *            Resolved), FR-6.6 (close or reject with a reason), FR-5.1, FR-5.2.
 *
 * STATUS and ROLE are imported from the data baseline's shared definitions
 * (`src/models/_shared.js`, baseline §3.1) rather than redeclared here, so the
 * domain and the persistence layer cannot drift apart again. This file
 * previously carried invented values and is corrected under review comments
 * R-04 and R-07.
 *
 * ----------------------------------------------------------------------------
 * NOT YET CONFIRMED — the table below is a design proposal, not a baselined
 * requirement. FR-6.2 requires "the controlled transition model" to exist and be
 * enforced; it does not state its contents, and FR-6.4 requires transitions to be
 * role-restricted without naming the mapping. The edges and roles here are
 * derived from FR-5.1, FR-5.2, FR-6.5 and FR-6.6 and are recorded as OI-15 for
 * confirmation. Two judgements in particular need agreement:
 *
 *   1. Administrator is NOT a transition role. FR-6.7 names the Administrator
 *      explicitly as someone who may not alter the record, so granting blanket
 *      lifecycle authority sits badly with it. Administrator is an identity and
 *      reference-data role (FR-1.4, FR-9.x).
 *   2. Security Officer holds the same transition rights as other staff, because
 *      FR-1.5 restricts security-category detail to that role: no other staff
 *      member can read the description they would be acting on.
 * ----------------------------------------------------------------------------
 */

import { STATUS, ROLE, TERMINAL_STATUSES } from '../models/_shared.js';

export { STATUS, ROLE, TERMINAL_STATUSES };

/** Roles that may move a request through its lifecycle at all (FR-6.4). */
export const TRANSITION_ROLES = Object.freeze([
  ROLE.TECHNICIAN, ROLE.COORDINATOR, ROLE.MANAGER, ROLE.SECURITY_OFFICER,
]);

/**
 * Roles that may reject or close (FR-6.6 "an authorised staff user").
 *
 * On a SECURITY-CATEGORY request the Security Officer is added to this set. That
 * is not a convenience: `mayActOnRequest` restricts every action on a
 * security-category request to the Security Officer, so without it FR-6.6 would
 * be unsatisfiable — no role could close or reject such a request at all
 * (review comment B-1).
 *
 * The consequence went further than FR-6.6. `closure.closedAt` starts the
 * NFR-4.2 retention clock and PROC-001 only anonymises closed requests, so a
 * security-category request that can never be closed is a security-category
 * request that is never anonymised. Those hold the most sensitive personal data
 * in the system, which makes the gap a CON-007 exposure rather than a
 * requirements omission.
 */
const DISPOSITION_ROLES = Object.freeze([ROLE.COORDINATOR, ROLE.MANAGER]);

/** FR-6.6 disposition roles for a given request. See the note above. */
export function dispositionRolesFor({ securityCategory = false } = {}) {
  return securityCategory
    ? Object.freeze([...DISPOSITION_ROLES, ROLE.SECURITY_OFFICER])
    : DISPOSITION_ROLES;
}

/**
 * The transition model. Data rather than control flow, so FR-6.2 can be
 * reviewed against the requirement without reading the service that applies it.
 */
export const TRANSITIONS = Object.freeze({
  // Received -> Assigned is deliberately NOT here. It is reached through
  // POST /requests/{id}/assignments (DEC-015), which sets assigneeId and
  // assignedAt and writes the FR-5.4 assignment history entry. Reached through
  // /transitions it would leave a request Assigned with no assignee, breaking
  // the invariant FR-4.6 (the unassigned set) and FR-5.3 (already has an owner)
  // both read from assigneeId. Review comment N-1.
  [STATUS.RECEIVED]: [
    { to: STATUS.REJECTED, roles: DISPOSITION_ROLES },       // FR-6.6
  ],
  [STATUS.ASSIGNED]: [
    { to: STATUS.IN_PROGRESS, roles: TRANSITION_ROLES },
    { to: STATUS.ON_HOLD,     roles: TRANSITION_ROLES },
    { to: STATUS.REJECTED,    roles: DISPOSITION_ROLES },
  ],
  [STATUS.IN_PROGRESS]: [
    { to: STATUS.ON_HOLD,  roles: TRANSITION_ROLES },
    { to: STATUS.RESOLVED, roles: TRANSITION_ROLES, requiresResolution: true },  // FR-6.5
    { to: STATUS.REJECTED, roles: DISPOSITION_ROLES },       // FR-6.6; review comment N-2
  ],
  [STATUS.ON_HOLD]: [
    { to: STATUS.IN_PROGRESS, roles: TRANSITION_ROLES },
    { to: STATUS.REJECTED,    roles: DISPOSITION_ROLES },
  ],
  [STATUS.RESOLVED]: [
    { to: STATUS.CLOSED,      roles: DISPOSITION_ROLES },    // FR-6.6
    { to: STATUS.IN_PROGRESS, roles: TRANSITION_ROLES },     // reopen
  ],
  [STATUS.CLOSED]:   [],   // terminal
  [STATUS.REJECTED]: [],   // terminal
});

/** Transitions that FR-6.6 requires a recorded reason for. */
export const REASON_REQUIRED = Object.freeze([STATUS.CLOSED, STATUS.REJECTED]);

/**
 * @param {string} from  current status
 * @param {string} to    target status
 * @param {string[]} roles the acting user's roles (FR-1.2 allows more than one)
 * @param {{hasResolution?: boolean, hasReason?: boolean, securityCategory?: boolean}} [context]
 * @returns {{allowed: boolean, reason?: string}}
 */
export function checkTransition(from, to, roles, context = {}) {
  const held = Array.isArray(roles) ? roles : [roles];

  const permitted = TRANSITIONS[from];
  if (!permitted) return { allowed: false, reason: `Unknown status '${from}'` };

  const move = permitted.find((t) => t.to === to);
  if (!move) return { allowed: false, reason: `'${from}' may not move to '${to}'` };

  // FR-6.6 disposition moves depend on the request, not only on the role (B-1).
  const permittedRoles = REASON_REQUIRED.includes(to)
    ? dispositionRolesFor({ securityCategory: context.securityCategory })
    : move.roles;

  if (!permittedRoles.some((r) => held.includes(r))) {
    return { allowed: false, reason: `No held role may move '${from}' to '${to}'` };
  }

  // FR-6.5 — resolution information recorded before Resolved.
  if (move.requiresResolution && !context.hasResolution) {
    return { allowed: false, reason: 'Resolution information is required before Resolved' };
  }

  // FR-6.6 — close or reject with a recorded reason.
  if (REASON_REQUIRED.includes(to) && !context.hasReason) {
    return { allowed: false, reason: `A recorded reason is required to move to '${to}'` };
  }

  return { allowed: true };
}
