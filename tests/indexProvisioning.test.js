/**
 * Verification of the index-provisioning script's decisions. Traces to: TD-004, DEC-003 v0.3
 * (deployment step 5), DEF-014, DEF-015, DEF-017.
 *
 * Technique: the script's decisions live in scripts/atlas/indexComparison.js as pure functions.
 * Each test gives them fixed inputs (declared index, what listIndexes would return, a
 * connectionStatus listing, a URI, a command name) and asserts the classification, the exit code or
 * the refusal. The expected result of each is written in the comment above its assertion and was
 * derived from the project record before the test was run, not from the code's output.
 *
 * What a pass shows: given those inputs the script classifies, fails and refuses as the record
 * requires. What it does NOT show: that a real Atlas cluster returns listIndexes documents of this
 * shape (the live runs L1 to L4 do), that the I/O shell wires these functions correctly, or that
 * the privileges are what the cluster really grants. Nothing here connects to a database.
 *
 * The specific tests were each seen to fail with the code they protect broken: see
 * docs/evidence/M3-indexes/INDEX_provisioning_script_NV.txt.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkPrivileges, checkTarget, classify, describeError, formatComparison, isCommandAllowed, makeRedactor, normaliseDeclared, summarise,
} from '../scripts/atlas/indexComparison.js';
import { loadDeclared } from '../scripts/atlas/declaredIndexes.js';
import { CLUSTER_MARKERS, TEST_CLUSTER_MARKER } from '../scripts/lib/clusterMarkers.js';
import mongoose from 'mongoose';

// ---- helpers -------------------------------------------------------------------------------

const C = 'things';
/** classify() for one declared index and the documents the server would list for the collection. */
function run(declaredIndex, presentDocs, collection = C) {
  const present = presentDocs === null ? null : [{ v: 2, key: { _id: 1 }, name: '_id_' }, ...presentDocs];
  const result = classify([{ collection, indexes: [declaredIndex] }], new Map([[collection, present]]));
  return { result, entry: result.entries[0], summary: summarise(result) };
}
const doc = (key, extra = {}) => ({
  v: 2, key, name: Object.entries(key).map(([f, d]) => `${f}_${d}`).join('_'), ...extra,
});

// ---- comparison ----------------------------------------------------------------------------

test('U1 an identical compound index is PRESENT and the run passes — TD-004', () => {
  // Expected: PRESENT, no differences, 1 of 1, exit 0.
  const { entry, summary } = run([{ a: 1, b: -1 }, {}], [doc({ a: 1, b: -1 })]);
  assert.equal(entry.status, 'PRESENT');
  assert.deepEqual(entry.differences, []);
  assert.equal(summary.exitCode, 0);
});

test('U2 the same fields in a different order are not the same index — TD-004', () => {
  // Expected: declared {a,b} is MISSING (the server holds {b,a}); {b,a} is UNDECLARED; exit 1.
  const { entry, result, summary } = run([{ a: 1, b: 1 }, {}], [doc({ b: 1, a: 1 })]);
  assert.equal(entry.status, 'MISSING');
  assert.deepEqual(result.undeclared.map((u) => u.name), ['b_1_a_1']);
  assert.equal(summary.exitCode, 1);
});

test('U3 a different direction is MISSING — TD-004', () => {
  // Expected: declared createdAt: -1, server createdAt: 1 -> MISSING, exit 1.
  const { entry, summary } = run([{ createdAt: -1 }, {}], [doc({ createdAt: 1 })]);
  assert.equal(entry.status, 'MISSING');
  assert.equal(summary.exitCode, 1);
});

test('U4 a unique index that is not unique on the server is DIFFERENT — DEF-017, DEF-015', () => {
  // Expected: DEF-017 asks for email_1 to be unique. Server has email_1 without unique:
  // DIFFERENT, one difference on "unique" (declared true, present false), exit 1.
  const { entry, summary } = run([{ email: 1 }, { unique: true }], [doc({ email: 1 })]);
  assert.equal(entry.status, 'DIFFERENT');
  assert.deepEqual(entry.differences, [{ field: 'unique', declared: true, present: false }]);
  assert.equal(summary.exitCode, 1);
});

test('U5 an idempotency index without its partial filter is DIFFERENT — DEF-014', () => {
  // Expected: DEF-014 shape. Declared partial { idempotencyKey: { $type: 'string' } }.
  // Server absent -> DIFFERENT; server with a different filter -> DIFFERENT; same filter (key order
  // irrelevant inside a document) -> PRESENT.
  const declared = [{ actorId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }];
  const base = doc({ actorId: 1, idempotencyKey: 1 }, { unique: true });
  const absent = run(declared, [base]).entry;
  assert.equal(absent.status, 'DIFFERENT');
  assert.equal(absent.differences[0].field, 'partialFilterExpression');
  const other = run(declared, [{ ...base, partialFilterExpression: { idempotencyKey: { $exists: true } } }]).entry;
  assert.equal(other.status, 'DIFFERENT');
  const same = run(declared, [{ ...base, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }]).entry;
  assert.equal(same.status, 'PRESENT');
});

test('U6 a different or absent TTL is DIFFERENT and reports both values — DEC-003 v0.3, NFR-3.4', () => {
  // Expected: declared 1800. Server 3600 -> DIFFERENT (declared 1800, present 3600). Server none -> DIFFERENT
  // (present undefined). Server 1800 -> PRESENT.
  const declared = [{ lastSeenAt: 1 }, { expireAfterSeconds: 1800 }];
  const wrong = run(declared, [doc({ lastSeenAt: 1 }, { expireAfterSeconds: 3600 })]).entry;
  assert.equal(wrong.status, 'DIFFERENT');
  assert.deepEqual(wrong.differences, [{ field: 'expireAfterSeconds', declared: 1800, present: 3600 }]);
  const none = run(declared, [doc({ lastSeenAt: 1 })]).entry;
  assert.equal(none.status, 'DIFFERENT');
  assert.deepEqual(none.differences, [{ field: 'expireAfterSeconds', declared: 1800, present: undefined }]);
  assert.equal(run(declared, [doc({ lastSeenAt: 1 }, { expireAfterSeconds: 1800 })]).entry.status, 'PRESENT');
});

test('U7 a text index is compared on weights, fields and language — TD-004', () => {
  // Declared (synthetic) text on description (weight 2) and location (default weight 1).
  // Server form: key { _fts: 'text', _ftsx: 1 }, weights { description: 2, location: 1 }, name
  // description_text_location_text, english, language. -> PRESENT. A different weight, a missing
  // field, or a different default_language -> DIFFERENT.
  const declared = [{ description: 'text', location: 'text' }, { weights: { description: 2 } }];
  const stored = {
    v: 2, key: { _fts: 'text', _ftsx: 1 }, name: 'description_text_location_text',
    weights: { description: 2, location: 1 }, default_language: 'english', language_override: 'language', textIndexVersion: 3,
  };
  assert.equal(run(declared, [stored]).entry.status, 'PRESENT');
  const weight = run(declared, [{ ...stored, weights: { description: 3, location: 1 } }]).entry;
  assert.equal(weight.status, 'DIFFERENT');
  assert.equal(weight.differences[0].field, 'weights');
  const field = run(declared, [{ ...stored, weights: { description: 2 } }]).entry;
  assert.equal(field.status, 'DIFFERENT');
  const lang = run(declared, [{ ...stored, default_language: 'french' }]).entry;
  assert.equal(lang.status, 'DIFFERENT');
  assert.equal(lang.differences[0].field, 'default_language');
});

test('U8 an extra index on the server is UNDECLARED and fails the run — decision D3', () => {
  // Expected: declared a_1 present; server also holds z_1. -> a_1 PRESENT, z_1 UNDECLARED, exit 1;
  // the _id_ index is not reported as undeclared.
  const { entry, result, summary } = run([{ a: 1 }, {}], [doc({ a: 1 }), doc({ z: 1 })]);
  assert.equal(entry.status, 'PRESENT');
  assert.deepEqual(result.undeclared.map((u) => u.name), ['z_1']);
  assert.equal(summary.exitCode, 1);
});

test('U9 a collection holding only _id_ with nothing declared gives 0 of 0 and passes — TD-004', () => {
  // Expected: no entries, no undeclared, "0 of 0", exit 0.
  const result = classify([{ collection: C, indexes: [] }], new Map([[C, [{ v: 2, key: { _id: 1 }, name: '_id_' }]]]));
  const summary = summarise(result);
  assert.equal(summary.declared, 0);
  assert.equal(summary.exitCode, 0);
  assert.match(summary.line, /^RESULT PASS: 0 of 0 declared/);
});

test('U10 the same key and options under a different name are DIFFERENT (name) — decision D6', () => {
  // Expected: declared name a_1; server index on {a:1} named custom_a -> DIFFERENT, difference "name"
  // (declared a_1, present custom_a), exit 1. A custom declared name that matches the server is PRESENT.
  const { entry, summary } = run([{ a: 1 }, {}], [{ v: 2, key: { a: 1 }, name: 'custom_a' }]);
  assert.equal(entry.status, 'DIFFERENT');
  assert.deepEqual(entry.differences, [{ field: 'name', declared: 'a_1', present: 'custom_a' }]);
  assert.equal(summary.exitCode, 1);
  assert.equal(run([{ a: 1 }, { name: 'custom_a' }], [{ v: 2, key: { a: 1 }, name: 'custom_a' }]).entry.status, 'PRESENT');
});

test('U11 an option the comparator does not understand is DIFFERENT, on either side — fail closed', () => {
  // Expected: server index with hidden:true -> DIFFERENT on "hidden". Server index with a collation,
  // which is not compared -> DIFFERENT "uncompared option collation". A declared collation the server
  // lacks -> DIFFERENT too.
  const hidden = run([{ a: 1 }, {}], [doc({ a: 1 }, { hidden: true })]).entry;
  assert.equal(hidden.status, 'DIFFERENT');
  assert.equal(hidden.differences[0].field, 'hidden');
  const collation = run([{ a: 1 }, {}], [doc({ a: 1 }, { collation: { locale: 'en' } })]).entry;
  assert.equal(collation.status, 'DIFFERENT');
  assert.equal(collation.differences[0].field, 'uncompared option collation');
  const declaredSide = run([{ a: 1 }, { collation: { locale: 'en' } }], [doc({ a: 1 })]).entry;
  assert.equal(declaredSide.status, 'DIFFERENT');
});

test('U12 server bookkeeping fields and declared background are ignored — TD-004', () => {
  // Expected: server v, ns, background, textIndexVersion, 2dsphereIndexVersion and a declared
  // background:true change nothing -> PRESENT.
  const stored = doc({ a: 1 }, { ns: 'civicconnect.things', background: false, textIndexVersion: 3, '2dsphereIndexVersion': 3 });
  assert.equal(run([{ a: 1 }, { background: true, _autoIndex: false }], [stored]).entry.status, 'PRESENT');
});

test('the collection not existing is MISSING for each declared index, not an error — decision D4', () => {
  // Expected: present = null (NamespaceNotFound) -> MISSING, no undeclared, exit 1.
  const { entry, result, summary } = run([{ a: 1 }, {}], null);
  assert.equal(entry.status, 'MISSING');
  assert.deepEqual(result.undeclared, []);
  assert.equal(summary.exitCode, 1);
});

// ---- summary and exit code ------------------------------------------------------------------

test('U13 the summary line has the exact wording and the exit code follows the counts — decision D11', () => {
  // Expected (two indexes: one PRESENT, one DIFFERENT) -> exit 1 and exactly:
  //   RESULT FAIL: 1 of 2 declared indexes present with matching options (missing 0, different 1, undeclared 0)
  // All present -> exit 0 and RESULT PASS: 2 of 2 ... (missing 0, different 0, undeclared 0).
  // One MISSING -> exit 1.
  const two = [{ collection: C, indexes: [[{ a: 1 }, {}], [{ b: 1 }, { unique: true }]] }];
  const pres = (docs) => new Map([[C, [{ v: 2, key: { _id: 1 }, name: '_id_' }, ...docs]]]);

  const different = summarise(classify(two, pres([doc({ a: 1 }), doc({ b: 1 })])));
  assert.equal(different.exitCode, 1);
  assert.equal(different.line, 'RESULT FAIL: 1 of 2 declared indexes present with matching options (missing 0, different 1, undeclared 0)');

  const pass = summarise(classify(two, pres([doc({ a: 1 }), doc({ b: 1 }, { unique: true })])));
  assert.equal(pass.exitCode, 0);
  assert.equal(pass.line, 'RESULT PASS: 2 of 2 declared indexes present with matching options (missing 0, different 0, undeclared 0)');

  const missing = summarise(classify(two, pres([doc({ a: 1 })])));
  assert.equal(missing.exitCode, 1);
  assert.equal(missing.line, 'RESULT FAIL: 1 of 2 declared indexes present with matching options (missing 1, different 0, undeclared 0)');
});

// ---- privilege self-check -------------------------------------------------------------------

const COLLECTIONS = ['alpha', 'beta'];
const USER = 'civicconnect-temp-provisioner';
const grant = (collection, actions = ['createIndex', 'listIndexes'], db = 'civicconnect') => ({ resource: { db, collection }, actions });
const authInfo = (privileges, users = [USER]) => ({
  authenticatedUsers: users.map((user) => ({ user, db: 'admin' })),
  authenticatedUserPrivileges: privileges,
});
const check = (info) => checkPrivileges(info, { collections: COLLECTIONS });

test('U14 only createIndex and listIndexes on the declared collections of civicconnect are accepted — DEC-003 v0.3', () => {
  // Expected: the exact grants for the right user pass. Each of these is refused, with a problem
  // that names the offender: an extra action (dropIndex), anyResource, another database, a
  // database-wide grant, a cluster grant, listIndexes missing on one collection, a collection that
  // is not declared, createCollection (decision D2), the wrong user.
  const exact = [grant('alpha'), grant('beta')];
  assert.deepEqual(check(authInfo(exact)), { ok: true, problems: [] });

  const refused = (label, info, pattern) => {
    const r = check(info);
    assert.equal(r.ok, false, `${label} must be refused`);
    assert.ok(r.problems.some((p) => pattern.test(p)), `${label}: problems were ${JSON.stringify(r.problems)}`);
  };
  refused('dropIndex', authInfo([grant('alpha', ['createIndex', 'listIndexes', 'dropIndex']), grant('beta')]), /dropIndex/);
  refused('createCollection', authInfo([grant('alpha', ['createIndex', 'listIndexes', 'createCollection']), grant('beta')]), /createCollection/);
  refused('find', authInfo([grant('alpha', ['createIndex', 'listIndexes', 'find']), grant('beta')]), /find/);
  refused('anyResource', authInfo([...exact, { resource: { anyResource: true }, actions: ['createIndex'] }]), /anyResource/);
  refused('cluster', authInfo([...exact, { resource: { cluster: true }, actions: ['listIndexes'] }]), /cluster/);
  refused('other database', authInfo([...exact, grant('alpha', ['listIndexes'], 'elsewhere')]), /other than civicconnect/);
  refused('database-wide', authInfo([grant('', ['createIndex', 'listIndexes'])]), /database-wide/);
  refused('listIndexes missing on beta', authInfo([grant('alpha'), grant('beta', ['createIndex'])]), /listIndexes is not granted on civicconnect \/ beta/);
  refused('createIndex missing on a collection', authInfo([grant('alpha')]), /createIndex is not granted on civicconnect \/ beta/);
  refused('undeclared collection', authInfo([...exact, grant('gamma')]), /not declared/);
  refused('wrong user', authInfo(exact, ['civicconnect-app']), /expected only civicconnect-temp-provisioner/);
  refused('two users', authInfo(exact, [USER, 'someone-else']), /expected only/);
});

// ---- host guard -----------------------------------------------------------------------------

test('U15 the host guard looks at the host only and at the recorded marker only — DEC-003 (environment map)', () => {
  // Expected: marker in the host and database civicconnect -> ok. Refused: marker only in the user
  // name, only in the database, only in a query option, only in the password; a different host;
  // database other than civicconnect; unparseable; no URI; staging and production (no marker
  // recorded); an unknown environment. The reason never contains the URI.
  const ok = (uri, env = 'test') => checkTarget({ uri, env });
  assert.deepEqual(ok(`mongodb+srv://u:p@x.${TEST_CLUSTER_MARKER}.example/civicconnect`), { ok: true });

  const refused = (uri, env = 'test') => {
    const r = ok(uri, env);
    assert.equal(r.ok, false, `${uri} must be refused`);
    assert.ok(!r.reason.includes('p@'), 'the reason must not echo the URI');
    return r.reason;
  };
  refused(`mongodb+srv://${TEST_CLUSTER_MARKER}:p@example.net/civicconnect`);
  refused(`mongodb+srv://u:${TEST_CLUSTER_MARKER}@example.net/civicconnect`);
  refused(`mongodb+srv://u:p@example.net/civicconnect?appName=${TEST_CLUSTER_MARKER}`);
  refused(`mongodb+srv://u:p@example.net/${TEST_CLUSTER_MARKER}`);
  refused('mongodb+srv://u:p@example.net/civicconnect');
  assert.match(refused(`mongodb+srv://u:p@x.${TEST_CLUSTER_MARKER}.example/other`), /database/);
  refused('mongodb+srv://');
  refused('not a uri');
  refused('');
  refused(undefined);
  assert.match(refused(`mongodb+srv://u:p@x.${TEST_CLUSTER_MARKER}.example/civicconnect`, 'staging'), /no host marker is recorded in DEC-003 for the staging environment/);
  assert.match(refused(`mongodb+srv://u:p@x.${TEST_CLUSTER_MARKER}.example/civicconnect`, 'production'), /no host marker is recorded in DEC-003 for the production environment/);
  refused(`mongodb+srv://u:p@x.${TEST_CLUSTER_MARKER}.example/civicconnect`, 'dev');
  assert.equal(checkTarget({ uri: `mongodb+srv://u:p@x.${TEST_CLUSTER_MARKER}.example/civicconnect` }).ok, false, 'no --env');
  // Only the test marker is recorded.
  assert.deepEqual(Object.keys(CLUSTER_MARKERS), ['test']);
});

// ---- redaction ------------------------------------------------------------------------------

test('U16 the redactor removes the URI, host, password, mongodb.net names and duplicate-key values — NFR-3.5', () => {
  // Expected: none of the secrets appears in the output; an E11000 message keeps its code and text
  // but loses the "dup key: { ... }" clause (it would carry an email address).
  const uri = 'mongodb+srv://prov-user:s3cretPw@cluster0.abcde.mongodb.net/civicconnect?retryWrites=true';
  const redact = makeRedactor(uri);
  const dirty = [
    `connect failed for ${uri}`,
    'host cluster0.abcde.mongodb.net refused; also ac-xyz-shard-00-01.abcde.mongodb.net:27017',
    'user prov-user with password s3cretPw',
    'E11000 duplicate key error collection: civicconnect.users index: email_1 dup key: { email: "ada@example.org" }',
  ].map(redact).join('\n');
  for (const secret of ['s3cretPw', 'prov-user', 'abcde', 'mongodb.net', 'mongodb+srv://', 'ada@example.org']) {
    assert.ok(!dirty.includes(secret), `"${secret}" must not survive redaction; got: ${dirty}`);
  }
  assert.match(dirty, /E11000 duplicate key error collection: civicconnect\.users index: email_1 dup key: \[removed\]/);
  const described = describeError({ code: 11000, codeName: 'DuplicateKey', errmsg: 'x dup key: { email: "ada@example.org" }' }, redact);
  assert.equal(described, 'code 11000 DuplicateKey: x dup key: [removed]');
});

// ---- command allow-list ---------------------------------------------------------------------

test('U17 only the permitted commands may be sent, and createIndexes not in --check-only — decision D8', () => {
  // Expected: listIndexes, connectionStatus, buildInfo, hello, createIndexes (normal run) allowed.
  // dropIndexes, dropIndex, collMod, create, createCollection, insert, update, delete, find,
  // aggregate, drop, dropDatabase not allowed. createIndexes not allowed with checkOnly.
  for (const name of ['hello', 'isMaster', 'ping', 'saslStart', 'saslContinue', 'connectionStatus', 'buildInfo', 'listIndexes', 'getMore', 'killCursors', 'endSessions', 'createIndexes']) {
    assert.equal(isCommandAllowed(name), true, `${name} should be allowed`);
  }
  for (const name of ['dropIndexes', 'dropIndex', 'collMod', 'create', 'createCollection', 'insert', 'update', 'delete', 'find', 'aggregate', 'drop', 'dropDatabase', 'syncIndexes']) {
    assert.equal(isCommandAllowed(name), false, `${name} must not be allowed`);
    assert.equal(isCommandAllowed(name, { checkOnly: true }), false);
  }
  assert.equal(isCommandAllowed('createIndexes', { checkOnly: true }), false);
  assert.equal(isCommandAllowed('listIndexes', { checkOnly: true }), true);
});

// ---- the real models ------------------------------------------------------------------------

test('U18 every model with indexes is represented and the declared count is the sum of schema.indexes() — TD-004', async () => {
  // Expected: loading the real models turns Mongoose autoIndex and autoCreate off and opens no
  // connection (readyState 0); one entry per src/models/*.js except _shared.js; count equals the sum of
  // each model's schema.indexes().length; every declared collection name is unique; no real declared
  // index carries an option the comparator cannot compare (it would make every run DIFFERENT); against
  // a database holding nothing, every declared index is MISSING.
  const declared = await loadDeclared();
  assert.equal(mongoose.get('autoIndex'), false);
  assert.equal(mongoose.get('autoCreate'), false);
  assert.equal(mongoose.connection.readyState, 0, 'loading the models must not connect');

  const { readdirSync } = await import('node:fs');
  const files = readdirSync(new URL('../src/models/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== '_shared.js').sort();
  assert.deepEqual(declared.map((d) => d.file), files);
  assert.equal(new Set(declared.map((d) => d.collection)).size, declared.length);

  const sum = declared.reduce((n, d) => n + d.model.schema.indexes().length, 0);
  assert.equal(declared.reduce((n, d) => n + d.indexes.length, 0), sum);
  assert.ok(sum > 0, 'the models declare indexes');

  for (const d of declared) {
    for (const raw of d.indexes) {
      assert.deepEqual(normaliseDeclared(d.collection, raw).extra, [], `${d.collection}: an option the comparator cannot compare`);
    }
  }
  const result = classify(declared.map((d) => ({ collection: d.collection, indexes: d.indexes })), new Map());
  assert.equal(result.entries.length, sum);
  assert.ok(result.entries.every((e) => e.status === 'MISSING'));
  assert.ok(formatComparison(result).length >= sum);
});
