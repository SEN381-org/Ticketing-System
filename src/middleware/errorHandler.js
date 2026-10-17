/**
 * RFC 9457 problem-details error handler — DEC-015.
 *
 * Traces to: NFR-3.3, CON-019, DEC-015.
 *
 * Review comment R-05: previously the route returned `{ error: message }` and
 * passed anything unrecognised to Express's default handler, which serves an
 * HTML page with a stack trace unless NODE_ENV is production. That is an
 * information leak CON-019 probing finds immediately. Every error now leaves
 * through here: known errors become a stable problem type, and everything else
 * becomes an opaque 500 whose detail is logged, never sent.
 */

import { AppError } from '../errors.js';

const GENERIC = Object.freeze({
  status: 500,
  type: 'https://civicconnect.example/problems/internal-error',
  code: 'INTERNAL_ERROR',
  title: 'Internal Server Error',
  detail: 'The request could not be completed.',
});

export function createErrorHandler({ log = console } = {}) {
  return function errorHandler(error, req, res, _next) {
    const known = error instanceof AppError;

    if (!known) log.error('[unhandled]', error);

    const problem = known
      ? {
          type:   error.type,
          title:  error.name,
          status: error.status,
          detail: error.message,
          code:   error.code,
        }
      : { ...GENERIC };

    if (req?.originalUrl) problem.instance = req.originalUrl;

    // RFC 9457 §3.2 extension members, e.g. the current ETag on a 412 (DEC-015 §2).
    // A standard member is never overwritten by an extension.
    if (known && error.extensions) {
      for (const [name, value] of Object.entries(error.extensions)) {
        if (!(name in problem)) problem[name] = value;
      }
    }

    res.status(problem.status)
       .type('application/problem+json')
       .json(problem);
  };
}
