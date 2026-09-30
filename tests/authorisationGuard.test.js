/**
 * Verification evidence for DEC-012, NFR-3.3 and CON-019.
 * Referenced from the RTM verification column for FR-1.3, FR-6.4, NFR-3.3.
 *
 * The route-table assertion is the substance of this file. DEC-012 rejected the
 * per-method guard-call alternative on detectability: a missing guard call is
 * invisible, whereas a route registered without its guard is visible here and
 * fails the build.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRequestRouter } from '../src/routes/requestRoutes.js';
import { GUARD_NAME, requireOperation, assertActorNotClientSupplied }
  from '../src/middleware/authorise.js';
import { OPERATION_RULES, mayPerformOperation, mayActOnRequest, visibleStatusFor }
  from '../src/domain/accessRules.js';
import { ROLE, STATUS } from '../src/models/_shared.js';
import { AuthenticationError, AuthorisationError } from '../src/errors.js';

const PUBLIC_ROUTES = [];   // stated, not assumed

function routeTable(router) {
  return router.stack.filter((l) => l.route).flatMap((l) =>
    Object.keys(l.route.methods).map((m) => ({
      method: m.toUpperCase(), path: l.route.path,
      handlers: l.route.stack.map((h) => h.handle),
    })));
}

function run(guard, req) {
  let passed = false; let error = null;
  guard(req, {}, (e) => { if (e) error = e; else passed = true; });
  return { passed, error };
}

test('every non-public route carries the composed guard — NFR-3.3, CON-019', () => {
  const routes = routeTable(createRequestRouter({ statusTransitionService: {} }));
  assert.ok(routes.length > 0, 'the route table must not be empty');

  for (const route of routes) {
    const signature = `${route.method} ${route.path}`;
    if (PUBLIC_ROUTES.includes(signature)) continue;
    assert.ok(route.handlers.some((h) => h.guardName === GUARD_NAME),
      `${signature} is registered without the authorisation guard`);
  }
});

test('the transition route is the DEC-014 resource, not a field update — R-03', () => {
  const routes = routeTable(createRequestRouter({ statusTransitionService: {} }));
  assert.deepEqual(routes.map((r) => `${r.method} ${r.path}`), ['POST /:id/transitions']);
});

test('every role named in the rule set exists in FR-1.2', () => {
  const declared = new Set(Object.values(ROLE));
  for (const [operation, roles] of Object.entries(OPERATION_RULES)) {
    assert.ok(roles.length > 0, `${operation} names no role`);
    for (const role of roles) {
      assert.ok(declared.has(role), `'${role}' in ${operation} is not an FR-1.2 role`);
    }
  }
});

test('the guard refuses before the handler runs — DEC-012 path A', () => {
  const { passed, error } = run(requireOperation('request:transition'),
    { headers: {}, actor: { id: 'u1', roles: [ROLE.REQUESTER] } });
  assert.equal(passed, false, 'the handler must not be reached');
  assert.ok(error instanceof AuthorisationError);
  assert.equal(error.status, 403);
});

test('an unauthenticated request is refused by the same guard', () => {
  const { error } = run(requireOperation('request:transition'), { headers: {} });
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.status, 401);
});

test('a permitted role passes the guard', () => {
  const { passed } = run(requireOperation('request:transition'),
    { headers: {}, actor: { id: 'u1', roles: [ROLE.COORDINATOR] } });
  assert.equal(passed, true);
});

test('an identity supplied by the client is refused — R-06, CON-019', () => {
  const { error } = run(requireOperation('request:transition'),
    { headers: { 'x-actor-role': 'Administrator' }, actor: { id: 'u', roles: [ROLE.MANAGER] } });
  assert.ok(error instanceof AuthorisationError);
  assert.throws(() => assertActorNotClientSupplied({ headers: { 'x-roles': 'Manager' } }));
});

test('an operation with no documented rule cannot be guarded', () => {
  assert.throws(() => requireOperation('request:undocumented'), /No authorisation rule is documented/);
});

test('an unknown operation is refused rather than permitted by default', () => {
  assert.equal(mayPerformOperation('request:undocumented', { roles: [ROLE.ADMINISTRATOR] }), false);
});

test('the boundary cannot decide object-level access — DEC-012 path B', () => {
  const actor = { id: 'u', roles: [ROLE.TECHNICIAN], categoryAuthorisations: ['cat-1'] };
  assert.equal(mayPerformOperation('request:transition', actor), true, 'permitted at the boundary');
  assert.equal(mayActOnRequest({ categoryId: 'cat-2', securityCategory: false }, actor), false,
    'refused in the service, once the document is loaded');
});

test('a requester never sees a restricted status on a security request — FR-3.5, DEC-012 point 3', () => {
  const requester = { id: 'u', roles: [ROLE.REQUESTER] };
  const permitted = [STATUS.RECEIVED, STATUS.IN_PROGRESS, STATUS.CLOSED];

  for (const status of Object.values(STATUS)) {
    const shown = visibleStatusFor(status, true, requester);
    assert.ok(permitted.includes(shown),
      `'${status}' was shown to a requester as '${shown}', outside FR-3.5's three values`);
  }
  assert.equal(visibleStatusFor(STATUS.ON_HOLD, false, requester), STATUS.ON_HOLD,
    'a non-security request is not restricted');
  assert.equal(visibleStatusFor(STATUS.ON_HOLD, true, { roles: [ROLE.SECURITY_OFFICER] }), STATUS.ON_HOLD);
});
