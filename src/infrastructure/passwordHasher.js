/**
 * Password hashing — DEC-018 §2.
 *
 * Traces to: NFR-3.1, AC-NFR-3.1, DEC-018.
 *
 * scrypt from node:crypto, so no native dependency (CON-003, CON-008). The
 * parameters are one of OWASP's equivalent scrypt settings. This one was chosen
 * for its 32 MiB working memory per hash.
 *
 * Stored form: `scrypt$N=32768,r=8,p=3$<salt b64>$<hash b64>`. The parameters
 * travel with the hash, so they can be raised later. `verifyPassword` reports
 * `needsRehash` for a hash made with weaker parameters, and the auth service
 * re-hashes it at the next successful login.
 */

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

export const SCRYPT_PARAMS = Object.freeze({ N: 2 ** 15, r: 8, p: 3 });

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * The parameters need 128 · N · r = 33 554 432 bytes, which is exactly Node's
 * default maxmem of 32 MiB, and scrypt's working overhead takes it over. With
 * the default, `crypto.scrypt` throws ERR_CRYPTO_INVALID_SCRYPT_PARAMS ("memory
 * limit exceeded") synchronously. Observed 11/10/2026 and asserted by test.
 */
export const SCRYPT_MAXMEM = 64 * 1024 * 1024;

const PREFIX = 'scrypt';

function derive(password, salt, { N, r, p }) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: SCRYPT_MAXMEM },
      (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password, params = SCRYPT_PARAMS) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, params);
  return `${PREFIX}$N=${params.N},r=${params.r},p=${params.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** @returns {{N:number,r:number,p:number,salt:Buffer,key:Buffer} | null} */
function parse(encoded) {
  if (typeof encoded !== 'string') return null;
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== PREFIX) return null;
  const match = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parts[1]);
  if (!match) return null;
  const [N, r, p] = match.slice(1).map(Number);
  const salt = Buffer.from(parts[2], 'base64');
  const key = Buffer.from(parts[3], 'base64');
  if (salt.length === 0 || key.length !== KEY_LENGTH) return null;
  return { N, r, p, salt, key };
}

/**
 * @returns {Promise<{ok: boolean, needsRehash: boolean}>}
 * A malformed stored hash verifies as false rather than throwing, so a damaged
 * account fails like a wrong password and reveals nothing different.
 */
export async function verifyPassword(password, encoded) {
  const stored = parse(encoded);
  if (!stored) return { ok: false, needsRehash: false };

  let candidate;
  try {
    candidate = await derive(password, stored.salt, stored);
  } catch {
    return { ok: false, needsRehash: false };
  }

  const ok = timingSafeEqual(candidate, stored.key);
  const needsRehash = ok && (stored.N < SCRYPT_PARAMS.N || stored.r < SCRYPT_PARAMS.r
                             || stored.p < SCRYPT_PARAMS.p);
  return { ok, needsRehash };
}

export const passwordHasher = Object.freeze({ hash: hashPassword, verify: verifyPassword });
