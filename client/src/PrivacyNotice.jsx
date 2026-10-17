// NFR-4.3: the notice shown on the submission form before the requester can submit.
// Wording approved by E. Lindsay, 17/10/2026, and used exactly as approved. The role
// name is interpolated from the shared domain values (never typed in the client), so
// the rendered sentence is the approved text character for character.
//
// Source of each sentence:
//   1 "We collect the category, location and description you enter, and record that
//      you submitted the request."                           DEC-017 purpose A
//   2 "We use this only to handle your request and keep you informed of its status."
//                                                            DEC-017 purpose A
//   3 "Campus staff responsible for handling service requests can see it, and every
//      staff action on your request is recorded."            Q12 decision (17/10/2026:
//                                                            mayViewRequest, by role and
//                                                            category); DEC-017 purpose B
//   4 "For security concerns, the description, comments and actions are visible only
//      to the Security Officer."                             FR-1.5
//   5 "Personal details are removed no later than 30 days after your request is
//      closed."                                              DEC-017 purpose A; the
//                                                            30 days is OI-12 (unvalidated)
//   6 "A separate security log of staff actions, containing no description, location or
//      contact details, is kept for at least 90 days."       DEC-017 purpose B

import { ROLE } from '../../shared/domainValues.js';

export const PRIVACY_NOTICE_TEXT = 'We collect the category, location and description you enter, and record that '
  + 'you submitted the request. We use this only to handle your request and keep you informed of its status. '
  + 'Campus staff responsible for handling service requests can see it, and every staff action on your request '
  + 'is recorded. For security concerns, the description, comments and actions are visible only to the '
  + `${ROLE.SECURITY_OFFICER}. Personal details are removed no later than 30 days after your request is `
  + 'closed. A separate security log of staff actions, containing no description, location or contact '
  + 'details, is kept for at least 90 days.';

export default function PrivacyNotice() {
  return (
    <aside className="notice" aria-labelledby="privacy-title" data-testid="privacy-notice">
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" fill="none" stroke="var(--color-harbour)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div>
        <h2 id="privacy-title" className="label">Privacy notice</h2>
        <p>{PRIVACY_NOTICE_TEXT}</p>
      </div>
    </aside>
  );
}
