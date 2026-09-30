## What this changes

<!-- One or two sentences. Keep pull requests small and single-purpose (RSK-013). -->

## Traceability

<!-- Required. A merged change that names no requirement or scope ID is the early-warning indicator for RSK-012. Write "none" only where that is genuinely true. -->

- **Issue:** Closes #
- **Requirements / scope:** <!-- e.g. FR-6.2, NFR-3.3, SCP-008 -->
- **Decisions / ASRs:** <!-- e.g. DEC-012, DEC-014, ASR-01 -->
- **Risks affected:** <!-- e.g. RSK-009 -->
- **Controlled artefacts updated:** <!-- e.g. PED v1.x §…, RTM v0.x, Risk Register V0.x, Decision Log v0.x -->

## How it was checked

- [ ] `npm test` passes locally
- [ ] CI checks pass on this pull request

## Author checklist

- [ ] No password, API key, token or connection string is committed (NFR-3.5)
- [ ] Routes and middleware do not import models or repositories (NFR-1.7, §6A.5)
- [ ] A controlled document is changed by adding a new version, with the previous one moved to its outdated folder, not edited in place
- [ ] The RTM and any affected register are updated, or this PR says why not
- [ ] AI assistance is recorded in the AI Usage Register (Master Brief §10)

## For reviewers

<!-- Two approvals from members other than the author (Master Brief §9). Say what you checked, not only that you approved. -->
