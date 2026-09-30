# M2 completion check: Person B audit

| | |
|---|---|
| **Member** | Robert van der Merwe (Person B): data and persistence, technology stack and deployment, interfaces, RTM, ADRs |
| **Checked against** | M2 brief §16 "M2 Completion Check", 18 items (`extras/Briefs/Project Milestone 2 Brief v0.1.md`) |
| **Branch state** | `task/M2-PersonB` at commit `94e1c9e` (pushed) plus a staged, uncommitted delta (model alignment, AI register v0.5, audit and PR drafts), 30/09/2026; `npm test` **39/39** |

Legend: **✔ Met** · **◐ Partly met** (the gap is named) · **✘ Not yet** · **—** owned by another member (shown for completeness)

## Items within Person B's responsibilities

| # | Checklist item | Status | Evidence / gap |
|---|---|---|---|
| 2 | RTM has evolved with relevant evidence | **✔** (own columns) | RTM v0.5: data/persistence column **79/79** (62 filled, 10 corrected); DEC-015/016/017 design references on 18 rows. *Gap, not mine:* architecture 0/79 (Christiaan), implementation and verification columns (all, criterion F) |
| 3 | Risk register, assumptions, FECs reflect new evidence | **◐** | Risk Register V0.5 (RSK-018–020); Open Items v0.3 (OI-06 closed, OI-10 reduced, OI-13 raised). *Gap:* the proposed RSK-002 re-score / RSK-008 closure need team agreement; the FEC register has not been reviewed for the data and technology decisions |
| 6 | Data/persistence decisions documented and linked to correctness | **✔** | Data Baseline v0.1 (entities, ownership, DB-01 append-only, indexes, storage and throughput arithmetic); DEC-016 transaction boundary; DEC-017 retention; `src/models/` implements the baseline, verified by `tests/models.test.js`. *Open:* DB-level enforcement (Atlas role) is M3; the conditional update and transaction in the service are Ethan's R-13/R-15 |
| 7 | Technology stack justified with evidence | **◐** | DEC-003 ADR; PED v1.7 §6C versions (Node ≥22, Express 4.22, Mongoose 8.24) with free-cluster limits sourced from MongoDB docs. *Gaps:* DEC-002 (closed by Ethan) lists alternatives in one line and has **no weighted comparison matrix**, which the brief's §5.5 and the Master Brief §18.1 expect; Hostinger plan and cost, BC server confirmation (DEC-010 E1), React version and NFR-3.7 sufficiency are open evidence items |
| 9 | A2 research referenced, not copied | **✔** | Each ADR cites A2 sections (§3.x, §4.x); DEC-016 records where the M2 decision **differs** from A2 (SQL trigger premise) and why. That is the evidence for defence Q8 |
| 10 | Initial interface/integration decisions documented | **◐** | DEC-015 (versioned REST, ETag/If-Match, Idempotency-Key, RFC 9457). *Gap:* the implemented route is still `PATCH /:id/status` (R-03, Ethan); `docs/api/openapi.yaml` not yet created |
| 14 | A requirement traces into implementation and initial verification | **✔** | FR-6.7 end to end (PED §7.5); FR-2.2 now traces to `Request.js` → `models.test.js` |
| 17 | AI use recorded and verified | **✔** | AI Usage Register v0.5: six entries for this work (tool: Claude Code, Claude Opus 5.5) with verification, decisions and issues found; "Issues found" column added per Master Brief §10.1 |

## Shared items I contribute to

| # | Checklist item | Status | Evidence / gap |
|---|---|---|---|
| 1 | PED v2.0 visibly continues M1 and retains history | **◐** | PED **v1.6** working draft continues v1.5 with full history; v2.0 is created at sign-off (team Rule 1). Planned rows 1.7 (Christiaan) and 1.8 (joint) outstanding |
| 11 | Architecture, Technology & Initial Design Baseline identifiable and controlled | **✘** | Appendix B still records only the M1 sign-off. M2 sign-off pending |
| 12 | Meaningful development has begun against the baseline | **◐** | Models aligned to the baseline plus 16 model tests; build fixed (router and guard moved into `src/`). *Gap:* domain, service and routes still carry pre-baseline status/role values and `departmentId` (R-04, R-07, R-10). Until fixed, **domain and models disagree**, which is a merge dependency for Ethan's correction PR |
| 13 | Application documentation matches the repository | **◐** | README updated: correct `src/` paths, Node ≥22, model tests, `scripts/`, data-baseline link; `scripts/README.md`. *Gap:* README "What is implemented" still describes FR-6.1 as the domain's pre-baseline values until R-07 lands |
| 15 | GitHub history shows progressive controlled work and peer review | **◐ (risk)** | The bulk of this work is one large commit (`94e1c9e`, already pushed, so it should not be rewritten). The brief (§7) warns that "bulk uploads immediately before assessment" weaken the evidence. **Mitigation:** commit the staged delta as separate, focused commits (e.g. 1 models + model tests; 2 AI register + PED/README/doc sync; 3 audit and PR drafts); make the PR description and written reviews carry the traceability; progressive history on later work |
| 18 | Every member can defend the shared evidence | **◐** | Prepare the Person B defence questions below |

## Items owned by other members

| # | Checklist item | Owner | Observation |
|---|---|---|---|
| 4 | ASRs project-specific and linked | Christiaan | RTM architecture column is 0/79 at v0.5 |
| 5 | Architecture selection and diagrams | Christiaan | PED row 1.2 content not yet present |
| 8 | Two design problems with A2-informed decisions | Ethan | DEC-011 and DEC-012 recorded with diagrams **✔** |
| 16 | A2 SCM/CI recommendations adopted progressively | Christiaan | **✘** `.github/workflows/` contains only a placeholder; no required `npm test` check (R-02) |

## Person B defence preparation (M2 brief §15)

| Question | Where to point |
|---|---|
| Q4: a data decision that protects business correctness | DEC-016 (request + history atomic; version/ETag; unique `{requestId, requestVersion}`) and DB-01; show `models.test.js` refusing `bulkWrite` |
| Q5: evidence behind a technology choice | DEC-010: free-cluster limits from MongoDB docs; 12-hour dump cadence reasoning; upgrade triggers |
| Q8: an M2 decision that differs from A2 | DEC-016: Atlas triggers run after commit via change streams, so the audit write left the transaction |
| Q10: what else changes if an ADR changes | DEC-017 → NFR-1.4/1.9/4.2 bases, AC-NFR-4.2, PROC-001, auditLog TTL, trigger `full_document`, RTM rows |
| Q11: which RTM columns progressed | Data/persistence 17 → 79 of 79; design column gained DEC-015/016/017 |
| A decision deliberately deferred | SCP-020 (automated retention enforcement), with PROC-001 as the interim control and the argument for why a TTL index is not enough |

## Housekeeping found during the audit

- `docs/AI-Usage/AI Usage Register/~$AI Usage Register v0.4.xlsx` is an Excel lock file tracked in git; remove it in a separate housekeeping change and add `~$*` to `.gitignore`.
- The brief file is `Project Milestone 2 Brief v0.1.md` in the repository, not `SEN381_CivicConnect_Milestone_2.md`.
