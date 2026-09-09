# Project Charter
## CivicConnect — Community Service Request Management Platform

**Document status:** v0.1 Draft — for sponsor and finance review
**Prepared by:** Robert, Project Manager
**Date prepared:** 8 September 2026

> **Note on inputs.** Every figure in this charter is derived, not asserted. Sections 4, 5, 6, 7 and 8 show the substitution for each formula so the arithmetic can be checked independently. Assumptions are flagged **[A#]** and consolidated in Appendix A. Calendar dates are the one input not yet supplied — see the note at Section 5.1.

---

## 1. General Project Information

| Field | Value |
|---|---|
| Project name | CivicConnect — Community Service Request Management Platform |
| Project manager | Robert |
| Project sponsor | Campus Sponsor — role identified as **STK-008 Campus executive sponsor** |
| Expected start date | Week 1 of the SEN381 delivery period *[calendar date required]* |
| Expected completion date | Week 13 *[calendar date required]* |
| Organisational unit | Software Engineering 381 (SEN381), Belgium Campus |
| Governing documents | SEN381 CivicConnect Master Project Brief v1.1; Member A's baselined Scope, Stakeholder, Constraint and Decision artefacts; Member B's Requirements Baseline v0.1 |
| Delivery context | Campus / educational institution, per **DEC-001** |

---

## 2. Project Overview & Justification

### 2.1 Problem Statement

Service requests across the campus — facility faults, IT support, lost property and security concerns — are raised through fragmented informal channels. The consequences are structural, not cosmetic:

- No single controlled record exists for a request from submission to closure.
- Ownership is unclear, producing duplicate effort and unassigned work.
- Requesters have no visibility of progress and resort to chasing.
- Management has no reliable information on outstanding, overdue or resolved work.

The absence of a controlled lifecycle record is the root cause: accountability, visibility and reporting are all downstream of it.

### 2.2 Business Case & Purpose

CivicConnect establishes one controlled record per request, with role-based access, enforced status transitions and an immutable action history. The purpose is not to digitise a form; it is to make ownership and progress verifiable.

Value is realised in three ways, quantified in Section 6.3: staff time recovered from manual triage and status chasing, elimination of duplicate handling, and management reporting produced from the record rather than reconstructed by hand.

### 2.3 Project Objectives & Metrics

| # | Objective | Measure | Target | Traces to |
|---|---|---|---|---|
| O1 | Establish a single controlled lifecycle record | Requests with a complete, unbroken status history | 100% | FR-6.1 – FR-6.7 |
| O2 | Make ownership unambiguous at all times | Requests in a non-terminal status with no recorded owner | 0 | FR-5.1 – FR-5.4 |
| O3 | Give requesters self-service visibility | Status enquiries handled without staff contact | ≥ 80% | FR-3.1 – FR-3.4 |
| O4 | Produce management information from the record | Reporting cycle time to produce status and category counts | < 5 seconds | FR-8.1, NFR-2.3 |
| O5 | Protect personal information lawfully | Personal-information fields with no mapped processing purpose | 0 | NFR-4.1, CON-007 |
| O6 | Deliver against a controlled baseline | Controlled artefacts changed outside the two-reviewer PR model | 0 | Master Brief s.9 |

### 2.4 Financial Viability — Summary

Two investment cases are presented because they answer different questions. Full derivations in Section 6.

| Metric | Case A: full commercial cost | Case B: incremental cost to the institution |
|---|---|---|
| Investment | R1 491 453 | R59 000 |
| Net annual benefit | R339 120 | R339 120 |
| **Payback period** | **52.8 months (4.40 years)** | **2.1 months** |
| **ROI (3 years)** | **−31.8%** | **1 624.3%** |
| **ROI (5 years)** | **13.7%** | **2 773.9%** |
| **NPV (3 years, i = 10%)** | **−R648 111** | **R784 341** |
| **NPV (5 years, i = 10%)** | **−R205 921** | **R1 226 532** |

**Interpretation.** Case A prices the build at commercial rates and is the honest answer to "should this be bought or built commercially?" — over three years it does not pay back, and it only turns NPV-positive in year 7. Case B prices the actual incremental cost to Belgium Campus, where development labour is delivered as coursework under **CON-004** and carries no marginal cost; on that basis the project pays back inside one academic term.

**The recommendation follows Case B**, with the explicit caveat that Case A is what the institution would face if it had to commission the same system after the academic project ends. That is a material governance point for the sponsor, not a footnote.

---

## 3. Project Scope

Imported verbatim from Member A's baselined Scope Baseline. Identifiers are stable and are the join key to Member B's requirements.

### 3.1 In Scope (committed — the CON-001 capability floor)

| ID | Capability |
|---|---|
| SCP-001 | Submit a service request with category, location and description |
| SCP-002 | Controlled category mechanism |
| SCP-003 | View status and history of own requests |
| SCP-004 | Feedback when a request is accepted, rejected, updated or completed (in-application) |
| SCP-005 | Staff view of requests relevant to their authorisation |
| SCP-006 | Search, filter and sort requests |
| SCP-007 | Assign or accept responsibility for a request |
| SCP-008 | Controlled status transitions with recorded acting user |
| SCP-009 | Record actions, comments and resolution information |
| SCP-010 | Resolve or close requests where authorised |
| SCP-011 | Management view of open, overdue, resolved and closed by category and status |
| SCP-012 | Authentication and role-based access control |

### 3.2 Deferred (in the product vision, not in this delivery)

| ID | Item | Blocked by |
|---|---|---|
| SCP-014 | Email and push notification | DEC-003 (hosting platform deferred) |
| SCP-015 | Photograph attachment | DEC-003 (storage cost and platform limits) |
| SCP-019 | Bulk import of historical requests | Data availability |
| SCP-020 | Automated retention enforcement | DEC-005 (retention period deferred) |

### 3.3 Out of Scope (excluded)

| ID | Exclusion |
|---|---|
| SCP-013 | Native mobile application (**DEC-007**) |
| SCP-016 | Integration with campus systems — student records, HR, asset register |
| SCP-017 | Financial processing, procurement or billing |
| SCP-018 | Multi-campus or multi-tenant operation |

### 3.4 Deliverables

| # | Deliverable | Milestone | Weighting |
|---|---|---|---|
| D1 | Project Engineering Document (PED) v1.0 — requirements baseline, RTM, risk register, decision log | M1 | 15 |
| D2 | PED v2.0 — architecture, data model, ADRs closing DEC-002 and DEC-003 | M2 | 25 |
| D3 | PED v3.0 — construction, integration, CI, test and security evidence, release readiness | M3 | 30 |
| D4 | PED v4.0 — final product, project success evidence, individual engineering defence | M4 | 30 |

### 3.5 Acceptance Criteria

Acceptance is governed by Member B's Acceptance Criteria register: **71 criteria in Given / When / Then form, covering all 48 functional and 22 non-functional requirements.** Each criterion states an observable outcome markable pass or fail by a third party without reference to the team.

The charter adopts that register in full rather than restating it. Four representative criteria, chosen because they gate the objectives in Section 2.3:

| AC ID | Verifies | Criterion |
|---|---|---|
| AC-FR-6.3 | FR-6.3 | *Given* a completed status transition, *when* the request history is retrieved, *then* the entry records the acting user, previous status, new status, date and time. |
| AC-FR-5.3 | FR-5.3 | *Given* a request already assigned to Technician 1, *when* Technician 2 attempts to accept it, *then* the system refuses, the recorded owner remains Technician 1, and the refused attempt is recorded. |
| AC-NFR-3.3 | NFR-3.3 | *Given* an authenticated user whose role does not authorise an operation, *when* that operation is invoked directly against the server interface bypassing the user interface, *then* the server refuses the operation. |
| AC-NFR-4.1 | NFR-4.1 | *Given* the submission form and stored data model, *when* each personal-information field is reviewed against the submit, assign, resolve and report purposes, *then* every field maps to at least one purpose and no field maps to none. |

**Project-level acceptance gate:** all High-priority acceptance criteria pass, the RTM shows Design, Test and Release references populated for every High-priority requirement, and baseline sign-off is recorded.

---

## 4. Software Estimation & Effort (Basic COCOMO)

### 4.1 Mode Selection

**Development mode: Organic.** Parameters a = 2.4, b = 1.05, c = 2.5, d = 0.38.

Justification against the standard criteria:

| Criterion | CivicConnect | Supports |
|---|---|---|
| Team size | 3 people (**CON-004**) | Organic |
| Problem familiarity | Request lifecycle with role-based access — well-understood application class | Organic |
| External interface rigidity | None. **NFR-1.3** removes all campus-system dependencies; **SCP-016** excludes integration | Organic |
| Requirements volatility tolerance | Baselined but changeable through control (**CON-001**) | Organic |
| Innovation required | None. No novel algorithms or hardware constraints | Organic |

Semi-Detached was considered and rejected: it applies where a medium team mixes experienced and inexperienced members against partly rigid requirements. CivicConnect has neither the rigidity nor the scale. The consequence of the choice is stated in Section 4.4.

### 4.2 Size Estimate

**Estimated size: 12.0 kLOC delivered source, excluding test code (COCOMO convention). [A1]**

Derived bottom-up from Member B's baseline rather than assumed:

| Component | Basis | LOC |
|---|---|---|
| Simple functional requirements | ~30 FRs × ~120 LOC (model, controller, view) | 3 600 |
| Moderate functional requirements | ~12 FRs × ~250 LOC | 3 000 |
| Complex functional requirements | ~6 FRs × ~450 LOC (RBAC evaluation, transition model, reporting aggregation) | 2 700 |
| Non-functional cross-cutting infrastructure | Authentication, hashing, TLS config, logging, session management, responsive layer, health endpoint | 2 200 |
| Scaffolding, data access, migrations, routing, configuration | — | 1 500 |
| **Total** | | **13 000** |
| **Rounded delivered estimate** | Allowing for reuse across the 48 FRs | **12 000** |

### 4.3 Calculations

**Effort:**

```
E = a(kLOC)^b
E = 2.4 × (12.0)^1.05
E = 2.4 × 13.5860
E = 32.61 person-months
```

**Development time:**

```
T = cE^d
T = 2.5 × (32.61)^0.38
T = 2.5 × 3.7591
T = 9.40 months
```

**Average number of developers:**

```
N = E / T
N = 32.61 / 9.40
N = 3.47 developers
```

**Development cost:**

```
C = E × u        where u = R45 000 per person-month  [A2]
C = 32.61 × 45 000
C = R1 467 453
```

### 4.4 Sensitivity Analysis

| kLOC | E (person-months) | T (months) | N (developers) | C |
|---|---|---|---|---|
| 8 | 21.30 | 7.99 | 2.67 | R958 668 |
| 10 | 26.93 | 8.74 | 3.08 | R1 211 780 |
| **12** | **32.61** | **9.40** | **3.47** | **R1 467 453** |
| 14 | 38.34 | 9.99 | 3.84 | R1 725 274 |

The conclusion in Section 4.5 holds across the entire plausible size range, which is why the estimate is presented as robust rather than precise.

### 4.5 The Central Finding — Capacity Deficit

COCOMO says the baselined scope needs **32.61 person-months over 9.40 months with 3.47 full-time developers.**

Actual available resource under **CON-004**: three students, part-time, across a 13-week delivery window.

| Hours/week/student | Total hours | Capacity (person-months) | Deficit vs 32.61 pm |
|---|---|---|---|
| 8 | 312 | 2.05 | **15.9×** |
| 10 | 390 | 2.57 | **12.7×** |
| 12 | 468 | 3.08 | **10.6×** |

*(One person-month = 152 hours: 19 working days × 8 hours.)* **[A3]**

**Reconciling the model with reality.** A 12× deficit does not mean the project is undeliverable — it means COCOMO's productivity constant is calibrated on commercial-grade delivery. At 12 kLOC and 32.61 person-months, the model implies **2.42 LOC per hour**, a figure that absorbs formal specification, full regression suites, production documentation, QA and project management overhead. A student prototype legitimately achieves higher raw output per hour because much of that overhead is either absent or already produced as separate coursework artefacts.

Applying a **3× prototype productivity adjustment [A4]** gives realistic delivery capacity:

| Hours/week | Total hours | Achievable at 3× (7.26 LOC/h) |
|---|---|---|
| 10 | 390 | **2.83 kLOC** |
| 12 | 468 | **3.40 kLOC** |

**Approximately 2.8 – 3.4 kLOC is deliverable — around 25% of the full baselined scope.**

**Recommendation:** deliver the **CON-001 capability floor** (the 39 High-priority functional requirements and the High-priority security and operational NFRs) at prototype grade, and stage the remaining Medium and Low bands as documented future scope. This is a schedule-driven descope, not a scope reduction: **CON-001 states the capability floor cannot be traded away**, so the Medium and Low bands must be recorded as deferred through the Appendix E change process rather than silently dropped. Section 7 carries this as **RK-03**, the highest-exposure risk in the register.

---

## 5. Time Management Plan

### 5.1 Milestones

> **Input required.** The Master Project Brief specifies milestone weightings but no calendar dates. The schedule below is week-relative, anchored to Week 1 of the SEN381 delivery period. Replace the week numbers with dates before the charter is signed; the PERT arithmetic is unaffected.

| Milestone | Deliverable | Week (planned) | Weighting |
|---|---|---|---|
| M1 | Engineering Foundation & Requirements Baseline | Week 3 | 15 |
| M2 | Architecture, Design & Engineering Decisions | Week 7 | 25 |
| M3 | Controlled Construction, Integration, Quality & Release Readiness | Week 11 | 30 |
| M4 | Final Product, Project Success & Engineering Defence | Week 13 | 30 |

### 5.2 PERT Estimation — Full Baselined Scope

Formulas: `E = (O + 4M + P) / 6` · `σ² = ((P − O) / 6)²` · `s = √σ²`. All durations in weeks.

Tasks marked **CRIT** lie on the critical path. Remaining tasks run in parallel across the three team members and carry float; their variance does not contribute to path variance.

| Task | Description | Path | O | M | P | E | σ² | s |
|---|---|---|---|---|---|---|---|---|
| CP-1 | Requirements baseline & PED v1.0 (M1) | **CRIT** | 2.0 | 3.0 | 5.0 | 3.17 | 0.250 | 0.500 |
| CP-2 | Architecture, stack & hosting; ADRs closing DEC-002/DEC-003 | **CRIT** | 2.0 | 3.0 | 6.0 | 3.33 | 0.444 | 0.667 |
| CP-3 | Data model & RBAC design (DEC-004) | **CRIT** | 1.0 | 2.0 | 4.0 | 2.17 | 0.250 | 0.500 |
| CP-4 | Environment, CI, BC Desktop verification (CON-008) | parallel | 1.0 | 1.5 | 4.0 | 1.83 | 0.250 | 0.500 |
| CP-5 | Core construction: submission, lifecycle, assignment | **CRIT** | 3.0 | 5.0 | 8.0 | 5.17 | 0.694 | 0.833 |
| CP-6 | Authentication & server-side authorisation (NFR-3.1–3.3) | parallel | 1.5 | 2.5 | 5.0 | 2.75 | 0.340 | 0.583 |
| CP-7 | Management reporting view (FR-8.1–8.6) | parallel | 1.0 | 2.0 | 4.0 | 2.17 | 0.250 | 0.500 |
| CP-8 | NFR verification & test evidence (CON-005) | **CRIT** | 2.0 | 3.0 | 6.0 | 3.33 | 0.444 | 0.667 |
| CP-9 | Staging, release readiness, M4 defence prep | **CRIT** | 1.0 | 2.0 | 3.5 | 2.08 | 0.174 | 0.417 |

**Worked example (CP-5):**

```
E  = (O + 4M + P) / 6 = (3.0 + 20.0 + 8.0) / 6 = 31.0 / 6 = 5.17 weeks
σ² = ((P − O) / 6)²   = ((8.0 − 3.0) / 6)²    = (0.8333)²  = 0.694
s  = √σ²              = √0.694                             = 0.833 weeks
```

**Critical path totals** (expected values add; variances add; standard deviations do **not** add):

```
Path E  = 3.17 + 3.33 + 2.17 + 5.17 + 3.33 + 2.08 = 19.25 weeks
Path σ² = 0.250 + 0.444 + 0.250 + 0.694 + 0.444 + 0.174 = 2.257
Path s  = √2.257 = 1.50 weeks
```

**Probability of completion** using `z = (D − E) / s`:

| Deadline D | z | P(complete ≤ D) |
|---|---|---|
| 13 weeks (available) | −4.16 | **0.0%** |
| 15 weeks | −2.83 | 0.2% |
| 17 weeks | −1.50 | 6.7% |
| 20 weeks | +0.50 | 69.1% |

The full baselined scope has **no realistic probability of completion** within the available window. This corroborates the COCOMO finding in Section 4.5 through an entirely independent method.

### 5.3 PERT Estimation — Recommended Delivery Scope

Re-estimated for the CON-001 capability floor at prototype grade, on a familiar stack per **CON-004**.

| Task | Path | O | M | P | E | σ² | s |
|---|---|---|---|---|---|---|---|
| CP-1 Requirements baseline & PED v1.0 | **CRIT** | 1.5 | 2.0 | 3.0 | 2.08 | 0.062 | 0.250 |
| CP-2 Architecture on a familiar stack | **CRIT** | 1.0 | 1.5 | 3.0 | 1.67 | 0.111 | 0.333 |
| CP-3 Data model & RBAC design | **CRIT** | 0.5 | 1.0 | 2.0 | 1.08 | 0.062 | 0.250 |
| CP-4 Environment, CI, BC Desktop verification | parallel | 0.5 | 1.0 | 2.0 | 1.08 | 0.062 | 0.250 |
| CP-5 Core construction: capability floor only | **CRIT** | 2.0 | 3.0 | 5.0 | 3.17 | 0.250 | 0.500 |
| CP-6 Authentication & server-side authorisation | parallel | 1.0 | 1.5 | 3.0 | 1.67 | 0.111 | 0.333 |
| CP-7 Management reporting view | parallel | 0.5 | 1.0 | 2.0 | 1.08 | 0.062 | 0.250 |
| CP-8 Test evidence for High-priority ACs only | **CRIT** | 1.0 | 1.5 | 3.0 | 1.67 | 0.111 | 0.333 |
| CP-9 Staging, release readiness, M4 defence prep | **CRIT** | 0.5 | 1.0 | 2.0 | 1.08 | 0.062 | 0.250 |

```
Path E  = 2.08 + 1.67 + 1.08 + 3.17 + 1.67 + 1.08 = 10.75 weeks
Path σ² = 0.062 + 0.111 + 0.062 + 0.250 + 0.111 + 0.062 = 0.660
Path s  = √0.660 = 0.81 weeks
z       = (13 − 10.75) / 0.81 = +2.77
```

**P(complete ≤ 13 weeks) = 99.7%**

The descope moves the project from an approximately 0% to an approximately 99.7% probability of on-time completion. **This is the single most important number in the charter** and is the quantitative basis for the recommendation in Section 4.5.

Schedule contingency available: 13 − 10.75 = **2.25 weeks**, equal to 2.8 standard deviations of path variability.

---

## 6. Resource & Cost Management

### 6.1 Human Resources

| Role | Member | Responsibility | SEN381 artefact ownership |
|---|---|---|---|
| Project Manager | Robert | Charter, schedule, risk, sponsor reporting | This document |
| Member A | — | Problem, stakeholders, scope, constraints, decisions | STK, CFL, SCP, CON, DEC registers |
| Member B | — | Requirements, acceptance criteria, traceability | FR, NFR, AC registers; RTM |
| Member C | — | Risk, forward engineering, governance, document control | Risk Register, AI Usage Register, GitHub governance, PED assembly |

All three members review every controlled artefact under the two-reviewer Pull Request model. Production is divided; understanding is not.

### 6.2 Material & Equipment Resources

| Resource | Status | Constraint |
|---|---|---|
| Development workstations | BC Desktop platform | **CON-008** — availability and support not guaranteed; must be verified before the M2 technology commitment |
| Source control & CI | GitHub with protected `main` | Master Brief s.9; branch protection enforced in settings |
| Application hosting | **Not selected** | **DEC-003** deferred |
| Technology stack | **Not selected** | **DEC-002** deferred |
| Database & backup | **Not selected** | Must satisfy NFR-1.4 (90-day log retention) and NFR-1.5 (24-hour RPO) |

### 6.3 Benefit Derivation

| Benefit stream | Derivation | Annual value |
|---|---|---|
| Triage and status-chasing time recovered | 3 000 requests/yr × 12 min × R280/h | R168 000 |
| Manual management reporting eliminated | 96 h/yr × R520/h | R49 920 |
| Duplicate request handling eliminated | 240 duplicates/yr × 0.5 h × R280/h | R33 600 |
| Avoided commercial service-desk licence | 15 agents × R620/month × 12 | R111 600 |
| **Gross annual benefit** | | **R363 120** |
| *less* annual infrastructure | | (R24 000) |
| **Net annual benefit** | | **R339 120** |

Volume, time-saving and rate assumptions are **[A5]** – **[A8]** and require sponsor validation before the charter is signed.

### 6.4 Budget Breakdown

| Category | Case A (commercial) | Case B (incremental) |
|---|---|---|
| Labour — 32.61 person-months × R45 000 | R1 467 453 | R0 (coursework under CON-004) |
| Infrastructure & hosting, year 1 | R24 000 | R24 000 |
| Adoption: staff onboarding and process change | — | R35 000 |
| **Total investment** | **R1 491 453** | **R59 000** |
| Risk contingency (Section 7.4) | R200 250 | R200 250 |

### 6.5 Financial Viability — Calculations

Discount rate **i = 10%**, applied to Net Present Value Factor `f = 1 / (1 + i)^y`. **[A9]**

| Year (y) | f = 1/(1.10)^y | Net cash flow (FV) | PV = FV × f |
|---|---|---|---|
| 1 | 0.90909 | R339 120 | R308 291 |
| 2 | 0.82645 | R339 120 | R280 264 |
| 3 | 0.75131 | R339 120 | R254 786 |
| 4 | 0.68301 | R339 120 | R231 624 |
| 5 | 0.62092 | R339 120 | R210 567 |
| **Total PV (5 years)** | | | **R1 285 532** |
| Total PV (3 years) | | | R843 341 |

#### Case A — Full commercial cost basis (Investment = R1 491 453)

**Payback period**, using `N = (Cp − Ci)/(Cf − Ci) × 12`, where Ci is the cumulative cash position at the start of the payback year, Cf at its end, and Cp the break-even point (zero):

```
Cumulative at end of Year 4 (Ci) = −1 491 453 + (4 × 339 120) = −R134 973
Cumulative at end of Year 5 (Cf) = −134 973 + 339 120         = +R204 147

N = (0 − (−134 973)) / (204 147 − (−134 973)) × 12
N = 134 973 / 339 120 × 12
N = 4.78 months into Year 5

Total payback = 48 + 4.78 = 52.8 months (4.40 years)
```

**Return on Investment:**

```
ROI = (Net Returns / Investment Costs) × 100%

3 years: Net Returns = (3 × 339 120) − 1 491 453 = −R474 093
         ROI = −474 093 / 1 491 453 × 100 = −31.8%

5 years: Net Returns = (5 × 339 120) − 1 491 453 = +R204 147
         ROI = 204 147 / 1 491 453 × 100 = +13.7%

7 years: ROI = +59.2%
```

**Net Present Value:**

```
NPV = Total Present Value − Project Cost

3 years: NPV = 843 341 − 1 491 453 = −R648 111
5 years: NPV = 1 285 532 − 1 491 453 = −R205 921
7 years: NPV = 1 650 978 − 1 491 453 = +R159 526
```

#### Case B — Incremental cost to the institution (Investment = R59 000)

**Payback period:**

```
Cumulative at Year 0 (Ci) = −R59 000
Cumulative at end Year 1 (Cf) = −59 000 + 339 120 = +R280 120

N = (0 − (−59 000)) / (280 120 − (−59 000)) × 12
N = 59 000 / 339 120 × 12
N = 2.09 months
```

**Return on Investment:**

```
3 years: Net Returns = (3 × 339 120) − 59 000 = R958 360
         ROI = 958 360 / 59 000 × 100 = 1 624.3%

5 years: ROI = 2 773.9%
```

**Net Present Value:**

```
3 years: NPV = 843 341 − 59 000 = +R784 341
5 years: NPV = 1 285 532 − 59 000 = +R1 226 532
```

#### Recommendation

Proceed on the Case B basis. Two governance points must be recorded with the sponsor rather than left implicit:

1. **Case A is the institution's real exposure after the academic project ends.** If CivicConnect is adopted operationally, someone must fund maintenance, support and enhancement at commercial rates. The charter does not price that beyond year 1.
2. **The benefit figures are unvalidated.** They are internally consistent and conservatively derived, but the request volume, time-saving and rate assumptions come from the project team, not from the service desk. Sponsor validation is a precondition of sign-off.

---

## 7. Risk Management Plan

### 7.1 Scope of This Register

> This is the **charter-level project risk register**, derived from Member A's constraints and decisions for the purposes of quantified project management. It is **not** Member C's SEN381 Risk Register artefact, which remains C's deliverable and must be produced independently. Do not submit this table in place of it.

### 7.2 Key Assumptions & Constraints

Imported from Member A's baselined Constraints register:

| ID | Category | Constraint | Engineering implication |
|---|---|---|---|
| CON-001 | Scope | Minimum requester, staff and management capabilities are baselined and changed only through control | Sets a floor that cannot be traded away under schedule pressure |
| CON-002 | Schedule | Four formal milestones within the SEN381 delivery period; M1 baselined before architecture | Rules out open-ended technology evaluation in M2 |
| CON-003 | Cost | Free or low-cost services preferred; free-tier limits must be identified | Free tiers restrict backups, audit log retention and uptime guarantees |
| CON-004 | Resources | Exactly three students, part-time, with technology limited to what they can learn and support | Team capability is an engineering input, not a preference |
| CON-005 | Quality | Quality attributes measurable in M1, supported by evidence later | Every NFR creates a later verification obligation |
| CON-006 | Security | Lifecycle-wide; no committed secrets; authentication, authorisation, least privilege from requirements onward | Rules out deferring authorisation to late construction |
| CON-007 | Security | POPIA obligations over student and staff personal information | Constrains capture, access, retention and auditability |
| CON-008 | Resources | Belgium Campus does not guarantee platform availability or support | Compatibility must be verified before technology is committed |

### 7.3 Risk Register & Quantification

Loss values are expressed in rand and derived from the same cost basis as Section 4 (person-months of rework × R45 000), so exposure and mitigation cost are directly comparable. **[A10]**

Formulas: `RE = pL` · `RRL = (RE_before − RE_after) / C`

| ID | Risk | Source | p | L | RE before | Mitigation | C | p after | RE after | **RRL** |
|---|---|---|---|---|---|---|---|---|---|---|
| RK-01 | Chosen stack or platform not supported on BC Desktop | CON-008, DEC-002 | 0.40 | R135 000 | R54 000 | Verify candidate stacks on the BC image before the M2 ADR closes | R13 500 | 0.08 | R10 800 | **3.20** |
| RK-02 | Free-tier platform cannot meet audit-log retention or backup | CON-003, DEC-003 | 0.55 | R90 000 | R49 500 | Document free-tier limits for three candidates; price the paid tier before DEC-003 closes | R11 250 | 0.15 | R13 500 | **3.20** |
| RK-03 | **Team capacity shortfall against the baselined scope** | CON-004, CON-002 | 0.75 | R270 000 | **R202 500** | Deliver the CON-001 capability floor only; stage remaining FRs by priority band | R45 000 | 0.35 | R94 500 | **2.40** |
| RK-04 | Retention period never supplied by STK-009; NFR-4.2 unverifiable | DEC-005, CFL-004 | 0.50 | R67 500 | R33 750 | Escalate to the information officer now; adopt a documented institutional standard as fallback | R9 000 | 0.15 | R10 125 | **2.62** |
| RK-05 | Security officer rejects the CFL-002 reduced status set | CFL-002 (Proposed) | 0.30 | R112 500 | R33 750 | Confirm CFL-002 with STK-006 before the M2 data model is fixed | R6 750 | 0.08 | R9 000 | **3.67** |
| RK-06 | NFR verification burden exceeds M3 capacity | CON-005 | 0.60 | R90 000 | R54 000 | Write acceptance criteria as M3 test skeletons now; cap the NFR set at 22 | R18 000 | 0.20 | R18 000 | **2.00** |
| RK-07 | Secrets committed to the repository | CON-006 | 0.25 | R180 000 | R45 000 | Secret scanning in CI plus pre-commit hook, enforced on protected `main` | R9 000 | 0.03 | R5 400 | **4.40** |
| RK-08 | Campus-context assumption proves wrong; stakeholder register invalidated | DEC-001 | 0.15 | R360 000 | R54 000 | Confirm the institutional context with the lecturer before M2 architecture begins | R4 500 | 0.03 | R10 800 | **9.60** |
| RK-09 | POPIA breach via over-capture or unrestricted access | CON-007 | 0.20 | R450 000 | R90 000 | Enforce NFR-4.1 minimisation review and NFR-3.3 server-side authorisation | R22 500 | 0.05 | R22 500 | **3.00** |
| RK-10 | Uncontrolled scope change erodes the baseline | CON-001, CON-002 | 0.45 | R112 500 | R50 625 | Mandatory Appendix E impact analysis; two-reviewer PR on every controlled artefact | R6 750 | 0.05 | R5 625 | **6.67** |
| | **TOTALS** | | | | **R667 125** | | **R146 250** | | **R200 250** | **3.19** |

**Worked example (RK-03):**

```
RE_before = p × L = 0.75 × 270 000 = R202 500
RE_after  = p × L = 0.35 × 270 000 = R94 500
RRL       = (RE_before − RE_after) / C
          = (202 500 − 94 500) / 45 000
          = 108 000 / 45 000
          = 2.40
```

### 7.4 Interpretation & Contingency

**Highest exposure: RK-03** at R202 500, three times the next-largest. It is the risk the whole charter turns on and the one Sections 4.5 and 5.3 exist to address.

**Highest leverage: RK-08** at RRL 9.60. Confirming the campus-context assumption costs almost nothing and removes an exposure that would invalidate the entire stakeholder register. **Do this first** — highest exposure and highest leverage are different risks, and mitigation sequencing should follow leverage where cost is trivial.

Every mitigation in the register returns more than its cost (all RRL > 1.0). Portfolio RRL is **3.19**: R146 250 of mitigation removes R466 875 of exposure.

**Contingency fund: R200 250**, set equal to total residual exposure after mitigation. Schedule contingency is separately held at 2.25 weeks (Section 5.3), equal to 2.8 standard deviations of critical-path variability.

---

## 8. Quality & Procurement Management

### 8.1 Quality Standards

Quality is governed by **ISO/IEC 25010**(International Organization for Standardization, 2023).

Member B's non-functional requirements are classified under the four-category scheme used in Systems Analysis & Design; the mapping below reconciles the two without reclassifying the requirements.

| SAD category | ISO/IEC 25010 characteristic | Requirements |
|---|---|---|
| 1. Operational | Compatibility; Flexibility (portability); Reliability (recoverability) | NFR-1.1 – NFR-1.6 |
| 2. Performance | Performance Efficiency; Reliability (availability) | NFR-2.1 – NFR-2.5 |
| 3. Security | Security (confidentiality, integrity, non-repudiation, accountability, authenticity) | NFR-3.1 – NFR-3.6 |
| 4. Cultural & Political | Compliance aspects of Security and Maintainability | NFR-4.1 – NFR-4.5 |

**CON-005** makes every measurable quality attribute a verification obligation in M3. The NFR set is deliberately capped at 22 for that reason — the count is a schedule decision, not an aspiration.

### 8.2 Quality Assurance Process

| Control | Mechanism | Evidence |
|---|---|---|
| Peer review | Two approvals required from members other than the author, on every controlled artefact | Pull Request review comments |
| Branch protection | Protected `main`; review model enforced in repository settings, not agreed verbally | Settings screenshots |
| Traceability | RTM maintained live; Design, Test and Release columns populated as each milestone supplies evidence | RTM |
| Acceptance verification | 71 Given/When/Then criteria, structured to become M3 test cases without rewriting | Acceptance Criteria register |
| Change control | Appendix E impact analysis on any baseline change | Decision Log, change records |
| Secret hygiene | CI secret scanning plus pre-commit hook (RK-07) | CI run logs |
| AI usage | Register recording what was used, what it produced, and what human verification was applied | AI Usage Register (Member C) |
| Repository history | Authentic progression over time; bulk upload before assessment is explicitly failing evidence | Commit history |

### 8.3 Procurement Strategy

> **DEC-002 (technology stack) and DEC-003 (hosting platform) are formally deferred.** This section prices candidate options and states the decision criteria. **It does not close either decision** — that happens in the M2 Architecture Decision Records, on evidence this charter does not yet have.

**Decision criteria, in precedence order:**

1. **CON-008** — verified availability and support on the BC Desktop platform. A technically superior choice that cannot be installed is not a choice.
2. **CON-004** — team capability. An unfamiliar framework spends schedule on learning rather than verification.
3. **NFR-1.4 / NFR-1.5** — 90-day audit log retention and 24-hour recovery point. This is the criterion most likely to eliminate free tiers.
4. **CON-003** — cost, applied only after the three criteria above are satisfied.

**Indicative platform cost bands [A11]:**

| Tier | Annual cost | Meets NFR-1.4 / NFR-1.5? |
|---|---|---|
| Free tier | R0 | Typically **no** — audit log retention and automated backup are usually paid features |
| Entry paid tier | R18 000 – R30 000 | Generally yes; requires per-vendor verification |
| Managed platform | R60 000+ | Yes, but exceeds the CON-003 preference without justification |

The budget in Section 6.4 provisions **R24 000/year**, assuming an entry paid tier is required. **This is the charter's position on the CON-003 versus CON-006/CON-007 trade-off that Member A recorded but did not resolve: the accountability requirement wins, and the cost is carried.** If DEC-003 later selects a free tier, NFR-1.4, NFR-1.5 and NFR-4.5 must be formally relaxed through change control, and RK-02 realised.

**Vendor dependencies:** GitHub (source control, CI, branch protection) is the only committed external dependency. **NFR-1.3** deliberately excludes all campus-system integration, which removes an entire class of vendor and interface risk from the project.

---

## 9. Stakeholders & Approvals

### 9.1 Key Stakeholders

Imported from Member A's baselined Stakeholder Register.

| ID | Stakeholder | Primary need |
|---|---|---|
| STK-001 | Student / staff requester | Submit a request easily and know what is happening to it |
| STK-002 | Facilities technician | Clear ownership of assigned work |
| STK-003 | IT support technician | Clear ownership of assigned work |
| STK-004 | Service desk coordinator | Avoid duplicate and unassigned requests; maintain visibility of the whole queue |
| STK-005 | Operations manager | Reliable information on outstanding, overdue and resolved work |
| STK-006 | Campus security officer | Restricted handling and visibility of sensitive security reports |
| STK-007 | System administrator | A manageable role model; onboard and revoke access reliably |
| STK-008 | Campus executive sponsor | Demonstrable value and accountable delivery |
| STK-009 | Information officer | POPIA compliance across capture, access, retention and auditability |

**Recorded conflicts** (Member A, CFL register) and their status:

| ID | Conflict | Status |
|---|---|---|
| CFL-001 | Submission speed (STK-001) vs reporting richness (STK-005) | Resolved — DEC-006 |
| CFL-002 | Requester transparency (STK-001) vs security confidentiality (STK-006) | **Proposed — not yet agreed with STK-006** (see RK-05) |
| CFL-003 | Coordinator-controlled assignment (STK-004) vs technician self-selection (STK-002/003) | Resolved |
| CFL-004 | Reporting history (STK-005) vs data minimisation and retention (STK-009) | **Unresolved — blocked on DEC-005** (see RK-04) |

### 9.2 Approval Conditions

The Project Manager recommends approval **subject to three conditions**, each traceable to a finding in this charter:

1. **The descope in Section 4.5 is accepted and recorded.** Delivery is the CON-001 capability floor at prototype grade; the Medium and Low priority bands are deferred through change control, not dropped. Without this the project has an approximately 0% probability of on-time completion (Section 5.2).
2. **The benefit assumptions in Section 6.3 are validated by the service desk.** Case B's return depends on them, and they currently come from the project team.
3. **The Case A exposure is acknowledged.** Operating CivicConnect beyond the academic project carries a commercial cost this charter prices at R1.47m to rebuild and does not fund beyond year 1.

### 9.3 Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Project Manager | Robert | | |
| Project Sponsor | *[STK-008 — name required]* | | |
| Finance Representative | | | |
| Module Lecturer (SEN381) | | | |

---

## Appendix A — Assumption Register

Every assumption below is the project team's, not the sponsor's, unless stated. Each requires validation before sign-off.

| ID | Assumption | Value | Used in | Validation required from |
|---|---|---|---|---|
| A1 | Delivered source size, tests excluded | 12.0 kLOC | §4.2 | Team — derived from B's 48 FR / 22 NFR baseline |
| A2 | Fully loaded cost per person-month | R45 000 | §4.3 | Finance — replace if PMM281 prescribes a rate |
| A3 | Working hours per person-month | 152 h (19 days × 8 h) | §4.5 | Standard convention |
| A4 | Prototype productivity multiplier over COCOMO commercial baseline | 3× | §4.5 | Team judgement — the softest number in the charter |
| A5 | Annual service request volume | 3 000 | §6.3 | Service desk |
| A6 | Staff time saved per request | 12 minutes | §6.3 | Service desk |
| A7 | Loaded staff / manager hourly rate | R280 / R520 | §6.3 | Finance |
| A8 | Commercial service desk licence avoided | 15 agents × R620/month | §6.3 | Market quotation |
| A9 | Discount rate | 10% nominal | §6.5 | Finance |
| A10 | Risk loss values derived as person-months of rework × R45 000 | — | §7.3 | Team — internally consistent with §4 |
| A11 | Platform cost bands | R0 / R18–30k / R60k+ | §8.3 | Vendor quotations before DEC-003 closes |
| A12 | Delivery window | 13 weeks | §5 | **Lecturer — calendar dates still required** |

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
| PERT Completion probability | `z = (D − E) / s` *(supplementary to the prescribed set)* |
| Risk Exposure | `RE = pL` |
| Risk Reduction Leverage | `RRL = (RE_before − RE_after) / C` |
| Payback Months | `N = (Cp − Ci) / (Cf − Ci) × 12` |
| Return on Investment | `ROI = (Net Returns / Investment Costs) × 100%` |
| NPV Factor | `f = 1 / (1 + i)^y` |
| Present Value | `PV = FV × f` |
| Net Present Value | `NPV = Total Present Value − Project Cost` |
