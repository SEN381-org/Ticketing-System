/**
 * Shared fixtures for the assignment-rule tests (S3, S6). Not a test file.
 *
 * The REAL assignment service runs over fake persistence: a request store whose
 * conditional update follows the repository's, and a unit of work that restores the
 * store when its callback throws, so "nothing was written" is asserted on state.
 */

import { createAssignmentService } from '../src/services/assignmentService.js';
import { ROLE, STATUS } from '../src/models/_shared.js';
import { PreconditionFailedError } from '../src/errors.js';

export const CAT = 'cat-1';
const staff = (id, role) => ({ id, roles: [role], categoryAuthorisations: [CAT] });

export const PEOPLE = Object.freeze({
  tech:    staff('tech-1', ROLE.TECHNICIAN),
  tech2:   staff('tech-2', ROLE.TECHNICIAN),
  so:      staff('so-1', ROLE.SECURITY_OFFICER),
  so2:     staff('so-2', ROLE.SECURITY_OFFICER),
  coord:   staff('coord-1', ROLE.COORDINATOR),
  mgr:     staff('mgr-1', ROLE.MANAGER),
  admin:   { id: 'admin-1', roles: [ROLE.ADMINISTRATOR], categoryAuthorisations: [CAT] },
  requester: { id: 'req-1', roles: [ROLE.REQUESTER], categoryAuthorisations: [] },
});

const records = new Map(Object.values(PEOPLE).map((u) => [u.id, { ...u, _id: u.id, status: 'active' }]));

export function harness({ doc = {} } = {}) {
  const store = {
    doc: {
      _id: 'r1', campusId: 'campus-1', reference: 'CC-2026-000001', categoryId: CAT,
      securityCategory: false, requesterId: 'req-1', status: STATUS.RECEIVED,
      assigneeId: null, assignedAt: null, version: 1, ...doc,
    },
  };
  const state = { appended: [] };
  const requests = {
    findById: async () => ({ ...store.doc }),
    applyAssignment: async (id, expectedVersion, expectedOwner, $set) => {
      if (store.doc.version !== expectedVersion || (store.doc.assigneeId ?? null) !== (expectedOwner ?? null)) {
        throw new PreconditionFailedError(id, expectedVersion);
      }
      Object.assign(store.doc, $set, { version: expectedVersion + 1 });
      return { version: store.doc.version };
    },
  };
  const history = {
    findByIdempotencyKey: async () => null,
    append: async (entry) => { state.appended.push(entry); return { _id: `h${state.appended.length}` }; },
  };
  const unitOfWork = {
    run: async (work) => {
      const snapshot = { ...store.doc };
      try { return await work('session-1'); } catch (error) { store.doc = snapshot; throw error; }
    },
  };
  const service = createAssignmentService({
    requests, users: { findById: async (id) => records.get(String(id)) ?? null },
    history, unitOfWork, recordRefusal: async () => true,
  });
  let n = 0;
  const command = () => ({ expectedVersion: store.doc.version, idempotencyKey: `k-${++n}`, fingerprint: `fp-${n}` });
  return { service, store, state, command };
}
