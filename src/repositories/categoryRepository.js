/**
 * Persistence access for categories (reference data). Read only here.
 * Traces to: FR-2.3, FR-9.1 (a deactivated category is not selectable), DB-01 §3.8.
 *
 * Both reads are scoped to a campus (SCP-019) and to active categories, so a
 * category of another campus, or a deactivated one, is simply absent.
 */

import Category from '../models/Category.js';

export const categoryRepository = {
  listActive: (campusId) =>
    Category.find({ campusId, active: true }).sort({ name: 1, code: 1 }).lean(),

  /** @param {string} id a well-formed ObjectId string; the caller has already checked the form */
  findActiveById: (campusId, id, { session } = {}) =>
    Category.findOne({ _id: id, campusId, active: true }).session(session ?? null).lean(),
};
