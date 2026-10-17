/**
 * Technical counter for the request reference sequence.
 *
 * Traces to: FR-2.6, DB-01 (Data and Persistence Baseline v0.3 §3.8, `counters`).
 *
 * One document per campus and year: `_id` is 'request-ref:<campusId>:<yyyy>' and `seq`
 * is the last number issued. It is incremented with `$inc` inside the create
 * transaction (DEC-016), so a rolled-back submission gives its number back and a
 * committed one can never be issued twice. Permanent; never deleted.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const counterSchema = new Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, min: 0, default: 0 },
  },
  { collection: 'counters', versionKey: false, strict: 'throw' },
);

export default mongoose.models.Counter || mongoose.model('Counter', counterSchema);
