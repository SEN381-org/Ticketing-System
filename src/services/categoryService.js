/**
 * CategoryService — the category list for the submission form.
 *
 * Traces to: FR-2.3, FR-9.1, DEC-015 Addendum A1, DEC-014.
 *
 * Returns the active categories of the actor's campus as { id, code, name,
 * isSecurity }, which is all the form needs. Nothing else on the category (such
 * as a target time) leaves the service.
 */

import { campusOf } from './campusOf.js';

export function createCategoryService({ categories }) {
  async function listActive(actor) {
    const found = await categories.listActive(campusOf(actor));      // the session actor's campus
    return found.map((c) => ({
      id: String(c._id), code: c.code, name: c.name, isSecurity: Boolean(c.isSecurity),
    }));
  }

  return { listActive };
}
