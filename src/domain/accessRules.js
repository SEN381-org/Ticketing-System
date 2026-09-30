/**
 * The single documented authorisation rule set — DEC-012.
 *
 * Traces to: FR-1.3, FR-1.5, FR-3.5, FR-3.6, FR-4.1, FR-4.6, FR-5.2, FR-6.4,
 *            FR-8.6, NFR-3.3, NFR-4.4, CON-019, CFL-002.
 *
 * DEC-012 enforces authorisation at three points — the route boundary, the
 * service once the document is loaded, and the response serialiser — against ONE
 * rule set. This module is that rule set. Review comment R-22 asked whether the
 * intent was one function per operation or one shared rule set; the answer is
 * both, and this file is how the two are reconciled. The RULES are single; the
 * exported predicates are the three enforcement points asking the same rules a
 * different question, because the three points know different things:
 *
 *   mayPerformOperation  route boundary   knows the role only
 *   mayActOnRequest      service          knows the role and the document
 *   visibleStatusFor     serialiser       knows the role, the document and the field
 *
 * `roles` seeds the `roles` collection by migration (data baseline §3.7), so the
 * runtime copy and this file cannot diverge.
 */

import { ROLE, STATUS } from '../models/_shared.js';

/** Function-level rules: which roles may attempt an operation at all. FR-1.3. */
export const OPERATION_RULES = Object.freeze({
  'request:submit':     [ROLE.REQUESTER, ROLE.COORDINATOR],
  'request:read':       Object.values(ROLE),
  'request:transition': [ROLE.TECHNICIAN, ROLE.COORDINATOR, ROLE.MANAGER, ROLE.SECURITY_OFFICER],
  'request:assign':     [ROLE.COORDINATOR, ROLE.MANAGER],
  'request:accept':     [ROLE.TECHNICIAN, ROLE.SECURITY_OFFICER],   // FR-5.2
  'request:comment':    [ROLE.TECHNICIAN, ROLE.COORDINATOR, ROLE.MANAGER, ROLE.SECURITY_OFFICER],
  'report:read':        [ROLE.MANAGER, ROLE.COORDINATOR, ROLE.SECURITY_OFFICER],
});

/** Staff roles, i.e. everything that is not purely a requester. */
const STAFF = Object.freeze([
  ROLE.TECHNICIAN, ROLE.COORDINATOR, ROLE.MANAGER, ROLE.SECURITY_OFFICER,
]);

const held = (actor) => (Array.isArray(actor?.roles) ? actor.roles : []);
const has = (actor, role) => held(actor).includes(role);
const isStaff = (actor) => held(actor).some((r) => STAFF.includes(r));

/**
 * Enforcement point 1 — route boundary. Knows the role, nothing else.
 * An operation with no documented rule is refused rather than permitted.
 */
export function mayPerformOperation(operation, actor) {
  const permitted = OPERATION_RULES[operation];
  if (!permitted) return false;
  return held(actor).some((r) => permitted.includes(r));
}

/**
 * Category authorisation — FR-4.1, FR-4.6, FR-5.2.
 * Staff act on the categories they are authorised for, not on a department.
 * (Review comment R-10: `departmentId` appeared in no requirement.)
 */
function categoryAuthorised(request, actor) {
  const authorisations = (actor?.categoryAuthorisations ?? []).map(String);
  return authorisations.includes(String(request.categoryId));
}

/**
 * Enforcement point 2 — service layer, once the document is loaded.
 * This is the check the route boundary could not make.
 *
 * Security-category requests are restricted to the Security Officer role. FR-1.5
 * restricts the description, comment history and action history of such a
 * request to that role, and a staff member who may not read the description
 * cannot meaningfully act on the request. That inference is recorded as OI-13
 * for confirmation rather than assumed silently.
 */
export function mayActOnRequest(request, actor) {
  if (!isStaff(actor)) return false;
  if (request.securityCategory && !has(actor, ROLE.SECURITY_OFFICER)) return false;
  return categoryAuthorised(request, actor);
}

/**
 * Enforcement point 2, read path — FR-3.6 (a requester sees only their own) and
 * FR-4.1 (staff see what their category authorisation permits).
 */
export function mayViewRequest(request, actor) {
  if (isStaff(actor)) {
    if (request.securityCategory && !has(actor, ROLE.SECURITY_OFFICER)) return false;
    return categoryAuthorised(request, actor);
  }
  if (has(actor, ROLE.REQUESTER)) {
    return String(request.requesterId) === String(actor.id);       // FR-3.6
  }
  return false;
}

/**
 * Enforcement point 3 — response serialiser, and the notification subscriber.
 *
 * FR-3.5: on a security-category request the requester sees only Received,
 * In Progress and Closed. The internal value is never shown; it is mapped first.
 */
const REQUESTER_VISIBLE_SECURITY_STATUS = Object.freeze({
  [STATUS.RECEIVED]:    STATUS.RECEIVED,
  [STATUS.ASSIGNED]:    STATUS.RECEIVED,
  [STATUS.IN_PROGRESS]: STATUS.IN_PROGRESS,
  [STATUS.ON_HOLD]:     STATUS.IN_PROGRESS,
  [STATUS.RESOLVED]:    STATUS.IN_PROGRESS,
  [STATUS.CLOSED]:      STATUS.CLOSED,
  [STATUS.REJECTED]:    STATUS.CLOSED,
});

/**
 * @param {string} status            the internal status
 * @param {boolean} securityCategory whether the request is in a security category
 * @param {object} actor
 * @returns {string} the status this actor may be shown
 */
export function visibleStatusFor(status, securityCategory, actor) {
  if (!securityCategory) return status;
  if (has(actor, ROLE.SECURITY_OFFICER)) return status;
  if (isStaff(actor)) return status;                       // FR-8.6 counts, not detail
  return REQUESTER_VISIBLE_SECURITY_STATUS[status] ?? STATUS.RECEIVED;
}

export const STAFF_ROLES = STAFF;
