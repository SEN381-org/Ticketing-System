/**
 * WorkRecordService — comments, actions and requester details appended to a request.
 *
 * Traces to: FR-7.1, FR-7.2, FR-7.3, FR-2.4, FR-6.7, AC-FR-6.7, DB-01, DEC-011,
 *            DEC-012 (enforcement point 2), DEC-015 §1 and §3, DEC-016.
 *
 * Each entry is a requestHistory append (DB-01). DB-01 defines `requestVersion` as
 * the request version the entry PRODUCED and states the invariant
 * `version == max(requestHistory.requestVersion)`, so an append advances the
 * request version by one through the same version-conditional `applyChange` a
 * transition uses, in the same unit of work (DEC-016). The unique
 * {requestId, requestVersion} index therefore stays meaningful.
 *
 * DEC-015 §1 says the append needs no `If-Match`: the caller does not name a
 * version, the service reads the current one inside the transaction. If another
 * write lands between that read and the conditional update, the write is retried
 * on the new version, a bounded number of times, then refused with 409
 * (DEC-015 §4, "write-conflict retries exhausted").
 *
 * Deliberately NOT published as a DEC-011 event: nothing subscribes to a comment,
 * and the append is the direct write inside the transaction, as for a transition.
 *
 * There is no update or delete here, and none in the repository interface (FR-6.7).
 */

import { mayActOnRequest, primaryRole } from '../domain/accessRules.js';
import { assertObjectId } from '../domain/objectId.js';
import {
  AuthorisationError, IdempotencyConflictError, NotFoundError, ValidationError,
  WriteConflictError, PreconditionFailedError,
} from '../errors.js';
import { assertMayView } from './viewAccess.js';

export const MAX_BODY_LENGTH = 5000;      // requestHistory.body, DB-01 §3.3
export const MAX_ATTEMPTS = 3;

const KINDS = Object.freeze({
  comment: { changeType: 'comment', actor: 'staff' },       // FR-7.1
  action:  { changeType: 'action',  actor: 'staff' },       // FR-7.2
  detail:  { changeType: 'detail',  actor: 'requester' },   // FR-2.4
});

/** Boundary validation: a non-blank string within the stored limit. DEC-015 §5. */
export function validateEntryBody(body) {
  if (typeof body !== 'string' || body.trim().length === 0) throw new ValidationError("'body' is required");
  if (body.length > MAX_BODY_LENGTH) throw new ValidationError(`'body' exceeds ${MAX_BODY_LENGTH} characters`);
  return body.trim();
}

export function createWorkRecordService({ requests, history, unitOfWork, clock = () => new Date() }) {
  /**
   * @param {'comment'|'action'|'detail'} kind
   * @param {string} requestId
   * @param {{id: string, roles: string[], categoryAuthorisations?: string[]}} actor
   * @param {{body: string, idempotencyKey: string, fingerprint: string}} command
   */
  async function append(kind, requestId, actor, command) {
    const { changeType, actor: who } = KINDS[kind];
    assertObjectId(requestId);
    const { idempotencyKey, fingerprint } = command;
    const body = validateEntryBody(command.body);

    // DEC-015 §3 — replay before anything is attempted; no second immutable entry.
    const prior = await history.findByIdempotencyKey(actor.id, idempotencyKey);
    if (prior) {
      if (prior.idempotencyFingerprint !== fingerprint) throw new IdempotencyConflictError();
      return resultOf(prior, true);
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await unitOfWork.run(async (session) => {
          const request = await requests.findById(requestId, { session });
          if (!request) throw new NotFoundError(requestId);
          authorise(who, request, actor, requestId);

          const occurredAt = clock();
          const { version } = await requests.applyChange(requestId, request.version, {}, actor, { session });
          const entry = await history.append({
            campusId:       request.campusId,
            requestId,
            requestVersion: version,
            changeType,
            body,
            actorId:        actor.id,
            actorRole:      primaryRole(actor),
            occurredAt,
            idempotencyKey,
            idempotencyFingerprint: fingerprint,
          }, { session });
          return resultOf({ _id: entry._id, requestId, requestVersion: version, changeType, occurredAt }, false);
        });
      } catch (error) {
        if (!(error instanceof PreconditionFailedError)) throw error;
        if (attempt === MAX_ATTEMPTS) throw new WriteConflictError();
      }
    }
    throw new WriteConflictError();       // unreachable; keeps the function total
  }

  return {
    addComment: (requestId, actor, command) => append('comment', requestId, actor, command),
    addAction:  (requestId, actor, command) => append('action', requestId, actor, command),
    addDetail:  (requestId, actor, command) => append('detail', requestId, actor, command),
  };
}

/** DEC-012 point 2. Staff entries need mayActOnRequest; a detail needs the owning Requester. */
function authorise(who, request, actor, requestId) {
  if (who === 'staff') {
    if (!mayActOnRequest(request, actor)) throw new AuthorisationError('Actor may not act on this request');
    return;
  }
  assertMayView(request, actor, requestId);                       // 404 for another user's request
  if (String(request.requesterId) !== String(actor.id)) {
    throw new AuthorisationError('Only the requester may add detail to a request');
  }
}

function resultOf(entry, replayed) {
  const result = {
    requestId:      String(entry.requestId),
    historyId:      String(entry._id),
    changeType:     entry.changeType,
    requestVersion: entry.requestVersion,
    occurredAt:     entry.occurredAt,
    version:        entry.requestVersion,
  };
  return replayed ? { ...result, replayed: true } : result;
}
