/**
 * Shared model definitions. Authoritative source: docs/architecture/data/
 * Data_and_Persistence_Baseline_v0.3.md §3.1.
 *
 * src/domain/requestStatus.js and src/domain/accessRules.js import STATUS and
 * ROLE from here rather than declaring their own, so the domain and the
 * persistence layer cannot drift apart. That was the cause of review comments
 * R-04 and R-07, and it is closed.
 *
 * STATUS, ROLE and TERMINAL_STATUSES are now defined in shared/domainValues.js,
 * a module with no imports so that the browser client can use the same values
 * as the server. They are re-exported here so every existing importer is
 * unchanged. There must be exactly one definition: in M2 the application slice
 * used invented statuses and roles that contradicted FR-6.1 and FR-1.2, recorded
 * at the time in the AI Usage Register (v0.12, row 48, 2026-10-01). It predates
 * the Defect Register, so it has no DEF identifier.
 */

import mongoose from 'mongoose';

export { STATUS, ROLE, TERMINAL_STATUSES } from '../../shared/domainValues.js';

const { Schema } = mongoose;

/** SCP-019 — every collection is campus-scoped from the first document. */
export const campusRef = () => ({
  type: Schema.Types.ObjectId, ref: 'Campus', required: true, immutable: true,
});

/** Actor recorded on every write so the Atlas trigger can attribute it (CON-015, SCP-008). */
export const lastActor = () => ({
  lastActorId:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
  lastActorRole: { type: String, default: null },
});
