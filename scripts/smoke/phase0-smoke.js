/**
 * M3 Phase 0 smoke check — reachability only. DEC-018 evidence item 2.
 *
 * Proves that a running server, connected to a real Atlas cluster, can be
 * reached over HTTP end to end:
 *
 *   1. GET  /api/v1/health                      → 200, database up
 *   2. POST /requests/:id/transitions, no cookie → 401
 *   3. POST /api/v1/sessions                    → 201 + __Host-sid
 *   4. POST /requests/:id/transitions, cookie    → 201, and exactly one history entry
 *   5. DELETE /api/v1/sessions/current           → 204, session document gone
 *   6. POST /requests/:id/transitions, old cookie → 401
 *
 * It does NOT verify transaction atomicity (a separate M3 item, which needs a
 * fault injected inside the transaction), least privilege (it runs as whatever
 * database user MONGODB_URI names, printed below), TLS (Phase 1) or load.
 *
 * Fixture: the script seeds one Coordinator and one Received request directly
 * on the cluster, because submission and assignment routes do not exist yet.
 * The transition used is Received → Rejected with a reason, which the current
 * model permits for a Coordinator authorised for the category. Seeded data is
 * synthetic and is left in place: requestHistory is append-only (DB-01), and
 * the test cluster's database is NOT dropped per run, so seeded data accumulates
 * across runs. That contradicts the design in DEC-003 (environment map, Test
 * row), which says it is dropped; the contradiction is logged as DEF-006.
 *
 * Usage (server already running against the SAME cluster):
 *   node --env-file=.env scripts/smoke/phase0-smoke.js --base-url http://127.0.0.1:3000
 * Paste the full output into docs/evidence/ as the reachability record.
 */

import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase, databaseUserOf } from '../../src/infrastructure/database.js';
import { hashPassword } from '../../src/infrastructure/passwordHasher.js';
import { hashToken } from '../../src/services/authService.js';
import User from '../../src/models/User.js';
import Request from '../../src/models/Request.js';
import RequestHistory from '../../src/models/RequestHistory.js';
import Session from '../../src/models/Session.js';
import { ROLE, STATUS } from '../../src/models/_shared.js';

const { values } = parseArgs({ options: { 'base-url': { type: 'string' } } });
const base = values['base-url'];
if (!base) { console.error('--base-url is required'); process.exit(1); }
if (!process.env.MONGODB_URI) { console.error('MONGODB_URI is not set'); process.exit(1); }

const results = [];
const check = (step, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? `  — ${detail}` : ''}`);
};

console.log('M3 Phase 0 smoke check (reachability only)');
console.log(`Run at        : ${new Date().toISOString()}`);
console.log(`Node          : ${process.version}`);
console.log(`Base URL      : ${base}`);
console.log(`Database user : ${databaseUserOf(process.env.MONGODB_URI)}`);
console.log('');

await connectDatabase(process.env.MONGODB_URI);
try {
  // ---- fixture ----
  const campusId = new mongoose.Types.ObjectId();
  const categoryId = new mongoose.Types.ObjectId();
  const password = randomBytes(18).toString('base64url');
  const email = `smoke-${randomBytes(4).toString('hex')}@example.test`;
  const [user] = await User.create([{
    campusId, email, displayName: 'Phase 0 smoke', roles: [ROLE.COORDINATOR],
    categoryAuthorisations: [categoryId], passwordHash: await hashPassword(password),
  }]);
  const now = new Date();
  const year = now.getUTCFullYear();
  const [request] = await Request.create([{
    campusId, reference: `CC-${year}-${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`,
    categoryId, location: 'Smoke check', description: 'Synthetic request for the Phase 0 smoke check',
    securityCategory: false, status: STATUS.RECEIVED, requesterId: user._id, submittedById: user._id,
    submittedAt: now, statusChangedAt: now, version: 0,
  }]);
  console.log(`Fixture       : user ${user._id}, request ${request._id} (${request.reference}), status ${request.status}`);
  console.log('');

  const transitionUrl = `${base}/api/v1/requests/${request._id}/transitions`;
  const transition = (cookie, key) => fetch(transitionUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'if-match': '"v0"', 'idempotency-key': key,
               ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ toStatus: STATUS.REJECTED, reason: 'Phase 0 smoke check' }),
  });

  // 1
  const health = await fetch(`${base}/api/v1/health`);
  const healthBody = await health.json();
  check('1 health is public and reports the database up', health.status === 200 && healthBody.database === 'up',
    `${health.status} ${JSON.stringify(healthBody)}`);

  // 2
  const anonymous = await transition(null, `smoke-${randomBytes(6).toString('hex')}`);
  check('2 transition without a session is refused', anonymous.status === 401, `${anonymous.status}`);

  // 3
  const login = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  const setCookie = login.headers.getSetCookie()[0] ?? '';
  const cookie = setCookie.split(';')[0];
  const token = cookie.split('=')[1] ?? '';
  const stored = token ? await Session.findById(hashToken(token)).lean() : null;
  check('3 login sets __Host-sid and stores only its hash',
    login.status === 201 && cookie.startsWith('__Host-sid=') && stored !== null
      && !(await Session.exists({ _id: token })),
    `${login.status}; attributes: ${setCookie.split(';').slice(1).map((s) => s.trim()).join('; ')}`);

  // 4
  const done = await transition(cookie, `smoke-${randomBytes(6).toString('hex')}`);
  const doneBody = await done.json();
  const entries = await RequestHistory.countDocuments({ requestId: request._id });
  const after = await Request.findById(request._id).lean();
  check('4 transition with the session commits, with exactly one history entry',
    done.status === 201 && entries === 1 && after.status === STATUS.REJECTED && after.version === 1,
    `${done.status} ETag ${done.headers.get('etag')}; status ${after.status}, version ${after.version}, history entries ${entries}`);
  if (done.status !== 201) console.log(`      body: ${JSON.stringify(doneBody)}`);

  // 5
  const logout = await fetch(`${base}/api/v1/sessions/current`, { method: 'DELETE', headers: { cookie } });
  const gone = token ? (await Session.findById(hashToken(token)).lean()) === null : false;
  check('5 logout ends the session', logout.status === 204 && gone, `${logout.status}; session document removed: ${gone}`);

  // 6
  const reused = await transition(cookie, `smoke-${randomBytes(6).toString('hex')}`);
  check('6 the old cookie no longer works', reused.status === 401, `${reused.status}`);
} finally {
  await disconnectDatabase();
}

const passed = results.filter(Boolean).length;
console.log('');
console.log(`${passed}/${results.length} checks passed.`);
process.exitCode = passed === results.length ? 0 : 1;
