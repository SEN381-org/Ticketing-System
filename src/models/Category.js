/**
 * Controlled request category (reference data). Deactivated, never deleted.
 * Traces to: FR-1.5 (isSecurity, CFL-002), FR-2.3, FR-8.3, FR-8.4, FR-9.1, FR-9.2, SCP-002.
 * Authoritative definition: docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md §3.8.
 */

import mongoose from 'mongoose';
import { campusRef } from './_shared.js';

const { Schema } = mongoose;

const categorySchema = new Schema(
  {
    campusId:              campusRef(),
    code:                  { type: String, required: true, maxlength: 40 },
    name:                  { type: String, required: true, maxlength: 100 },
    isSecurity:            { type: Boolean, default: false },
    targetResolutionHours: { type: Number, min: 1, default: null },   // FR-8.4 Proposed (OI-02)
    active:                { type: Boolean, default: true },
  },
  { collection: 'categories', versionKey: false, strict: 'throw', timestamps: true },
);

categorySchema.index({ campusId: 1, code: 1 }, { unique: true });

export default mongoose.models.Category || mongoose.model('Category', categorySchema);
