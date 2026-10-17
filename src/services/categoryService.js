/**
 * CategoryService — the category list for the submission form.
 *
 * Traces to: FR-2.3, FR-9.1, DEC-015 Addendum A1, DEC-014.
 *
 * Returns the active categories of the actor's campus as { id, code, name,
 * isSecurity }, which is all the form needs. Nothing else on the category (such
 * as a target time) leaves the service.
 */

import { AuthorisationError } from '../errors.js';

export function createCategoryService({ categories, users }) {
  async function listActive(actor) {
    const user = await users.findById(actor.id);
    if (!user) throw new AuthorisationError('Actor may not list categories');
    const found = await categories.listActive(user.campusId);
    return found.map((c) => ({
      id: String(c._id), code: c.code, name: c.name, isSecurity: Boolean(c.isSecurity),
    }));
  }

  return { listActive };
}
