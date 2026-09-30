# M2 backend corrections — application slice (PRs #57, #58, #60)

| | |
|---|---|
| **For** | Ethan Lindsay (author of the slice) |
| **From** | Robert van der Merwe (reviewer; data, persistence, technology and interface owner) |
| **Date** | 29/09/2026 |
| **Code reviewed** | `origin/dev` @ `7cfa94b` (merges of #57, #58, #60, each approved by both reviewers) |
| **Authoritative references** | `docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md`, `docs/decisions/ADR/DEC-014_API_Semantics_v0.1.md`, `docs/decisions/ADR/DEC-015_Transaction_Boundary_v0.1.md`, `docs/decisions/ADR/DEC-016_Retention_Purposes_v0.1.md`, PED v1.6 §6A |

This is the post-merge review record for the slice, in the Master Brief §9.1 form (comment →
response → correction → re-review). Each item has a stable ID (R-01 to R-22). **Please
reference the IDs in your follow-up PR** (suggested branch `fix/slice-review-corrections`),
and reply per item: *fixed in <commit>*, *disagree because …*, or *raised as CR-…*.

## Status at the time of writing

| ID | Severity | Topic | Status |
|---|---|---|---|
| R-01 | BLOCKER | Router and guard committed under `tests/` | **Fixed on `task/M2-PersonB`**: moved to `src/routes/` and `src/middleware/`; `npm test` 23/23 pass |
| R-02 | MAJOR | No CI check to stop a red merge | Open (Christiaan's CI work) |
| R-03 | MAJOR | `PATCH /:id/status` vs DEC-014 | Open: Ethan |
| R-04 | BLOCKER-traceability | Roles ≠ FR-1.2 | **Partly fixed (models)**: `ROLE` in `src/models/_shared.js`, `User`/`Role` models use FR-1.2. Remaining for Ethan: `authorise.js`, `requestStatus.js`, `statusTransitionService.js`, tests |
| R-05 | MINOR | Error body / default Express error handler | Open: Ethan |
| R-06 | Q | Source of `req.actor` | Open: Ethan to answer |
| R-07 | BLOCKER-traceability | Status values ≠ FR-6.1 | **Partly fixed (models)**: `Request`/`RequestHistory` enums use FR-6.1 via `src/models/_shared.js`. Remaining for Ethan: `src/domain/requestStatus.js`, transition table, `tests/requestStatus.test.js`. **Until then, the domain and the model disagree: merge dependency** |
| R-08 | BLOCKER-traceability | Mandatory fields ≠ FR-2.2 | **Fixed (model)**: `title` removed, `location` required, `categoryId` reference; verified by `tests/models.test.js` |
| R-09 | MAJOR | No version field / optimistic concurrency | **Model field added** (`version`, ETag). The conditional update is R-13 (Ethan) |
| R-10 | MAJOR | Missing baseline fields (reference, campusId, closedAt; departmentId) | **Fixed in model**: `reference`, `campusId`, `closure.closedAt`, `immutable` fields added; `departmentId` removed. Remaining for Ethan: `statusTransitionService.mayActOn` and the event payload still use `departmentId`. **Against a real database, every non-admin transition would be refused until they move to category authorisation: merge dependency** |
| R-11 | MAJOR | Append-only guard bypass (`bulkWrite`, `Model.collection`) | **Layer 2 fixed**: `pre('bulkWrite')` hook added; six mutation paths asserted in `tests/models.test.js`. Layer 3 (Atlas role against `Model.collection`): Robert, verified at M3 |
| R-12 | MINOR | History index / fields | **Fixed (model)**: `requestVersion`, unique `{requestId, requestVersion}`, idempotency fields, full `changeType` set, `campusId`. Remaining for Ethan: `historyRepository.listForRequest` should sort by `requestVersion` |
| R-13 | MAJOR | Unconditional update, result ignored | Open: Ethan |
| R-14 | MINOR | Repositories cannot join a transaction | Open: Ethan |
| R-15 | MAJOR | Status change + history not atomic | Open: Ethan (DEC-015) |
| R-16 | MAJOR | Publish after commit, outside the callback | Open: Ethan |
| R-17 | MAJOR | Reporting projection drift | Open: Ethan |
| R-18 | MAJOR | Notification leaks internal status (FR-3.5) | Open: Ethan |
| R-19 | MINOR | Double subscriber registration | Open: Ethan |
| R-20 | MINOR | `engines` admits end-of-life Node | **Fixed on `task/M2-PersonB`**: `"node": ">=22.0.0"` + `.nvmrc` (22) |
| R-21 | MINOR | README disagrees with the repository | **Partly fixed**: paths now true after R-01; Node line updated. Test count and data-baseline link still to check after your PR |
| R-22 | Q | `mayActOn` and requesters | Open: Ethan to answer |

---

> **Update 30/09/2026:** `src/models/` has been aligned to the data baseline by Robert (the model side of R-04, R-07 to R-12), with `tests/models.test.js` as evidence (suite 39/39). The remaining work is in the domain, service, repositories and routes; see the status table.

## A. Code that contradicts baselined requirements (fix first)

These three are the priority. An assessor tracing the RTM from these requirements lands on
code and tests asserting different values, which is the traceability failure the M2
defence questions probe (M2 brief §15, Q1 and Q12). Each is either a code fix or a CR to
change the requirement. It must not diverge silently.

| Requirement (baselined) | Requirement says | Code says | Where | Fix |
|---|---|---|---|---|
| **FR-6.1 / AC-FR-6.1** status values | *Exactly* **Received, Assigned, In Progress, On Hold, Resolved, Closed, Rejected** | Submitted, Acknowledged, In Progress, On Hold, Resolved, Closed. **Missing Assigned and Rejected** (FR-6.6 needs Rejected) | `src/domain/requestStatus.js:11-18`; `tests/requestStatus.test.js` asserts *"a new request begins at Submitted — FR-6.1"* | Use `STATUS` from data baseline §3.1; rebuild the transition table; fix the test to assert `Received` |
| **FR-1.2 / AC-FR-1.2** role set | **Requester, Technician, Coordinator, Manager, Security Officer, Administrator** | Department Staff, Department Head, Administrator, Requester | `src/middleware/authorise.js:22-26`, `src/domain/requestStatus.js:21, 34`, `src/services/statusTransitionService.js:100-103`, tests | Use `ROLE` from data baseline §3.1; re-express `OPERATION_RULES` and the transition roles |
| **FR-2.2 / DEC-006** mandatory fields | *Exactly* **category, location, description**; *"will treat no other field as mandatory"* | `title` required (with `maxlength`); **no `location` field** | `src/models/Request.js:11-13` | Remove `title`; add `location` required; `categoryId` as a reference (FR-2.3) |

Related scoping mismatch (R-10): `departmentId` appears in `Request.js:17`,
`statusTransitionService.js:101-103` and the event payload, but no requirement mentions
departments. FR-4.1, FR-4.6 and FR-5.2 scope staff by **category authorisation**. Replace it
with `categoryId` plus user/group `categoryAuthorisations`, or raise a CR if departments are
genuinely wanted.

## B. Append-only guard bypass (R-11): what is and is not protected

`RequestHistory.js` states that *"every mutating operation Mongoose exposes is refused at the
schema"*. I probed that on 29/09/2026 against mongoose 8.24.4, with no database connection
needed because the hooks run before the driver:

| Mutation path | Result |
|---|---|
| `RequestHistory.updateOne(...)` | Blocked by hook ✔ |
| `RequestHistory.findByIdAndUpdate(...)` | Blocked by hook ✔ |
| `RequestHistory.findByIdAndDelete(...)` | Blocked by hook ✔ |
| `doc.deleteOne()` | Blocked by hook ✔ |
| `doc.updateOne(...)` | Blocked by hook ✔ |
| **`RequestHistory.bulkWrite([{ updateOne: … }])`** | **Not blocked**: reached the driver ✘ |
| **`RequestHistory.collection.updateOne(...)`** (native driver) | **Not blocked**: reached the driver ✘ |

**Why the tests did not show it:** the suite substitutes the repository, so no test ever
exercises the model's hooks, let alone the paths around them. Guards that are never tested
against their bypasses look complete.

**Correction, in three layers (constraint DB-01, data baseline §4):**

1. **Repository (unchanged):** `historyRepository` exposes `append` and `listForRequest` only.
2. **Schema (Ethan):** add model-level middleware. Verified on mongoose 8.24.4: it receives
   the operations array, refuses non-insert operations and lets `insertOne` through:
   ```js
   requestHistorySchema.pre('bulkWrite', function guardBulk(next, ops) {
     const mutating = (ops ?? []).some((o) => !('insertOne' in o));
     next(mutating ? new Error('AppendOnlyViolation: mutating bulkWrite is not permitted on requestHistory') : undefined);
   });
   ```
   Add a unit test that calls `bulkWrite` with an `updateOne` op and asserts
   `AppendOnlyViolation` (no DB needed, as in the probe). Update the header comment to say
   what the schema layer guarantees and what it does not.
3. **Database role (final defence; Robert, DEC-003):** `Model.collection` goes straight to the
   native driver, and **no application-level hook can intercept it**. The only control that
   stops it is the Atlas custom role for the application user, `civicconnect-app`, which has
   **`find` and `insert` only on `requestHistory`** (and on `auditLog`). An update issued
   through any path with the application's credential, including the native driver, mongosh
   with the app's URI or a compromised process, fails with `Unauthorized`. This is the
   Assignment 2 §3.7 recommendation (revoked UPDATE/DELETE privileges) applied to Atlas, and
   it is what makes AC-FR-6.7 a property of the data rather than of the code. The single
   sanctioned exception is the PROC-001 anonymisation, run under a separate, temporary,
   audited credential (CR-003). **Verification of layer 3 needs a test cluster and is M3
   work**; it is not claimed at M2.

---

## C. All review comments (R-01 to R-22)

Line numbers refer to `7cfa94b`. After the R-01 move, `tests/routes/requestRoutes.js` and
`tests/middleware/authorise.js` are at `src/routes/requestRoutes.js` and
`src/middleware/authorise.js`, with unchanged line numbers.

## PR #60 — `feat/dec-012-authorisation-guard`

**R-01 [BLOCKER] `tests/routes/requestRoutes.js` and `tests/middleware/authorise.js`: wrong directory**. *Status: fixed on `task/M2-PersonB` (moved with `git mv`, so history is preserved; no import changes were needed); 23/23 tests pass. Remaining for Ethan: re-run the negative check below and link the output.*
> These belong in `src/routes/` and `src/middleware/`. That's where `tests/authorisationGuard.test.js:17-19` imports them from, where the README's structure table says they are, and where PED §7.5 cites them. As committed, the test file dies on import, so none of its 7 tests run. Fix: `git mv tests/routes src/routes && git mv tests/middleware src/middleware`. The router's relative import `../middleware/authorise.js` already works after the move.
>
> PED §7.5 also says the route-table assertion "was itself verified by registering an unguarded route and confirming that the suite fails". That can't have been run from the tree that was pushed. Please re-run that negative check after the move and link the output in the PR, so the claim in §7.5 is backed by evidence.

**R-02 [MAJOR] No CI, so this could merge red**
> `.github/workflows/` contains only `New Text Document.txt`. A single required `npm test` check on PRs to `dev`/`main` would have blocked R-01 automatically. That's stage 1 of the A2 §5.10 recommendation and M2 brief §10 ("repeatable automated checks already introduced should be shown"). Not your area (Christiaan's CI work), but this PR is the concrete evidence for why it's needed. Can you tag him?

**R-03 [MAJOR] `requestRoutes.js:13` — `PATCH /:id/status` vs DEC-014**
> The transition is modelled as a field update. A2 §4.6 recommended, and DEC-014 now records, `POST /api/v1/requests/:id/transitions` with `If-Match` (optimistic concurrency, 412/428) and `Idempotency-Key` (400/422/409 per the IETF draft). Without the key, a client retry after a timeout writes a **second immutable history entry**, which is the A2 §4.1 failure. Without `If-Match`, two staff acting on the same request both succeed from the same predecessor. The guard stays on the new route, so the route-table test is unaffected. Also, please mount under `/api/v1` from the start.

**R-04 [BLOCKER-traceability] `authorise.js:22-26` — roles don't match FR-1.2**
> `OPERATION_RULES` uses `Department Staff` and `Department Head`. FR-1.2 (baselined) fixes the role set as **Requester, Technician, Coordinator, Manager, Security Officer, Administrator**. Everything that traces FR-1.2/FR-1.3/FR-6.4 to this file is therefore tracing to roles that don't exist in the requirements. Either align to FR-1.2, or raise a CR to change FR-1.2. It shouldn't diverge silently. The same applies to `requestStatus.js:21` and `statusTransitionService.js:100-103`.

**R-05 [MINOR] `requestRoutes.js:26` — error body and unhandled errors**
> `res.status(error.status).json({ error: error.message })` is fine for our own error classes, but DEC-014 standardises on RFC 9457 problem details (`application/problem+json`, stable `type`, machine `code`). More importantly, `next(error)` falls through to Express's default handler, which returns an HTML page with a stack trace unless `NODE_ENV=production`. That's an information leak CON-019 probing will find. Suggest one error-handler middleware that maps known errors and returns a generic 500 for everything else.

**R-06 [Q] `authorise.js:45` — where does `req.actor` come from?**
> The guard trusts `req.actor`, but nothing in the slice sets it. Worth a comment (or a test) that it's set **only** by the session middleware from the server-side store, never from headers or body, since otherwise the whole guard can be bypassed by a crafted request. That's the adversarial case CON-019 will try first.

## PR #57 — `feat/request-status-domain`

**R-07 [BLOCKER-traceability] `src/domain/requestStatus.js:11-18` — status values ≠ FR-6.1**
> FR-6.1 / AC-FR-6.1 (baselined): *"exactly Received, Assigned, In Progress, On Hold, Resolved, Closed and Rejected."* The code has Submitted and Acknowledged, and is missing Assigned and **Rejected** (FR-6.6 needs Rejected). `tests/requestStatus.test.js` then asserts *"a new request begins at Submitted — FR-6.1"*, a test that cites a requirement it contradicts. This matters for the defence: an assessor following the RTM from FR-6.1 lands on a test asserting a different value. Please align the enum, table and tests to FR-6.1. The data baseline (`docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md` §3.1) has the constants.

**R-08 [BLOCKER-traceability] `src/models/Request.js:11-13` — mandatory fields ≠ FR-2.2 / DEC-006**
> `title` is `required: true`, and there's no `location` field. FR-2.2 requires *exactly* category, location and description and *"will treat no other field as mandatory"* (resolution of CFL-001). As written, the schema would reject a compliant submission (no title) and accept a non-compliant one (no location). Suggest removing `title` (it also has no purpose under NFR-4.1's minimisation) and adding `location` as required.

**R-09 [MAJOR] `Request.js:22` — `versionKey: false` and no version field**
> This removes the only built-in optimistic-concurrency hook and doesn't replace it. The race in A2 §3.4 (two staff read Acknowledged, both write, and history gets two transitions from the same predecessor) is fully open. Baseline: a `version: Number` field, incremented on every write, exposed as `ETag: "v<n>"` (DEC-014/015).

**R-10 [MAJOR] `Request.js` — fields the baseline needs that are missing**
> - `reference` (unique, `immutable: true`): FR-2.6 / AC-FR-2.6. There's currently nothing to show the requester.
> - `campusId` on every collection: SCP-019 was deferred *specifically* so the M2 data model wouldn't foreclose it (A2 §2.2). Adding it later means migrating every document and index.
> - `closure.closedAt`: the NFR-4.2 retention clock starts at closure; without it PROC-001 can't select eligible records.
> - `departmentId` (line 17) isn't in any requirement. FR-4.1/FR-4.6/FR-5.2 scope staff by **category authorisation**. If departments are intended, that's new scope and needs a CR; otherwise it should be `categoryId` plus user/group `categoryAuthorisations`.
> - `immutable: true` on `reporterId` and `createdAt`: nothing currently stops a later update from rewriting who submitted a request (FR-2.5).

**R-11 [MAJOR] `src/models/RequestHistory.js:7-10, 37-47` — append-only guard has two bypasses**
> The header says *"every mutating operation Mongoose exposes is refused"*. I probed it against mongoose 8.24.4 (no DB needed; the hooks run before connection): `updateOne`, `findByIdAndUpdate`, `findByIdAndDelete`, `doc.deleteOne()` and `doc.updateOne()` are all blocked ✔. But **`RequestHistory.bulkWrite([{updateOne…}])` and `RequestHistory.collection.updateOne(…)` both reach the driver unblocked** ✘.
> - `bulkWrite`: Mongoose 8 supports model-level `pre('bulkWrite', function (next, ops) {…})`. I verified that it receives `ops` and can refuse non-insert operations while letting `insertOne` through. Snippet in the data baseline §3.3.
> - `Model.collection` (native driver) can't be hooked. Only the database can stop it: an Atlas custom role giving the app user **find + insert only** on `requestHistory`. That's A2 §3.7's "revoked UPDATE/DELETE privileges" and is now layer 3 of constraint DB-01.
>
> Please soften the header comment to state what's actually guaranteed at which layer. As written, it over-claims AC-FR-6.7.

**R-12 [MINOR] `RequestHistory.js:17-18` — index and fields**
> `listForRequest` sorts by `occurredAt` but the index is only `{requestId}`, so every timeline read does an in-memory sort. Suggest adding `requestVersion` (the version the entry produced) and a **unique** `{requestId, requestVersion}` index. That covers the FR-3.3/FR-7.4 query and makes the database refuse two entries claiming the same successor state, a storage-level backstop for R-09. `changeType` also needs `action`, `detail`, `resolution` (FR-7.2, FR-2.4, FR-7.5) and `created` (FR-2.5). Add `campusId` (R-10).

**R-13 [MAJOR] `src/repositories/requestRepository.js:8-9` — unconditional update, result ignored**
> `updateOne({ _id: id }, { $set: … })` has no version predicate and the result isn't checked. Two consequences: (1) lost updates (R-09); (2) if the request was deleted or changed between `findById` and here, `matchedCount === 0`, yet the service carries on and appends a history entry for a change that never happened. Suggest `updateOne({ _id, version: expected }, { $set, $inc: { version: 1 } }, { session })` and throw `PreconditionFailedError` (→ 412) when `matchedCount === 0`.

**R-14 [MINOR] `historyRepository.js:14` — can't join a transaction**
> `RequestHistory.create(entry)` takes no session. To participate in a transaction it needs `RequestHistory.create([entry], { session })` (array form is required when passing options). Same for `findById(id).session(session)` in `requestRepository`.

## PR #58 — `feat/dec-011-event-publication` (+ the service from #57)

**R-15 [MAJOR] `src/services/statusTransitionService.js:63-76` — steps 1 and 2 are not atomic**
> The header (lines 15-17) says *"FR-6.7 must not be capable of succeeding or failing separately from the status change it records"*, and that's exactly right. But the code does two independent writes. If `history.append` throws (validation error, network blip, or the process dying between the two awaits), the status has changed and there's no history entry. That's the silent failure A2 §3.1 describes ("an absent row cannot be distinguished from a transition that never occurred"). It also fails NFR-1.10 / CON-017.
>
> The tests can't catch this because the fakes never fail. Suggested test: make `history.append` reject and assert (a) nothing is published and (b) the unit of work did not commit.
>
> Fix: inject a `unitOfWork` port (`run(fn)` → `session.withTransaction`), the same way `requests` and `history` are injected, so the tests stay database-free. **This doesn't change DEC-011**: DEC-011's line is between steps 2 and 3, and steps 1+2 were always meant to be one unit. It's recorded as DEC-015, with CR-001 narrowing AC-NFR-1.10 (auditLog is a post-commit trigger on Atlas, so it can't be in the transaction). Sketch in `docs/decisions/ADR/DEC-015_Transaction_Boundary_v0.1.md`.

**R-16 [MAJOR] `statusTransitionService.js:79` — publish must be after commit, outside the callback**
> Once R-15 is in, `publish()` must be called **after** `withTransaction()` resolves, not inside its callback. `withTransaction` re-runs the callback on `TransientTransactionError`, which would publish twice, or publish for a transaction that then aborts. The existing ordering test (`statusTransitionService.test.js:68-76`) should assert that publication happens after commit.

**R-17 [MAJOR] `reportingProjectionSubscriber.js:6-10` — drift with no recovery path**
> `adjust({ decrement, increment })` isn't idempotent, and DEC-011 deliberately contains subscriber failures. So one failed or duplicated call leaves the counts permanently wrong, and AC-FR-8.1 ("counts sum to the total") fails with no way to notice or repair it. Suggest: (1) key by `{campusId, categoryId, status}` (FR-8.2 needs category; departmentId isn't a requirement); (2) a reconciliation job that rebuilds `reportingCounts` from `requests` with a `$group` (exact, even after anonymisation); (3) note in the file that date-filtered views (FR-8.5) must query `requests`, since counters can't be sliced by date.

**R-18 [MAJOR] `notificationSubscriber.js:9` — leaks internal status on security-category requests**
> The message embeds `fromStatus`/`toStatus` verbatim. FR-3.5 (CFL-002) limits what a requester sees on a security-category request to Received / In Progress / Closed. An "On Hold" or "Resolved" notification is exactly the leak FR-3.5 prohibits. The event payload (`statusTransitionService.js:79-87`) doesn't carry `securityCategory` either, so the subscriber can't know. Suggest: add `securityCategory` and `reference` to the payload, map to a `displayStatus` before storing, and add a unique `{sourceHistoryId, userId}` index so a redelivered event doesn't duplicate the notification.

**R-19 [MINOR] `src/events/subscribers/index.js:15` — double registration**
> `registerSubscribers` has no guard. Calling it twice (for example once in the app factory and once in a test or a hot reload) registers every subscriber twice, so every requester gets duplicate notifications and the counts double-count. A module-level `registered` flag, or a check against `listSubscriptions()`, would make it idempotent.

**R-20 [MINOR] `package.json:6-8` — `engines: ">=20"` admits an end-of-life runtime**. *Status: fixed on `task/M2-PersonB`: `"node": ">=22.0.0"` (Node 22 minimum; newer versions such as 26 allowed without EBADENGINE) and `.nvmrc` (22), per team decision; DEC-003 updated.*
> Node 20 reached end-of-life on 30 April 2026. Suggest pinning the LTS line we deploy on (DEC-003: Node >=22.0.0), plus an `.nvmrc`, so CI, dev machines and the VPS agree (A2 §5.6 repeatable-build property "pinned dependencies/toolchain"). I ran the suite on Node 26 locally.

**R-21 [MINOR] `README.md` — documentation disagrees with the repository**. *Status: partly fixed: the `src/` paths are now true and the Node line reads >=22.0.0.*
> The README says `npm test` gives the implemented table with `src/middleware/authorise.js` and `src/routes/requestRoutes.js`, and the handover says 23 passing. Neither is true of the pushed tree (R-01). M2 brief §8: application docs and PED "are both required and must agree". Please re-check after the fix and add the collection names and data-baseline link (`docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md`).

**R-22 [Q] `statusTransitionService.js:99-105` — `mayActOn` and requesters**
> `mayActOn` returns `false` for every non-staff role, which is right for transitions. If it becomes the shared object-level rule for reads (DEC-012 point 2), FR-3.6 needs a `Requester && request.requesterId === actor.id` branch. Is the intent one function per operation, or one shared rule set? DEC-012 says "one documented rule set".

---

---

## D. What is already strong (keep it through the rework)

- The **subscriber registry and `listSubscriptions()`** turn DEC-011's recorded traceability cost into something testable.
- The **composed, named guard with the route-table assertion** is a better answer to NFR-3.3 detectability than any of the three Assignment 2 candidates. Now that R-01 is fixed, all 7 of its tests run and pass.
- **Collaborator injection** keeps the suite database-free. The R-15 unit-of-work port preserves that.
- The **transition table as data** makes FR-6.2 reviewable without reading the service.
