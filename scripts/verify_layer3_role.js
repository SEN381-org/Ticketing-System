/**
 * DB-01 layer 3 negative verification. Traces to: FR-6.7, AC-FR-6.7, NFR-1.4, DB-01 v0.3 §4, DEC-003 v0.2.
 *
 * Layers 1 and 2 (repository interface, schema middleware) stop Mongoose paths
 * only. Layer 3 is the Atlas custom role `civicconnect-app`: find and insert
 * only on `requestHistory` and on `auditLog`. This script connects with the
 * application's own credential through the native driver, so nothing in src/
 * is in the way, and attempts what the role must refuse.
 *
 * For each of requestHistory and auditLog:
 *   find                                      → allowed (control)
 *   updateOne                                 → refused by the database
 *   deleteOne                                 → refused by the database
 * Then:
 *   insert, update, delete on sessions        → allowed (control, DEC-018)
 *
 * The controls matter. A credential with no rights at all is also refused, and
 * that would prove nothing about the role. The controls show the credential is
 * authenticated and working, so the refusal is the privilege.
 *
 * Insert is not attempted on either restricted collection: the entry could not
 * be removed afterwards. If an update is NOT refused, the role is wrong and the
 * update has been applied to one document. The script then removes the probe
 * field again and reports FAIL. Run it against the test cluster only.
 *
 * Usage:
 *   node --env-file=.env scripts/verify_layer3_role.js
 *   node --env-file=.env scripts/verify_layer3_role.js --out <path>
 *
 * Writes docs/evidence/DB-01_layer3_verification.txt. The record names the
 * database user, never the connection string (NFR-3.5).
 * Exit code: 0 verified, 1 not verified, 2 the checks could not be run.
 */

import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';

const { MongoClient } = mongoose.mongo;

const HISTORY = 'requestHistory';
const AUDIT = 'auditLog';
const SESSIONS = 'sessions';
/** DB-01 §4: find and insert only. */
const RESTRICTED = Object.freeze([HISTORY, AUDIT]);
const SERVER_SELECTION_TIMEOUT_MS = 5000;
const IDLE_LIMIT_MS = 30 * 60 * 1000;
const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_OUT = path.join(REPOSITORY_ROOT, 'docs', 'evidence', 'DB-01_layer3_verification.txt');

const { values } = parseArgs({ options: { out: { type: 'string' } } });
const outPath = values.out ? path.resolve(values.out) : DEFAULT_OUT;

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Run with --env-file for the test environment.');
  process.exit(2);
}
if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
  console.error('MONGODB_URI is not a mongodb:// or mongodb+srv:// connection string');
  process.exit(2);
}

/** The name only, never the password. */
function databaseUserOf(connectionString) {
  try {
    return decodeURIComponent(new URL(connectionString).username) || '(none)';
  } catch {
    return '(unparseable)';
  }
}

function git(...args) {
  try {
    return execFileSync('git', args, { cwd: REPOSITORY_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '(unknown)';
  }
}

/**
 * DB-01 §4 asks for an `Unauthorized` refusal. A self-managed deployment gives
 * exactly that, code 13. Atlas shared clusters answer through a proxy with code
 * 8000 (AtlasError) and name the action in the message, which is the same
 * refusal under another code. Anything else is not counted: a network error
 * must never be recorded as evidence that the role works.
 */
function isAuthorisationRefusal(error, action) {
  if (error?.code === 13 || error?.codeName === 'Unauthorized') return true;
  return error?.code === 8000 && new RegExp(`not allowed to do action \\[${action}\\]`).test(error.message ?? '');
}

const describeError = (error) => [
  `code    : ${error?.code ?? '(none)'} (${error?.codeName ?? error?.name ?? 'unknown'})`,
  `message : ${String(error?.message ?? error).replaceAll(uri, '[connection string removed]')}`,
];

const lines = [];
const say = (text = '') => { lines.push(text); console.log(text); };
const detail = (rows) => rows.forEach((row) => say(`     ${row}`));
const results = [];
const record = (name, ok) => { results.push({ name, ok }); return ok; };

/** A write that must be refused. Returns the outcome so the caller can clean up after an unexpected success. */
async function expectRefused(name, action, attempt) {
  try {
    const outcome = await attempt();
    record(name, false);
    detail(['NOT REFUSED. The database accepted the operation.', `result  : ${JSON.stringify(outcome)}`]);
    return outcome;
  } catch (error) {
    const refused = isAuthorisationRefusal(error, action);
    record(name, refused);
    detail([refused ? 'REFUSED by the database.' : 'FAILED, but not with an authorisation error.', ...describeError(error)]);
    return null;
  }
}

/** An operation that must succeed. */
async function expectAllowed(name, attempt) {
  try {
    detail([`allowed. ${await attempt()}`]);
    return record(name, true);
  } catch (error) {
    detail(['NOT ALLOWED.', ...describeError(error)]);
    return record(name, false);
  }
}

/**
 * What the server says this connection may do. Any user may ask this about itself.
 *
 * It lists only the grants whose resource names the collection. A database-wide
 * grant has no collection in its resource and would not appear here, so this
 * listing is context and cannot show that the grants are per collection only.
 * The refused writes below are what show that.
 */
async function grantedPrivileges(db) {
  try {
    const { authInfo } = await db.command({ connectionStatus: 1, showPrivileges: true });
    const roles = (authInfo.authenticatedUserRoles ?? []).map((r) => `${r.role}@${r.db}`);
    const actionsOn = (collection) => {
      const actions = (authInfo.authenticatedUserPrivileges ?? [])
        .filter((p) => p.resource?.collection === collection && p.resource?.db === db.databaseName)
        .flatMap((p) => p.actions);
      return actions.length > 0 ? [...new Set(actions)].sort().join(', ') : '(no collection-level grant reported)';
    };
    return [
      `Roles         : ${roles.join(', ') || '(none reported)'}`,
      ...[...RESTRICTED, SESSIONS].map((c) => `${`Granted on ${c}`.padEnd(25)} : ${actionsOn(c)}`),
    ];
  } catch (error) {
    return [`Roles         : not available (${error?.codeName ?? error?.message ?? 'connectionStatus failed'})`];
  }
}

/** Whether the TTL index is really there. Reported, not judged: it is not part of DB-01 layer 3. */
async function describeIndexes(collection) {
  try {
    const indexes = await collection.indexes();
    if (indexes.length === 0) return 'none';
    return indexes
      .map((i) => (i.expireAfterSeconds === undefined ? i.name : `${i.name} (expireAfterSeconds ${i.expireAfterSeconds})`))
      .join(', ');
  } catch (error) {
    return `could not be listed: ${error?.code ?? '(none)'} (${error?.codeName ?? error?.name ?? 'unknown'})`;
  }
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
try {
  await client.connect();
  await client.db().command({ ping: 1 });
} catch (error) {
  // The driver's message can include the host. It does not include the password.
  console.error(`Database connection failed: ${String(error.message).replaceAll(uri, '[connection string removed]')}`);
  await client.close().catch(() => {});
  process.exit(2);
}

try {
  const db = client.db();
  const sessions = db.collection(SESSIONS);

  say(`Negative verification of DB-01 layer 3 (database privilege on ${RESTRICTED.join(' and ')})`);
  say('FR-6.7, AC-FR-6.7, NFR-1.4. DB-01 v0.3 section 4, DEC-003 v0.2');
  say();
  say(`Run on        : ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  say(`Node          : ${process.version}`);
  say(`Branch        : ${git('rev-parse', '--abbrev-ref', 'HEAD')} (${git('rev-parse', '--short', 'HEAD')})`);
  say(`Driver        : native MongoClient (bundled with mongoose ${mongoose.version}), no models loaded`);
  say(`Database user : ${databaseUserOf(uri)}`);
  say(`Database      : ${db.databaseName}`);
  (await grantedPrivileges(db)).forEach((row) => say(row));
  say();

  let step = 0;
  for (const name of RESTRICTED) {
    const collection = db.collection(name);

    say(`${++step}. Control. find on ${name} with the application credential:`);
    say(`     db.collection('${name}').findOne({})`);
    say();
    await expectAllowed(`find on ${name} is allowed`, async () => {
      const found = await collection.findOne({}, { projection: { _id: 1 } });
      return found ? 'One document read.' : 'The collection is empty.';
    });
    say();

    say(`${++step}. Native-driver update on ${name}, which layers 1 and 2 cannot see:`);
    say(`     await db.collection('${name}').updateOne({}, { $set: { x: 1 } });`);
    say();
    const updated = await expectRefused(`update on ${name} is refused`, 'update',
      () => collection.updateOne({}, { $set: { x: 1 } }));
    if (updated?.modifiedCount > 0) {
      const reverted = await collection.updateOne({ x: 1 }, { $unset: { x: '' } }).catch(() => null);
      detail([reverted?.modifiedCount > 0
        ? 'The probe field was removed again from the document it was written to.'
        : `THE PROBE FIELD COULD NOT BE REMOVED. One ${name} document now carries { x: 1 }.`]);
    }
    say();

    say(`${++step}. Native-driver delete on ${name}. The filter matches no document, so nothing is lost if it is accepted:`);
    const absentId = `layer3-probe-${randomBytes(6).toString('hex')}`;
    say(`     await db.collection('${name}').deleteOne({ _id: '${absentId}' });`);
    say();
    await expectRefused(`delete on ${name} is refused`, 'remove', () => collection.deleteOne({ _id: absentId }));
    say();
  }

  say(`${++step}. Control. The same role must still write ${SESSIONS} (DEC-018):`);
  say('     insertOne, updateOne, deleteOne on one probe document');
  say();
  const probeId = `layer3-probe-${randomBytes(6).toString('hex')}`;
  let probeInserted = false;
  const sessionsWritable = await expectAllowed(`insert, update and delete on ${SESSIONS} are allowed`, async () => {
    // Assumption: Mongoose's createIndexes fails silently under this restricted role, so the TTL
    // index likely does not exist on the test cluster. Manual cleanup is required if delete fails.
    // The indexes actually present are listed below, so the record does not rest on the assumption.
    await sessions.insertOne({ _id: probeId, lastSeenAt: new Date(Date.now() - IDLE_LIMIT_MS - 60_000) });
    probeInserted = true;
    const { modifiedCount } = await sessions.updateOne({ _id: probeId }, { $set: { probe: true } });
    const { deletedCount } = await sessions.deleteOne({ _id: probeId });
    if (modifiedCount !== 1 || deletedCount !== 1) {
      throw new Error(`modified ${modifiedCount}, deleted ${deletedCount}, expected 1 and 1`);
    }
    probeInserted = false;
    return 'Probe document inserted, updated and deleted.';
  });
  if (!sessionsWritable && probeInserted) {
    detail([`MANUAL CLEANUP REQUIRED: remove the ${SESSIONS} document with _id '${probeId}'.`]);
  }
  detail([`Indexes on ${SESSIONS}: ${await describeIndexes(sessions)}`]);
  say();

  const failed = results.filter((r) => !r.ok);
  results.forEach((r) => say(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`));
  say();
  if (failed.length === 0) {
    say('RESULT: VERIFIED');
    say();
    say(`The database refused an update and a delete on ${RESTRICTED.join(' and on ')}`);
    say('that were issued with the application credential through the native');
    say('driver. The same credential read both collections and wrote sessions in');
    say('the same run, so the refusal is the missing privilege and not a failed');
    say('login. DB-01 layer 3 therefore holds for this credential on this cluster.');
    say();
    say('What this does not show: that any other credential is restricted (the');
    say('retention-operator user and Atlas project administrators are not), or');
    say('that the same role exists in another environment. Each cluster has its');
    say('own role and needs its own run.');
  } else {
    say('RESULT: NOT VERIFIED');
    say();
    say(`${failed.length} of ${results.length} checks did not give the expected result. DB-01 layer 3 is not`);
    say('demonstrated by this run and FR-6.7 stays Partially implemented.');
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`\nEvidence written to ${path.relative(REPOSITORY_ROOT, outPath)}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} finally {
  await client.close();
}
