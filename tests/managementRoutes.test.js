/**
 * Route table of the M4 management and administration routes (DEC-015 Addendum A, A2 to A8).
 *
 * Traces to: NFR-3.3, CON-019, FR-1.3, DEC-012, DEC-015 Addendum A.
 *
 * Basis: the Addendum's table of method, path, operation and roles. Expected: the
 * composed application registers exactly these seven routes of the T7 set, each
 * guarded by the operation the Addendum names, and each operation allows exactly the
 * roles the Addendum names (role names imported, never retyped).
 * Shows: method, path and operation per route. Does NOT show: status codes (the HTTP
 * tests do) or that A1, another track's route, exists.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { composeApplication } from '../src/composition.js';
import { routeTable } from '../src/app.js';
import { OPERATION_RULES } from '../src/domain/accessRules.js';
import { GUARD_NAME } from '../src/middleware/authorise.js';
import { ROLE } from '../src/models/_shared.js';

const EXPECTED = [
  ['GET /api/v1/users', 'user:list'],
  ['POST /api/v1/users', 'user:administer'],
  ['PUT /api/v1/users/:id/roles', 'user:administer'],
  ['POST /api/v1/users/:id/revocation', 'user:administer'],
  ['GET /api/v1/reports/summary', 'report:read'],
  ['PUT /api/v1/categories/:id/target', 'category:set-target'],
  ['POST /api/v1/categories/:id/deactivation', 'category:administer'],
];

test('the T7 routes are registered, each guarded by the operation the Addendum names — DEC-015 Addendum A, NFR-3.3', () => {
  const routes = routeTable(composeApplication({ log: { error() {} } }).app);
  for (const [route, operation] of EXPECTED) {
    const found = routes.find((r) => `${r.method} ${r.path}` === route);
    assert.ok(found, `${route} is not registered`);
    const guard = found.handlers.find((h) => h.guardName === GUARD_NAME);
    assert.ok(guard, `${route} has no guard`);
    assert.equal(guard.operation, operation, route);
  }
});

test('the new operations allow exactly the roles the Addendum names — DEC-015 Addendum A, FR-1.3', () => {
  assert.deepEqual([...OPERATION_RULES['user:list']].sort(),
    [ROLE.COORDINATOR, ROLE.MANAGER, ROLE.ADMINISTRATOR].sort());
  assert.deepEqual(OPERATION_RULES['user:administer'], [ROLE.ADMINISTRATOR]);
  assert.deepEqual(OPERATION_RULES['category:set-target'], [ROLE.MANAGER]);
  assert.deepEqual(OPERATION_RULES['category:administer'], [ROLE.ADMINISTRATOR]);
  assert.deepEqual([...OPERATION_RULES['report:read']].sort(),
    [ROLE.MANAGER, ROLE.COORDINATOR, ROLE.SECURITY_OFFICER].sort(), 'report:read is unchanged');
});
