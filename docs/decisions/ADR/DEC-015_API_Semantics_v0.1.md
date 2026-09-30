# DEC-015 — API semantics: REST/JSON over HTTPS, versioned path, ETag/If-Match concurrency, Idempotency-Key on state-changing POSTs, RFC 9457 errors

| Field | Entry |
|---|---|
| **ID** | DEC-015 (new at M2) |
| **Date** | 29/09/2026 |
| **Owner** | Robert van der Merwe (initial interface and integration decisions) |
| **Status** | Proposed; decided on approval |
| **Affects** | FR-2.1, FR-2.6, FR-3.x, FR-4.3, FR-4.4, FR-5.x, FR-6.x, FR-7.x, NFR-1.6, NFR-2.1, NFR-3.3, NFR-3.6, CON-007, CON-011, CON-012, CON-013, CON-019, DEC-011, DEC-012, DEC-016, RSK-012 |
| **Research** | Assignment 2 §4 (Task 3), in particular §4.1 failure consequences, §4.4 comparison, §4.5 cost of distribution, §4.6 recommendation |

## Context

The browser client calling the backend is CivicConnect's only significant integration
(SCP-016 excludes campus systems). A2 §4.5 justified accepting a network boundary at all
(CON-013, CON-011 with NFR-1.2, NFR-3.3, SCP-019). A2 §4.6 recommended REST over HTTPS/JSON.
That part is settled by DEC-002's choice of Express.

This decision fixes the *semantics* of that boundary, because the worst failure identified in
A2 §4.1 is semantic, not a matter of transport: a status-transition POST that times out
leaves the client unable to tell "committed" from "never arrived". A retry could then write a
second immutable history entry, making FR-6.7 "immutably wrong".

The implemented router (`PATCH /:id/status`) models the transition as a field update, has no
version check and no idempotency. It predates this decision and is brought into line by it.

## Decision

### 1. Resource model and versioning

- Base path **`/api/v1`**. Versioned from the first commit (A2 §4.6, Espinha et al. 2015).
- **A transition is an event, not a field update.** It is created as a sub-resource, so the
  actor and predecessor state that FR-6.7 records are first-class:

| Operation | Method & path | Preconditions | Success |
|---|---|---|---|
| Submit request (FR-2.1, FR-2.2, FR-2.6) | `POST /api/v1/requests` | `Idempotency-Key` | `201`, `Location`, `ETag: "v1"`, body includes `reference` |
| Read request (FR-4.2, FR-3.x) | `GET /api/v1/requests/{id}` | – | `200`, `ETag: "v<n>"` |
| Staff list / filter / sort (FR-4.1, FR-4.4, FR-4.5) | `GET /api/v1/requests?status=&categoryId=&assigneeId=&from=&to=&sort=&cursor=&limit=` | – | `200`, cursor pagination, `limit ≤ 100` |
| Text search (FR-4.3) | `POST /api/v1/requests/search` (body `{ text, … }`) | – | `200` |
| Transition (FR-6.2–6.6) | `POST /api/v1/requests/{id}/transitions` body `{ toStatus, note?, resolution?, reason? }` | `If-Match`, `Idempotency-Key` | `201`, new `ETag`, body = the history entry |
| Assign / accept (FR-5.1, 5.2, 5.5) | `POST /api/v1/requests/{id}/assignments` body `{ assigneeId }` | `If-Match`, `Idempotency-Key` | `201`, new `ETag` |
| Comment / action / detail (FR-7.1, 7.2, 2.4) | `POST /api/v1/requests/{id}/comments` \| `/actions` \| `/details` | `Idempotency-Key` (`If-Match` not required; appends do not conflict with state) | `201` |
| Timeline (FR-3.3, FR-7.4) | `GET /api/v1/requests/{id}/history` | – | `200`, ascending `requestVersion` |
| Notifications (FR-3.4) | `GET /api/v1/me/notifications` | – | `200` |
| Health (NFR-1.6) | `GET /api/v1/health` | none (public; listed in `PUBLIC_ROUTES`) | `200 {app, db}` or `503` |

- **Text search is a POST with a body** because search text may contain personal information,
  and RFC 9110 §17.9 warns against sensitive data in URIs (they end up in proxy and server
  logs). This is a CON-007 obligation, not a style choice.

### 2. Optimistic concurrency (joins DEC-016 to the protocol)

- Every request representation carries **`ETag: "v<version>"`** (strong validator). RFC 9110
  §13.1.1 requires strong comparison for `If-Match`, so a weak `W/` tag could never match.
- State-changing sub-resources (`/transitions`, `/assignments`) **require `If-Match`**.
  - Missing → **`428 Precondition Required`** (RFC 6585 §3).
  - Stale → **`412 Precondition Failed`** with the current ETag in the problem body. The
    client re-reads, shows the user what changed, and lets them retry deliberately.
- The service performs the same check as a version-conditioned update inside the
  transaction, so the protocol check and the storage check cannot disagree (A2 §4.6: "the
  same optimistic check is expressed once in the service and once in the protocol").

### 3. Idempotency key

Per the IETF draft `draft-ietf-httpapi-idempotency-key-header-07` (expired Internet-Draft,
cited as the best available convention rather than a standard):

- Header **`Idempotency-Key`**, a Structured-Field String. The client sends a **UUID v4**
  generated per *logical* user action and reused unchanged on every retry of that action.
- **Required** on every state-changing POST above. Missing → **`400`** (draft §2.7).
- Scope: `(actorId, key)`. Stored on the `requestHistory` entry the operation creates,
  together with a **fingerprint** (SHA-256 of method + normalised path + canonical JSON
  body). A unique partial index `{actorId, idempotencyKey}` makes the database the arbiter.
  No extra collection is needed, and the key commits atomically with the change it guards
  (DEC-016).
- Behaviour:

| Situation | Response |
|---|---|
| New key | Execute; `201` |
| Same key, same fingerprint, original committed | **Replay** the original result: same status code and body, plus header `Idempotent-Replayed: true` (project convention). **No second history entry** |
| Same key, different fingerprint | **`422`**, problem type `idempotency-key-reused` (draft §2.7) |
| Same key while the original is still in its transaction | The loser's insert hits the unique index / write conflict, retries after the winner commits, then **replays**. If retries are exhausted: **`409`**, problem type `idempotency-in-progress` (draft §2.7) |

- **Expiry policy (published, draft §2.3):** keys live as long as the history entry they are
  stored on. Clients must not reuse a key for a different action. Keys contain no personal
  information and are not nulled by PROC-001.

### 4. Error model

All errors are **`application/problem+json` (RFC 9457)**: `type` (a stable URI under
`/api/v1/problems/…`), `title`, `status`, `detail`, plus a machine `code`. Internal messages,
stack traces and Mongo error text are never returned.

| Status | When | Traces to |
|---|---|---|
| 400 | Malformed JSON, schema-invalid body, missing `Idempotency-Key` | FR-2.2 (names the missing field, AC-FR-2.2b) |
| 401 | Not authenticated | FR-1.1 |
| 403 | Authenticated, operation not permitted for role (function level) | FR-1.3, FR-6.4, NFR-3.3 |
| 404 | Not found, **or an object the caller may not know exists** (a requester asking for another user's request) | FR-3.6 / AC-FR-3.6 (no data, no existence oracle) |
| 409 | Idempotency in progress; transaction write-conflict retries exhausted | DEC-016 |
| 412 | `If-Match` stale | DEC-016 |
| 422 | Domain rule refused (illegal transition, resolution missing before Resolved, reason missing on close/reject); idempotency key reused with a different payload | FR-6.2, FR-6.5, FR-6.6 |
| 428 | `If-Match` missing on a state-changing sub-resource | DEC-016 |
| 503 | Health check: database unreachable | NFR-1.6 |

The existing `TransitionError(422)`, `AuthorisationError(403)` and `NotFoundError(404)` map
unchanged. A single Express error handler renders them as problem details, and anything else
becomes a generic 500.

### 5. Validation and security boundary

- `express.json({ limit: '32kb', strict: true })`. `Content-Type: application/json` is
  required on writes. Unknown fields are rejected (Mongoose `strict: 'throw'`, plus boundary
  validation that names the offending field).
- The composed guard (DEC-012) runs before every handler except those in `PUBLIC_ROUTES`.
  `req.actor` is set **only** by the session middleware from the server-side session store,
  never from anything the client sends.
- Cookie session (`HttpOnly`, `Secure`, `SameSite=Lax`). CSRF is mitigated by SameSite plus
  the mandatory JSON content type. The authentication mechanism itself is a separate decision
  (forward item), not made here.
- CORS: same-origin only (Nginx serves the React build and proxies `/api`), so no CORS
  allow-list is needed.

### 6. Change and compatibility

- Within `v1`, **additive changes only**: new optional fields, new endpoints. Clients must
  ignore unknown response fields.
- A breaking change means `/api/v2`, served alongside v1 for at least one milestone, with the
  change raised through Master Brief §14.
- The contract is held as **`docs/api/openapi.yaml`**, a controlled artefact listed in PED
  Appendix A. CI validates it (forward item; C's CI work).

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| `PATCH /requests/{id}` with `{ status }` (current code) | Discards the actor and predecessor as first-class data. PATCH is not idempotent, and a field update invites "set status to X" semantics with no transition model (A2 §4.6) |
| GraphQL | A2 §4.4: errors come back inside a 200, there is no protocol-level idempotency contract, and the resolver-level authorisation surface is harder to enumerate under NFR-3.3/CON-019. Revisit only if FR-8.x measurement shows over-fetching (A2 §4.6) |
| Last-write-wins, no ETag | Allows the A2 §3.4 race (two staff, same predecessor, contradictory history) |
| Idempotency keys in a separate `idempotencyKeys` collection with a 24 h TTL (common industry pattern) | Would need its own transaction participation and its own expiry policy. Storing the key on the history entry it guards is atomic by construction and costs one index |
| Server-generated de-duplication (hash of body within a time window) | Cannot tell two genuine identical actions (e.g. two identical comments) from a retry. Only the client knows its intent |

## Consequences

- The front end must generate and persist the UUID across retries of one action, and must
  send `If-Match` from the last `ETag` it saw. A small shared fetch wrapper does this once.
- The router in `src/routes/requestRoutes.js` changes from `PATCH /:id/status` to
  `POST /:id/transitions`. The authorisation route-table test is unaffected, because the guard
  stays on the new route.
- The 412 path needs UI treatment (a "this request changed — reload?" message). Added to C's
  interface backlog.
- NFR-3.3 "every entry point" becomes the finite table in §1. It is the checklist the
  route-table assertion enforces.
- RTM: DEC-015 is added to the design/interface and ADR columns of every row in *Affects*
  (see `docs/Requirements/Requirements Traceability Matrix/RTM_v0.5_Change_Notes.md`).
