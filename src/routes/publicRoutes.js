/**
 * The routes that carry no authorisation guard — DEC-012, DEC-015, DEC-018 §5.
 *
 * Traces to: NFR-3.3, CON-019.
 *
 * Every other route must carry the composed guard, and
 * tests/authorisationGuard.test.js fails the build if one does not. This list is
 * therefore the complete statement of what an unauthenticated client can reach.
 * Each entry says why it needs no guard. The same test refuses an entry without
 * a reason, and refuses an entry that matches no registered route.
 */

export const PUBLIC_ROUTES = Object.freeze([
  // NFR-1.6 / AC-NFR-1.6 require the health endpoint to answer "without requiring
  // a user account". It pings the database and returns no data.
  Object.freeze({
    method: 'GET', path: '/api/v1/health',
    reason: 'NFR-1.6 requires it without a user account; it reads no collection',
  }),

  // FR-1.1 — this is how an account authenticates, so it cannot require being
  // authenticated already. Every failure is one identical 401 (DEC-018 §5).
  Object.freeze({
    method: 'POST', path: '/api/v1/sessions',
    reason: 'Logging in cannot require being logged in (FR-1.1)',
  }),

  // DEC-018 §5 — idempotent. It can only end the session named by the caller's
  // own cookie, never reveals whether one existed, and SameSite=Lax keeps the
  // cookie off a cross-site DELETE. Guarding it would need a new rule in the
  // DEC-012 rule set to protect nothing.
  Object.freeze({
    method: 'DELETE', path: '/api/v1/sessions/current',
    reason: "Can only end the caller's own session; idempotent and reveals nothing",
  }),
]);

export const isPublicRoute = (method, path) =>
  PUBLIC_ROUTES.some((r) => r.method === method && r.path === path);
