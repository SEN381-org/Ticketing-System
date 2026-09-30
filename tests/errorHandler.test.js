/**
 * Verification evidence for DEC-015 problem details and the CON-019 leak.
 * Referenced from the RTM verification column for NFR-3.3, CON-019.
 *
 * Review comment R-05: an unrecognised error previously fell through to
 * Express's default handler, which serves an HTML page containing a stack trace
 * unless NODE_ENV is production. This asserts that it cannot.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { createErrorHandler } from '../src/middleware/errorHandler.js';
import { AuthorisationError, PreconditionFailedError } from '../src/errors.js';

function capture(error, { originalUrl = '/api/v1/requests/1/transitions' } = {}) {
  const out = {};
  const res = {
    status(code) { out.status = code; return this; },
    type(t)      { out.contentType = t; return this; },
    json(body)   { out.body = body; return this; },
  };
  const logged = [];
  createErrorHandler({ log: { error: (...a) => logged.push(a) } })(error, { originalUrl }, res, () => {});
  return { ...out, logged };
}

test('a known error becomes RFC 9457 problem details — DEC-015', () => {
  const r = capture(new AuthorisationError());
  assert.equal(r.status, 403);
  assert.equal(r.contentType, 'application/problem+json');
  assert.equal(r.body.code, 'FORBIDDEN');
  assert.ok(r.body.type.startsWith('https://'));
  assert.equal(r.body.instance, '/api/v1/requests/1/transitions');
});

test('a precondition failure maps to 412 — DEC-015 / DEC-016', () => {
  assert.equal(capture(new PreconditionFailedError('req-1', 3)).status, 412);
});

test('an unexpected error leaks neither message nor stack — R-05, CON-019', () => {
  const secret = new Error('connect ECONNREFUSED 10.0.0.5:27017 user=admin');
  const r = capture(secret);

  assert.equal(r.status, 500);
  assert.equal(r.contentType, 'application/problem+json');

  const serialised = JSON.stringify(r.body);
  assert.ok(!serialised.includes('ECONNREFUSED'), 'the internal message must not reach the client');
  assert.ok(!serialised.includes('10.0.0.5'), 'infrastructure detail must not reach the client');
  assert.ok(!('stack' in r.body), 'no stack trace may be serialised');
  assert.equal(r.logged.length, 1, 'it is logged server-side instead');
});
