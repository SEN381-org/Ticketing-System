/**
 * Initial verification evidence for DEC-012 and NFR-3.3.
 *
 * Referenced from the RTM verification column for FR-1.3, FR-6.4 and NFR-3.3.
 *
 * The route-table assertion is the substance of this file. DEC-012 rejected the
 * per-method guard-call alternative on detectability: a missing guard call is
 * invisible, whereas a route registered without its guard is visible here and
 * fails the build. CON-019 requires that the absence of an interface control
 * not be treated as an access restriction; this test is how that is shown for
 * every route rather than for the ones someone remembered to check.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createRequestRouter } from '../src/routes/requestRoutes.js';
import { GUARD_NAME, OPERATION_RULES, mayPerform, requireOperation }
  from '../src/middleware/authorise.js';

/** Routes deliberately reachable without authentication. Must be stated, not assumed. */
const PUBLIC_ROUTES = [];

function routeTable(router) {
  return router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) =>
      Object.keys(layer.route.methods).map((method) => ({
        method: method.toUpperCase(),
        path: layer.route.path,
        handlers: layer.route.stack.map((h) => h.handle),
      })),
    );
}

test('every non-public route carries the composed guard — NFR-3.3, CON-019', () => {
  const router = createRequestRouter({ statusTransitionService: {} });
  const routes = routeTable(router);

  assert.ok(routes.length > 0, 'the route table must not be empty');

  for (const route of routes) {
    const signature = `${route.method} ${route.path}`;
    if (PUBLIC_ROUTES.includes(signature)) continue;

    const guarded = route.handlers.some((h) => h.guardName === GUARD_NAME);
    assert.ok(guarded, `${signature} is registered without the authorisation guard`);
  }
});

test('the guard refuses before the handler runs — DEC-012 path A', () => {
  const guard = requireOperation('request:transition');
  let handlerRan = false;
  const next = () => { handlerRan = true; };

  const captured = {};
  const res = {
    status(code) { captured.code = code; return this; },
    json(body)   { captured.body = body; return this; },
  };

  guard({ actor: { id: 'u1', role: 'Requester' } }, res, next);

  assert.equal(captured.code, 403);
  assert.equal(handlerRan, false, 'the handler must not be reached');
});

test('an unauthenticated request is refused by the same guard', () => {
  const guard = requireOperation('request:transition');
  const captured = {};
  const res = {
    status(code) { captured.code = code; return this; },
    json(body)   { captured.body = body; return this; },
  };

  guard({}, res, () => assert.fail('next() must not be called'));
  assert.equal(captured.code, 401);
});

test('a permitted role passes the guard', () => {
  const guard = requireOperation('request:transition');
  let passed = false;
  guard({ actor: { id: 'u1', role: 'Administrator' } }, null, () => { passed = true; });
  assert.equal(passed, true);
});

test('an operation with no documented rule cannot be guarded', () => {
  assert.throws(() => requireOperation('request:undocumented'), /No authorisation rule is documented/);
});

test('an unknown operation is refused rather than permitted by default', () => {
  assert.equal(mayPerform('request:undocumented', 'Administrator'), false);
});

test('every documented operation names at least one role', () => {
  for (const [operation, roles] of Object.entries(OPERATION_RULES)) {
    assert.ok(Array.isArray(roles) && roles.length > 0, `${operation} names no role`);
  }
});
