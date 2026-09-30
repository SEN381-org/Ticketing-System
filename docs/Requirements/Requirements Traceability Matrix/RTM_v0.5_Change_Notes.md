# RTM v0.4 → v0.5 — Data / persistence column (Member B, criterion C)

| | |
|---|---|
| **Source artefact** | `docs/Outdated/Requirements_Traceability_Matrix_v0.4.xlsx` (archived) |
| **Target** | `Requirements_Traceability_Matrix_v0.5.xlsx` and `.csv` in this folder; v0.4 archived in `docs/Outdated/` |
| **Author** | Robert van der Merwe |
| **Date** | 29/09/2026 |

## Row count: 62, not 45

The **Status summary** sheet of v0.4 records **17 populated / 62 outstanding / 79 total** for
the *Data / persistence impact* column. Counting the cells directly (every cell still reading
"Pending – data model (Criterion C)") gives **62**. The handover's "17 of 62 rows populated"
appears to be a slip for *17 of 79*, and subtracting 17 from 62 gives the 45 I had been
working from. **All 62 are populated below.** Four requirements genuinely have no persistence
consequence (NFR-1.1, 1.2, 1.3, 4.3). They say so explicitly with a reason, rather than
staying blank, as the handover asks. Separately, **10 of the 17 already-populated cells need correcting** (Part B); two of
them were wrong, not just thin.

Columns in the tables: **Data / persistence impact** (replaces the cell) · **Design /
interface additions** (appended to column I, shared with Ethan; only where DEC-014/015/016
apply) · **ADR / change / risk additions** (appended to column N).

Abbreviations: *req* = `requests`, *hist* = `requestHistory`, *txn* = the DEC-015
multi-document transaction. Every collection carries `campusId` (SCP-019), which is not
repeated per row.

---

## Part A — the 62 outstanding rows

### Feature group 1 — identity and access

| Req | Data / persistence impact | Design / interface additions | ADR / change / risk additions |
|---|---|---|---|
| FR-1.1 | `users.email` unique index (one individual account per person). Server-side session store in MongoDB (sessions collection, TTL). No `requests` read occurs before the guard resolves the session | DEC-014: `401` problem response, no request data in body | DEC-014 |
| FR-1.2 | `users.roles: [enum ROLE]` with validator `length ≥ 1` (the schema rejection *is* AC-FR-1.2). `roles` collection seeded by migration from the single rule set (DEC-012) | – | DEC-012; review comment R-04 (code roles ≠ FR-1.2 set) |
| FR-1.3 | Effective permissions = `roles.permissions ∪ groups.permissions`, resolved per request, never cached in process (NFR-2.7). **Rejected attempt recorded** (AC-FR-1.3): `auditLog` insert `origin:'access', eventType:'access.denied'` by the app (insert-only privilege) | DEC-014: `403` | DEC-016 (purpose B) |
| FR-1.4 | `users.status` (active/revoked), `revokedAt`, `sessionEpoch`. Revocation increments the epoch and every session carrying the old epoch is refused, which terminates existing sessions (AC-FR-1.4). Auth events to `auditLog` | – | – |
| FR-1.5 | `categories.isSecurity` → **`req.securityCategory` snapshot, immutable**, so a later category edit cannot widen access to existing security requests. Description and `hist.body` of security requests are withheld at the serialiser (DEC-012 point 3). `notifications.displayStatus` never carries restricted detail | – | CFL-002 (Proposed); condition C-01 |
| FR-1.6 | `groups` collection (`permissions`, `categoryAuthorisations`, `active`); `users.groupIds`. Removing a user from a group withdraws the authorisation at the next request, with no cached copy (AC-FR-1.6) | – | – |

### Feature group 2 — submission

| Req | Data / persistence impact | Design / interface additions | ADR / change / risk additions |
|---|---|---|---|
| FR-2.1 | One txn: `counters` `$inc` → `req` insert (`status: Received`, `version: 1`) → `hist` `created` entry (`requestVersion: 1`) | DEC-014: `POST /api/v1/requests`, `Idempotency-Key` required, `201` + `Location` + `ETag` | DEC-014, DEC-015 |
| FR-2.2 | **Exactly three required fields at schema level: `categoryId`, `location`, `description`.** No other field is required; `title` removed from the model | DEC-014: `400` names the missing field (AC-FR-2.2b) | DEC-006; review comment R-08 |
| FR-2.3 | `req.categoryId` is an ObjectId reference to `categories`; there is no free-text category field. The service rejects inactive categories. `strict:'throw'` rejects an unknown `category` string | – | – |
| FR-2.4 | Additional detail stored as a `hist` entry `changeType:'detail'` (`body`, `actorId`, `occurredAt`). Append-only; nulled by PROC-001 | DEC-014: `POST /requests/{id}/details` | DEC-016 |

### Feature group 3 — requester visibility

| Req | Data / persistence impact | Design / interface additions | ADR / change / risk additions |
|---|---|---|---|
| FR-3.1 | Query `req {campusId, requesterId}` sorted by `submittedAt`, index `{campusId, requesterId, submittedAt}`. After PROC-001, `requesterId` is null, so anonymised requests leave the requester's list (intended: the purpose is spent) | – | DEC-016 |
| FR-3.2 | `req.status` in the same projection; no join | – | – |
| FR-3.3 | `hist` entries with `changeType ∈ {created, status}` for the request, ordered by `requestVersion` via unique index `{requestId, requestVersion}` | DEC-014: `GET /requests/{id}/history` | – |
| FR-3.4 | `notifications` (`userId`, `requestReference`, `kind`, `displayStatus`, `sourceHistoryId` unique with `userId`, `read`). Written by `NotificationSubscriber` **after commit** (DEC-011); idempotent on redelivery; TTL 30 days | – | DEC-011, DEC-016 |
| FR-3.5 | Stored `req.status` remains the internal FR-6.1 value. The requester-facing mapping (Received / In Progress / Closed) is applied at the serialiser **and** before writing `notifications.displayStatus` | – | CFL-002; review comment R-18 (notification leaks internal status) |
| FR-3.6 | Object-level filter `requesterId == actor.id`, applied in the repository query itself. No data read for a foreign request | DEC-014: `404` (no existence oracle) | DEC-012 point 2 |

### Feature group 4 — staff retrieval

| Req | Data / persistence impact | Design / interface additions | ADR / change / risk additions |
|---|---|---|---|
| FR-4.1 | Filter `categoryId ∈ effectiveCategoryAuthorisations(user ∪ groups)`; index `{campusId, categoryId, assigneeId, status}` | – | – |
| FR-4.2 | Reads `req` + `hist` timeline. No additional entity; the model supports every field AC-FR-4.2 lists | – | OI-01 (unchanged) |
| FR-4.3 | Reference: unique index on `reference`. Category/location/description: text index `{description, location}` with category filter | DEC-014: **`POST /requests/search`** (search text kept out of URIs, CON-007) | DEC-014 |
| FR-4.4 | Indexes `{campusId, status, submittedAt}`, `{campusId, assigneeId, status}`, `{campusId, submittedAt, categoryId}` | DEC-014: query params `status, categoryId, assigneeId, from, to`; cursor pagination | NFR-2.6 |
| FR-4.5 | Sort keys (`submittedAt`, `status`, `categoryId`) are covered by the FR-4.4 indexes; no in-memory sort (M0 32 MB sort limit) | – | – |
| FR-4.6 | `assigneeId: null` + `categoryId` filter on index `{campusId, categoryId, assigneeId, status}` | – | – |

### Feature group 5 — assignment

| Req | Data / persistence impact | Design / interface additions | ADR / change / risk additions |
|---|---|---|---|
| FR-5.1 | One txn: `req.assigneeId/assignedAt`, status → Assigned, `version+1`; `hist` `assignment` entry (`fromAssigneeId`, `toAssigneeId`) | DEC-014: `POST /requests/{id}/assignments`, `If-Match`, `Idempotency-Key` | DEC-014, DEC-015 |
| FR-5.2 | As FR-5.1, with update filter `{assigneeId: null, version}`, so an accept cannot overwrite an owner. Authorisation from `categoryAuthorisations` | – | DEC-015 |
| FR-5.3 | The conditional update matches 0 documents when an owner exists: refused and the owner is unchanged. The refused attempt is written to `auditLog` (`access.denied`) as AC-FR-5.3 requires | DEC-014: `422` (already assigned) / `412` (stale version) | DEC-015 |
| FR-5.5 | Reassignment `hist` entry keeps `fromAssigneeId`, so the previous owner remains visible (AC-FR-5.5) | – | – |

### Feature group 6 — lifecycle

| Req | Data / persistence impact | Design / interface additions | ADR / change / risk additions |
|---|---|---|---|
| FR-6.1 | `req.status` enum of **exactly** Received, Assigned, In Progress, On Hold, Resolved, Closed, Rejected; `hist.fromStatus/toStatus` share the enum | – | Review comment R-07 (code uses different values) |
| FR-6.2 | Transition applied as a version-conditioned update + `hist` insert in one txn; a refused transition writes nothing | DEC-014: `POST /requests/{id}/transitions` (event, not field update); `422` illegal, `412` stale, `428` missing `If-Match` | DEC-014, DEC-015, CR-001 |
| FR-6.4 | `hist.actorRole` recorded on every entry; role verdict computed before any write | DEC-014: `403`/`422` | – |
| FR-6.5 | `req.resolution.{summary, recordedAt, recordedById}` must be non-null before the domain permits → Resolved; set in the same txn as the transition | DEC-014: `422` problem "resolution-required" | – |
| FR-6.6 | `req.closure.{reason, closedAt, closedById}`; the reason also stored as `hist.body`. **`closure.closedAt` starts the NFR-4.2 retention clock** | – | DEC-016, PROC-001 |

### Feature group 7 — work record

| Req | Data / persistence impact | Design / interface additions | ADR / change / risk additions |
|---|---|---|---|
| FR-7.1 | `hist` `changeType:'comment'`, `body`, attribution; append-only (DB-01). Visibility per DEC-012 | DEC-014: `POST /requests/{id}/comments` + `Idempotency-Key` (duplicates on retry impossible) | DEC-014 |
| FR-7.2 | `hist` `changeType:'action'` | as FR-7.1, `/actions` | DEC-014 |
| FR-7.4 | Order by `requestVersion` (monotonic per request, DB-unique) rather than `occurredAt`, so clock skew cannot reorder the timeline | – | – |
| FR-7.5 | `req.resolution` sub-document + `hist` `changeType:'resolution'` in one txn | – | DEC-015 |

### Feature group 8 — management reporting

| Req | Data / persistence impact | Design / interface additions | ADR / change / risk additions |
|---|---|---|---|
| FR-8.1 | `reportingCounts {campusId, categoryId, status, count}` projection (DEC-011 subscriber), rebuildable from `req` by the reconciliation job. Counts sum to the total (AC-FR-8.1) because the rebuild is exact | – | DEC-011; review comment R-17 |
| FR-8.2 | Same projection grouped by `categoryId` | – | – |
| FR-8.3 | `req.dueAt` computed from `categories.targetResolutionHours` at submission; overdue = non-terminal ∧ `dueAt < now` | – | RSK-003 / C-02 (target not agreed) |
| FR-8.4 | `categories.targetResolutionHours`; an amendment recomputes `dueAt` for open requests in that category (batch, audited) | – | OI-02 (unchanged) |
| FR-8.5 | **Aggregation over `req`**, index `{campusId, submittedAt, categoryId}`. Not served by `reportingCounts`, because counters cannot be sliced by an arbitrary date range | – | – |
| FR-8.6 | `reportingCounts` holds no detail fields, so security requests are counted without exposure. Detail excluded at the serialiser | – | CFL-002 |

### Feature group 9 — reference data

| Req | Data / persistence impact | Design / interface additions | ADR / change / risk additions |
|---|---|---|---|
| FR-9.1 | `categories.active` flag; categories are never deleted | – | OI-03 (unchanged) |

### Non-functional rows

| Req | Data / persistence impact | Design / interface additions | ADR / change / risk additions |
|---|---|---|---|
| NFR-1.1 | **No persistence consequence.** Browser compatibility is a client property; the API contract is browser-agnostic JSON | – | – |
| NFR-1.2 | **No persistence consequence.** Viewport/usability is presentation-layer only | – | – |
| NFR-1.3 | **No persistence consequence beyond isolation:** no references to campus-system identifiers; users, categories and locations are held locally (SCP-016) | – | – |
| NFR-1.5 | **DEC-010 closed:** `mongodump` every 12 h to an encrypted institutional server, 7-day retention, weekly restore into the test project with a consistency check. Free cluster: no `--oplog`, so the check reconciles cross-collection skew | – | DEC-010; RSK-018 |
| NFR-1.6 | Health check issues a database `ping` only; reads no collection and no personal data | DEC-014: `GET /api/v1/health` (public, in `PUBLIC_ROUTES`); `503` on DB failure | DEC-014 |
| NFR-2.1 | Submission = one txn of about 4 operations; within the free-cluster 100 ops/s ceiling at CON-010 load | – | RSK-017 |
| NFR-2.2 | All list queries index-backed (FR-4.4/4.5). 10 000 requests ≈ 44 MB, well inside 0.5 GB | – | OI-10 (storage half closed) |
| NFR-2.3 | 12-month aggregation on `{campusId, submittedAt, categoryId}`; anonymised requests remain countable | – | – |
| NFR-2.4 | ~9 ops per transition vs 100 ops/s ceiling ≈ 11 transitions/s sustained. Driver pool ≤ 50 per process against the 500-connection limit | – | RSK-017; DEC-010 upgrade trigger |
| NFR-2.5 | Free cluster: 3-node replica set (node failure = election), but no SLA. App-host SPOF per DEC-003 | – | DEC-003 |
| NFR-3.1 | `users.passwordHash` (`select:false`) holds an argon2id/bcrypt encoded hash only; no reversible credential field exists | – | – |
| NFR-3.3 | Storage-level counterpart to the guard: app DB user `civicconnect-app` cannot update/delete `requestHistory` or `auditLog` | DEC-014: the finite endpoint table is the "every entry point" checklist | DEC-012, DEC-014 |
| NFR-3.4 | Sessions in a MongoDB-backed store with 30-minute idle expiry (TTL on `lastSeenAt`) | – | – |
| NFR-3.5 | Connection URIs only in `/etc/civicconnect/*.env` and CI secrets; `scripts/atlas/` config in the repo contains no credentials | – | DEC-003 |
| NFR-3.6 | Within retention: `hist.actorId/actorRole/occurredAt`. Beyond it: `auditLog` (index `{requestId, occurredAt}`) for 90 days | – | DEC-016 |
| NFR-1.7 | Repositories are the only data-access layer; routes and middleware never import models (asserted in review, to be linted in C's CI) | – | – |
| NFR-4.1 | Field inventory: every personal field is enumerated in `REQUEST_PERSONAL_FIELDS` / `HISTORY_PERSONAL_FIELDS` and mapped to a purpose in DEC-016. `title` removed (no purpose) | – | DEC-016 |
| NFR-4.3 | **No persistence consequence.** The notice is presentation content; no consent record is required for this purpose | – | – |
| NFR-4.4 | As FR-1.5: `securityCategory` snapshot + serialiser field filtering | – | CFL-002, C-01 |
| NFR-4.5 | App-written `auditLog` entries `origin:'access', eventType:'access.read'` when personal detail is served; 90 days | – | DEC-016; RSK-017 (each read adds a write) |

**Count check:** FR rows 42, NFR rows 20; total 62 ✔ (explicit "no persistence consequence": NFR-1.1, 1.2, 1.3, 4.3).

---

## Part B — corrections to already-populated cells

| Req | v0.4 cell | v0.5 cell | Why |
|---|---|---|---|
| **FR-2.6** | "Append-only history; no update or delete path exposed (FR-6.7)" | `req.reference` unique index, `immutable: true`, format `CC-<yyyy>-<seq>`, generated from `counters` inside the create txn | **Wrong content**: the FR-6.7 text was pasted into the unique-reference row |
| **NFR-3.2** | "Encryption at rest for personal information (NFR-3.7)" | No application-level persistence consequence. Atlas enforces TLS on every driver connection; free clusters have no private endpoint, so DB traffic crosses the internet under TLS (residual, DEC-003) | **Wrong content**: at-rest text on the in-transit requirement |
| FR-2.5 | "Audit fields on write: acting user, date, time" | `req.submittedById`, `req.requesterId`, `req.submittedAt` (immutable), plus the `hist` `created` entry | Names the fields |
| FR-5.4 | same generic text | `hist` `assignment` entry: `actorId`, `occurredAt`, `from/toAssigneeId`; `req.lastActorId` for trigger attribution | Names the fields |
| FR-6.3 | same generic text | `hist` `status` entry: `actorId`, `actorRole`, `fromStatus`, `toStatus`, `occurredAt`, `requestVersion` | Names the fields |
| FR-6.7 | "Append-only history; no update or delete path exposed (FR-6.7)" | **DB-01**, three layers: repository interface; schema hooks incl. `bulkWrite`; **Atlas role: app user has find+insert only on `requestHistory`**. The sole exception is PROC-001 (CR-003) | Layer 3 added; `bulkWrite`/native bypass found by probe |
| NFR-1.4 | "Retention rule applies: one month … (DEC-005)" | `auditLog`, purpose B, **≥ 90 days (TTL 92 d)**, minimised content (M-1) | OI-06 resolved by DEC-016 |
| NFR-1.10 | "Multi-document transaction; Atlas replica-set topology required" | Txn encloses `req` + `hist` (+ `counters`); `auditLog` eventually consistent (≤ 60 s) via trigger; notifications/counts after commit | DEC-015; AC changed by CR-001 |
| NFR-1.11 | "Log store and its retention window – see OI-06" | Not stored in MongoDB: structured JSON to journald, 30-day rotation, no personal information (purpose D) | OI-06 closed |
| NFR-4.2 | "Retention rule applies: one month … (DEC-005)" | PROC-001 twice monthly, eligibility ≥ 14 days after `closure.closedAt`, so every request is anonymised within 14–30 days; nulls the listed fields, preserves aggregates | DEC-016, PROC-001, CR-002 |

Also update, without changing meaning: **NFR-1.9** → add "trigger definition held in
`scripts/atlas/app/triggers/`, `full_document:false`, unattributed writes flagged
(`actorSource:'unattributed'`)". **NFR-2.6** → add "CR-004 pending (integrity indexes and
FR-3.x queries)". **NFR-3.7** → add "Atlas at-rest volume encryption; sufficiency against
CON-019 is an open evidence item (DEC-003)".

**Status column:** unchanged in this update. Rows keep *Baselined* / *Proposed*. The
*Baselined – interim value (OI-06)* status on **NFR-1.4** becomes **Baselined – CR-002
pending**.

## Part C — Status summary sheet (v0.5)

| Column | Populated | Outstanding | Owner of outstanding work |
|---|---|---|---|
| Data / persistence impact | **79** | **0** | Complete (Robert). 4 rows are explicit "no persistence consequence" |
| Design / interface decision | + DEC-014/015/016 entries on 18 rows | remainder (DEC-011/012 entries) | Ethan and Robert |
| (others) | unchanged | | |

## Part D — new identifiers introduced by this update

DEC-014, DEC-015, DEC-016 · CR-001 (AC-NFR-1.10), CR-002 (NFR-1.4/1.9/4.2 bases,
AC-NFR-4.2), CR-003 (FR-6.7 basis), CR-004 (NFR-2.6) · PROC-001 · OI-13 · RSK-016, RSK-017,
RSK-018 · DB-01 (data-baseline constraint).
