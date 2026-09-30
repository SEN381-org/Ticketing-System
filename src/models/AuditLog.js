/**
 * Accountability record (DEC-016 purpose B). Written below the application by the Atlas
 * trigger (scripts/atlas/app/) and, for authentication and access events, by the
 * application with an insert-only credential. The application never updates or deletes it.
 *
 * Traces to: CON-015, NFR-1.4, NFR-1.9, NFR-3.6, NFR-4.5, DEC-015, DEC-016.
 * Authoritative definition: docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md §3.6.
 *
 * Minimisation rule M-1: field NAMES and status values only — never description, location,
 * comment body or other free text.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    eventId:        { type: String, required: true },   // change-event _id._data, or UUID for auth/access events
    origin:         { type: String, required: true, enum: ['trigger', 'auth', 'access'] },
    eventType:      { type: String, required: true },
    campusId:       { type: Schema.Types.ObjectId, default: null },
    collectionName: { type: String, default: null },
    documentId:     { type: Schema.Types.ObjectId, default: null },
    requestId:      { type: Schema.Types.ObjectId, default: null },
    actorId:        { type: Schema.Types.ObjectId, default: null },
    actorRole:      { type: String, default: null },
    actorSource:    { type: String, enum: ['document', 'unattributed', 'session'], required: true },
    changedFields:  { type: [String], default: [] },
    fromStatus:     { type: String, default: null },
    toStatus:       { type: String, default: null },
    outcome:        { type: String, default: null },
    occurredAt:     { type: Date, required: true },
    recordedAt:     { type: Date, required: true },
  },
  { collection: 'auditLog', versionKey: false, strict: 'throw' },
);

auditLogSchema.index({ eventId: 1 }, { unique: true });                              // at-least-once trigger → idempotent
auditLogSchema.index({ requestId: 1, occurredAt: 1 });                                // NFR-3.6, NFR-4.5
auditLogSchema.index({ recordedAt: 1 }, { expireAfterSeconds: 92 * 24 * 3600 });      // NFR-1.4 ≥ 90 days (DEC-016)

export default mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
