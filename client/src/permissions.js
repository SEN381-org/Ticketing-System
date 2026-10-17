// Which roles are shown which controls. Presentation only: the server decides
// (DEC-012 point 1 and 2; TD-003). The role lists mirror DEC-015 §1 and
// Addendum A. If a role is not known (the session predates this page load),
// every control is shown and the server refuses what is not allowed.

import { ROLE } from '../../shared/domainValues.js';

const STAFF = [ROLE.TECHNICIAN, ROLE.COORDINATOR, ROLE.MANAGER, ROLE.SECURITY_OFFICER];

export const SHOWN_TO = Object.freeze({
  submit: [ROLE.REQUESTER, ROLE.COORDINATOR],
  mine: [ROLE.REQUESTER],
  staffList: STAFF,
  transition: STAFF,                                  // request:transition
  assign: [ROLE.COORDINATOR, ROLE.MANAGER],           // request:assign
  accept: [ROLE.TECHNICIAN, ROLE.SECURITY_OFFICER],   // request:accept
  comment: STAFF,                                     // request:comment
  detail: [ROLE.REQUESTER],                           // request:add-detail (FR-2.4)
  report: [ROLE.MANAGER, ROLE.COORDINATOR, ROLE.SECURITY_OFFICER], // report:read
  listUsers: [ROLE.COORDINATOR, ROLE.MANAGER, ROLE.ADMINISTRATOR], // user:list
  administerUsers: [ROLE.ADMINISTRATOR],              // user:administer
  setTarget: [ROLE.MANAGER],                          // category:set-target
  administerCategories: [ROLE.ADMINISTRATOR],         // category:administer
});

/** @param {{roles?: string[]}|null} user  @param {string} operation a key of SHOWN_TO */
export function shows(user, operation) {
  if (!user) return true;
  const held = Array.isArray(user.roles) ? user.roles : [];
  return held.some((r) => SHOWN_TO[operation].includes(r));
}

/** A Requester holding no other role gets the simple teal layout; everyone else the side panel. */
export function isRequesterOnly(user) {
  const held = Array.isArray(user?.roles) ? user.roles : [];
  return held.length > 0 && held.every((r) => r === ROLE.REQUESTER);
}

/** The destinations offered to a user, in order; the first is where they start. Shown by role, decided by the server. */
export function destinations(user) {
  const out = [];
  if (shows(user, 'mine')) out.push(['/requests/mine', 'My requests']);
  if (shows(user, 'staffList')) out.push(['/requests', 'Request queue']);
  if (shows(user, 'submit')) out.push(['/requests/new', 'New request']);
  if (shows(user, 'report')) out.push(['/management', 'Management view']);
  if (shows(user, 'administerUsers')) out.push(['/admin/users', 'Users']);
  if (shows(user, 'setTarget') || shows(user, 'administerCategories')) out.push(['/admin/categories', 'Categories']);
  return out;
}

export const homePath = (user) => destinations(user)[0]?.[0] ?? '/';

/**
 * Where a sign-in on a gated page should land. A different person from the last
 * one in this tab, or a page that is not one of the new user's destinations,
 * goes to the role's home page; the same person on a page of theirs stays.
 * Returns null to stay where they are.
 */
export function landingAfterSignIn(user, path, lastUserId) {
  if (lastUserId && user?.id && lastUserId !== user.id) return homePath(user);
  const own = destinations(user).some(([to]) => to === path) || path === '/notifications' || path === '/privacy';
  return own ? null : homePath(user);
}
