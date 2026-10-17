/**
 * Contract test: the routes the composed application registers and the operations
 * docs/api/openapi.yaml documents are the same set, in both directions.
 *
 * Basis: DEC-015 (the API contract is a baselined artefact), NFR-3.3 / CON-019 (the
 * public surface must be known), NV-40 (removing GET /requests/{id} from the contract
 * left every test green).
 * Why: a route added without documentation, or a documented operation nobody
 * implemented, is drift with nothing to notice it.
 * Technique: contract / structural, no network. The registered side is the existing
 * routeTable(app) over composeApplication().app (app.locals.mounts), so public routes
 * (health, sessions) are included. The documented side is read from the parsed
 * document's `paths` object (TD-007: this used to be a line scan that never parsed the
 * YAML, so a broken file could pass). Express `:id` is normalised to OpenAPI `{id}`,
 * and the `servers[0].url` prefix (/api/v1) is read from the contract, not typed here.
 * Expected: the two sets are equal. Derived from DEC-015, not from running the code.
 * Shows: every METHOD + path pair is documented and implemented. Does NOT show: that
 * parameters, responses or schemas match the code, or that the document is valid
 * against the OpenAPI schema (tests/openapiContract.test.js checks that it parses).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDocument } from 'yaml';

import { composeApplication } from '../src/composition.js';
import { routeTable } from '../src/app.js';

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

function documented() {
  const doc = parseDocument(readFileSync(new URL('../docs/api/openapi.yaml', import.meta.url), 'utf8'),
    { uniqueKeys: true });
  assert.deepEqual(doc.errors.map((e) => e.message), [], 'openapi.yaml is not valid YAML');
  const contract = doc.toJS();

  const server = contract.servers?.[0]?.url;
  assert.equal(typeof server, 'string', 'servers[0].url not found in openapi.yaml');
  const prefix = server.replace(/\/$/, '');
  assert.ok(contract.paths && typeof contract.paths === 'object', 'paths not found in openapi.yaml');

  const ops = new Set();
  for (const [path, item] of Object.entries(contract.paths)) {
    for (const method of Object.keys(item ?? {})) {
      if (HTTP_METHODS.has(method)) ops.add(`${method.toUpperCase()} ${prefix}${path}`);
    }
  }
  return ops;
}

function registered() {
  const routes = routeTable(composeApplication({ log: { error() {} } }).app);
  return new Set(routes.map((r) => `${r.method} ${r.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`));
}

test('every route the composed application registers is documented in openapi.yaml — DEC-015', () => {
  const docs = documented();
  assert.ok(docs.size > 0, 'no operations were read from openapi.yaml');
  assert.deepEqual([...registered()].filter((o) => !docs.has(o)).sort(), [], 'registered but not documented');
});

test('every operation documented in openapi.yaml is registered in the composed application — DEC-015', () => {
  const reg = registered();
  assert.ok(reg.size > 0, 'no routes were read from the application');
  const docs = documented();
  assert.ok(docs.size > 0, 'no operations were read from openapi.yaml');
  assert.deepEqual([...docs].filter((o) => !reg.has(o)).sort(), [], 'documented but not registered');
});
