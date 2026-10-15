/**
 * Remove one run of NFR-2.4 load-test fixtures from the staging cluster.
 * Traces to: NFR-2.4, DEC-003 v0.4 (staging is synthetic-only).
 *
 * Runs ON THE VM, with the application's credential (as generate-fixtures.js). It deletes only
 * what that run created, by the run's tag:
 *   - users whose email starts `perf-<run>-` and ends `@example.test`;
 *   - requests whose description is exactly "Synthetic request for the NFR-2.4 load test, run <run>",
 *     whose reference is in the CC-2097- block, and which have not moved from Received;
 *   - sessions belonging to those users.
 * It never touches requestHistory or auditLog (append-only; the credential cannot delete there).
 * If any of the run's requests has a history entry, that request is left in place and counted.
 *
 * Without --confirm it only counts (a dry run). With --confirm it deletes, then counts again.
 *
 * Usage (on the VM):
 *   sudo node --env-file=/etc/civicconnect/staging.env cleanup-fixtures.js --app-dir /opt/civicconnect --run <8 hex> [--confirm]
 *
 * Exit code: 0 done (or dry run); 2 refused or failed.
 */

import { parseArgs } from 'node:util';
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
      run: { type: 'string' },
      confirm: { type: 'boolean', default: false },
    },
  }).values;
} catch (e) {
  refuse(`usage: ${e.message}`);
}
const run = args.run ?? '';
if (!/^[0-9a-f]{8}$/.test(run)) refuse('--run must be the 8-hex-character run id generate-fixtures.js printed');

const appDir = path.resolve(args['app-dir']);
const load = (rel) => import(pathToFileURL(path.join(appDir, rel)).href);

const { STAGING_CLUSTER_MARKER } = await load('scripts/lib/clusterMarkers.js');
const uri = process.env.MONGODB_URI;
if (!uri) refuse('MONGODB_URI is not set (run with --env-file=/etc/civicconnect/staging.env)');
let host;
try {
  host = new URL(uri).hostname;
} catch {
  refuse('MONGODB_URI could not be parsed');
}
if (!STAGING_CLUSTER_MARKER || !host.includes(STAGING_CLUSTER_MARKER)) refuse('the host in MONGODB_URI is not the staging cluster; refusing');

const { default: mongoose } = await import(pathToFileURL(path.join(appDir, 'node_modules', 'mongoose', 'index.js')).href);
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const { connectDatabase, disconnectDatabase, databaseUserOf } = await load('src/infrastructure/database.js');
const { default: User } = await load('src/models/User.js');
const { default: Request } = await load('src/models/Request.js');
const { default: RequestHistory } = await load('src/models/RequestHistory.js');
const { default: Session } = await load('src/models/Session.js');
const { STATUS } = await load('src/models/_shared.js');

const userFilter = { email: { $regex: `^perf-${run}-\\d{3}@example\\.test$` } };
const requestFilter = {
  description: `Synthetic request for the NFR-2.4 load test, run ${run}`,
  reference: { $regex: '^CC-2097-\\d{6}$' },
};

async function count() {
  const userIds = (await User.find(userFilter, { _id: 1 }).lean()).map((u) => u._id);
  const requestIds = (await Request.find(requestFilter, { _id: 1 }).lean()).map((r) => r._id);
  const withHistory = await RequestHistory.distinct('requestId', { requestId: { $in: requestIds } });
  const sessions = await Session.countDocuments({ userId: { $in: userIds } });
  return { userIds, requestIds, withHistory, sessions };
}

console.log(`NFR-2.4 fixture cleanup (staging), run ${run}${args.confirm ? '' : ' (dry run)'}`);
console.log(`Started (UTC)   : ${new Date().toISOString()}`);
console.log(`Host check      : passed (host contains "${STAGING_CLUSTER_MARKER}"; host not printed)`);
console.log(`Database user   : ${databaseUserOf(uri)}`);

try {
  await connectDatabase(uri);
  const before = await count();
  console.log(`Found           : ${before.userIds.length} users, ${before.requestIds.length} requests (${before.withHistory.length} with history entries), ${before.sessions} sessions`);
  if (args.confirm) {
    const keep = new Set(before.withHistory.map(String));
    const deletable = before.requestIds.filter((id) => !keep.has(String(id)));
    const s = await Session.deleteMany({ userId: { $in: before.userIds } });
    const r = await Request.deleteMany({ _id: { $in: deletable }, status: STATUS.RECEIVED });
    const u = await User.deleteMany({ _id: { $in: before.userIds } });
    console.log(`Deleted         : ${u.deletedCount} users, ${r.deletedCount} requests, ${s.deletedCount} sessions`);
    const after = await count();
    console.log(`Remaining       : ${after.userIds.length} users, ${after.requestIds.length} requests, ${after.sessions} sessions`);
  } else {
    console.log('Nothing deleted. Re-run with --confirm to delete the above.');
  }
  console.log(`Ended (UTC)     : ${new Date().toISOString()}`);
} catch (e) {
  for (const line of describeMongoError(e)) console.log(`  ${line}`);
  await disconnectDatabase();
  process.exit(2);
}
await disconnectDatabase();
