/**
 * Authorisation guard — DEC-012, enforcement point 1 (route boundary).
 *
 * Traces to: NFR-3.3, CON-019, FR-1.3, FR-6.4, DEC-004.
 *
 * Authentication and function-level authorisation are composed into ONE named
 * guard rather than registered as two separate middlewares per route. DEC-012
 * records that middleware ordering is load-bearing and fails silently when
 * wrong; composing removes the ordering decision from the call site.
 *
 * The guard is named (`guard.guardName`) so that the route table can be
 * asserted against automatically. DEC-012 rejected the per-method guard-call
 * alternative on exactly this ground: a missing guard call is invisible,
 * whereas a route registered without its guard is visible here.
 * See tests/authorisationGuard.test.js — that assertion is the evidence NFR-3.3
 * requires.
 */

export const GUARD_NAME = 'civicconnectAuthorisationGuard';

/** Function-level rules. The single documented rule set DEC-012 refers to. */
export const OPERATION_RULES = Object.freeze({
  'request:transition': ['Department Staff', 'Department Head', 'Administrator'],
  'request:read':       ['Requester', 'Department Staff', 'Department Head', 'Administrator'],
  'request:assign':     ['Department Head', 'Administrator'],
});

export function mayPerform(operation, role) {
  const permitted = OPERATION_RULES[operation];
  if (!permitted) return false;          // unknown operation is refused, not permitted
  return permitted.includes(role);
}

/**
 * @param {string} operation a key of OPERATION_RULES
 * @returns {Function} a single composed middleware carrying GUARD_NAME
 */
export function requireOperation(operation) {
  if (!Object.hasOwn(OPERATION_RULES, operation)) {
    throw new Error(`No authorisation rule is documented for operation '${operation}'`);
  }

  function guard(req, res, next) {
    // Authentication, composed into the same guard.
    if (!req.actor) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    // Function-level authorisation.
    if (!mayPerform(operation, req.actor.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  }

  guard.guardName = GUARD_NAME;
  guard.operation = operation;
  return guard;
}
