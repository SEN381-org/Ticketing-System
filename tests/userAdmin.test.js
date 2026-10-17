/**
 * User listing and administration (DEC-015 Addendum A, A2 to A5).
 *
 * Traces to: AC-FR-1.2, AC-FR-1.4, FR-1.2, FR-1.4, FR-5.1, CON-007, NFR-3.1,
 *            FR-1.3, DEC-012, DEC-015 Addendum A, DEC-018.
 *
 * Basis: AC-FR-1.2 ("rejects the save and reports that a role is required"),
 * AC-FR-1.4 ("can no longer authenticate and its existing sessions are
 * terminated"), the FR-1.2 role set (imported), the Addendum's status codes.
 * Expected values are derived from those texts before the code runs.
 *
 * What this does NOT show: the real MongoDB update that revokes (only the update
 * document is asserted, see buildRevocationUpdate), the unique-index 409 from a real
 * cluster, and the password policy (none is defined in the records).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ROLE } from '../src/models/_shared.js';
import { validateRoles, buildRevocationUpdate } from '../src/repositories/userAdminRepository.js';
import { createUserAdminService } from '../src/services/userAdminService.js';
import { AuthorisationError, ValidationError } from '../src/errors.js';
import { CAT, CAMPUS, USER, harness, serve, login, send, getJson } from './managementHarness.js';

const MISSING = 'dd0000000000000000000009';
const NEW_USER = Object.freeze({
  email: 'New.Person@Example.test', displayName: 'New Person', password: 'initial-secret-1',
  roles: [ROLE.TECHNICIAN],
});

// ---------- A2 ----------

test('A2: Coordinator and Manager receive id, displayName and roles, and no e-mail — CON-007, FR-5.1', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    for (const email of ['coord@example.test', 'mgr@example.test']) {
      const res = await getJson(base, '/users?role=Technician', await login(base, email));
      assert.equal(res.status, 200);
      const text = await res.text();
      const [only] = JSON.parse(text);
      assert.deepEqual(Object.keys(only).sort(), ['displayName', 'id', 'roles']);
      assert.deepEqual(only.roles, [ROLE.TECHNICIAN]);
      assert.doesNotMatch(text, /@example\.test/, `no e-mail for ${email}`);
    }
  });
});

test('A2: an Administrator also receives the e-mail address — CON-007', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const [only] = await (await getJson(base, '/users?role=Technician', await login(base, 'admin@example.test'))).json();
    assert.equal(only.email, 'tech@example.test');
  });
});

test('A2: the role and categoryId filters apply; an invalid role is 400 — FR-1.2, DEC-015 Addendum A', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'coord@example.test');
    const byRole = await (await getJson(base, `/users?role=${encodeURIComponent(ROLE.MANAGER)}`, cookie)).json();
    assert.deepEqual(byRole.map((u) => u.id), [USER.mgr]);
    const byCategory = await (await getJson(base, `/users?categoryId=${CAT.roads}`, cookie)).json();
    assert.deepEqual(byCategory.map((u) => u.id), [USER.tech]);
    const all = await (await getJson(base, '/users', cookie)).json();
    assert.equal(all.length, 6);

    for (const q of ['?role=Department%20Staff', '?categoryId=nope', '?foo=1']) {
      const res = await getJson(base, `/users${q}`, cookie);
      assert.equal(res.status, 400, q);
    }
    assert.equal((await getJson(base, '/users', null)).status, 401);
  });
});

test('A2: user:list is 403 for Requester, Technician and Security Officer — FR-1.3', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    for (const email of ['req@example.test', 'tech@example.test', 'sec@example.test']) {
      const res = await getJson(base, '/users', await login(base, email));
      assert.equal(res.status, 403, email);
      assert.doesNotMatch(await res.text(), /@example\.test/);
    }
  });
});

// ---------- A3 ----------

test('A3: an Administrator creates a user — 201, Location, password hashed and never returned or kept in clear', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const res = await send(base, 'POST', '/users', { cookie: await login(base, 'admin@example.test'), body: NEW_USER });
    assert.equal(res.status, 201);
    const text = await res.text();
    const body = JSON.parse(text);
    assert.equal(res.headers.get('location'), `/api/v1/users/${body.id}`);
    assert.deepEqual(body.roles, [ROLE.TECHNICIAN]);
    assert.doesNotMatch(text, /initial-secret-1|passwordHash|password/);

    const stored = store.users.get(body.id);
    assert.equal(stored.email, 'new.person@example.test');
    assert.equal(stored.passwordHash, 'fake$initial-secret-1', 'only the hasher output is stored');
    assert.notEqual(stored.passwordHash, NEW_USER.password);
    assert.equal(stored.campusId, CAMPUS, 'created in the Administrator\'s campus');
  });
});

test('A3: the new account can log in with the supplied password — FR-1.1', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    await send(base, 'POST', '/users', { cookie: await login(base, 'admin@example.test'), body: NEW_USER });
    const res = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'new.person@example.test', password: NEW_USER.password }) });
    assert.equal(res.status, 201);
    assert.ok(res.headers.getSetCookie()[0].startsWith('__Host-sid='));
  });
});

// Basis: AC-FR-1.2 Then: "the system rejects the save and reports that a role is required".
// Expected, before running: 400 whose detail is exactly the User model validator's "A role is required",
// and no account is stored. Shows: the message comes from the model, over the real route.
test('A3 / AC-FR-1.2: a body with no role, or an empty role list, is rejected 400 "A role is required" and nothing is saved', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    const noRoles = { ...NEW_USER };
    delete noRoles.roles;
    for (const body of [noRoles, { ...NEW_USER, roles: [] }]) {
      const res = await send(base, 'POST', '/users', { cookie, body });
      assert.equal(res.status, 400);
      const problem = await res.json();
      assert.equal(problem.detail, 'A role is required');
      assert.equal(problem.code, 'INVALID_REQUEST');
    }
    assert.equal(store.users.size, 6, 'no account was created');
  });
});

test('A3: a role outside FR-1.2 is 400 — FR-1.2', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const res = await send(base, 'POST', '/users', {
      cookie: await login(base, 'admin@example.test'), body: { ...NEW_USER, roles: ['Department Staff'] } });
    assert.equal(res.status, 400);
    assert.equal(store.users.size, 6);
  });
});

test('A3: 400 names the missing field, rejects unknown fields, and requires an Idempotency-Key', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    for (const field of ['email', 'displayName', 'password']) {
      const body = { ...NEW_USER };
      delete body[field];
      const res = await send(base, 'POST', '/users', { cookie, body });
      assert.equal(res.status, 400, field);
      assert.match((await res.json()).detail, new RegExp(`^${field} is required`), field);
    }
    const unknown = await send(base, 'POST', '/users', { cookie, body: { ...NEW_USER, status: 'active' } });
    assert.equal(unknown.status, 400);
    assert.match((await unknown.json()).detail, /Unknown field: status/);

    const noKey = await send(base, 'POST', '/users', { cookie, body: NEW_USER, key: null });
    assert.equal(noKey.status, 400);
    assert.equal((await noKey.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');
  });
});

test('A3: an existing e-mail is 409 CONFLICT, whatever its case — DEC-015 Addendum A', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const res = await send(base, 'POST', '/users', {
      cookie: await login(base, 'admin@example.test'), body: { ...NEW_USER, email: 'TECH@example.test' } });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'CONFLICT');
    assert.equal(store.users.size, 6);
  });
});

// Basis: OPERATION_RULES 'user:administer' = Administrator only (FR-1.4 names the Administrator).
// Expected: 403 on all four administration routes for every other role, and no state changes.
test('A3-A5: user:administer is refused 403 to every role except Administrator, and nothing changes — FR-1.4, FR-1.3', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    for (const email of ['req@example.test', 'tech@example.test', 'coord@example.test',
      'sec@example.test', 'mgr@example.test']) {
      const cookie = await login(base, email);
      assert.equal((await send(base, 'POST', '/users', { cookie, body: NEW_USER })).status, 403, `POST /users ${email}`);
      assert.equal((await send(base, 'PUT', `/users/${USER.tech}/roles`, { cookie, body: { roles: [ROLE.MANAGER] } })).status, 403, `PUT roles ${email}`);
      assert.equal((await send(base, 'POST', `/users/${USER.tech}/revocation`, { cookie })).status, 403, `POST revocation ${email}`);
    }
    assert.equal(store.users.size, 6);
    assert.deepEqual(store.users.get(USER.tech).roles, [ROLE.TECHNICIAN]);
    assert.equal(store.users.get(USER.tech).status, 'active');
  });
});

test('A3-A5: 401 without a session', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    assert.equal((await send(base, 'POST', '/users', { body: NEW_USER })).status, 401);
    assert.equal((await send(base, 'PUT', `/users/${USER.tech}/roles`, { body: { roles: [ROLE.MANAGER] } })).status, 401);
    assert.equal((await send(base, 'POST', `/users/${USER.tech}/revocation`, {})).status, 401);
  });
});

// ---------- A4 ----------

test('A4: an Administrator replaces a user\'s roles — 200, and the change shows at the next request — FR-1.4', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const admin = await login(base, 'admin@example.test');
    const tech = await login(base, 'tech@example.test');
    assert.equal((await getJson(base, '/reports/summary', tech)).status, 403, 'a Technician has no report:read');

    const res = await send(base, 'PUT', `/users/${USER.tech}/roles`, { cookie: admin, body: { roles: [ROLE.MANAGER] } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: USER.tech, roles: [ROLE.MANAGER] });
    assert.deepEqual(store.users.get(USER.tech).roles, [ROLE.MANAGER]);
    assert.equal((await getJson(base, '/reports/summary', tech)).status, 200, 'the same session, new role');
  });
});

test('A4 / AC-FR-1.2: no role, an empty list, or a value outside FR-1.2 is 400 and roles are unchanged', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    const empty = await send(base, 'PUT', `/users/${USER.tech}/roles`, { cookie, body: { roles: [] } });
    assert.equal(empty.status, 400);
    assert.equal((await empty.json()).detail, 'A role is required');
    assert.equal((await send(base, 'PUT', `/users/${USER.tech}/roles`, { cookie, body: {} })).status, 400);
    assert.equal((await send(base, 'PUT', `/users/${USER.tech}/roles`, { cookie, body: { roles: ['Department Staff'] } })).status, 400);
    assert.equal((await send(base, 'PUT', `/users/${USER.tech}/roles`, { cookie, body: { roles: [ROLE.MANAGER], x: 1 } })).status, 400);
    assert.equal((await send(base, 'PUT', `/users/${USER.tech}/roles`, { cookie, body: { roles: [ROLE.MANAGER] }, key: null })).status, 400);
    assert.equal((await send(base, 'PUT', '/users/not-an-id/roles', { cookie, body: { roles: [ROLE.MANAGER] } })).status, 400);
    assert.deepEqual(store.users.get(USER.tech).roles, [ROLE.TECHNICIAN]);
  });
});

test('A4: 404 for an unknown user', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const res = await send(base, 'PUT', `/users/${MISSING}/roles`, {
      cookie: await login(base, 'admin@example.test'), body: { roles: [ROLE.MANAGER] } });
    assert.equal(res.status, 404);
  });
});

// ---------- A5 ----------

test('A5: revocation sets status and revokedAt and advances the session epoch — 201', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const res = await send(base, 'POST', `/users/${USER.tech}/revocation`, { cookie: await login(base, 'admin@example.test') });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.status, 'revoked');
    assert.equal(body.replayed, undefined);
    assert.equal(res.headers.get('idempotent-replayed'), null);
    const u = store.users.get(USER.tech);
    assert.equal(u.status, 'revoked');
    assert.ok(u.revokedAt instanceof Date);
    assert.equal(u.sessionEpoch, 1);
  });
});

// Basis: AC-FR-1.4 Then: "the account can no longer authenticate and its existing sessions are terminated".
// Expected, before running: a session that resolves (200) before the revocation is refused (401) after it,
// and a fresh login with the correct password fails 401. The real auth service decides both.
test('A5 / AC-FR-1.4: after revocation the existing session is refused and the account cannot log in again', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const tech = await login(base, 'tech@example.test');
    assert.equal((await getJson(base, '/users', tech)).status, 403, 'before: the session is live (authenticated, role-refused)');

    const revoke = await send(base, 'POST', `/users/${USER.tech}/revocation`, { cookie: await login(base, 'admin@example.test') });
    assert.equal(revoke.status, 201);

    const after = await getJson(base, '/users', tech);
    assert.equal(after.status, 401, 'after: the same session no longer resolves');

    const relog = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'tech@example.test', password: 'right' }) });
    assert.equal(relog.status, 401, 'the account can no longer authenticate');
  });
});

test('A5: the epoch alone ends a session, even if status were still active — DEC-018 §3, AC-FR-1.4', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const tech = await login(base, 'tech@example.test');
    assert.equal((await getJson(base, '/users', tech)).status, 403);
    store.users.get(USER.tech).sessionEpoch += 1;                   // what the update's $inc does
    assert.equal((await getJson(base, '/users', tech)).status, 401);
  });
});

test('A5: the revocation update sets status, revokedAt and increments sessionEpoch by one — FR-1.4', () => {
  const at = new Date('2026-10-17T10:00:00Z');
  assert.deepEqual(buildRevocationUpdate(at), {
    $set: { status: 'revoked', revokedAt: at }, $inc: { sessionEpoch: 1 },
  });
});

test('A5 / DEC-015 §3: a repeated revocation returns the original 201 and body with Idempotent-Replayed, and the epoch advances once only — idempotent', async () => {
  const { app, store } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    const original = await send(base, 'POST', `/users/${USER.tech}/revocation`, { cookie });
    assert.equal(original.status, 201);
    const originalBody = await original.json();
    const first = { ...store.users.get(USER.tech) };
    const again = await send(base, 'POST', `/users/${USER.tech}/revocation`, { cookie });
    assert.equal(again.status, 201);
    assert.equal(again.headers.get('idempotent-replayed'), 'true');
    const body = await again.json();
    assert.deepEqual(body, originalBody);
    assert.equal(body.status, 'revoked');
    assert.equal(store.users.get(USER.tech).sessionEpoch, 1);
    assert.deepEqual(store.users.get(USER.tech).revokedAt, first.revokedAt);
  });
});

test('A5: 404 for an unknown user, 400 for a malformed id or a missing Idempotency-Key', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    assert.equal((await send(base, 'POST', `/users/${MISSING}/revocation`, { cookie })).status, 404);
    assert.equal((await send(base, 'POST', '/users/zzz/revocation', { cookie })).status, 400);
    const noKey = await send(base, 'POST', `/users/${USER.tech}/revocation`, { cookie, key: null });
    assert.equal(noKey.status, 400);
    assert.equal((await noKey.json()).code, 'IDEMPOTENCY_KEY_REQUIRED');
  });
});

// ---------- model validator and service layer ----------

test('AC-FR-1.2: validateRoles uses the User model\'s own message, and accepts every FR-1.2 role', () => {
  assert.throws(() => validateRoles([]), (e) => e instanceof ValidationError && e.message === 'A role is required');
  assert.throws(() => validateRoles(['Department Staff']), ValidationError);
  for (const role of Object.values(ROLE)) assert.doesNotThrow(() => validateRoles([role]), role);
});

test('service layer refuses a wrong role without reaching the repository — DEC-012 point 2', async () => {
  let touched = false;
  const repo = new Proxy({}, { get: () => async () => { touched = true; return null; } });
  const service = createUserAdminService({ users: repo, passwords: repo, validateRoles });
  const manager = { id: USER.mgr, roles: [ROLE.MANAGER], campusId: CAMPUS };
  await assert.rejects(service.create(NEW_USER, manager), AuthorisationError);
  await assert.rejects(service.setRoles(USER.tech, { roles: [ROLE.MANAGER] }, manager), AuthorisationError);
  await assert.rejects(service.revoke(USER.tech, manager), AuthorisationError);
  await assert.rejects(service.list({}, { id: USER.req, roles: [ROLE.REQUESTER], campusId: CAMPUS }), AuthorisationError);
  assert.equal(touched, false);
});
