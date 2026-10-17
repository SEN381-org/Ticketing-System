/**
 * Verification evidence for recording a refused operation - TD-005, AC-FR-1.3.
 *
 * Traces to: FR-1.3, AC-FR-1.3, AC-FR-5.3, TD-005, NFR-1.4, DEC-012 (point 1),
 *            DEC-014, DEC-017 (M-1).
 *
 * The guard test uses a bare request object with `app.locals.recordRefusal`, the
 * seam createApp fills. The service test uses a fake audit repository and shows
 * exactly what would be written.
 *
 * What this does NOT show: that the row is inserted into Atlas (the repository
 * is faked here; its shape is covered by the existing audit tests), or that a
 * Technician's refused operation over HTTP is recorded - tests/assignmentRoutes
 * .test.js does that through createApp.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { requireOperation, requireAnyOperation } from '../src/middleware/authorise.js';
import { createAccessAuditService } from '../src/services/accessAuditService.js';
import { AuthenticationError, AuthorisationError } from '../src/errors.js';
import { ROLE } from '../src/models/_shared.js';

const TARGET = '65f000000000000000000001';
const TECH = { id: '65f0000000000000000000a1', roles: [ROLE.TECHNICIAN] };

function runGuard(guard, req) {
  return new Promise((resolve) => {
    const events = [];
    const next = (error) => { events.push('next'); resolve({ error: error ?? null, events }); };
    req.events = events;
    guard(req, {}, next);
  });
}

const reqWith = (actor, recordRefusal) => ({
  headers: {}, actor, params: { id: TARGET },
  app: { locals: { recordRefusal } },
});

// ---------- guard path (DEC-012 point 1) ----------

test('AC-FR-1.3, TD-005: a role refused by the guard is recorded with actor, operation and target, and stays a 403', async () => {
  const recorded = [];
  const req = reqWith(TECH, async (r) => { recorded.push(r); });
  const { error } = await runGuard(requireOperation('request:assign'), req);

  assert.ok(error instanceof AuthorisationError);
  assert.equal(error.status, 403);
  assert.deepEqual(recorded, [{ actor: TECH, operation: 'request:assign', targetId: TARGET }]);
});

test('AC-FR-1.3: the attempt is recorded before the refusal is passed on', async () => {
  const order = [];
  const req = reqWith(TECH, async () => { await Promise.resolve(); order.push('recorded'); });
  const { events } = await new Promise((resolve) => {
    requireOperation('request:assign')(req, {}, () => { order.push('next'); resolve({ events: order }); });
  });
  assert.deepEqual(events, ['recorded', 'next']);
});

test('TD-005: a recorder that throws or rejects does not turn the 403 into anything else', async () => {
  for (const recorder of [async () => { throw new Error('audit down'); }, () => { throw new Error('sync'); }]) {
    const { error } = await runGuard(requireOperation('request:assign'), reqWith(TECH, recorder));
    assert.ok(error instanceof AuthorisationError, 'still the refusal');
    assert.equal(error.status, 403);
  }
});

test('AC-FR-1.3: an unauthenticated request (401) and a permitted one are not recorded', async () => {
  let calls = 0;
  const recorder = async () => { calls += 1; };
  const anon = await runGuard(requireOperation('request:assign'), reqWith(undefined, recorder));
  assert.ok(anon.error instanceof AuthenticationError);
  const ok = await runGuard(requireOperation('request:assign'),
    reqWith({ id: 'c', roles: [ROLE.COORDINATOR] }, recorder));
  assert.equal(ok.error, null);
  assert.equal(calls, 0);
});

test('FR-1.3: a guard with no recorder refuses synchronously, exactly as before', () => {
  let error = null;
  requireOperation('request:assign')({ headers: {}, actor: TECH }, {}, (e) => { error = e; });
  assert.ok(error instanceof AuthorisationError, 'next was called before this line returned');
});

test('FR-5.1, FR-5.2: the assignments guard admits assign or accept and refuses every other role', () => {
  const guard = requireAnyOperation(['request:assign', 'request:accept']);
  const outcome = (role) => { let e = 'passed'; guard({ headers: {}, actor: { id: 'u', roles: [role] } }, {}, (x) => { if (x) e = 'refused'; }); return e; };
  assert.equal(outcome(ROLE.COORDINATOR), 'passed');
  assert.equal(outcome(ROLE.MANAGER), 'passed');
  assert.equal(outcome(ROLE.TECHNICIAN), 'passed');
  assert.equal(outcome(ROLE.SECURITY_OFFICER), 'passed');
  assert.equal(outcome(ROLE.REQUESTER), 'refused');
  assert.equal(outcome(ROLE.ADMINISTRATOR), 'refused');
});

test('DEC-012: requireAnyOperation refuses an undocumented operation at construction', () => {
  assert.throws(() => requireAnyOperation(['request:assign', 'request:nope']), /No authorisation rule is documented/);
});

// ---------- the recorder service ----------

test('AC-FR-1.3, DEC-017 M-1: the event carries actor, role(s), operation, target and time, and nothing else', async () => {
  const written = [];
  const at = new Date('2026-10-17T10:00:00Z');
  const { recordRefusal } = createAccessAuditService({
    audit: { recordSecurityEvent: async (e) => { written.push(e); } }, clock: () => at, log: { error() {} },
  });
  const ok = await recordRefusal({
    actor: { id: TECH.id, roles: [ROLE.TECHNICIAN, ROLE.SECURITY_OFFICER], displayName: 'Must Not Appear', email: 'x@y.test' },
    operation: 'request:assign', targetId: TARGET,
  });
  assert.equal(ok, true);
  assert.deepEqual(written, [{
    origin: 'access', eventType: 'access.refused.request:assign', outcome: 'refused', occurredAt: at,
    actorSource: 'session', actorId: TECH.id, actorRole: 'Technician,Security Officer',
    collectionName: 'requests', documentId: TARGET,
  }]);
});

test('AC-FR-1.3: a malformed or absent target id is recorded as unknown, not passed to a cast', async () => {
  const written = [];
  const { recordRefusal } = createAccessAuditService({
    audit: { recordSecurityEvent: async (e) => { written.push(e); } }, log: { error() {} },
  });
  await recordRefusal({ actor: TECH, operation: 'request:assign', targetId: 'not-an-id' });
  await recordRefusal({ actor: TECH, operation: 'request:assign' });
  assert.deepEqual(written.map((e) => [e.collectionName, e.documentId]), [[null, null], [null, null]]);
});

test('TD-005: when the audit write fails the recorder reports false, logs without personal data, and does not throw', async () => {
  const logged = [];
  const { recordRefusal } = createAccessAuditService({
    audit: { recordSecurityEvent: async () => { throw new Error('write failed'); } },
    log: { error: (...a) => logged.push(a.join(' ')) },
  });
  assert.equal(await recordRefusal({ actor: TECH, operation: 'request:assign', targetId: TARGET }), false);
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], new RegExp(TECH.id), 'no actor id in the log line');
});
