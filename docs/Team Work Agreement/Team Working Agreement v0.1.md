# Team Working Agreement

## CivicConnect — SEN381 Software Engineering 381

| | |
|---|---|
| **Project** | CivicConnect — Campus Service Request Management Platform |
| **Team** | Ethan Lindsay · Robert van der Merwe · Christiaan Burger |
| **Version** | 0.1 — drafted, pending team agreement |
| **Date drafted** | 9 September 2026 |
| **Date agreed** | 9 September 2026 |
| **Owner** | Ethan Lindsay |

> **Status.** This is a draft prepared by one member. It is not in force until all
> three members have reviewed and accepted it. Acceptance is recorded in §11.

---

## 1. Purpose

This agreement records how the team works, so that collaboration is a controlled
engineering practice rather than an assumption. It exists to make expectations explicit
before disagreements occur, and to give the risk register somewhere concrete to point:
RSK-012 and RSK-013 both name this agreement as their mitigation.

It is a controlled artefact. It lives in the repository and changes through the same
pull request and review process as any other.

---

## 2. Roles and responsibility

| Member | Role | Primary ownership |
|---|---|---|
| Ethan Lindsay | Team Lead | Problem and business need, stakeholder analysis, scope baseline, constraints, engineering decision log, PED assembly |
| Robert van der Merwe | Project Manager | Functional and non-functional requirements, acceptance criteria, requirements traceability matrix, project charter |
| Christiaan Burger | Developer | Risk register, forward engineering considerations, repository governance, AI usage register |

**Ownership means drafts it and can defend it first. It does not mean sole
responsibility.** Every member is expected to be able to locate any controlled
artefact, explain what it contains and why it exists, trace a requirement from source
to acceptance criteria, and explain an engineering decision and its consequences —
regardless of who drafted it.

Roles may be reassigned by agreement. Reassignment is recorded in the version history
of this document.

---

## 3. Communication

| | |
|---|---|
| **Primary channel** | Discord — day-to-day coordination and synchronous working sessions |
| **Controlled record** | The repository. Anything that changes a commitment goes in an artefact, an issue or a pull request, not only in chat |
| **Client instruction** | Captured under DEC-009: recorded in dated team notes, committed within one working day, confirmed with the client at the next session before being treated as binding |

**Expected response time.** A direct request to a named member is acknowledged within
24 hours on a working day, even if the answer is "I can look at this tomorrow."

**The rule behind this section.** A decision reached in a call does not exist until it
is written down. If a conversation changes scope, a requirement, a risk or a decision,
the member who raised it updates the artefact or opens an issue the same day.

---

## 4. Meetings

| | |
|---|---|
| **Weekly sync** | Once per week, all three members, approximately 30 minutes |
| **Purpose** | Progress against milestone obligations, blockers, review of open items and risks |
| **Chair** | Rotates |
| **Record** | Decisions and actions recorded in the repository. Nothing binding stays only in the call |
| **Client sessions** | Attended by at least one member; instructions captured under DEC-009 |

Ad-hoc working sessions are encouraged and need no record beyond whatever artefact
changes result.

---

## 5. Repository and review

The branching model, protection rules and approval requirements are recorded as DEC-008
and described in PED §11.1. This section adds only the expectations this team places on
itself beyond the mandatory controls.

**Review turnaround.** A pull request receives both reviews within 24 hours on a
working day. With three members and two required approvals, both teammates gate every
merge — an unreviewed pull request blocks the author entirely.

**Review quality.** An approval means the reviewer read the change. A review comment is
expected where the change is substantive; an approval with no engagement is not a
review. A reviewer may reasonably comment on:

- alignment with requirements and acceptance criteria
- correctness and consistency with existing artefacts
- maintainability and technical debt
- security and privacy implications
- traceability impact — does an ID change break a reference elsewhere?
- whether the change belongs in the controlled baseline at all

**Reviews happen in the pull request.** Discussing a change in a call is fine; the
written record of what was checked belongs in the pull request, because a call is not
inspectable evidence.

**Commit discipline.** Work is committed as it is produced, not batched. Repository
history is assessed evidence of controlled process, and a history concentrated
immediately before a milestone does not demonstrate one.

**Secrets.** No password, API key, token or connection secret is committed at any
point.

---

## 6. Definition of done — controlled artefact

A change to a controlled artefact is done when:

1. The artefact is updated and internally consistent.
2. Every identifier it references resolves to a real entry in another artefact.
3. The RTM is updated where the change affects a requirement, its source or its
   acceptance criteria.
4. Any decision taken in the course of the work is recorded in the decision log.
5. Material AI assistance is recorded in the AI Usage Register by the member who used
   it.
6. The change is committed on a branch, raised as a pull request, and approved by both
   other members.
7. The PED version history records the change where the change affects the baseline.

Item 3 is the mitigation named in RSK-012. Traceability decays when merged changes do
not update the matrix, so the update is part of done rather than a later tidy-up.

---

## 7. Decisions and disagreement

**Ordinary decisions** are made by the member who owns the artefact, recorded in the
decision log where they are significant, and open to challenge in review.

**Where members disagree**, the disagreement is resolved on evidence: which requirement,
constraint, stakeholder need or risk supports each position. Where the evidence does not
settle it, the decision goes to the whole team at the weekly sync.

**Where the team cannot agree**, the decision is deferred and recorded as a deferment
with the evidence required to close it, rather than settled by seniority or by whoever
is most insistent. A deferment with a stated evidence requirement is a legitimate
engineering outcome; an unrecorded stalemate is not.

**Disagreement is expected and welcome.** A reviewer who never objects is not reviewing.

---

## 8. Individual accountability

Each member is responsible for:

- meaningful commits attributable to them
- ownership of their assigned issues
- pull requests they authored and pull requests they meaningfully reviewed
- their own entries in the AI Usage Register — **no member writes another member's
  entries**
- being able to present and defend any team artefact under questioning

**If a member falls behind**, the expectation is that they say so at the weekly sync or
earlier. The team reallocates or reduces scope through a recorded decision. Silence
followed by a missed deliverable is the failure mode this clause exists to prevent.

**If a member becomes unavailable** through illness or other accepted circumstance, the
remaining members redistribute the work and record the reallocation. The absent member
remains individually responsible for their presentation and defence obligations, which
are arranged directly with the lecturer.

---

## 9. AI use

AI may be used as an engineering assistant for analysis, research, drafting, coding,
testing and documentation.

- Material AI contributions are recorded in the AI Usage Register by the member who
  made them.
- The register entry must state what was verified, changed or rejected — not only that
  AI was used.
- AI-assisted work is subject to the same branch, review and approval controls as any
  other change.
- Every member must be able to explain, defend and modify any AI-assisted artefact they
  submit.
- No credentials, confidential material or personal information is exposed to external
  AI systems.
- "AI generated it" is never an acceptable answer for work the team has submitted.

---

## 10. Amending this agreement

This agreement is amended by pull request with two approvals, like any other controlled
artefact. Amendments are recorded in the version history below. If a clause is not being
followed, the correct response is to change the clause or change the practice — not to
leave a written agreement that describes something the team does not do.

---

## 11. Acceptance

| Member | Accepted | Date |
|---|---|---|
| Ethan Lindsay |✓|09/09/2026|
| Robert van der Merwe |✓|09/09/2026|
| Christiaan Burger |✓|09/09/2026|

This agreement takes effect when all three members have accepted it.

---

## Version history

| Version | Date | Author | Change | Reviewed by |
|---|---|---|---|---|
| 0.1 | 09/09/2026 | E. Lindsay | Initial draft prepared for team review | R. Van der Merwe , C. Burger |
