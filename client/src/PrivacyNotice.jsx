// NFR-4.3: the notice shown on the submission form before the requester can
// submit. The wording is NOT written here. It comes from the one constant below,
// which is a marked placeholder until the project owner approves the text.

export const PRIVACY_NOTICE_TEXT = 'PLACEHOLDER - privacy notice wording awaiting approval. It must state what personal information is collected, why, and who may access it (NFR-4.3).';

export default function PrivacyNotice() {
  return (
    <aside className="notice notice--placeholder" aria-labelledby="privacy-title" data-testid="privacy-notice">
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
