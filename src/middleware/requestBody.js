/**
 * Request-body boundary — DEC-015 §5.
 *
 * Traces to: DEC-015, DEC-018 §5, CON-019.
 *
 * Three rules:
 *   1. A write must be `application/json` (415 otherwise). With SameSite=Lax this
 *      is the CSRF mitigation DEC-015 records: an HTML form cannot send JSON.
 *   2. The body is parsed strictly and capped at 32 kB.
 *   3. A body that cannot be parsed is the client's error (400 or 413), not an
 *      opaque 500. The body parser's own errors are not AppErrors, so without
 *      this mapping the error handler would report a malformed body as a server
 *      fault.
 */

import express from 'express';
import { PayloadTooLargeError, UnsupportedMediaTypeError, ValidationError } from '../errors.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export function requireJsonOnWrites(req, res, next) {
  if (WRITE_METHODS.has(req.method) && !req.is('application/json')) {
    return next(new UnsupportedMediaTypeError());
  }
  return next();
}

export const parseJsonBody = express.json({ limit: '32kb', strict: true });

export function mapBodyErrors(error, req, res, next) {
  switch (error?.type) {
    case 'entity.parse.failed':  return next(new ValidationError('The body is not valid JSON'));
    case 'entity.too.large':     return next(new PayloadTooLargeError());
    case 'charset.unsupported':
    case 'encoding.unsupported': return next(new UnsupportedMediaTypeError());
    default:                     return next(error);
  }
}
