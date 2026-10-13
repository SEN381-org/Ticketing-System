/**
 * The controlled domain values: the single definition of STATUS, ROLE and
 * TERMINAL_STATUSES for the server and, later, the browser client.
 *
 * This module has NO imports and must stay that way. A client bundle imports it
 * directly, and it must pull in nothing from src/ (DEC-014) and nothing
 * server-only such as mongoose. tests/domainValues.test.js reads this file and
 * fails if an import or require appears.
 */

/** FR-6.1 / AC-FR-6.1 — exact baselined values. */
export const STATUS = Object.freeze({
  RECEIVED: 'Received',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
});

export const TERMINAL_STATUSES = Object.freeze([STATUS.CLOSED, STATUS.REJECTED]);

/** FR-1.2 — the controlled role set. */
export const ROLE = Object.freeze({
  REQUESTER: 'Requester',
  TECHNICIAN: 'Technician',
  COORDINATOR: 'Coordinator',
  MANAGER: 'Manager',
  SECURITY_OFFICER: 'Security Officer',
  ADMINISTRATOR: 'Administrator',
});
