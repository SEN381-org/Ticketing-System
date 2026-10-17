// NFR-4.3: the notice shown on the submission form before the requester can
// submit. The wording is NOT written here. It comes from the one constant below,
// which is a marked placeholder until the project owner approves the text.

export const PRIVACY_NOTICE_TEXT = 'PLACEHOLDER - privacy notice wording awaiting approval. It must state what personal information is collected, why, and who may access it (NFR-4.3).';

export default function PrivacyNotice() {
  return (
    <aside className="notice notice--placeholder" aria-labelledby="privacy-title" data-testid="privacy-notice">
      <h2 id="privacy-title">Privacy notice</h2>
      <p>{PRIVACY_NOTICE_TEXT}</p>
    </aside>
  );
}
