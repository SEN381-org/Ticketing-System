/**
 * API caching policy - every /api response is per viewer and is never cached.
 *
 * Traces to: FR-1.5, FR-3.6, TD-003, DEC-012, DEC-015 §1.
 *
 * The ETag on GET /api/v1/requests/:id is "v<version>", which depends on the version
 * alone, while the body differs per viewer (allow-lists, permittedTransitions).
 * Express answers a matching If-None-Match with 304, so a browser that changed user
 * reused the previous user's cached body, restricted FR-1.5 fields included. Two
 * measures, both here and nowhere else:
 *
 *   Cache-Control: no-store   on every response under /api, problem responses too
 *   conditional-GET headers   If-None-Match and If-Modified-Since are dropped from the
 *                             request, so the API never answers 304
 *
 * The ETag header is kept: DEC-015 uses it only as the value of If-Match on writes,
 * which this does not touch.
 */

const CONDITIONAL_GET_HEADERS = Object.freeze(['if-none-match', 'if-modified-since']);

export function apiCaching(req, res, next) {
  res.set('Cache-Control', 'no-store');
  for (const name of CONDITIONAL_GET_HEADERS) delete req.headers[name];
  next();
}
