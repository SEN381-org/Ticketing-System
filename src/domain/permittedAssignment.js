/**
 * Whether an actor may assign or accept a request, as data for the request detail,
 * and the status/ownership rule the assignment service enforces.
 *
 * Traces to: FR-5.1, FR-5.2, FR-5.3, FR-5.5, FR-6.1, TD-003, OI-15, DEC-012, DEC-015 §6.
 *
 * Team decision of 17/10/2026 (OI-15): assignment is permitted ONLY in Received (assign
 * an unassigned request) and in Assigned, In Progress and On Hold (reassign, or accept
 * where the unassigned rules apply). It is refused in Resolved, Closed and Rejected.
 * Which user fits which request (Security Officer on security only, Technician on
 * non-security only) is mayBeAssigned in accessRules.js.
 *
 * `assignmentRefusal` is the one statement of the status and ownership rule; the
 * assignment service calls it to refuse, and `permittedAssignmentFor` calls it to
 * advertise, so the two cannot disagree. tests/permittedAssignment.test.js proves it
 * against the real service for every status, ownership, security flag and role.
 *
 * `assign` covers both a first assignment and a reassignment, which are one command
 * (assignmentService.js); `accept` is the actor naming themselves.
 */

import { mayActOnRequest, mayBeAssigned, mayPerformOperation } from './accessRules.js';
import { STATUS, ROLE } from '../models/_shared.js';

/** The statuses in which an owned request may be reassigned. */
const REASSIGNABLE = Object.freeze([STATUS.ASSIGNED, STATUS.IN_PROGRESS, STATUS.ON_HOLD]);
/** The statuses in which assignment is refused whatever the owner. */
const ASSIGNMENT_CLOSED = Object.freeze([STATUS.RESOLVED, STATUS.CLOSED, STATUS.REJECTED]);

/**
 * @param {{status: string, assigneeId?: *}} request
 * @param {boolean} accepting  the actor is naming themselves (an accept)
 * @returns {string|null} the reason assignment is refused, or null when the status and
 *   ownership permit it
 */
export function assignmentRefusal(request, accepting) {
  const owner = request.assigneeId ?? null;
  if (ASSIGNMENT_CLOSED.includes(request.status)) {
    return `A request that is ${request.status} cannot be assigned`;
  }
  // FR-5.3 - the owner stays the owner; an accept never replaces one.
  if (accepting && owner !== null) return 'This request already has an owner';
  if (owner === null && request.status !== STATUS.RECEIVED) {
    return `An unassigned request in status ${request.status} cannot be assigned`;
  }
  if (owner !== null && !REASSIGNABLE.includes(request.status)) {
    return `A request that is ${request.status} cannot be reassigned`;
  }
  return null;
}

/**
 * The FR-1.2 roles a user must hold to be named as this request's owner (decision #10:
 * Security Officer for a security-category request, Technician otherwise). Derived by
 * asking mayBeAssigned about a user holding only that role and authorised for the
 * request's category, so the pool a client offers can never disagree with the rule the
 * service enforces.
 */
export function assigneeRolesFor(request) {
  const categoryId = request.categoryId == null ? null : String(request.categoryId);
  return Object.values(ROLE).filter((role) => mayBeAssigned(request, {
    roles: [role], categoryAuthorisations: categoryId ? [categoryId] : [], campusId: request.campusId,
  }));
}

/**
 * @param {object} request
 * @param {{id?: string, roles?: string[], categoryAuthorisations?: string[], campusId?: string}} actor
 * @returns {{assign: boolean, accept: boolean, assigneeRoles: string[]}}
 *   assigneeRoles is the pool to offer when assign is true, otherwise empty.
 */
export function permittedAssignmentFor(request, actor) {
  if (!mayActOnRequest(request, actor)) return { assign: false, accept: false, assigneeRoles: [] };
  const sameCampus = !actor.campusId || String(actor.campusId) === String(request.campusId);
  const assign = mayPerformOperation('request:assign', actor) && assignmentRefusal(request, false) === null;
  return {
    assign,
    accept: mayPerformOperation('request:accept', actor) && assignmentRefusal(request, true) === null
      && mayBeAssigned(request, actor) && sameCampus,
    assigneeRoles: assign ? assigneeRolesFor(request) : [],
  };
}
