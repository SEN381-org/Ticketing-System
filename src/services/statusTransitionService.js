/**
 * StatusTransitionService — the only component permitted to change a request's
 * status or write a history entry.
 *
 * Traces to: FR-6.2, FR-6.3, FR-6.4, FR-6.5, FR-6.6, FR-6.7, AC-FR-6.7,
 *            SCP-008, DEC-011, DEC-012 (enforcement point 2), DEC-014, DEC-015.
 *
 * Ordering, and where DEC-011 draws its line:
 *
 *   inside the transaction (DEC-015)
 *     1. commit the status change, conditional on the version
 *     2. append the history entry, carrying the version it produced
 *   after commit (DEC-011)
 *     3. publish request.status.changed
 *
 * Steps 1 and 2 are one unit of work. FR-6.7 must not be capable of succeeding
 * or failing separately from the status change it records, and this file
 * previously claimed that while performing two independent writes (review
 * comment R-15). DEC-011 is unchanged by the correction: its line has always sat
 * between steps 2 and 3, and steps 1 and 2 were always meant to be one unit.
 *
 * Publication is outside the callback, not merely after the writes.
 * `withTransaction` re-runs its callback on a transient error, so publishing
 * inside it would emit duplicate events, or an event for a transaction that then
 * aborted (R-16).
 *
 * Collaborators — including the unit of work — are injected, so the decisions
 * this service implements are verifiable without a database.
 */

import { checkTransition, STATUS } from '../domain/requestStatus.js';
import { mayActOnRequest } from '../domain/accessRules.js';
import { EVENTS, publish } from '../events/requestEvents.js';
import {
  AuthorisationError, NotFoundError, PreconditionFailedError,
  IdempotencyConflictError, TransitionError,
} from '../errors.js';

export function createStatusTransitionService({ requests, history, unitOfWork, clock = () => new Date() }) {
  /**
   * @param {string} requestId
   * @param {string} toStatus
   * @param {{id: string, roles: string[], categoryAuthorisations?: string[]}} actor
   * @param {{expectedVersion: number, note?: string, resolutionSummary?: string,
   *          idempotencyKey?: string, fingerprint?: string}} command
   */
  async function transition(requestId, toStatus, actor, command = {}) {
    const { expectedVersion, note = null, resolutionSummary = null,
            idempotencyKey = null, fingerprint = null } = command;

    // DEC-014 — replay detection before anything is attempted. A client retry
    // after a timeout must not write a second immutable history entry.
    if (idempotencyKey) {
      const prior = await history.findByIdempotencyKey(actor.id, idempotencyKey);
      if (prior) {
        if (prior.idempotencyFingerprint !== fingerprint) throw new IdempotencyConflictError();
        return replayOf(prior);
      }
    }

    let result;

    await unitOfWork.run(async (session) => {
      const request = await requests.findById(requestId, { session });
      if (!request) throw new NotFoundError(requestId);

      // DEC-012, enforcement point 2: object-level access. The route boundary
      // could not have made this check — the document was not yet loaded.
      if (!mayActOnRequest(request, actor)) {
        throw new AuthorisationError('Actor may not act on this request');
      }

      // DEC-014 / DEC-015 — optimistic concurrency, before any validation work.
      if (request.version !== expectedVersion) {
        throw new PreconditionFailedError(requestId, expectedVersion);
      }

      const verdict = checkTransition(request.status, toStatus, actor.roles, {
        hasResolution: Boolean(resolutionSummary) || Boolean(request.resolution?.summary),
        hasReason:     Boolean(note),
      });
      if (!verdict.allowed) throw new TransitionError(verdict.reason);

      const fromStatus = request.status;
      const occurredAt = clock();

      // 1 — commit the status change. Conditional on the version; refuses if it moved.
      const { version } = await requests.applyChange(
        requestId, expectedVersion,
        { status: toStatus, statusChangedAt: occurredAt,
          ...fieldsFor(toStatus, actor, occurredAt, note, resolutionSummary) },
        actor, { session },
      );

      // 2 — append the history entry, in the same transaction. FR-6.3, FR-6.7.
      const entry = await history.append({
        campusId:       request.campusId,
        requestId,
        requestVersion: version,
        changeType:     'status',
        fromStatus,
        toStatus,
        body:           note,
        actorId:        actor.id,
        actorRole:      primaryRole(actor),
        occurredAt,
        idempotencyKey,
        idempotencyFingerprint: fingerprint,
      }, { session });

      result = {
        requestId, fromStatus, toStatus, occurredAt, version,
        historyId:        entry._id,
        reporterId:       request.requesterId,
        categoryId:       request.categoryId,
        campusId:         request.campusId,
        reference:        request.reference,
        securityCategory: request.securityCategory,
      };
    });

    // 3 — publish, after commit and outside the callback. DEC-011, R-16.
    publish(EVENTS.REQUEST_STATUS_CHANGED, result);
    return result;
  }

  return { transition };
}

/** FR-6.5 resolution fields and FR-6.6 closure fields, set by the transition that needs them. */
function fieldsFor(toStatus, actor, at, note, resolutionSummary) {
  if (toStatus === STATUS.RESOLVED && resolutionSummary) {
    return { 'resolution.summary': resolutionSummary,
             'resolution.recordedAt': at,
             'resolution.recordedById': actor.id };
  }
  if (toStatus === STATUS.CLOSED || toStatus === STATUS.REJECTED) {
    return { 'closure.reason': note, 'closure.closedAt': at, 'closure.closedById': actor.id };
  }
  return {};
}

/** The role recorded against the entry. FR-1.2 permits more than one. */
function primaryRole(actor) {
  return Array.isArray(actor.roles) ? actor.roles[0] : actor.roles;
}

function replayOf(entry) {
  return {
    requestId: entry.requestId, fromStatus: entry.fromStatus, toStatus: entry.toStatus,
    occurredAt: entry.occurredAt, version: entry.requestVersion, historyId: entry._id,
    replayed: true,
  };
}
