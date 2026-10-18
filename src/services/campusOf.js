/**
 * The campus an actor works in - SCP-019 (every collection is campus-scoped).
 *
 * The session actor carries `campusId` (authService.resolve, DEC-018 §4), so no
 * service re-reads the user for it. An actor without a campus is refused.
 */

import { AuthorisationError } from '../errors.js';

export function campusOf(actor) {
  const campusId = actor?.campusId;
  if (!campusId) throw new AuthorisationError('The actor has no campus');
  return campusId;
}
