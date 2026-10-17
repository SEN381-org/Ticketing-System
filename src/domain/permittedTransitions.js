/**
 * The transitions an actor may make on a request, as data for the request detail.
 *
 * Traces to: TD-003, FR-4.2 (provisional, OI-01), FR-6.2, FR-6.4, FR-6.5, FR-6.6,
 *            DEC-012, DEC-015 §6.
 *
 * No rule is stated here. Each edge comes from TRANSITIONS, each is kept only if
 * checkTransition allows it for the actor's roles, and the object-level rule
 * mayActOnRequest is applied first, exactly as statusTransitionService applies
 * them. tests/requestRead.test.js proves, for every status and role, that this list
 * and checkTransition agree, so a client that offers only these moves can never
 * offer one the transition route would refuse for role or edge. (The reason and the
 * resolution are still the actor's to supply: requiresReason and requiresResolution
 * say so.)
 */

import { TRANSITIONS, REASON_REQUIRED, checkTransition } from './requestStatus.js';
import { mayActOnRequest } from './accessRules.js';

/**
 * @param {{status: string, securityCategory?: boolean}} request
 * @param {{roles?: string[]}} actor
 * @returns {{toStatus: string, requiresReason: boolean, requiresResolution: boolean}[]}
 */
export function permittedTransitionsFor(request, actor) {
  if (!mayActOnRequest(request, actor)) return [];
  const securityCategory = Boolean(request.securityCategory);
  return (TRANSITIONS[request.status] ?? [])
    .filter((move) => checkTransition(request.status, move.to, actor.roles, {
      securityCategory, hasResolution: true, hasReason: true,
    }).allowed)
    .map((move) => ({
      toStatus:           move.to,
      requiresReason:     REASON_REQUIRED.includes(move.to),
      requiresResolution: move.requiresResolution === true,
    }));
}
