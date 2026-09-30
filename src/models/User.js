/**
 * Identity. Traces to: FR-1.1, FR-1.2, FR-1.4, FR-1.6, FR-4.6, FR-5.2, NFR-2.7, NFR-3.1, SCP-019.
 * Authoritative definition: docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md §3.7.
 */

import mongoose from 'mongoose';
import { ROLE, campusRef } from './_shared.js';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    campusId:     campusRef(),
    email:        { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    displayName:  { type: String, required: true, maxlength: 100 },
    passwordHash: { type: String, required: true, select: false },   // NFR-3.1: encoded slow hash only
    // FR-1.2 / AC-FR-1.2 — one or more roles from the controlled set; an empty set is rejected.
    roles: {
      type: [{ type: String, enum: Object.values(ROLE) }],
      validate: { validator: (v) => Array.isArray(v) && v.length >= 1, message: 'A role is required' },
    },
    groupIds:               [{ type: Schema.Types.ObjectId, ref: 'Group' }],     // FR-1.6
    categoryAuthorisations: [{ type: Schema.Types.ObjectId, ref: 'Category' }],  // FR-4.6, FR-5.2
    status:       { type: String, enum: ['active', 'revoked'], default: 'active' }, // FR-1.4
    revokedAt:    { type: Date, default: null },
    // FR-1.4 "existing sessions are terminated": revocation increments this; sessions carrying
    // an older value are refused. Sessions live in a MongoDB-backed store (NFR-2.7).
    sessionEpoch: { type: Number, default: 0 },
  },
  { collection: 'users', versionKey: false, strict: 'throw', timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });                                      // FR-1.1

export default mongoose.models.User || mongoose.model('User', userSchema);
