/**
 * CategoryAdminService — target resolution time and deactivation.
 *
 * Traces to: FR-8.4, AC-FR-8.4, FR-9.1, AC-FR-9.1, FR-9.2, AC-FR-9.2, DEC-012
 *            (enforcement point 2), DEC-014, DEC-015 Addendum A (A7, A8).
 *
 * Deactivation changes `active` only. The category keeps its document, so requests
 * recorded against it keep their category and stay in the category counts (FR-9.2).
 * It is idempotent: a repeat changes nothing and is reported as a replay.
 */

import { mayPerformOperation } from '../domain/accessRules.js';
import { AuthorisationError, NotFoundError, ValidationError } from '../errors.js';
import { campusOf } from './campusOf.js';

const notFound = (id) =>
  Object.assign(new NotFoundError(id), { message: `Category '${id}' does not exist` });

export function createCategoryAdminService({ categories }) {
  /** FR-8.4 — stores the value the overdue calculation reads (AC-FR-8.4). */
  async function setTarget(categoryId, body, actor) {
    if (!mayPerformOperation('category:set-target', actor)) throw new AuthorisationError();
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('The body must be a JSON object');
    }
    const unknown = Object.keys(body).filter((k) => k !== 'targetResolutionHours');
    if (unknown.length > 0) throw new ValidationError(`Unknown field: ${unknown.join(', ')}`);
    const hours = body.targetResolutionHours;
    if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 1) {
      throw new ValidationError('targetResolutionHours must be a number of at least 1');
    }

    const campusId = campusOf(actor);
    if (!(await categories.setTarget(categoryId, campusId, hours))) throw notFound(categoryId);
    return { id: String(categoryId), targetResolutionHours: hours };
  }

  /** FR-9.1 — @returns {{id: string, active: false, replayed: boolean}} */
  async function deactivate(categoryId, actor) {
    if (!mayPerformOperation('category:administer', actor)) throw new AuthorisationError();
    const campusId = campusOf(actor);
    const category = await categories.findById(categoryId, campusId);
    if (!category) throw notFound(categoryId);

    const changed = category.active !== false && await categories.deactivate(categoryId, campusId);
    return { id: String(categoryId), active: false, replayed: !changed };
  }

  return { setTarget, deactivate };
}
