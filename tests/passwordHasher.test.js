/**
 * Verification evidence for NFR-3.1 and DEC-018 §2.
 * Referenced from the RTM verification column for NFR-3.1.
 *
 * These run real scrypt at the production parameters (about 0.3 s each on a
 * development machine), so the number of hashes is kept small on purpose.
 *
 * What this does NOT show: that the hash is slow enough on the VPS (DEC-018
 * evidence item 1), or AC-NFR-3.1's inspection of logs and backups for the
 * plaintext. It shows the stored form, the parameters, the comparison and the
 * maxmem fact DEC-018 records.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';

import { hashPassword, verifyPassword, SCRYPT_PARAMS, SCRYPT_MAXMEM }
  from '../src/infrastructure/passwordHasher.js';

const PASSWORD = 'correct horse battery staple';

test('the stored form is self-describing and holds no plaintext — NFR-3.1', async () => {
  const encoded = await hashPassword(PASSWORD);
  assert.match(encoded, /^scrypt\$N=32768,r=8,p=3\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.ok(!encoded.includes(PASSWORD));
});

test('the parameters are the DEC-018 values', () => {
  assert.deepEqual({ ...SCRYPT_PARAMS }, { N: 32768, r: 8, p: 3 });
  assert.equal(SCRYPT_MAXMEM, 64 * 1024 * 1024);
});

test("Node's default maxmem refuses these parameters, which is why maxmem is set — DEC-018 §2", () => {
  assert.throws(() => scryptSync(PASSWORD, 'salt', 64, { ...SCRYPT_PARAMS }),
    { code: 'ERR_CRYPTO_INVALID_SCRYPT_PARAMS' });
});

test('two hashes of one password differ (salted), and both verify', async () => {
  const [a, b] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);
  assert.notEqual(a, b);
  assert.deepEqual(await verifyPassword(PASSWORD, a), { ok: true, needsRehash: false });
  assert.equal((await verifyPassword('wrong password', b)).ok, false);
});

test('a hash with weaker parameters verifies and is marked for re-hash', async () => {
  const weak = await hashPassword(PASSWORD, { N: 2 ** 14, r: 8, p: 1 });
  assert.deepEqual(await verifyPassword(PASSWORD, weak), { ok: true, needsRehash: true });
});

test('a malformed stored hash fails like a wrong password, and does not throw', async () => {
  for (const bad of [undefined, '', 'plaintext', 'scrypt$N=1$x$y', 'bcrypt$N=32768,r=8,p=3$AA==$AA==']) {
    assert.deepEqual(await verifyPassword(PASSWORD, bad), { ok: false, needsRehash: false }, String(bad));
  }
});
