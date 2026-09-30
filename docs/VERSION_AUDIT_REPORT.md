# Version audit report: M2 Member B change set

| | |
|---|---|
| **Author** | Robert van der Merwe |
| **Date** | 30/09/2026 |
| **Branch** | `task/M2-PersonB` (staged, not committed) |
| **Purpose** | Configuration status accounting for every versioned artefact created, renamed or archived in this change set, checked against the team's versioning rules |

*This is the first issue of this report. No earlier `VERSION_AUDIT_REPORT.md` existed in the
working tree or the git history.*

## 1. Versioning rules applied

| Rule | Statement |
|---|---|
| **Rule 1: major baselines** | X.0 versions (v1.0, v2.0, v3.0) are reserved for the frozen baseline signed off at the end of each milestone |
| **Rule 2: work in progress** | All intermediate work toward a milestone uses sequential minor versions (1.1, 1.2, 1.3 …) |
| **Rule 3: no overwrite** | Updating a versioned file creates a new file with the incremented version. The previous file is kept and archived in its folder's outdated directory, not edited |

## 2. Corrections made in this revision

### 2.1 PED: `PED_v2.0.md` → `PED_v1.6.md`

- **Why v1.6 and not v2.0:** under Rule 1, v2.0 is reserved for the frozen M2
  Architecture, Technology & Initial Design Baseline, which is signed off in Appendix B.
  That sign-off has not happened: Christiaan's rows and the formal approval are outstanding.
  This deliverable is therefore a working draft and takes the next minor version after
  v1.5 (Rule 2).
- **Internal document control changed to match:** the title line reads *"Version 1.6 —
  working draft toward the Architecture, Technology & Initial Design Baseline (v2.0)"*; the
  control table reads Version **1.6** and Status **"Draft — pending M2 baseline sign-off"**;
  it supersedes v1.5.
- **Version history re-sequenced.** Row 1.6 had been reserved in the planned history for C.
  Burger (repository structure / CI), and 1.7 for the joint risk update. With this draft now
  occupying 1.6, the planned rows move to **1.7 (C. Burger)** and **1.8 (joint)**, each
  annotated *"renumbered from …"*. Row **2.0** is restored to its planned meaning, the frozen
  baseline (E. Lindsay), with no date until sign-off. *Christiaan should confirm the
  renumbering of his planned row.*
- **Wording:** four passages that described the document itself as being at v2.0 now say
  "at this version (v1.6)" or "during M2". The existing "at v2.0" wording that describes the
  milestone baseline this document is working toward (§1.1, §1.2, §7, §12.1) is unchanged.
  It was already in v1.5, and it is correct.
- **References updated:** `docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md`
  and `docs/M2_BACKEND_CORRECTIONS.md` now cite `PED_v1.6.md`. No reference to
  `PED_v2.0.md` remains outside `docs/Outdated/`.

### 2.2 Open Items: `Open_Items_v0.4.xlsx` → `Open_Items_v0.3.xlsx`

- **The conflict that caused v0.3 to be skipped:** the file committed as `Open_Items_v0.2.xlsx`
  (E. Lindsay, commit `a3276ff`, 29/09/2026) already contained entries labelled *"at v0.3"*:
  OI-05 closed, OI-06 escalated, OI-07 and OI-10 updated, OI-12 raised. That file was the
  first repository version after v0.1, so **no separately committed v0.2 content exists.** A
  new file named v0.3 therefore looked as though it would duplicate a version that was
  already in use.
- **Resolution:** v0.3 is the version that consolidates **all** M2 changes. It takes Ethan's
  drafted v0.3 entries together with this change set's updates: OI-06 closed by DEC-016, OI-10
  reduced (storage arithmetic), OI-13 raised (FR-6.7 vs anonymisation). Inside the file:
  - every label introduced by this change set now reads **v0.3** ("CLOSED at v0.3",
    "PARTIALLY CLOSED at v0.3", "NEW at v0.3", status "Closed at v0.3"); no "v0.4" remains;
  - the preserved earlier text of OI-06 and OI-10 is prefixed *"EARLIER v0.3 ENTRY (E. Lindsay,
    29/09/2026, first drafted in the file then named Open_Items_v0.2)"*;
  - the subtitle row carries a version note stating the lineage above.
- **Archive left as committed:** `Outdated/Open_Items_v0.2.xlsx` keeps its v0.3-labelled
  content. It was not edited (Rule 3), and this report is the record that it is a v0.3
  draft committed under the v0.2 filename.
- **PED v1.6 Appendix A** cites Open Items **v0.3**, and its register note explains the
  consolidation.

## 3. Full inventory: current versions

| Artefact | Current file | Previous version (location) | Rule check |
|---|---|---|---|
| Project Engineering Document | `docs/PED/PED/PED_v1.6.md` | v1.5 → `docs/Outdated/PED_v1.5.md` | ✔ Rule 2 (draft); v2.0 reserved |
| Requirements Traceability Matrix | `…/Requirements_Traceability_Matrix_v0.5.xlsx` + `.csv` | v0.4 → `docs/Outdated/Requirements_Traceability_Matrix_v0.4.xlsx` (no v0.4 CSV ever existed) | ✔ |
| RTM change notes | `…/Requirements Traceability Matrix/RTM_v0.5_Change_Notes.md` | – (new) | ✔ tied to v0.5 |
| Engineering Decision Log | `docs/decisions/Decision Log/Decision Log v0.5.xlsx` | v0.4 → `Decision Log/Outdated/` | ✔ |
| Risk Register | `docs/risk/Risk Register/Risk Register V0.5.xlsx` | V0.4 → `Risk Register/Oudated/` | ✔ |
| Open Items | `docs/Requirements/Open Items/Open_Items_v0.3.xlsx` | "v0.2" (v0.3 draft, see §2.2) → `Open Items/Outdated/` | ✔ after this correction |
| Acceptance Criteria | `docs/Requirements/Acceptance Criteria/Acceptance Criteria v0.3.xlsx` | v0.2 (`Acceptace …`, original filename kept) → `Acceptance Criteria/Oudated/` | ✔ (filename typo corrected from v0.3 on) |
| Non-Functional Requirements | `…/Non Functional Requirements v0.3.xlsx` | v0.2 → `Non-Functional Requirements/Outdated/` | ✔ |
| Data and Persistence Baseline | `docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md` | – (new) | ✔ |
| ADRs DEC-003, DEC-010, DEC-014, DEC-015, DEC-016 | `docs/decisions/ADR/DEC-0xx_*_v0.1.md` | – (new) | ✔ |
| Change requests CR-001 to CR-004 | `docs/change/CR-00x_*_v0.1.md` | – (new) | ✔ |
| PROC-001 | `docs/operations/PROC-001_Manual_Anonymisation_v0.1.md` | – (new) | ✔ |
| AI Usage Register | `docs/AI-Usage/AI Usage Register/AI Usage Register v0.5.xlsx` | v0.4 → `AI Usage Register/Oudated/` | ✔ ("Issues found" column added per Master Brief s.10.1) |
| Mongoose models | `src/models/*.js` (code; versioned by git) | – | n/a; aligned to Data Baseline v0.1, evidenced by `tests/models.test.js` |
| Scripts | `scripts/` (unversioned code; versioned by git) | – (new) | n/a |

The outdated-directory spelling follows each folder's existing convention (`Outdated` or
`Oudated`). No second, differently spelled directory was created.

## 4. Pre-existing inconsistencies found, not changed

*Also noted:* the Excel owner-lock file `docs/AI-Usage/AI Usage Register/~$AI Usage Register v0.4.xlsx` is tracked in git.
It is a temporary file created by Excel, not an artefact. It was left in place by this change set and should be removed with
`git rm --cached` plus a `.gitignore` entry for `~$*` in a housekeeping change.


Recorded for configuration status accounting only. These are archived files, and editing
them would break Rule 3.

| File | Filename version | Version stated inside |
|---|---|---|
| `docs/PED/PED/Outdated/PED_v1.1.md` | 1.1 | "Version 2.0" |
| `docs/PED/PED/Outdated/PED_v1.2.md` | 1.2 | "Version 2.0" |
| `docs/PED/PED/Outdated/PED_v1.4.md` | 1.4 | "Version 1.5" |
| `docs/Requirements/Open Items/Outdated/Open_Items_v0.2.xlsx` | 0.2 | entries labelled v0.3 (§2.2) |

The first two predate Rule 1 and would breach it if they were current. The team may want to
add a one-line note to each folder rather than edit the files.

## 5. Still outstanding before the v2.0 baseline

- C. Burger's rows (now 1.7) and the joint risk row (1.8).
- Appendix B sign-off of the M2 baseline, which is the event that creates `PED_v2.0.md`
  under Rule 1.
- Approval of CR-001 to CR-004. The register changes that depend on them (AC-NFR-1.10 v0.3;
  NFR-1.4, NFR-1.9, FR-6.7 and NFR-2.6 measurement bases) are applied only after approval,
  as the next minor versions of the affected registers.
