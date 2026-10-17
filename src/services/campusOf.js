/**
 * The campus an actor works in — SCP-019 (every collection is campus-scoped).
 *
 * The session actor may carry `campusId`; if it does not, it is read from the
 * actor's user document, so the M4 services do not depend on the session shape.
 * An actor whose campus cannot be established is refused.
 */

import { AuthorisationError } from '../errors.js';

export async function campusOf(actor, users) {
  const campusId = actor?.campusId ?? await users.findCampusId(actor?.id);
  if (!campusId) throw new AuthorisationError('The actor has no campus');
  return campusId;
}
