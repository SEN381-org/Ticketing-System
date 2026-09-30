# CivicConnect — application slice

Campus Service Request Management Platform. SEN381, Belgium Campus ITversity.

This repository holds the first implemented slice of the system. The slice was
chosen to complete the end-to-end trace recorded in PED §7.5 rather than to
cover breadth: it implements the request status transition and the immutable
history that FR-6.7 requires, together with the two design decisions recorded as
DEC-011 and DEC-012.

## Running

```
npm install
npm test
```

Node >=22.0.0 (Node 22 is the minimum; Node 20 reached end-of-life on 30 April 2026). The test suite requires no database connection.

## What is implemented

| Requirement | Where | Verified by |
|---|---|---|
| FR-6.1 — status values | `src/domain/requestStatus.js` (pre-baseline values, correction R-07 pending); `src/models/_shared.js` (baseline values) | `statusTransitionService.test.js`; `models.test.js` |
| FR-6.2 — controlled transitions | `src/domain/requestStatus.js`, `src/services/statusTransitionService.js` | `statusTransitionService.test.js` |
| FR-6.3 — a history entry per change | `src/services/statusTransitionService.js` | `statusTransitionService.test.js` |
| FR-6.4 — the acting role is validated | `src/domain/requestStatus.js` | `statusTransitionService.test.js` |
| FR-6.7 — immutable history | `src/models/RequestHistory.js`, `src/repositories/historyRepository.js` | `statusTransitionService.test.js`; `models.test.js` (six mutation paths refused, incl. `bulkWrite`); database-level enforcement (Atlas role) verified at M3 |
| FR-2.2, FR-1.2, SCP-019 — mandatory fields, role set, campus scoping | `src/models/Request.js`, `src/models/User.js`, `src/models/_shared.js` | `models.test.js` |
| FR-1.3, NFR-3.3 — server-side authorisation at every entry point | `src/middleware/authorise.js`, `src/routes/requestRoutes.js` | `authorisationGuard.test.js` |

## How the design decisions appear in the code

**DEC-011 — in-process event publication.** `StatusTransitionService.transition()`
performs three steps in a fixed order: it commits the status change, it appends
the history entry, and only then does it publish `request.status.changed`.

The first two are direct writes. They are deliberately *not* subscribers,
because FR-6.7 must not be capable of succeeding or failing separately from the
status change it records. The event mechanism carries only those consequences
that may fail independently — notification and the reporting projection.

DEC-011 accepted, as a recorded cost, that no single location states what a
transition does. `src/events/subscribers/index.js` is the mitigation: every
subscription in the system is registered there, so the set of consequences is
enumerable by reading one file. `listSubscriptions()` exposes the same set to
tests. Adding SCP-014 later means adding a line to that file and a module beside
it; it does not mean editing the transition service.

Subscribers are dispatched synchronously by `EventEmitter`, so each is wrapped:
a throwing subscriber is logged and contained rather than propagated back into
the transition. The transition and its consequences are not atomic with one
another, and the test suite asserts that a failing subscriber leaves the
transition and its history entry intact.

**DEC-012 — three enforcement points, one rule set.** `requireOperation()`
composes authentication and function-level authorisation into a single named
middleware. Composing them removes the ordering decision from the call site;
DEC-012 records that middleware ordering is load-bearing and fails silently when
wrong.

The guard carries `guardName`, which makes it visible in the Express route
table. `authorisationGuard.test.js` walks that table and fails the build if any
non-public route is registered without it. This is the detectability argument on
which DEC-012 rejected the per-method guard-call alternative, and it is the
evidence NFR-3.3 and CON-019 require. Routes intended to be reachable without
authentication must be listed explicitly in `PUBLIC_ROUTES`; the list is
currently empty.

Object-level access is enforced in the service, after the request document is
loaded, because the route boundary cannot make that decision — the document
does not exist yet at that point in the chain.

## Not yet implemented

- The response serialiser, DEC-012's third enforcement point. It depends on the
  CFL-002 resolution, which remains *Proposed*; baseline condition C-01 is open
  and the exposure is tracked as RSK-009.
- `SCP-014` notification delivery. Deferred, not excluded; it attaches as a
  subscriber in `src/events/subscribers/index.js` when admitted.
- The Atlas database trigger writing `auditLog`, required by CON-015 and
  NFR-1.9. It is held as configuration in the repository rather than as console
  state; the definition is added with the deployment work under DEC-003.
- Database-level verification of append-only storage, which requires a test
  cluster and is scheduled for M3.

## Structure

```
src/
  domain/          business rules with no infrastructure dependency
  models/          Mongoose schemas
  repositories/    persistence access
  services/        application services
  events/          domain event publication and subscribers (DEC-011)
  middleware/      authorisation guard (DEC-012)
  routes/          Express routes
tests/             verification evidence referenced from the RTM
scripts/           backup/restore, PROC-001 anonymisation, Atlas trigger configuration (see scripts/README.md)
```

The data model is defined in `docs/architecture/data/Data_and_Persistence_Baseline_v0.1.md`; `src/models/` implements it.
Known backend corrections are tracked in `docs/M2_BACKEND_CORRECTIONS.md`.
