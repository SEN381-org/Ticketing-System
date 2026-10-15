/**
 * HTTP-level verification of the composed boundary — M3 Phase 0.
 *
 * Traces to: FR-1.1 (API half of AC-FR-1.1), FR-1.4, NFR-1.6, AC-NFR-1.6,
 *            NFR-3.3, NFR-3.4, CON-019, DEC-012, DEC-015, DEC-018.
 * Referenced from the RTM verification column for FR-1.1, NFR-1.6.
 *
 * The application here is the real `createApp` with the real middleware order,
 * the real session middleware and the real auth service. Only persistence and the
 * transition service are faked. Requests go over real HTTP on an ephemeral port.
 *
 * What this does NOT show: behaviour against a real cluster (the Phase 0 smoke
 * record covers reachability), TLS (NFR-3.2, Phase 1), or AC-FR-1.1's
 * "presents the authentication prompt", which is a client behaviour and there
 * is no client yet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createApp } from '../src/app.js';
import { createAuthService } from '../src/services/authService.js';
import { createHealthService } from '../src/services/healthService.js';
import { ROLE, STATUS } from '../src/models/_shared.js';

const quiet = { error() {} };

const TEST_RELEASE = '0123456789abcdef0123456789abcdef01234567';

function harness({ databaseUp = true } = {}) {
  const users = new Map([
    ['u1', { _id: 'u1', campusId: 'c1', email: 'coord@example.test', displayName: 'Coord',
             passwordHash: 'fake$right', roles: [ROLE.COORDINATOR], categoryAuthorisations: ['cat1'],
             groupIds: [], status: 'active', sessionEpoch: 0 }],
    ['u2', { _id: 'u2', campusId: 'c1', email: 'req@example.test', displayName: 'Req',
             passwordHash: 'fake$right', roles: [ROLE.REQUESTER], categoryAuthorisations: [],
             groupIds: [], status: 'active', sessionEpoch: 0 }],
  ]);
  const sessions = new Map();
  const transitions = [];
  const authService = createAuthService({
    users: {
      findForLogin: async (email) => [...users.values()].find((u) => u.email === email) ?? null,
      findById: async (id) => users.get(String(id)) ?? null,
      updatePasswordHash: async () => {},
    },
    sessions: {
      create: async (s) => { sessions.set(s._id, { ...s }); },
      findById: async (id) => sessions.get(id) ?? null,
      touch: async () => {},
      remove: async (id) => { const s = sessions.get(id) ?? null; sessions.delete(id); return s; },
    },
    audit: { recordSecurityEvent: async () => {} },
    passwords: {
      hash: async (p) => `fake$${p}`,
      verify: async (p, h) => ({ ok: h === `fake$${p}`, needsRehash: false }),
    },
  });
  const healthService = createHealthService({
    pingDatabase: async () => { if (!databaseUp) throw new Error('down'); },
    release: TEST_RELEASE,
  });
  const statusTransitionService = {
    transition: async (id, toStatus, actor, command) => {
      transitions.push({ id, toStatus, actor, command });
      return { requestId: id, toStatus, version: command.expectedVersion + 1, replayed: false };
    },
  };
  const app = createApp({ authService, healthService, statusTransitionService, log: quiet });
  return { app, users, sessions, transitions };
}

async function serve(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const json = (body, headers = {}) => ({
  headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});

async function login(base, email = 'coord@example.test', password = 'right') {
  const res = await fetch(`${base}/api/v1/sessions`, { method: 'POST', ...json({ email, password }) });
  const setCookie = res.headers.getSetCookie();
  const cookie = setCookie[0]?.split(';')[0];
  return { res, setCookie, cookie };
}

const transition = (base, headers = {}) => fetch(`${base}/api/v1/requests/r1/transitions`, {
  method: 'POST',
  ...json({ toStatus: STATUS.REJECTED, reason: 'duplicate' },
    { 'if-match': '"v0"', 'idempotency-key': 'k-1', ...headers }),
});

// ---------- NFR-1.6 ----------

test('health answers without a session, and reports both statuses — AC-NFR-1.6', async () => {
  await serve(harness().app, async (base) => {
    const res = await fetch(`${base}/api/v1/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { application: 'up', database: 'up', release: TEST_RELEASE });
  });
});

test('health reports a database outage as 503 — DEC-015, NFR-1.6', async () => {
  await serve(harness({ databaseUp: false }).app, async (base) => {
    const res = await fetch(`${base}/api/v1/health`);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { application: 'up', database: 'down', release: TEST_RELEASE });
  });
});

// ---------- FR-1.1, DEC-012: 401 is decided by the guard ----------

test('a transition with no session is 401 problem details, and the service is not reached — AC-FR-1.1 (API half)', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const res = await transition(base);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('content-type'), 'application/problem+json; charset=utf-8');
    assert.equal((await res.json()).code, 'UNAUTHENTICATED');
  });
  assert.equal(h.transitions.length, 0);
});

test('a forged cookie is 401 and the cookie is cleared — DEC-018 §4', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const res = await transition(base, { cookie: `__Host-sid=${'A'.repeat(43)}` });
    assert.equal(res.status, 401);
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith('__Host-sid='));
    assert.ok(cleared, 'the invalid cookie was not cleared');
    assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
  });
  assert.equal(h.transitions.length, 0);
});

// ---------- DEC-018 §3, §5: login ----------

test('login sets __Host-sid with HttpOnly, Secure, SameSite=Lax, Path=/ and no Domain — DEC-018 §3', async () => {
  await serve(harness().app, async (base) => {
    const { res, setCookie } = await login(base);
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { id: 'u1', displayName: 'Coord', roles: [ROLE.COORDINATOR] });
    assert.equal(setCookie.length, 1);
    const attrs = setCookie[0].split(';').map((s) => s.trim().toLowerCase());
    assert.match(attrs[0], /^__host-sid=[a-z0-9_-]{43}$/);
    for (const required of ['httponly', 'secure', 'samesite=lax', 'path=/']) {
      assert.ok(attrs.includes(required), `missing ${required}`);
    }
    assert.ok(!attrs.some((a) => a.startsWith('domain=')), '__Host- forbids Domain');
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });
});

test('a failed login is one identical 401 whatever the cause — DEC-018 §5', async () => {
  const h = harness();
  h.users.get('u2').status = 'revoked';
  await serve(h.app, async (base) => {
    const bodies = [];
    for (const [email, password] of [['nobody@example.test', 'right'], ['coord@example.test', 'wrong'],
                                     ['req@example.test', 'right']]) {
      const { res, setCookie } = await login(base, email, password);
      assert.equal(res.status, 401);
      assert.equal(setCookie.length, 0);
      const body = await res.json();
      delete body.instance;
      bodies.push(body);
    }
    assert.deepEqual(bodies[1], bodies[0]);
    assert.deepEqual(bodies[2], bodies[0]);
  });
});

test('a write that is not JSON is 415, including login — DEC-015 §5 (CSRF)', async () => {
  await serve(harness().app, async (base) => {
    const res = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=coord%40example.test&password=right',
    });
    assert.equal(res.status, 415);
    assert.equal((await res.json()).code, 'UNSUPPORTED_MEDIA_TYPE');
  });
});

test('malformed JSON is a 400 problem, not a 500 — DEC-015', async () => {
  await serve(harness().app, async (base) => {
    const res = await fetch(`${base}/api/v1/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":',
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'INVALID_REQUEST');
  });
});

// ---------- the whole path ----------

test('with a session the transition reaches the service with the session actor — DEC-018 §4', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const { cookie } = await login(base);
    const res = await transition(base, { cookie });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('etag'), '"v1"');
  });
  assert.equal(h.transitions.length, 1);
  assert.deepEqual(h.transitions[0].actor,
    { id: 'u1', roles: [ROLE.COORDINATOR], categoryAuthorisations: ['cat1'], groupIds: [] });
});

test('an identity header is refused with 403 even with a valid session — R-06, CON-019', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const { cookie } = await login(base);
    const res = await transition(base, { cookie, 'x-actor-role': ROLE.ADMINISTRATOR });
    assert.equal(res.status, 403);
  });
  assert.equal(h.transitions.length, 0);
});

test('a role without the operation is 403, decided by the guard — FR-1.3, NFR-3.3', async () => {
  await serve(harness().app, async (base) => {
    const { cookie } = await login(base, 'req@example.test');
    const res = await transition(base, { cookie });
    assert.equal(res.status, 403);
  });
});

test('revocation ends an open session at its next request — AC-FR-1.4', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const { cookie } = await login(base);
    h.users.get('u1').sessionEpoch += 1;
    assert.equal((await transition(base, { cookie })).status, 401);
  });
});

test('logout is 204, clears the cookie, ends the session, and is idempotent — DEC-018 §5', async () => {
  const h = harness();
  await serve(h.app, async (base) => {
    const { cookie } = await login(base);
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${base}/api/v1/sessions/current`, { method: 'DELETE', headers: { cookie } });
      assert.equal(res.status, 204);
      assert.ok(res.headers.getSetCookie().some((c) => c.startsWith('__Host-sid=;')));
    }
    assert.equal(h.sessions.size, 0);
    assert.equal((await transition(base, { cookie })).status, 401, 'the old cookie still works');
    const anonymous = await fetch(`${base}/api/v1/sessions/current`, { method: 'DELETE' });
    assert.equal(anonymous.status, 204);
  });
});

test('an unknown route is a 404 problem, not an HTML page — CON-019', async () => {
  await serve(harness().app, async (base) => {
    const res = await fetch(`${base}/api/v1/nothing-here`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, 'NOT_FOUND');
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});
