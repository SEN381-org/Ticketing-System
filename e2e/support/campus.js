/**
 * Fixtures for the M4 journeys (E2E-3 to E2E-6): a synthetic campus with a real
 * Category document, and one user per role in that campus.
 *
 * Every value is synthetic and carries the run id. Nothing is removed afterwards:
 * the application's database role cannot delete from requestHistory (DB-01
 * layer 3), so each test makes its own campus and asserts only inside it.
 *
 * Import order matters: ./cluster.js loads the environment file before the
 * harness reads MONGODB_URI, so it comes first.
 */
import { randomBytes, randomInt } from 'node:crypto';
import mongoose from 'mongoose';

import './cluster.js';
import { hashPassword } from '../../src/infrastructure/passwordHasher.js';
import Category from '../../src/models/Category.js';
import Request from '../../src/models/Request.js';
import User from '../../src/models/User.js';
import { ROLE, STATUS } from '../../src/models/_shared.js';

/**
 * Master Brief v1.1 section 2: the category names are lowercase, verbatim.
 * perf/seed-demo.js (BRIEF_CATEGORY_NAMES) is not in this tree, so the value is
 * quoted from the brief rather than imported.
 */
export const BRIEF_CATEGORY_NAME = 'facility faults';

/** A short tag that is unique per call and safe in e-mail addresses and codes. */
export const newRunId = () => `e2e${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;

/**
 * A campus with one non-security category named as the brief names it, plus
 * (when asked) a second category, so a category filter has something to exclude.
 */
export async function createCampus({ withSecondCategory = false } = {}) {
  const runId = newRunId();
  const campusId = new mongoose.Types.ObjectId();
  const make = (code, name) => Category.create({ campusId, code: `${code}-${runId}`, name, isSecurity: false });
  const category = await make('FF', BRIEF_CATEGORY_NAME);
  const other = withSecondCategory ? await make('OT', `e2e other ${runId}`) : null;
  return { runId, campusId, category, categoryId: category._id, other };
}

/**
 * One user of one role in the campus. Staff are authorised for the campus's
 * category (FR-4.6, FR-5.2); a Requester needs no authorisation.
 */
export async function addUser(campus, role, { authorised = role !== ROLE.REQUESTER } = {}) {
  const email = `${campus.runId}-${role.toLowerCase().replace(/\s+/g, '')}@example.test`;
  const password = randomBytes(18).toString('base64url');
  const user = await User.create({
    campusId: campus.campusId, email, displayName: `E2E ${role} ${campus.runId}`, roles: [role],
    categoryAuthorisations: authorised ? [campus.categoryId] : [],
    passwordHash: await hashPassword(password),
  });
  return { user, email, password, role, id: String(user._id), displayName: user.displayName };
}

/**
 * A request written straight to the collection, as a stored submission would
 * leave it (version 1). For states a journey does not itself create.
 */
export async function insertRequest(campus, requester, { status = STATUS.RECEIVED, categoryId = campus.categoryId, assignee = null } = {}) {
  const now = new Date();
  const [request] = await Request.create([{
    campusId: campus.campusId, categoryId,
    reference: `CC-${now.getUTCFullYear()}-${String(randomInt(1_000_000)).padStart(6, '0')}`,
    location: `E2E ${campus.runId} location`, description: `E2E ${campus.runId} description`,
    securityCategory: false, status,
    requesterId: requester.user._id, submittedById: requester.user._id,
    assigneeId: assignee ? assignee.user._id : null, assignedAt: assignee ? now : null,
    submittedAt: now, statusChangedAt: now, version: 1,
  }]);
  return { request, requestId: String(request._id), reference: request.reference };
}

/** The requests a user submitted, as stored. Passed through JSON like snapshot(). */
export async function requestsOf(user) {
  return JSON.parse(JSON.stringify(await Request.find({ requesterId: user._id }).lean()));
}

/** Every request in the campus, as stored: the server truth the management view is compared with. */
export async function campusRequests(campusId) {
  return JSON.parse(JSON.stringify(await Request.find({ campusId }).lean()));
}
