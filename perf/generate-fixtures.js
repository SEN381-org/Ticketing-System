/**
 * NFR-2.4 load test, part 1: synthetic fixtures on the staging cluster.
 * Traces to: NFR-2.4, AC-NFR-2.4, DEC-003 v0.4 (Performance testing and region).
 *
 * Runs ON THE VM. The staging cluster's access list admits only the VM's IP (DEC-003 v0.4,
 * Database access), so the fixtures are written from there, with the application's own
 * credential from the staging environment file. The access list is not widened.
 *
 * Creates, for one run:
 *   - one synthetic campus and one synthetic category (new ObjectIds, nothing else references them);
 *   - <users> Coordinators authorised for that category, all with one random password
 *     (one scrypt hash, so the script does not spend minutes hashing);
 *   - per user: one request to read, and <transitions> requests in Received to reject.
 * All data is synthetic. It stays on the cluster: requestHistory is append-only and the
 * application credential cannot delete (DB-01 layer 3). Staging is synthetic-only (DEC-003).
 *
 * Writes the logins and request ids the load run needs to <out> (mode 600). That file holds
 * the synthetic users' password: copy it to the load client, then delete it on both machines.
 * It is never committed.
 *
 * Usage (on the VM, from any directory):
 *   sudo node --env-file=/etc/civicconnect/staging.env generate-fixtures.js \
 *     --app-dir /opt/civicconnect --out /tmp/perf-fixtures.json [--users 100] [--transitions 12]
 *
 * Exit code: 0 fixtures written; 2 refused or failed before writing the output file.
 */

import { parseArgs } from 'node:util';
import { randomBytes, randomInt } from 'node:crypto';
import { writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
      transitions: { type: 'string', default: '12' },
    },
  }).values;
} catch (e) {
  refuse(`usage: ${e.message}`);
}
if (!args.out) refuse('--out <path> is required');
const users = Number(args.users);
const transitions = Number(args.transitions);
if (!Number.isInteger(users) || users < 1 || users > 500) refuse('--users must be an integer from 1 to 500');
if (!Number.isInteger(transitions) || transitions < 1 || transitions > 100) refuse('--transitions must be an integer from 1 to 100');

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

const { connectDatabase, disconnectDatabase, databaseUserOf } = await load('src/infrastructure/database.js');
const { hashPassword } = await load('src/infrastructure/passwordHasher.js');
const { default: User } = await load('src/models/User.js');
const { default: Request } = await load('src/models/Request.js');
const { ROLE, STATUS } = await load('src/models/_shared.js');
const { default: mongoose } = await import(pathToFileURL(path.join(appDir, 'node_modules', 'mongoose', 'index.js')).href);

const startedAt = new Date();
console.log('NFR-2.4 fixtures (staging)');
console.log(`Started (UTC)   : ${startedAt.toISOString()}`);
console.log(`Host check      : passed (host contains "${STAGING_CLUSTER_MARKER}"; host not printed)`);
console.log(`Database user   : ${databaseUserOf(uri)}`);
console.log(`Node            : ${process.version}`);
console.log(`Users           : ${users}; requests per user: 1 to read + ${transitions} to reject`);

await connectDatabase(uri);

const run = randomBytes(4).toString('hex');
const campusId = new mongoose.Types.ObjectId();
const categoryId = new mongoose.Types.ObjectId();
const password = randomBytes(18).toString('base64url');
const passwordHash = await hashPassword(password);
const now = new Date();

const userDocs = Array.from({ length: users }, (_, i) => ({
  campusId,
  email: `perf-${run}-${String(i + 1).padStart(3, '0')}@example.test`,
  displayName: `Perf ${run} ${i + 1}`,
  roles: [ROLE.COORDINATOR],
  categoryAuthorisations: [categoryId],
  passwordHash,
}));

// References follow CC-<year>-<6 digits> and are unique (reference_1). Year 2097 is used only by
// this script, and each run takes a random block of consecutive numbers.
const perUser = 1 + transitions;
const total = users * perUser;
let next = randomInt(0, 1_000_000 - total);

try {
  const created = await User.insertMany(userDocs, { ordered: true });
  const requestDocs = [];
  for (const user of created) {
    for (let j = 0; j < perUser; j += 1) {
      requestDocs.push({
        campusId, categoryId,
        reference: `CC-2097-${String(next).padStart(6, '0')}`,
        location: 'NFR-2.4 load test',
        description: `Synthetic request for the NFR-2.4 load test, run ${run}`,
        securityCategory: false,
        status: STATUS.RECEIVED,
        requesterId: user._id, submittedById: user._id,
        submittedAt: now, statusChangedAt: now, version: 0,
      });
      next += 1;
    }
  }
  const requests = await Request.insertMany(requestDocs, { ordered: true });

  const fixtures = {
    run,
    createdAt: startedAt.toISOString(),
    password,
    users: created.map((u, i) => {
      const own = requests.slice(i * perUser, (i + 1) * perUser).map((r) => String(r._id));
      return { email: u.email, readRequestId: own[0], transitionRequestIds: own.slice(1) };
    }),
  };
  await writeFile(args.out, `${JSON.stringify(fixtures, null, 2)}\n`, { mode: 0o600 });
  await chmod(args.out, 0o600);

  console.log(`Run id          : ${run}`);
  console.log(`Created         : ${created.length} users, ${requests.length} requests (campus and category ids new)`);
  console.log(`Fixture file    : ${args.out} (mode 600; holds the synthetic password; never commit)`);
  console.log(`Ended (UTC)     : ${new Date().toISOString()}`);
} catch (e) {
  // Error messages may carry a duplicate-key value (an email); print the code and type only.
  console.log(`FAILED: code ${e.code ?? '-'} ${e.name}; partial fixtures for run ${run} may remain (synthetic)`);
  await disconnectDatabase();
  process.exit(2);
}

await disconnectDatabase();
