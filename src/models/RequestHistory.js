/**
 * Immutable history of status, assignment, comment, action, detail and resolution changes.
 *
 * Traces to: FR-2.4, FR-2.5, FR-5.4, FR-6.3, FR-6.7, FR-7.1–7.5, AC-FR-6.7, SCP-008,
 *            SCP-019, DEC-014 (idempotency), DEC-015, constraint DB-01.
 * Authoritative definition: docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md §3.3–§4.
 *
 * Append-only is enforced in three layers (DB-01). This file is layer 2: it refuses every
 * mutation that passes through Mongoose — query, document and bulkWrite middleware. It does
 * NOT stop `RequestHistory.collection.*` (the native driver); only layer 3, the Atlas role
 * that grants the application user find + insert on this collection, stops that. The single
 * sanctioned mutation is PROC-001 anonymisation, run under a separate temporary credential.
 */

import mongoose from 'mongoose';
import { STATUS, campusRef } from './_shared.js';

const { Schema } = mongoose;

/** Fields nulled only by PROC-001 (NFR-4.2, DEC-016). */
export const HISTORY_PERSONAL_FIELDS = Object.freeze(['body', 'actorId', 'fromAssigneeId', 'toAssigneeId']);

const STATUS_OR_NULL = [...Object.values(STATUS), null];

const requestHistorySchema = new Schema(
  {
    campusId:  campusRef(),
    requestId: { type: Schema.Types.ObjectId, ref: 'Request', required: true, immutable: true },

    // The request version this entry produced. Unique per request, so the database refuses
    // two entries claiming the same successor state (storage backstop for A2 §3.4's race).
    requestVersion: { type: Number, required: true, min: 1, immutable: true },

    changeType: {
      type: String, required: true, immutable: true,
      enum: ['created', 'status', 'assignment', 'comment', 'action', 'detail', 'resolution'],
    },
    fromStatus:     { type: String, enum: STATUS_OR_NULL, default: null, immutable: true },
    toStatus:       { type: String, enum: STATUS_OR_NULL, default: null, immutable: true },
    fromAssigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    toAssigneeId:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    body:           { type: String, maxlength: 5000, default: null },

    actorId:    { type: Schema.Types.ObjectId, ref: 'User', default: null },   // required at insert (pre-validate)
    actorRole:  { type: String, required: true, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },

    // DEC-014 — idempotency key and fingerprint of the originating HTTP request.
    idempotencyKey:         { type: String, default: null, immutable: true, maxlength: 64 },
    idempotencyFingerprint: { type: String, default: null, immutable: true },

    anonymisedAt: { type: Date, default: null },
  },
  { collection: 'requestHistory', versionKey: false, strict: 'throw' },
);

requestHistorySchema.index({ requestId: 1, requestVersion: 1 }, { unique: true });   // FR-3.3, FR-7.4; integrity
requestHistorySchema.index(                                                           // DEC-014 idempotency
  { actorId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

requestHistorySchema.pre('validate', function requireActorOnInsert(next) {
  if (this.isNew && !this.actorId) return next(new Error('requestHistory: actorId is required at insert'));
  return next();
});

/** An existing document may never be re-saved. FR-6.7. */
requestHistorySchema.pre('save', function guardResave(next) {
  if (!this.isNew) return next(new Error('AppendOnlyViolation: a requestHistory entry may not be modified'));
  return next();
});

/** Every query-level and document-level mutation is refused. FR-6.7. */
const BLOCKED_OPERATIONS = [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace',
  'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete',
];
for (const operation of BLOCKED_OPERATIONS) {
  requestHistorySchema.pre(operation, function guardMutation(next) {
    next(new Error(`AppendOnlyViolation: '${operation}' is not permitted on requestHistory`));
  });
}

/** Model-level bulkWrite: without this, bulkWrite bypasses every hook above (R-11). Inserts pass. */
requestHistorySchema.pre('bulkWrite', function guardBulk(next, ops) {
  const mutating = (ops ?? []).some((op) => !('insertOne' in op));
  next(mutating ? new Error('AppendOnlyViolation: mutating bulkWrite is not permitted on requestHistory') : undefined);
});

export const BLOCKED_HISTORY_OPERATIONS = Object.freeze([...BLOCKED_OPERATIONS, 'bulkWrite (non-insert)']);
export const requestHistorySchemaDefinition = requestHistorySchema;
export default mongoose.models.RequestHistory
  || mongoose.model('RequestHistory', requestHistorySchema);
