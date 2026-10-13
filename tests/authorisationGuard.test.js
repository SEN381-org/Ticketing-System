/**
 * Verification evidence for DEC-012, NFR-3.3 and CON-019.
 * Referenced from the RTM verification column for FR-1.3, FR-6.4, NFR-3.3.
 *
 * The route-table assertion is the substance of this file. DEC-012 rejected the
 * per-method guard-call alternative on detectability: a missing guard call is
 * invisible, whereas a route registered without its guard is visible here and
 * fails the build.
 *
 * Since M3 Phase 0 the assertion runs over the WHOLE composed application, the
 * graph src/server.js serves, not over one router. A router added to the app
 * without its guard fails here, and so does a public route that is not in
 * PUBLIC_ROUTES with a reason.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRequestRouter } from '../src/routes/requestRoutes.js';
import { PUBLIC_ROUTES, isPublicRoute } from '../src/routes/publicRoutes.js';
import { composeApplication } from '../src/composition.js';
import { routeTable as appRouteTable } from '../src/app.js';
import { GUARD_NAME, requireOperation, assertActorNotClientSupplied }
  from '../src/middleware/authorise.js';
import { OPERATION_RULES, mayPerformOperation, mayActOnRequest, mayViewRequest, visibleStatusFor }
  from '../src/domain/accessRules.js';
import { ROLE, STATUS } from '../src/models/_shared.js';
import { AuthenticationError, AuthorisationError } from '../src/errors.js';

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

const isGuarded = (route) => route.handlers.some((h) => h.guardName === GUARD_NAME);

test('every non-public route in the composed application carries the guard — NFR-3.3, CON-019', () => {
  const routes = appRouteTable(composeApplication({ log: { error() {} } }).app);
  assert.ok(routes.length > 0, 'the route table must not be empty');

  for (const route of routes) {
    if (isPublicRoute(route.method, route.path)) continue;
    assert.ok(isGuarded(route), `${route.method} ${route.path} is registered without the authorisation guard`);
  }
});

test('every PUBLIC_ROUTES entry states why it needs no guard — DEC-018 §5', () => {
  for (const entry of PUBLIC_ROUTES) {
    assert.equal(typeof entry.reason, 'string', `${entry.method} ${entry.path} has no reason`);
    assert.ok(entry.reason.trim().length >= 20, `${entry.method} ${entry.path} has no meaningful reason`);
  }
});

test('every PUBLIC_ROUTES entry matches a registered route, so the list cannot go stale', () => {
  const registered = new Set(appRouteTable(composeApplication({ log: { error() {} } }).app)
    .map((r) => `${r.method} ${r.path}`));
  for (const entry of PUBLIC_ROUTES) {
    assert.ok(registered.has(`${entry.method} ${entry.path}`),
      `PUBLIC_ROUTES lists ${entry.method} ${entry.path}, which is not a registered route`);
  }
});

test('the request router guards every route it registers', () => {
  for (const route of routeTable(createRequestRouter({ statusTransitionService: {} }))) {
    assert.ok(isGuarded(route), `${route.method} ${route.path} is registered without the authorisation guard`);
  }
});

test('the transition route is the DEC-015 resource, not a field update; the read route is GET /:id — R-03, DEC-015 §1', () => {
  const routes = routeTable(createRequestRouter({ statusTransitionService: {}, requestQueryService: {} }));
  assert.deepEqual(routes.map((r) => `${r.method} ${r.path}`), ['GET /:id', 'POST /:id/transitions']);
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

/*
 * TD-002 repayment constraint. The security-category gate holds today ONLY
 * because groups cannot carry roles and the gate checks the Security Officer
 * role BEFORE category authorisation. DB-01 §3.7's union does not itself scope
 * security categories. Whoever implements the FR-1.6 union must keep the
 * role-first check; these tests fail if it is removed from either predicate.
 * The actor below is the worst case the union could produce: every staff role
 * except Security Officer, authorised for the security category itself, and in
 * a group.
 */
const SECURITY_REQUEST = Object.freeze({ categoryId: 'cat-sec', securityCategory: true, requesterId: 'other' });
const NON_SECURITY_STAFF = Object.values(ROLE).filter((r) =>
  ![ROLE.SECURITY_OFFICER, ROLE.REQUESTER, ROLE.ADMINISTRATOR].includes(r));

test('TD-002 constraint: category authorisation never opens a security request without the Security Officer role (act) — FR-1.5', () => {
  const widest = { id: 'u', roles: NON_SECURITY_STAFF, categoryAuthorisations: ['cat-sec'], groupIds: ['g1'] };
  assert.equal(mayActOnRequest(SECURITY_REQUEST, widest), false);
  for (const role of NON_SECURITY_STAFF) {
    assert.equal(mayActOnRequest(SECURITY_REQUEST, { ...widest, roles: [role] }), false, role);
  }
  assert.equal(mayActOnRequest(SECURITY_REQUEST, { ...widest, roles: [ROLE.SECURITY_OFFICER] }), true,
    'the Security Officer with the category must still be able to act');
});

test('TD-002 constraint: category authorisation never opens a security request without the Security Officer role (view) — FR-1.5', () => {
  const widest = { id: 'u', roles: NON_SECURITY_STAFF, categoryAuthorisations: ['cat-sec'], groupIds: ['g1'] };
  assert.equal(mayViewRequest(SECURITY_REQUEST, widest), false);
  for (const role of NON_SECURITY_STAFF) {
    assert.equal(mayViewRequest(SECURITY_REQUEST, { ...widest, roles: [role] }), false, role);
  }
  assert.equal(mayViewRequest(SECURITY_REQUEST, { ...widest, roles: [ROLE.SECURITY_OFFICER] }), true);
});
