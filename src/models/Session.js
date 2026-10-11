/**
 * Server-side session. Traces to: FR-1.1, FR-1.4, NFR-2.7, NFR-3.4, SCP-019, DEC-018.
 * Authoritative definition: docs/architecture/data/Data_and_Persistence_Baseline_v0.3.md §3.9.
 *
 * `_id` is the SHA-256 of the cookie value. The raw identifier is never stored, so a
 * read of this collection (a backup, a log, a compromised read credential) yields
 * nothing that can be presented as a cookie.
 *
 * The TTL index on `lastSeenAt` is cleanup only. The TTL monitor runs about once a
 * minute, so expiry is enforced by the auth service's own comparison (DEC-018 §3).
 * Roles and authorisations are deliberately absent: they are read from `users` on
 * every request, so a change takes effect at the next one (FR-1.4, FR-1.6).
 */

import mongoose from 'mongoose';
import { campusRef } from './_shared.js';

const { Schema } = mongoose;

export const SESSION_IDLE_LIMIT_SECONDS = 30 * 60;   // NFR-3.4

const sessionSchema = new Schema(
  {
    _id:          { type: String },
    campusId:     campusRef(),
    userId:       { type: Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
    sessionEpoch: { type: Number, required: true, immutable: true },   // FR-1.4
    createdAt:    { type: Date, required: true, immutable: true },
    lastSeenAt:   { type: Date, required: true },                       // NFR-3.4
  },
  { collection: 'sessions', versionKey: false, strict: 'throw' },
);

sessionSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: SESSION_IDLE_LIMIT_SECONDS });

export default mongoose.models.Session || mongoose.model('Session', sessionSchema);
