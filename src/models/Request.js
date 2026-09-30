/**
 * Service request — aggregate root of the request lifecycle.
 *
 * Traces to: FR-2.1, FR-2.2, FR-2.3, FR-2.5, FR-2.6, FR-5.x, FR-6.1, FR-6.5, FR-6.6,
 *            SCP-001, SCP-008, SCP-019, NFR-4.2, DEC-006, DEC-014, DEC-015, DEC-016.
 * Authoritative definition: docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md §3.2.
 *
 * `version` is the optimistic-concurrency counter exposed as the ETag (DEC-014). Every
 * update must be conditional on it and increment it (DEC-015); that rule is enforced in
 * the repository, not here (review comments R-09, R-13).
 */

import mongoose from 'mongoose';
import { STATUS, campusRef, lastActor } from './_shared.js';

const { Schema } = mongoose;

/** Fields nulled by PROC-001 anonymisation (NFR-4.2). Single list, read by the procedure and tests. */
export const REQUEST_PERSONAL_FIELDS = Object.freeze([
  'description', 'location', 'requesterId', 'submittedById', 'assigneeId',
  'resolution.summary', 'resolution.recordedById', 'closure.reason', 'closure.closedById',
]);

function notAnonymised() { return this.anonymisedAt == null; }

const requestSchema = new Schema(
  {
    campusId:  campusRef(),
    // FR-2.6 — unique, immutable, displayed on submission.
    reference: { type: String, required: true, immutable: true, match: /^CC-\d{4}-\d{6}$/ },

    // FR-2.2 / DEC-006 — exactly these three are mandatory; nothing else is.
    categoryId:  { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    location:    { type: String, trim: true, maxlength: 200,  required: notAnonymised },
    description: { type: String, trim: true, maxlength: 5000, required: notAnonymised },

    // FR-1.5 / CFL-002 — snapshot at submission so a later category edit cannot widen access.
    securityCategory: { type: Boolean, required: true, immutable: true },

    status: { type: String, required: true, enum: Object.values(STATUS), default: STATUS.RECEIVED },

    // FR-2.5 — requester vs submitter differ when a Coordinator captures on someone's behalf (RSK-001).
    requesterId:   { type: Schema.Types.ObjectId, ref: 'User', default: null, required: notAnonymised },
    submittedById: { type: Schema.Types.ObjectId, ref: 'User', default: null, required: notAnonymised },
    submittedAt:   { type: Date, required: true, immutable: true },

    // FR-5.1 – FR-5.5
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: { type: Date, default: null },

    // FR-6.5 / FR-7.5
    resolution: {
      summary:      { type: String, maxlength: 2000, default: null },
      recordedAt:   { type: Date, default: null },
      recordedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    // FR-6.6 — closure.closedAt starts the NFR-4.2 retention clock.
    closure: {
      reason:     { type: String, maxlength: 1000, default: null },
      closedAt:   { type: Date, default: null },
      closedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },

    statusChangedAt: { type: Date, required: true },
    dueAt:           { type: Date, default: null },   // FR-8.3

    // DEC-014 / DEC-015 — optimistic concurrency, exposed as ETag "v<version>".
    version: { type: Number, required: true, default: 0, min: 0 },

    anonymisedAt: { type: Date, default: null },     // NFR-4.2 / PROC-001

    ...lastActor(),
  },
  {
    collection: 'requests',
    versionKey: false,        // Mongoose __v replaced by the explicit `version` field
    strict: 'throw',
    timestamps: { createdAt: false, updatedAt: 'updatedAt' },
  },
);

// Indexes — each justified against a named query (NFR-2.6, CON-018; CR-004). campusId leads (SCP-019).
requestSchema.index({ reference: 1 }, { unique: true });                              // FR-2.6, FR-4.3
requestSchema.index({ campusId: 1, requesterId: 1, submittedAt: -1 });                // FR-3.1, FR-3.2
requestSchema.index({ campusId: 1, status: 1, submittedAt: -1 });                     // FR-4.4, FR-4.5, FR-8.1
requestSchema.index({ campusId: 1, categoryId: 1, assigneeId: 1, status: 1 });       // FR-4.1, FR-4.6, FR-8.2
requestSchema.index({ campusId: 1, assigneeId: 1, status: 1 });                       // FR-4.4
requestSchema.index({ campusId: 1, submittedAt: 1, categoryId: 1 });                  // FR-4.4, FR-8.5
requestSchema.index({ description: 'text', location: 'text' }, { weights: { description: 2 } }); // FR-4.3

export default mongoose.models.Request || mongoose.model('Request', requestSchema);
