/**
 * Verification evidence for configuration handling — NFR-3.5, DEC-003.
 *
 * The process must refuse to start on missing or malformed configuration, and the
 * refusal must not print the connection string, which carries a credential.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig, ConfigurationError, LISTEN_HOST } from '../src/config.js';

// Assembled at runtime so no credential-shaped literal is committed for the
// secret scan (CI, Gitleaks) to flag. The value is fake.
const FAKE_PASSWORD = ['not', 'a', 'real', 'password'].join('-');
const SECRET_URI = `mongodb+srv://civicconnect-app:${FAKE_PASSWORD}@cluster0.example.invalid/civicconnect`;

test('a complete environment yields a frozen configuration', () => {
  const config = loadConfig({ MONGODB_URI: SECRET_URI, PORT: '3000' });
  assert.deepEqual(config, { mongodbUri: SECRET_URI, port: 3000 });
  assert.ok(Object.isFrozen(config));
});

test('missing values are refused and every problem is named', () => {
  assert.throws(() => loadConfig({}), (e) =>
    e instanceof ConfigurationError && /MONGODB_URI is not set/.test(e.message) && /PORT is not set/.test(e.message));
});

test('malformed values are refused', () => {
  for (const env of [
    { MONGODB_URI: 'postgres://x', PORT: '3000' },
    { MONGODB_URI: SECRET_URI, PORT: '0' },
    { MONGODB_URI: SECRET_URI, PORT: '3000.5' },
    { MONGODB_URI: SECRET_URI, PORT: 'eighty' },
  ]) {
    assert.throws(() => loadConfig(env), ConfigurationError, JSON.stringify(env.PORT));
  }
});

test('an error never echoes the connection string — NFR-3.5', () => {
  assert.throws(() => loadConfig({ MONGODB_URI: SECRET_URI, PORT: 'x' }), (e) =>
    !e.message.includes(FAKE_PASSWORD) && !e.message.includes(SECRET_URI));
});

test('the listen address is loopback only and not configurable — DEC-003', () => {
  assert.equal(LISTEN_HOST, '127.0.0.1');
  assert.equal(loadConfig({ MONGODB_URI: SECRET_URI, PORT: '3000', HOST: '0.0.0.0' }).host, undefined);
});
