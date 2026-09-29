/**
 * Immutable history of status, assignment and comment changes.
 *
 * Traces to: FR-6.3 (history entry per change), FR-6.7 (immutable history),
 *            AC-FR-6.7, SCP-008, CON-007.
 *
 * Immutability is enforced as a property of the model rather than a promise of
 * the calling code: every mutating operation Mongoose exposes is refused at the
 * schema. The collection is append-only by construction, which is what AC-FR-6.7
 * requires and what an application-level convention could not guarantee.
 */

import mongoose from 'mongoose';

const requestHistorySchema = new mongoose.Schema(
  {
    requestId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true, index: true },
    changeType: { type: String, required: true, enum: ['status', 'assignment', 'comment'] },
    fromStatus: { type: String, default: null },
    toStatus:   { type: String, default: null },
    actorId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole:  { type: String, required: true },
    note:       { type: String, default: null },
    occurredAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false, minimize: false },
);

/** An existing document may never be re-saved. FR-6.7. */
requestHistorySchema.pre('save', function guardResave(next) {
  if (!this.isNew) {
    return next(new Error('AppendOnlyViolation: a requestHistory entry may not be modified'));
  }
  next();
});

/** Every query-level mutation is refused. FR-6.7. */
const BLOCKED_OPERATIONS = [
  'updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace',
  'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete',
];

for (const operation of BLOCKED_OPERATIONS) {
  requestHistorySchema.pre(operation, function guardMutation(next) {
    next(new Error(`AppendOnlyViolation: '${operation}' is not permitted on requestHistory`));
  });
}

export const BLOCKED_HISTORY_OPERATIONS = Object.freeze(BLOCKED_OPERATIONS);
export const requestHistorySchemaDefinition = requestHistorySchema;
export default mongoose.models.RequestHistory
  || mongoose.model('RequestHistory', requestHistorySchema);
