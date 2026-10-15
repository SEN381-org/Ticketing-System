# CivicConnect — M3 API/Integration Test Specification

| | |
|---|---|
| **Artefact** | Test specification for the three API/integration cases of M3 Assessment Area D |
| **Version** | 0.2 |
| **Author** | Robert van der Merwe (Member B) |
| **Date** | 12 October 2026 |
| **Status** | Executed. Written before the tests existed; the tests have since been implemented and run on 12 October 2026. Run output: `docs/evidence/M3_API_Test_Run.txt`. Negative verifications (§7): `docs/evidence/M3_API_Negative_Verification.txt`. Failures are logged as DEF-007 to DEF-011 |
| **Test basis** | DEC-015 v0.1 (API semantics), DEC-016 v0.1 (transaction boundary), AC-NFR-1.10 v0.3 (proposed under CR-001, not yet baselined) |
| **Code examined** | `feat/m3-phase0-composition-root` at `5a64a7c` (PR #83). The transition route, service and error classes it contains are unchanged from `dev` |
| **Traces to** | FR-6.2, FR-6.3, FR-6.7, AC-FR-6.7, NFR-1.10, CON-017 |

Expected results in this document are taken from DEC-015 and DEC-016, not from the code
(M3 brief §11). Where the code is known to differ, the test is written to the decision and
is expected to fail. Each real failure is then logged in the Defect Register with the test
output. This was agreed with the DEC-015 implementer on 12/10/2026: all four differences in
§2 are to be corrected in the code and in `docs/api/openapi.yaml`, in a separate PR after
PR #83 merges, and DEC-015 does not change.

Every "Predicted" column below is a prediction from reading the code, made before anything
was executed. The predictions are left as written; the observed results are in
`docs/evidence/M3_API_Test_Run.txt`.

---

## 1. Strategy

| # | Decision | Reason |
|---|---|---|
| S1 | The cases drive the system over real HTTP: `createApp` listening on an ephemeral port, called with `fetch` | Cases 1 and 2 are about headers and status codes, which exist only at the route |
| S2 | They run with the `civicconnect-app` credential only. Fixtures are created fresh with unique identifiers and left behind | It is the role the application runs as. That role cannot delete from `requestHistory` or drop the database (DB-01 layer 3), so clean-up is not possible with it (contradicts DEC-003's Test row; logged as DEF-006) |
| S3 | Files live in `tests/integration/` and are skipped, with a printed reason, when `MONGODB_URI` is unset | CI has no cluster credential. A skipped case must never read as a verified one |
| S4 | Assertions follow DEC-015 and DEC-016 as written | M3 brief §11: expected results are derived before execution from authoritative project evidence |
| S5 | The unique indexes `{requestId: 1, requestVersion: 1}` and `{actorId: 1, idempotencyKey: 1}` (partial, string keys) are assumed to exist on the test cluster, created by hand | The application role cannot create or list indexes, so the suite cannot check for them |
| S6 | Every assertion is scoped to the fixture's own `requestId` or `actorId`, never to a collection count | S2 leaves earlier runs' data in place |

**Consequence of S5 recorded as a gap, not solved here:** under the DEC-003 v0.2 role the
application cannot build its own indexes, so any index the schema declares exists on a
cluster only if someone created it by hand.

---

## 2. Known differences between the code and DEC-015

| # | DEC-015 | Code at `5a64a7c` | Exposed by |
|---|---|---|---|
| D1 | §3: a replay returns the same status code and body as the original, plus `Idempotent-Replayed: true` | `200` instead of `201`, a smaller body with `replayed: true`, no header (`requestRoutes.js`, `replayOf` in `statusTransitionService.js`). `openapi.yaml` documents the `200` | Case 2b |
| D2 | §2: a stale `If-Match` returns `412` with the current ETag in the problem body | The problem body carries only the stale version, in `detail` (`errors.js`) | Case 1 |
| D3 | §3: the fingerprint is SHA-256 of method + normalised path + canonical JSON body | `JSON.stringify(body)` only, and the replay lookup is by `(actorId, key)` with no request id | Cases 2d, 2e |
| D4 | §3: a key reused with a different payload is problem type `idempotency-key-reused` | `idempotency-conflict` / `IDEMPOTENCY_CONFLICT` (`errors.js`) | Case 2c |
| D5 | §4: an authenticated role not permitted for the operation gets `403` | A wrong-role transition returns `422 INVALID_TRANSITION` (`statusTransitionService.js:88`) | new case: wrong-role transition, expect 403 |

D3 is a correctness defect, not only a conformance difference: the same key sent to a
different request would replay the first request's result, so the second transition would
not happen while the caller is told it succeeded.

---

## 3. Shared design

### 3.1 Files

```
tests/integration/
  _harness.js                               skip rule, connection, fixtures, login, HTTP helpers
  ifMatchConflict.integration.test.js       Case 1
  idempotencyKey.integration.test.js        Case 2
  transactionBoundary.integration.test.js   Case 3
```

`package.json` gains `"test:integration": "node --env-file=.env --import \"data:text/javascript,import dns from 'node:dns';dns.setServers(['8.8.8.8','1.1.1.1']);\" --test \"tests/integration/*.test.js\""`.
The `--import` sets public DNS resolvers so that the `mongodb+srv` lookup works on a machine whose only resolver is loopback.
`npm test` also discovers these files; without `MONGODB_URI` they report as skipped.

### 3.2 Skip rule

```js
// false when the host in MONGODB_URI contains 'civicconnecttest'; otherwise the reason, which the runner prints
export const skip = skipReason(process.env.MONGODB_URI);

before(async () => { if (!skip) await connectDatabase(process.env.MONGODB_URI); });
after(async ()  => { if (!skip) await disconnectDatabase(); });

test('…', { skip }, async (t) => { /* … */ });
```

The suite is opt-in. It leaves fixtures behind that the application role cannot remove, so
it refuses to run unless the host parsed from `MONGODB_URI` contains `civicconnecttest`. A URI
that is unset, that cannot be parsed, or whose host does not name the test cluster, skips
every case with the reason printed and connects to nothing.

### 3.3 Fixture, created per test

| Item | Value |
|---|---|
| `campusId`, `categoryId` | New ObjectIds |
| Actor | One Coordinator, `categoryAuthorisations: [categoryId]`, email `it-<hex>@example.test`, password hashed with the real `hashPassword` |
| Request | Status `Received`, `version: 0`, `securityCategory: false`, reference `CC-<year>-<6 random digits>` |
| Idempotency keys | `crypto.randomUUID()` |

All data is synthetic. The transition used throughout is **Received → Rejected with a
reason**: from `Received`, `/transitions` permits nothing else, and the assignments route
is not built.

### 3.4 Helpers

| Helper | Purpose |
|---|---|
| `serve(app, fn)` | Listen on `127.0.0.1:0`, run `fn(base)`, close |
| `login(base, fixture)` | `POST /api/v1/sessions`; returns the `__Host-sid` cookie pair |
| `postTransition(base, requestId, { cookie, ifMatch, key, body })` | `POST /api/v1/requests/{id}/transitions`; returns `{ status, headers, body }` |
| `snapshot(requestId)` | `{ request, history }` read from the cluster and normalised through JSON, so two snapshots compare with `deepEqual` |

---

## 4. Case 1 — a stale `If-Match` returns 412 and changes nothing

| Field | Entry |
|---|---|
| **Test basis** | DEC-015 §2; DEC-016 decision 4; FR-6.2; A2 §3.4 (two staff acting on the same predecessor state) |
| **Why selected** | A lost update writes a contradictory history entry that can never be removed |
| **Technique / level** | Negative case. API integration: real HTTP, `composeApplication()`, real cluster |
| **Precondition** | Request R at `v0`, status `Received`. The Coordinator is logged in |

**Steps**

1. `POST` transition, `If-Match: "v0"`, key K1, body `{ toStatus: 'Rejected', reason: 'first' }`. This is the other user's change committing.
2. `before = snapshot(R)`.
3. `POST` transition, `If-Match: "v0"` (now stale), key K2, body `{ toStatus: 'Rejected', reason: 'second' }`.
4. `after = snapshot(R)`.

**Expected results and assertions**

| Subtest | Assertion | Predicted |
|---|---|---|
| the first change commits | step 1 is `201` with `ETag: "v1"` | pass |
| the stale request is refused with 412 | step 3 is `412`, content type `application/problem+json`, `code` is `PRECONDITION_FAILED` | pass |
| the request is unchanged | `deepEqual(after.request, before.request)`; `closure.reason` is `'first'`; `version` is `1` | pass |
| no history entry is written | `after.history` has length 1; none has `idempotencyKey` K2 | pass |
| the problem body carries the current ETag | some member of the parsed problem body equals `"v1"` | **fail (D2)** |
| nothing internal is returned | the body text contains neither `Mongo` nor a stack frame | pass |

DEC-015 does not name the member that carries the ETag, so the assertion looks for the
value in any member.

**Interpretation and limits.** A pass shows that a second writer holding an old version is
refused and that the refusal writes nothing. It is a sequential stale write. It does not
exercise two transactions racing on the same version, where the losing `applyChange`
matches nothing or the unique `{requestId, requestVersion}` index refuses the insert.

---

## 5. Case 2 — `Idempotency-Key` is required, and a replay writes nothing

| Field | Entry |
|---|---|
| **Test basis** | DEC-015 §3 and §4; FR-6.7; A2 §4.1 (a timeout followed by a retry) |
| **Why selected** | `requestHistory` is append-only, so a duplicate entry written by a retry is permanent |
| **Technique / level** | Negative cases plus a replay. API integration: real HTTP, `composeApplication()`, real cluster |
| **Precondition** | Request R at `v0`, status `Received`. The Coordinator is logged in. Each sub-case uses its own fixture |

### 2a — missing key (negative)

Input: `POST` transition with `If-Match: "v0"` and no `Idempotency-Key`.

| Assertion | Predicted |
|---|---|
| `400`, `application/problem+json`, `code` is `IDEMPOTENCY_KEY_REQUIRED` | pass |
| the request equals its earlier snapshot; R has no history | pass |

### 2b — replay of a committed key

Input: `POST` with key K and body `{ toStatus: 'Rejected', reason: 'duplicate' }`, giving
response A. The identical request again, giving response B.

| Subtest | Assertion | Predicted |
|---|---|---|
| the original commits | A is `201` with `ETag: "v1"` | pass |
| the replay writes nothing | R has exactly one history entry; `version` is `1`; the request equals its snapshot taken after A | pass |
| the replay has the same status code | `B.status === A.status` | **fail (D1)** |
| the replay has the same body | `deepEqual(B.body, A.body)` | **fail (D1)** |
| the replay is marked | `Idempotent-Replayed` is `true` on B | **fail (D1)** |

"The replay writes nothing" is the safety property. It is its own subtest so that it
reports separately from the response-shape subtests.

### 2c — same key, different body

Input: after 2b's first request, `POST` with key K and `reason: 'something else'`.

| Assertion | Predicted |
|---|---|
| `422` | pass |
| the problem `type` ends with `idempotency-key-reused` | **fail (D4)** |
| R still has exactly one history entry | pass |

### 2d — same key and body, different request

Input: a second request R2 for the same actor. After committing on R with key K, `POST`
the same body with key K to R2.

| Assertion | Predicted |
|---|---|
| `422`: the fingerprint includes the path, so this is a different request under a used key | **fail (D3)** |
| the response does not carry R's `requestId` as a result | **fail (D3)** |
| R2 has no history entry for this attempt, and R still has exactly one | pass |

### 2e — same key, same body with its members in another order

Input: after committing `{ toStatus, reason }` with key K, `POST`
`{ reason, toStatus }` with the same values and key K.

| Assertion | Predicted |
|---|---|
| it is treated as a replay, not as a different payload: the status is not `422` | **fail (D3)** |
| R still has exactly one history entry | pass |

**Interpretation and limits.** A pass on "the replay writes nothing" shows a sequential
retry cannot duplicate history. It does not exercise two requests carrying the same key at
the same moment, where DEC-015 expects the unique index to arbitrate and the loser to
replay or receive `409`. That path depends on the index assumed in S5.

---

## 6. Case 3 — a failure inside the transaction persists neither write

| Field | Entry |
|---|---|
| **Test basis** | Proposed AC-NFR-1.10 v0.3 under CR-001 (not yet baselined); DEC-016 decisions 1 and 3; FR-6.3; FR-6.7; CON-017 |
| **Why selected** | The audit argument rests on the status change and its history entry committing together. The M2 test for this asserted only the order of the writes, and still passed with the history write outside the transaction |
| **Technique / level** | Fault injection. API integration: real HTTP, real cluster, the real `requestRepository` and `createUnitOfWork()` |
| **Precondition** | Request R at `v0`, status `Received`. The Coordinator is logged in |

**Note.** Test basis: Proposed AC-NFR-1.10 v0.3 under CR-001 (not yet baselined).

**Fault.** A wrapper around the real `historyRepository`. It performs the real insert
inside the transaction, reads the request back through the same session, and then throws.
The fault therefore fires after both writes and before commit, the latest point
AC-NFR-1.10 allows.

```js
const faulty = {
  ...historyRepository,
  append: async (entry, options) => {
    const created = await historyRepository.append(entry, options);
    probe.seenInside = await requestRepository.findById(entry.requestId, options);
    if (probe.armed) throw new Error(FAULT_MESSAGE);
    return created;
  },
};
```

The application is `createApp` with the production auth and health services and a
transition service built from `requestRepository`, `faulty` and `createUnitOfWork()`.

**Steps**

1. Subscribe a counting listener to `EVENTS.REQUEST_STATUS_CHANGED`.
2. `before = snapshot(R)`. Arm the fault. `POST` transition, `If-Match: "v0"`, key K.
3. `after = snapshot(R)`.
4. Disarm the fault. `POST` the identical request again.

**Expected results and assertions**

| Subtest | Assertion | Predicted |
|---|---|---|
| the fault fires after the first write | inside the transaction the request read back has status `Rejected` and `version` `1` | pass |
| the failure is a generic 500 | `500`, `code` is `INTERNAL_ERROR`, the body does not contain the fault's message | pass |
| the status change is rolled back | `deepEqual(after.request, before.request)`; status `Received`, `version` `0` | pass |
| the history entry is rolled back | R has no history; no entry exists for this actor and key K | pass |
| no event is published | the listener was not called | pass |
| the same key then succeeds | step 4 is `201` with `ETag: "v1"`; R has exactly one history entry; the listener was called once | pass |

"The fault fires after the first write" is what stops the case passing trivially: without
it, a fault that fired before any write would also leave both collections unchanged.
"The same key then succeeds" shows the aborted attempt did not consume the key, which
DEC-015 §3 states as the key committing atomically with the change it guards.

**Interpretation and limits.** A pass shows that an exception raised inside
`unitOfWork.run()` after both writes leaves neither of them committed. It does not show:

- that no `auditLog` entry appears for the aborted transition, which AC-NFR-1.10 v0.3 also
  requires. That depends on the Atlas trigger, which is not deployed to the test cluster.
  Asserting it now would pass for the wrong reason;
- behaviour when the process dies or the connection drops mid-transaction;
- behaviour when `withTransaction` retries its callback on a transient error.

---

## 7. Showing that each case can fail

The same method as the Phase 0 negative-verification records: break the protected
behaviour, show the named subtest fails, restore, re-run.

| Case | Change made to the code | Subtest that must fail |
|---|---|---|
| 1 | Remove the version check in the service and the `version` filter in `applyChange` | the request is unchanged; no history entry is written |
| 2b | Skip the `findByIdempotencyKey` lookup | the replay writes nothing |
| 3 | Drop `{ session }` from the insert in `historyRepository.append` | the history entry is rolled back |
| 3 | Drop `{ session }` from `Request.updateOne` in `applyChange` | the status change is rolled back |

**Findings from the first negative verification (12 October 2026).** The predictions above
are kept as written. Two of them did not hold with the change as stated, because another
guard stopped the write first:

- **Case 1.** Removing only the version check does not make the named subtests fail. The
  stale request reaches the transition rule, the request is already `Rejected` (a terminal
  status), and the rule refuses it with `422`. The break is detected by "the stale request
  is refused with 412" (`422` instead of `412`); "the request is unchanged" and "no history
  entry is written" still pass. They fail once the transition rule is bypassed as well: the
  stale request then returns `201`, changes the request and writes a second history entry.
- **Case 2b.** Skipping only the idempotency lookup does not make "the replay writes
  nothing" fail. The replay carries `If-Match: "v0"`, the request is at `v1`, and the
  version check refuses it with `412`. Removing the version check too is still not enough:
  the transition rule then refuses the replay with `422`. The subtest fails once the
  lookup, the version check and the transition rule are all bypassed: the replay returns
  `201` and writes a second history entry.

With every application guard removed, the cluster accepted the duplicate history entries,
so the unique indexes assumed in S5 did not act. That is logged as DEF-014 and DEF-015. All runs,
including the isolated ones, are in `docs/evidence/M3_API_Negative_Verification.txt`.

---

## 8. Evidence and defect handling

- The run output goes to `docs/evidence/` as the execution evidence for these cases.
- A subtest that fails as predicted is logged in the Defect Register with its output. DEF
  numbers are allocated by the register's owner.
- When the correcting PR merges, the same tests are re-run unchanged. That re-run is the
  regression evidence for each defect.
- A "Predicted: pass" subtest that fails, or a "Predicted: fail" subtest that passes, is a
  finding in its own right and is recorded, not adjusted away.
