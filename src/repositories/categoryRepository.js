/**
 * Persistence access for categories (reference data).
 * Traces to: FR-2.3, FR-8.3, FR-8.4, FR-9.1 (a deactivated category is not
 * selectable), FR-9.2, SCP-019, DB-01 §3.8, DEC-015 Addendum A (A1, A7, A8).
 *
 * Every read is scoped to a campus (SCP-019). The submission reads (FR-2.3) also
 * require `active`, so a category of another campus, or a deactivated one, is
 * simply absent. Categories are deactivated, never deleted (FR-9.2): there is no
 * delete here.
 */

import Category from '../models/Category.js';

export const categoryRepository = {
  // ----- submission and the category list (FR-2.3, A1) -----

  listActive: (campusId) =>
    Category.find({ campusId, active: true }).sort({ name: 1, code: 1 }).lean(),

  /** @param {string} id a well-formed ObjectId string; the caller has already checked the form */
  findActiveById: (campusId, id, { session } = {}) =>
    Category.findOne({ _id: id, campusId, active: true }).session(session ?? null).lean(),

  // ----- management and administration (FR-8.3, FR-8.4, FR-9.1, FR-9.2, A7, A8) -----

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
