/**
 * AssignmentService - assign, accept and reassign a request; refuse an accept on
 * an owned request and record the refusal.
 *
 * Traces to: FR-5.1, FR-5.2, FR-5.3, FR-5.4, FR-5.5, FR-1.3, AC-FR-5.1 to
 *            AC-FR-5.5, AC-FR-1.3, TD-005, DEC-011, DEC-012 (enforcement
 *            point 2), DEC-015, DEC-016.
 *
 * One command, three meanings, decided by who is acting and who is named:
 *
 *   accept    the actor names themselves and holds `request:accept`
 *             (Technician, Security Officer). FR-5.2, FR-5.3.
 *   assign    anything else, from an actor holding `request:assign`
 *             (Coordinator, Manager), to a request with no owner. FR-5.1.
 *   reassign  the same, to a request that already has an owner. FR-5.5.
 *
 * An actor who holds `request:accept` but not `request:assign` and names someone
 * else passes the route guard (which admits either) and is refused here, and
 * that refusal is recorded like any other (AC-FR-1.3).
 *
 * Ordering, as in statusTransitionService (DEC-016):
 *   idempotency replay check
 *   inside the unit of work: load, authorise, version check, domain rules,
 *     conditional update (version AND owner), append the history entry
 *   after it resolves: record a refusal, or publish the status change
 *
 * Received -> Assigned is made here and nowhere else (requestStatus.js, N-1). A
 * request already past Assigned keeps its status when it is reassigned.
 *
 * A refusal is recorded OUTSIDE the unit of work. `withTransaction` can re-run
 * its callback, and the audit write is not part of the transaction, so recording
 * inside would duplicate it on a retry. The refusal throws, the transaction
 * rolls back with no write, and only then is the attempt recorded.
 */

import { mayActOnRequest, mayPerformOperation, primaryRole } from '../domain/accessRules.js';
import { EVENTS, publish } from '../events/requestEvents.js';
import { STATUS, TERMINAL_STATUSES } from '../models/_shared.js';
import {
  AssignmentRefusedError, AuthorisationError, IdempotencyConflictError,
  NotFoundError, PreconditionFailedError,
} from '../errors.js';

export const ASSIGNMENT_ACTIONS = Object.freeze({
  ASSIGN: 'assign', ACCEPT: 'accept', REASSIGN: 'reassign',
});

export function createAssignmentService({
  requests, users, history, unitOfWork, recordRefusal = async () => false, clock = () => new Date(),
}) {
  /**
   * @param {string} requestId
   * @param {string} assigneeId  the user to become the owner
   * @param {{id: string, roles: string[], categoryAuthorisations?: string[]}} actor
   * @param {{expectedVersion: number, idempotencyKey: string, fingerprint: string}} command
   */
  async function assign(requestId, assigneeId, actor, command = {}) {
    const { expectedVersion, idempotencyKey = null, fingerprint = null } = command;

    // DEC-015 - replay detection before anything is attempted.
    if (idempotencyKey) {
      const prior = await history.findByIdempotencyKey(actor.id, idempotencyKey);
      if (prior) {
        if (prior.idempotencyFingerprint !== fingerprint) throw new IdempotencyConflictError();
        return replayOf(prior);
      }
    }

    const accepting = isAccept(assigneeId, actor);
    const operation = accepting ? 'request:accept' : 'request:assign';

    let result;
    let statusChange = null;

    try {
      // FR-1.3 at the service: the guard admits either operation, so the one this
      // body amounts to is checked here, before the document is touched.
      if (!mayPerformOperation(operation, actor)) {
        throw new AuthorisationError(`Actor may not perform ${operation}`);
      }

      await unitOfWork.run(async (session) => {
        const request = await requests.findById(requestId, { session });
        if (!request) throw new NotFoundError(requestId);

        // DEC-012 point 2: category authorisation, and the security-category rule.
        if (!mayActOnRequest(request, actor)) {
          throw new AuthorisationError('Actor may not act on this request');
        }

        if (request.version !== expectedVersion) {
          throw new PreconditionFailedError(requestId, expectedVersion);
        }

        const owner = request.assigneeId ?? null;

        if (TERMINAL_STATUSES.includes(request.status)) {
          throw new AssignmentRefusedError(`A request that is ${request.status} cannot be assigned`);
        }
        // FR-5.3 - the owner stays the owner; an accept never replaces one.
        if (accepting && owner !== null) {
          throw new AssignmentRefusedError('This request already has an owner');
        }
        if (owner !== null && String(owner) === String(assigneeId)) {
          throw new AssignmentRefusedError('The named user already owns this request');
        }
        if (owner === null && request.status !== STATUS.RECEIVED) {
          throw new AssignmentRefusedError(`An unassigned request in status ${request.status} cannot be assigned`);
        }

        // FR-5.1 / FR-5.2: the new owner must be staff the request may be given to.
        const assignee = accepting ? actor : await users.findById(assigneeId);
        if (!assignee || assignee.status === 'revoked'
            || (assignee.campusId && String(assignee.campusId) !== String(request.campusId))
            || !mayActOnRequest(request, assignee)) {
          throw new AssignmentRefusedError('The named user cannot be assigned this request');
        }

        const occurredAt = clock();
        const firstAssignment = owner === null;
        const fromStatus = request.status;
        const toStatus = firstAssignment ? STATUS.ASSIGNED : request.status;

        // 1 - conditional on the version AND on the owner still being who was read.
        const { version } = await requests.applyAssignment(
          requestId, expectedVersion, owner,
          { assigneeId, assignedAt: occurredAt,
            ...(firstAssignment ? { status: STATUS.ASSIGNED, statusChangedAt: occurredAt } : {}) },
          actor, { session },
        );

        // 2 - the FR-5.4 entry, in the same transaction: acting user, date and time.
        const entry = await history.append({
          campusId:       request.campusId,
          requestId,
          requestVersion: version,
          changeType:     'assignment',
          fromStatus:     firstAssignment ? fromStatus : null,
          toStatus:       firstAssignment ? toStatus : null,
          fromAssigneeId: owner,
          toAssigneeId:   assigneeId,
          body:           null,
          actorId:        actor.id,
          actorRole:      primaryRole(actor),
          occurredAt,
          idempotencyKey,
          idempotencyFingerprint: fingerprint,
        }, { session });

        result = {
          requestId,
          action: accepting ? ASSIGNMENT_ACTIONS.ACCEPT
            : firstAssignment ? ASSIGNMENT_ACTIONS.ASSIGN : ASSIGNMENT_ACTIONS.REASSIGN,
          fromAssigneeId: owner,
          toAssigneeId:   assigneeId,
          status:         toStatus,
          occurredAt,
          version,
          historyId:      entry._id,
        };
        if (firstAssignment) {
          statusChange = {
            requestId, fromStatus, toStatus, occurredAt, version,
            historyId:        entry._id,
            reporterId:       request.requesterId,
            categoryId:       request.categoryId,
            campusId:         request.campusId,
            reference:        request.reference,
            securityCategory: request.securityCategory,
          };
        }
      });
    } catch (error) {
      // AC-FR-1.3, AC-FR-5.3, TD-005. Only a refusal is recorded; a stale
      // version, a missing request or an infrastructure fault is not one.
      if (error instanceof AuthorisationError || error instanceof AssignmentRefusedError) {
        await Promise.resolve(recordRefusal({ actor, operation, targetId: requestId })).catch(() => {});
      }
      throw error;
    }

    // 3 - publish, after commit and outside the callback. DEC-011, R-16.
    if (statusChange) publish(EVENTS.REQUEST_STATUS_CHANGED, statusChange);
    return result;
  }

  return { assign };
}

/** The actor names themselves and holds the accept operation. See the file header. */
function isAccept(assigneeId, actor) {
  return String(assigneeId) === String(actor.id) && mayPerformOperation('request:accept', actor);
}

function replayOf(entry) {
  return {
    requestId:      entry.requestId,
    fromAssigneeId: entry.fromAssigneeId ?? null,
    toAssigneeId:   entry.toAssigneeId,
    status:         entry.toStatus ?? null,
    occurredAt:     entry.occurredAt,
    version:        entry.requestVersion,
    historyId:      entry._id,
    replayed:       true,
  };
}
