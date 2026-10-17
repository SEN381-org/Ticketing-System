/**
 * Persistence access for the request reference sequence.
 * Traces to: FR-2.6, DB-01 §3.8 (`counters`), DEC-016.
 *
 * The `$inc` takes the session so it joins the create transaction: the number is
 * issued atomically and is returned if the transaction aborts.
 */

import Counter from '../models/Counter.js';

export const counterRepository = {
  /** @returns {Promise<number>} the next number for this campus and year, starting at 1 */
  next: async (campusId, year, { session } = {}) => {
    const counter = await Counter.findOneAndUpdate(
      { _id: `request-ref:${campusId}:${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, session, setDefaultsOnInsert: true },
    ).lean();
    return counter.seq;
  },
};
