/**
 * Who may be assigned, or accept, a request by security category - S3 (A6).
 *
 * Traces to: FR-5.1, FR-5.2, FR-5.5, FR-1.5, FR-1.2, DEC-012, OI-15.
 *
 * Basis: decision of 17/10/2026 (project lead, walkthrough #10): a Security Officer may
 * be assigned to, or accept, ONLY security-category requests; a Technician ONLY
 * non-security requests. (A security request is for the Security Officer alone already,
 * through mayActOnRequest; the gap was a Security Officer taking a non-security request
 * in their categories.) Expected values below are written from that sentence.
 *
 * What this does NOT show: a user holding several roles (the rule is stated per role;
 * a holder of both is eligible for either kind), or the assignment pool list, which
 * filters by category and role only (see the notes: the client narrows it).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { mayBeAssigned } from '../src/domain/accessRules.js';
import { ROLE, STATUS } from '../src/models/_shared.js';
import { AssignmentRefusedError, AuthorisationError } from '../src/errors.js';
import { CAT, PEOPLE, harness } from './assignmentRuleHarness.js';

const ROLES = Object.values(ROLE);

// Basis: the decision above. Technique: exhaustive over the six FR-1.2 roles x security flag
// x category-authorised or not. Expected: true only for (Technician, non-security) and
// (Security Officer, security) when authorised; false for every other combination.
// Shows: the single rule function. Does NOT show: the services that use it.
test('mayBeAssigned: Technician only for non-security, Security Officer only for security, nobody else - FR-5.1, FR-5.5, FR-1.5, NV-163', () => {
  let trues = 0;
  for (const role of ROLES) for (const securityCategory of [false, true]) for (const authorised of [true, false]) {
    const request = { categoryId: CAT, securityCategory };
    const user = { id: 'x', roles: [role], categoryAuthorisations: authorised ? [CAT] : ['other'] };
    const expected = authorised
      && ((role === ROLE.TECHNICIAN && !securityCategory) || (role === ROLE.SECURITY_OFFICER && securityCategory));
    assert.equal(mayBeAssigned(request, user), expected,
      `${role} / security=${securityCategory} / authorised=${authorised}`);
    if (expected) trues += 1;
  }
  assert.equal(trues, 2);
});

// Technique: the service, every role as the ACCEPTING actor, on a Received unassigned request.
// Expected: a Technician accepts a non-security request; a Security Officer accepts a security
// request; a Security Officer accepting a non-security request, and a Technician accepting a
// security request, are refused with nothing written.
test('accept: a Security Officer cannot accept a non-security request, a Technician cannot accept a security one - A6, FR-5.2, NV-163', async () => {
  const cases = [
    [PEOPLE.tech, false, true], [PEOPLE.so, true, true],
    [PEOPLE.so, false, false], [PEOPLE.tech, true, false],
  ];
  for (const [actor, securityCategory, allowed] of cases) {
    const h = harness({ doc: { securityCategory } });
    const label = `${actor.roles[0]} accepting security=${securityCategory}`;
    if (allowed) {
      const result = await h.service.assign('r1', actor.id, actor, h.command());
      assert.equal(result.action, 'accept', label);
      assert.equal(h.store.doc.assigneeId, actor.id, label);
    } else {
      await assert.rejects(h.service.assign('r1', actor.id, actor, h.command()),
        (e) => e instanceof AssignmentRefusedError || e instanceof AuthorisationError, label);
      assert.equal(h.store.doc.assigneeId, null, label);
      assert.equal(h.store.doc.version, 1, label);
      assert.equal(h.state.appended.length, 0, label);
    }
  }
});

// Technique: a Coordinator who also holds the Security Officer role is the only staff actor
// who may act on a security request AND assign; a plain Coordinator naming a Technician or a
// Security Officer on a non-security request. Expected: naming a Security Officer on a
// non-security request is refused (assign and reassign); naming a Technician is accepted;
// on a security request a Security Officer may be named and a Technician may not.
test('assign and reassign: the named user must fit the request - Security Officer for security only, Technician for non-security only - A6, FR-5.1, FR-5.5, NV-163', async () => {
  const plain = PEOPLE.coord;
  const both = { ...PEOPLE.coord, id: 'coord-so', roles: [ROLE.COORDINATOR, ROLE.SECURITY_OFFICER] };
  const owned = { status: STATUS.ASSIGNED, assigneeId: 'someone-else', version: 2 };

  for (const doc of [{}, owned]) {
    const verb = doc.assigneeId ? 'reassign' : 'assign';
    const nonSecurity = (extra = {}) => harness({ doc: { ...doc, ...extra } });

    const refusedSo = nonSecurity();
    await assert.rejects(refusedSo.service.assign('r1', PEOPLE.so.id, plain, refusedSo.command()),
      AssignmentRefusedError, `${verb}: Security Officer named on a non-security request`);
    assert.equal(refusedSo.store.doc.assigneeId, doc.assigneeId ?? null);
    assert.equal(refusedSo.state.appended.length, 0);

    const okTech = nonSecurity();
    await okTech.service.assign('r1', PEOPLE.tech.id, plain, okTech.command());
    assert.equal(okTech.store.doc.assigneeId, PEOPLE.tech.id, `${verb}: Technician on non-security`);

    const okSo = nonSecurity({ securityCategory: true });
    await okSo.service.assign('r1', PEOPLE.so.id, both, okSo.command());
    assert.equal(okSo.store.doc.assigneeId, PEOPLE.so.id, `${verb}: Security Officer on security`);

    const refusedTech = nonSecurity({ securityCategory: true });
    await assert.rejects(refusedTech.service.assign('r1', PEOPLE.tech.id, both, refusedTech.command()),
      AssignmentRefusedError, `${verb}: Technician named on a security request`);
    assert.equal(refusedTech.store.doc.assigneeId, doc.assigneeId ?? null);
  }
});
