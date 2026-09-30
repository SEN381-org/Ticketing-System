/**
 * Per-campus, per-category, per-status counts — a projection, rebuildable from `requests`.
 * Written by ReportingProjectionSubscriber (DEC-011) and the reconciliation job.
 * Traces to: FR-8.1, FR-8.2. Filtered views (FR-8.5) aggregate over `requests` instead.
 * Authoritative definition: docs/architecture/data/Data_and_Persistence_Baseline_v0.2.md §3.5.
 */

import mongoose from 'mongoose';
import { STATUS, campusRef } from './_shared.js';

const { Schema } = mongoose;

const reportingCountSchema = new Schema(
  {
    campusId:     campusRef(),
    categoryId:   { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    status:       { type: String, required: true, enum: Object.values(STATUS) },
    count:        { type: Number, required: true, default: 0, min: 0 },
    reconciledAt: { type: Date, default: null },
  },
  { collection: 'reportingCounts', versionKey: false, strict: 'throw' },
);

reportingCountSchema.index({ campusId: 1, categoryId: 1, status: 1 }, { unique: true }); // FR-8.1, FR-8.2

export default mongoose.models.ReportingCount || mongoose.model('ReportingCount', reportingCountSchema);
