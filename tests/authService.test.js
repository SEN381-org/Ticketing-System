/**
 * Verification evidence for FR-1.4 (session termination), NFR-1.4 (auth events),
 * NFR-3.4 (idle expiry) and DEC-018 §3–§6.
 * Referenced from the RTM verification column for FR-1.4, NFR-1.4, NFR-3.4.
 *
 * Inputs are chosen at the boundaries DEC-018 states: 29:59 and 30:00 of
 * recorded idleness; 59 s and 60 s for the refresh rule; an epoch one higher
 * than the session's. Expected results come from DEC-018 and DB-01 v0.3 §3.9,
 * not from running the code.
 *
 * What this does NOT show: that the TTL index removes documents (a database
 * behaviour), or that the audit events survive 90 days (AC-NFR-1.4 retention).
 * The hasher is a fake here, so password strength is covered elsewhere
 * (passwordHasher.test.js).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createAuthService, hashToken, IDLE_LIMIT_MS, REFRESH_INTERVAL_MS }
  from '../src/services/authService.js';
import { AuthenticationError, ValidationError } from '../src/errors.js';
import { ROLE } from '../src/models/_shared.js';

const T0 = new Date('2026-10-11T08:00:00Z');
const at = (ms) => new Date(T0.getTime() + ms);

function fakeWorld({ users: seed = [] } = {}) {
  const users = new Map(seed.map((u) => [String(u._id), { ...u }]));
  const sessions = new Map();
  const auditLog = [];
  const calls = { verify: 0, touch: 0, sessionReads: 0 };
  let tokenNo = 0;

  const world = {
    users, sessions, auditLog, calls,
    now: T0,
    deps: {
      users: {
        findForLogin: async (email) =>
          [...users.values()].find((u) => u.email === email.trim().toLowerCase()) ?? null,
        findById: async (id) => users.get(String(id)) ?? null,
        updatePasswordHash: async (id, h) => { users.get(String(id)).passwordHash = h; },
      },
      sessions: {
        create: async (s) => { sessions.set(s._id, { ...s }); },
        findById: async (id) => { calls.sessionReads += 1; return sessions.get(id) ?? null; },
        touch: async (id, when) => { calls.touch += 1; sessions.get(id).lastSeenAt = when; },
        remove: async (id) => { const s = sessions.get(id) ?? null; sessions.delete(id); return s; },
      },
      audit: { recordSecurityEvent: async (e) => { auditLog.push(e); } },
      passwords: {
        hash: async (p) => `fake$${p}`,
        verify: async (p, h) => { calls.verify += 1; return { ok: h === `fake$${p}`, needsRehash: false }; },
      },
      clock: () => world.now,
      newToken: () => `tok${String(++tokenNo).padStart(40, '0')}`,   // 43 chars, matches the token shape
    },
  };
  return world;
}

const technician = (overrides = {}) => ({
  _id: 'u1', campusId: 'c1', email: 'tech@example.test', displayName: 'Tech',
  passwordHash: 'fake$right', roles: [ROLE.TECHNICIAN], categoryAuthorisations: ['cat1'],
  groupIds: ['g1'], status: 'active', sessionEpoch: 0, ...overrides,
});

async function loggedIn(overrides) {
  const world = fakeWorld({ users: [technician(overrides)] });
  const auth = createAuthService(world.deps);
  const { token } = await auth.login({ email: 'tech@example.test', password: 'right' });
  return { world, auth, token };
}

// ---------- login ----------

test('a successful login stores only the hash of the token — DEC-018 §3', async () => {
  const { world, token } = await loggedIn();
  assert.equal(world.sessions.size, 1);
  const [id, session] = [...world.sessions.entries()][0];
  assert.equal(id, hashToken(token));
  assert.notEqual(id, token);
  assert.ok(!JSON.stringify(session).includes(token), 'the raw token appears in the stored session');
  assert.equal(session.sessionEpoch, 0);
});

test('every login issues a new identifier (no fixation) — DEC-018 §3', async () => {
  const { world, auth, token } = await loggedIn();
  const second = await auth.login({ email: 'tech@example.test', password: 'right' });
  assert.notEqual(second.token, token);
  assert.equal(world.sessions.size, 2);
});

test('unknown email, wrong password and revoked account fail identically — DEC-018 §5', async () => {
  const world = fakeWorld({ users: [technician(), technician({ _id: 'u2', email: 'gone@example.test', status: 'revoked' })] });
  const auth = createAuthService(world.deps);

  const attempts = [
    { email: 'nobody@example.test', password: 'right' },   // unknown email
    { email: 'tech@example.test', password: 'wrong' },     // wrong password
    { email: 'gone@example.test', password: 'right' },     // revoked, correct password
  ];
  const errors = [];
  for (const body of attempts) {
    await assert.rejects(auth.login(body), (e) => { errors.push(e); return true; });
  }
  for (const e of errors) {
    assert.ok(e instanceof AuthenticationError);
    assert.deepEqual([e.status, e.code, e.message], [errors[0].status, errors[0].code, errors[0].message]);
  }
  assert.equal(world.calls.verify, 3, 'every attempt, including the unknown email, pays for a hash check');
  assert.equal(world.sessions.size, 0);
});

test('every login attempt is audited, minimised, and the email is never recorded — NFR-1.4, M-1', async () => {
  const world = fakeWorld({ users: [technician()] });
  const auth = createAuthService(world.deps);
  await assert.rejects(auth.login({ email: 'nobody@example.test', password: 'x' }));
  await assert.rejects(auth.login({ email: 'tech@example.test', password: 'x' }));
  await auth.login({ email: 'tech@example.test', password: 'right' });

  assert.deepEqual(world.auditLog.map((e) => [e.eventType, e.outcome]), [
    ['auth.login.failure', 'failure'],
    ['auth.login.failure', 'failure'],
    ['auth.login.success', 'success'],
  ]);
  const [unknown, targeted, success] = world.auditLog;
  assert.equal(unknown.actorId ?? null, null);
  assert.equal(unknown.documentId, null, 'an unknown email has no account to record');
  assert.deepEqual([targeted.actorId ?? null, targeted.collectionName, targeted.documentId],
    [null, 'users', 'u1'], 'the targeted account is the object, not the actor');
  assert.deepEqual([success.actorId, success.actorRole], ['u1', ROLE.TECHNICIAN]);
  for (const e of world.auditLog) {
    assert.equal(e.origin, 'auth');
    assert.ok(!JSON.stringify(e).includes('@example.test'), 'an email address reached the audit record');
  }
});

test('a login body with unknown fields or non-string values is refused as 400 — DEC-015 §5', async () => {
  const auth = createAuthService(fakeWorld().deps);
  await assert.rejects(auth.login({ email: 'a', password: 'b', role: 'Administrator' }),
    (e) => e instanceof ValidationError && /role/.test(e.message));
  await assert.rejects(auth.login({ email: 'a', password: 1 }), ValidationError);
  await assert.rejects(auth.login(null), ValidationError);
});

test('if the success event cannot be recorded, no session is created — NFR-1.4', async () => {
  const world = fakeWorld({ users: [technician()] });
  world.deps.audit.recordSecurityEvent = async () => { throw new Error('audit unavailable'); };
  const auth = createAuthService(world.deps);
  await assert.rejects(auth.login({ email: 'tech@example.test', password: 'right' }), /audit unavailable/);
  assert.equal(world.sessions.size, 0);
});

// ---------- resolve ----------

test('a valid session resolves to the DEC-018 actor shape, read from the user', async () => {
  const { auth, token } = await loggedIn();
  assert.deepEqual(await auth.resolve(token), {
    id: 'u1', roles: [ROLE.TECHNICIAN], categoryAuthorisations: ['cat1'], groupIds: ['g1'],
  });
});

test('idle boundary: 29:59 since lastSeenAt is accepted, 30:00 is refused — NFR-3.4', async () => {
  const { world, auth, token } = await loggedIn();
  world.now = at(IDLE_LIMIT_MS - 1000);
  assert.ok(await auth.resolve(token), 'refused at 29:59');

  const { world: w2, auth: a2, token: t2 } = await loggedIn();
  w2.now = at(IDLE_LIMIT_MS);
  assert.equal(await a2.resolve(t2), null, 'accepted at 30:00');
});

test('lastSeenAt is not refreshed within 60 s, and is refreshed at 60 s — DEC-018 §3', async () => {
  const { world, auth, token } = await loggedIn();
  world.now = at(REFRESH_INTERVAL_MS - 1000);
  await auth.resolve(token);
  assert.equal(world.calls.touch, 0, 'refreshed before 60 s');
  world.now = at(REFRESH_INTERVAL_MS);
  await auth.resolve(token);
  assert.equal(world.calls.touch, 1, 'not refreshed at 60 s');
});

test("user's view: a session is never valid 30:00 after the last request, even with a stale lastSeenAt — AC-NFR-3.4", async () => {
  const { world, auth, token } = await loggedIn();
  // Requests at 0:59 do not refresh, so lastSeenAt stays at 0:00 while the user's
  // real last request is at 0:59. Then the user goes quiet.
  world.now = at(59 * 1000);
  assert.ok(await auth.resolve(token));
  const lastRequest = world.now;
  world.now = new Date(lastRequest.getTime() + IDLE_LIMIT_MS);
  assert.equal(await auth.resolve(token), null, 'valid 30:00 after the last request');
  // And it was already refused before 30:00 of real idleness: the early side of the tolerance.
  world.now = new Date(lastRequest.getTime() + IDLE_LIMIT_MS - 59 * 1000);
  assert.equal(await auth.resolve(token), null);
});

test('revocation terminates existing sessions through the epoch — FR-1.4, AC-FR-1.4', async () => {
  const { world, auth, token } = await loggedIn();
  assert.ok(await auth.resolve(token));
  world.users.get('u1').sessionEpoch = 1;          // what revocation does
  assert.equal(await auth.resolve(token), null);
});

test('a revoked user is refused even with a matching epoch — FR-1.4', async () => {
  const { world, auth, token } = await loggedIn();
  world.users.get('u1').status = 'revoked';
  assert.equal(await auth.resolve(token), null);
});

test('a role change applies at the next request: nothing is cached in the session — NFR-2.7, FR-1.6', async () => {
  const { world, auth, token } = await loggedIn();
  world.users.get('u1').roles = [ROLE.COORDINATOR];
  assert.deepEqual((await auth.resolve(token)).roles, [ROLE.COORDINATOR]);
});

test('an unknown or malformed token resolves to null; a malformed one never reaches the store', async () => {
  const { world, auth } = await loggedIn();
  assert.equal(await auth.resolve('x'.repeat(43)), null);
  const reads = world.calls.sessionReads;
  for (const bad of [null, '', 'short', 'x'.repeat(44), `${'x'.repeat(42)}!`]) {
    assert.equal(await auth.resolve(bad), null);
  }
  assert.equal(world.calls.sessionReads, reads, 'a malformed token was looked up');
});

// ---------- logout ----------

test('logout ends the session, audits once, and is idempotent — DEC-018 §5', async () => {
  const { world, auth, token } = await loggedIn();
  const before = world.auditLog.length;
  await auth.logout(token);
  assert.equal(world.sessions.size, 0);
  assert.equal(await auth.resolve(token), null);
  await auth.logout(token);
  await auth.logout(null);
  const logouts = world.auditLog.slice(before).filter((e) => e.eventType === 'auth.logout');
  assert.equal(logouts.length, 1, 'a logout with no session was audited');
  assert.equal(logouts[0].actorId, 'u1');
});
