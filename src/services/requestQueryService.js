/**
 * RequestQueryService — read side for a single request.
 *
 * Traces to: FR-4.2 (provisional, OI-01), FR-3.5, FR-3.6, DEC-012 (enforcement
 * points 2 and 3), DEC-014, DEC-015 §1 and §4.
 *
 * Provisional: FR-4.2 is Proposed, not baselined (OI-01).
 *
 * The result is exactly { reference, status, version }. The status is passed
 * through visibleStatusFor, so a requester never learns the internal status of a
 * security-category request (FR-3.5).
 */

import { mayViewRequest, visibleStatusFor, STAFF_ROLES } from '../domain/accessRules.js';
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

    return {
      reference: request.reference,
      status:    visibleStatusFor(request.status, Boolean(request.securityCategory), actor),
      version:   request.version,
    };
  }

  return { getRequest };
}
