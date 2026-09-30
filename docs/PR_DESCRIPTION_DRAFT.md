# M2 Person B: data and persistence baseline, technology/interface ADRs, RTM v0.5, build fix

**Branch:** `task/M2-PersonB` → `dev`
**Author:** Robert van der Merwe
**Reviewers requested:** @Ethan Lindsay, @Christiaan Burger

## Summary

This PR delivers my M2 areas: the data and persistence baseline, the technology and
deployment position, and the initial interface decisions. It also completes the RTM
data/persistence column, fixes the broken build on `dev`, and aligns the Mongoose models to
the baseline. `npm test`: **39/39 passing** (the 23 existing tests plus 16 new model tests).

## Changes

### 1. Build fix (restores the test suite on `dev`)
- `requestRoutes.js` and `authorise.js` moved from `tests/` into `src/routes/` and `src/middleware/` (`git mv`, so history is preserved). The authorisation guard tests had been failing on import, so they never ran; all 7 now run and pass. See R-01.
- Node runtime: `engines` set to **`>=22.0.0`** (Node 20 reached end-of-life on 30/04/2026); `.nvmrc` = 22; lockfile synced; README updated.

### 2. Decisions (ADRs in `docs/decisions/ADR/`)
- **DEC-014: API semantics.** `/api/v1`; transitions as a `POST` sub-resource; ETag/If-Match optimistic concurrency; Idempotency-Key on state-changing POSTs; RFC 9457 errors.
- **DEC-015: transaction boundary.** `requests` + `requestHistory` in one multi-document transaction; `auditLog` eventually consistent via the Atlas trigger. Narrows AC-NFR-1.10 via **CR-001**.
- **DEC-016: retention by purpose.** Request data ≤ 30 days after closure; audit log ≥ 90 days as a separate accountability purpose. Closes **OI-06** (via **CR-002**).
- **DEC-003** (full deployment ADR) and **DEC-010** (closed: free cluster + 12-hourly encrypted `mongodump`).
- **PROC-001:** twice-monthly manual anonymisation (14–30 days after closure); SCP-020 stays deferred. Raises **OI-13 / CR-003** (FR-6.7 vs anonymisation). **CR-004** covers NFR-2.6 index scope.

### 3. Data baseline and models
- `docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md`: entities, ownership, append-only constraint DB-01 (three layers), indexes, storage/throughput arithmetic.
- `src/models/` aligned to it: FR-6.1 statuses, FR-1.2 roles, FR-2.2 mandatory fields, `campusId` (SCP-019), `version` (ETag), `pre('bulkWrite')` append-only guard; new models for notifications, reportingCounts, auditLog, users, roles, groups, categories.
- `tests/models.test.js`: 16 tests, no database required.

### 4. Controlled documents and registers
- **PED v1.6** (working draft; v2.0 is reserved for the signed-off baseline): new §6A and §6B, §7.5 data link, §8.3.1 risks, §10.7/§10.8, Appendix A aligned to the register versions in the repo.
- **RTM v0.5** (xlsx + csv + change notes): data/persistence column 79/79.
- Decision Log v0.5 · Risk Register V0.5 · Open Items v0.3 · Acceptance Criteria v0.3 (evaluable AC-NFR-4.2) · Non-Functional Requirements v0.3 (NFR-4.2) · AI Usage Register v0.5.
- Superseded versions archived in each folder's outdated directory; PED v1.5 and RTM v0.4 in `docs/Outdated/`. See `docs/VERSION_AUDIT_REPORT.md`.

### 5. Scripts
- `scripts/`: backup, restore test and consistency check (DEC-010), PROC-001 script, Atlas trigger and function configuration. Syntax-checked only; **not yet run against Atlas**.

### 6. Review record
- **`docs/M2_BACKEND_CORRECTIONS.md`**: 22 review comments (R-01 to R-22) on the application slice, with per-item status. The model-side items are fixed here; the domain, service, repository and route items are for Ethan's follow-up PR.

## Known dependencies and limitations (please read before approving)
- **Domain vs model mismatch:** the models now use the FR-6.1 status set and FR-1.2 roles, but `src/domain/requestStatus.js`, `authorise.js` and the service still use pre-baseline values and `departmentId` (R-04, R-07, R-10). Tests pass because the service tests use fakes, and nothing connects to a database yet. Ethan's correction PR should follow this one.
- The change requests CR-001 to CR-004 are **proposed**. The register changes that depend on them are applied only after approval.
- Evidence items still open: Hostinger plan and cost; BC backup server confirmation (DEC-010 E1); NFR-3.7 at-rest sufficiency; database-level verification of DB-01 (M3).
- No CI check exists yet (R-02), so reviewers please run `npm install && npm test` locally.

## How to verify
```bash
npm install        # Node >= 22; no EBADENGINE on newer versions
npm test           # expect 39 passing
```

## Review requested
Per Master Brief §9 and DEC-008, this PR needs **two approvals from members other than the
author** before it merges into `dev`. **@Ethan Lindsay** and **@Christiaan Burger**, please
review. Please leave written comments in the PR rather than approving off-platform, so the
review record is inspectable (PED §11.4). Areas that would benefit from each reviewer:
- **Ethan:** the DEC-015 transaction boundary and its effect on DEC-011; the corrections list; the domain/model dependency above.
- **Christiaan:** the Risk Register V0.5 entries and the RSK-002/RSK-008 proposals; PED version-history renumbering (your planned row is now 1.7); the scripts and the CI gap.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
