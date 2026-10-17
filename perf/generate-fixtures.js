/**
 * NFR-2.4 and NFR-2.1 load tests, part 1: synthetic fixtures on the staging cluster.
 * Traces to: NFR-2.4, AC-NFR-2.4, NFR-2.1, AC-NFR-2.1, DEC-003 v0.4 (Performance testing and region).
 *
 * AC-NFR-2.4: Given "100 concurrent authenticated users exercising the standard journeys for
 * 10 minutes", When "the run completes", Then "no request failed and no unhandled server error
 * was recorded".
 * AC-NFR-2.1: Given "a sustained load of 100 concurrent authenticated users", When "100 service
 * requests are submitted", Then "at least 95 confirmations are returned within 3 seconds,
 * measured server-side".
 *
 * Runs ON THE VM. The staging cluster's access list admits only the VM's IP (DEC-003 v0.4,
 * Database access), so the fixtures are written from there, with the application's own
 * credential from the staging environment file. The access list is not widened.
 *
 * Creates, for one run:
 *   - one synthetic campus (a new ObjectId, nothing else references it) with the seven Category
 *     documents of perf/seed-demo.js (names quoted from the Master Project Brief there; only
 *     "security concerns" is a security category). Requests and users use a non-security category;
 *   - <users> Coordinators authorised for that category: the read / list / reject journey;
 *   - <requesters> Requesters in the same campus: the list / submit / read-own journey, and the
 *     100 submitters of the NFR-2.1 run. All users share one random password
 *     (one scrypt hash, so the script does not spend minutes hashing);
 *   - per Coordinator: one request to read, and <transitions> requests in Received to reject;
 *     per Requester: one request of their own to read.
 * Requests inserted here carry references in year 2097. Requests the load runs submit through the
 * API take the real counter (the current year), so the two cannot collide. The counter for the
 * current year must already exist (perf/seed-demo.js creates it); this script checks that, read-only.
 * All data is synthetic and tagged with the run id: users' emails start `perf-<run>-`, requests'
 * descriptions end `run <run>`. perf/cleanup-fixtures.js removes a run by that tag.
 *
 * Writes go in batches of <batch> documents with <pause> ms between batches, to stay well under
 * the M0 tier's operation rate. If a write fails, the MongoDB error and its nested write errors
 * are printed (redacted), with how far the run got.
 *
 * Writes the logins and request ids the load run needs to <out> (mode 600). That file holds
 * the synthetic users' password: copy it to the load client, then delete it on both machines.
 * It is never committed.
 *
 * Usage (on the VM; copy perf/generate-fixtures.js and perf/lib/ together, keeping the layout):
 *   sudo node --env-file=/etc/civicconnect/staging.env generate-fixtures.js \
 *     --app-dir /opt/civicconnect --out /tmp/perf-fixtures.json \
 *     [--users 100] [--requesters 100] [--transitions 12] [--batch 25] [--pause 500]
 *
 * Exit code: 0 fixtures written; 2 refused or failed before writing the output file.
 */

import { parseArgs } from 'node:util';
import { randomBytes, randomInt } from 'node:crypto';
import { writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describeMongoError } from './lib/mongoErrors.js';

function refuse(reason) {
  console.log(`NOT RUN: ${reason}`);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    options: {
      'app-dir': { type: 'string', default: '/opt/civicconnect' },
      out: { type: 'string' },
      users: { type: 'string', default: '100' },
      requesters: { type: 'string', default: '100' },
      transitions: { type: 'string', default: '12' },
      batch: { type: 'string', default: '25' },
      pause: { type: 'string', default: '500' },
    },
  }).values;
} catch (e) {
  refuse(`usage: ${e.message}`);
}
if (!args.out) refuse('--out <path> is required');
// Checked before any database write, so an existing file never leaves a run without its logins.
if (existsSync(args.out)) refuse(`${args.out} already exists; remove it or choose another --out`);
const intArg = (name, min, max) => {
  const v = Number(args[name]);
  if (!Number.isInteger(v) || v < min || v > max) refuse(`--${name} must be an integer from ${min} to ${max}`);
  return v;
};
const users = intArg('users', 1, 500);
const requesters = intArg('requesters', 1, 500);
const transitions = intArg('transitions', 1, 100);
const batchSize = intArg('batch', 1, 500);
const pauseMs = intArg('pause', 0, 10_000);

// The app's own modules, from the deployed checkout. Importing them from there means the models,
// the password hasher and the host marker are exactly the release candidate's.
const appDir = path.resolve(args['app-dir']);
const load = (rel) => import(pathToFileURL(path.join(appDir, rel)).href);

const { STAGING_CLUSTER_MARKER } = await load('scripts/lib/clusterMarkers.js');
if (!STAGING_CLUSTER_MARKER) refuse('the deployed checkout records no staging host marker');

// Host guard: the host of MONGODB_URI must carry the staging marker. The URI is never printed.
const uri = process.env.MONGODB_URI;
if (!uri) refuse('MONGODB_URI is not set (run with --env-file=/etc/civicconnect/staging.env)');
let host;
try {
  host = new URL(uri).hostname;
} catch {
  refuse('MONGODB_URI could not be parsed');
}
if (!host.includes(STAGING_CLUSTER_MARKER)) refuse('the host in MONGODB_URI is not the staging cluster; refusing');
// Database guard: the URI must name the civicconnect database. Without a name the driver uses its
// default database, "test", on which the application credential has no grants (found on staging,
// 15/10/2026). The URI is never printed.
if (decodeURIComponent(new URL(uri).pathname.replace(/^\//, '')) !== 'civicconnect') refuse('MONGODB_URI does not name the civicconnect database; refusing');

// Mongoose from the deployed checkout, configured before any model compiles: the application's
// credential may not create collections or indexes, so neither is attempted.
const { default: mongoose } = await import(pathToFileURL(path.join(appDir, 'node_modules', 'mongoose', 'index.js')).href);
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const { connectDatabase, disconnectDatabase, databaseUserOf } = await load('src/infrastructure/database.js');
const { hashPassword } = await load('src/infrastructure/passwordHasher.js');
const { default: User } = await load('src/models/User.js');
const { default: Request } = await load('src/models/Request.js');
const { default: Category } = await load('src/models/Category.js');
const { default: Counter } = await load('src/models/Counter.js');
const { ROLE, STATUS } = await load('src/models/_shared.js');
const { BRIEF_CATEGORY_NAMES, SECURITY_CATEGORY_NAME, codeFor } = await import('./seed-demo.js');

const startedAt = new Date();
console.log('NFR-2.4 / NFR-2.1 fixtures (staging)');
console.log(`Started (UTC)   : ${startedAt.toISOString()}`);
console.log(`Host check      : passed (host contains "${STAGING_CLUSTER_MARKER}"; host not printed)`);
console.log(`Database user   : ${databaseUserOf(uri)}`);
console.log(`Node            : ${process.version}`);
console.log(`Users           : ${users} Coordinators (1 to read + ${transitions} to reject each); ${requesters} Requesters (1 to read each)`);
console.log(`Batches         : ${batchSize} documents, ${pauseMs} ms apart`);

await connectDatabase(uri);

// The submit journeys need the year's reference counter, which is not created from inside a transaction.
const counterYear = new Date().getUTCFullYear();
if (!await Counter.exists({ _id: `request-ref:${counterYear}` })) {
  await disconnectDatabase();
  refuse(`counter request-ref:${counterYear} does not exist; run perf/seed-demo.js first (nothing was written)`);
}

const run = randomBytes(4).toString('hex');
console.log(`Run id          : ${run}`);
const campusId = new mongoose.Types.ObjectId();
const password = randomBytes(18).toString('base64url');
const passwordHash = await hashPassword(password);
const now = new Date();

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Insert in batches; returns the created documents in order. Throws with a progress note. */
async function insertInBatches(Model, docs, label) {
  const created = [];
  for (let i = 0; i < docs.length; i += batchSize) {
    if (i > 0 && pauseMs > 0) await sleep(pauseMs);
    try {
      created.push(...await Model.insertMany(docs.slice(i, i + batchSize), { ordered: true }));
    } catch (e) {
      e.progress = `${label}: ${created.length} of ${docs.length} inserted before the failing batch (documents ${i + 1} to ${Math.min(i + batchSize, docs.length)})`;
      throw e;
    }
  }
  console.log(`Inserted        : ${created.length} ${label}`);
  return created;
}

const categoryDocs = BRIEF_CATEGORY_NAMES.map((name) => ({
  campusId, name, code: codeFor(name), isSecurity: name === SECURITY_CATEGORY_NAME, active: true,
}));

const userDocs = Array.from({ length: users }, (_, i) => ({
  campusId,
  email: `perf-${run}-${String(i + 1).padStart(3, '0')}@example.test`,
  displayName: `Perf ${run} ${i + 1}`,
  roles: [ROLE.COORDINATOR],
  categoryAuthorisations: [],   // set once the categories exist (below)
  passwordHash,
}));
const requesterDocs = Array.from({ length: requesters }, (_, i) => ({
  campusId,
  email: `perf-${run}-r${String(i + 1).padStart(3, '0')}@example.test`,
  displayName: `Perf ${run} requester ${i + 1}`,
  roles: [ROLE.REQUESTER],
  categoryAuthorisations: [],
  passwordHash,
}));

// References follow CC-<year>-<6 digits> and are unique (reference_1). Year 2097 is used only by
// this script, and each run takes a random block of consecutive numbers.
const perUser = 1 + transitions;
const total = users * perUser + requesters;
let next = randomInt(0, 1_000_000 - total);

try {
  const categories = await insertInBatches(Category, categoryDocs, 'categories');
  const categoryId = categories.find((c) => !c.isSecurity)._id;   // requests and users: never the security category
  for (const d of userDocs) d.categoryAuthorisations = [categoryId];
  const created = await insertInBatches(User, userDocs, 'users');
  const createdRequesters = await insertInBatches(User, requesterDocs, 'requesters');
  const synthetic = (user) => {
    const doc = {
      campusId, categoryId,
      reference: `CC-2097-${String(next).padStart(6, '0')}`,
      location: 'NFR-2.4 load test',
      description: `Synthetic request for the NFR-2.4 load test, run ${run}`,
      securityCategory: false,
      status: STATUS.RECEIVED,
      requesterId: user._id, submittedById: user._id,
      submittedAt: now, statusChangedAt: now, version: 0,
    };
    next += 1;
    return doc;
  };
  const requestDocs = [];
  for (const user of created) {
    for (let j = 0; j < perUser; j += 1) requestDocs.push(synthetic(user));
  }
  const requesterOffset = requestDocs.length;
  for (const user of createdRequesters) requestDocs.push(synthetic(user));
  const requests = await insertInBatches(Request, requestDocs, 'requests');

  const fixtures = {
    run,
    createdAt: startedAt.toISOString(),
    campusId: String(campusId),
    categoryId: String(categoryId),
    categories: categories.map((c) => ({ id: String(c._id), name: c.name, isSecurity: c.isSecurity })),
    password,
    users: created.map((u, i) => {
      const own = requests.slice(i * perUser, (i + 1) * perUser).map((r) => String(r._id));
      return { email: u.email, readRequestId: own[0], transitionRequestIds: own.slice(1) };
    }),
    requesters: createdRequesters.map((u, i) => ({ email: u.email, readRequestId: String(requests[requesterOffset + i]._id) })),
  };
  // wx: never overwrite an existing file (another run's logins, or anything else at that path).
  await writeFile(args.out, `${JSON.stringify(fixtures, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await chmod(args.out, 0o600);

  console.log(`Created         : ${created.length} Coordinators, ${createdRequesters.length} Requesters, ${categories.length} categories, ${requests.length} requests (campus id new)`);
  console.log(`Fixture file    : ${args.out} (mode 600; holds the synthetic password; never commit)`);
  console.log(`Ended (UTC)     : ${new Date().toISOString()}`);
} catch (e) {
  console.log(`FAILED at ${new Date().toISOString()}`);
  if (e.progress) console.log(`  ${e.progress}`);
  for (const line of describeMongoError(e)) console.log(`  ${line}`);
  console.log(`  Partial fixtures for run ${run} may remain (synthetic). Remove them with:`);
  console.log(`  sudo node --env-file=/etc/civicconnect/staging.env cleanup-fixtures.js --app-dir ${appDir} --run ${run}`);
  await disconnectDatabase();
  process.exit(2);
}

await disconnectDatabase();
