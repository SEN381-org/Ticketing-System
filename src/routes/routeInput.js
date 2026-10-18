/**
 * Boundary input helpers shared by the M4 management and administration routes.
 *
 * Traces to: DEC-015 §3 (Idempotency-Key), DEC-015 §4 (a malformed id is a 400,
 * never a 500), DEC-015 §5 (boundary validation), DEC-015 Addendum A.
 */

import { IdempotencyKeyRequiredError, ValidationError } from '../errors.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** @returns {string} the id, or throws a 400 that names the parameter. */
export function parseObjectId(value, name = 'id') {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new ValidationError(`${name} must be a 24-character hexadecimal identifier`);
  }
  return value;
}

/** DEC-015 §3 — required on every state-changing POST or PUT. Missing is a 400. */
export function requireIdempotencyKey(req) {
  const key = req.get ? req.get('Idempotency-Key') : req.headers?.['idempotency-key'];
  if (!key || !String(key).trim()) throw new IdempotencyKeyRequiredError();
  return String(key).trim();
}

/** The body must be a JSON object (DEC-015 §5). */
export function requireObjectBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('The body must be a JSON object');
  }
  return body;
}

/** DEC-015 §5 — unknown fields are rejected, and the message names them. */
export function rejectUnknownFields(body, allowed) {
  const unknown = Object.keys(body).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) throw new ValidationError(`Unknown field: ${unknown.join(', ')}`);
}
