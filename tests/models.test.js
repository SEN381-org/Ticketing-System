/**
 * Verification that src/models implements the data baseline
 * (docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md).
 *
 * Runs without a database: validation is synchronous, and the append-only middleware
 * refuses a mutation before any driver call is made. Database-level enforcement of
 * append-only storage (DB-01 layer 3, the Atlas role) is verified at M3 against a
 * test cluster and is not claimed here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

import { STATUS, ROLE } from '../src/models/_shared.js';
import Request, { REQUEST_PERSONAL_FIELDS } from '../src/models/Request.js';
import RequestHistory from '../src/models/RequestHistory.js';
import User from '../src/models/User.js';

mongoose.set('bufferCommands', false);   // an unhooked operation fails fast instead of waiting for a connection

const id = () => new mongoose.Types.ObjectId();

function validRequest(overrides = {}) {
  return {
    campusId: id(), reference: 'CC-2026-000001',
    categoryId: id(), location: 'Block A, room 12', description: 'Projector does not power on',
    securityCategory: false, requesterId: id(), submittedById: id(),
    submittedAt: new Date(), statusChangedAt: new Date(),
    ...overrides,
  };
}

function validHistory(overrides = {}) {
  return {
    campusId: id(), requestId: id(), requestVersion: 1, changeType: 'created',
    toStatus: STATUS.RECEIVED, actorId: id(), actorRole: ROLE.REQUESTER, occurredAt: new Date(),
    ...overrides,
  };
}

const errorsOf = (doc) => Object.keys(doc.validateSync()?.errors ?? {});

test('status values are exactly the FR-6.1 set', () => {
  assert.deepEqual(Object.values(STATUS),
    ['Received', 'Assigned', 'In Progress', 'On Hold', 'Resolved', 'Closed', 'Rejected']);
});

test('role values are exactly the FR-1.2 controlled role set', () => {
  assert.deepEqual(Object.values(ROLE),
    ['Requester', 'Technician', 'Coordinator', 'Manager', 'Security Officer', 'Administrator']);
});

test('a request with only category, location and description as business input is valid — FR-2.2', () => {
  const doc = new Request(validRequest());
  assert.deepEqual(errorsOf(doc), []);
  assert.equal(doc.status, STATUS.RECEIVED, 'new requests begin at Received (FR-6.1)');
  assert.equal(doc.version, 0, 'ETag version starts at 0 (DEC-014)');
});

test('each of the three FR-2.2 mandatory fields is required', () => {
  for (const field of ['categoryId', 'location', 'description']) {
    const doc = new Request(validRequest({ [field]: undefined }));
    assert.ok(errorsOf(doc).includes(field), `${field} must be required`);
  }
});

test('title is not part of the model — FR-2.2 treats no other field as mandatory', () => {
  assert.throws(() => new Request(validRequest({ title: 'x' })), /not in schema|strict/i);
});

test('a request is campus-scoped — SCP-019', () => {
  assert.ok(errorsOf(new Request(validRequest({ campusId: undefined }))).includes('campusId'));
  assert.ok(errorsOf(new RequestHistory(validHistory({ campusId: undefined }))).includes('campusId'));
});

test('a status outside FR-6.1 is rejected by the model', () => {
  assert.ok(errorsOf(new Request(validRequest({ status: 'Submitted' }))).includes('status'));
  for (const status of Object.values(STATUS)) {
    assert.deepEqual(errorsOf(new Request(validRequest({ status }))), [], `${status} must be accepted`);
  }
});

test('an anonymised request is valid without its personal fields — NFR-4.2 / PROC-001', () => {
  const nulled = Object.fromEntries(REQUEST_PERSONAL_FIELDS.filter((f) => !f.includes('.')).map((f) => [f, null]));
  const doc = new Request(validRequest({ ...nulled, anonymisedAt: new Date() }));
  assert.deepEqual(errorsOf(doc), []);
});

test('requestHistory records the version it produced and requires an actor at insert — FR-6.3', async () => {
  assert.ok(errorsOf(new RequestHistory(validHistory({ requestVersion: undefined }))).includes('requestVersion'));
  await assert.rejects(new RequestHistory(validHistory({ actorId: null })).validate(), /actorId is required/);
});

for (const [name, run] of [
  ['updateOne',          () => RequestHistory.updateOne({ _id: id() }, { body: 'x' })],
  ['findByIdAndUpdate',  () => RequestHistory.findByIdAndUpdate(id(), { body: 'x' })],
  ['findByIdAndDelete',  () => RequestHistory.findByIdAndDelete(id())],
  ['deleteMany',         () => RequestHistory.deleteMany({})],
  ['document deleteOne', () => RequestHistory.hydrate(validHistory({ _id: id() })).deleteOne()],
  ['bulkWrite (update)', () => RequestHistory.bulkWrite([{ updateOne: { filter: {}, update: { body: 'x' } } }])],
]) {
  test(`requestHistory refuses ${name} — FR-6.7, DB-01 layer 2`, async () => {
    await assert.rejects(run(), /AppendOnlyViolation/);
  });
}

test('a user must hold at least one role from the FR-1.2 set — AC-FR-1.2', () => {
  const base = { campusId: id(), email: 'a@b.test', displayName: 'A', passwordHash: 'h' };
  assert.ok(errorsOf(new User({ ...base, roles: [] })).includes('roles'), 'empty role set rejected');
  assert.ok(errorsOf(new User({ ...base, roles: ['Department Head'] })).some((k) => k.startsWith('roles')),
    'role outside FR-1.2 rejected');
  assert.deepEqual(errorsOf(new User({ ...base, roles: [ROLE.TECHNICIAN] })), []);
});
