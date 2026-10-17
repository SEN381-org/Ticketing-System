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
