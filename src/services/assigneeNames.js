/**
 * Assignee display names for the roles that assign work.
 *
 * Traces to: FR-5.1, FR-4.1, DEC-012 (enforcement point 2), DEC-014, DEC-015 Addendum A.
 *
 * `assigneeName` is returned only to an actor holding `request:assign` (the Coordinator
 * and the Manager), who need to see who a request is assigned to. Every other viewer
 * receives no such key. The names are read in ONE lookup for all the ids a page needs,
 * not one lookup per item.
 */

import { mayPerformOperation } from '../domain/accessRules.js';

/**
 * @returns {Promise<Map<string,string>|null>} id -> displayName, or null when the actor
 *   may not see assignee names (so the caller adds no key at all).
 */
export async function assigneeNamesFor(users, actor, assigneeIds) {
  if (!mayPerformOperation('request:assign', actor)) return null;
  const ids = [...new Set(assigneeIds.filter((id) => id != null).map(String))];
  const names = new Map();
  if (ids.length === 0 || !users) return names;
  for (const u of await users.findDisplayNames(ids)) names.set(String(u._id), u.displayName ?? null);
  return names;
}
