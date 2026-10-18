/**
 * Aggregation over `requests` for the management view (M4).
 * Traces to: FR-8.1, FR-8.2, FR-8.3, FR-8.5, FR-8.6, OI-14, DEC-015 Addendum A (A6).
 *
 * Aggregated on `requests`, not on `reportingCounts` (OI-14: the projection has
 * no reconciliation path). Nothing is projected out of a request except the
 * identifier, reference, category, status and submission time, so no description,
 * location, comment or action can reach the response (FR-8.6).
 *
 * The match uses the existing { campusId, submittedAt, categoryId } and
 * { campusId, status, submittedAt } indexes; no index is added.
 */

import mongoose from 'mongoose';
import Request from '../models/Request.js';

const toId = (v) => new mongoose.Types.ObjectId(String(v));

/** @param {{campusId: any, from?: Date, to?: Date, categoryId?: string}} filter */
export function buildMatch({ campusId, from, to, categoryId }) {
  const match = { campusId: toId(campusId) };
  if (categoryId) match.categoryId = toId(categoryId);                       // FR-8.5
  if (from || to) {                                                          // FR-8.5
    match.submittedAt = {};
    if (from) match.submittedAt.$gte = from;
    if (to) match.submittedAt.$lte = to;
  }
  return match;
}

export const reportRepository = {
  /** @returns {Promise<{status: string, categoryId: any, count: number}[]>} */
  countByStatusAndCategory: async (filter) => {
    const rows = await Request.aggregate([
      { $match: buildMatch(filter) },
      { $group: { _id: { status: '$status', categoryId: '$categoryId' }, count: { $sum: 1 } } },
    ]);
    return rows.map((r) => ({ status: r._id.status, categoryId: r._id.categoryId, count: r.count }));
  },

  /** Requests not in `closedStatuses` (the service decides what is open), for FR-8.3. */
  findOpen: (filter, closedStatuses) =>
    Request.find({ ...buildMatch(filter), status: { $nin: closedStatuses } })
      .select('reference categoryId status submittedAt').lean(),
};
