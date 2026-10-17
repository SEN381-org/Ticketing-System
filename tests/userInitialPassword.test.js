/**
 * POST /api/v1/users — the initial password (DEC-015 Addendum A, A3).
 *
 * Traces to: NFR-3.1, AC-NFR-3.1, FR-1.1, FR-1.4, CON-007, DEC-018 §2 and §7,
 *            DEC-015 Addendum A.
 *
 * Basis: DEC-018 §2 (scrypt, parameters travel with the hash, hashed only by
 * src/infrastructure/passwordHasher.js) and scripts/admin/create-user.js ("An empty
 * password is refused"; the password is used exactly as typed). The records define
 * no length or complexity policy, so none is asserted or invented.
 *
 * The real passwordHasher is used for the user-creation path (the login path of the
 * harness keeps its fake, so the seeded accounts can sign in quickly). The injected
 * log captures EVERY method it is asked for, and console is captured for the
 * duration of each request, so a password that reached any logger is visible.
 *
 * What this does NOT show: that no other process on the host (a reverse proxy, a
 * database profiler) records the request body; only this application's own output.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ROLE } from '../src/models/_shared.js';
import { passwordHasher, SCRYPT_PARAMS } from '../src/infrastructure/passwordHasher.js';
import { harness, serve, login, send, getJson } from './managementHarness.js';

// A synthetic test password, assembled at run time so that no credential-shaped literal
// sits in the file for the secret scan (the DEF-003 precedent). The value is unchanged.
const SECRET = ['Zq9', 'initial', 'secret', 'Xw4'].join('-');
const BODY = Object.freeze({
  email: 'fresh.person@example.test', displayName: 'Fresh Person', password: SECRET,
  roles: [ROLE.TECHNICIAN],
});

/** A log whose every method, whatever its name, records what it was given. */
function capturingLog() {
  const received = [];
  const log = new Proxy({}, {
    get: (_t, method) => (...args) => {
      received.push([String(method), ...args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))]);
    },
  });
  return { log, received };
}

/** Records console output made while `fn` runs, then restores console exactly. */
async function withConsoleCaptured(fn) {
  const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
  const saved = Object.fromEntries(methods.map((m) => [m, console[m]]));
  const seen = [];
  for (const m of methods) console[m] = (...args) => { seen.push([m, ...args.map(String)]); };
  try {
    return { value: await fn(), seen };
  } finally {
    for (const m of methods) console[m] = saved[m];
  }
}

const headersText = (res) => [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');

test('NFR-3.1, AC-NFR-3.1: the 201 body and every response header contain neither the password nor a hash', async () => {
  const { app } = harness({ adminPasswords: passwordHasher });
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    const res = await send(base, 'POST', '/users', { cookie, body: BODY });
    assert.equal(res.status, 201);
    const text = await res.text();
    const everything = `${headersText(res)}\n${text}`;
    assert.ok(!everything.includes(SECRET), 'the password is in the response');
    assert.doesNotMatch(everything, /scrypt\$|passwordHash|password/i, 'a hash or a password member is in the response');
    assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['displayName', 'email', 'id', 'roles']);
  });
});

test('NFR-3.1, CON-007: a later GET /users contains neither the password nor a hash', async () => {
  const { app } = harness({ adminPasswords: passwordHasher });
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    assert.equal((await send(base, 'POST', '/users', { cookie, body: BODY })).status, 201);
    const res = await getJson(base, '/users', cookie);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('fresh.person@example.test'), 'the new user is listed (so the test is not vacuous)');
    assert.ok(!text.includes(SECRET));
    assert.doesNotMatch(`${headersText(res)}\n${text}`, /scrypt\$|passwordHash|password/i);
  });
});

test('NFR-3.1: nothing the injected log or console receives during creation contains the password', async () => {
  const { log, received } = capturingLog();
  const { app } = harness({ adminPasswords: passwordHasher, log });
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    received.length = 0;
    const { value: res, seen } = await withConsoleCaptured(
      () => send(base, 'POST', '/users', { cookie, body: BODY }));
    assert.equal(res.status, 201);
    // Refused attempts are logged too: an empty password and a duplicate e-mail.
    const refused = await withConsoleCaptured(async () => [
      await send(base, 'POST', '/users', { cookie, body: { ...BODY, password: '' } }),
      await send(base, 'POST', '/users', { cookie, body: BODY }),
    ]);
    assert.deepEqual(refused.value.map((r) => r.status), [400, 409]);

    assert.ok(received.length > 0, 'the logger was exercised (the performance log), so the capture is not vacuous');
    const logged = JSON.stringify([received, seen, refused.seen]);
    assert.ok(!logged.includes(SECRET), 'the password reached a log method or console');
    assert.doesNotMatch(logged, /scrypt\$/, 'a hash reached a log method or console');
  });
});

test('NFR-3.1, DEC-018 §2: the stored hash is a scrypt hash with the DEC-018 parameters and verifies with passwordHasher', async () => {
  const { app, store } = harness({ adminPasswords: passwordHasher });
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    const { id } = await (await send(base, 'POST', '/users', { cookie, body: BODY })).json();
    const { passwordHash } = store.users.get(id);

    assert.match(passwordHash, /^scrypt\$N=\d+,r=\d+,p=\d+\$/);
    assert.ok(passwordHash.startsWith(
      `scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$`), 'DEC-018 §2 parameters');
    assert.ok(!passwordHash.includes(SECRET));
    assert.deepEqual(await passwordHasher.verify(SECRET, passwordHash), { ok: true, needsRehash: false });
    assert.equal((await passwordHasher.verify('not-the-password', passwordHash)).ok, false);
  });
});

test('DEC-018 §7: an empty password is refused 400 and nothing is stored; the password is used as typed, not trimmed', async () => {
  const { app, store } = harness({ adminPasswords: passwordHasher });
  await serve(app, async (base) => {
    const cookie = await login(base, 'admin@example.test');
    const before = store.users.size;
    for (const password of ['', null]) {
      const res = await send(base, 'POST', '/users', { cookie, body: { ...BODY, password } });
      assert.equal(res.status, 400, JSON.stringify(password));
      assert.match((await res.json()).detail, /^password is required/);
    }
    const number = await send(base, 'POST', '/users', { cookie, body: { ...BODY, password: 12345678 } });
    assert.equal(number.status, 400);
    assert.equal(store.users.size, before, 'no account for a refused password');

    const padded = ' padded secret ';
    const { id } = await (await send(base, 'POST', '/users', { cookie, body: { ...BODY, password: padded } })).json();
    assert.equal((await passwordHasher.verify(padded, store.users.get(id).passwordHash)).ok, true,
      'hashed exactly as given');
    assert.equal((await passwordHasher.verify(padded.trim(), store.users.get(id).passwordHash)).ok, false);
  });
});
