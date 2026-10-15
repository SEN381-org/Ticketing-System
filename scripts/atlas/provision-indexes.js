/**
 * Index provisioning and verification. Traces to: TD-004, DEC-003 v0.3 (deployment step 5),
 * DEF-014, DEF-015, DEF-017.
 *
 * Creates the indexes the models declare, then lists what the server holds and compares the two.
 * Every decision is made by the pure functions in indexComparison.js; this file does the I/O.
 *
 * Usage:
 *   node --env-file=.env.provision.test scripts/atlas/provision-indexes.js --env test [--check-only] [--out <path>]
 *   node scripts/atlas/provision-indexes.js --list-declared          (no connection, no environment)
 *
 * The connection string comes from MONGODB_URI in the environment file; it is never printed.
 * The temporary credential is civicconnect-temp-provisioner (DEC-003 v0.3): createIndex and
 * listIndexes on the declared collections, nothing else. For a +srv string on a machine whose
 * resolver refuses SRV lookups, add the same --import that `npm run test:integration` uses.
 *
 * What it does:  listIndexes, createIndexes (unless --check-only), connectionStatus, buildInfo.
 * What it never does: read or write a document; syncIndexes, cleanIndexes, dropIndex, dropIndexes,
 *   collMod, createCollection; change an index's options or name. A command outside the allow-list
 *   aborts the run (exit 2) before it is sent.
 *
 * Exit code: 0 every declared index present with matching options and nothing undeclared;
 *            1 the comparison ran and failed; 2 the run never reached the comparison.
 *
 * Layer: an operational entry point at the data-access layer (PED v2.0 section 6A.5 places
 * versioned migration scripts there). It imports the models directly, like
 * scripts/admin/create-user.js. See scripts/README.md.
 */

import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';

import { loadDeclared } from './declaredIndexes.js';
import {
  DATABASE, EXPECTED_USER, checkPrivileges, checkTarget, classify, describeError, formatComparison,
  formatKey, isCommandAllowed, makeRedactor, normaliseDeclared, summarise,
} from './indexComparison.js';

const { MongoClient } = mongoose.mongo;
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SERVER_SELECTION_TIMEOUT_MS = 15000;
const NAMESPACE_NOT_FOUND = 26;

const lines = [];
function say(text = '') {
  console.log(text);
  lines.push(text);
}

let args;
try {
  args = parseArgs({
    options: {
      env: { type: 'string' },
      'check-only': { type: 'boolean', default: false },
      out: { type: 'string' },
      'list-declared': { type: 'boolean', default: false },
    },
  }).values;
} catch (e) {
  console.error(`Usage error: ${e.message}`);
  process.exit(2);
}

/** Exit 2 with a reason. Used before the comparison is reached. */
function refuse(reason) {
  say(`NOT RUN: ${reason}`);
  process.exit(2);
}

function describeDeclared(spec) {
  const parts = [];
  if (spec.unique) parts.push('unique');
  if (spec.partialFilterExpression) parts.push(`partial ${JSON.stringify(spec.partialFilterExpression)}`);
  if (spec.expireAfterSeconds !== undefined) parts.push(`TTL ${spec.expireAfterSeconds} s`);
  if (spec.isText) parts.push(`weights ${JSON.stringify(spec.weights)}`);
  return parts.join(', ');
}

function git(...gitArgs) {
  try {
    return execFileSync('git', gitArgs, { cwd: REPOSITORY_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '(unavailable)';
  }
}

const declared = await loadDeclared();
const total = declared.reduce((n, d) => n + d.indexes.length, 0);

// ---- --list-declared: no environment, no connection -------------------------------------------
if (args['list-declared']) {
  say(`Declared indexes (from src/models, database ${DATABASE}); the _id_ index is default and not listed`);
  for (const d of [...declared].sort((a, b) => (a.collection < b.collection ? -1 : 1))) {
    say(`  ${d.collection}`);
    for (const raw of d.indexes) {
      const spec = normaliseDeclared(d.collection, raw);
      say(`    ${spec.name}  ${formatKey(spec.key)}${describeDeclared(spec) ? `  ${describeDeclared(spec)}` : ''}`);
    }
  }
  say(`Declared: ${total} indexes over ${declared.length} collections`);
  process.exit(0);
}

// ---- Guards: nothing below runs until the target is acceptable --------------------------------
const checkOnly = args['check-only'];
const uri = process.env.MONGODB_URI;
const target = checkTarget({ uri, env: args.env });
if (!target.ok) refuse(target.reason);
const redact = makeRedactor(uri);

const startedAt = new Date().toISOString();
const commandLog = [];
const client = new MongoClient(uri, { monitorCommands: true, serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
// Registered before connect so the handshake is covered. The event fires before the command is
// sent, so exiting here stops it. The exact handshake commands are to be confirmed on the first
// real run: if the driver uses one that is not on the list, the run stops with exit 2 and names it.
client.on('commandStarted', (event) => {
  const ns = typeof event.command?.[event.commandName] === 'string' ? event.command[event.commandName] : '';
  commandLog.push(ns ? `${event.commandName} ${ns}` : event.commandName);
  if (!isCommandAllowed(event.commandName, { checkOnly })) {
    console.log(`NOT RUN: command "${event.commandName}" is not on the allow-list${checkOnly ? ' (--check-only)' : ''}; aborting before it is sent`);
    process.exit(2);
  }
});

try {
  await client.connect();
} catch (e) {
  refuse(`could not connect: ${describeError(e, redact)}`);
}

// Hand the connected client to Mongoose so the models use it. autoIndex and autoCreate are
// already false (declaredIndexes.js); the connection config is set as well.
mongoose.connection.setClient(client);
mongoose.connection.config.autoIndex = false;
mongoose.connection.config.autoCreate = false;

const db = client.db(DATABASE);
const collections = declared.map((d) => d.collection);

// ---- Privilege self-check ---------------------------------------------------------------------
let authInfo;
try {
  ({ authInfo } = await client.db('admin').command({ connectionStatus: 1, showPrivileges: true }));
} catch (e) {
  refuse(`connectionStatus failed: ${describeError(e, redact)}`);
}
const privileges = checkPrivileges(authInfo, { collections });

let serverVersion = '(unavailable)';
try {
  serverVersion = (await client.db('admin').command({ buildInfo: 1 })).version ?? serverVersion;
} catch { /* version is informational */ }

let driverVersion = '(unavailable)';
try {
  driverVersion = createRequire(import.meta.url)('mongodb/package.json').version;
} catch { /* informational */ }

say(`Index provisioning ${checkOnly ? '(--check-only: lists and compares, creates nothing)' : '(creates, then compares)'}`);
say(`Started (UTC)   : ${startedAt}`);
say(`Environment     : ${args.env} (host not printed)`);
say(`Database        : ${DATABASE}`);
say(`Server user     : ${(authInfo?.authenticatedUsers ?? []).map((u) => u.user).join(', ') || '(none)'} (expected ${EXPECTED_USER})`);
say(`Commit          : ${git('rev-parse', '--short', 'HEAD')}; working tree ${git('status', '--porcelain') === '' ? 'clean' : 'NOT clean'}`);
say(`Node ${process.version}; mongoose ${mongoose.version}; driver mongodb ${driverVersion}; server ${serverVersion}`);
say(`Declared        : ${total} indexes over ${declared.length} collections (computed from src/models)`);
say();
say('Privileges reported by the server:');
for (const p of authInfo?.authenticatedUserPrivileges ?? []) {
  const r = p.resource ?? {};
  const where = r.anyResource ? 'anyResource' : r.cluster ? 'cluster' : `${r.db || '(any database)'} / ${r.collection || '(any collection)'}`;
  say(`  ${where} : ${(p.actions ?? []).join(', ')}`);
}
if (!privileges.ok) {
  say();
  for (const problem of privileges.problems) say(`  PRIVILEGE PROBLEM: ${problem}`);
  await client.close();
  refuse('the credential does not hold exactly the permitted privileges');
}
say('Privilege check: passed');

// ---- Listing ----------------------------------------------------------------------------------
/** Map collection -> listIndexes documents, or null when the collection does not exist. */
async function listAll() {
  const result = new Map();
  for (const name of collections) {
    try {
      result.set(name, await db.collection(name).listIndexes().toArray());
    } catch (e) {
      if (e.code === NAMESPACE_NOT_FOUND) {
        result.set(name, null);
      } else {
        await client.close();
        refuse(`listIndexes on ${name} failed: ${describeError(e, redact)}`);
      }
    }
  }
  return result;
}

function printListing(title, listing) {
  say();
  say(title);
  for (const name of [...collections].sort()) {
    const ixs = listing.get(name);
    if (ixs === null) {
      say(`  ${name}: collection does not exist`);
      continue;
    }
    say(`  ${name}`);
    for (const ix of [...ixs].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const bits = [];
      if (ix.unique) bits.push('unique');
      if (ix.partialFilterExpression) bits.push(`partial ${JSON.stringify(ix.partialFilterExpression)}`);
      if (ix.expireAfterSeconds !== undefined) bits.push(`TTL ${ix.expireAfterSeconds} s`);
      if (ix.weights) bits.push(`weights ${JSON.stringify(ix.weights)}`);
      say(`    ${ix.name}  ${formatKey(Object.entries(ix.key))}${bits.length ? `  ${bits.join(', ')}` : ''}${ix.name === '_id_' ? '  (default)' : ''}`);
    }
  }
}

const before = await listAll();
printListing('Before (as listed by the server):', before);

// ---- Create -----------------------------------------------------------------------------------
const errors = new Map();
if (!checkOnly) {
  say();
  say('createIndexes (per model; a failure on one index does not stop the others):');
  for (const d of declared) {
    d.model.on('error', () => {});   // Mongoose emits 'error' on the model; the rejection below carries the first one
    d.model.on('index-single-done', (err, fields, options) => {
      if (!err) return;
      const key = `${d.collection}/${normaliseDeclared(d.collection, [fields, options]).name}`;
      errors.set(key, { code: err.code, codeName: err.codeName, errmsg: err.errmsg, message: err.message });
    });
    try {
      await d.model.createIndexes();
      say(`  ${d.collection}: ok`);
    } catch (e) {
      say(`  ${d.collection}: ${describeError(e, redact)}`);
    }
  }
}

const after = checkOnly ? before : await listAll();
if (!checkOnly) printListing('After (as listed by the server):', after);

// ---- Compare ----------------------------------------------------------------------------------
const created = [];
for (const name of collections) {
  const had = new Set((before.get(name) ?? []).map((ix) => ix.name));
  for (const ix of after.get(name) ?? []) if (!had.has(ix.name)) created.push(`${name}.${ix.name}`);
}
say();
say(`Created this run: ${created.length}${created.length ? ` (${created.join(', ')})` : ''}`);

const result = classify(declared.map((d) => ({ collection: d.collection, indexes: d.indexes })), after, errors);
say();
say('Comparison (declared indexes against what the server lists, per collection):');
for (const l of formatComparison(result, redact)) say(l);

const counts = new Map();
for (const c of commandLog) counts.set(c, (counts.get(c) ?? 0) + 1);
say();
say('Commands issued (name and collection, with counts; endSessions on close is not included):');
for (const [c, n] of [...counts].sort()) say(`  ${c} x${n}`);
say();
say(`Ended (UTC): ${new Date().toISOString()}`);

const summary = summarise(result);
say(summary.line);

if (args.out) {
  const outPath = path.resolve(args.out);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${lines.join('\n')}\n`);
}
await client.close();
process.exit(summary.exitCode);
