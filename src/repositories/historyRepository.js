/**
 * Persistence access for request history.
 *
 * Traces to: FR-3.3, FR-6.3, FR-6.7, FR-7.4, AC-FR-6.7, DEC-014, DEC-015,
 *            constraint DB-01.
 *
 * This is layer 1 of the three-layer append-only enforcement in the data
 * baseline §4: the interface exposes append and read only, so no caller inside
 * the application can reach for an update. Layer 2 is the schema middleware in
 * src/models/RequestHistory.js. Layer 3 is the Atlas role granting the
 * application user find and insert only, and it is the only layer that stops
 * `Model.collection.*`; it is verified at M3 against a test cluster.
 *
 * Review comment R-12: the timeline is ordered by `requestVersion`, which is the
 * unique-indexed successor state, not by `occurredAt`. Two entries can share a
 * clock reading; they cannot share a version.
 */

import RequestHistory from '../models/RequestHistory.js';

export const historyRepository = {
  /** Array form is required when passing options, so the insert joins the transaction (R-14). */
  append: async (entry, { session } = {}) => {
    const [created] = await RequestHistory.create([entry], { session });
    return created;
  },

  listForRequest: (requestId, { session } = {}) =>
    RequestHistory.find({ requestId })
      .sort({ requestVersion: 1 })
      .session(session ?? null)
      .lean(),

  /** DEC-014 — replay detection before any write is attempted. */
  findByIdempotencyKey: (actorId, idempotencyKey) =>
    RequestHistory.findOne({ actorId, idempotencyKey }).lean(),
};
