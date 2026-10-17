/**
 * Identifier shape check at the service boundary.
 *
 * Traces to: DEC-015 §4, §5 (a malformed identifier is a 400, never a 500).
 */

import { ValidationError } from '../errors.js';

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

/** @throws {ValidationError} when the value is not a 24-character hexadecimal ObjectId. */
export function assertObjectId(value, name = 'id') {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) {
    throw new ValidationError(`'${name}' is not a valid identifier`);
  }
  return value;
}
