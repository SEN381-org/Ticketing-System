/**
 * Service request.
 * Traces to: FR-2.1, FR-6.1, SCP-001, SCP-008.
 */

import mongoose from 'mongoose';
import { STATUS } from '../domain/requestStatus.js';

const requestSchema = new mongoose.Schema(
  {
    title:          { type: String, required: true, trim: true, maxlength: 200 },
    description:    { type: String, required: true, maxlength: 5000 },
    category:       { type: String, required: true },
    securityFlagged:{ type: Boolean, default: false },       // CFL-002 / FR-1.5
    status:         { type: String, required: true, enum: Object.values(STATUS), default: STATUS.SUBMITTED, index: true },
    reporterId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    departmentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
    assigneeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdAt:      { type: Date, default: () => new Date() },
    statusChangedAt:{ type: Date, default: () => new Date() },
  },
  { versionKey: false },
);

export default mongoose.models.Request || mongoose.model('Request', requestSchema);
