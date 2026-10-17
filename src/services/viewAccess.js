/**
 * The refusal a failed object-level view check becomes.
 *
 * Traces to: FR-3.6, FR-1.5, DEC-012 (enforcement point 2), DEC-015 §4.
 *
 * Same mapping as GET /requests/:id (requestQueryService): a Requester asking
 * for another user's request gets the 404 of a missing id, so existence is not
 * disclosed (FR-3.6); anyone else refused gets 403. Kept here so the history
 * and work-record services refuse exactly as the read does.
 */

import { mayViewRequest, STAFF_ROLES } from '../domain/accessRules.js';
import { AuthorisationError, NotFoundError } from '../errors.js';
import { ROLE } from '../models/_shared.js';

export const isStaffActor = (actor) => (actor?.roles ?? []).some((r) => STAFF_ROLES.includes(r));

export function assertMayView(request, actor, requestId) {
  if (mayViewRequest(request, actor)) return;
  if ((actor?.roles ?? []).includes(ROLE.REQUESTER) && !isStaffActor(actor)) {
    throw new NotFoundError(requestId);
  }
  throw new AuthorisationError('Actor may not view this request');
}
