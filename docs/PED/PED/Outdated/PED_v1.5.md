# Project Engineering Document

## CivicConnect — Campus Service Request Management Platform

**Version 1.5 — working draft toward the Architecture, Technology & Initial Design Baseline (v2.0)**

| | |
|---|---|
| **Project** | CivicConnect — Campus Service Request Management Platform |
| **Module** | Software Engineering 381 (SEN381), NQF Level 8 |
| **Institution** | Belgium Campus ITversity |
| **Document** | Project Engineering Document (PED) |
| **Version** | 1.5 |
| **Status** | Draft |
| **Date** | 29 September 2026 |
| **Supersedes** | PED v1.4 |
| **Governing document** | SEN381 CivicConnect Master Project Brief v1.1 |

---

## Document Control

| Role | Name | Responsibility in this document |
|---|---|---|
| Team Lead | Ethan Lindsay | M1 baseline review and controlled change; engineering decision log and architecture decision records; evolution of the requirements traceability matrix; initial design decisions; assembly of this document |
| Project Manager | Robert van der Merwe | Data and persistence baseline; technology stack selection and deployment compatibility; initial interface and integration decisions |
| Developer | Christiaan Burger | Architecturally significant requirements and architecture baseline; repository governance and CI controls; application and technical documentation; risk register; forward engineering considerations; AI usage register |

Responsibilities are recorded as they apply to this version. The v1.0 allocation —
Ethan Lindsay on problem, stakeholders, scope, constraints and the decision log; Robert
van der Merwe on requirements, acceptance criteria and the traceability matrix;
Christiaan Burger on risk, forward engineering considerations, repository governance and
the AI usage register — remains the attribution for the content baselined at that
version.

**Review model.** Every substantive change to a controlled artefact enters the
repository through a pull request requiring two approvals from members other than the
author, in accordance with Master Brief §9. No member self-approves.

**Approval of this baseline.** Recorded in Appendix B.

---

## Version History

| Version | Date | Author | Summary of change | Reviewed by |
|---|---|---|---|---|
| 0.1 | 06/09/2026 | E. Lindsay | Initial drafts: stakeholder register (STK-001–009), stakeholder conflicts (CFL-001–004), constraints (CON-001–008), scope baseline (SCP-001–020), decision log (DEC-001–007), problem and business need. PR #1 | R. van der Merwe, C. Burger |
| 0.2 | 08/09/2026 | E. Lindsay | Repository structure established; registers separated into requirements and decisions folders; DEC-008 recorded (two-stage protected branching). PR #14 | R. van der Merwe, C. Burger |
| 0.3 | 09/09/2026 | E. Lindsay | AI Usage Register established; client instructions of 09/09/2026 incorporated: STK-010 added; CON-009–CON-019 recorded; SCP-021 added; DEC-007 revised; DEC-009 recorded. PR #15 | R. van der Merwe, C. Burger |
| 0.4 | 09/09/2026 | E. Lindsay | PED document created; cascaded decision log updates applied across affected artefacts; scope baseline extended with a Type column distinguishing product from project scope. PR #16 | R. van der Merwe, C. Burger |
| 0.5 | 09/09/2026 | R. van der Merwe | Requirements baseline: 49 functional and 30 non-functional requirements (FR-1.1–FR-9.2, NFR-1.1–NFR-4.5), 80 acceptance criteria, RTM v0.2, traced example, open items register. PR #17 | E. Lindsay, C. Burger |
| 0.6 | 09/09/2026 | C. Burger | Risk register v0.3 (RSK-001–013) and forward engineering considerations register v0.2 (FEC-001–007 with recorded baseline influence). PR #18 | E. Lindsay, R. van der Merwe |
| 0.7 | 09/09/2026 | R. van der Merwe | Artefact updates derived from the additional client constraints recorded at v0.3. PR #19 | E. Lindsay, C. Burger |
| 0.8 | 09/09/2026 | R. van der Merwe | Project Charter v0.2: delivery window corrected to 5.57 weeks against confirmed dates; size estimate rescoped to 15.0 kLOC; §4.6 AI productivity assumption and velocity checkpoint added; PERT re-baselined | E. Lindsay, C. Burger |
| 0.9 | 09/09/2026 | C. Burger, R. van der Merwe | Risk Register v0.4: RSK-014 and RSK-015 added for the schedule and decision-deadline exposures arising from the corrected window. Project Charter v0.3: Member C's register adopted as authoritative with a reconciliation mapping in §7.1 | E. Lindsay |
| 1.0 | 09/09/2026 | E. Lindsay | Integration of all M1 artefacts into a single controlled document; references added; Team Working Agreement drafted; baseline conditions recorded; baseline sign-off completed | R. van der Merwe, C. Burger |
| 1.1 | | E. Lindsay | M1 baseline review: requirements, assumptions, constraints, acceptance criteria and forward engineering considerations reviewed against the evidence now available; changes recorded under controlled change and superseded content preserved | R. van der Merwe, C. Burger |
| 1.2 | | C. Burger | Architecturally significant requirements identified and linked to stakeholder, constraint and risk evidence; architecture baseline and diagrams recorded | E. Lindsay, R. van der Merwe |
| 1.3 | | R. van der Merwe | Data and persistence baseline: entities, ownership, lifecycle and initial data model recorded with supporting decisions | E. Lindsay, C. Burger |
| 1.4 | | R. van der Merwe | Technology stack selected and DEC-002 closed; deployment direction recorded against DEC-003; versions, compatibility assumptions and dependencies recorded | E. Lindsay, C. Burger |
| 1.5 | 29/09/2026 | E. Lindsay | Initial design decisions recorded as architecture decision records (DEC-011, DEC-012) with supporting component and sequence diagrams; requirements traceability matrix extended from nine columns to fourteen (v0.4); end-to-end trace for FR-6.7 recorded at §7.5 and completed into implementation and initial verification evidence | R. van der Merwe, C. Burger |
| 1.6 | | C. Burger | Repository structure aligned to the architecture; continuous integration controls adopted; application and technical documentation recorded | E. Lindsay, R. van der Merwe |
| 1.7 | | E. Lindsay, R. van der Merwe, C. Burger | Risk register, assumptions, dependencies and forward engineering considerations updated against the architecture, data, technology, design, security, deployment and cost evidence produced at this milestone | Reviewed by the two members other than each author |
| 2.0 | | E. Lindsay | Integration of all M2 artefacts into this document; Architecture, Technology & Initial Design Baseline identified, approved and signed off; M1 baseline conditions reviewed and their status recorded | R. van der Merwe, C. Burger |

Baselined content is not silently overwritten. Changes after this baseline follow the
change control process in Master Brief §14.

---

## Contents

1. Introduction
2. Problem and Business Need
3. Stakeholder Analysis
4. Scope Baseline
5. Constraints
6. Requirements and Acceptance Criteria
7. Traceability
8. Risk Management
9. Forward Engineering Considerations
10. Engineering Decisions
11. Governance, Accountability and AI Controls
12. Baseline Statement
13. References
- Appendix A — Controlled Artefact Index
- Appendix B — Baseline Sign-Off

---

# 1. Introduction

## 1.1 Purpose of this document

This document is the single evolving engineering record for the CivicConnect project.
It is not a milestone report. Version 1.0 established the Milestone 1 baseline; this
version extends the same document to v2.0 at architecture and design, and the same
document will be extended again to v3.0 at controlled construction and release
readiness, and to v4.0 at final product evaluation.

Its purpose at v1.0 was to state what the team had committed to engineer, for whom,
within what constraints, what had deliberately not been decided, and how change to that
commitment would be controlled.

Its purpose at v2.0 is to record how that commitment has been translated into
architecture, data, technology and initial design decisions; what evidence supports each
of those decisions and what alternatives were rejected; what application evidence now
exists against the resulting direction; and what remains deliberately undecided at this
checkpoint.

## 1.2 Scope of this document

At v1.0 this document covered the engineering foundation only. Architecture, technology
selection, persistence design, interface design and implementation were outside
Milestone 1 and were recorded only where a decision had been deliberately deferred and
the evidence required to close it stated.

At v2.0 that boundary moves. This version additionally covers the architecturally
significant requirements and the architecture baseline, the data and persistence
baseline, the technology-stack selection and deployment-compatibility position, the
initial design decisions informed by the team's Assignment 2 research, and the
application evidence produced against them.

What remains outside this version is stated so that its absence is not read as an
omission: a completed application, a mature continuous delivery pipeline, complete
automated test coverage, production deployment, final performance or security testing,
and detailed design for every component the system will eventually contain. Where any of
these is anticipated rather than delivered, it is carried as a deferred decision or a
forward engineering consideration rather than asserted.

## 1.3 Structure and controlled artefacts

Several artefacts referenced here are live registers maintained as separate
controlled files in the project repository rather than reproduced in full below. This
follows the M1 requirement that outputs be integrated into the PED and/or linked as
controlled project artefacts. Each section states what its artefact contains, why it
exists and what it constrains downstream; Appendix A indexes every file and its
repository location.

## 1.4 Identifier scheme

Identifiers are stable and are not reused. A retired item keeps its identifier and is
marked superseded rather than being renumbered.

| Prefix | Artefact |
|---|---|
| STK-nnn | Stakeholder |
| CFL-nnn | Stakeholder conflict |
| SCP-nnn | Scope baseline item |
| CON-nnn | Constraint |
| FR-n.n | Functional requirement |
| NFR-n.n | Non-functional requirement |
| AC-FR-n.n / AC-NFR-n.n | Acceptance criterion |
| DEC-nnn | Engineering decision |
| RSK-nnn | Risk (engineering register) |
| RK-nn | Risk (Project Charter quantified register) |
| FEC-nnn | Forward engineering consideration |
| OI-nn | Open item |

## 1.5 Acronyms

Acronyms follow the table in Master Brief §Acronyms and Abbreviations. Terms are
written in full on first use where clarity requires it.

## 1.6 Relationship to version 1.0

Version 1.0 established the engineering foundation: the problem and business need, the
stakeholder analysis, the scope baseline, the constraints, the requirements baseline and
the decisions the team was able to take on the evidence then available. This version does
not restate that work. It extends the same document with the architecture, data,
technology and initial design decisions that became supportable once the Week 2 teaching,
the team's Assignment 2 research and the first implementation evidence were available.

Three categories of change are distinguished throughout, so that what was established at
M1 can be separated from what has been decided since:

| Category | Treatment in this document |
|---|---|
| **Carried forward unchanged** | Baselined content that the M2 evidence did not disturb. It remains exactly as recorded at v1.0 and is not restated or re-justified. |
| **Changed under control** | Baselined content that materially changed. The original is preserved together with the reason for change, in accordance with Master Brief §14. A change is visible in the version history above and in the affected artefact's own version record. |
| **New at v2.0** | Decisions, artefacts and application evidence that did not exist at M1. These carry their version of record in the section that introduces them and in Appendix A. |

Assignment 2 provided research, alternatives and recommendations relevant to several of
the decisions recorded here. Where that research informs a decision, the decision record
references the relevant finding, source or Assignment 2 section; the research discussion
itself is not reproduced in this document, and an Assignment 2 recommendation is not
treated as a project decision. Where the team's final judgement differs from the
recommendation, the decision record states the project-specific evidence that produced
the difference.

## 1.7 Milestone 1 baseline review

The M1 baseline was reviewed before any Milestone 2 decision was recorded in this
document. The order matters. An architecture, data or technology decision taken against
a requirement that has since changed, or against a constraint that has since been
clarified, is a decision taken on stale evidence, and its consequences are discovered
late. This review establishes which M1 commitments still hold, which have changed, and
which remain open, so that the decisions recorded in the sections that follow rest on a
current foundation.

**Method.** Each baselined artefact was examined against four sources of change: client
instruction issued since 9 September 2026; evidence produced by the team's Assignment 2
research; decisions closed since the baseline; and experience from the first
implementation work. Every reviewed item was resolved into one of the three categories
defined in §1.6. No baselined item was edited in place. Where content changed it did so
through the process in Master Brief §14, and the original wording and the reason for
change are preserved in the affected artefact.

### 1.7.1 Artefacts reviewed

| Artefact | Version at M1 | Outcome of review |
|---|---|---|
| Stakeholder Register | v0.2 | Carried forward unchanged. No stakeholder was added, withdrawn or re-positioned since baseline. |
| Stakeholder Conflicts | v0.1 | Carried forward unchanged. All four resolutions remain *Proposed*; see §1.7.2. |
| Scope Baseline | v0.2 | Changed under control. SCP-014 and SCP-015 are released from their dependency on DEC-003, and SCP-020 from its dependency on DEC-005, both decisions having closed at this milestone. |
| Constraints | v0.2 | Carried forward unchanged. CON-015 interacts directly with the technology selected under DEC-002 and was examined against it; the constraint is satisfiable as written and required no amendment. See §1.7.2. |
| Functional Requirements | v0.2 | Carried forward. FR-4.2, FR-8.4 and FR-9.1 remain *Proposed* against open items OI-01 to OI-03. |
| Non-Functional Requirements | v0.2 | Changed under control. NFR-4.2 is released from OI-05 by the closure of DEC-005 and now states the agreed retention period. |
| Acceptance Criteria | v0.2 | Changed under control where the underlying requirement changed. AC-NFR-4.2 now states an evaluable retention outcome. Otherwise carried forward. |
| Requirements Traceability Matrix | v0.2 | Extended at this version with the architecture, data, design, technology, implementation and verification evidence columns. See §7. |
| Risk Register | v0.4 | Updated with the architecture, data, technology, dependency, design, security, deployment, cost and implementation exposures arising at this milestone. See §8. |
| Forward Engineering Considerations Register | v0.2 | Reviewed; the influence each consideration exerted on the decisions recorded at this version is stated in §9. |
| Engineering Decision Log | v0.2 | Extended with the decisions recorded at this milestone and with the disposition of the three deferments carried from M1. See §10. |
| AI Usage Register | v0.1 | Extended for the Milestone 2 period. The completeness limitation disclosed in §11.4 is addressed or carried forward as recorded there. |

### 1.7.2 Open questions the review was required to settle

The M1 baseline was accepted conditionally, and eight specific questions were left open
against it. Each is resolved or explicitly carried forward here, with the position at
this review recorded against the position at baseline.

| Open question | Position at M1 | Position at this review |
|---|---|---|
| DEC-002 — technology stack | Deferred. Evidence required stated as verified availability in the institutional environment under CON-008. Working deadline of 22 September imposed by CON-013 | **Closed.** A MERN stack was selected: MongoDB, Express, React and Node.js. The selection was made against the five build-repeatability properties identified in the team's Assignment 2 research, together with the CON-008 availability position and the CON-004 team-capability constraint. The decision closed after the 22 September working deadline imposed by CON-013; that overrun and its consequence are recorded against C-04 and C-05 in Appendix B. **The interaction with CON-015 was examined and the constraint holds.** CON-015 requires database changes to be auditable through triggers and logging, and a self-managed MongoDB deployment provides no relational-style trigger. The decision therefore commits to MongoDB Atlas as the managed database service rather than to a self-managed instance: Atlas provides managed database triggers that execute on document insert, update and delete, and its clusters are deployed as replica sets, so change streams and multi-document transactions are both available. The transactional position carried in the team's Assignment 2 persistence research therefore transfers rather than being displaced, and CON-015 required no amendment. **One consequence remains open.** Free Atlas clusters do not support managed backups, and the documented alternative is a scheduled export and restore. NFR-1.5 requires recovery to a state no more than 24 hours old following total loss of the primary data store, so on a free cluster that obligation rests on an operated schedule rather than on a platform capability. The cluster tier and the mechanism by which NFR-1.5 is met are recorded as a new deferment, DEC-010. |
| DEC-003 — hosting and deployment platform | Deferred. SCP-014 and SCP-015 blocked behind it. Same working deadline. Tracked as RSK-008 and RSK-015 | **Closed.** Hostinger was selected as the hosting and deployment platform. SCP-014 and SCP-015 are released from their dependency on this decision. Two items must be recorded against the plan actually selected rather than against the platform in general: the evidence stated at deferment — documented limits covering audit log retention, backup and likely operational cost beyond the educational context — and the position on where the MongoDB instance runs, since the deployment topology required by the DEC-002 interaction above is a dependency of this decision |
| DEC-005 — personal-information retention period | Deferred pending guidance from STK-009. NFR-4.2 and SCP-020 blocked behind it. Highest exposure in the register as RSK-002 | **Closed.** A retention period of one month for identifiable personal information was agreed. NFR-4.2 and SCP-020 are released from their dependency on it, and RSK-002 is re-scored accordingly. The decision entry should record the basis on which one month was agreed, since CON-007 requires the retention position to be defensible under POPIA rather than merely stated, and SCP-020 remains deferred as a capability even though the period it would enforce is now fixed |
| CFL-001 to CFL-004 — stakeholder conflict resolutions | All four recorded as *Proposed*; none confirmed with the stakeholder concerned. CFL-002 carries the greatest exposure and was to close before the M2 data model was fixed | **Carried forward.** None of the four resolutions has been confirmed with the stakeholder concerned. CFL-002 in particular remains *Proposed*, so FR-1.5, FR-3.5, NFR-3.3 and NFR-4.4 — a substantial part of the security requirement set — continue to rest on a resolution STK-006 has not agreed. The exposure is unchanged from baseline and remains tracked as RSK-005 and RSK-009. The architecture and design decisions recorded in this version proceed on the team's proposed resolution and would require revision if it is not agreed. Condition C-01 remains open |
| FR-4.2, FR-8.4, FR-9.1 | Proposed against open items OI-01 to OI-03 | **Carried forward.** All three remain *Proposed* against OI-01 to OI-03. No evidence closing them arrived during this milestone, and their RTM status is unchanged |
| NFR-4.2 | Blocked against OI-05. States a retention period that cannot be written until DEC-005 closes | **Closed.** Released from OI-05 by the closure of DEC-005. The requirement now states the agreed one-month retention period and its acceptance criterion is evaluable by a third party |
| Service-level target behind "overdue" | No decision log entry existed for it. Recorded as RSK-003 and as condition C-02; SCP-011 cannot be specified precisely without it | **Carried forward.** No service-level target has been agreed with STK-005 and no decision log entry exists for it. SCP-011 therefore remains specified imprecisely and no acceptance criterion for it can be evaluated by a third party. RSK-003 is unchanged and condition C-02 remains open |
| Capacity and schedule position | Project Charter v0.3 §4.6 records that the baselined scope exceeds deliverable capacity within the window. A velocity checkpoint was set at the CON-013 gate of 29 September, with a scope-reduction order to be agreed in advance | **Carried forward, not measured.** No velocity measurement was taken at the 29 September gate and no scope-reduction order was agreed in advance of it. The AI-assisted productivity assumption on which the delivery schedule rests is therefore still unsubstantiated. RSK-014 is unchanged and condition C-05 remains open |

Three of these — DEC-002, DEC-003 and the capacity position — had dated deadlines that
fell before this review. Where a deadline was not met, the review records that fact and
its consequence rather than restating the original intention.

### 1.7.3 Assumptions re-examined

Three figures carried in the M1 baseline are team assumptions rather than
stakeholder-validated values. Each was re-examined at this review because the
architecture, data and technology decisions recorded later in this document depend on
them.

| Assumption | Where recorded | Position at this review |
|---|---|---|
| Recovery to a state no more than 24 hours old | NFR-1.5, measurement basis; open item recorded | Carried forward as a team assumption. The figure has not been validated with the stakeholder who would bear the loss of a day's requests. The closure of DEC-003 makes the backup and restore capability of the selected platform determinable, so the evidence required to test the assumption is now obtainable |
| Approximately 10 000 requests in the first year | NFR-2.2, measurement basis; open item recorded | Carried forward as a team assumption. No usage evidence exists against which to test the figure, and none will exist before the platform is in operational use |
| AI-assisted productivity multiplier underpinning the schedule | Project Charter v0.3 §4.6, assumption A14 | Not measured. The velocity checkpoint set at the CON-013 gate did not take place. The assumption remains unsubstantiated, which is material because the delivery schedule depends on it and because no implementation evidence existed at the gate against which velocity could have been measured |

The approximately 100 concurrent users in NFR-2.1 and NFR-2.4 is client-supplied under
CON-010 and was not re-opened, since it is a stated constraint rather than a team
estimate.

### 1.7.4 Effect of the review on this version

The review closed three of the eight open questions carried from Milestone 1 and
carried five forward. The three deferments recorded at baseline — DEC-002, DEC-003 and
DEC-005 — are now decided, which releases SCP-014, SCP-015, SCP-020 and NFR-4.2 from
their dependencies and permits the architecture, data and technology decisions recorded
in the sections that follow.

Two findings from the review bear directly on those decisions and are recorded rather
than absorbed. The technology selected under DEC-002 satisfies the CON-015 audit
obligation only through a managed database service rather than a self-managed instance,
and the free tier of that service does not support managed backups, so the recovery point
asserted in NFR-1.5 cannot yet be evidenced; this is carried as a new deferment, DEC-010.
And no implementation evidence existed at the CON-013 gate and no velocity measurement
was taken, so the schedule assumption carried since Milestone 1 remains unsubstantiated.

Three conditions from the M1 baseline are carried forward rather than closed: C-01, C-02
and C-05. Their status is recorded in Appendix B. The team's position is that a condition
carried forward with its exposure stated is a more useful engineering record than a
closure the available evidence does not support.

---

# 2. Problem and Business Need

## 2.1 Problem statement

The campus currently manages service requests through a fragmented combination of
email, telephone calls, WhatsApp messages, spreadsheets and paper records. Requests
span facility faults, damaged equipment, security concerns, IT support, maintenance
issues and lost property.

The defining characteristic of the current process is not that requests go unhandled,
but that **no single controlled record of a request's lifecycle exists**. Each channel
holds a partial view. Nothing reconciles them.

Four consequences follow from that root cause, each affecting a different stakeholder
group:

**Requests are lost between channels.** A request submitted by email and repeated by
WhatsApp becomes two requests, or none. There is no mechanism to detect duplication
because there is no shared record to compare against.

**Requesters cannot see what is happening.** A requester (STK-001) has no way to
determine whether a request was received, assigned, delayed or resolved without
contacting someone directly — which generates further informal traffic and compounds
the original problem.

**Ownership and accountability are unclear.** Staff (STK-002, STK-003) cannot reliably
establish who is responsible for a request. Changes to status and actions taken are
not attributable to an acting person, so the coordinator (STK-004) cannot resolve
competing claims of ownership or identify unassigned work.

**Management has no reliable operational picture.** The operations manager (STK-005)
cannot answer basic questions — what is open, what is overdue, what has been resolved
— without manual collation. Reporting is inconsistent and cannot be audited.

A fifth concern cuts across all of these: sensitive request information, including
security concerns and personal information of students and staff, is currently handled
inconsistently across informal channels with no access control and no audit trail.

## 2.2 Business need

The campus needs a controlled digital platform that provides a reliable, traceable and
usable way to submit, manage, monitor and report on service requests.

The need is not primarily for new capability. Requests are already submitted, assigned
and resolved today. The need is for those activities to occur against **a single
authoritative record**, with attribution of who did what and when, and with access
appropriate to the sensitivity of the information involved.

The solution must achieve this without creating an unsustainable technical,
operational or financial burden. This is a constraint on the solution, not an
aspiration: it is recorded as CON-003 and CON-004 and it directly shapes what has been
committed to scope.

## 2.3 Intended stakeholder value

| Stakeholder | Value delivered | Traceable to |
|---|---|---|
| Requester (STK-001) | Confirmation that a request was received, and visibility of its status without contacting staff | SCP-003, SCP-004 |
| Technicians (STK-002, STK-003) | A clear view of work they are responsible for, with status updatable at the point of work | SCP-005, SCP-008 |
| Service desk coordinator (STK-004) | A single queue in which duplication and unassigned work are visible | SCP-006, SCP-007 |
| Operations manager (STK-005) | Reliable information on open, overdue, resolved and closed work by category | SCP-011 |
| Security officer (STK-006) | Sensitive reports handled with restricted visibility rather than in open channels | SCP-012, CFL-002 |
| System administrator (STK-007) | A defined role model with controlled assignment and revocation of access | SCP-012 |
| Executive sponsor (STK-008) | Service accountability without unsustainable operational cost | CON-003, DEC-003 |
| Information officer (STK-009) | Auditable, access-controlled handling of personal information | CON-007, SCP-012 |

STK-010 is not listed above. The client proxy's interest is in evidence of controlled
engineering rather than in operational value delivered by the running system, and is
addressed through the governance controls in §11 rather than through delivered
capability.

## 2.4 How success will be judged

Project success is not "the system works". It is whether the problems in 2.1 are
demonstrably reduced. Three measures follow directly from the problem statement, each
now expressed as measurable requirements:

1. **Single record** — a request exists once, in one place, with a complete lifecycle
   history attributable to acting users. Verified through FR-6.7, NFR-1.4 and NFR-3.6.
2. **Visibility** — a requester can determine the state of their request without
   contacting a member of staff. Verified through FR-3.x and NFR-2.1.
3. **Reportable position** — management can obtain the open, overdue and resolved
   position without manual collation. Verified through FR-8.x and NFR-2.3.

Measure 3 carries a known gap: "overdue" has no agreed service-level definition. This
is recorded as RSK-003 and remains open at baseline.

## 2.5 Relationship to scope

Two boundaries follow directly from this analysis and are recorded in the scope
baseline.

The platform **replaces** the fragmented channels rather than federating them
(SCP-017). Ingesting requests from email and WhatsApp would preserve the duplication
that §2.1 identifies as the root cause, so integration with the existing channels is
out of scope by design rather than by omission.

Access control is **in scope despite not being a stated business capability**
(SCP-012). The sensitivity concern in §2.1 and the conflict resolution in CFL-002 make
role-based access a precondition of the platform being usable for security concerns at
all.

---

# 3. Stakeholder Analysis

## 3.1 Purpose

The stakeholder register exists to make the origin of every requirement traceable. A
requirement without an identified stakeholder cannot be prioritised against competing
needs and cannot be validated at M4 against the expectation that produced it. The
register is the left-hand end of the traceability chain in §7.

**Controlled artefact:** Stakeholder Register v0.2 (see Appendix A).

## 3.2 Stakeholders identified

Ten stakeholders are recorded, each with their relationship to the system, primary
need, influence, interest and engagement approach.

| ID | Stakeholder | Primary need | Influence | Interest |
|---|---|---|---|---|
| STK-001 | Student / staff requester | Submit quickly and know the request was received and what is happening | Low | High |
| STK-002 | Facilities / maintenance technician | See assigned work clearly and update status from where the work is done | Medium | High |
| STK-003 | IT support technician | Same queue behaviour, different categories and turnaround expectations | Medium | High |
| STK-004 | Service desk coordinator | Avoid duplicate and unassigned requests; visibility of the whole queue | Medium | High |
| STK-005 | Operations manager | Reliable view of open, overdue, resolved and closed work by category | High | High |
| STK-006 | Campus security officer | Restricted handling and visibility of sensitive security reports | Medium | Medium |
| STK-007 | System administrator | A manageable role model with reliable onboarding and revocation | Medium | Medium |
| STK-008 | Campus executive sponsor | Accountability and service performance without unsustainable cost | High | Medium |
| STK-009 | Information officer / POPIA compliance | Lawful, auditable handling of student and staff personal information | High | Low |
| STK-010 | Lecturer / client proxy | Evidence of controlled engineering, not only working software | High | High |

## 3.3 Influence and interest positioning

Positioning determines whose need takes precedence when two conflict, and how each
stakeholder is engaged.

| | Lower interest | Higher interest |
|---|---|---|
| **Higher influence** | **Keep satisfied** — STK-006, STK-007, STK-008, STK-009 | **Manage closely** — STK-002, STK-003, STK-004, STK-005, STK-010 |
| **Lower influence** | **Monitor** — none identified | **Keep informed** — STK-001 |

The Monitor quadrant is empty. Every stakeholder identified holds either power over
the project or a direct stake in its outcome, so none can be safely disregarded.

STK-009 illustrates why the two dimensions are held apart. The information officer has
almost no day-to-day involvement but can prevent the platform operating lawfully. When
their need conflicts with an operational one, the compliance position prevails — and
that precedence has a recorded basis rather than resting on preference.

## 3.4 Competing stakeholder needs

Four conflicts are recorded where stakeholder needs cannot both be fully satisfied.
Each states why the tension is real and what changed in scope or requirements as a
result.

**Controlled artefact:** Stakeholder Conflicts v0.1.

| ID | Tension | Resolution | Status |
|---|---|---|---|
| CFL-001 | Requester submission speed (STK-001) vs reporting richness (STK-005) | Mandatory fields limited to category, location and description; further detail prompted after submission | Proposed |
| CFL-002 | Requester transparency (STK-001) vs security confidentiality (STK-006) | Security-category requests expose a reduced status set to the requester; detail restricted to an authorised security role | Proposed |
| CFL-003 | Technician self-selection (STK-002, STK-003) vs assignment accountability (STK-004) | Coordinator assigns by default; technicians may accept unassigned requests within their own category; every transition records the acting user | Proposed |
| CFL-004 | Reporting history (STK-005) vs data minimisation (STK-009) | Retention period defined for identifiable data with aggregated statistics retained beyond it; period deferred | Proposed — retention deferred |

**Status disclosure.** All four resolutions are recorded as *Proposed*. They represent
the team's engineering position and have driven the requirements baseline, but none has
been confirmed with the stakeholder concerned. CFL-002 carries the greatest exposure:
it produced SCP-012, DEC-004 and a substantial part of the security requirement set, and
is tracked as RSK-005 and RSK-009. Confirming CFL-002 with STK-006 before the M2 data
model is fixed is the highest-value stakeholder action outstanding.

## 3.5 Downstream effect

CFL-002 is the clearest illustration of a stakeholder conflict propagating into
engineering commitment. Restricting security-request visibility by role required
authorisation to become an architectural concern rather than an application detail
(DEC-004), placed authentication and role-based access control into scope even though
it is not a stated business capability (SCP-012), and generated FR-1.5, FR-3.5,
NFR-3.3 and NFR-4.4. A stakeholder disagreement, followed forward, becomes an
architecture constraint.

---

# 4. Scope Baseline

## 4.1 Purpose

The scope baseline is the reference against which every later change is assessed. Once
baselined, an addition is not absorbed silently; it is a change request with an impact
analysis under Master Brief §14. Recording what is deliberately excluded matters as
much as recording what is included — an unstated exclusion is indistinguishable from an
oversight.

**Controlled artefact:** Scope Baseline v0.2.

## 4.2 Baseline summary

Twenty-one items are classified. Each item is typed as **Product** (a capability of the
CivicConnect system) or **Project** (a deliverable of the project itself).

| Classification | Count |
|---|---|
| In scope | 13 |
| Deferred | 4 |
| Out of scope | 4 |
| **Total** | **21** |

## 4.3 In scope

SCP-001 to SCP-011 deliver the minimum requester, staff and management capabilities
required by Master Brief §3: submission with a controlled category, status and history
visibility, feedback on state change, authorised staff access, search and filtering,
assignment, controlled status transitions with the acting user recorded, action and
resolution recording, authorised closure, and the management view of open, overdue,
resolved and closed work.

SCP-012 (authentication and role-based access control) is in scope although it is not
listed as a business capability, for the reasons in §3.5.

SCP-021 (project charter, work breakdown structure and timeline) is the single Project
item, directed by the client on 09/09/2026. It is also a dependency: the PERT
estimation required by CON-009 needs the activity decomposition the WBS provides.

## 4.4 Deferred

| ID | Item | Basis |
|---|---|---|
| SCP-014 | Email or push notification of status changes | Depends on a delivery service whose cost and free-tier limits are unknown until the platform decision (DEC-003). In-application feedback under SCP-004 meets the minimum capability in the interim |
| SCP-015 | Photograph attachments | Introduces storage cost, malware scanning and additional personal-information handling under CON-007 |
| SCP-019 | Multi-campus or multi-tenant operation | Single-campus operation satisfies current stakeholders; deferred rather than excluded so the M2 data model does not foreclose it |
| SCP-020 | Automated enforcement of the retention period | The retention period itself is undecided (DEC-005); automating enforcement would encode an unverified assumption |

## 4.5 Out of scope

| ID | Item | Basis |
|---|---|---|
| SCP-013 | Native mobile application | Responsive web meets the access need within CON-002 and CON-004; confirmed as a client directive under CON-011 |
| SCP-016 | Integration with existing campus systems | No evidence that institutional interfaces exist or would be accessible; committing to an unverifiable integration creates unmanageable dependency risk (CON-008) |
| SCP-017 | Ingestion from existing email, telephone or WhatsApp channels | The business need is to replace fragmented channels with a single controlled record; ingestion would preserve the duplication the platform exists to remove |
| SCP-018 | Technician scheduling, rostering or workload balancing | Not a stated capability and not raised by any identified stakeholder; would substantially expand the domain model under a fixed schedule |

## 4.6 Exclusion defended: SCP-017

SCP-017 is the exclusion the team defends most directly, because it is the one that
looks most like a missing feature.

The scenario names duplication across channels as a primary failure. Ingesting from
those channels would federate them rather than replace them, and the duplication that
§2.1 identifies as the root cause would persist inside the platform. The engineering
position is that the single authoritative record is the mechanism by which duplication
is removed, and that anything preserving a second write path defeats it.

The exclusion carries a real cost, recorded as RSK-001 at the highest exposure band in
the register: requesters may continue using the informal channels regardless, leaving
the coordinator to capture those requests manually. The mitigation is that
coordinator-side capture keeps every request inside the single record even when the
requester does not use the platform directly. If pilot evidence shows informal channel
use persisting at volume, the correct response is a change request against this
baseline, not an unrecorded reversal.

SCP-016 rests on a different basis worth distinguishing: it is excluded for lack of
evidence rather than on principle. If institutional interfaces prove available, that
is new evidence and the exclusion should be revisited through change control.

---

# 5. Constraints

## 5.1 Purpose

Constraints are fixed conditions the project must engineer within. Recording a
constraint is not the engineering act; stating what it *implies* is. Each entry
therefore carries an engineering implication and, where relevant, the constraints it
interacts with and the trade-off that interaction creates.

**Controlled artefact:** Constraints v0.2.

## 5.2 Constraints recorded

Nineteen constraints are recorded across five categories.

| Category | Count | Constraints |
|---|---|---|
| Scope | 2 | CON-001, CON-011 |
| Schedule | 3 | CON-002, CON-009, CON-013 |
| Cost & resources | 3 | CON-003, CON-004, CON-008 |
| Quality | 8 | CON-005, CON-010, CON-012, CON-014, CON-015, CON-016, CON-017, CON-018 |
| Security | 3 | CON-006, CON-007, CON-019 |

CON-001 to CON-008 derive from the Master Brief. CON-009 to CON-019 derive from client
instruction issued verbally on 09/09/2026 and captured under the process recorded as
DEC-009.

## 5.3 Selected implications

| ID | Constraint | Engineering implication |
|---|---|---|
| CON-001 | Minimum capability floor, baselined and change-controlled | Sets a floor that cannot be traded away under schedule pressure; every addition must be justified against its effect on the other constraints |
| CON-003 | Free or low-cost services preferred; free-tier limits must be identified | Free tiers commonly restrict backups, private networking and audit log retention, so the hosting decision cannot be made on price alone |
| CON-004 | Three part-time students; technology limited to what the team can support | Team capability is an engineering input, not a preference; an unfamiliar stack spends schedule on learning rather than verification |
| CON-007 | POPIA obligations over student and staff personal information | Constrains what may be captured, who may view it, how long it is retained and whether access is auditable (Republic of South Africa, 2013) |
| CON-008 | Institutional platform availability is not guaranteed | Compatibility must be verified before technology is committed; a technically sound choice may prove undeliverable |
| CON-009 | Effort and development time must be estimated (COCOMO / PERT) | Requires a size estimate before M2 scope can be responsibly fixed, and requires scope reduction rather than optimistic adjustment where the calculated time exceeds the window |
| CON-010 | Approximately 100 users, with reasoning to 1000 | Converts a scalability aspiration into a testable figure; rules out in-memory session state and unindexed scans |
| CON-012 | Layered architecture required | Removes architectural style from the M2 decision space; the M2 record justifies layer boundaries rather than selecting a style |
| CON-013 | Demonstrable frontend, backend and API progress from week 3 | Overlaps construction with the M2 design phase; forces DEC-002 and DEC-003 to close by 22 September and supplies the velocity checkpoint described in §11.4 |
| CON-019 | RBAC, user grouping and encryption, tested adversarially | Authorisation must be enforced server-side at every entry point, not by hiding interface elements |

## 5.4 Worked trade-off: cost against security and retention

CON-003 favours free or low-cost hosting. CON-006, CON-007 and CON-019 require audit
logging, retention control and encryption at rest. These pull against each other
directly, because the controls the security constraints require are frequently paid
features on platforms that are otherwise free.

The trade-off cannot be resolved by preference. Committing to a free tier now would
risk baselining availability and audit commitments the platform cannot honour;
committing to a paid tier now would incur cost against STK-008 without evidence that it
is necessary.

The team's position is that the decision is not yet supportable and has been deferred
as DEC-003, with the evidence required stated explicitly: documented free-tier limits
for candidate platforms covering audit log retention, backup and likely operational
cost beyond the educational context. Two scope items (SCP-014, SCP-015) are blocked
behind that decision, and the exposure is tracked as RSK-008.

A second interaction is worth recording. CON-015 requires trigger-based database
auditing and CON-018 requires an indexing strategy; both add write cost, and CON-010
sets the throughput the system must sustain. Every status change writes the record, the
audit row and each affected index. At 100 users this is unlikely to bind, but the
interaction is the reason NFR-2.6 requires each index to be justified rather than
applied uniformly.

---

# 6. Requirements and Acceptance Criteria

## 6.1 Purpose

Requirements convert stakeholder need and scope commitment into statements that can be
built and verified. Each carries a unique identifier, a source, a priority and — where
important — acceptance criteria that a third party could evaluate without asking the
team what was intended.

**Controlled artefacts:** Functional Requirements v0.2, Non-Functional Requirements
v0.2, Acceptance Criteria v0.2.

## 6.2 Functional requirements

Forty-nine functional requirements are recorded across nine feature groups.

| Group | Count |
|---|---|
| 1. Identity and access control | 6 |
| 2. Request submission | 6 |
| 3. Requester visibility and feedback | 6 |
| 4. Staff access and retrieval | 6 |
| 5. Assignment and ownership | 5 |
| 6. Lifecycle and status control | 7 |
| 7. Work record and resolution | 5 |
| 8. Management reporting | 6 |
| 9. Reference data administration | 2 |

Prioritisation: 40 High, 8 Medium, 1 Low. The High band corresponds to the CON-001
capability floor. Medium and Low items are committed but may be staged through
controlled change if schedule pressure materialises — a descope of this kind is
recorded, not absorbed. The mechanism by which that would happen is the velocity
checkpoint described in §11.4.

Each requirement cites its source in stakeholder, scope, conflict or decision
identifiers, so the origin of every committed behaviour is recoverable.

## 6.3 Non-functional requirements

Thirty non-functional requirements are classified under the four-category scheme
carried forward from Systems Analysis and Design, reconciled to the ISO/IEC 25010:2023
product quality model in the Project Charter (International Organization for
Standardization, 2023).

| Category | Count |
|---|---|
| 1. Operational | 11 |
| 2. Performance | 7 |
| 3. Security | 7 |
| 4. Cultural and political | 5 |

Each NFR states a metric, a threshold and the condition under which it applies, and
carries a measurement basis recording where the figure came from and what assumption it
rests on. Examples:

- **NFR-2.1** — submission confirmation within 3 seconds for 95% of submissions at 100
  concurrent authenticated users.
- **NFR-1.2** — every requester and technician function usable from a 360 CSS pixel
  viewport with a minimum 44 × 44 pixel touch target (Apple Inc., 2026).
- **NFR-1.5** — recoverable to a state no more than 24 hours old following total loss
  of the primary data store.
- **NFR-3.3** — every authorisation rule enforced server-side on each request, at every
  entry point.

The 100-user figure in NFR-2.1 and NFR-2.4 is client-supplied under CON-010 and is not
a team assumption. Where a figure *is* a team assumption — the 10 000-request volume in
NFR-2.2, the 24-hour recovery point in NFR-1.5 — the measurement basis records it as
such and an open item tracks it.

## 6.4 Acceptance criteria

Eighty acceptance criteria are recorded in Given / When / Then form, one criterion per
row, each verifying exactly one requirement. Every *Then* clause states an observable
outcome.

The test applied throughout: could a third party determine pass or fail without asking
the team what was meant? A criterion stating that the system "handles the request
appropriately" fails that test; AC-FR-1.3, which requires that the system rejects the
operation, makes no change to the request and records the rejection, passes it.

## 6.5 Requirements not yet settled

Four requirements are disclosed as unsettled at baseline rather than presented as
agreed:

| Requirement | Status | Reason |
|---|---|---|
| FR-4.2 | Proposed — OI-01 | Open item outstanding |
| FR-8.4 | Proposed — OI-02 | Open item outstanding |
| FR-9.1 | Proposed — OI-03 | Open item outstanding |
| NFR-4.2 | Blocked — OI-05 | Retention period depends on DEC-005, which is deferred |

NFR-4.2 is blocked rather than merely open: it states a retention period that cannot be
written until DEC-005 closes. This is disclosed consistently across the requirements
register, the RTM and the open items file. Sixty-eight of seventy-nine RTM rows are
fully baselined; the remainder carry an explicit qualifier naming the assumption or
decision they depend on.

---

# 7. Traceability

## 7.1 Purpose

Traceability connects the reason for a commitment to the evidence that it was met.
Followed forward it shows impact; followed backward it shows purpose. Its value is not
administrative: at M4 the project must demonstrate which stakeholder expectations were
satisfied, and an untraceable requirement cannot be evaluated against the expectation
that produced it.

**Controlled artefact:** Requirements Traceability Matrix v0.2.

## 7.2 Structure

The RTM holds 79 rows, one per functional and non-functional requirement.

At v1.0 it carried nine columns: requirement ID, source, requirement, priority, acceptance
criteria, design reference, test reference, release reference and status. The design, test
and release columns were deliberately empty, present so that later evidence would extend
the existing trace rather than require a new artefact.

At v2.0 the matrix carries fourteen columns. The three placeholder columns are replaced by
the evidence the later lifecycle stages actually produce:

| Column | State at v2.0 |
|---|---|
| Requirement ID, source, requirement, priority, acceptance criteria | Carried forward from v1.0 |
| ASR / quality-driver link | Populated where a requirement is traceable to a recorded architectural driver; otherwise carried as pending against the architecture baseline |
| Architecture / module / component | Module identified for every requirement; component allocation pending the architecture baseline |
| Data / persistence impact | Populated where the requirement determines a persistence consequence; otherwise pending the data model |
| Design / interface decision | Populated where DEC-011 or DEC-012 applies; otherwise pending |
| Technology decision | Populated for every row from DEC-002, with the specific mechanism named where the technology determines the approach |
| Implementation evidence | *Planned / Not Yet Implemented* |
| Verification evidence | *Planned* |
| Status | Carried forward, revised where a requirement changed under control |
| ADR / change / risk reference | Populated from the decision log, conflict register, risk register and open items |

A column that has no evidence yet carries a controlled status rather than a blank, so that
the absence is a recorded position rather than an omission.

## 7.3 Expected final chain

Consistent with Master Brief §11.1:

**Stakeholder / source → Requirement → Design / Architecture → Issue / PR →
Implementation → Test → Acceptance / Release evidence**

At M1 the first two links and the acceptance criteria were populated. At v2.0 the design
and architecture link is populated where a decision has been taken, and the technology
decision is recorded against every requirement. The implementation, test and release links
remain unpopulated and carry a controlled status.

## 7.4 Worked trace

FR-6.7 — the immutable status, assignment and comment history — traces as follows:

| Link | Evidence |
|---|---|
| Stakeholder need | STK-005 requires reliable information on outstanding, overdue and resolved work; the scenario names weak accountability for status changes as a primary failure |
| Scope commitment | SCP-008 — controlled status transitions with the acting user recorded |
| Constraints | CON-007 (auditable handling of personal information); CON-015 (database changes auditable via triggers and logging) |
| Requirement | FR-6.7 |
| Acceptance criterion | AC-FR-6.7 |
| RTM status | Baselined |
| Still to be added | Design reference at M2; test reference at M3; release evidence at M4 |

A second trace is maintained separately as a controlled artefact — the Traced Example
— following STK-006 through CFL-002, CON-006, DEC-004 and SCP-012 into FR-3.5, FR-1.5,
AC-FR-3.5, NFR-3.3 and NFR-4.4. It records honestly that CFL-002 remains Proposed
rather than agreed, so the chain rests on a resolution not yet confirmed with the
stakeholder.

---

## 7.5 End-to-end trace at this milestone

§7.4 records the Milestone 1 trace for FR-6.7. That trace is retained unchanged. This
section carries the same requirement forward across the full chain required at this
milestone, so that the evolution of the engineering evidence for one requirement is
visible rather than asserted.

FR-6.7 was chosen because it is the requirement on which the largest number of this
milestone's decisions converge: it is constrained by a client instruction, it determines a
persistence structure, it is the reason one consequence of a status transition is
deliberately handled differently from the others, and the technology selected under
DEC-002 changes where part of it is enforced.

| Link | Evidence at v2.0 |
|---|---|
| **Requirement** | FR-6.7 — the system shall maintain an immutable history of status, assignment and comment changes. Acceptance criterion AC-FR-6.7. Sourced from STK-005 and committed in scope as SCP-008. |
| **ASR / Constraint** | The quality driver is auditability: a record of who changed what, when, that cannot be altered after the fact. CON-015 requires database changes to be auditable through triggers and logging. CON-007 requires auditable handling of personal information. NFR-1.9 states the audit obligation as a measurable property. The architecturally significant requirement identifier assigned to this driver is recorded in the architecture baseline. |
| **Architecture Responsibility** | Request lifecycle management. `StatusTransitionService` owns the transition and is the only component permitted to write a history entry. The audit record is not owned by the application layer at all; responsibility for it sits in the data tier, which is what CON-015 requires and what makes the record unfalsifiable by application code. |
| **Data Decision** | `requestHistory` is append-only: no update or delete operation is exposed on it, and the collection is never written except by the transition that caused the change. `auditLog` is written below the application layer. The retention period applying to these records is affected by the conflict recorded as OI-06 between NFR-1.4 and DEC-005, which is escalated and not closed at this version. |
| **Design / Interface Decision** | DEC-011. The history append is a **direct write inside the transition**, not a subscriber to the published event. This is the point at which DEC-011 draws a line: the event mechanism carries consequences that may fail independently of the transition — notification, projection — whereas FR-6.7 must not be capable of succeeding or failing separately from the status change it records. A history entry that can be lost while the status change commits would not satisfy AC-FR-6.7. The distinction is visible in the component diagram at §10.6: steps 1 and 2 are solid, step 3 is dashed. |
| **Technology / ADR** | DEC-002 — MongoDB Atlas, Express, React, Node.js. Atlas managed database triggers provide the mechanism CON-015 requires, attached to the collection rather than to application code, so the audit write cannot be bypassed by any route. DEC-010 remains open against this link: the cluster tier is deferred, and the free tier does not support automated backup, so the durability of the history is an accepted exposure recorded rather than resolved at this version. |
| **Application Artefact** | `src/services/statusTransitionService.js` performs the transition in a fixed order: the status change is committed, the history entry is appended, and the event is published last. `src/models/RequestHistory.js` enforces append-only storage at the schema, refusing every mutating operation Mongoose exposes, and `src/repositories/historyRepository.js` offers callers no mutating method at all. Immutability is therefore a property of the record rather than a discipline of the caller, which is what AC-FR-6.7 requires. The Atlas trigger writing `auditLog` under CON-015 is held as repository configuration and is added with the deployment work under DEC-003. |
| **Initial Verification** | `tests/statusTransitionService.test.js`, eight assertions executed by `npm test`. The suite asserts that a permitted transition writes exactly one history entry; that the entry records the acting user, the acting role and both the prior and the new status; that the history entry is appended before the event is published; that an illegal transition, a role not permitted to perform the move, and an actor outside the owning department each leave nothing written and nothing published; and that a failing subscriber leaves the transition and its history entry intact. Database-level enforcement of append-only storage requires a test cluster and is scheduled for M3. |

**Verification of the enforcement decision.** `tests/authorisationGuard.test.js` walks
the Express route table and fails the build if any non-public route is registered without
the composed guard. This is the assertion DEC-012 relied on when it rejected the
per-method guard-call alternative on detectability, and it is the evidence NFR-3.3 and
CON-019 require: the control is shown to be present on every route rather than on the
routes someone remembered to check. The assertion was itself verified by registering an
unguarded route and confirming that the suite fails, so its ability to detect the
condition it tests is established rather than assumed.

**What changed between M1 and M2 for this requirement.** At M1 the trace ended at the
acceptance criterion: the requirement was stated, sourced and made testable, and the
remaining links were structurally present but empty. At M2 four further links carry
evidence. The requirement now has an identified owning component, a persistence structure
chosen to make immutability a property of the data rather than a promise of the code, a
design decision that deliberately excludes it from the event mechanism the same transition
uses for its other consequences, and a technology whose managed triggers move the audit
obligation below the layer that could otherwise circumvent it.

**What is honestly still absent.** The trace is complete for FR-6.7 at this milestone.
Three related items remain open and are recorded rather than concealed. DEC-012's third
enforcement point, the response serialiser, is not implemented because it depends on the
CFL-002 resolution, which remains *Proposed*: baseline condition C-01 is open and the
exposure is tracked as RSK-009. The Atlas trigger required by CON-015 is defined but not
yet deployed, pending DEC-003. Database-level verification that no operation can modify an
existing history entry requires a test cluster and is scheduled for M3; at this version the
guarantee rests on the schema and on the absence of any mutating operation in the exposed
interface.

---

# 8. Risk Management

## 8.1 Purpose

The risk register is a live artefact reviewed at every milestone. Its purpose is to
make exposure explicit early enough to be managed, and to connect a risk to the
decision, constraint or scope item that creates it. A risk stated too vaguely to act on
has no engineering value.

**Controlled artefact:** Risk Register v0.4.

## 8.2 Method

Probability and impact are each scored 1 to 3 and multiplied for a priority score,
banded High, Medium or Low. Each risk records a cause, an early-warning indicator,
preventive mitigation, contingency if realised, an owner and a status. The
early-warning indicator is what makes the register operable: it states the observable
signal that the risk is materialising, rather than leaving detection to judgement.

**Two registers, one risk set.** The project maintains a second, quantified view of the
same exposures in Project Charter v0.3 §7.3, expressed in rand so that Risk Exposure and
Risk Reduction Leverage can be computed and the contingency fund derived. Charter risks
carry RK identifiers. The register described here is the authoritative engineering
register; the reconciliation mapping between the two identifier sets is held in Project
Charter v0.3 §7.1, and where the two disagree this register governs.

## 8.3 Register summary

Fifteen risks are recorded, RSK-001 to RSK-015, each linked to the artefacts that
create or are affected by the exposure. Every risk names a specific condition rather
than a general category.

**Highest exposure (priority 9):**

| ID | Risk |
|---|---|
| RSK-001 | Requesters continue using email, telephone and WhatsApp after launch, so duplication persists outside the single record |
| RSK-002 | Identifiable personal information is retained indefinitely because no retention period has been agreed |
| RSK-014 | The AI productivity assumption underpinning the schedule fails to deliver the required multiplier, and the remaining critical path overruns the delivery window |

**High band (priority 6):** RSK-003 (no agreed definition of "overdue"), RSK-004
(duplicates recreated inside the platform), RSK-007 (selected stack unavailable in the
institutional environment), RSK-008 (hosting platform cannot satisfy security and
retention needs), RSK-009 (RBAC specified but only partially delivered), RSK-012
(traceability decays after baseline), RSK-015 (DEC-002 and DEC-003 not closed by 22
September, so the CON-013 week-3 gate is missed).

**Medium band (priority 3–4):** RSK-005, RSK-006, RSK-010, RSK-011, RSK-013.

## 8.4 The risk deserving most attention

**RSK-002 — indefinite retention of identifiable personal information.**

It scores at the maximum on both dimensions, and unlike most entries its cause is
already present rather than anticipated. DEC-005 defers the retention period pending
guidance from STK-009 that the team does not yet have. Until it closes, the platform
has no rule governing how long identifiable request data is held, and NFR-4.2 cannot be
written.

It is chosen over RSK-001 — which shares the same score — because its consequences are
harder to reverse. If requesters keep using informal channels, the mitigation is
operational and recoverable. If the data model is built without a retention rule,
retrofitting one means changing the schema, the audit trail and the reporting
aggregation simultaneously, and the compliance exposure under CON-007 accrues in the
meantime.

RSK-014 shares the same score and is arguably the larger threat to delivery, but it is
distinguishable in kind: it has a scheduled measurement point at the CON-013 gate on 29
September and a pre-agreed response, whereas RSK-002 has neither until DEC-005 closes. A
risk with a date and a trigger is under management; one without is not.

The early-warning indicator for RSK-002 is specific: reaching the M2 data model with
DEC-005 still open and unowned. The contingency, if guidance does not arrive, is to adopt
a documented institutional retention standard as an interim position rather than
proceeding with none.

## 8.5 A risk the register raises against the baseline itself

RSK-003 records that no engineering decision has been logged for the service-level
target behind "overdue", and notes explicitly that this is unlike every other open
question in the baseline, each of which has a DEC entry. The register flagging a gap in
the decision log rather than only in the product is the register functioning as
intended.

---

# 9. Forward Engineering Considerations

## 9.1 Purpose

Some concerns are implemented later but must influence decisions now. The purpose of
this register is to identify those concerns without prematurely deciding them, and to
record what each one has already changed in the baseline. It is the difference between
thinking ahead and racing ahead.

**Controlled artefact:** FEC Register v0.2, with a second sheet recording baseline
influence.

## 9.2 Considerations recorded

Seven concerns are recorded, within the required range of five to seven. Each states
why it matters now, the later decision or activity it influences, the information still
missing, and the risk of ignoring it.

| ID | Concern |
|---|---|
| FEC-001 | Security, access control and personal information |
| FEC-002 | Migration and cut-over from the existing channels |
| FEC-003 | Testability and measurable acceptance |
| FEC-004 | Technology availability in the institutional environment |
| FEC-005 | Deployment platform, audit retention, backup and recovery |
| FEC-006 | Observability, audit trail and operational accountability |
| FEC-007 | Operational cost and sustainability after handover |

## 9.3 Influence already exerted on this baseline

The register's second sheet records what each concern changed, which is what
distinguishes forward engineering from speculation.

| FEC | Effect on the baseline |
|---|---|
| FEC-001 | Access control entered the scope baseline as SCP-012 despite not being a stated business capability; DEC-004 and DEC-005 follow from it |
| FEC-002 | SCP-017 records the channel-ingestion exclusion with its engineering ground rather than as an omission |
| FEC-003 | CON-005 was recorded with the implication that every quality attribute creates a later verification obligation; all NFRs carry a measurement basis as a result |
| FEC-004 | CON-008 was recorded as a constraint in its own right and DEC-002 defers stack selection until availability is verified |
| FEC-005 | DEC-003 defers the hosting decision on the ground that free tiers omit audit retention and backup |
| FEC-006 | SCP-008 specifies controlled status transitions with the acting user recorded; AC-FR-6.3, AC-FR-6.7, AC-NFR-1.4 and AC-NFR-3.6 make the audit trail testable |
| FEC-007 | CON-003 records that the hosting decision cannot be made on price alone |

## 9.4 Outstanding asks

The register tracks its own unfinished business. Outstanding at baseline: documenting
likely operational cost beyond the educational context (FEC-007); a scope position on
requests already open at go-live (FEC-002); a decision record for the service-level
target behind "overdue" (FEC-003, and RSK-003). These are carried forward rather than
closed.

---

# 10. Engineering Decisions

## 10.1 Purpose

Decisions are recorded so that their consequences can be evaluated later against the
evidence available at the time, rather than with hindsight. The log records genuine
decisions taken during M1 and deliberate deferments where evidence is not yet
sufficient. Recording a deferment is an engineering act: it preserves the option and
states what would close it.

**Controlled artefact:** Decision Log v0.2.

## 10.2 Decisions recorded

Thirteen entries: eleven decided, one deferred, one superseded. The three deferments
carried from Milestone 1 — DEC-002, DEC-003 and DEC-005 — closed at this milestone; one new
deferment was recorded as DEC-010; and the two initial design decisions required at this
checkpoint were recorded as DEC-011 and DEC-012. The disposition of each M1 deferment is
stated in §1.7.2, and the design decisions are described in §10.6.

**Supersession and identifier stability.** DEC-007 is retained with its original identifier
and marked superseded, as §1.4 requires: a retired item is never renumbered or removed, so
any earlier document citing DEC-007 still resolves to the entry it cited. The revised
decision carries a new identifier, DEC-013, because an identifier names one recorded
position and the revision is a second position taken on different grounds. The relationship
between the two is described in §10.5. Artefacts that cited DEC-007 for the revised basis
are updated to cite DEC-013.

| ID | Decision | Status |
|---|---|---|
| DEC-001 | Scope CivicConnect to a campus / educational institution context | Decided |
| DEC-002 | Select the technology stack — MERN (MongoDB, Express, React, Node.js) | Decided at M2 |
| DEC-003 | Select the hosting and deployment platform — Hostinger | Decided at M2 |
| DEC-004 | Treat role-based access control as an architecturally significant requirement | Decided |
| DEC-005 | Set the personal-information retention period at one month | Decided at M2 |
| DEC-006 | Limit mandatory capture fields to category, location and description | Decided |
| DEC-007 | Exclude a native mobile application — original team judgement | Superseded by DEC-013 |
| DEC-008 | Adopt a two-stage protected branching model | Decided |
| DEC-009 | Adopt a controlled process for capturing verbally-issued client requirements | Decided |
| DEC-010 | Defer the Atlas cluster tier, and the mechanism by which the NFR-1.5 recovery point is met | Deferred at M2 |
| DEC-011 | Publish a domain event from the status-transition service; consequences subscribe to it | Decided at M2 |
| DEC-012 | Enforce authorisation at the route boundary, in the service layer and in the response serialiser, against one documented rule set | Decided at M2 |
| DEC-013 | Exclude a native mobile application; mobile access delivered through responsive web — client directive under CON-011 | Decided |

## 10.3 Decision defended: DEC-001

The Master Brief describes the client only as "a community-focused organisation". The
request types it lists — facility faults, damaged equipment, security concerns, IT
support, maintenance, lost property — correspond to an institutional campus rather than
a municipality or a residential estate.

Proceeding without resolving this would have left the stakeholder set ambiguous and
every derived requirement resting on an unstated premise. The team therefore recorded a
controlled assumption rather than an implicit one.

The consequence is significant and is stated in the log: DEC-001 determines the entire
stakeholder register and the applicability of POPIA under CON-007. If the assumption
proves wrong, STK-001 to STK-009 and every requirement derived from them must be
revisited. That exposure is carried as RSK-006, with confirmation from the client proxy
as its mitigation.

## 10.4 Deferment defended: DEC-003

The hosting and deployment platform decision is deliberately not made.

Alternatives considered were committing to a free-tier platform now, or to a paid
platform now. Neither is supportable on current evidence: CON-003 favours a free tier,
while CON-006 and CON-007 require audit log retention, backup and encryption that free
tiers commonly omit. No platform research has been carried out, so a choice made now
would be a preference presented as a decision.

The evidence required to close it is stated: documented free-tier limits for candidate
platforms covering audit log retention, backup and likely operational cost beyond the
educational context.

The deferment has a cost, and the log records it. SCP-014 and SCP-015 are both blocked
behind this decision, and it must close before the M2 architecture is fixed. CON-013
sharpens that further: demonstrable construction in week 3 is unreachable without a
committed deployment target, which places a working deadline of 22 September on this
deferment. The exposure is tracked as RSK-008 and RSK-015, and the evidence-gathering is
a named ask under FEC-005.

## 10.5 A decision revised before baseline, and how the revision is recorded

DEC-007 excluded a native mobile application on 06/09/2026 as a team judgement. On
09/09/2026 the client confirmed verbally that the solution is to be a web application with
mobile access through responsive web (CON-011).

The decision did not reverse; its basis changed. That change carries a consequence worth
recording: the exclusion is now a client directive and cannot be revisited without a change
request under Master Brief §14, where previously it was a team position open to
reconsideration. A team may change its own mind; it may not silently change the client's.

**How the log records it.** The original entry is retained under DEC-007 and marked
superseded. The revised decision is recorded separately as DEC-013. Two identifiers are used
rather than one because each names a distinct recorded position: DEC-007 states what the
team decided and on what ground, and DEC-013 states what is now binding and on whose
authority. Overwriting DEC-007 would have destroyed the evidence that the basis changed,
which is the part with downstream consequence; renumbering it would have broken the
identifier rule in §1.4 and orphaned every prior citation.

The practical effect is that DEC-007 remains resolvable for anything that cited it before
09/09/2026, while artefacts that depend on the current basis — NFR-1.2 and its measurement
basis among them — cite DEC-013.

This revision was made before the M1 baseline. After that baseline, an equivalent change
requires a change request and impact analysis rather than an edit, and the same
retain-and-supersede treatment applies.

## 10.6 Initial design decisions recorded at this milestone

Two genuine CivicConnect design problems were identified and a final project-specific
decision was made for each. Both are recorded as full decision records in the controlled
log; what follows states the problem, the judgement and the cost accepted, and identifies
where the research that informed each one is held.

**DEC-011 — the consequences of a status transition.** A transition produces several
outcomes belonging to different parts of the system: the validated status change (FR-6.2,
FR-6.4), the immutable history entry (FR-6.3, FR-6.7), in-application feedback to the
requester (FR-3.4, SCP-004) and the counts the management view reads. The audit write is
not among them, because CON-015 and NFR-1.9 place it below the application layer through
the managed database triggers committed under DEC-002. The remaining set is known to be
incomplete: SCP-014 is deferred rather than excluded, and its blocking decision has closed.
The decision is in-process event publication — the transition publishes a domain event and
the consequences subscribe — rather than direct invocation of each consequence in turn.
The benefit is that an anticipated consequence attaches without editing transition code
already reviewed and verified. The cost is recorded rather than absorbed: no single
location states what a transition does, which works against the traceability exposure in
RSK-012, and the subscriptions are therefore held in one registry so that the set remains
enumerable.

![DEC-011 component diagram](Media/dec011.png)

*Figure 1 — DEC-011: component diagram of the consequences of a request status
transition. Solid edges are direct calls and writes; dashed edges are event flow. The
Atlas database trigger attaches to the collections, not to the emitter.*

**DEC-012 — where authorisation is enforced.** NFR-3.3 requires every authorisation rule to
be enforced at the server on each request at every entry point, and CON-019 excludes the
absence of an interface control as a restriction. The requirement set is not uniform: it
spans function-level access (FR-1.3, FR-6.4), object-level access that depends on the
request rather than the caller (FR-3.6, FR-4.1), and field-level access for
security-category requests (FR-1.5, FR-3.5, FR-8.6, NFR-4.4). The decision enforces at
three points against a single documented rule set: composed middleware at the route
boundary, the service layer once the request document is loaded, and the response
serialiser. The alternative of an explicit guard call at each service method was rejected
on detectability — a missing call is invisible, whereas a route registered without its
guard is visible in the route table and can be asserted against automatically, which is
what the adversarial testing required by CON-019 needs. The cost is that enforcement is
distributed across three locations while the rule set is single, and that the field-level
rule rests on CFL-002, which remains *Proposed*; condition C-01 is open and the decision
would require revision if STK-006 does not agree the resolution.

![DEC-012 sequence diagram](Media/dec012.png)

*Figure 2 — DEC-012: sequence diagram of the three enforcement points. Path A is refused
at the route boundary, Path B is permitted there and refused in the service once the
document is loaded, and Path C is permitted at both points and restricted at the
serialiser.*

**Relationship to the Assignment 2 research.** Both problems were researched in the team's
Assignment 2, which compared alternatives and recorded recommendations. The research is
referenced from each decision record rather than reproduced here. DEC-011 adopts the
approach that research recommended. DEC-012 differs in form: Assignment 2 held its
recommendation open and did not research a hybrid, and the three-granularity structure of
the requirement set together with the technology committed under DEC-002 produced a
different final judgement. That difference is recorded in the decision entry with the
project-specific evidence that caused it.

**Application evidence.** Both decisions carry a status of *Planned / Not Yet Implemented*
against the affected requirements in the traceability matrix. Neither is claimed as
implemented, and the RTM records that position rather than leaving the columns blank.

---

# 11. Governance, Accountability and AI Controls

## 11.1 Repository as an engineering control

The team repository is the engineering control environment, not a file store. Controlled
artefacts live in it, change through it, and carry their review history in it.

**Branching model (DEC-008).** Feature branches merge to `dev`; `dev` merges to `main`
at a release or baseline point. Both branches are protected. Alternatives considered
were trunk-based development against a single protected `main`, and full GitFlow with
release and hotfix branches; the latter adds machinery three students on a single
delivery stream do not need.

The consequence is recorded: every substantive change requires two approvals at two
merge points, so integration is slower and `main` lags `dev`. Baseline evidence must
therefore be explicitly merged and tagged at each milestone rather than assumed present.

**Review model.** Pull requests are required for substantive changes. Two approvals are
required from members other than the author. Self-approval is not accepted. The rule
exists because a change entering the controlled baseline should have been evaluated by
someone who did not write it, against requirements, maintainability, security and
traceability impact — a second reader catches what an author cannot.

**Issues.** Engineering work is represented on the project board and mapped to the M1
required-output list, so the board reflects milestone obligations rather than only code
tasks.

**Secrets.** No password, API key, token or connection secret is committed at any point
in the repository history. This is stated as a verifiable property in NFR-3.5 rather
than as an assurance.

## 11.2 Individual accountability

Roles are assigned but do not remove collective responsibility. Every member is
expected to locate and explain any controlled artefact, trace a requirement from source
to acceptance, and explain a decision and its consequences, regardless of who drafted
it.

## 11.3 Responsible AI use

**Controlled artefact:** AI Usage Register v0.1.

AI has been used as an engineering assistant for drafting and analysis. AI output is
not authoritative evidence and does not transfer accountability. Every AI-assisted
artefact has been reviewed, verified against the governing documents and amended before
entering the baseline, and is subject to the same branch, review and approval controls
as any other change.

The register records the date, student, tool, engineering task, the AI contribution,
the verification applied and the resulting decision. Recorded contributions to date
cover stakeholder identification, conflict analysis, scope classification, constraints
analysis, the problem and business need section, and register formatting. In each case
the verification column states what was checked — sources traced against Master Brief
§2 and §3 capability groups, scope items checked against the capability list,
constraints verified against §4, §18 and §25 — and the decision column records what was
accepted, corrected or added.

**Elevated significance from M2.** Project Charter v0.3 §4.6 makes AI-assisted
productivity the critical assumption underpinning the delivery schedule. From that point
the register ceases to be a compliance artefact and becomes primary project evidence:
it is where the assumption recorded in Charter assumption A14 is either substantiated or
found wanting.


## 11.4 Known limitations of the M1 evidence

Stated in accordance with the expectation that limitations are identified honestly
rather than obscured:

- All four stakeholder conflict resolutions remain Proposed and unconfirmed with the
  stakeholders concerned (§3.4).
- **The baselined scope exceeds deliverable capacity within the available window.**
  Project Charter v0.3 §4.6 quantifies the gap and §5.2 puts completion probability at
  50% at the required productivity rate. The plan is also brittle: a six-point error in
  the accelerable share moves the requirement from 6.39× to 15.95×. The team carries
  this as a measured assumption with a scope-reduction trigger at the CON-013 gate on 29
  September rather than as a claim that the schedule holds. Recorded as condition C-05
  and tracked as RSK-014.
- Repository commit history is concentrated in the final days of the milestone.
  Artefacts were drafted before they were committed; the team records that progressive
  commit discipline is an engineering control and not an administrative formality, and
  the practice is being corrected from M2.
- Pull request approvals are procedurally correct but several carry limited written
  review comment, with review having taken place synchronously off-platform. The
  standard the team is working toward is exemplified by the reviews that do record what
  was checked.
- The AI Usage Register is incomplete as described in §11.3.

---

# 12. Baseline Statement

## 12.1 What is baselined

**Carried forward from v1.0.** The Milestone 1 engineering baseline remains in force
except where this document records a controlled change:

- The stakeholder register and conflict analysis
- The scope baseline: 13 in scope, 4 deferred, 4 out of scope
- 19 constraints across scope, schedule, cost and resources, quality and security
- 49 functional and 30 non-functional requirements with 80 acceptance criteria
- The forward engineering considerations register, 7 entries
- The repository governance controls described in §11

**Added or revised at v2.0.** This document, at version 2.0, together with the controlled
artefacts indexed in Appendix A, constitutes the CivicConnect Architecture, Technology and
Initial Design Baseline:

- The engineering decision log, extended from 10 entries to 13: DEC-002, DEC-003 and
  DEC-005 closed; DEC-010 recorded as a new deferment; DEC-011 and DEC-012 recorded as the
  initial design decisions
- The technology-stack and deployment decisions, with their evidence and consequences
- The requirements traceability matrix, extended from nine columns to fourteen
- The scope baseline, with the bases of SCP-014, SCP-015 and SCP-020 revised under control
- NFR-4.2, released from its dependency on DEC-005
- The open items register, with OI-05 closed, OI-06 escalated and OI-12 raised
- The risk register and the AI usage register, updated for this milestone

The architecture baseline, the data and persistence baseline and the application evidence
are recorded in the sections and artefacts they belong to, and are approved as part of this
baseline in Appendix B.

## 12.2 What is deliberately not decided

At v1.0 three decisions were open with the evidence required stated: the technology stack
(DEC-002), the hosting and deployment platform (DEC-003) and the personal-information
retention period (DEC-005). All three closed at this milestone; their disposition is
recorded in §1.7.2.

One decision is open at v2.0 with the evidence required stated: the Atlas cluster tier and
the mechanism by which the recovery point asserted in NFR-1.5 is met (DEC-010). Three
requirements remain unsettled — FR-4.2, FR-8.4 and FR-9.1 — as recorded in §6.5; NFR-4.2
is closed by the closure of DEC-005. Three conditions from the M1 baseline are carried
forward rather than closed: C-01, C-02 and C-05, as recorded in Appendix B.

These are preserved options and disclosed exposures, not omissions.

## 12.3 How change is controlled from here

Baselined content is not silently edited. A change follows Master Brief §14: change
request, impact analysis, decision, authorisation, implementation, verification,
baseline update. Impact analysis considers, where relevant, requirements and acceptance
criteria, architecture and design, data and migration, security and privacy, scope,
schedule and cost, testing and regression, deployment and operations, and risk and
technical debt.

An approved change updates the RTM and every affected artefact. The decision log records
the change and its rationale, and the version history in this document records the
resulting version.

## 12.4 Readiness

The team's position is that the foundation is sufficiently controlled to support the
architecture and design decisions of Milestone 2, with the open items in §12.2, the
conditions in Appendix B and the limitations in §11.4 carried forward explicitly rather
than closed prematurely.

That position is qualified in one respect the team states plainly: the baselined scope
is larger than the available capacity can deliver, and the plan for closing that gap
rests on an assumption that has not yet been measured. The foundation is controlled; the
schedule is not yet evidenced. Condition C-05 is the mechanism by which that becomes
either substantiated or a recorded, controlled descope.

---

# 13. References

Apple Inc. (2026) *Human Interface Guidelines: Layout.* Available at:
https://developer.apple.com/design/human-interface-guidelines/layout (Accessed: 9
September 2026).

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

World Wide Web Consortium (2023) *Web Content Accessibility Guidelines (WCAG) 2.2.* W3C
Recommendation, 5 October 2023. Available at: https://www.w3.org/TR/WCAG22/ (Accessed:
9 September 2026).

---

# Appendix A — Controlled Artefact Index

| Artefact | Version | Location |
|---|---|---|
| Stakeholder Register | v0.2 | `docs/requirements/Stakeholder Register` |
| Stakeholder Conflicts | v0.1 | `docs/requirements/Stakeholder Conflicts` |
| Scope Baseline | v0.3 | `docs/requirements/Scope Baseline` |
| Constraints | v0.2 | `docs/requirements/Constraints` |
| Functional Requirements | v0.2 | `docs/requirements/Functional Requirements` |
| Non-Functional Requirements | v0.3 | `docs/requirements/Non-Functional Requirements` |
| Acceptance Criteria | v0.3 | `docs/requirements/Acceptance Criteria` |
| Requirements Traceability Matrix | v0.4 | `docs/requirements/Requirements Traceability Matrix` |
| Traced Example | v0.2 | `docs/requirements/Traced Example` |
| Open Items | v0.3 | `docs/requirements/Open Items` |
| Engineering Decision Log | v0.3 | `docs/decisions/Decision Log` |
| Risk Register | v0.4 | `docs/risk/Risk Register` |
| Forward Engineering Considerations Register | v0.2 | `docs/risk/FEC Register` |
| AI Usage Register | v0.1 | `docs/AI-Usage/AI Usage Register` |
| Project Charter | v0.3 | `extras/Project Charter` |
| Team Working Agreement | v0.1 | `docs/Team Work Agreement` |

*All paths contain an outdated folder that carries the previous versions of said artefact*

---

# Appendix B — Baseline Sign-Off

Per Master Brief Appendix D.

| Field | Entry |
|---|---|
| **Project** | CivicConnect |
| **Baseline type** | M1 Engineering Foundation and Requirements Baseline |
| **Version** | PED v1.0 |
| **Date** | 9 September 2026 |
| **Scope reviewed** | <mark>YES</mark> / NO |
| **Requirements and traceability checked** | <mark>YES</mark> / NO |
| **Risk review completed** | <mark>YES</mark> / NO |
| **Repository and governance controls checked** | <mark>YES</mark> / NO |
| **Outcome** | ACCEPTED / <mark>CONDITIONALLY ACCEPTED</mark> / REVISION REQUIRED |

**Conditions recorded (if any):**

## C-01 — Confirm the stakeholder conflict resolutions

**Status:** Open
**Owner:** Ethan Lindsay
**Priority:** Close CFL-002 before the M2 data model is fixed

All four stakeholder conflict resolutions (CFL-001 to CFL-004) are recorded as
*Proposed*. They represent the team's engineering position and have driven the
requirements baseline, but none has been confirmed with the stakeholder concerned.

CFL-002 carries the greatest exposure. Its resolution produced SCP-012 and DEC-004, and
generated FR-1.5, FR-3.5, NFR-3.3 and NFR-4.4. A substantial part of the security
requirement set therefore rests on a resolution that STK-006 has not agreed.

**Closed when:** each resolution is confirmed or amended with the relevant stakeholder
and the conflict register status changes from *Proposed* to *Agreed*.

**Affected artefacts:** Stakeholder Conflicts v0.1 · SCP-012 · DEC-004 · FR-1.5 ·
FR-3.5 · NFR-3.3 · NFR-4.4
**Tracked as:** RSK-005, RSK-009

---

## C-02 — Record a decision for the service-level target behind "overdue"

**Status:** Open
**Owner:** Robert van der Merwe

SCP-011 commits the platform to identifying overdue requests, but no service-level
target has been agreed. Without one the capability cannot be specified precisely, and no
acceptance criterion for it can be evaluated by a third party.

Unlike every other open question in this baseline, no decision log entry exists for it —
the gap is in the decision log itself, not only in the product.

**Closed when:** a service-level target is agreed with STK-005 and recorded as a
decision, **or** a deferment is logged stating the evidence required to decide.

**Affected artefacts:** SCP-011 · Decision Log v0.2 · Acceptance Criteria v0.2
**Tracked as:** RSK-003; named as an outstanding ask under FEC-003

---

## C-03 — Close the four unsettled requirements

**Status:** Open
**Owner:** Robert van der Merwe

Four requirements are baselined in a qualified state:

| Requirement | Status | Dependency |
|---|---|---|
| FR-4.2 | Proposed — OI-01 | — |
| FR-8.4 | Proposed — OI-02 | — |
| FR-9.1 | Proposed — OI-03 | — |
| NFR-4.2 | Blocked — OI-05 | DEC-005 (see C-04) |

NFR-4.2 is blocked rather than merely open: it states a retention period that cannot be
written until DEC-005 closes.

**Closed when:** each requirement is baselined or withdrawn through controlled change,
and its RTM status is updated accordingly.

**Affected artefacts:** Functional Requirements v0.2 · Non-Functional Requirements v0.2 ·
RTM v0.2 · Open Items v0.2

---

## C-04 — Progress the three deferred decisions with dated evidence tasks

**Status:** Open
**Owner:** Ethan Lindsay
**Priority:** DEC-002 and DEC-003 by 22 September 2026; all three before the M2
architecture is fixed

Three decisions are deliberately deferred. Each states the evidence required, but none
carries a named evidence task with a target date, so there is currently no mechanism
ensuring they close before they block M2.

| Decision | Deferred | Blocks |
|---|---|---|
| DEC-002 | Technology stack selection | M2 architecture; availability verification under CON-008; the CON-013 week-3 demonstration |
| DEC-003 | Hosting and deployment platform | SCP-014, SCP-015; the CON-013 week-3 demonstration |
| DEC-005 | Personal-information retention period | NFR-4.2, SCP-020 |

DEC-005 carries the highest exposure in the risk register. Until it closes, the platform
has no rule governing how long identifiable request data is held, and the compliance
exposure under CON-007 accrues.

DEC-002 and DEC-003 acquired a hard working deadline that did not exist when they were
deferred: CON-013 requires demonstrable frontend, backend and API progress by 29
September, which is unreachable without a committed stack and deployment target. That
places both decisions at 22 September, thirteen days from this baseline.

**Closed when:** each deferment has a named owner and a target date for producing the
stated evidence, and that evidence exists before the M2 architecture is fixed.

**Affected artefacts:** Decision Log v0.2 · SCP-014 · SCP-015 · SCP-020 · NFR-4.2
**Tracked as:** RSK-002, RSK-007, RSK-008, RSK-015; named as outstanding asks under
FEC-004, FEC-005

---

## C-05 — Act on the capacity and schedule finding

**Status:** Open
**Owner:** Robert van der Merwe
**Priority:** First measurement at the CON-013 gate, 29 September 2026

Project Charter v0.3 §4.6 records that the baselined scope cannot be delivered within
the 5.57-week window at any productivity rate the team can currently evidence. Closing
the gap requires a 6.39× multiplier on the approximately 61% of remaining work judged
AI-accelerable, and the PERT analysis in §5.2 puts completion probability at exactly 50%
at that rate. The plan is also brittle: a six-point error in the accelerable share moves
the requirement to 15.95×, and at 49% no multiplier closes the gap because the fixed work
alone exceeds the window.

The charter carries this as an assumption with a measurement point rather than as a
guarantee, which is what keeps it consistent with CON-009 and CON-005.

**Closed when:** the velocity checkpoint is measured at the CON-013 week-3 gate on 29
September 2026, the scope-reduction order is agreed in advance of that gate, and the
measurement and resulting decision are recorded in the Decision Log — whichever way it
goes.

**Affected artefacts:** Project Charter v0.3 §4.6, §5.2 · CON-009 · CON-013 · Decision
Log · AI Usage Register
**Tracked as:** RSK-014, RSK-015; RK-03, RK-11, RK-12 in the charter register

---

## Condition summary

| ID | Condition | Owner | Must close by |
|---|---|---|---|
| C-01 | Confirm stakeholder conflict resolutions | E. Lindsay | CFL-002 before M2 data model |
| C-02 | Record a decision for the "overdue" target | R. van der Merwe | Before SCP-011 is specified |
| C-03 | Close the four unsettled requirements | R. van der Merwe | Before M2 sign-off |
| C-04 | Progress the three deferred decisions | E. Lindsay | DEC-002 and DEC-003 by 22 Sep 2026 |
| C-05 | Act on the capacity and schedule finding | R. van der Merwe | Velocity checkpoint, 29 Sep 2026 |

---

## Condition status at the Milestone 2 gate

The five conditions above were reviewed at this milestone as part of the baseline review
recorded in §1.7. Their status is recorded here rather than in the condition text, so
that the original condition as written at M1 is preserved unaltered.

| ID | Condition | Owner | Status at M2 | Evidence or reason |
|---|---|---|---|---|
| C-01 | Confirm the stakeholder conflict resolutions | E. Lindsay | **Carried forward** | CFL-001 to CFL-004 all remain *Proposed*. CFL-002 has not been confirmed with STK-006, so FR-1.5, FR-3.5, NFR-3.3 and NFR-4.4 continue to rest on an unconfirmed resolution. The architecture and design decisions recorded at this version proceed on the team's proposed resolution and would require revision if it is not agreed. Tracked as RSK-005 and RSK-009 |
| C-02 | Record a decision for the "overdue" service-level target | R. van der Merwe | **Carried forward** | No service-level target has been agreed with STK-005 and no decision log entry exists for it. SCP-011 remains specified imprecisely and its acceptance criterion cannot be evaluated by a third party. Tracked as RSK-003 |
| C-03 | Close the four unsettled requirements | R. van der Merwe | **Partially closed** | NFR-4.2 is closed: the closure of DEC-005 releases it from OI-05 and it now states the agreed one-month retention period. FR-4.2, FR-8.4 and FR-9.1 remain *Proposed* against OI-01 to OI-03 and are carried forward with their RTM status unchanged |
| C-04 | Progress the three deferred decisions with dated evidence tasks | E. Lindsay | **Closed, after the stated deadline** | All three decisions are now taken: DEC-002 (MERN), DEC-003 (Hostinger) and DEC-005 (one-month retention). DEC-002 and DEC-003 closed after the 22 September working deadline imposed by CON-013, so the exposure recorded as RSK-015 materialised rather than being avoided. The effect on the week-three gate is recorded against C-05 |
| C-05 | Act on the capacity and schedule finding | R. van der Merwe | **Carried forward** | No velocity measurement was taken at the 29 September gate, and the scope-reduction order the condition required to be agreed in advance was not recorded. No implementation evidence existed at the gate against which velocity could have been measured. The AI-assisted productivity assumption in Project Charter v0.3 §4.6 therefore remains unsubstantiated. Tracked as RSK-014 and RSK-015 |

A condition carried forward is not a failure of the baseline; it is a commitment that
could not be honestly closed on the evidence available, and it remains visible rather
than being allowed to lapse. A condition recorded as closed carries the evidence that
closed it.

---

## Review

These conditions are reviewed at the M2 milestone gate. A condition is closed by
recording the evidence that satisfies it and updating the affected artefacts; closure is
noted in the PED version history. A condition that cannot be closed is carried forward
explicitly with its reason, not allowed to lapse.

---
_____________________________________________________________________

**Team approval**

| Name | Role | Signature | Date |
|---|---|---|---|
| Ethan Lindsay | Team Lead | EJL | 9 September 2026 |
| Robert van der Merwe | Project Manager | RRVDM | 9 September 2026 |
| Christiaan Burger | Developer | CJB | 9 September 2026 |

**Baseline tag:** `v1.0-M1-baseline` on `main`.
