/**
 * Performance log — one structured entry per request-handling operation.
 *
 * Traces to: NFR-1.11, AC-NFR-1.11, DEC-017 (purpose D: performance logs carry no
 * personal information and are kept 30 days), CON-007.
 *
 * Each entry is one JSON line with exactly four members:
 *   kind        always "perf", so the entries can be selected from the process log
 *   operation   the HTTP method and the route PATTERN (e.g. "POST /api/v1/requests/:id/transitions"),
 *               never the concrete URL, so no identifier, reference or search text appears
 *   durationMs  whole milliseconds from arrival to the response finishing
 *   outcome     the HTTP status code
 * Nothing from the body, the query string, the headers or the actor is read, so a
 * name, e-mail address, student number or free-text description cannot reach it.
 *
 * What this does NOT do: ship the log anywhere. On staging the entries go to the
 * service's standard output (journald); retention is the host's, not this module's.
 */

const now = () => Number(process.hrtime.bigint() / 1_000_000n);

/**
 * The route pattern Express matched, or a fixed label when nothing matched. The mount path
 * is the one app.js recorded on res.locals: req.baseUrl is reset once an error has left the
 * router, which logged "POST /" for a 400, 401 or 403 (S5).
 */
function operationOf(req, res) {
  const pattern = req.route?.path;
  if (pattern === undefined) return `${req.method} (no route)`;
  const base = res.locals?.mountPath ?? req.baseUrl ?? '';
  return `${req.method} ${pattern === '/' ? base || '/' : `${base}${pattern}`}`;
}

export function createPerformanceLog({ log = console } = {}) {
  // A logger without an info or log method writes nothing; it never breaks a response.
  const write = typeof log.info === 'function' ? log.info
    : typeof log.log === 'function' ? log.log : null;

  return function performanceLog(req, res, next) {
    if (!write) return next();
    const started = now();
    res.on('finish', () => {
      const entry = {
        kind:       'perf',
        operation:  operationOf(req, res),
        durationMs: now() - started,
        outcome:    res.statusCode,
      };
      try { write.call(log, JSON.stringify(entry)); } catch { /* logging must not fail a request */ }
    });
    return next();
  };
}
