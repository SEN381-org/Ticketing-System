/**
 * Shared harness for the M3 API/integration cases.
 * Specification: docs/quality/M3_API_Test_Specification.md §1 and §3.
 *
 * The cases run against a real cluster over real HTTP, with the application's
 * own credential (`civicconnect-app`). That role cannot delete from
 * `requestHistory` or drop the database (DB-01 layer 3), so nothing is cleaned
 * up: every test creates its own fixture with fresh identifiers, and every
 * assertion is scoped to that fixture's `requestId` or `actorId`. A collection
 * count would include earlier runs.
 *
 * The cases write fixtures that cannot be removed, so they are opt-in: they run
 * only when the host in MONGODB_URI contains `civicconnecttest`. With no URI, or
 * a URI whose host does not name the test cluster, they are skipped with a
 * printed reason and nothing connects. A skipped case is not a verified one.
 *
 * Run:  npm run test:integration   (reads .env.test)
 */

import { before, after } from 'node:test';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

import { connectDatabase, disconnectDatabase } from '../../src/infrastructure/database.js';
import { hashPassword } from '../../src/infrastructure/passwordHasher.js';
import User from '../../src/models/User.js';
import Request from '../../src/models/Request.js';
import RequestHistory from '../../src/models/RequestHistory.js';
import { ROLE, STATUS } from '../../src/models/_shared.js';

/**
 * DEC-003 (environment map, Test row) is the authoritative source for this
 * constraint: it records the test cluster's hostname, which contains
 * `civicconnecttest` with no hyphen, separately from the environment name
 * `civicconnect-test` and the Atlas project `CivicConnect-Test` (OI-19).
 *
 * The host of the URI must name the test cluster. Only the host is examined, so a
 * user name, database name or option that happens to contain the marker does not
 * satisfy it. The URI itself is never printed: it holds a credential.
 */
const TEST_CLUSTER_MARKER = 'civicconnecttest';

function skipReason(uri) {
  if (!uri) return 'MONGODB_URI is not set: integration cases were NOT run';
  let host;
  try {
    host = new URL(uri).hostname;
  } catch {
    return 'MONGODB_URI could not be parsed to find its host: integration cases were NOT run';
  }
  if (!host.includes(TEST_CLUSTER_MARKER)) {
    return `the host in MONGODB_URI does not contain "${TEST_CLUSTER_MARKER}": refusing to run against a `
      + 'database that is not the test cluster, integration cases were NOT run';
  }
  return false;
}

export const skip = skipReason(process.env.MONGODB_URI);

/** The application logs a 500 it renders. The fault in case 3 is deliberate, so it is not echoed. */
export const quiet = { error() {} };

/** Call once at the top of a test file. Connects before its tests and disconnects after. */
export function useCluster() {
  before(async () => { if (!skip) await connectDatabase(process.env.MONGODB_URI); });
  after(async () => { if (!skip) await disconnectDatabase(); });
}

export const newKey = () => randomUUID();

/** From `Received`, /transitions permits only this (src/domain/requestStatus.js). */
export const reject = (reason) => ({ toStatus: STATUS.REJECTED, reason });

/** A `Received` request at version 0, in the fixture's campus and category. */
export async function createRequest({ campusId, categoryId, user }) {
  const now = new Date();
  const [request] = await Request.create([{
    campusId, categoryId,
    reference:   `CC-${now.getUTCFullYear()}-${String(randomInt(1_000_000)).padStart(6, '0')}`,
    location:    'Integration test',
    description: 'Synthetic request for the M3 API/integration cases',
    securityCategory: false, status: STATUS.RECEIVED,
    requesterId: user._id, submittedById: user._id,
    submittedAt: now, statusChangedAt: now, version: 0,
  }]);
  return request;
}

/**
 * One member of staff authorised for one category, and one request in it. All synthetic.
 * A Coordinator unless the case needs another role.
 */
export async function createFixture({ roles = [ROLE.COORDINATOR] } = {}) {
  const campusId = new mongoose.Types.ObjectId();
  const categoryId = new mongoose.Types.ObjectId();
  const email = `it-${randomBytes(6).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url');
  const [user] = await User.create([{
    campusId, email, displayName: 'Integration test', roles,
    categoryAuthorisations: [categoryId], passwordHash: await hashPassword(password),
  }]);
  const request = await createRequest({ campusId, categoryId, user });
  return { campusId, categoryId, user, email, password, request, requestId: String(request._id) };
}

export async function serve(app, fn) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/** @returns {Promise<string>} the `__Host-sid=<token>` pair to send back as a Cookie header */
export async function login(base, { email, password }) {
  const res = await fetch(`${base}/api/v1/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const cookie = res.headers.getSetCookie()[0]?.split(';')[0];
  if (res.status !== 201 || !cookie) throw new Error(`fixture login failed with ${res.status}`);
  return cookie;
}

/**
 * POST /api/v1/requests/{id}/transitions. A header left undefined is not sent,
 * which is how the missing-key case is expressed.
 */
export async function postTransition(base, requestId, { cookie, ifMatch, key, body }) {
  const headers = { 'content-type': 'application/json', cookie };
  if (ifMatch !== undefined) headers['if-match'] = ifMatch;
  if (key !== undefined) headers['idempotency-key'] = key;
  const res = await fetch(`${base}/api/v1/requests/${requestId}/transitions`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* left null; the assertions report it */ }
  return { status: res.status, headers: res.headers, body: parsed, text };
}

/**
 * The request and its history as stored. Passed through JSON so that two
 * snapshots compare with `deepEqual` regardless of ObjectId and Date identity.
 */
export async function snapshot(requestId) {
  const [request, history] = await Promise.all([
    Request.findById(requestId).lean(),
    RequestHistory.find({ requestId }).sort({ requestVersion: 1 }).lean(),
  ]);
  return JSON.parse(JSON.stringify({ request, history }));
}

/** History entries this actor wrote under this key, on any request. */
export async function entriesForKey(actorId, idempotencyKey) {
  return RequestHistory.find({ actorId, idempotencyKey }).lean();
}

/** Every leaf value in a parsed JSON body, at any depth. */
export function leafValues(value) {
  if (value === null || typeof value !== 'object') return [value];
  return Object.values(value).flatMap(leafValues);
}
