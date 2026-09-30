# DEC-016 — Transaction boundary for request writes; auditLog eventually consistent

| Field | Entry |
|---|---|
| **ID** | DEC-016 |
| **Date** | 29/09/2026 |
| **Owner** | Robert van der Merwe |
| **Status** | Proposed. Decided on approval of this PR; **CR-001** (AC-NFR-1.10 narrowing) must be approved with it |
| **Affects** | NFR-1.10, AC-NFR-1.10, CON-017, CON-015, NFR-1.9, FR-6.3, FR-6.7, FR-5.4, DEC-011, DEC-015 |
| **Research** | Assignment 2 §3.2, §3.4, §3.6, §3.7 |

## Context

CON-017 requires transactional operations with rollback. NFR-1.10 requires every operation
that writes to more than one collection to commit no partial change. AC-NFR-1.10 was written
at M1, before the technology was chosen, and assumes a relational engine: *"a status
transition that writes to the request, the assignment and the audit trail … all three tables
remain in their pre-transition state."*

Two facts established at M2 make that criterion unimplementable as written:

1. **The audit write cannot be inside the transaction on Atlas.** A2 §3.2 reasoned that
   "a database trigger fires within the transaction of the statement that caused it". That
   is true of SQL triggers and false of Atlas. MongoDB's documentation states that Atlas
   Database Triggers "use MongoDB change streams" and, "unlike SQL data triggers, which run
   on the database server", run on a separate serverless compute layer. They observe
   **committed** changes, asynchronously.
2. **The implemented slice has no transaction at all.** `statusTransitionService.js` performs
   the request update and the history insert as two independent writes. If the second fails,
   the status has changed and no history exists. That is the silent failure A2 §3.1 describes,
   and it contradicts the service's own header comment.

## Decision

1. **The transaction encloses the aggregate:** the `requests` update (status, assignment,
   resolution, closure fields and the `version` increment) and the `requestHistory` insert,
   plus the `counters` increment on creation. Assignment is a field of `requests`, so
   "request + assignment" from the original criterion is one document and stays atomic.
2. **`auditLog` is eventually consistent,** written by the Atlas trigger from the change
   stream after commit, with a measured lag target of ≤ 60 s (`recordedAt − occurredAt`).
3. **DEC-011 consequences (`notifications`, `reportingCounts`) stay outside the transaction**
   and are published **after** `withTransaction()` resolves, never inside the callback.
4. **Optimistic concurrency** by a `version` field. The client presents it as the ETag via
   `If-Match` (DEC-015), and the service's update is conditional on it. A unique
   `{requestId, requestVersion}` index on `requestHistory` backs that up at the storage layer.
5. **Transaction settings recorded, not inherited:** `readConcern: snapshot`,
   `writeConcern: majority`, `readPreference: primary`, bounded by the server's 60 s
   transaction lifetime.

### Implementation shape (for the follow-up PR to `statusTransitionService.js`)

```js
export function createStatusTransitionService({ requests, history, unitOfWork, clock = () => new Date() }) {
  async function transition(requestId, toStatus, actor, { expectedVersion, idempotencyKey, fingerprint, note }) {
    // DEC-015: replay before doing anything else.
    const prior = idempotencyKey && await history.findByIdempotencyKey(actor.id, idempotencyKey);
    if (prior) return replayOrReject(prior, fingerprint);            // same fingerprint → replay; else 422

    let result;
    await unitOfWork.run(async (session) => {                         // session.withTransaction under the hood
      const request = await requests.findById(requestId, { session });
      if (!request) throw new NotFoundError(requestId);
      if (!mayActOn(request, actor)) throw new AuthorisationError();  // DEC-012 point 2
      if (request.version !== expectedVersion) throw new PreconditionFailedError();   // → 412
      const verdict = checkTransition(request.status, toStatus, actor.role);
      if (!verdict.allowed) throw new TransitionError(verdict.reason);                // → 422

      const occurredAt = clock();
      await requests.applyChange(requestId, expectedVersion,
        { status: toStatus, statusChangedAt: occurredAt, ...closureFieldsFor(toStatus, actor, occurredAt, note) },
        actor, { session });                                          // conditional on version, $inc version
      const entry = await history.append({
        campusId: request.campusId, requestId, requestVersion: expectedVersion + 1,
        changeType: 'status', fromStatus: request.status, toStatus, body: note ?? null,
        actorId: actor.id, actorRole: actor.role, occurredAt,
        idempotencyKey: idempotencyKey ?? null, idempotencyFingerprint: fingerprint ?? null,
      }, { session });                                                // Model.create([doc], { session })
      result = { requestId, fromStatus: request.status, toStatus, occurredAt,
                 version: expectedVersion + 1, historyId: entry._id };
    });

    publish(EVENTS.REQUEST_STATUS_CHANGED, { ...result, /* reporterId, categoryId, securityCategory */ });  // after commit only
    return result;
  }
  return { transition };
}
```

`unitOfWork` is injected in the same way `requests` and `history` already are, so the unit
tests keep running without a database. A fake unit of work records `run()` and lets a test
make `history.append` reject. The test then asserts that nothing is published, and a
database integration test (M3) asserts that the request document is unchanged.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Keep AC-NFR-1.10 as written**: write `auditLog` from application code inside the transaction | Violates CON-015 and NFR-1.9, which put the audit write *below* the application specifically so that no route can bypass it. An app-written audit row is skipped by exactly the direct database write AC-NFR-1.9 tests |
| **Trigger writes `requestHistory` too** (A2 §3.6 Approach B) | On Atlas the trigger is post-commit, so history would become eventually consistent. FR-6.7 then fails in the window between commit and trigger, and permanently if the trigger is suspended past its oplog resume point. History must be atomic with the change it records (DEC-011's own line) |
| **No transaction; compensate on failure** (delete the history row / revert the status) | Compensation on `requestHistory` would need a delete path, which breaks DB-01. It also fails if the process dies between the two writes |
| **Embed history as an array on `requests`** (single-document atomicity, no transaction) | Append-only could no longer be enforced by database privilege, because the parent must be updatable. The array would also be unbounded, and the trigger could not see history entries as discrete events. See the data baseline §1 |
| **Pessimistic locking** (`findOneAndUpdate` lock flag) | Contention on a single request is rare at CON-010 scale (A2 §3.4). Optimistic concurrency is cheaper and maps directly onto HTTP `If-Match` / 412 |

## Consequences

- **Integrity is not weakened; only timeliness is.** An aborted transaction produces no
  change event, so the trigger can never audit a partial state. The narrowing gives up
  *audit timeliness* (seconds), not *audit correctness*.
- **New failure mode, recorded as RSK-018.** If the trigger is suspended and its resume
  token falls out of the oplog, audit events for that interval are lost. The docs state the
  trigger "begins listening to new events but does not process any missed past events". M0's
  oplog is small and not configurable. Mitigations: trigger-suspension alerting in Atlas;
  runbook to resume within the oplog window; and a gap-detection query (requests whose
  `version` exceeds the count of their audited updates) run with the weekly restore test.
- The trigger is at-least-once on redelivery, so the audit function inserts with a unique
  `eventId` and treats duplicate-key as success.
- `withTransaction` may re-run its callback, so the callback must not publish, send or log
  side effects. That is why publication moves outside it.
- Unit tests stay database-free. The rollback guarantee itself is verified at M3 against a
  test cluster (fault injection between the two writes).
- **Divergence from Assignment 2, recorded for the defence (M2 brief Q8):** A2 recommended
  the audit write inside the same transaction via trigger. The recommendation rested on SQL
  trigger semantics. The MongoDB Atlas evidence reverses that premise, so the M2 decision
  keeps A2's *intent* (audit below the application, unbypassable) and drops its *mechanism*
  (same-transaction).

## CR-001 — change to AC-NFR-1.10 (Master Brief Appendix E)

| Field | Entry |
|---|---|
| Change ID | CR-001 |
| Requested by | R. van der Merwe, 29/09/2026 |
| Requested change | Replace AC-NFR-1.10 (v0.2) with the v0.3 text below. NFR-1.10 wording unchanged, because the audit row is written by the trigger, not by "the operation" |
| AC-NFR-1.10 v0.2 (preserved) | *Given* a status transition that writes to the request, the assignment and the audit trail, *when* a failure is injected after the first write and before the last, *then* no partial change is committed and all three tables remain in their pre-transition state |
| **AC-NFR-1.10 v0.3 (proposed)** | *Given* a status transition that writes the `requests` document (including its assignment fields) and a `requestHistory` entry inside one transaction, *when* a failure is injected after the first write and before commit, *then* neither document is changed, no `auditLog` entry for the aborted transition ever appears, and no event is published; *and given* the same transition committed, *then* exactly one `auditLog` entry per written document appears within 60 seconds |
| Reason | Atlas triggers execute after commit via change streams; the M1 criterion assumed SQL trigger semantics |
| Requirements affected | NFR-1.10 (AC only), NFR-1.9 (unchanged; its AC already targets a trigger-written row) |
| Architecture/design | DEC-011 unchanged. DEC-016 new. StatusTransitionService gains a unit-of-work port |
| UI/API/data | DEC-015 `If-Match`/412. `version` field added to `requests` |
| Security/privacy | None negative; audit remains unbypassable |
| Quality/testing | New unit test (append failure → nothing published); M3 integration fault-injection test; audit-lag measurement |
| Scope / schedule / cost | Small, within the follow-up PR to the slice; no cost |
| Risk | RSK-018 raised (trigger suspension) |
| Recommendation | **ACCEPT** |
