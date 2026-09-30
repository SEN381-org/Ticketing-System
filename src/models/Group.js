/**
 * User group with authorisation (FR-1.6, CON-019 user grouping).
 * Authoritative definition: docs/architecture/data/Data_and_Persistence_Baseline_v0.2.md §3.7.
 */

import mongoose from 'mongoose';
import { campusRef } from './_shared.js';

const { Schema } = mongoose;

const groupSchema = new Schema(
  {
    campusId:               campusRef(),
    name:                   { type: String, required: true, maxlength: 100 },
    permissions:            { type: [String], default: [] },
    categoryAuthorisations: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    active:                 { type: Boolean, default: true },
  },
  { collection: 'groups', versionKey: false, strict: 'throw', timestamps: true },
);

groupSchema.index({ campusId: 1, name: 1 }, { unique: true });

export default mongoose.models.Group || mongoose.model('Group', groupSchema);
