/**
 * RequestSubmissionService — creates a request and its 'created' history entry.
 *
 * Traces to: FR-2.1, FR-2.2, FR-2.3, FR-2.5, FR-2.6, AC-FR-2.1, AC-FR-2.2a,
 *            AC-FR-2.2b, AC-FR-2.3, AC-FR-2.5, AC-FR-2.6, DB-01, DEC-011,
 *            DEC-014, DEC-015, DEC-016.
 *
 * Ordering, as in the status transition service:
 *
 *   before the transaction
 *     1. validate the body at the boundary (400, names the field)
 *     2. idempotency replay check (DEC-015 §3)
 *   inside the transaction (DEC-016)
 *     3. the category must be active and in the actor's campus (FR-2.3)
 *     4. allocate the reference from the counter (FR-2.6)
 *     5. insert the request at version 1
 *     6. append the 'created' history entry carrying version 1 and the key
 *
 * Steps 3 to 6 are one unit of work: a request with no history entry, or a number
 * issued to a request that was never stored, cannot commit. DEC-011 names no
 * consequence of submission, so nothing is published.
 *
 * Status choice for a category that is not selectable (DEC-015 §4): the body is
 * well formed, so it is not a schema error (400). The refusal rests on the state
 * of reference data (FR-2.3, FR-9.1), which is a domain rule, so it is 422. The
 * same 422 covers an unknown id, a deactivated category and a category of another
 * campus, so the response does not reveal which of them it was.
 */

import { primaryRole } from '../domain/accessRules.js';
import { AppError, IdempotencyConflictError, ValidationError } from '../errors.js';
import { campusOf } from './campusOf.js';
import { STATUS } from '../models/_shared.js';

/** FR-2.2 — exactly these three are mandatory, and nothing else is accepted. */
export const SUBMISSION_FIELDS = Object.freeze(['categoryId', 'location', 'description']);

/** Model limits (Request.js), restated so a long value is a 400, not a database error. */
const MAX_LENGTH = Object.freeze({ location: 200, description: 5000 });

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** FR-2.3 — DEC-015 §4: a domain rule refused (422). */
export class CategoryNotSelectableError extends AppError {
  constructor() {
    super('The category is not in the active list',
      { status: 422, type: 'https://civicconnect.example/problems/category-not-selectable',
        code: 'CATEGORY_NOT_SELECTABLE' });
  }
}

/**
 * AC-FR-2.2b names the missing field; DEC-015 §5 rejects unknown fields and names them.
 * @returns {{categoryId: string, location: string, description: string}}
 */
export function validateSubmission(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('The request body must be a JSON object');
  }
  for (const key of Object.keys(body)) {
    if (!SUBMISSION_FIELDS.includes(key)) throw new ValidationError(`Unknown field '${key}'`);
  }

  const clean = {};
  for (const field of SUBMISSION_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null) throw new ValidationError(`'${field}' is required`);
    if (typeof value !== 'string') throw new ValidationError(`'${field}' must be a string`);
    const trimmed = value.trim();
    if (trimmed === '') throw new ValidationError(`'${field}' is required`);
    if (MAX_LENGTH[field] && trimmed.length > MAX_LENGTH[field]) {
      throw new ValidationError(`'${field}' must be at most ${MAX_LENGTH[field]} characters`);
    }
    clean[field] = trimmed;
  }
  if (!OBJECT_ID.test(clean.categoryId)) throw new ValidationError("'categoryId' is not a valid identifier");
  return clean;
}

/** One builder for the 201 body and for its replay, so the two cannot differ. */
export function submissionResult({ id, reference, status, version, submittedAt }) {
  return { id: String(id), reference, status, version, submittedAt };
}

export function createRequestSubmissionService({
  requests, history, categories, counters, unitOfWork, clock = () => new Date(),
}) {
  /**
   * @param {{id: string, roles: string[]}} actor
   * @param {object} body
   * @param {{idempotencyKey: string, fingerprint: string}} command
   * @returns {Promise<{result: object, replayed: boolean}>}
   */
  async function submit(actor, body, { idempotencyKey, fingerprint }) {
    const fields = validateSubmission(body);

    // DEC-015 §3 — replay before anything is attempted.
    const prior = await history.findByIdempotencyKey(actor.id, idempotencyKey);
    if (prior) {
      if (prior.changeType !== 'created' || prior.idempotencyFingerprint !== fingerprint) {
        throw new IdempotencyConflictError();
      }
      const original = await requests.findById(prior.requestId);
      return {
        replayed: true,
        result: submissionResult({
          id: prior.requestId, reference: original?.reference, status: prior.toStatus,
          version: prior.requestVersion, submittedAt: prior.occurredAt,
        }),
      };
    }

    const campusId = campusOf(actor);                    // from the session actor (SCP-019)

    let result;
    await unitOfWork.run(async (session) => {
      const category = await categories.findActiveById(campusId, fields.categoryId, { session });
      if (!category) throw new CategoryNotSelectableError();

      const submittedAt = clock();
      const year = submittedAt.getUTCFullYear();
      const seq = await counters.next(year, { session });
      const reference = `CC-${year}-${String(seq).padStart(6, '0')}`;
      const role = primaryRole(actor);

      const created = await requests.create({
        campusId,
        reference,
        categoryId:       category._id,
        location:         fields.location,
        description:      fields.description,
        securityCategory: Boolean(category.isSecurity),   // FR-1.5 snapshot
        status:           STATUS.RECEIVED,
        requesterId:      actor.id,                       // FR-2.5
        submittedById:    actor.id,
        submittedAt,
        statusChangedAt:  submittedAt,
        version:          1,
        lastActorId:      actor.id,
        lastActorRole:    role,
      }, { session });

      await history.append({
        campusId,
        requestId:      created._id,
        requestVersion: 1,
        changeType:     'created',
        fromStatus:     null,
        toStatus:       STATUS.RECEIVED,
        body:           null,
        actorId:        actor.id,
        actorRole:      role,
        occurredAt:     submittedAt,
        idempotencyKey,
        idempotencyFingerprint: fingerprint,
      }, { session });

      result = submissionResult({
        id: created._id, reference, status: STATUS.RECEIVED, version: 1, submittedAt,
      });
    });

    return { result, replayed: false };
  }

  return { submit };
}
