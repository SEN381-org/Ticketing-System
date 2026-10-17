/**
 * Contract tests for docs/api/openapi.yaml.
 *
 * TD-007: these tests used to read the file with regular expressions and never
 * parsed it, so in PR #105 a syntactically broken openapi.yaml passed every
 * check. The file is now parsed as YAML (the `yaml` package, dev dependency
 * only) and the assertions read the parsed document.
 *
 * 1. The file is valid YAML with no duplicate keys, declares OpenAPI 3.x, and
 *    every local $ref points at something that exists.
 * 2. Regression test for DEF-002: the contract did not list INTERNAL_ERROR,
 *    which the 500 handler has always sent. The expected set is derived from the
 *    code at run time, not typed here: every AppError subclass in src/errors.js,
 *    plus the code the error handler uses for an unrecognised error. Adding an
 *    error type without adding its code to the contract fails this test.
 *
 * What this does NOT show: that the document is valid against the OpenAPI 3.1
 * schema (types, required fields of every object), or that every documented
 * response is reachable. Only parseability, the version, local references and
 * the Problem.code enumeration are checked.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';

import * as errors from '../src/errors.js';
import { createErrorHandler } from '../src/middleware/errorHandler.js';

const CONTRACT = new URL('../docs/api/openapi.yaml', import.meta.url);

/** Parses openapi.yaml strictly. Fails the calling test with the parser's own messages. */
function loadContract() {
  const doc = parseDocument(readFileSync(CONTRACT, 'utf8'), { uniqueKeys: true, prettyErrors: true });
  assert.deepEqual(doc.errors.map((e) => e.message), [], 'openapi.yaml is not valid YAML');
  return doc.toJS();
}

/** Every `$ref` value anywhere in the document. */
function refsIn(value) {
  if (value === null || typeof value !== 'object') return [];
  const own = typeof value.$ref === 'string' ? [value.$ref] : [];
  return own.concat(Object.values(value).flatMap(refsIn));
}

/** Follows a local JSON pointer such as #/components/schemas/Problem. */
function resolve(contract, ref) {
  return ref.slice(2).split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, key) => (node == null ? undefined : node[key]), contract);
}

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
  const codes = loadContract().components?.schemas?.Problem?.properties?.code?.enum;
  assert.ok(Array.isArray(codes), 'components.schemas.Problem.properties.code.enum not found in openapi.yaml');
  return new Set(codes);
}

test('openapi.yaml parses as YAML and is an OpenAPI 3 document whose local references resolve — TD-007, DEC-015', () => {
  const contract = loadContract();
  assert.match(String(contract.openapi), /^3\.\d+\.\d+$/, 'openapi version is not 3.x.y');
  assert.equal(typeof contract.info?.title, 'string', 'info.title missing');
  assert.equal(typeof contract.info?.version, 'string', 'info.version missing');
  assert.ok(contract.paths && Object.keys(contract.paths).length > 0, 'no paths documented');

  const refs = refsIn(contract);
  assert.ok(refs.length > 0, 'no $ref found; the check would prove nothing');
  const external = refs.filter((ref) => !ref.startsWith('#/'));
  assert.deepEqual(external, [], 'only local references are expected');
  const dangling = [...new Set(refs)].filter((ref) => resolve(contract, ref) === undefined).sort();
  assert.deepEqual(dangling, [], 'references to nothing');
});

test('every problem code the code can send is in the contract, and no other — DEF-002, DEC-015', () => {
  const inCode = codesInCode();
  const inContract = codesInContract();
  assert.ok(inCode.has('INTERNAL_ERROR'), 'the derivation lost the 500 code');
  assert.deepEqual([...inCode].filter((c) => !inContract.has(c)).sort(), [], 'missing from openapi.yaml');
  assert.deepEqual([...inContract].filter((c) => !inCode.has(c)).sort(), [], 'documented but never sent');
});
