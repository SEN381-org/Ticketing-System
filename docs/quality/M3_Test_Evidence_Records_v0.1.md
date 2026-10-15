# CivicConnect — M3 Test Evidence Records: unit/component and black-box functional

| | |
|---|---|
| **Artefact** | Test evidence records (M3 brief §11) for the five unit/component cases of Assessment Area C and the five black-box functional cases of Assessment Area D |
| **Version** | 0.1 |
| **Author** | Ethan Lindsay (Member A) |
| **Date** | 15 October 2026 |
| **Status** | Executed locally on `dev` at `28674dd`, 15 October 2026. Every record has been seen to fail with its protected behaviour broken (§6: NV-91 to NV-100, and earlier NVs reused). The CI run on `v3.0-M3-rc` is cited once the tag exists |
| **Run output** | `docs/evidence/M3-test-records/run_2026-10-15_local.txt`; negative verifications `docs/evidence/M3-test-records/NV-91_…` to `NV-100_…` |
| **Traces to** | FR-1.3, FR-1.5, FR-3.6, FR-4.1, FR-6.1, FR-6.2, FR-6.3, FR-6.5, FR-6.6, FR-6.7; DEC-012, DEC-016, DB-01; OI-15, OI-17, TD-005 |

---

## 1. Rules applied

| # | Rule | Reason |
|---|---|---|
| S1 | Every record uses a test that **already exists** in `tests/`. Where no existing test covers a case or a decision-table cell, the record says **not covered**. No test was written for this document | Between `v3.0-M3-rc` and `v3.0-M3-baseline` only `docs/` and `perf/` may change, so a test added after -rc would not be in the build deployed to staging |
| S2 | The expected result is taken from the project record (Functional Requirements v0.2, Acceptance Criteria v0.3, the Decision Log, the ADRs, the data baseline), quoted exactly, and never from the code | M3 brief §11 |
| S3 | **State transition** (BB-1 to BB-3) is applied only to behaviour that a requirement fixes directly: FR-6.1, FR-6.2's "reject any other transition", FR-6.5, FR-6.6 | See S4 |
| S4 | **The rest of the transition table is not verified here.** Which edges exist, and which roles hold them, is a team design proposal recorded as OI-15, not a baselined requirement. FR-6.2 itself says "The transition model itself is an M2 design artefact." A test whose expected result depends on that table shows only that the code enforces its own table | An expected result derived from the code it tests is circular |
| S5 | **Decision table** (BB-4, BB-5) is applied to the authorisation rules, where several conditions together decide one outcome | M3 brief §10, selection rule |
| S6 | **Equivalence partitioning and boundary value analysis are not used.** The inputs these rules take are enumerations (seven statuses, six roles, a security-category flag) and free text with no stated length or range. An enumeration has no boundary, and its partitions are its values, which the decision table already enumerates | M3 brief §10: "Use techniques because the behaviour requires them" |
| S7 | Record labels UT-1 to UT-5 and BB-1 to BB-5 are local to this document. They are not a project identifier scheme, and are chosen not to collide with existing labels (U1–U18 in `indexProvisioning.test.js`, E2E-1/E2E-2, NV-, review comments B-1/N-1/R-01, M3_API_Test_Specification case numbers) | — |
| S8 | A record counts as evidence only once its assertion has been seen to fail with the protected behaviour broken (§6) | Project verification standard |

**Execution environment.** The local run used Node v24.16.0. The project's minimum and deployed
version is Node 22, which is what CI runs. The -rc CI run is the evidence on the
version that ships. The local run is evidence that the tests pass at `28674dd`.

---

## 2. Summary

| Record | Level / technique | Basis | Test (file — name) | Status | Seen to fail |
|---|---|---|---|---|---|
| UT-1 | Unit/component | FR-6.3, DEC-016 | `statusTransitionService.test.js` — both writes happen inside the unit of work, with its session — DEC-016, FR-6.3 | Pass | NV-91 |
| UT-2 | Unit/component | FR-1.3, DEC-012 | `authorisationGuard.test.js` — the guard refuses before the handler runs — DEC-012 path A | Pass | NV-92 |
| UT-3 | Unit/component | FR-6.7, DB-01 layer 2 | `models.test.js` — requestHistory refuses {6 operations} — FR-6.7, DB-01 layer 2 | Pass (6 of 6) | NV-93 (`bulkWrite` case) |
| UT-4 | Unit/component | FR-1.5 | `requestRead.test.js` — service: non-Security-Officer staff on a security request get AuthorisationError — FR-1.5 | Pass | NV-32 |
| UT-5 | Unit/component | FR-6.2 | `statusTransitionService.test.js` — an illegal transition is refused and nothing is written — FR-6.2 | Pass | NV-94 |
| BB-1 | Black-box, state transition | FR-6.5 | `requestStatus.test.js` — Resolved requires resolution information — FR-6.5 | Pass | NV-95 |
| BB-2 | Black-box, state transition | FR-6.6 | `requestStatus.test.js` — Closed and Rejected require a recorded reason — FR-6.6 | Pass, **partial** | NV-96; NV-97 NOT CAUGHT (the gap) |
| BB-3 | Black-box, state transition, negative | FR-6.1, FR-6.2 | `requestStatus.test.js` — an unknown status is refused rather than permitted by default | Pass, **partial** | NV-98 |
| BB-4 | Black-box, decision table | FR-6.6, FR-1.5, B-1 (depends on OI-15) | five tests, §4.4 | Pass, column 8 not covered | NV-23, NV-99, NV-100; columns 1, 5, 7 see §4.4 |
| BB-5 | Black-box, decision table | FR-1.5, FR-3.6, FR-4.1 | eight tests, §4.5 | Pass, 1 cell not covered | NV-24, NV-32, NV-49 |

Against the brief §9/§10 minimums, these ten records give 5 unit/component and 5 black-box
functional cases, two techniques (state transition and decision table) and seven negative
cases (UT-2, UT-3, UT-4, UT-5, BB-3, and the refusal cells of BB-4 and BB-5). All ten trace to
requirements whose priority is High.

---

## 3. Unit/component records

### UT-1 — the status change and its history entry are written in one unit of work

| Field | Entry |
|---|---|
| **Test basis** | FR-6.3: "The system will record the acting user, previous status, new status, date and time for every status transition." AC-FR-6.3: Given "a completed status transition", When "the request history is retrieved", Then "the entry records the acting user, the previous status, the new status, the date and the time". DEC-016 v0.1, Decision 1: "The transaction encloses the aggregate: the `requests` update (…) and the `requestHistory` insert" |
| **Why selected** | A status change committed without its history entry is a transition FR-6.3 never recorded, with nothing in the record to show it was lost. An earlier test here asserted only the order of the two writes and still passed with the history write moved outside the transaction (project verification standard). This test is the one that replaced it |
| **Technique / level** | Unit/component: `statusTransitionService` with an injected unit of work that records, for each write, which session it used and whether it ran inside `run()` |
| **Input / precondition** | A request in Assigned at version 3, in category `cat-1`; a Technician authorised for `cat-1`; move to In Progress with `expectedVersion: 3` |
| **Expected result** | From DEC-016 Decision 1: both writes (request, then history) run inside the unit of work's callback, with the session it provides, and the unit of work completes |
| **Actual result** | `writes` equals `[{request, session-1, insideRun: true}, {history, session-1, insideRun: true}]`; the unit of work completed |
| **Status** | Pass |
| **Evidence** | Run output (§ header), line "✔ both writes happen inside the unit of work, with its session — DEC-016, FR-6.3" |
| **Traceability** | FR-6.3, AC-FR-6.3, DEC-016, DEC-011 (the history append is a direct write, not a subscriber) |
| **Interpretation** | Shows that the service puts both writes inside one unit of work with one session. It does **not** show that the database rolls them back together: the unit of work here is a fake. Rollback is a database guarantee, verified against the test cluster by Case 3 of `M3_API_Test_Specification.md` (AC-NFR-1.10 v0.3, proposed). The history entry's *content* (AC-FR-6.3's five fields) is checked by a separate test, not this one |

### UT-2 — the route guard refuses an unauthorised role before the handler runs

| Field | Entry |
|---|---|
| **Test basis** | FR-1.3: "The system will evaluate the acting user's role before executing any request view, action or status transition, and will reject the operation where the role is not authorised." DEC-012: "composed Express middleware at the route boundary for function-level access" |
| **Why selected** | If the role check ran after the handler, or only in the client, an unauthorised user would reach the service. FR-1.3 says "before executing" |
| **Technique / level** | Unit/component: `requireOperation('request:transition')` run as middleware with a stub `next` |
| **Input / precondition** | An authenticated actor holding only Requester; operation `request:transition` |
| **Expected result** | The handler is not reached; the error is an `AuthorisationError` with status 403 (DEC-012 function-level access; DEC-015 §4 for 403) |
| **Actual result** | `passed` false; `AuthorisationError`, status 403 |
| **Status** | Pass |
| **Evidence** | Run output, line "✔ the guard refuses before the handler runs — DEC-012 path A" |
| **Traceability** | FR-1.3, AC-FR-1.3 (partial), DEC-012 point 1, NFR-3.3 |
| **Interpretation** | Shows the guard stops a role that is not in `OPERATION_RULES['request:transition']`. Which roles are in that list is a team decision, not a requirement (S4), so this test does not show that the list is right. AC-FR-1.3 also requires "records the rejected attempt"; that is **not built** and is recorded as TD-005. AC-FR-1.3's own example (a Technician invoking an operation reserved to the Coordinator) is not the input used here |

### UT-3 — `requestHistory` refuses every update and delete path

| Field | Entry |
|---|---|
| **Test basis** | FR-6.7: "The system will prevent any user, including an Administrator, from altering or deleting a recorded status transition, assignment or comment entry." AC-FR-6.7: Given "an existing status transition, assignment or comment entry", When "any user, including an Administrator, attempts to alter or delete it through any interface the system provides", Then "no such operation is available and the entry is unchanged". DB-01 (Data and Persistence Baseline v0.3 §4): append-only enforced in three layers, layer 2 being Mongoose middleware including `bulkWrite` |
| **Why selected** | An editable history is not audit evidence (FR-6.7 note). `bulkWrite` bypasses document and query hooks unless it has its own middleware, which is the gap most likely to be missed |
| **Technique / level** | Unit/component: the `RequestHistory` model with no database connection (`bufferCommands` off, so an unhooked operation fails fast instead of passing) |
| **Input / precondition** | Six operations, one test each: `updateOne`, `findByIdAndUpdate`, `findByIdAndDelete`, `deleteMany`, document `deleteOne`, `bulkWrite` with an `updateOne` |
| **Expected result** | Each is refused with `AppendOnlyViolation` before any driver call |
| **Actual result** | 6 of 6 rejected with `AppendOnlyViolation` |
| **Status** | Pass |
| **Evidence** | Run output, six lines "✔ requestHistory refuses … — FR-6.7, DB-01 layer 2" |
| **Traceability** | FR-6.7, AC-FR-6.7, DB-01 layer 2 |
| **Interpretation** | Shows layer 2 refuses these six paths. It does **not** show layer 3 (the Atlas role), which is `docs/evidence/DB-01_layer3_verification.txt`, and it does not cover operations not listed (for example `replaceOne`, `findOneAndReplace`). It is not evidence that no interface offers an edit, which is what AC-FR-6.7 asks |

### UT-4 — staff without the Security Officer role cannot read a security-category request

| Field | Entry |
|---|---|
| **Test basis** | FR-1.5: "The system will restrict the description, comment history and action history of a request in a security category to users holding the Security Officer role." AC-FR-1.5: Given "a request assigned to a security category", When "a user without the Security Officer role opens that request", Then "the description, comment history and action history are absent from both the rendered page and the underlying response" |
| **Why selected** | FR-1.5 is the restricted half of the CFL-002 resolution and protects the most sensitive data in the system (CON-007) |
| **Technique / level** | Unit/component: `requestQueryService.getRequest` with a stub repository |
| **Input / precondition** | A request with `securityCategory: true` in category `cat1`; a Manager authorised for `cat1`, without Security Officer |
| **Expected result** | The read is refused (`AuthorisationError`) |
| **Actual result** | `AuthorisationError` |
| **Status** | Pass |
| **Evidence** | Run output, line "✔ service: non-Security-Officer staff on a security request get AuthorisationError — FR-1.5"; negative verification NV-32 (`docs/evidence/M3-read-endpoint/`) |
| **Traceability** | FR-1.5, AC-FR-1.5, DEC-012 point 2, CFL-002, OI-17 |
| **Interpretation** | Shows a category-authorised Manager gets none of the request. That is **wider** than FR-1.5, which restricts three fields, not the whole request. The difference is recorded as OI-17. It does not show field-level filtering (DEC-012 point 3, not built: CFL-002 / OI-16) |

### UT-5 — a transition outside the model is refused and nothing is written

| Field | Entry |
|---|---|
| **Test basis** | FR-6.2: "The system will permit only the status transitions defined in the controlled transition model and will reject any other transition." AC-FR-6.2: Given "a request in status Received", When "a transition not permitted from Received by the controlled transition model is attempted", Then "the system refuses it and the status is unchanged" |
| **Why selected** | A refused transition that still wrote the request, or its history, would leave the status changed after the caller was told no. AC-FR-6.2's "the status is unchanged" is the part a domain-only test cannot show |
| **Technique / level** | Unit/component: `statusTransitionService` with injected repositories that record every write |
| **Input / precondition** | A request in Closed; a Technician; move to In Progress |
| **Expected result** | `TransitionError`; no write of any kind |
| **Actual result** | `TransitionError`; `calls` is `[]` |
| **Status** | Pass |
| **Evidence** | Run output, line "✔ an illegal transition is refused and nothing is written — FR-6.2" |
| **Traceability** | FR-6.2, AC-FR-6.2 (partial) |
| **Interpretation** | Shows a transition the model doesn't contain is refused before any write. Two limits. First, that Closed → In Progress is outside the model is itself the model's content (OI-15, S4); no baselined requirement says Closed is terminal. Second, AC-FR-6.2 starts from Received, and this test starts from Closed. The domain test "a move that skips a status is refused — FR-6.2" uses Received → Resolved but checks only the verdict, not that nothing was written |

---

## 4. Black-box functional records

### 4.0 The state model these records use

Only cells a requirement fixes are shown (S3). "Any" means the outcome does not depend on the model's edges.

| From | Event | Condition | Expected | Basis | Record |
|---|---|---|---|---|---|
| Any status from which Resolved is reachable | move to Resolved | no resolution information | refused, "resolution information is required" | FR-6.5, AC-FR-6.5 | BB-1 |
| same | move to Resolved | resolution recorded | not refused on this ground | FR-6.5 | BB-1 |
| Any status from which Closed / Rejected is reachable | move to Closed or Rejected | no reason | refused | FR-6.6, AC-FR-6.6 | BB-2 |
| same | same | reason recorded, authorised staff user | permitted, reason stored | FR-6.6, AC-FR-6.6 | BB-2 |
| A value outside the FR-6.1 set | any move | — | refused | FR-6.1, FR-6.2 | BB-3 |
| Any | move to a value outside the FR-6.1 set | — | refused | FR-6.1, FR-6.2 | BB-3 (not covered) |

### BB-1 — Resolved requires resolution information (state transition)

| Field | Entry |
|---|---|
| **Test basis** | FR-6.5: "The system will require resolution information to be recorded before a request may be moved to Resolved." AC-FR-6.5: Given "a request with no resolution information recorded", When "a staff user attempts to move it to Resolved", Then "the system refuses and states that resolution information is required" |
| **Why selected** | Resolved without resolution information means a requester is told their request is done with nothing to say what was done (SCP-009, SCP-010) |
| **Technique / level** | Black-box, state transition: the guard on the event "move to Resolved", both values of its condition |
| **Input / precondition** | In Progress; Technician; (a) no resolution, (b) `hasResolution: true` |
| **Expected result** | (a) refused, with a reason stating resolution information is required; (b) permitted |
| **Actual result** | (a) refused, reason matches `/Resolution information/`; (b) permitted |
| **Status** | Pass |
| **Evidence** | Run output, line "✔ Resolved requires resolution information — FR-6.5"; also "✔ a move to Resolved records the resolution summary, when and by whom — FR-6.5" (service level) |
| **Traceability** | FR-6.5, AC-FR-6.5 |
| **Interpretation** | Shows the condition is enforced on the only edge into Resolved. (b)'s "permitted" relies on In Progress → Resolved being in the model and on Technician holding it (OI-15). Whether a reopened-then-resolved request satisfies FR-6.5 is part of OI-15 and not tested. "States that resolution information is required" is checked on the domain reason string, not on what a user sees |

### BB-2 — Closed and Rejected require a recorded reason (state transition)

| Field | Entry |
|---|---|
| **Test basis** | FR-6.6: "The system will allow an authorised staff user to close or reject a request with a recorded reason." AC-FR-6.6: Given "a request being closed or rejected", When "the transition is submitted without a reason, and then resubmitted with one", Then "the first attempt is refused and the second stores the reason and displays it in the history" |
| **Why selected** | The reason is what FR-3.4 feeds back to the requester on rejection (FR-6.6 note). A rejection with no reason gives the requester nothing |
| **Technique / level** | Black-box, state transition: the guard on the events "close" and "reject" |
| **Input / precondition** | (a) Resolved → Closed, Manager, no reason; (b) the same with a reason; (c) Received → Rejected, Coordinator, with a reason |
| **Expected result** | (a) refused; (b) permitted; (c) permitted |
| **Actual result** | (a) refused; (b) permitted; (c) permitted |
| **Status** | Pass, **partial** |
| **Evidence** | Run output, line "✔ Closed and Rejected require a recorded reason — FR-6.6"; storing the reason: "✔ closing records the reason and the closure clock — FR-6.6, NFR-4.2" |
| **Traceability** | FR-6.6, AC-FR-6.6 (partial) |
| **Interpretation** | Shows a close without a reason is refused and a close with one is stored. **Not covered:** a *reject* without a reason. The test asserts only that a reject *with* a reason is permitted, so it still passes with the reason check removed for Rejected alone: NV-97, NOT CAUGHT. The test is not strengthened here because tests are frozen at `v3.0-M3-rc`. "Displays it in the history" is a UI outcome and is not shown here (E2E-1 covers a reject in the browser) |

### BB-3 — a status outside FR-6.1 is refused (state transition, negative)

| Field | Entry |
|---|---|
| **Test basis** | FR-6.1: "The system will maintain a controlled set of request statuses: Received, Assigned, In Progress, On Hold, Resolved, Closed and Rejected." FR-6.2: "…will reject any other transition." AC-FR-6.1: Given "the deployed system", When "the available status values are listed", Then "they are exactly Received, Assigned, In Progress, On Hold, Resolved, Closed and Rejected" |
| **Why selected** | A value outside the set cannot be in any controlled model, so its refusal follows from the record whatever OI-15 decides. A transition table that permits by default would accept it. The input `Submitted` is chosen deliberately: it is one of the invented statuses an earlier version of this codebase used (Data and Persistence Baseline v0.3, status values row) |
| **Technique / level** | Black-box, state transition: an invalid state |
| **Input / precondition** | From `Submitted` to Closed; Manager; with a reason |
| **Expected result** | Refused, as an unknown status |
| **Actual result** | Refused; reason matches `/Unknown status/` |
| **Status** | Pass, **partial** |
| **Evidence** | Run output, line "✔ an unknown status is refused rather than permitted by default"; at persistence level, "✔ a status outside FR-6.1 is rejected by the model" |
| **Traceability** | FR-6.1, FR-6.2, AC-FR-6.1 |
| **Interpretation** | Shows an unknown *from* status is refused. **Not covered:** a move *to* a value outside the set from a valid status. The code would refuse it (no matching edge), but no test asserts it. That AC-FR-6.1's list is exactly the seven values is shown by "the status set is exactly the seven values FR-6.1 baselines", not by this record |

### BB-4 — who may close or reject (decision table)

**Depends on OI-15.** The role conditions here are the team's proposal, not a baselined
requirement. The Security Officer's disposition right on a security-category request (review
comment B-1) is included because without it FR-6.6 could not be met on such a request at all:
FR-1.5 restricts the request to the Security Officer, so no other role could close or reject
it. It would then never reach closure, and PROC-001 would never anonymise it (CON-007).

| Field | Entry |
|---|---|
| **Test basis** | FR-6.6 (quoted in BB-2); FR-1.5 (quoted in UT-4); B-1 as above; OI-15 |
| **Why selected** | Three conditions decide one outcome, and one of them (security category) reverses the result for two roles. That is where a single-condition test misses a rule |
| **Technique / level** | Black-box, decision table. Conditions: role held; security category. Held constant: a reason is recorded; the actor is authorised for the category; event Resolved → Closed |
| **Input / precondition** | One column per row below |

| # | Role held | Security category | Expected | Basis | Test | Seen to fail |
|---|---|---|---|---|---|---|
| 1 | Coordinator or Manager | no | permitted | FR-6.6, OI-15 | requestStatus: Closed and Rejected require a recorded reason (Manager) | Not broken |
| 2 | Coordinator or Manager | yes | refused | FR-1.5 | statusTransitionService: a Coordinator cannot close a security-category request — B-1, FR-1.5; Manager: authorisationGuard TD-002 (act) | NV-23 |
| 3 | Security Officer only | no | refused | B-1, OI-15 | requestStatus: a Security Officer is not a general disposition role — B-1 | NV-100 |
| 4 | Security Officer only | yes | permitted | B-1, FR-6.6 | requestStatus: a Security Officer may close a resolved security-category request; statusTransitionService: a Security Officer can close a resolved security-category request | NV-99 (all three tests) |
| 5 | Technician only | no | refused | OI-15 | requestStatus: a Technician may not close a request — FR-6.4 | NV-81 (E2E run only) |
| 6 | Technician only | yes | refused | FR-1.5 | authorisationGuard TD-002 (act) | NV-23 |
| 7 | Requester or Administrator only | no | refused | FR-6.6 ("staff user"); OI-15 for Administrator | requestStatus: a Requester may not move a request at all; an Administrator holds no lifecycle authority | Not broken |
| 8 | Requester or Administrator only | yes | refused | FR-1.5 | **not covered** | — |

| Field | Entry |
|---|---|
| **Expected result** | As the table |
| **Actual result** | Columns 1–7 as expected; column 8 has no test |
| **Status** | Pass, column 8 not covered |
| **Evidence** | Run output, the lines named in the table |
| **Traceability** | FR-6.6, FR-1.5, FR-6.4, OI-15, CFL-002 |
| **Interpretation** | Shows the role × category rule for closing is applied as the team proposed it. It does not show the proposal is right (OI-15). Column 8 would be refused by the code (`mayActOnRequest` refuses any non-staff actor), but nothing asserts it. Columns 1, 3, 5, 7 test the domain rule only; columns 2, 4 (second test), 6 test the service. Reject and the other close edges are not tabulated. The test name in column 5 cites FR-6.4, which requires role restriction but names no roles; and the test name in column 7 cites FR-6.7 for the Administrator rule, which FR-6.7 does not state (§5) |

### BB-5 — who may read a request (decision table)

| Field | Entry |
|---|---|
| **Test basis** | FR-1.5 (quoted in UT-4). FR-3.6: "The system will prevent a requester from viewing any request submitted by another user." AC-FR-3.6: Given "a requester authenticated as user X and a request submitted by user Y", When "user X requests the detail of user Y's request using its reference", Then "the system refuses the request and returns no data from it". FR-4.1: "The system will present to each staff user the set of requests their role and category authorisation permit them to view." |
| **Why selected** | Read access is decided by four conditions together, and a wrong cell exposes another person's request (CON-007) |
| **Technique / level** | Black-box, decision table, at the read service and over HTTP (`GET /api/v1/requests/:id`). Conditions: actor type; security category; category authorised (staff) or own request (requester) |
| **Input / precondition** | One column per row below |

| # | Actor | Security category | Category authorised / own | Expected | Basis | Test | Seen to fail |
|---|---|---|---|---|---|---|---|
| 1 | Staff, not Security Officer | no | authorised | 200 | FR-4.1 | a Coordinator authorised for the category gets 200 | Not broken (§6) |
| 2 | Staff, not Security Officer | no | not authorised | refused, no data | FR-4.1 | service: staff not authorised for the category get AuthorisationError; staff not authorised for the category get 403 with no request data | NV-32 |
| 3 | Staff, not Security Officer | yes | authorised | refused, no data | FR-1.5 | a security request viewed by non-Security-Officer staff is 403; TD-002 (view) | NV-32, NV-24 |
| 4 | Security Officer | yes | authorised | permitted | FR-1.5 | TD-002 (view), last assertion | NV-24 does not break this cell |
| 5 | Security Officer | yes | not authorised | refused | FR-4.1 | **not covered** | — |
| 6 | Requester | no | own | 200 | FR-3.6 | a requester viewing their own non-security request gets 200 | NV-44 |
| 7 | Requester | any | another user's | refused, indistinguishable from a missing id | FR-3.6, AC-FR-3.6, DEC-015 §4 | service: a requester asking for another requester's request gets NotFoundError; another user's request is indistinguishable from a missing id | NV-32 |
| 8 | Administrator only | any | — | refused, 403, no data | Project-lead decision; FR-1.3. Not a requirement | an Administrator-only actor viewing an existing request is 403 with no request data | Not broken (§6) |
| 9 | Requester who also holds a staff role, refused | no | not authorised | 403, not 404 | Project-lead decision (staff first). Not a requirement | a Requester who also holds a staff role, refused, is 403 with no request data | NV-49 (NV-41 was NOT CAUGHT before the test was fixed) |

| Field | Entry |
|---|---|
| **Expected result** | As the table |
| **Actual result** | Columns 1–4 and 6–9 as expected; column 5 has no test |
| **Status** | Pass, column 5 not covered |
| **Evidence** | Run output, the lines named in the table; `docs/evidence/M3-read-endpoint/` and `docs/evidence/M3-P0/` for the NVs |
| **Traceability** | FR-1.5, FR-3.6, AC-FR-3.6, FR-4.1, DEC-012 point 2, DEC-015 §4, CFL-002 |
| **Interpretation** | Shows the read decision for the conditions FR-1.5, FR-3.6 and FR-4.1 fix. Columns 8 and 9 are tested against team decisions, not requirements, and are labelled so. Column 3 refuses the whole request, which is wider than FR-1.5 (OI-17). Column 5 would be refused by the code but no test asserts it. FR-3.5 (the mapped status a requester sees) is a field-level rule and is not in this table |

---

## 5. Findings while writing these records

These are recorded, not fixed. The test files cannot change after -rc (S1).

1. **A test title cites FR-6.7 for something FR-6.7 doesn't say.** `requestStatus.test.js`, "an Administrator holds no lifecycle authority — FR-6.7 names them explicitly". FR-6.7 forbids altering or deleting history entries. The Administrator's lack of transition rights is a team judgement drawn from it (the `requestStatus.js` header says so) and is part of OI-15.
2. **A test title cites AC-FR-6.7 for the content of a history entry.** `statusTransitionService.test.js`, "the entry records the acting user, both statuses and the version it produced — AC-FR-6.7". The acceptance criterion for that is AC-FR-6.3.
3. **The RTM's verification cells should be checked for the same two citations** when RTM v0.10 is written.

---

## 6. Negative verification

Reused where an existing NV record already broke the behaviour and showed the named test failing:
NV-23, NV-24, NV-32, NV-44, NV-49. NV-78 and NV-81 broke the same rules but recorded the E2E
run only, so they do not show the unit tests failing.

New, run on 15/10/2026 against the full unit suite (NV numbers allocated by E. Lindsay after a check
of every remote branch, the text in every committed Office file on them, every PR and issue; control
NV-90 found, NV-999 not found). Each file states its expected result, written before the
sabotaged run. Each sabotaged file was restored by writing back its original content (SHA-256
before and after match), and the full suite then passed: 194 tests, 186 pass, 0 fail, 8 skipped.

| NV | Record | Break | Expected (before the run) | Outcome | Also failed |
|---|---|---|---|---|---|
| NV-91 | UT-1 | History append moved outside `unitOfWork.run()` | UT-1 and "nothing commits when the history write fails" fail | CAUGHT | — |
| NV-92 | UT-2 | `requireOperation` calls `next()` before the role check | UT-2 fails | CAUGHT | 1 (the HTTP 403 test, FR-1.3) |
| NV-93 | UT-3 | `bulkWrite` middleware removed from `RequestHistory` | The `bulkWrite (update)` case fails, the other five pass | CAUGHT, other five passed | — |
| NV-94 | UT-5 | Request written before the transition check | UT-5 fails | CAUGHT | 7 (tests that count writes) |
| NV-95 | BB-1 | FR-6.5 clause removed from `checkTransition` | BB-1 fails | CAUGHT | — |
| NV-96 | BB-2 | FR-6.6 clause removed (NV-78's break, against the unit suite) | BB-2 fails | CAUGHT | — |
| NV-97 | BB-2 | FR-6.6 clause applied to Closed only, not Rejected | **Not caught** | **NOT CAUGHT**, as expected: "Closed and Rejected require a recorded reason — FR-6.6" passed and no test failed | — |
| NV-98 | BB-3 | `checkTransition` permits an unknown from-status | BB-3 fails | CAUGHT | — |
| NV-99 | BB-4 col. 4 | `dispositionRolesFor` ignores `securityCategory` | The three column-4 tests fail | CAUGHT | — |
| NV-100 | BB-4 col. 3 | `dispositionRolesFor` adds the Security Officer on every request | "a Security Officer is not a general disposition role" fails | CAUGHT | — |

**NV-97 is a recorded gap, not a pass.** No unit test asserts that a reject without a reason is
refused. E2E-1 rejects with a reason. The test is not strengthened, because tests are frozen at
`v3.0-M3-rc`.

Not broken: the positive cells BB-4 columns 1 and 7 and BB-5 columns 1 and 8. A deny-all break
would fail them, but it would fail most of the suite too, so it would say little about these
cells in particular.
