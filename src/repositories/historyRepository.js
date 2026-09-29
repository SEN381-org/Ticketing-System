/**
 * Persistence access for request history.
 *
 * Traces to: FR-6.3, FR-6.7, AC-FR-6.7.
 *
 * The interface exposes append and read only. No mutating operation is offered
 * to callers, and the schema refuses one if it were reached by another route.
 * Immutability is enforced in two places rather than one because AC-FR-6.7 is
 * a property of the record, not of the caller's discipline.
 */
import RequestHistory from '../models/RequestHistory.js';

export const historyRepository = {
  append: (entry) => RequestHistory.create(entry),
  listForRequest: (requestId) =>
    RequestHistory.find({ requestId }).sort({ occurredAt: 1 }).lean(),
};
