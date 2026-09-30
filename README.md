# CivicConnect — application slice

Campus Service Request Management Platform. SEN381, Belgium Campus ITversity.

This repository holds the first implemented slice of the system. The slice was
chosen to complete the end-to-end trace recorded in PED §7.5 rather than to cover
breadth: it implements the request status transition and the immutable history
FR-6.7 requires, together with the design decisions recorded as DEC-011 and
DEC-012 and the data, API and transaction decisions in DEC-015, DEC-016 and
DEC-017.

**Authoritative references.** Where this code disagrees with
[`docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md`](docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md),
the code is wrong. Status and role values come from FR-6.1 and FR-1.2 through
`src/models/_shared.js` and are never redeclared.

## Running

```
npm install
npm test
```

Node 22 or later (`.nvmrc`). The test suite needs no database connection.

## What is implemented

| Requirement | Where | Verified by |
|---|---|---|
| FR-6.1 — status values | `src/models/_shared.js` | `requestStatus.test.js`, `models.test.js` |
| FR-6.2 — controlled transitions | `src/domain/requestStatus.js` | `requestStatus.test.js` |
| FR-6.3 — a history entry per change | `src/services/statusTransitionService.js` | `statusTransitionService.test.js` |
| FR-6.4 — the acting role is validated | `src/domain/requestStatus.js` | `requestStatus.test.js` |
| FR-6.5 — resolution before Resolved | `src/domain/requestStatus.js` | `requestStatus.test.js` |
| FR-6.6 — reason on close or reject | `src/domain/requestStatus.js` | `requestStatus.test.js`, `statusTransitionService.test.js` |
| FR-6.7 — immutable history | `src/models/RequestHistory.js`, `src/repositories/historyRepository.js` | `models.test.js`; layer 3 at M3 |
| FR-1.2 — controlled role set | `src/models/_shared.js` | `requestStatus.test.js` |
| FR-1.3, NFR-3.3 — server-side authorisation at every entry point | `src/domain/accessRules.js`, `src/middleware/authorise.js` | `authorisationGuard.test.js` |
| FR-1.5, FR-3.5 — security-category restriction | `src/domain/accessRules.js` | `authorisationGuard.test.js` |
| FR-4.1, FR-5.2 — category authorisation | `src/domain/accessRules.js` | `statusTransitionService.test.js` |
| NFR-1.10, CON-017 — no partial commit | `src/infrastructure/unitOfWork.js` | `statusTransitionService.test.js`; rollback at M3 |

Collections written by this slice: `requests`, `requestHistory` (inside one
transaction), then `notifications` and `reportingCounts` from the DEC-011
subscribers, and `auditLog` from the Atlas trigger after commit.

## How the decisions appear in the code

**DEC-016 — the transaction boundary.** `StatusTransitionService.transition()`
commits the `requests` update and the `requestHistory` insert inside one unit of
work. FR-6.7 must not be capable of succeeding or failing separately from the
status change it records, so the two are one unit. The `unitOfWork` port is
injected exactly as the repositories are, which keeps the suite database-free;
rollback itself is a database guarantee and is verified at M3 by fault injection
(AC-NFR-1.10 v0.3, CR-001).

**DEC-011 — in-process event publication.** Publication happens *after* the unit
of work resolves and outside its callback. `withTransaction` re-runs its callback
on a transient error, so publishing inside it would emit duplicate events or an
event for a transaction that then aborted. DEC-011's line sits between the
history append and the publication, and that is unchanged by DEC-016.

DEC-011 accepted, as a recorded cost, that no single location states what a
transition does. `src/events/subscribers/index.js` is the mitigation: every
subscription passes through it, so the consequence set is enumerable by reading
one file, and `listSubscriptions()` exposes the same set to tests. Registration
is idempotent. Adding SCP-014 means adding a line there, not editing the service.

**DEC-012 — three enforcement points, one rule set.**
`src/domain/accessRules.js` *is* the rule set. The three enforcement points are
the same rules asked a different question, because each point knows different
things: the route boundary knows the role, the service knows the role and the
document, the serialiser knows the role, the document and the field.

The guard carries `guardName`, so `authorisationGuard.test.js` walks the Express
route table and fails the build if any non-public route is registered without it.
That assertion was itself verified by registering an unguarded route and
confirming the suite fails — see `docs/evidence/R-01_negative_verification.txt`.

`req.actor` is set **only** by the session middleware from the server-side store,
never from a header or body. The guard refuses any request carrying an
identity-shaped header, and that refusal is asserted by test.

**DEC-015 — the transition is a resource.**
`POST /api/v1/requests/:id/transitions`. `If-Match` is required (428 absent, 412
stale) and so is `Idempotency-Key` (400 absent). Both are mandatory rather than
optional: `requestHistory` is append-only, so a duplicate entry written by a
client retry can never be removed, and the client that omits the key is exactly
the client that retries. Replay detection runs before any write.

Assignment is not a transition. `Received → Assigned` is reached only through
`POST /requests/{id}/assignments`, which sets `assigneeId` and `assignedAt` and
records the FR-5.4 entry. Through `/transitions` it would leave a request
`Assigned` with no assignee, breaking the invariant FR-4.6 and FR-5.3 both read.

**FR-6.6 on security-category requests.** Only a Security Officer may act on a
security-category request, so the Security Officer is a disposition role for
those requests specifically. Without that, no role could close or reject one: it
would never reach `closure.closedAt`, and PROC-001 — which selects on closure —
would never anonymise the records holding the most sensitive personal data in
the system. That is a CON-007 exposure, not only an FR-6.6 gap.

## Not yet implemented

- The response serialiser as an HTTP concern. The field-level rule exists in
  `accessRules.js` and is enforced for notifications; the serialiser depends on
  the CFL-002 resolution, which remains *Proposed* (condition C-01, RSK-009).
- `SCP-014` notification delivery. Deferred, not excluded.
- The reconciliation job rebuilding `reportingCounts` from `requests` (OI-14, M3).
- Database-level verification of append-only storage and of transaction rollback,
  both of which need a test cluster (M3).
- The transition model's role mapping is a design proposal, not a baselined
  requirement — FR-6.2 requires the model to exist without stating its contents.
  Recorded as **OI-15** for confirmation, together with three judgements that go
  beyond what the requirements state: that only a Security Officer may act on a
  security-category request (a reading of CFL-002 "restricted visibility and
  handling", wider than FR-1.5's three fields); that `mayViewRequest` therefore
  narrows FR-4.6, which presents unassigned requests to the Coordinator without
  a security exception; and that `request:assign` includes the Manager, where
  FR-5.1 names only the Coordinator.
- The assignment sub-resource itself (`POST /requests/{id}/assignments`).

## Structure

```
src/
  domain/          business rules and the authorisation rule set; no infrastructure
  models/          Mongoose schemas (data baseline §3)
  repositories/    persistence access; the only update path for requests
  services/        application services
  events/          domain event publication and subscribers (DEC-011)
  infrastructure/  unit of work (DEC-016)
  middleware/      authorisation guard (DEC-012) and problem-details handler
  routes/          Express routes (DEC-015)
tests/             verification evidence referenced from the RTM
```
