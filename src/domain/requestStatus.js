/**
 * Request status values and the transitions permitted between them.
 *
 * Traces to: FR-6.1 (status values), FR-6.2 (controlled transitions), SCP-008.
 *
 * The transition table is data, not control flow, so that the set of legal
 * transitions can be read and reviewed without reading the service that
 * applies it.
 */

export const STATUS = Object.freeze({
  SUBMITTED: 'Submitted',
  ACKNOWLEDGED: 'Acknowledged',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
});

/** Roles permitted to move a request out of each status. FR-6.4. */
const STAFF = Object.freeze(['Department Staff', 'Department Head', 'Administrator']);

/**
 * Permitted transitions, keyed by current status.
 * Each entry names the target status and the roles that may perform the move.
 */
export const TRANSITIONS = Object.freeze({
  [STATUS.SUBMITTED]:     [{ to: STATUS.ACKNOWLEDGED, roles: STAFF }],
  [STATUS.ACKNOWLEDGED]:  [{ to: STATUS.IN_PROGRESS, roles: STAFF },
                           { to: STATUS.ON_HOLD,     roles: STAFF }],
  [STATUS.IN_PROGRESS]:   [{ to: STATUS.ON_HOLD,     roles: STAFF },
                           { to: STATUS.RESOLVED,    roles: STAFF }],
  [STATUS.ON_HOLD]:       [{ to: STATUS.IN_PROGRESS, roles: STAFF }],
  [STATUS.RESOLVED]:      [{ to: STATUS.CLOSED,      roles: ['Administrator', 'Department Head'] },
                           { to: STATUS.IN_PROGRESS, roles: STAFF }],
  [STATUS.CLOSED]:        [],
});

/**
 * @returns {{allowed: boolean, reason?: string}}
 */
export function checkTransition(from, to, role) {
  const permitted = TRANSITIONS[from];
  if (!permitted) return { allowed: false, reason: `Unknown status '${from}'` };

  const move = permitted.find((t) => t.to === to);
  if (!move) return { allowed: false, reason: `'${from}' may not move to '${to}'` };

  if (!move.roles.includes(role)) {
    return { allowed: false, reason: `Role '${role}' may not move '${from}' to '${to}'` };
  }
  return { allowed: true };
}
