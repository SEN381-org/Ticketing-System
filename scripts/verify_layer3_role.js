/**
 * DB-01 layer 3 negative verification. Traces to: FR-6.7, AC-FR-6.7, DB-01 v0.3 §4, DEC-003 v0.2.
 *
 * Layers 1 and 2 (repository interface, schema middleware) stop Mongoose paths
 * only. Layer 3 is the Atlas custom role `civicconnect-app`: find and insert
 * only on `requestHistory`. This script connects with the application's own
 * credential through the native driver, so nothing in src/ is in the way, and
 * attempts what the role must refuse:
 *
 *   1. find on requestHistory                 → allowed (control)
 *   2. updateOne on requestHistory            → refused by the database
 *   3. deleteOne on requestHistory            → refused by the database
 *   4. insert, update, delete on sessions     → allowed (control, DEC-018)
 *
 * The controls matter. A credential with no rights at all is also refused at
 * step 2, and that would prove nothing about the role. Steps 1 and 4 show the
 * credential is authenticated and working, so the refusal is the privilege.
 *
 * Insert on requestHistory is not attempted: the entry could not be removed
 * afterwards. If step 2 is NOT refused, the role is wrong and the update has
 * been applied to one history document. The script then removes the probe
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
const SESSIONS = 'sessions';
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
 * A self-managed deployment answers with code 13 (Unauthorized). Atlas shared
 * clusters answer through a proxy with code 8000 (AtlasError) and name the
 * action in the message. Anything else is not counted as a refusal: a network
 * error must never be recorded as evidence that the role works.
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

/** What the server says this connection may do. Any user may ask this about itself. */
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
      `Granted on ${HISTORY} : ${actionsOn(HISTORY)}`,
      `Granted on ${SESSIONS}       : ${actionsOn(SESSIONS)}`,
    ];
  } catch (error) {
    return [`Roles         : not available (${error?.codeName ?? error?.message ?? 'connectionStatus failed'})`];
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
  const history = db.collection(HISTORY);
  const sessions = db.collection(SESSIONS);

  say('Negative verification of DB-01 layer 3 (database privilege on requestHistory)');
  say('FR-6.7, AC-FR-6.7. DB-01 v0.3 section 4, DEC-003 v0.2');
  say();
  say(`Run on        : ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  say(`Node          : ${process.version}`);
  say(`Branch        : ${git('rev-parse', '--abbrev-ref', 'HEAD')} (${git('rev-parse', '--short', 'HEAD')})`);
  say(`Driver        : native MongoClient (bundled with mongoose ${mongoose.version}), no models loaded`);
  say(`Database user : ${databaseUserOf(uri)}`);
  say(`Database      : ${db.databaseName}`);
  (await grantedPrivileges(db)).forEach((row) => say(row));
  say();

  say(`1. Control. find on ${HISTORY} with the application credential:`);
  say(`     db.collection('${HISTORY}').findOne({})`);
  say();
  await expectAllowed(`find on ${HISTORY} is allowed`, async () => {
    const found = await history.findOne({}, { projection: { _id: 1 } });
    return found ? 'One document read.' : 'The collection is empty.';
  });
  say();

  say('2. Native-driver update, which layers 1 and 2 cannot see:');
  say(`     await db.collection('${HISTORY}').updateOne({}, { $set: { x: 1 } });`);
  say();
  const updated = await expectRefused(`update on ${HISTORY} is refused`, 'update',
    () => history.updateOne({}, { $set: { x: 1 } }));
  if (updated?.modifiedCount > 0) {
    const reverted = await history.updateOne({ x: 1 }, { $unset: { x: '' } }).catch(() => null);
    detail([reverted?.modifiedCount > 0
      ? 'The probe field was removed again from the document it was written to.'
      : 'THE PROBE FIELD COULD NOT BE REMOVED. One history document now carries { x: 1 }.']);
  }
  say();

  say('3. Native-driver delete. The filter matches no document, so nothing is lost if it is accepted:');
  const absentId = `layer3-probe-${randomBytes(6).toString('hex')}`;
  say(`     await db.collection('${HISTORY}').deleteOne({ _id: '${absentId}' });`);
  say();
  await expectRefused(`delete on ${HISTORY} is refused`, 'remove', () => history.deleteOne({ _id: absentId }));
  say();

  say(`4. Control. The same role must still write ${SESSIONS} (DEC-018):`);
  say('     insertOne, updateOne, deleteOne on one probe document');
  say();
  const probeId = `layer3-probe-${randomBytes(6).toString('hex')}`;
  await expectAllowed(`insert, update and delete on ${SESSIONS} are allowed`, async () => {
    // lastSeenAt is already past the idle limit, so the TTL index removes the probe if the delete below fails.
    await sessions.insertOne({ _id: probeId, lastSeenAt: new Date(Date.now() - IDLE_LIMIT_MS - 60_000) });
    const { modifiedCount } = await sessions.updateOne({ _id: probeId }, { $set: { probe: true } });
    const { deletedCount } = await sessions.deleteOne({ _id: probeId });
    if (modifiedCount !== 1 || deletedCount !== 1) {
      throw new Error(`probe ${probeId}: modified ${modifiedCount}, deleted ${deletedCount}, expected 1 and 1`);
    }
    return 'Probe document inserted, updated and deleted.';
  });
  say();

  const failed = results.filter((r) => !r.ok);
  results.forEach((r) => say(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`));
  say();
  if (failed.length === 0) {
    say('RESULT: VERIFIED');
    say();
    say('The database refused an update and a delete on requestHistory that were');
    say('issued with the application credential through the native driver. The');
    say('same credential read requestHistory and wrote sessions in the same run,');
    say('so the refusal is the missing privilege and not a failed login. DB-01');
    say('layer 3 therefore holds for this credential on this cluster.');
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
