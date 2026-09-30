/**
 * Verification evidence for the transition resource — DEC-015, review comment B-3.
 * Referenced from the RTM verification column for FR-6.2, NFR-3.3.
 *
 * DEC-015 §3 requires Idempotency-Key on every state-changing POST. The key is
 * not a nicety: `requestHistory` is append-only, so a duplicate entry written by
 * a client retry can never be removed — not by an administrator, not by a
 * migration. An optional safeguard is no safeguard, because the client that
 * omits it is exactly the client that retries.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readCommand, API_BASE } from '../src/routes/requestRoutes.js';
import { IdempotencyKeyRequiredError, PreconditionRequiredError } from '../src/errors.js';
import { STATUS } from '../src/models/_shared.js';

function request({ ifMatch = '"v3"', key = 'k-123', body = { toStatus: STATUS.IN_PROGRESS } } = {}) {
  const headers = {};
  if (ifMatch !== null) headers['if-match'] = ifMatch;
  if (key !== null) headers['idempotency-key'] = key;
  return { headers, body, get: (h) => headers[h.toLowerCase()] };
}

test('a missing Idempotency-Key is refused with 400 — B-3, DEC-015', () => {
  assert.throws(() => readCommand(request({ key: null })), IdempotencyKeyRequiredError);
  try { readCommand(request({ key: null })); } catch (e) { assert.equal(e.status, 400); }
});

test('a blank Idempotency-Key is refused — B-3', () => {
  assert.throws(() => readCommand(request({ key: '   ' })), IdempotencyKeyRequiredError);
});

test('a missing If-Match is refused with 428 — DEC-015', () => {
  assert.throws(() => readCommand(request({ ifMatch: null })), PreconditionRequiredError);
  try { readCommand(request({ ifMatch: null })); } catch (e) { assert.equal(e.status, 428); }
});

test('a malformed If-Match is refused rather than parsed loosely', () => {
  for (const bad of ['3', 'v3', 'W/"v3"', '"3"', '""']) {
    assert.throws(() => readCommand(request({ ifMatch: bad })), PreconditionRequiredError, bad);
  }
});

test('a well-formed command carries the version, key and fingerprint', () => {
  const command = readCommand(request());
  assert.equal(command.expectedVersion, 3);
  assert.equal(command.idempotencyKey, 'k-123');
  assert.equal(command.fingerprint.length, 64);
});

test('the body fields are the DEC-015 names — N-3', () => {
  const command = readCommand(request({
    body: { toStatus: STATUS.CLOSED, reason: 'done', resolution: 'replaced the unit' },
  }));
  assert.equal(command.reason, 'done');
  assert.equal(command.resolutionSummary, 'replaced the unit');
});

test('the same key with a different body gives a different fingerprint — DEC-015', () => {
  const a = readCommand(request({ body: { toStatus: STATUS.CLOSED, reason: 'one' } }));
  const b = readCommand(request({ body: { toStatus: STATUS.CLOSED, reason: 'two' } }));
  assert.notEqual(a.fingerprint, b.fingerprint,
    'a replayed key with a changed body must be detectable as a conflict');
});

test('the transition resource is mounted under /api/v1 — DEC-015', () => {
  assert.equal(API_BASE, '/api/v1/requests');
});
