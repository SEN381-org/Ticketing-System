/**
 * In-application notification — derived read model written by NotificationSubscriber
 * after commit (DEC-011). Traces to: FR-3.4, FR-3.5, SCP-004, DEC-017 (purpose A).
 * Authoritative definition: docs/architecture/data/Data_and_Persistence_Baseline_v0.2.md §3.4.
 */

import mongoose from 'mongoose';
import { campusRef } from './_shared.js';

const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    campusId:         campusRef(),
    userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestId:        { type: Schema.Types.ObjectId, ref: 'Request', required: true },
    requestReference: { type: String, required: true },                 // FR-3.4 "identifying the request"
    kind:             { type: String, required: true, enum: ['accepted', 'rejected', 'updated', 'completed'] },
    // FR-3.5 — the status as the requester may see it (security-category requests mapped
    // to Received / In Progress / Closed before storage), never the internal value.
    displayStatus:    { type: String, required: true },
    sourceHistoryId:  { type: Schema.Types.ObjectId, ref: 'RequestHistory', required: true },
    read:             { type: Boolean, default: false },
    createdAt:        { type: Date, required: true },
  },
  { collection: 'notifications', versionKey: false, strict: 'throw' },
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });                        // FR-3.4
notificationSchema.index({ sourceHistoryId: 1, userId: 1 }, { unique: true });           // subscriber idempotency
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });      // DEC-017 purpose A

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
