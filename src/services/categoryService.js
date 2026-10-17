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
 *
 * The Administrator (category:administer) also receives the deactivated categories
 * (FR-9.2 keeps them on record), each with `active`; every other caller, the New request
 * form's included, receives active categories only and no `active` key (FR-2.3).
 * Names are sorted A-Z ignoring case, here and not in the query, because the store's
 * binary order puts upper case before lower.
 */

import { mayPerformOperation } from '../domain/accessRules.js';
import { campusOf } from './campusOf.js';

export function createCategoryService({ categories }) {
  async function listActive(actor) {
    const administers = mayPerformOperation('category:administer', actor);
    const campusId = campusOf(actor);                                // the session actor's campus
    const found = administers ? await categories.listAll(campusId) : await categories.listActive(campusId);
    const seesTarget = mayPerformOperation('category:set-target', actor) || administers;
    return found
      .map((c) => ({
        id: String(c._id), code: c.code, name: c.name, isSecurity: Boolean(c.isSecurity),
        ...(administers ? { active: Boolean(c.active) } : {}),
        ...(seesTarget ? { targetResolutionHours: c.targetResolutionHours ?? null } : {}),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.code.localeCompare(b.code));
  }

  return { listActive };
}
