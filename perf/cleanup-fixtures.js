/**
 * Remove one run of NFR-2.4 / NFR-2.1 load-test fixtures from the staging cluster.
 * Traces to: NFR-2.4, NFR-2.1, DEC-003 v0.4 (staging is synthetic-only).
 *
 * Runs ON THE VM, with the application's credential (as generate-fixtures.js). It deletes only
 * what that run created, by the run's tag:
 *   - users (Coordinators and Requesters) whose email starts `perf-<run>-` and ends `@example.test`;
 *   - requests whose description is exactly "Synthetic request for the NFR-2.4 load test, run <run>",
 *     whose reference is in the CC-2097- block, and which have not moved from Received;
 *   - sessions belonging to those users;
 *   - the run's synthetic categories: those of the run's campus, only when no request of that campus
 *     remains (requests the load runs submitted through the API have history entries and stay).
 * It never touches requestHistory or auditLog (append-only; the credential cannot delete there).
 * If any of the run's requests has a history entry, that request is left in place and counted.
 *
 * Requests submitted through the API by the load runs (reference in the current year) are not in the
 * request filter below; they are counted as "submitted through the API" and left in place.
 *
 * Note: the run's users are deleted even when some of their requests have history. Those history
 * entries, and the requests kept above, then name an actor (and a requester) that no longer
 * exists. Use it only on a run whose fixtures have not been transitioned, or accept that result
 * (staging data is synthetic). The load run's own fixtures (run 77b08804) were not cleaned up.
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
// Database guard: the URI must name the civicconnect database. Without a name the driver uses its
// default database, "test", on which the application credential has no grants (found on staging,
// 15/10/2026). The URI is never printed.
if (decodeURIComponent(new URL(uri).pathname.replace(/^\//, '')) !== 'civicconnect') refuse('MONGODB_URI does not name the civicconnect database; refusing');

const { default: mongoose } = await import(pathToFileURL(path.join(appDir, 'node_modules', 'mongoose', 'index.js')).href);
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const { connectDatabase, disconnectDatabase, databaseUserOf } = await load('src/infrastructure/database.js');
const { default: User } = await load('src/models/User.js');
const { default: Request } = await load('src/models/Request.js');
const { default: RequestHistory } = await load('src/models/RequestHistory.js');
const { default: Session } = await load('src/models/Session.js');
const { default: Category } = await load('src/models/Category.js');
const { STATUS } = await load('src/models/_shared.js');

const userFilter = { email: { $regex: `^perf-${run}-r?\\d{3}@example\\.test$` } };
const requestFilter = {
  description: `Synthetic request for the NFR-2.4 load test, run ${run}`,
  reference: { $regex: '^CC-2097-\\d{6}$' },
};

async function count(knownCampusIds) {
  const userDocs = await User.find(userFilter, { _id: 1, campusId: 1 }).lean();
  const userIds = userDocs.map((u) => u._id);
  const campusIds = knownCampusIds ?? [...new Set(userDocs.map((u) => String(u.campusId)))];
  const requestIds = (await Request.find(requestFilter, { _id: 1 }).lean()).map((r) => r._id);
  const withHistory = await RequestHistory.distinct('requestId', { requestId: { $in: requestIds } });
  const sessions = await Session.countDocuments({ userId: { $in: userIds } });
  const viaApi = await Request.countDocuments({ requesterId: { $in: userIds }, reference: { $not: /^CC-2097-/ } });
  const campusRequests = await Request.countDocuments({ campusId: { $in: campusIds } });
  const categories = await Category.countDocuments({ campusId: { $in: campusIds } });
  return { userIds, campusIds, requestIds, withHistory, sessions, viaApi, campusRequests, categories };
}

console.log(`NFR-2.4 fixture cleanup (staging), run ${run}${args.confirm ? '' : ' (dry run)'}`);
console.log(`Started (UTC)   : ${new Date().toISOString()}`);
console.log(`Host check      : passed (host contains "${STAGING_CLUSTER_MARKER}"; host not printed)`);
console.log(`Database user   : ${databaseUserOf(uri)}`);

try {
  await connectDatabase(uri);
  const before = await count();
  console.log(`Found           : ${before.userIds.length} users, ${before.requestIds.length} requests (${before.withHistory.length} with history entries), ${before.sessions} sessions; ${before.categories} categories; ${before.viaApi} requests submitted through the API (left in place)`);
  if (args.confirm) {
    const keep = new Set(before.withHistory.map(String));
    const deletable = before.requestIds.filter((id) => !keep.has(String(id)));
    const s = await Session.deleteMany({ userId: { $in: before.userIds } });
    const r = await Request.deleteMany({ _id: { $in: deletable }, status: STATUS.RECEIVED });
    const u = await User.deleteMany({ _id: { $in: before.userIds } });
    const left = await Request.countDocuments({ campusId: { $in: before.campusIds } });
    const c = left === 0 ? await Category.deleteMany({ campusId: { $in: before.campusIds } }) : { deletedCount: 0 };
    console.log(`Deleted         : ${u.deletedCount} users, ${r.deletedCount} requests, ${s.deletedCount} sessions, ${c.deletedCount} categories${left ? ` (categories kept: ${left} requests of the campus remain)` : ''}`);
    const after = await count(before.campusIds);
    console.log(`Remaining       : ${after.userIds.length} users, ${after.requestIds.length} requests, ${after.sessions} sessions; ${after.categories} categories; ${after.campusRequests} requests in the run's campus`);
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
