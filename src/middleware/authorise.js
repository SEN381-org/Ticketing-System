/**
 * Authorisation guard — DEC-012, enforcement point 1 (route boundary).
 *
 * Traces to: FR-1.3, FR-6.4, NFR-3.3, CON-019, DEC-004.
 *
 * Authentication and function-level authorisation are composed into ONE named
 * middleware rather than registered separately per route. DEC-012 records that
 * middleware ordering is load-bearing and fails silently when wrong; composing
 * removes the ordering decision from the call site.
 *
 * The guard is named (`guard.guardName`) so the route table can be asserted
 * against automatically — see tests/authorisationGuard.test.js. DEC-012 rejected
 * the per-method guard-call alternative on exactly this ground: a missing guard
 * call is invisible, whereas a route registered without its guard is visible in
 * the route table. That assertion is the evidence NFR-3.3 requires.
 *
 * The rules are NOT defined here. They live in src/domain/accessRules.js, which
 * is the single rule set all three enforcement points evaluate (review comment
 * R-22). The role names come from FR-1.2 via the data baseline (R-04).
 *
 * TRUST BOUNDARY (review comment R-06). `req.actor` is set ONLY by the session
 * middleware, from the server-side session store, after verifying the session
 * against `users.sessionEpoch` (FR-1.4). It is never populated from a header,
 * query parameter or request body. If it were, every rule below could be
 * bypassed by a crafted request, which is the first thing CON-019 adversarial
 * testing will try. `assertActorNotClientSupplied` enforces that at runtime and
 * is asserted by test.
 */

import { mayPerformOperation, OPERATION_RULES } from '../domain/accessRules.js';
import { AuthenticationError, AuthorisationError } from '../errors.js';

export const GUARD_NAME = 'civicconnectAuthorisationGuard';

/** Headers a client could use to try to inject an identity. R-06 / CON-019. */
const FORBIDDEN_IDENTITY_HEADERS = Object.freeze([
  'x-actor', 'x-actor-id', 'x-actor-role', 'x-user-id', 'x-roles',
]);

export function assertActorNotClientSupplied(req) {
  for (const header of FORBIDDEN_IDENTITY_HEADERS) {
    if (req.headers && req.headers[header] !== undefined) {
      throw new AuthorisationError('Identity may not be supplied by the client');
    }
  }
}

/**
 * @param {string} operation a key of OPERATION_RULES
 * @returns {Function} one composed middleware carrying GUARD_NAME
 */
export function requireOperation(operation) {
  if (!Object.hasOwn(OPERATION_RULES, operation)) {
    throw new Error(`No authorisation rule is documented for operation '${operation}'`);
  }

  function guard(req, res, next) {
    try {
      assertActorNotClientSupplied(req);
      if (!req.actor) throw new AuthenticationError();
      if (!mayPerformOperation(operation, req.actor)) throw new AuthorisationError();
      return next();
    } catch (error) {
      return next(error);            // handled by the RFC 9457 error handler (R-05)
    }
  }

  guard.guardName = GUARD_NAME;
  guard.operation = operation;
  return guard;
}

export { OPERATION_RULES, mayPerformOperation };
