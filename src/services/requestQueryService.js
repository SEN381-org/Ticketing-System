/**
 * RequestQueryService — read side for a single request.
 *
 * Traces to: FR-4.2, AC-FR-4.2, AC-FR-7.5, FR-1.5, FR-3.5, FR-3.6, TD-003, DEC-012
 * (enforcement points 2 and 3), DEC-014, DEC-015 §1, §4 and §6.
 *
 * Provisional: FR-4.2 is Proposed, not baselined (OI-01).
 *
 * Who may read at all is unchanged (mayViewRequest). What a permitted viewer
 * receives is additive (DEC-015 §6):
 *   always        id, reference, status, version, categoryId, submittedAt,
 *                 assigneeId, location, permittedTransitions
 *   FR-1.5        description, resolution, closureReason: on a security-category
 *                 request only a Security Officer (a requester on their own
 *                 security request does not, OI-16 open); otherwise every viewer
 *   staff only    submittedById, requesterId
 * The status is passed through visibleStatusFor, so a requester never learns the
 * internal status of a security-category request (FR-3.5). Comments, actions and
 * history are not embedded: GET /requests/{id}/history serves them.
 */

import {
  mayViewRequest, mayViewRestrictedDetail, mayViewPeople, visibleStatusFor, STAFF_ROLES,
} from '../domain/accessRules.js';
import { permittedTransitionsFor } from '../domain/permittedTransitions.js';
import { AuthorisationError, NotFoundError } from '../errors.js';
import { ROLE } from '../models/_shared.js';

export function createRequestQueryService({ requests }) {
  async function getRequest(requestId, actor) {
    const request = await requests.findById(requestId);
    if (!request) throw new NotFoundError(requestId);

    if (!mayViewRequest(request, actor)) {
      const roles = actor?.roles ?? [];
      const isStaff = roles.some((r) => STAFF_ROLES.includes(r));
      // DEC-015 §4 row 404 / FR-3.6: a Requester (holding no staff role) asking for
      // another user's request gets the same 404 as a missing id, so existence is
      // not disclosed. Anyone else refused gets 403.
      if (roles.includes(ROLE.REQUESTER) && !isStaff) throw new NotFoundError(requestId);
      // DEC-015 does not specify this case; the project lead chose 403 for
      // consistency with the service layer. 404 may be revisited when security
      // categories land.
      throw new AuthorisationError('Actor may not view this request');
    }

    const view = {
      id:          String(request._id ?? requestId),
      reference:   request.reference,
      status:      visibleStatusFor(request.status, Boolean(request.securityCategory), actor),
      version:     request.version,
      categoryId:  request.categoryId == null ? null : String(request.categoryId),
      submittedAt: request.submittedAt ?? null,
      assigneeId:  request.assigneeId == null ? null : String(request.assigneeId),
      location:    request.location ?? null,
      permittedTransitions: permittedTransitionsFor(request, actor),
    };

    // FR-1.5: withheld, not blanked, so the key is absent for a viewer who may not see it.
    if (mayViewRestrictedDetail(request, actor)) {
      view.description = request.description ?? null;
      view.resolution = {
        summary:    request.resolution?.summary ?? null,
        recordedAt: request.resolution?.recordedAt ?? null,
      };
      view.closureReason = request.closure?.reason ?? null;
    }
    if (mayViewPeople(actor)) {
      view.submittedById = request.submittedById == null ? null : String(request.submittedById);
      view.requesterId = request.requesterId == null ? null : String(request.requesterId);
    }
    return view;
  }

  return { getRequest };
}
