/**
 * Persistence access for categories (M4). Traces to: FR-8.3, FR-8.4, FR-9.1,
 * FR-9.2, SCP-019, DEC-015 Addendum A (A7, A8).
 *
 * Categories are deactivated, never deleted (FR-9.2): there is no delete here.
 * Every read is campus-scoped.
 */

import Category from '../models/Category.js';

export const categoryRepository = {
  /** All categories of the campus, deactivated ones included (AC-FR-9.2). */
  listAll: (campusId) => Category.find({ campusId }).lean(),

  findById: (id, campusId) => Category.findOne({ _id: id, campusId }).lean(),

  /** FR-8.4. The schema enforces `min: 1`; runValidators makes the update honour it. */
  setTarget: async (id, campusId, targetResolutionHours) => {
    const { matchedCount } = await Category.updateOne(
      { _id: id, campusId }, { $set: { targetResolutionHours } }, { runValidators: true });
    return matchedCount > 0;
  },

  /** FR-9.1. Conditional on `active`, so a repeat matches nothing and changes nothing. */
  deactivate: async (id, campusId) => {
    const { modifiedCount } = await Category.updateOne(
      { _id: id, campusId, active: true }, { $set: { active: false } });
    return modifiedCount > 0;
  },
};
