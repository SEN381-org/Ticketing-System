/**
 * CategoryService — the category list for the submission form.
 *
 * Traces to: FR-2.3, FR-8.4, FR-9.1, DEC-012, DEC-015 Addendum A1, DEC-014.
 *
 * Returns the active categories of the actor's campus as { id, code, name,
 * isSecurity }, which is all the form needs. The resolution target is returned,
 * as `targetResolutionHours` (null where none is set), only to an actor who may set
 * it (category:set-target, the Manager, FR-8.4) or administer categories
 * (category:administer, the Administrator, FR-9.1); no one else sees it.
 */

import { mayPerformOperation } from '../domain/accessRules.js';
import { campusOf } from './campusOf.js';

export function createCategoryService({ categories }) {
  async function listActive(actor) {
    const found = await categories.listActive(campusOf(actor));      // the session actor's campus
    const seesTarget = mayPerformOperation('category:set-target', actor)
      || mayPerformOperation('category:administer', actor);
    return found.map((c) => ({
      id: String(c._id), code: c.code, name: c.name, isSecurity: Boolean(c.isSecurity),
      ...(seesTarget ? { targetResolutionHours: c.targetResolutionHours ?? null } : {}),
    }));
  }

  return { listActive };
}
