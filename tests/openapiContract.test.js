/**
 * Regression test for DEF-002: docs/api/openapi.yaml did not list INTERNAL_ERROR,
 * which the 500 handler has always sent. The contract and the code had drifted
 * with nothing to notice.
 *
 * The expected set is derived from the code at run time, not typed here: every
 * AppError subclass in src/errors.js, plus the code the error handler uses for an
 * unrecognised error. Adding an error type without adding its code to the
 * contract fails this test.
 *
 * What this does NOT show: that every documented response is reachable, or that
 * the YAML is a valid OpenAPI document. Only the Problem.code enumeration is checked.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as errors from '../src/errors.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';

function codesInCode() {
  const codes = new Set();
  for (const Type of Object.values(errors)) {
    if (typeof Type === 'function' && Type.prototype instanceof errors.AppError) codes.add(new Type().code);
  }
  let body;
  const res = { status() { return this; }, type() { return this; }, json(b) { body = b; return this; } };
  createErrorHandler({ log: { error() {} } })(new Error('unrecognised'), {}, res, () => {});
  codes.add(body.code);
  return codes;
}

function codesInContract() {
  const yaml = readFileSync(new URL('../docs/api/openapi.yaml', import.meta.url), 'utf8');
  const problem = yaml.slice(yaml.indexOf('    Problem:'));
  const match = /code:\s*\n\s*type: string\s*\n\s*enum: \[([^\]]*)\]/.exec(problem);
  assert.ok(match, 'Problem.code enum not found in openapi.yaml');
  return new Set(match[1].split(',').map((s) => s.trim()).filter(Boolean));
}

test('every problem code the code can send is in the contract, and no other — DEF-002, DEC-015', () => {
  const inCode = codesInCode();
  const inContract = codesInContract();
  assert.ok(inCode.has('INTERNAL_ERROR'), 'the derivation lost the 500 code');
  assert.deepEqual([...inCode].filter((c) => !inContract.has(c)).sort(), [], 'missing from openapi.yaml');
  assert.deepEqual([...inContract].filter((c) => !inCode.has(c)).sort(), [], 'documented but never sent');
});
