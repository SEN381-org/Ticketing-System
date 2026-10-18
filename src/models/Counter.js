/**
 * Technical counter for the request reference sequence.
 *
 * Traces to: FR-2.6, DB-01 (Data and Persistence Baseline v0.3 §3.8, `counters`).
 *
 * One document per year: `_id` is 'request-ref:<yyyy>' and `seq` is the last
 * number issued. The sequence is not per campus because the reference is unique
 * across all requests (FR-2.6) and CC-yyyy-nnnnnn carries no campus; SCP-019
 * (multi-campus) is deferred. It is incremented with `$inc` inside the create
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
