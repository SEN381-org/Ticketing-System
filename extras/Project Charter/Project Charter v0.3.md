# Project Charter — v0.3
## CivicConnect — Community Service Request Management Platform

**Document status:** v0.3 Draft — supersedes v0.2
**Prepared by:** Robert van der Merwe, Project Manager
**Date prepared:** 9 September 2026
**Synchronised against:** Member A's baseline of 09/09/2026 (Scope Baseline, Constraints, Decision Log, Stakeholder Register, Stakeholder Conflicts, PED §2) and Member B's Requirements Baseline v0.2

> **Note on inputs.** Every figure is derived, not asserted; Sections 4 to 7 show the substitution for each formula. Assumptions are flagged **[A#]** and consolidated in Appendix A.
>
> **§7 carries two registers by design.** Member C's Risk Register v0.4 is the authoritative engineering register. The charter register at §7.3 is the quantified project-management view, retained because the financial model in §6 requires a monetary risk position. §7.1 holds the reconciliation between them.

### Change record: v0.1 → v0.2

| # | Change | Driven by |
|---|---|---|
| 1 | Calendar dates applied throughout; week 1 anchored to 9 September 2026 | Client instruction |
| 2 | Available delivery window corrected from 13 weeks to **5.57 weeks** | M1 = 9 Sep… M4 = 18 Oct 2026 |
| 3 | Size estimate rescoped 12.0 → **15.0 kLOC** | 8 new NFRs + FR-1.6 in Requirements v0.2 |
| 4 | New §4.6: AI productivity assumption, required multiplier and verification trigger | CON-009, client direction |
| 5 | PERT re-baselined against real dates; CON-013 gate added as velocity checkpoint | CON-013 |
| 6 | Scope §3 updated: SCP-021 added; SCP-017/018/019 renumbering recorded as a controlled change | Scope Baseline 09/09/2026 |
| 7 | STK-010 added to stakeholder register and approval conditions | Stakeholder Register 09/09/2026 |
| 8 | Risk register extended with RK-11 and RK-12; RK-03 re-rated upward | CON-013, §4.6 |
| 9 | §8 quality and procurement rewritten around CON-012 and CON-014 to CON-019 | Constraints 09/09/2026 |
| 10 | **Correction:** all four stakeholder conflicts are Proposed, not Agreed. v0.1 wrongly recorded CFL-001 and CFL-003 as resolved | Stakeholder Conflicts 09/09/2026 |
| 11 | Reference list added; ISO/IEC 25010 edition stated and quality characteristics aligned to the 2023 model; deliverable dates and team names corrected | Baseline consistency review, 09/09/2026 |

### Change record: v0.2 → v0.3

| # | Change | Driven by |
|---|---|---|
| 1 | §7.1 rewritten: Member C's Risk Register v0.4 adopted as the authoritative register; the charter register retained as the quantified project-management view, with a full reconciliation mapping between the two identifier sets | Risk Register v0.4 |
| 2 | Approval condition 4 updated from an outstanding action to a statement of which register governs, carrying forward RK-07 and RK-09 as the only remaining reconciliation work | Risk Register v0.4 |

---

## 1. General Project Information

| Field | Value |
|---|---|
| Project name | CivicConnect — Community Service Request Management Platform |
| Project manager | Robert van der Merwe |
| Project sponsor | *Not yet identified — see approval condition 5* — role identified as **STK-008 Campus executive sponsor** |
| Client / primary stakeholder | **STK-010 Lecturer / client proxy (Michael)** — High influence, High interest |
| Expected start date | **9 September 2026** (week 1) |
| Expected completion date | **18 October 2026** |
| Available delivery window | **5.57 weeks** (39 days) |
| Organisational unit | Software Engineering 381 (SEN381), Belgium Campus |
| Delivery context | Campus / educational institution, per **DEC-001** |

---

## 2. Project Overview & Justification

### 2.1 Problem Statement

Per PED §2.1, the campus manages service requests across email, telephone, WhatsApp, spreadsheets and paper. The defining characteristic is not that requests go unhandled but that **no single controlled record of a request's lifecycle exists** — each channel holds a partial view and nothing reconciles them. Four consequences follow: requests are lost between channels, requesters cannot see progress, ownership is unattributable, and management has no reliable operational picture. A fifth cuts across all of them — sensitive information is handled with no access control and no audit trail.

### 2.2 Business Case & Purpose

Per PED §2.2, the need is **not primarily for new capability**. Requests are already submitted, assigned and resolved today. The need is for those activities to occur against a single authoritative record, with attribution of who did what and when, and with access appropriate to the sensitivity of the information.

### 2.3 Project Objectives & Metrics

| # | Objective | Measure | Target | Traces to |
|---|---|---|---|---|
| O1 | Single controlled lifecycle record | Requests with a complete, unbroken, attributable status history | 100% | FR-6.1 – FR-6.7, NFR-1.9 |
| O2 | Unambiguous ownership | Non-terminal requests with no recorded owner | 0 | FR-5.1 – FR-5.4 |
| O3 | Self-service visibility | Status enquiries resolved without staff contact | ≥ 80% | FR-3.1 – FR-3.4 |
| O4 | Reportable position from the record | Management view generation time | < 5 s | FR-8.1, NFR-2.3 |
| O5 | Lawful handling of personal information | Personal-information fields with no mapped purpose | 0 | NFR-4.1, NFR-3.7, CON-007 |
| O6 | Verifiable capacity | Concurrent authenticated users sustained without failure | 100 | NFR-2.4, NFR-2.7, CON-010 |
| O7 | Evidence of controlled engineering | Controlled artefacts changed outside the two-approval model | 0 | DEC-008, STK-010 |

O7 is new in v0.2 and exists because STK-010's stated primary need is *evidence of controlled engineering, not just working software*.

### 2.4 Financial Viability — Summary

| Metric | Case A: full commercial cost | Case B: incremental cost to the institution |
|---|---|---|
| Investment | R1 878 896 | R59 000 |
| Net annual benefit | R339 120 | R339 120 |
| **Payback period** | **66.5 months (5.54 years)** | **2.1 months** |
| **ROI (5 years)** | **−9.8%** | **2 773.9%** |
| **ROI (7 years)** | **+26.3%** | — |
| **NPV (3 years, i = 10%)** | **−R1 035 555** | **+R784 341** |
| **NPV (5 years, i = 10%)** | **−R593 364** | **+R1 226 532** |
| NPV turns positive | Year 10 (+R204 850) | Year 1 |

The rescope from 12 to 15 kLOC worsened Case A materially — payback moved from 4.40 to 5.54 years and the NPV crossover from year 7 to year 10. Recommendation still follows Case B, subject to §9.2.

> **Open conflict (Requirements v0.2, OI-10).** CON-010 sets 100 concurrent users. That is difficult to reconcile with the 3 000 requests/year assumed in §6.3 or the 10 000-request data set in NFR-2.2 — 100 concurrent users implies a considerably larger institution than either figure describes. At least one of the three is wrong, and the benefit model in §6.3 depends on which.

---

## 3. Project Scope

### 3.1 In Scope — Product (the CON-001 capability floor)

SCP-001 submit a request with category, location and description · SCP-002 controlled category mechanism · SCP-003 view status and history of own requests · SCP-004 in-application feedback on acceptance, rejection, update or completion · SCP-005 staff view of requests within their authorisation · SCP-006 search, filter and sort · SCP-007 assign or accept responsibility · SCP-008 controlled status transitions with recorded acting user · SCP-009 record actions, comments and resolution information · SCP-010 resolve or close where authorised · SCP-011 management view of open, overdue, resolved and closed by category and status · SCP-012 authentication and role-based access control

### 3.2 In Scope — Project

| ID | Item | Note |
|---|---|---|
| **SCP-021** | Project charter, work breakdown structure and project timeline | **New 09/09/2026.** Directed by the client; type PROJECT, not PRODUCT. No functional requirement derives from it because it is not a capability of the system — recorded deliberately as Requirements v0.2 OI-09. This charter is the deliverable. |

### 3.3 Deferred

| ID | Item | Blocked by |
|---|---|---|
| SCP-014 | Email or push notification of status changes | DEC-003 |
| SCP-015 | Photograph attachments | DEC-003, CON-007 |
| **SCP-019** | Multi-campus or multi-tenant operation | CON-002 — *reclassified from Out of Scope to Deferred* |
| SCP-020 | Automated enforcement of the retention period | DEC-005 |

### 3.4 Out of Scope

| ID | Exclusion | Basis |
|---|---|---|
| SCP-013 | Native mobile application | DEC-007 (Revised), now client-mandated by **CON-011** |
| SCP-016 | Integration with campus systems (student records, HR, asset register) | CON-008, CON-002 |
| **SCP-017** | Ingestion of requests from existing email, telephone or WhatsApp channels | PED §2.5 — federating the channels would preserve the duplication that is the root cause |
| **SCP-018** | Technician scheduling, rostering or workload balancing | CON-001, CON-002 |

### 3.5 Controlled change record — identifier reassignment

**Confirmed deliberate by the Project Manager, 09/09/2026.** Recorded here rather than absorbed silently, because Master Brief s.11 requires identifiers to be stable and three were reassigned.

| ID | Meaning in v0.1 | Meaning from 09/09/2026 | Disposition |
|---|---|---|---|
| SCP-017 | Financial processing, procurement or billing (Out) | Ingestion from email/telephone/WhatsApp (Out) | Reassigned |
| SCP-018 | Multi-campus or multi-tenant operation (Out) | Technician scheduling, rostering, workload balancing (Out) | Reassigned |
| SCP-019 | Bulk import of historical requests (Deferred) | Multi-campus or multi-tenant operation (Deferred) | Reassigned |
| — | Financial processing, procurement or billing | *withdrawn from the baseline* | Superseded — remains out of scope by absence of any requirement |
| — | Bulk import of historical requests | *withdrawn from the baseline* | Superseded — no requirement depended on it |

**Consequence.** Any document citing SCP-017, SCP-018 or SCP-019 before 09/09/2026 cites a different capability than it does now. Member B's requirements are unaffected — only SCP-016 is referenced from that range. Member C should carry this table in the PED version history so the previous meanings remain recoverable.

### 3.6 Deliverables

| # | Deliverable | Milestone | Date | Weighting |
|---|---|---|---|---|
| D1 | PED v1.0 — requirements baseline, RTM, risk register, decision log | M1 | **9 September 2026** | 15 |
| D2 | PED v2.0 — architecture, data model, ADRs closing DEC-002 and DEC-003 | M2 | **30 September 2026** | 25 |
| D3 | PED v3.0 — construction, integration, CI, test and security evidence | M3 | **14 October 2026** | 30 |
| D4 | PED v4.0 — final product, project success evidence, individual defence | M4 | **18 October 2026** | 30 |

### 3.7 Acceptance Criteria

Governed by Member B's Acceptance Criteria register v0.2: **80 criteria in Given / When / Then form covering all 49 functional and 30 non-functional requirements.** Project-level gate: all High-priority criteria pass, RTM Design/Test/Release references populated for every High-priority requirement, baseline sign-off recorded.

---

## 4. Software Estimation & Effort (Basic COCOMO)

### 4.1 Mode Selection

**Organic.** a = 2.4, b = 1.05, c = 2.5, d = 0.38 (Boehm, 1981). Three-person team (CON-004), well-understood application class, no rigid external interfaces (NFR-1.3, SCP-016), no novel algorithms. **CON-009 independently confirms this mode selection**, naming Organic and a = 2.4, b = 1.05 explicitly.

CON-012 now mandates a layered architecture, which removes architectural style from the decision space but does not change the mode — a prescribed conventional style is consistent with Organic, not against it.

### 4.2 Size Estimate — Rescoped

**15.0 kLOC delivered source, excluding test code. [A1]** Revised from 12.0 kLOC in v0.1.

| Component | LOC |
|---|---|
| Simple functional requirements (~30 × ~120) | 3 600 |
| Moderate functional requirements (~12 × ~250) | 3 000 |
| Complex functional requirements (~6 × ~450) | 2 700 |
| Non-functional cross-cutting infrastructure (v0.1 set) | 2 200 |
| Scaffolding, data access, migrations, routing, configuration | 1 500 |
| **v0.1 subtotal (rounded)** | **12 000** |
| FR-1.6 user grouping (CON-019) | 250 |
| NFR-1.7 layered architecture — boundary and mapping code (CON-012) | 800 |
| NFR-1.8 four environment schemas + scripted migrations (CON-016) | 400 |
| NFR-1.9 ordered migration scripts + database triggers (CON-015) | 600 |
| NFR-1.10 transaction boundaries (CON-017) | 200 |
| NFR-1.11 structured performance logging (CON-014) | 300 |
| NFR-2.6 justified indexing strategy — DDL (CON-018) | 150 |
| NFR-2.7 externalised session state (CON-010) | 200 |
| NFR-3.7 encryption at rest (CON-019) | 250 |
| **v0.2 additions** | **3 150** |
| **Total** | **15 000** |

The 09/09/2026 constraints added roughly a quarter to the size estimate. That is the quantified cost of CON-012 and CON-014 through CON-019, and it lands in the same fortnight the delivery window turned out to be 5.57 weeks rather than 13.

### 4.3 Calculations

```
E = a(kLOC)^b   = 2.4 × (15.0)^1.05 = 2.4 × 17.1755 = 41.22 person-months
T = cE^d        = 2.5 × (41.22)^0.38 = 2.5 × 4.1093  = 10.27 months
N = E / T       = 41.22 / 10.27                      = 4.01 developers
C = E × u       = 41.22 × R45 000                    = R1 854 896   [A2]
```

### 4.4 Sensitivity

| kLOC | E (person-months) | T (months) | N | C |
|---|---|---|---|---|
| 12 (v0.1) | 32.61 | 9.40 | 3.47 | R1 467 453 |
| **15 (v0.2)** | **41.22** | **10.27** | **4.01** | **R1 854 896** |

### 4.5 The Capacity Position

COCOMO requires **41.22 person-months over 10.27 months with 4.01 developers.** Available: three part-time students over **5.57 weeks = 1.28 months.**

Applying the 3× prototype productivity adjustment carried in v0.1 **[A4]** — COCOMO's 2.42 LOC/hour commercial rate reflects formal specification, regression suites and production documentation that a prototype either omits or produces as separate coursework:

| Hours/week/student | Total hours over 5.57 wks | Achievable at 3× (7.26 LOC/h) |
|---|---|---|
| 10 | 167 | 1.21 kLOC |
| 12 | 201 | 1.46 kLOC |

**Roughly 1.2 to 1.5 kLOC against a 15 kLOC scope — about 9%.**

### 4.6 The AI Productivity Assumption

**Direction taken.** The Project Manager has directed that the productivity assumption be re-baselined upward on the basis of extensive AI-assisted development, rather than reducing scope. This section records that direction, computes what it must be worth, and attaches the verification trigger that makes it defensible.

**Why it needs a trigger rather than a guarantee.** Three baselined documents bear on this:

- **CON-009** states: *if the calculated development time exceeds the available delivery period, scope must be reduced rather than the estimate optimistically adjusted.* Re-baselining productivity to close a schedule gap is the adjustment CON-009 names. The trigger in this section is what keeps the charter consistent with the constraint instead of contradicting it.
- **CON-005** states that unsupported quality claims are not accepted.
- **STK-010** requires evidence of controlled engineering. An unevidenced guarantee is the opposite of that, and it is the first thing an assessor will probe.

So the assumption is carried as an assumption with a measurement point. It is not recorded as a guarantee, and the charter makes no claim that on-time completion is certain.

**What the assumption must be worth.** Remaining critical path after M1, floor scope, including the new CON-012 to CON-019 work. Not all work is equally AI-accelerable, so each task is split. **[A13]**

| Task | Weeks | Accelerable | Fixed portion |
|---|---|---|---|
| CP-2 Architecture, stack and hosting; close DEC-002/DEC-003 | 1.67 | 40% | 1.00 |
| CP-3 Data model, RBAC, triggers, schemas, transactions, indexing design | 1.68 | 50% | 0.84 |
| CP-5 Core construction + new NFR implementation | 4.97 | 80% | 0.99 |
| CP-8 Test evidence — 80 acceptance criteria incl. 8 new NFR verifications | 2.17 | 70% | 0.65 |
| CP-9 Staging, release readiness, M4 defence preparation | 1.08 | 10% | 0.97 |
| **Totals** | **R = 11.57** | **A = 7.11** | **F = 4.46** |

Available **D = 5.57 weeks.** The accelerable portion must compress into `D − F`:

```
m ≥ A / (D − F)
m ≥ 7.11 / (5.57 − 4.46)
m ≥ 7.11 / 1.11
m ≥ 6.39×
```

**The required multiplier is 6.39× on the ~61% of remaining work that is plausibly AI-accelerable.** Compounded with the 3× prototype adjustment already in the estimate, the effective rate is **≈ 19× COCOMO's commercial baseline.**

**Sensitivity — delivery weeks by multiplier:**

| m | Delivery | Outcome |
|---|---|---|
| 1× | 11.57 wks | misses by 6.00 |
| 2× | 8.01 wks | misses by 2.44 |
| 3× | 6.83 wks | misses by 1.26 |
| 4× | 6.24 wks | misses by 0.67 |
| 6× | 5.64 wks | misses by 0.07 |
| **6.39×** | **5.57 wks** | **exactly fits** |
| 10× | 5.17 wks | 0.40 wks slack |

**Sensitivity — required multiplier if the accelerable fraction is misjudged:**

| Accelerable share of R | Required m |
|---|---|
| 49% | **mathematically impossible at any speed** |
| 55% | 15.95× |
| **61% (assumed)** | **6.39×** |
| 68% | 4.29× |
| 74% | 3.37× |

**This is the finding that matters most in v0.2.** The plan is not merely optimistic — it is *brittle*. A six-point error in one assumption moves the requirement from 6.39× to 15.95×, and at 49% no multiplier closes the gap because the fixed work alone exceeds the window. The hard floor is **F = 4.46 weeks** of work AI cannot compress: architectural judgement, layer-boundary decisions, release readiness and individual defence preparation. That leaves **1.11 weeks of total slack** for everything human.

**Verification trigger — mandatory.** CON-013 requires demonstrable frontend, backend and API progress from week 3, which ends **29 September 2026** — 2.86 weeks into the 5.57-week window, or **51% elapsed.** That client-mandated gate is adopted as the velocity checkpoint:

1. At the week-3 gate, measure delivered scope against the burn implied by m = 6.39×.
2. If actual velocity is below the required rate, **CON-009 scope reduction triggers automatically** against a priority order agreed in advance — Low band first, then Medium, never the CON-001 High-priority floor without a change request to STK-010.
3. The measurement and the decision are recorded in the Decision Log as evidence of control either way.

Agreeing the reduction order *before* the gate is what converts a possible schedule failure into a controlled descope. That is the difference between recovering and explaining.

**Evidentiary obligation.** If AI productivity is the schedule's critical assumption, Member C's **AI Usage Register stops being a compliance formality and becomes primary project evidence.** The brief requires each entry to record what was used, what it produced, and what human verification was applied. That register is where this assumption is either substantiated or found wanting, and it will be read as such.

---

## 5. Time Management Plan

### 5.1 Milestones — Actual Dates

Week 1 anchored to **9 September 2026** per client instruction.

| Milestone | Deliverable | Date | Week | Weeks from M1 | Weighting |
|---|---|---|---|---|---|
| **M1** | Engineering Foundation & Requirements Baseline | **9 Sep 2026** | 1 | 0.00 | 15 |
| *CON-013 gate* | *Demonstrable frontend, backend and API progress* | *23–29 Sep 2026* | *3* | *2.00–2.86* | *—* |
| **M2** | Architecture, Design & Engineering Decisions | **30 Sep 2026** | 4 | 3.00 | 25 |
| **M3** | Controlled Construction, Integration, Quality & Release Readiness | **14 Oct 2026** | 6 | 5.00 | 30 |
| **M4** | Final Product, Project Success & Engineering Defence | **18 Oct 2026** | 6 | 5.57 | 30 |

**Two structural consequences of these dates.**

**The CON-013 gate falls before M2.** Week 3 ends 29 September; M2 is 30 September. Construction must be demonstrable the day *before* the architecture milestone. Member A anticipated this in CON-013: *"Overlaps construction with the M2 design phase rather than following it… the correct response is to record the acceleration and its risk rather than to claim the M1→M2→M3 sequence held unchanged."* This charter records it. The M1→M2→M3 sequence did not hold.

**DEC-002 and DEC-003 must close by 22 September 2026.** Frontend, backend and API work cannot be demonstrated in week 3 without a committed stack and a deployment target. That gives **13 days from M1** to close two decisions Member A deliberately deferred for want of evidence. This is carried as **RK-12**.

### 5.2 PERT — Recommended Delivery Scope

`E = (O + 4M + P) / 6` · `σ² = ((P − O) / 6)²` · `s = √σ²` (Project Management Institute, 2021). Weeks. **CRIT** = critical path; parallel tasks carry float and do not contribute to path variance.

| Task | Path | O | M | P | E | σ² | s |
|---|---|---|---|---|---|---|---|
| CP-1 Requirements baseline & PED v1.0 — **delivered at M1** | CRIT | 1.5 | 2.0 | 3.0 | 2.08 | 0.062 | 0.250 |
| CP-2 Architecture, stack and hosting; close DEC-002/DEC-003 | **CRIT** | 1.0 | 1.5 | 3.0 | 1.67 | 0.111 | 0.333 |
| CP-3 Data model, RBAC, triggers, schemas, transactions, indexing | **CRIT** | 1.0 | 1.5 | 3.0 | 1.68 | 0.111 | 0.333 |
| CP-4 Environment, CI, BC Desktop verification | parallel | 0.5 | 1.0 | 2.0 | 1.08 | 0.062 | 0.250 |
| CP-5 Core construction + new NFR implementation | **CRIT** | 3.0 | 5.0 | 7.0 | 4.97 | 0.444 | 0.667 |
| CP-6 Authentication and server-side authorisation | parallel | 1.0 | 1.5 | 3.0 | 1.67 | 0.111 | 0.333 |
| CP-7 Management reporting view | parallel | 0.5 | 1.0 | 2.0 | 1.08 | 0.062 | 0.250 |
| CP-8 Test evidence — 80 acceptance criteria | **CRIT** | 1.5 | 2.0 | 3.5 | 2.17 | 0.111 | 0.333 |
| CP-9 Staging, release readiness, M4 defence preparation | **CRIT** | 0.5 | 1.0 | 2.0 | 1.08 | 0.062 | 0.250 |

**Worked example (CP-5):**

```
E  = (3.0 + 20.0 + 7.0) / 6 = 30.0 / 6 = 4.97 weeks
σ² = ((7.0 − 3.0) / 6)²     = (0.6667)² = 0.444
s  = √0.444                             = 0.667 weeks
```

**Remaining critical path after M1** (CP-2, 3, 5, 8, 9 — expected values add, variances add, standard deviations do not):

```
Path E  = 1.67 + 1.68 + 4.97 + 2.17 + 1.08 = 11.57 weeks
Path σ² = 0.111 + 0.111 + 0.444 + 0.111 + 0.062 = 0.839
Path s  = √0.839 = 0.92 weeks
```

**Completion probability, `z = (D − E) / s`, against D = 5.57 weeks:**

| Scenario | E | z | P(complete by 18 Oct) |
|---|---|---|---|
| Unaccelerated (m = 1) | 11.57 | −6.55 | **≈ 0.0%** |
| m = 3× | 6.83 | −1.37 | **8.5%** |
| m = 6.39× (required) | 5.57 | 0.00 | **50.0%** |
| m = 10× | 5.17 | +0.43 | **66.7%** |

At exactly the required multiplier the schedule is a coin flip, because the expected duration equals the deadline and half the probability distribution sits beyond it. **A plan that needs 6.39× to reach 50% needs more than 6.39× to be safe.** Reaching 90% confidence needs the expected path at roughly 4.39 weeks — a multiplier near 12×. That is the honest reading of the PERT distribution and it should be stated plainly at the defence rather than discovered there.

**Contingency:** no schedule contingency exists at m = 6.39×. The only contingency available is the §4.6 scope-reduction trigger at the week-3 gate.

---

## 6. Resource & Cost Management

### 6.1 Human Resources

| Role | Member | Responsibility | Artefacts |
|---|---|---|---|
| Project Manager / Member B | Robert van der Merwe | Charter, schedule, risk quantification, sponsor reporting; requirements, acceptance criteria, traceability | This document, SCP-021; FR, NFR, AC registers; RTM v0.2 |
| Member A | Ethan Lindsay | Problem, stakeholders, scope, constraints, decisions | STK, CFL, SCP, CON, DEC registers; PED §2 |
| Member C | Christiaan Burger | Risk, forward engineering, governance, document control | Risk Register, AI Usage Register, GitHub governance |

The team is three students, per CON-004. Robert van der Merwe holds both the Project Manager and Member B roles; the rows are separated by responsibility, not by person.

Review model per **DEC-008**: two-stage protected branching, feature branches to `dev`, `dev` to `main`, two approvals at each merge point.

### 6.2 Material & Equipment Resources

| Resource | Status | Constraint |
|---|---|---|
| Development workstations | BC Desktop platform | CON-008 — availability not guaranteed; verify before M2 |
| Source control & CI | GitHub, protected `main` and `dev` | DEC-008, Master Brief s.9 |
| Architecture style | **Layered — mandated, not chosen** | CON-012 |
| Technology stack | **Not selected — must close by 22 Sep** | DEC-002, RK-12 |
| Hosting platform | **Not selected — must close by 22 Sep** | DEC-003, RK-12 |
| Database | Must support transactions, triggers, four schemas, indexing, encryption at rest | CON-015 – CON-019 |

### 6.3 Benefit Derivation

| Benefit stream | Derivation | Annual |
|---|---|---|
| Triage and status-chasing time recovered | 3 000 requests × 12 min × R280/h | R168 000 |
| Manual management reporting eliminated | 96 h × R520/h | R49 920 |
| Duplicate handling eliminated | 240 duplicates × 0.5 h × R280/h | R33 600 |
| Avoided commercial service-desk licence | 15 agents × R620/month × 12 | R111 600 |
| **Gross** | | **R363 120** |
| *less* annual infrastructure | | (R24 000) |
| **Net annual benefit** | | **R339 120** |

Assumptions **[A5]–[A8]**, unvalidated, and in tension with CON-010 — see the note at §2.4.

### 6.4 Budget

| Category | Case A (commercial) | Case B (incremental) |
|---|---|---|
| Labour — 41.22 person-months × R45 000 | R1 854 896 | R0 (coursework under CON-004) |
| Infrastructure and hosting, year 1 | R24 000 | R24 000 |
| Adoption — staff onboarding and process change | — | R35 000 |
| **Total investment** | **R1 878 896** | **R59 000** |
| Risk contingency (§7.4) | R378 000 | R378 000 |

### 6.5 Financial Calculations

`f = 1/(1+i)^y`, **i = 10% [A9]**

| Year | f | Net cash flow | PV |
|---|---|---|---|
| 1 | 0.90909 | R339 120 | R308 291 |
| 2 | 0.82645 | R339 120 | R280 264 |
| 3 | 0.75131 | R339 120 | R254 786 |
| 4 | 0.68301 | R339 120 | R231 624 |
| 5 | 0.62092 | R339 120 | R210 567 |
| **Total PV (5 yrs)** | | | **R1 285 532** |

#### Case A — Investment R1 878 896

```
Payback:  Cumulative end Y5 (Ci) = −1 878 896 + (5 × 339 120) = −R183 296
          Cumulative end Y6 (Cf) = −183 296 + 339 120         = +R155 824
          N = (0 − (−183 296)) / (155 824 − (−183 296)) × 12
            = 183 296 / 339 120 × 12 = 6.49 months into Year 6
          Total = 60 + 6.49 = 66.5 months (5.54 years)

ROI:      5 yrs: (5 × 339 120 − 1 878 896) / 1 878 896 × 100 = −9.8%
          7 yrs: (7 × 339 120 − 1 878 896) / 1 878 896 × 100 = +26.3%

NPV:      3 yrs:   843 341 − 1 878 896 = −R1 035 555
          5 yrs: 1 285 532 − 1 878 896 = −R593 364
          7 yrs: 1 650 978 − 1 878 896 = −R227 918
         10 yrs: 2 083 746 − 1 878 896 = +R204 850
```

#### Case B — Investment R59 000

```
Payback:  Ci (Y0) = −R59 000 ; Cf (end Y1) = +R280 120
          N = 59 000 / 339 120 × 12 = 2.09 months

ROI:      3 yrs: 958 360 / 59 000 × 100 = 1 624.3%
          5 yrs: 2 773.9%

NPV:      3 yrs: 843 341 − 59 000 = +R784 341
          5 yrs: 1 285 532 − 59 000 = +R1 226 532
```

---

## 7. Risk Management Plan

### 7.1 Scope of This Register

The project maintains two views of the same risk set, deliberately and for different
purposes.

**Member C's Risk Register (v0.4)** is the engineering register required by Master
Brief §12. It scores probability and impact on a 1–3 scale and records cause,
early-warning indicator, mitigation, contingency, owner and status. It is the live
artefact reviewed at every milestone and it is the authoritative register for project
risk.

**The charter register at §7.3** is the quantified project-management view. It
expresses the same exposures in rand so that Risk Exposure (`RE = pL`) and Risk
Reduction Leverage (`RRL`) can be computed, mitigation spend justified and the
contingency fund in §7.4 derived. It exists because the financial model in §6 needs a
monetary risk position, which a 1–3 ordinal scale cannot supply.

**Reconciliation.** The two registers cover the same underlying risks under different
identifiers. The mapping below is maintained by the Project Manager. Where the two
disagree on the standing of a risk, Member C's register governs and this table is
corrected.

| Charter | Member C | Risk |
|---|---|---|
| RK-01 | RSK-007 | Stack or platform unsupported on BC Desktop |
| RK-02 | RSK-008 | Free tier cannot meet audit retention, backup, schemas or encryption at rest |
| RK-03 | RSK-014 *(schedule aspect)* | Capacity shortfall against baselined scope |
| RK-04 | RSK-002 | Retention period never supplied; NFR-4.2 unverifiable |
| RK-05 | RSK-009 | Security officer rejects the CFL-002 reduced status set |
| RK-06 | RSK-010 | NFR verification burden exceeds M3 capacity |
| RK-07 | — | Secrets committed to the repository *(charter-only)* |
| RK-08 | RSK-006 | Campus-context assumption wrong; stakeholder register invalidated |
| RK-09 | — | POPIA breach via over-capture or unrestricted access *(charter-only)* |
| RK-10 | RSK-012 | Uncontrolled scope change erodes the baseline |
| RK-11 | RSK-014 | AI productivity assumption fails to deliver the required multiplier |
| RK-12 | RSK-015 | DEC-002 / DEC-003 not closed by 22 September |
| — | RSK-001 | Requesters keep using informal channels after launch |
| — | RSK-003 | No agreed definition of "overdue" |
| — | RSK-004 | Duplicates recreated inside the platform |
| — | RSK-005 | Reporting detail not supplied post-submission |
| — | RSK-011 | Mobile web usability fails technicians |
| — | RSK-013 | Two-reviewer rule stalls on a three-person team |

Six of Member C's risks have no charter equivalent because they are product and
adoption risks carrying no direct rand exposure to model. Two charter risks have no
equivalent in Member C's register — **RK-07** and **RK-09** — and are to be raised
there at the M2 review. That is the only reconciliation work outstanding.

### 7.2 Key Assumptions & Constraints

Nineteen constraints are baselined as at 09/09/2026. CON-001 to CON-008 as recorded in v0.1. Eleven added on 09/09/2026, ten of them issued **verbally by STK-010** and captured under the **DEC-009** process:

| ID | Cat. | Constraint | Charter consequence |
|---|---|---|---|
| CON-009 | Sched. | Effort and time must be estimated (COCOMO / PERT) | Mandates §4 and §5; names Organic mode; requires scope reduction over optimistic adjustment |
| CON-010 | Qual. | ~100 users, reason about behaviour at 1 000 | NFR-2.1/2.4 raised to 100; NFR-2.7 created; conflicts with §6.3 volume |
| CON-011 | Scope | Web application; mobile via responsive design | Elevates DEC-007 from team judgement to client directive |
| CON-012 | Qual. | Layered architecture | Removes style from M2 decision space; +800 LOC |
| CON-013 | Sched. | Frontend, backend, API progress from week 3 | Gate falls 29 Sep, before M2; forces DEC-002/003 by 22 Sep; adopted as velocity checkpoint |
| CON-014 | Qual. | Logging sufficient to observe runtime performance | NFR-1.11; +300 LOC |
| CON-015 | Qual. | DB changes version controlled, auditable via triggers | NFR-1.9; +600 LOC |
| CON-016 | Qual. | Separate dev/test/staging/production schemas | NFR-1.8; +400 LOC; may exceed free tiers |
| CON-017 | Qual. | Transactional operations with rollback | NFR-1.10; constrains persistence choice |
| CON-018 | Qual. | Appropriate indexing strategy | NFR-2.6; +150 LOC |
| CON-019 | Sec. | RBAC, user grouping, encryption; **actively probed at assessment** | FR-1.6, NFR-3.7; NFR-3.3 becomes a tested property |

### 7.3 Risk Register & Quantification

`RE = pL` · `RRL = (RE_before − RE_after) / C`. Loss values derived as person-months of rework × R45 000, consistent with §4. **[A10]**

| ID | Risk | Source | p | L | RE before | Mitigation | C | p after | RE after | RRL |
|---|---|---|---|---|---|---|---|---|---|---|
| RK-03 | **Capacity shortfall against baselined scope** *(re-rated in v0.2: p 0.75→0.85, L raised for the 15 kLOC rescope)* | CON-004, CON-002 | 0.85 | R360 000 | **R306 000** | Deliver CON-001 floor only; pre-agreed priority-band reduction order | R45 000 | 0.40 | R144 000 | 3.60 |
| RK-11 | **AI productivity assumption fails to deliver 6.39×** *(new v0.2)* | §4.6 | 0.65 | R360 000 | **R234 000** | Velocity checkpoint at the CON-013 week-3 gate (29 Sep) with automatic CON-009 scope reduction; AI Usage Register as evidence | R22 500 | 0.30 | R108 000 | **5.60** |
| RK-09 | POPIA breach via over-capture or unrestricted access | CON-007, CON-019 | 0.20 | R450 000 | R90 000 | NFR-4.1 minimisation review, NFR-3.3 server-side authorisation, NFR-3.7 encryption at rest | R22 500 | 0.05 | R22 500 | 3.00 |
| RK-12 | **DEC-002/DEC-003 not closed by 22 Sep; CON-013 gate missed** *(new v0.2)* | CON-013, DEC-002, DEC-003 | 0.50 | R135 000 | R67 500 | Fix 22 Sep decision deadline; evaluate only stacks meeting CON-004 familiarity; time-box to three candidates | R9 000 | 0.15 | R20 250 | **5.25** |
| RK-01 | Stack or platform unsupported on BC Desktop | CON-008, DEC-002 | 0.40 | R135 000 | R54 000 | Verify candidates on the BC image before the M2 ADR closes | R13 500 | 0.08 | R10 800 | 3.20 |
| RK-06 | NFR verification burden exceeds M3 capacity *(now 30 NFRs, not 22)* | CON-005 | 0.60 | R90 000 | R54 000 | Acceptance criteria written as M3 test skeletons; NFR set capped at 30 | R18 000 | 0.20 | R18 000 | 2.00 |
| RK-08 | Campus-context assumption wrong; stakeholder register invalidated | DEC-001 | 0.15 | R360 000 | R54 000 | Confirm institutional context with STK-010 before M2 architecture | R4 500 | 0.03 | R10 800 | **9.60** |
| RK-10 | Uncontrolled scope change erodes the baseline | CON-001, CON-002 | 0.45 | R112 500 | R50 625 | Appendix E impact analysis; two approvals at both DEC-008 merge points | R6 750 | 0.05 | R5 625 | 6.67 |
| RK-02 | Free tier cannot meet audit retention, backup, four schemas or encryption at rest | CON-003, CON-016, CON-019, DEC-003 | 0.55 | R90 000 | R49 500 | Document free-tier limits for three candidates; price the paid tier before 22 Sep | R11 250 | 0.15 | R13 500 | 3.20 |
| RK-07 | Secrets committed to the repository | CON-006 | 0.25 | R180 000 | R45 000 | CI secret scanning plus pre-commit hook on both protected branches | R9 000 | 0.03 | R5 400 | 4.40 |
| RK-04 | Retention period never supplied; NFR-4.2 unverifiable | DEC-005, CFL-004 | 0.50 | R67 500 | R33 750 | Escalate to information officer; institutional standard as fallback | R9 000 | 0.15 | R10 125 | 2.62 |
| RK-05 | Security officer rejects the CFL-002 reduced status set | CFL-002 (Proposed) | 0.30 | R112 500 | R33 750 | Confirm CFL-002 with STK-006 before the M2 data model is fixed | R6 750 | 0.08 | R9 000 | 3.67 |
| | **TOTALS** | | | | **R1 072 125** | | **R177 750** | | **R378 000** | **3.91** |

**Worked example (RK-11):**

```
RE_before = p × L = 0.65 × 360 000 = R234 000
RE_after  = p × L = 0.30 × 360 000 = R108 000
RRL = (234 000 − 108 000) / 22 500 = 126 000 / 22 500 = 5.60
```

### 7.4 Interpretation & Contingency

**Highest exposure: RK-03 at R306 000**, with **RK-11 second at R234 000.** Together they account for **50% of total exposure before mitigation** — and they are the same risk seen from two directions. RK-03 is the capacity shortfall; RK-11 is the failure of the assumption adopted to close it. The register would be dishonest if it recorded one without the other.

**Highest leverage: RK-08 at RRL 9.60**, then **RK-10 at 6.67**, then **RK-11 at 5.60** and **RK-12 at 5.25.** Both new risks land in the top four for leverage, which is the useful part: the week-3 velocity checkpoint and the 22 September decision deadline are both cheap and both remove a large exposure. **Do RK-12 first** — it has a hard date 13 days from M1 and everything downstream waits on it.

Every mitigation returns more than its cost. Portfolio RRL **3.91**: R177 750 of mitigation removes R694 125 of exposure.

**Contingency fund: R378 000**, equal to residual exposure after mitigation. **Schedule contingency: none.** At m = 6.39× the expected critical path equals the deadline exactly. The §4.6 scope-reduction trigger is the only schedule contingency this project has.

---

## 8. Quality & Procurement Management

### 8.1 Quality Standards

Governed by **ISO/IEC 25010:2023** (International Organization for Standardization, 2023), mapped to the four-category SAD scheme used in Member B's NFRs.

| SAD category | ISO/IEC 25010:2023 characteristic | Requirements | New in v0.2 |
|---|---|---|---|
| 1. Operational | Compatibility, Flexibility (portability), Reliability (recoverability, faultlessness) | NFR-1.1 – NFR-1.11 | NFR-1.7 – NFR-1.11 |
| 2. Performance | Performance Efficiency, Reliability (availability, capacity) | NFR-2.1 – NFR-2.7 | NFR-2.6, NFR-2.7 |
| 3. Security | Security — confidentiality, integrity, non-repudiation, accountability, authenticity | NFR-3.1 – NFR-3.7 | NFR-3.7 |
| 4. Cultural & Political | Compliance aspects of Security and Maintainability | NFR-4.1 – NFR-4.5 | — |

The 2023 edition renamed portability to flexibility and usability to interaction capability, and added safety as a ninth characteristic; the mapping above uses the current names.

**CON-005** makes each measurable attribute an M3 verification obligation. The NFR set grew from 22 to 30 on 09/09/2026, a 36% increase in verification load in the same period the window contracted — this is RK-06.

### 8.2 Quality Assurance Process

| Control | Mechanism | Evidence |
|---|---|---|
| Peer review | Two approvals at both DEC-008 merge points (feature→`dev`, `dev`→`main`) | Pull Request review comments |
| Branch protection | `main` and `dev` protected; enforced in settings, not verbally | Repository settings |
| Traceability | RTM live; Design/Test/Release columns filled as each milestone supplies evidence | RTM v0.2 |
| Acceptance verification | 80 Given/When/Then criteria, structured as M3 test skeletons | Acceptance Criteria register v0.2 |
| Change control | Appendix E impact analysis on any baseline change; §3.5 records the identifier reassignment | Decision Log, §3.5 |
| Verbal requirement capture | **DEC-009** — client instructions recorded, dated, attributed and reflected back for confirmation | Decision Log, Constraints register |
| Database configuration control | Ordered migration scripts version controlled; trigger-based audit (NFR-1.9) | Repository, migration history |
| Environment separation | Four schemas, scripted migrations, parity maintained (NFR-1.8) | Deployment configuration |
| Performance measurement | Structured per-operation logging with no personal information (NFR-1.11) | Performance logs |
| Adversarial security testing | CON-019 — controls actively probed; NFR-3.3 verified by bypassing the interface | AC-NFR-3.3 test evidence |
| **AI usage** | **Register recording what was used, what it produced, what human verification was applied** | **AI Usage Register — now primary evidence for §4.6, not a formality** |
| Repository history | Authentic progression over time; bulk upload before assessment is failing evidence | Commit history |

### 8.3 Procurement Strategy

> **DEC-002 and DEC-003 remain formally deferred, but CON-013 gives them a hard deadline of 22 September 2026.** This section states the decision criteria and cost bands. It does not close either decision — the M2 ADRs do.

**Criteria, in precedence order:**

1. **CON-008** — verified availability on BC Desktop. A choice that cannot be installed is not a choice.
2. **CON-004** — team capability, now sharpened by CON-013: a stack requiring learning time cannot demonstrate progress in week 3.
3. **CON-015 to CON-019** — the database must support transactions with rollback, triggers, four separate schemas, a justified indexing strategy and encryption at rest. **This is the criterion most likely to eliminate free tiers**, and it grew materially on 09/09/2026.
4. **CON-012** — layered architecture is mandated, so the stack must not fight it.
5. **CON-003** — cost, applied only after the above are satisfied.

| Tier | Annual | Meets NFR-1.4, 1.5, 1.8, 3.7? |
|---|---|---|
| Free | R0 | **Unlikely.** Audit retention, automated backup, multiple schemas and encryption at rest are commonly paid features |
| Entry paid | R18 000 – R30 000 | Generally yes; requires per-vendor verification |
| Managed platform | R60 000+ | Yes, but exceeds the CON-003 preference without justification |

The budget provisions **R24 000/year**, assuming an entry paid tier. **This is the charter's position on the CON-003 versus CON-006/CON-007/CON-019 trade-off that Member A recorded and deliberately left open: the accountability and encryption obligations win, and the cost is carried.** If DEC-003 selects a free tier, NFR-1.4, NFR-1.5, NFR-1.8, NFR-3.7 and NFR-4.5 must be formally relaxed through change control and RK-02 is realised.

**Vendor dependencies:** GitHub only. NFR-1.3 and SCP-016 exclude all campus-system integration, removing an entire class of interface risk.

---

## 9. Stakeholders & Approvals

### 9.1 Key Stakeholders

| ID | Stakeholder | Primary need | Influence / Interest | Grid |
|---|---|---|---|---|
| STK-001 | Student / staff requester | Submit quickly; know it was received and what is happening | Low / High | Keep Informed |
| STK-002 | Facilities / maintenance technician | See assigned work; update status where the work is done | Med / High | Manage Closely |
| STK-003 | IT support technician | Same queue behaviour, different categories and turnaround | Med / High | Manage Closely |
| STK-004 | Service desk coordinator | Avoid duplicate and unassigned requests; whole-queue visibility | Med / High | Manage Closely |
| STK-005 | Operations manager | Reliable open, overdue, resolved, closed view by category | High / High | Manage Closely |
| STK-006 | Campus security officer | Restricted handling and visibility of sensitive reports | Med / Med | Keep Satisfied |
| STK-007 | System administrator | Manageable role model; reliable onboarding and revocation | Med / Med | Keep Satisfied |
| STK-008 | Campus executive sponsor | Accountability and performance without unsustainable cost | High / Med | Keep Satisfied |
| STK-009 | Information officer / POPIA | Lawful, auditable handling of personal information (Republic of South Africa, 2013) | High / Low | Keep Satisfied |
| **STK-010** | **Lecturer / client proxy (Michael)** | **Evidence of controlled engineering, not just working software** | **High / High** | **Manage Closely** |

Member A's takeaway holds: every stakeholder identified holds either power or a stake — nobody is safely ignorable.

**Stakeholder conflicts — all four are Proposed, none Agreed.** This corrects v0.1, which wrongly recorded CFL-001 and CFL-003 as resolved.

| ID | Conflict | Status | Charter consequence |
|---|---|---|---|
| CFL-001 | Submission speed (STK-001) vs reporting richness (STK-005) | **Proposed** | DEC-006 is the intended resolution but is unconfirmed with either party |
| CFL-002 | Requester transparency (STK-001) vs security confidentiality (STK-006) | **Proposed** | FR-1.5, FR-3.5, NFR-3.3, NFR-4.4 all rest on it — RK-05 |
| CFL-003 | Coordinator assignment (STK-004) vs technician self-selection (STK-002/003) | **Proposed** | FR-5.1 – FR-5.3 rest on it |
| CFL-004 | Reporting history (STK-005) vs minimisation and retention (STK-009) | **Proposed — retention deferred** | NFR-4.2 blocked; DEC-005 outstanding — RK-04 |

### 9.2 Approval Conditions

Recommended for approval **subject to five conditions**, each traceable to a finding above:

1. **The §4.6 verification trigger is adopted, not merely noted.** The AI productivity assumption requires **6.39×** on the accelerable work and delivers only a **50% completion probability** at that rate. The week-3 gate on **29 September** and the pre-agreed scope-reduction order are what keep the plan consistent with CON-009 rather than in breach of it. Without the trigger this charter asserts a schedule it cannot evidence, which CON-005 does not permit and STK-010 has specifically said is not what is being assessed.
2. **DEC-002 and DEC-003 close by 22 September 2026.** Thirteen days from M1. CON-013's week-3 gate is unreachable otherwise, and RK-12 is realised.
3. **The CON-010 / volume conflict is resolved.** 100 concurrent users cannot be reconciled with 3 000 requests/year; the §6.3 benefit model and NFR-2.2 both depend on which figure is right.
4. **Member C's Risk Register v0.4 is adopted as the authoritative register.** §7.3 is retained as the quantified project-management view, with the reconciliation mapping in §7.1. Charter risks **RK-07** and **RK-09** are to be raised in Member C's register at the M2 review.
5. **Case A exposure is acknowledged, and the project sponsor is named.** Rebuilding CivicConnect commercially now costs **R1 878 896** and does not reach NPV-positive until year 10. The charter funds infrastructure for year 1 only. The STK-008 sponsor role has not yet been filled by a named individual.

### 9.3 Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Project Manager | Robert van der Merwe | | |
| Project Sponsor | *STK-008 — not yet identified* | | |
| Finance Representative | | | |
| Client / Module Lecturer | Michael (STK-010) | | |

---

## Appendix A — Assumption Register

| ID | Assumption | Value | Used in | Validation from |
|---|---|---|---|---|
| A1 | Delivered source size, tests excluded | **15.0 kLOC** *(was 12.0)* | §4.2 | Team — derived from 49 FR / 30 NFR baseline |
| A2 | Fully loaded cost per person-month | R45 000 | §4.3 | Finance |
| A3 | Working hours per person-month | 152 h | §4.5 | Standard convention |
| A4 | Prototype productivity multiplier over COCOMO commercial baseline | 3× | §4.5 | Team judgement |
| A5 | Annual request volume | 3 000 | §6.3 | Service desk — **conflicts with CON-010** |
| A6 | Staff time saved per request | 12 min | §6.3 | Service desk |
| A7 | Loaded staff / manager rate | R280 / R520 per hour | §6.3 | Finance |
| A8 | Commercial licence avoided | 15 agents × R620/month | §6.3 | Market quotation |
| A9 | Discount rate | 10% nominal | §6.5 | Finance |
| A10 | Risk loss values as person-months of rework × R45 000 | — | §7.3 | Team |
| A11 | Platform cost bands | R0 / R18–30k / R60k+ | §8.3 | Vendor quotations by 22 Sep |
| A12 | Delivery window | **5.57 weeks, 9 Sep – 18 Oct 2026** | §5 | **Client-confirmed** |
| **A13** | **AI-accelerable share of remaining critical path** | **61% (7.11 of 11.57 weeks)** | **§4.6** | **Team — the most consequential assumption in this charter. At 49% the schedule is impossible at any multiplier.** |
| **A14** | **Achieved AI productivity multiplier** | **6.39× required; actual unknown** | **§4.6, §5.2** | **Measured at the 29 Sep week-3 gate. Recorded in the AI Usage Register.** |

## Appendix B — Formula Reference

| Framework | Formula |
|---|---|
| COCOMO Effort | `E = a(kLOC)^b` |
| COCOMO Development Time | `T = cE^d` |
| COCOMO Average Developers | `N = E / T` |
| COCOMO Development Cost | `C = E × u` |
| COCOMO Organic parameters | a = 2.4, b = 1.05, c = 2.5, d = 0.38 |
| PERT Expected Value | `E = (O + 4M + P) / 6` |
| PERT Variance | `σ² = ((P − O) / 6)²` |
| PERT Standard Deviation | `s = √σ²` |
| PERT Completion probability | `z = (D − E) / s` *(supplementary)* |
| Schedule speed-up requirement | `m ≥ A / (D − F)` *(supplementary — §4.6)* |
| Risk Exposure | `RE = pL` |
| Risk Reduction Leverage | `RRL = (RE_before − RE_after) / C` |
| Payback Months | `N = (Cp − Ci) / (Cf − Ci) × 12` |
| Return on Investment | `ROI = (Net Returns / Investment Costs) × 100%` |
| NPV Factor | `f = 1 / (1 + i)^y` |
| Present Value | `PV = FV × f` |
| Net Present Value | `NPV = Total Present Value − Project Cost` |

## Appendix C — References

Boehm, B.W. (1981) *Software Engineering Economics.* Englewood Cliffs, NJ:
Prentice-Hall.

International Organization for Standardization (2023) *ISO/IEC 25010:2023 Systems and
software engineering — Systems and software Quality Requirements and Evaluation
(SQuaRE) — Product quality model.* 2nd edn. Geneva: ISO. Available at:
https://www.iso.org/standard/78176.html (Accessed: 9 September 2026).

Project Management Institute (2021) *A Guide to the Project Management Body of
Knowledge (PMBOK Guide).* 7th edn. Newtown Square, PA: Project Management Institute.

Republic of South Africa (2013) *Protection of Personal Information Act 4 of 2013.*
Government Gazette No. 37067, 26 November 2013. Pretoria: Government Printer. Available
at: https://www.gov.za/documents/protection-personal-information-act (Accessed: 9
September 2026).