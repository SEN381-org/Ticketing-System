/**
 * StatusTransitionService — the only component permitted to change a request's
 * status or to write a history entry.
 *
 * Traces to: FR-6.2 (controlled transitions), FR-6.3 (history entry per change),
 *            FR-6.4 (acting role validated), FR-6.7 (immutable history),
 *            AC-FR-6.7, SCP-008, DEC-011, DEC-012 (enforcement point 2).
 *
 * Ordering is load-bearing and is the point at which DEC-011 draws its line:
 *
 *   1. commit the status change            direct write
 *   2. append the history entry            direct write  — FR-6.3, FR-6.7
 *   3. publish request.status.changed      event         — DEC-011
 *
 * Steps 1 and 2 are not published as events. FR-6.7 must not be capable of
 * succeeding or failing separately from the status change it records: a history
 * entry lost while the status change committed would not satisfy AC-FR-6.7.
 * The event mechanism carries only those consequences that may fail
 * independently of the transition.
 *
 * Collaborators are injected so that the decision this service implements can
 * be verified without a database. See tests/statusTransitionService.test.js.
 */

import { checkTransition } from '../domain/requestStatus.js';
import { EVENTS, publish } from '../events/requestEvents.js';

export class TransitionError extends Error {
  constructor(message) { super(message); this.name = 'TransitionError'; this.status = 422; }
}

export class AuthorisationError extends Error {
  constructor(message) { super(message); this.name = 'AuthorisationError'; this.status = 403; }
}

export class NotFoundError extends Error {
  constructor(message) { super(message); this.name = 'NotFoundError'; this.status = 404; }
}

export function createStatusTransitionService({ requests, history, clock = () => new Date() }) {
  /**
   * @param {string} requestId
   * @param {string} toStatus
   * @param {{id: string, role: string, departmentId?: string}} actor
   * @param {{note?: string}} [options]
   */
  async function transition(requestId, toStatus, actor, options = {}) {
    const request = await requests.findById(requestId);
    if (!request) throw new NotFoundError(`Request '${requestId}' does not exist`);

    // DEC-012, enforcement point 2: object-level access. The route boundary
    // could not have made this check, because the document was not yet loaded.
    if (!mayActOn(request, actor)) {
      throw new AuthorisationError('Actor may not act on this request');
    }

    const verdict = checkTransition(request.status, toStatus, actor.role);
    if (!verdict.allowed) throw new TransitionError(verdict.reason);

    const fromStatus = request.status;
    const occurredAt = clock();

    // 1 - commit the status change.
    await requests.updateStatus(requestId, toStatus, occurredAt);

    // 2 - append the history entry. Direct, not a subscriber. FR-6.3, FR-6.7.
    await history.append({
      requestId,
      changeType: 'status',
      fromStatus,
      toStatus,
      actorId:    actor.id,
      actorRole:  actor.role,
      note:       options.note ?? null,
      occurredAt,
    });

    // 3 - publish. Consequences subscribe; this service does not know them. DEC-011.
    publish(EVENTS.REQUEST_STATUS_CHANGED, {
      requestId,
      fromStatus,
      toStatus,
      actorId:      actor.id,
      reporterId:   request.reporterId,
      departmentId: request.departmentId,
      occurredAt,
    });

    return { requestId, fromStatus, toStatus, occurredAt };
  }

  return { transition };
}

/**
 * Object-level access rule. DEC-012 — evaluated against the same rule set the
 * route boundary uses, at the point where the document is available.
 */
function mayActOn(request, actor) {
  if (actor.role === 'Administrator') return true;
  if (actor.role === 'Department Head' || actor.role === 'Department Staff') {
    return String(request.departmentId) === String(actor.departmentId);
  }
  return false;
}
