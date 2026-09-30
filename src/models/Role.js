/**
 * Controlled role set and its permissions (FR-1.2, DEC-004). Seeded by migration from the
 * single rule set in src/middleware/authorise.js (DEC-012); the collection is the runtime
 * copy that groups (FR-1.6) can reference. Changed only by migration.
 * Authoritative definition: docs/architecture/data/Data_and_Persistence_Baseline_v0.2.md §3.7.
 */

import mongoose from 'mongoose';
import { ROLE } from './_shared.js';

const { Schema } = mongoose;

const roleSchema = new Schema(
  {
    code:        { type: String, required: true, enum: Object.values(ROLE) },
    permissions: { type: [String], required: true },   // operation keys, e.g. 'request:transition'
  },
  { collection: 'roles', versionKey: false, strict: 'throw' },
);

roleSchema.index({ code: 1 }, { unique: true });

export default mongoose.models.Role || mongoose.model('Role', roleSchema);
