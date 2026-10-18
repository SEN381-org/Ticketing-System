/**
 * GET /api/v1/users and revocation - S2 (A4 of the local walkthrough).
 *
 * Traces to: FR-1.4, AC-FR-1.4, FR-5.1, CON-007, FR-1.3, DEC-012, DEC-015 Addendum A (A2, A5).
 *
 * Basis: the list showed active accounts only, so a revoked user vanished from the
 * Administrator's view. Decision (walkthrough): the Administrator's list includes
 * revoked users with `status` ('active' | 'revoked') and `revokedAt`; the assignment
 * pool (Coordinator, Manager) keeps excluding them, because a revoked account cannot
 * be assigned (FR-1.4, FR-5.1). Expected values come from that decision, written
 * before the run.
 *
 * What this does NOT show: the real MongoDB query (the fake repository follows the
 * interface; the filter itself is asserted in the repository test below).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { userAdminRepository } from '../src/repositories/userAdminRepository.js';
import { USER, harness, serve, login, send, getJson } from './managementHarness.js';

const revokeTech = (base, cookie) => send(base, 'POST', `/users/${USER.tech}/revocation`, { cookie, body: {} });

// Technique: revoke through the API,
// then list. Expected: the Administrator sees the revoked account with status 'revoked' and a
// revokedAt; every active account shows status 'active' and revokedAt null.
test('FR-1.4: an Administrator\'s list includes a revoked user with status and revokedAt', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const admin = await login(base, 'admin@example.test');
    assert.equal((await revokeTech(base, admin)).status, 201);
    const list = await (await getJson(base, '/users', admin)).json();
    const tech = list.find((u) => u.id === USER.tech);
    assert.ok(tech, 'the revoked user is still listed');
    assert.equal(tech.status, 'revoked');
    assert.ok(Number.isFinite(Date.parse(tech.revokedAt)), 'revokedAt is a date');
    const others = list.filter((u) => u.id !== USER.tech);
    assert.equal(others.length, 5);
    for (const u of others) {
      assert.equal(u.status, 'active', u.id);
      assert.equal(u.revokedAt, null, u.id);
    }
    assert.equal(tech.email, 'tech@example.test', 'the Administrator keeps the e-mail');
  });
});

// NV-162: the assignment pool must not offer a revoked account to Coordinator or Manager.
test('FR-5.1, FR-1.4, NV-162: Coordinator and Manager lists exclude a revoked user and keep the A2 shape', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    assert.equal((await revokeTech(base, await login(base, 'admin@example.test'))).status, 201);
    for (const email of ['coord@example.test', 'mgr@example.test']) {
      const list = await (await getJson(base, '/users', await login(base, email))).json();
      assert.equal(list.some((u) => u.id === USER.tech), false, `${email} must not see the revoked user`);
      assert.equal(list.length, 5);
      for (const u of list) assert.deepEqual(Object.keys(u).sort(), ['displayName', 'id', 'roles']);
    }
  });
});

test('FR-1.4: the Administrator\'s role filter still applies to revoked users', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const admin = await login(base, 'admin@example.test');
    await revokeTech(base, admin);
    const techs = await (await getJson(base, '/users?role=Technician', admin)).json();
    assert.deepEqual(techs.map((u) => [u.id, u.status]), [[USER.tech, 'revoked']]);
  });
});

// A5. Basis: AC-FR-1.4 Then ("can no longer authenticate and its existing sessions are
// terminated"). Technique: the call made correctly (JSON content type, an empty JSON body
// {}, an Idempotency-Key). Expected: 201 with status 'revoked', the user's open session
// refused, a fresh login refused, a repeat is 201 with Idempotent-Replayed. Shows: revocation
// works when called correctly. Does NOT show: the response to a call with no JSON body (a
// 415 from the body middleware, DEC-015 §5), which is the client's to avoid.
test('AC-FR-1.4: A5 revocation with a JSON body {} succeeds, ends the session and blocks login', async () => {
  const { app } = harness();
  await serve(app, async (base) => {
    const techCookie = await login(base, 'tech@example.test');
    assert.equal((await getJson(base, '/users', techCookie)).status, 403, 'signed in, but not a lister');
    const admin = await login(base, 'admin@example.test');
    const res = await revokeTech(base, admin);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.id, USER.tech);
    assert.equal(body.status, 'revoked');
    assert.equal((await getJson(base, '/users', techCookie)).status, 401, 'the open session is over');
    const again = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'tech@example.test', password: 'right' }) });
    assert.equal(again.status, 401);
    const repeat = await revokeTech(base, admin);
    assert.equal(repeat.status, 201);
    assert.equal(repeat.headers.get('idempotent-replayed'), 'true');
  });
});

// Repository: the query the service asks for. Technique: the model's query is not run (no
// database); the options reach the repository, so the filter is read from a stubbed model.
test('FR-1.4: the repository drops the active filter only when asked to include revoked users', async () => {
  const User = (await import('../src/models/User.js')).default;
  const seen = [];
  const original = User.find;
  User.find = (query) => {
    seen.push(query);
    const chain = { select: () => chain, sort: () => chain, lean: async () => [] };
    return chain;
  };
  try {
    await userAdminRepository.list({ campusId: 'c', role: undefined, categoryId: undefined });
    await userAdminRepository.list({ campusId: 'c', includeRevoked: true });
  } finally {
    User.find = original;
  }
  assert.equal(seen[0].status, 'active');
  assert.equal('status' in seen[1], false);
});
