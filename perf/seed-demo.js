/**
 * Staging seed for the M4 demonstration and journeys: one synthetic campus, the seven
 * categories, and one synthetic user for each FR-1.2 role.
 * Traces to: FR-1.2 (roles), FR-2.3 (controlled category list), FR-4.6 / FR-5.2 (category
 * authorisation), FR-1.5 (security category), DEC-003 v0.4 (staging holds synthetic data only).
 *
 * Runs ON THE VM, like generate-fixtures.js: the staging access list admits only the VM, and
 * the application's own credential from the staging environment file is used.
 *
 * Category names are quoted verbatim, in lowercase, from the SEN381 CivicConnect Master
 * Project Brief v1.1, §2 "Project Scenario: CivicConnect": "Service requests include matters
 * such as facility faults, damaged equipment, security concerns, IT support, maintenance
 * issues, lost property and other operational requests." The brief gives these as examples,
 * not as a confirmed controlled list (open item, ID allocated by E. Lindsay). Codes are derived
 * mechanically from the names (upper case, spaces to hyphens). "security concerns" is the one
 * security category: that is inferred from FR-1.5 and CFL-002, not stated by the brief.
 *
 * Users: one per FR-1.2 role (imported from the deployed checkout, never typed here), e-mail
 * seed-<run>-<role>@example.test, each with its own random password. Category authorisation
 * (synthetic, for the demonstration): every staff user holds the six non-security categories;
 * the Security Officer also holds the security category. The Requester and the Administrator
 * hold none.
 *
 * The reference counter for the current UTC year is created if absent (seq 0), OUTSIDE any
 * transaction, so the first submission does not have to create the `counters` collection
 * inside one. If the credential may not create it, this script says so and stops.
 *
 * Writes the logins to <out> (mode 600): it holds the synthetic passwords. Copy what you need,
 * then delete it. It is never committed.
 *
 * Usage (on the VM):
 *   sudo node --env-file=/etc/civicconnect/staging.env seed-demo.js \
 *     --app-dir /opt/civicconnect --out /tmp/seed-demo.json
 *
 * Exit code: 0 seeded; 2 refused or failed.
 */

import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describeMongoError } from './lib/mongoErrors.js';

/** Verbatim from Master Project Brief v1.1 §2; see the header. */
export const BRIEF_CATEGORY_NAMES = Object.freeze([
  'facility faults', 'damaged equipment', 'security concerns', 'IT support',
  'maintenance issues', 'lost property', 'other operational requests',
]);
export const SECURITY_CATEGORY_NAME = 'security concerns';
export const codeFor = (name) => name.toUpperCase().replace(/\s+/g, '-');
export const slugFor = (role) => role.toLowerCase().replace(/\s+/g, '-');

function refuse(reason) {
  console.log(`NOT RUN: ${reason}`);
  process.exit(2);
}

async function main() {
  let args;
  try {
    args = parseArgs({ options: {
      'app-dir': { type: 'string', default: '/opt/civicconnect' },
      out: { type: 'string' },
    } }).values;
  } catch (e) {
    refuse(`usage: ${e.message}`);
  }
  if (!args.out) refuse('--out <path> is required');
  if (existsSync(args.out)) refuse(`${args.out} already exists; remove it or choose another --out`);

  const appDir = path.resolve(args['app-dir']);
  const load = (rel) => import(pathToFileURL(path.join(appDir, rel)).href);

  const { STAGING_CLUSTER_MARKER } = await load('scripts/lib/clusterMarkers.js');
  if (!STAGING_CLUSTER_MARKER) refuse('the deployed checkout records no staging host marker');
  const uri = process.env.MONGODB_URI;
  if (!uri) refuse('MONGODB_URI is not set (run with --env-file=/etc/civicconnect/staging.env)');
  let parsed;
  try { parsed = new URL(uri); } catch { refuse('MONGODB_URI could not be parsed'); }
  if (!parsed.hostname.includes(STAGING_CLUSTER_MARKER)) refuse('the host in MONGODB_URI is not the staging cluster; refusing');
  if (decodeURIComponent(parsed.pathname.replace(/^\//, '')) !== 'civicconnect') refuse('MONGODB_URI does not name the civicconnect database; refusing');

  const { default: mongoose } = await import(pathToFileURL(path.join(appDir, 'node_modules', 'mongoose', 'index.js')).href);
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);

  const { connectDatabase, disconnectDatabase, databaseUserOf } = await load('src/infrastructure/database.js');
  const { hashPassword } = await load('src/infrastructure/passwordHasher.js');
  const { default: User } = await load('src/models/User.js');
  const { default: Category } = await load('src/models/Category.js');
  const { default: Counter } = await load('src/models/Counter.js');
  const { ROLE } = await load('src/models/_shared.js');

  const startedAt = new Date();
  const run = randomBytes(4).toString('hex');
  console.log('M4 demonstration seed (staging)');
  console.log(`Started (UTC)   : ${startedAt.toISOString()}`);
  console.log(`Host check      : passed (host contains "${STAGING_CLUSTER_MARKER}"; host not printed)`);
  console.log(`Database user   : ${databaseUserOf(uri)}`);
  console.log(`Node            : ${process.version}`);
  console.log(`Run id          : ${run}`);

  await connectDatabase(uri);
  try {
    const campusId = new mongoose.Types.ObjectId();
    const categories = await Category.insertMany(BRIEF_CATEGORY_NAMES.map((name) => ({
      campusId, name, code: codeFor(name), isSecurity: name === SECURITY_CATEGORY_NAME, active: true,
    })), { ordered: true });
    const nonSecurity = categories.filter((c) => !c.isSecurity).map((c) => c._id);
    const all = categories.map((c) => c._id);
    console.log(`Categories      : ${categories.length} (${categories.filter((c) => c.isSecurity).length} security)`);

    const staffAuthorisation = {
      [ROLE.REQUESTER]: [], [ROLE.ADMINISTRATOR]: [],
      [ROLE.TECHNICIAN]: nonSecurity, [ROLE.COORDINATOR]: nonSecurity, [ROLE.MANAGER]: nonSecurity,
      [ROLE.SECURITY_OFFICER]: all,
    };
    const logins = [];
    for (const role of Object.values(ROLE)) {
      const password = randomBytes(18).toString('base64url');
      const user = await User.create({
        campusId, roles: [role], categoryAuthorisations: staffAuthorisation[role] ?? [],
        email: `seed-${run}-${slugFor(role)}@example.test`, displayName: `Seed ${slugFor(role)} ${run}`,
        passwordHash: await hashPassword(password),
      });
      logins.push({ role, email: user.email, password, id: String(user._id) });
    }
    console.log(`Users           : ${logins.length} (one per FR-1.2 role)`);

    const year = new Date().getUTCFullYear();
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: `request-ref:${year}` }, { $setOnInsert: { seq: 0 } },
        { upsert: true, new: true, setDefaultsOnInsert: false },
      ).lean();
      console.log(`Counter         : request-ref:${year} present, seq ${counter.seq}`);
    } catch (e) {
      console.log(`COUNTER FAILED  : request-ref:${year} could not be created: ${describeMongoError(e)}`);
      console.log('                  The counters collection must exist before the first submission.');
      process.exitCode = 2;
    }

    const record = {
      run, createdAt: startedAt.toISOString(), campusId: String(campusId),
      categories: categories.map((c) => ({ id: String(c._id), code: c.code, name: c.name, isSecurity: c.isSecurity })),
      logins,
    };
    await writeFile(args.out, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await chmod(args.out, 0o600);
    console.log(`Logins file     : ${args.out} (mode 600; holds the synthetic passwords; never commit)`);
    for (const c of record.categories) console.log(`  category ${c.code} ${c.isSecurity ? '(security)' : ''}`);
    for (const l of logins) console.log(`  user ${l.role}: ${l.email}`);
    console.log(`Ended (UTC)     : ${new Date().toISOString()}`);
  } catch (e) {
    console.log(`FAILED at ${new Date().toISOString()}: ${describeMongoError(e)}`);
    process.exitCode = 2;
  } finally {
    await disconnectDatabase();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
