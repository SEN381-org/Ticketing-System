/**
 * Shared model definitions. Authoritative source: docs/architecture/data/
 * Data_and_Persistence_Baseline_v0.1.md §3.1.
 *
 * NOTE: src/domain/requestStatus.js still carries pre-baseline status and role
 * values (review comments R-04 and R-07 in docs/M2_BACKEND_CORRECTIONS.md). Until
 * that correction lands, the domain and these model enums disagree; the model
 * follows the baselined requirements.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

/** FR-6.1 / AC-FR-6.1 — exact baselined values. */
export const STATUS = Object.freeze({
  RECEIVED: 'Received',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
});

export const TERMINAL_STATUSES = Object.freeze([STATUS.CLOSED, STATUS.REJECTED]);

/** FR-1.2 — the controlled role set. */
export const ROLE = Object.freeze({
  REQUESTER: 'Requester',
  TECHNICIAN: 'Technician',
  COORDINATOR: 'Coordinator',
  MANAGER: 'Manager',
  SECURITY_OFFICER: 'Security Officer',
  ADMINISTRATOR: 'Administrator',
});

/** SCP-019 — every collection is campus-scoped from the first document. */
export const campusRef = () => ({
  type: Schema.Types.ObjectId, ref: 'Campus', required: true, immutable: true,
});

/** Actor recorded on every write so the Atlas trigger can attribute it (CON-015, SCP-008). */
export const lastActor = () => ({
  lastActorId:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
  lastActorRole: { type: String, default: null },
});
