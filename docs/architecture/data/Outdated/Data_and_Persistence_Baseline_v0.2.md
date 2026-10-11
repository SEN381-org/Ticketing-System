# CivicConnect — Data and Persistence Baseline

| | |
|---|---|
| **Artefact** | Data and Persistence Baseline (PED §6B — introduced in the working draft PED v1.7 (now `docs/PED/PED/PED_v1.9.md`) toward the v2.0 baseline) |
| **Version** | 0.2 |
| **Author** | Robert van der Merwe (Member B) |
| **Date** | 29 September 2026 |
| **Status** | Approved. Entered the controlled baseline at PED v2.0, through a PR with two non-author approvals (DEC-008). v0.2 changes this header only; the content is v0.1 unchanged |
| **Governs** | `src/models/*`, `src/repositories/*`, the Atlas trigger configuration, the Atlas database-user roles |
| **Decisions applied** | DEC-002, DEC-005, DEC-010 (closed here), DEC-011, DEC-012, DEC-015, DEC-016, DEC-017 |
| **Research referenced** | Assignment 2 §3 (persistence and data integrity) and §4.6 (ETag / idempotency) |

This document is the **authoritative data model**. Where application code disagrees with it,
the code is wrong and is corrected through a PR. Where the model has to change, the change
goes through Master Brief §14 once v2.0 is baselined.

---

## 1. Entities, aggregates and ownership

| Collection | Aggregate / role | Written by (sole writer) | Read by | Lifecycle | Traces to |
|---|---|---|---|---|---|
| `requests` | **Aggregate root** of the request lifecycle | `StatusTransitionService`, `RequestSubmissionService`, `AssignmentService` (all via `requestRepository`), and PROC-001 (retention operator) | Staff/requester views, management aggregation | Created at submission → transitions → Closed/Rejected → **anonymised 14–30 days after closure** (PROC-001) → retained as a non-identifying record for aggregates | FR-2.x, FR-5.x, FR-6.x, SCP-001, SCP-008 |
| `requestHistory` | Child of `requests`, **append-only** | The same services, **only inside the transaction that changes the parent** (DEC-016) | Timeline views, audit retrieval | Inserted, never updated. The only exception is the PROC-001 anonymisation of personal fields | FR-6.3, FR-6.7, FR-7.1–7.4, FR-2.4, AC-FR-6.7 |
| `notifications` | Derived read model | `NotificationSubscriber` (DEC-011, after commit) | Requester | TTL: deleted 30 days after creation | FR-3.4, SCP-004 |
| `reportingCounts` | Derived projection | `ReportingProjectionSubscriber` (DEC-011) plus the reconciliation job | Management dashboard (unfiltered totals only) | Rebuildable at any time from `requests` | FR-8.1, FR-8.2, feature group 8 |
| `auditLog` | Accountability record, **separate purpose** (DEC-017) | Atlas Database Trigger (change events) and the auth service (auth/access events, insert-only) | Administrator, Information Officer | TTL: 92 days (satisfies the 90-day minimum, see §6) | CON-015, NFR-1.4, NFR-1.9, NFR-3.6, NFR-4.5 |
| `users` | Identity | `UserAdministrationService` | Auth, guard | Active → revoked (FR-1.4) | FR-1.1, FR-1.2, FR-1.4, NFR-3.1 |
| `roles` | Reference data: the controlled role set and its permissions | Seed migration only | Guard (DEC-012) | Changed only by migration | FR-1.2, DEC-004, DEC-012 |
| `groups` | User groups with authorisation | `UserAdministrationService` | Guard | Admin-managed | FR-1.6, CON-019 |
| `categories` | Reference data | `CategoryAdministrationService` | Submission, reporting | Deactivated, never deleted (FR-9.2) | FR-2.3, FR-8.4, FR-9.1, FR-9.2 |
| `counters` | Technical: reference sequence | `RequestSubmissionService` (inside the create transaction) | – | Permanent | FR-2.6 |
| `campuses` | Tenancy key for SCP-019 | Seed migration | All | One document at M2 | SCP-019 |

**Relationships.** `requests.requesterId → users`, `requests.categoryId → categories`,
`requests.assigneeId → users`, `requestHistory.requestId → requests` (1:N),
`notifications.requestId → requests`, `users.groupIds → groups`, `users.roles → roles.code`.
Every collection carries `campusId → campuses`.

**Why a document store fits.** The dominant access pattern is "one request plus its
timeline" and "lists of requests filtered by status/category/date". The history is modelled
as a **separate collection, not an embedded array**, for three reasons. (1) An embedded array
is mutated by `$push` on the parent, so append-only could not be enforced by database
privilege (§4, layer 3). (2) Unbounded arrays grow the parent document and every list query
that reads it. (3) The auditLog trigger needs to observe history inserts as discrete events.
The cost is that writing the parent and the child needs a multi-document transaction, which
DEC-016 accepts and which the Atlas replica set supports.

**SCP-019 (multi-campus, deferred).** Every collection carries `campusId`, and every
compound index leads with it. Admitting multi-campus later therefore needs no migration of
existing documents or indexes. It needs only additional `campuses` rows and a guard rule.
That is how this model avoids foreclosing SCP-019, which is the reason the scope baseline
deferred it rather than excluding it.

---

## 2. Reconciliation with the implemented slice (read this first)

The slice merged in PRs #57/#58/#60 was written before this baseline existed. The
differences below are recorded so the diagram, the code and this document can be brought
into agreement. The corrections are listed as review comments in `docs/M2_BACKEND_CORRECTIONS.md`.

| Topic | Code today | Baseline (authoritative) | Why |
|---|---|---|---|
| Status values | Submitted, Acknowledged, In Progress, On Hold, Resolved, Closed | **Received, Assigned, In Progress, On Hold, Resolved, Closed, Rejected** | FR-6.1 / AC-FR-6.1 are baselined with these exact values |
| Roles | Department Staff, Department Head, Administrator, Requester | **Requester, Technician, Coordinator, Manager, Security Officer, Administrator** | FR-1.2 controlled role set |
| Staff scoping | `departmentId` | **`categoryId` + user/group `categoryAuthorisations`** | FR-4.1, FR-4.6, FR-5.2 scope staff by *category authorisation*. No requirement mentions departments |
| Mandatory fields | `title`, `description`, `category` | **`categoryId`, `location`, `description` only** | FR-2.2 / DEC-006: exactly three mandatory fields, no other |
| Reference | none | `reference` unique + immutable | FR-2.6 |
| Concurrency | `versionKey: false`, unconditional update | `version` field, conditional update, ETag | DEC-015 / DEC-016, A2 §3.4 |
| Tenancy | none | `campusId` on every collection | SCP-019 |
| History change types | status, assignment, comment | + action, detail, resolution | FR-7.2, FR-2.4, FR-7.5 all require immutable, attributed entries |
| Collection names | `requests`, `requestHistory`, `notifications`, `reportingCounts`, `auditLog` | **Unchanged** | Answers handover §3.3: the component diagram in PED §10.6 needs no change |

---

## 3. Mongoose schemas (baseline)

Conventions: ES modules (as in the repo), `timestamps` only where the field is not
lifecycle-significant, `strict: 'throw'` so unknown fields are rejected rather than dropped
silently. Every lifecycle timestamp is set explicitly by the service clock.

### 3.1 Shared definitions — `src/models/_shared.js`

```js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/** FR-6.1 / AC-FR-6.1 — exact baselined values. */
export const STATUS = Object.freeze({
  RECEIVED: 'Received', ASSIGNED: 'Assigned', IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold', RESOLVED: 'Resolved', CLOSED: 'Closed', REJECTED: 'Rejected',
});
export const TERMINAL_STATUSES = Object.freeze([STATUS.CLOSED, STATUS.REJECTED]);

/** FR-1.2 — the controlled role set. */
export const ROLE = Object.freeze({
  REQUESTER: 'Requester', TECHNICIAN: 'Technician', COORDINATOR: 'Coordinator',
  MANAGER: 'Manager', SECURITY_OFFICER: 'Security Officer', ADMINISTRATOR: 'Administrator',
});

/** SCP-019 — every collection is campus-scoped from the first document. */
export const campusRef = () => ({
  type: Schema.Types.ObjectId, ref: 'Campus', required: true, immutable: true,
});   // a function, so each schema gets its own definition object

/** Actor recorded on every write so the Atlas trigger can attribute it (CON-015, SCP-008). */
export const lastActor = () => ({
  lastActorId:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
  lastActorRole: { type: String, default: null },
});
```

### 3.2 `requests` — `src/models/Request.js`

```js
import mongoose from 'mongoose';
import { STATUS, campusRef, lastActor } from './_shared.js';
const { Schema } = mongoose;

/** Fields nulled by PROC-001 anonymisation (NFR-4.2). Single list, read by the procedure and by tests. */
export const REQUEST_PERSONAL_FIELDS = Object.freeze([
  'description', 'location', 'requesterId', 'submittedById', 'assigneeId',
  'resolution.summary', 'resolution.recordedById', 'closure.reason', 'closure.closedById',
]);

const notAnonymised = function () { return this.anonymisedAt == null; };

const requestSchema = new Schema(
  {
    campusId:    campusRef(),
    // FR-2.6 — unique, immutable, displayed on submission. Format CC-<yyyy>-<6-digit seq>.
    reference:   { type: String, required: true, immutable: true, match: /^CC-\d{4}-\d{6}$/ },

    // FR-2.2 / DEC-006 — exactly these three are mandatory; nothing else is.
    categoryId:  { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    location:    { type: String, trim: true, maxlength: 200,  required: notAnonymised },
    description: { type: String, trim: true, maxlength: 5000, required: notAnonymised },

    // FR-1.5 / CFL-002 — snapshot of the category's security flag at submission, so a later
    // category change cannot silently widen visibility of an existing security request.
    securityCategory: { type: Boolean, required: true, immutable: true },

    status: { type: String, required: true, enum: Object.values(STATUS), default: STATUS.RECEIVED },

    // FR-2.5 — submitting user, date, time. requesterId is the person the request is for;
    // submittedById differs when a Coordinator captures on a requester's behalf (RSK-001).
    requesterId:   { type: Schema.Types.ObjectId, ref: 'User', default: null, required: notAnonymised },
    submittedById: { type: Schema.Types.ObjectId, ref: 'User', default: null, required: notAnonymised },
    submittedAt:   { type: Date, required: true, immutable: true },

    // FR-5.1 – FR-5.5
    assigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: { type: Date, default: null },

    // FR-6.5 / FR-7.5 — required before Resolved (enforced in the domain, not the schema)
    resolution: {
      summary:      { type: String, maxlength: 2000, default: null },
      recordedAt:   { type: Date, default: null },
      recordedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    // FR-6.6 — close or reject with a recorded reason
    closure: {
      reason:     { type: String, maxlength: 1000, default: null },
      closedAt:   { type: Date, default: null },     // retention clock for NFR-4.2 starts here
      closedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },

    statusChangedAt: { type: Date, required: true },
    dueAt:           { type: Date, default: null },  // FR-8.3; from category target at submission

    // DEC-015 / DEC-016 — optimistic concurrency. Exposed as the ETag. Incremented by every write.
    version: { type: Number, required: true, default: 0, min: 0 },

    // NFR-4.2 / PROC-001
    anonymisedAt: { type: Date, default: null },

    ...lastActor(),
  },
  { collection: 'requests', versionKey: false, strict: 'throw', timestamps: { createdAt: false, updatedAt: 'updatedAt' } },
);

// ---- Indexes: each justified against a named query (NFR-2.6, CON-018). campusId leads (SCP-019).
requestSchema.index({ reference: 1 }, { unique: true });                                   // FR-2.6 invariant; FR-4.3 search by reference
requestSchema.index({ campusId: 1, requesterId: 1, submittedAt: -1 });                     // FR-3.1, FR-3.2 requester's own list
requestSchema.index({ campusId: 1, status: 1, submittedAt: -1 });                          // FR-4.4 filter by status, FR-4.5 sort, FR-8.1
requestSchema.index({ campusId: 1, categoryId: 1, assigneeId: 1, status: 1 });            // FR-4.1 category-authorised list, FR-4.6 unassigned set, FR-8.2
requestSchema.index({ campusId: 1, assigneeId: 1, status: 1 });                            // FR-4.4 filter by assigned user
requestSchema.index({ campusId: 1, submittedAt: 1, categoryId: 1 });                       // FR-4.4 date range, FR-8.5 date range + category
requestSchema.index({ description: 'text', location: 'text' }, { weights: { description: 2 } }); // FR-4.3 description text search
// Deliberately NOT indexed: the PROC-001 eligibility query (runs twice a month; a scan of
// ≤10 000 documents is acceptable, and NFR-2.6 forbids an index without a named FR query).

export default mongoose.models.Request || mongoose.model('Request', requestSchema);
```

**Write rule (enforced in `requestRepository`, not by callers):** every update is
conditional on the version and increments it:

```js
// requestRepository.applyChange — the ONLY update path for requests.
applyChange: (id, expectedVersion, $set, actor, { session }) =>
  Request.updateOne(
    { _id: id, version: expectedVersion, anonymisedAt: null },
    { $set: { ...$set, lastActorId: actor.id, lastActorRole: actor.role }, $inc: { version: 1 } },
    { session, runValidators: true },
  ).then(({ matchedCount }) => {
    if (matchedCount === 0) throw new PreconditionFailedError(id, expectedVersion); // → HTTP 412 (DEC-015)
  }),
```

### 3.3 `requestHistory` — `src/models/RequestHistory.js` (append-only)

```js
import mongoose from 'mongoose';
import { STATUS, campusRef } from './_shared.js';
const { Schema } = mongoose;

export const HISTORY_PERSONAL_FIELDS = Object.freeze(['body', 'actorId', 'fromAssigneeId', 'toAssigneeId']);   // nulled only by PROC-001

const requestHistorySchema = new Schema(
  {
    campusId:  campusRef(),                                                               // SCP-019 (required by this baseline)
    requestId: { type: Schema.Types.ObjectId, ref: 'Request', required: true, immutable: true },

    // The request version this entry PRODUCED. Unique per request, so the database itself
    // refuses two entries claiming the same successor state. That is the storage-level
    // backstop for the lost-update race described in A2 §3.4.
    requestVersion: { type: Number, required: true, min: 1, immutable: true },

    changeType: {
      type: String, required: true, immutable: true,
      enum: ['created', 'status', 'assignment', 'comment', 'action', 'detail', 'resolution'],
      // created: FR-2.1/2.5; status: FR-6.3; assignment: FR-5.4; comment: FR-7.1;
      // action: FR-7.2; detail: FR-2.4; resolution: FR-6.5/FR-7.5
    },
    fromStatus:     { type: String, enum: [...Object.values(STATUS), null], default: null, immutable: true },
    toStatus:       { type: String, enum: [...Object.values(STATUS), null], default: null, immutable: true },
    fromAssigneeId: { type: Schema.Types.ObjectId, ref: 'User', default: null },   // staff identifiers: nulled by PROC-001
    toAssigneeId:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    body:           { type: String, maxlength: 5000, default: null },    // comment/action/detail/reason text

    actorId:    { type: Schema.Types.ObjectId, ref: 'User', default: null }, // required at insert (see pre-validate)
    actorRole:  { type: String, required: true, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },

    // DEC-015 — idempotency. Key + fingerprint of the originating HTTP request.
    idempotencyKey:         { type: String, default: null, immutable: true, maxlength: 64 },
    idempotencyFingerprint: { type: String, default: null, immutable: true },

    anonymisedAt: { type: Date, default: null },                       // PROC-001 only
  },
  { collection: 'requestHistory', versionKey: false, strict: 'throw' },
);

requestHistorySchema.index({ requestId: 1, requestVersion: 1 }, { unique: true });  // FR-3.3, FR-7.4 chronological timeline; integrity invariant
requestHistorySchema.index(                                                          // DEC-015 idempotency invariant
  { actorId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

requestHistorySchema.pre('validate', function requireActorOnInsert(next) {
  if (this.isNew && !this.actorId) return next(new Error('requestHistory: actorId is required at insert'));
  next();
});

// ---- Append-only, application layer (layer 2 of 3 — see §4).
requestHistorySchema.pre('save', function guardResave(next) {
  if (!this.isNew) return next(new Error('AppendOnlyViolation: a requestHistory entry may not be modified'));
  next();
});
const BLOCKED = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace',
                 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'];
for (const op of BLOCKED) {
  requestHistorySchema.pre(op, function guard(next) {
    next(new Error(`AppendOnlyViolation: '${op}' is not permitted on requestHistory`));
  });
}
// Model-level bulkWrite middleware (verified on mongoose 8.24.4). Without it, bulkWrite bypasses every hook above.
requestHistorySchema.pre('bulkWrite', function guardBulk(next, ops) {
  const mutating = (ops ?? []).some((o) => !('insertOne' in o));
  next(mutating ? new Error('AppendOnlyViolation: mutating bulkWrite is not permitted on requestHistory') : undefined);
});

export const BLOCKED_HISTORY_OPERATIONS = Object.freeze([...BLOCKED, 'bulkWrite(non-insert)']);
export default mongoose.models.RequestHistory || mongoose.model('RequestHistory', requestHistorySchema);
```

### 3.4 `notifications` — `src/models/Notification.js`

```js
const notificationSchema = new Schema(
  {
    campusId:  campusRef(),
    userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestId: { type: Schema.Types.ObjectId, ref: 'Request', required: true },
    requestReference: { type: String, required: true },          // FR-3.4 "identifying the request"
    kind:      { type: String, required: true, enum: ['accepted', 'rejected', 'updated', 'completed'] },
    // FR-3.5 — the status AS THE REQUESTER MAY SEE IT. For a security-category request this is
    // mapped to Received / In Progress / Closed before storage, never the internal value.
    displayStatus: { type: String, required: true },
    sourceHistoryId: { type: Schema.Types.ObjectId, ref: 'RequestHistory', required: true },
    read:      { type: Boolean, default: false },
    createdAt: { type: Date, required: true },
  },
  { collection: 'notifications', versionKey: false, strict: 'throw' },
);
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });                        // FR-3.4 "available on next session"
notificationSchema.index({ sourceHistoryId: 1, userId: 1 }, { unique: true });           // subscriber idempotency (DEC-011 at-least-once)
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 3600 });      // derived copy; see DEC-017 purpose A
```

### 3.5 `reportingCounts` — `src/models/ReportingCount.js`

```js
const reportingCountSchema = new Schema(
  {
    campusId:   campusRef(),
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    status:     { type: String, required: true, enum: Object.values(STATUS) },
    count:      { type: Number, required: true, default: 0, min: 0 },
    reconciledAt: { type: Date, default: null },      // last full rebuild from `requests`
  },
  { collection: 'reportingCounts', versionKey: false, strict: 'throw' },
);
reportingCountSchema.index({ campusId: 1, categoryId: 1, status: 1 }, { unique: true }); // FR-8.1, FR-8.2
```

`reportingCounts` is a **projection** and has no authority of its own. It serves the
unfiltered dashboard (FR-8.1, FR-8.2). Filtered views (FR-8.5, date range + category) are
aggregation queries over `requests` using the `{campusId, submittedAt, categoryId}` index,
because pre-computed counters cannot be sliced by an arbitrary date range. Subscriber
failures are contained under DEC-011, so counters can drift. A reconciliation job rebuilds
them from `requests` (`$group` by campusId/categoryId/status). That rebuild is exact, even
after anonymisation, because anonymisation keeps category and status.

### 3.6 `auditLog` — `src/models/AuditLog.js` (read model; written below the application)

```js
const auditLogSchema = new Schema(
  {
    eventId:    { type: String, required: true },   // change-event _id._data, or UUID for auth/access events
    origin:     { type: String, required: true, enum: ['trigger', 'auth', 'access'] },
    eventType:  { type: String, required: true },   // e.g. 'requests.update', 'requestHistory.insert', 'auth.failure', 'access.read'
    campusId:   { type: Schema.Types.ObjectId, default: null },
    collectionName: { type: String, default: null },
    documentId: { type: Schema.Types.ObjectId, default: null },
    requestId:  { type: Schema.Types.ObjectId, default: null },
    // Attribution. Taken from lastActorId on requests / actorId on requestHistory. A write
    // that bypasses the application leaves this stale or null, so actorSource='unattributed'
    // is itself the evidence AC-NFR-1.9 looks for.
    actorId:     { type: Schema.Types.ObjectId, default: null },
    actorRole:   { type: String, default: null },
    actorSource: { type: String, enum: ['document', 'unattributed', 'session'], required: true },
    // DATA MINIMISATION (DEC-017): field NAMES only, plus status values. Never description,
    // location, comment body or any other free text. No fullDocument copies.
    changedFields: { type: [String], default: [] },
    fromStatus: { type: String, default: null },
    toStatus:   { type: String, default: null },
    outcome:    { type: String, default: null },    // auth events: 'success' | 'failure'
    occurredAt: { type: Date, required: true },     // cluster time of the change
    recordedAt: { type: Date, required: true },     // time the trigger wrote it (lag = recordedAt - occurredAt)
  },
  { collection: 'auditLog', versionKey: false, strict: 'throw' },
);
auditLogSchema.index({ eventId: 1 }, { unique: true });                                 // trigger is at-least-once → idempotent insert
auditLogSchema.index({ requestId: 1, occurredAt: 1 });                                   // NFR-3.6 audit retrieval, NFR-4.5 access record
auditLogSchema.index({ recordedAt: 1 }, { expireAfterSeconds: 92 * 24 * 3600 });         // NFR-1.4 ≥ 90 days (DEC-017)
```

**Trigger definition (held in the repository, not console state — handover §2).**
`scripts/atlas/app/triggers/auditRequests.json` (deployed with `appservices push`, one app per
environment):

```json
{
  "type": "DATABASE",
  "name": "auditRequests",
  "function_name": "writeAuditLog",
  "config": {
    "service_name": "mongodb-atlas",
    "database": "civicconnect",
    "collection": "requests",
    "operation_types": ["INSERT", "UPDATE", "REPLACE", "DELETE"],
    "full_document": false,
    "full_document_before_change": false,
    "unordered": false,
    "skip_catchup_events": false,
    "match": {}
  },
  "disabled": false
}
```

A second trigger, `auditHistory`, has the same shape on `requestHistory`. The Atlas trigger
config file binds one collection per trigger, which is why there are two.
`scripts/atlas/app/functions/writeAuditLog.js`:

```js
exports = async function (event) {
  const audit = context.services.get('mongodb-atlas').db('civicconnect').collection('auditLog');
  const upd = event.updateDescription?.updatedFields ?? {};
  const doc = event.fullDocument ?? {};                     // inserts only (history carries actorId)
  const actorId = upd.lastActorId ?? doc.actorId ?? null;
  try {
    await audit.insertOne({
      eventId: event._id._data,
      origin: 'trigger',
      eventType: `${event.ns.coll}.${event.operationType}`,
      campusId: doc.campusId ?? null,
      collectionName: event.ns.coll,
      documentId: event.documentKey._id,
      requestId: event.ns.coll === 'requests' ? event.documentKey._id : (doc.requestId ?? null),
      actorId,
      actorRole: upd.lastActorRole ?? doc.actorRole ?? null,
      actorSource: actorId ? 'document' : 'unattributed',
      changedFields: Object.keys(upd).concat(event.updateDescription?.removedFields ?? []),
      fromStatus: doc.fromStatus ?? null,
      toStatus: upd.status ?? doc.toStatus ?? null,
      occurredAt: event.clusterTime ? new Date(event.clusterTime.getHighBits() * 1000) : new Date(),
      recordedAt: new Date(),
    });
  } catch (e) {
    if (e.code !== 11000) throw e;                            // duplicate eventId = redelivery: already recorded
  }
};
```

`full_document` is **false** on `requests` so that no description or location ever passes
through the audit path (DEC-017 minimisation). History inserts arrive with the inserted
document by definition. The function copies only the listed fields and never `body`.

### 3.7 `users`, `roles`, `groups` — `src/models/User.js`, `Role.js`, `Group.js`

```js
// Role.js — FR-1.2. Seeded by migration from the single rule set in src/middleware/authorise.js
// (DEC-012 "one documented rule set"); the collection is the runtime copy groups can reference.
const roleSchema = new Schema({
  code:        { type: String, required: true, enum: Object.values(ROLE) },
  permissions: { type: [String], required: true },   // operation keys, e.g. 'request:transition'
}, { collection: 'roles', versionKey: false, strict: 'throw' });
roleSchema.index({ code: 1 }, { unique: true });

// Group.js — FR-1.6 / CON-019 user grouping
const groupSchema = new Schema({
  campusId:    campusRef(),
  name:        { type: String, required: true, maxlength: 100 },
  permissions: { type: [String], default: [] },
  categoryAuthorisations: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
  active:      { type: Boolean, default: true },
}, { collection: 'groups', versionKey: false, strict: 'throw', timestamps: true });
groupSchema.index({ campusId: 1, name: 1 }, { unique: true });

// User.js
const userSchema = new Schema({
  campusId:     campusRef(),
  email:        { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  displayName:  { type: String, required: true, maxlength: 100 },
  passwordHash: { type: String, required: true, select: false },  // NFR-3.1: argon2id/bcrypt encoded hash only
  roles: {                                                                           // FR-1.2, AC-FR-1.2
    type: [{ type: String, enum: Object.values(ROLE) }],   // enum applies per element
    validate: { validator: (v) => Array.isArray(v) && v.length >= 1, message: 'A role is required' },
  },
  groupIds:     [{ type: Schema.Types.ObjectId, ref: 'Group' }],                  // FR-1.6
  categoryAuthorisations: [{ type: Schema.Types.ObjectId, ref: 'Category' }],     // FR-4.6, FR-5.2
  status:       { type: String, enum: ['active', 'revoked'], default: 'active' }, // FR-1.4
  revokedAt:    { type: Date, default: null },
  // FR-1.4 "existing sessions are terminated": sessions carry this value; revocation increments it.
  // Sessions live in a MongoDB-backed store, never in process memory (NFR-2.7).
  sessionEpoch: { type: Number, default: 0 },
}, { collection: 'users', versionKey: false, strict: 'throw', timestamps: true });
userSchema.index({ email: 1 }, { unique: true });                                  // FR-1.1 unique individual account
```

Effective permissions = union(role permissions, group permissions). Effective category
authorisation = union(user, groups). Both are resolved by the guard (DEC-012) from this data.
`OPERATION_RULES` in code remains the single source that the seed migration writes.

### 3.8 `categories`, `counters`, `campuses` (supporting)

```js
const categorySchema = new Schema({
  campusId: campusRef(),
  code:     { type: String, required: true, maxlength: 40 },
  name:     { type: String, required: true, maxlength: 100 },
  isSecurity: { type: Boolean, default: false },              // CFL-002 → FR-1.5, FR-3.5, FR-8.6
  targetResolutionHours: { type: Number, min: 1, default: null }, // FR-8.3/FR-8.4 (FR-8.4 Proposed, OI-02)
  active:   { type: Boolean, default: true },                 // FR-9.1 deactivate, never delete (FR-9.2)
}, { collection: 'categories', versionKey: false, strict: 'throw', timestamps: true });
categorySchema.index({ campusId: 1, code: 1 }, { unique: true });

// counters: { _id: 'request-ref:<campusId>:<yyyy>', seq: Number } — $inc inside the create transaction (FR-2.6)
// campuses: { _id, code, name } — one row at M2 (SCP-019)
```

---

## 4. Append-only enforcement of `requestHistory` (the constraint stated in the baseline, not only in code)

**Baseline constraint DB-01.** *A `requestHistory` entry, once committed, is never updated,
replaced or deleted by any application path or any application database user. The single
sanctioned mutation is the PROC-001 anonymisation of `body` and `actorId` for requests past
their retention period. It is performed by a separate, time-limited database user and
recorded in `auditLog`.*

| Layer | Mechanism | What it stops | What it does not stop |
|---|---|---|---|
| 1. Interface | `historyRepository` exposes `append(entry, {session})` and `listForRequest(requestId)` only | Callers inside the app reaching for an update | Code that imports the model directly |
| 2. Schema | Query, document **and `bulkWrite`** middleware refuse every mutation (§3.3) | Any Mongoose mutation path | `Model.collection.*` (native driver), mongosh, other clients. **Verified by probe on 29/09/2026:** before the `bulkWrite` hook was added, `bulkWrite` and `collection.updateOne` both bypassed the guard |
| 3. Database privilege | Atlas custom role `civicconnect-app`: on `requestHistory` only `find` and `insert`; on `auditLog` only `find` and `insert` | **Everything** issued with the application's credentials, including native-driver calls and a compromised app process | A holder of a different credential. Hence PROC-001's operator user is temporary (Atlas temporary DB user, expires) and every change it makes is audited |

This is the A2 §3.7 recommendation ("revoked UPDATE and DELETE privileges on the history
table, so that immutability is enforced by permission") applied to Atlas. Layer 3 is what
makes AC-FR-6.7 a property of the data rather than of the code. **Database-level
verification (attempting an update with the app credential and asserting
`Unauthorized`) needs a test cluster and is M3 work**, as recorded in PED §7.5.

---

## 5. Transaction boundary, concurrency and consistency (summary; full record in DEC-016)

| Write | Inside the multi-document transaction | Consistency |
|---|---|---|
| `requests` update (status/assignment/resolution/closure fields, `version` +1) | **Yes** | Atomic with history |
| `requestHistory` insert (`requestVersion` = new version) | **Yes** | Atomic with request |
| `counters` `$inc` (create only) | **Yes** | Atomic |
| `notifications`, `reportingCounts` | No: DEC-011 subscribers, published **after commit** | Eventually consistent; idempotent; reconcilable |
| `auditLog` | No: Atlas trigger via change stream, **after commit** | Eventually consistent, target lag ≤ 60 s. Aborted transactions emit no change events, so a partial state can never be audited |

- Transaction options: `readConcern: 'snapshot'`, `writeConcern: { w: 'majority' }`,
  `readPreference: 'primary'`, run with `session.withTransaction()`. It retries
  `TransientTransactionError` / `UnknownTransactionCommitResult` automatically, **so the
  callback must be free of side effects**: nothing is published inside it.
- **Isolation decision (A2 §3.4 required it to be recorded, not inherited):** MongoDB
  transactions give snapshot isolation. On top of that, every request update is conditional
  on `version` (§3.2), and `requestHistory` has a unique `{requestId, requestVersion}`
  index. A lost update is therefore refused twice: by the conditional update (→ 412) and by
  the unique index (→ abort).
- **ETag:** `ETag: "v<version>"` (strong; RFC 9110 §13.1.1 requires strong comparison for
  `If-Match`). The ETag validates the request's *state version*. DEC-012 field-level
  filtering varies the representation by viewer, but the state it describes is the same.

---

## 6. Retention and lifecycle (DEC-017 resolves OI-06)

| Data | Purpose | Retention | Mechanism |
|---|---|---|---|
| Personal fields of `requests` + `requestHistory` (`REQUEST_PERSONAL_FIELDS`, `HISTORY_PERSONAL_FIELDS`) | A: service-request handling | ≤ 30 days from `closure.closedAt` (NFR-4.2, DEC-005: "one month" measured as 30 days) | **PROC-001** manual anonymisation, twice monthly, eligibility = closed ≥ 14 days before the run. SCP-020 (automation) remains deferred |
| Non-identifying remainder of `requests`/`requestHistory` (category, status, timestamps, roles, campus) | Aggregated statistics (FR-8.x, FR-9.2, CFL-004) | Indefinite | Nulling rather than deleting preserves every aggregate |
| `notifications` | A (derived copy) | 30 days from creation | TTL index |
| `auditLog` | B: accountability and security (POPIA s.14(1)(b), related lawful purpose) | ≥ 90 days (TTL 92 days, so AC-NFR-1.4's day-90 query always finds the entry despite TTL-monitor lag) | TTL index. Content minimised: identifiers, field names, status values only |
| Backups (`mongodump` archives) | C: recovery (NFR-1.5) | 7 days rolling | DEC-010 script prunes. Restore re-runs PROC-001 before return to service |
| Performance logs (NFR-1.11) | D: operations. No personal information by requirement | 30 days | Log rotation on the host (DEC-003) |

TTL indexes on `notifications` and `auditLog` are **not** SCP-020. SCP-020 is automated
enforcement of the *personal-data retention rule on request data*. That needs field-level
anonymisation conditioned on closure, plus evidence that it ran, and a TTL index can only
delete whole documents by age. See DEC-017 for the argument.

---

## 7. Scalability, SPOF, availability and backup (architectural level)

**Storage arithmetic (closes the storage half of OI-10).** Estimates are per request,
compressed on-disk order of magnitude; they must be measured with `db.stats()` at M3.

| Item | Per request | Basis |
|---|---|---|
| `requests` document + index share | ~2.0 KB | ~0.6 KB typical description, fixed fields, 7 indexes |
| `requestHistory` (≈ 6 entries × 0.4 KB) | ~2.4 KB | created, assigned, 2–3 status changes, 1–2 comments |
| `auditLog` (≈ 8 events × 0.35 KB), 90-day window only | ~2.8 KB transient | minimised content |
| `notifications` (≈ 4 × 0.3 KB), 30-day window only | ~1.2 KB transient | |

At the NFR-2.2 figure of 10 000 requests/year, persistent growth is about **44 MB/year**,
plus about 9 MB transient (audit and notifications for roughly 2 500 requests in the window).
That is **under 11 % of the 0.5 GB M0 limit after one year**, and the anonymised remainder
shrinks further. Storage does not bind at M0. Each environment runs in its own Atlas project
with its own M0 (DEC-003), so the four CON-016 environments do not share the 0.5 GB.

**Throughput is the binding M0 limit (100 ops/s).** A status transition costs about 9
operations: read, conditional update, history insert and commit inside the transaction; a
notification insert and a counts upsert from the subscribers; and two trigger reads/writes
into `auditLog`. That caps sustained transitions at about 11/s. NFR-2.4 (100 concurrent
users, mostly reads, ~10 s think time) needs about 20–40 ops/s, which fits. The CON-010
reasoning toward 1 000 users does not fit on M0. This is recorded as the upgrade trigger in
DEC-010 and as RSK-019.

**SPOFs.** The Atlas M0 cluster is a 3-node replica set, so a single node failure causes an
election, not an outage. The M0 *service* has no SLA and is shared, which is an accepted
risk. The Hostinger VPS is a single application host and is an accepted SPOF at this scale
(DEC-003). The institutional backup server is a SPOF **for recovery only**: its loss does
not stop the service, but it removes the NFR-1.5 capability until it is restored.

**Backup / recovery.** DEC-010 (closed): `mongodump` every 12 hours to the institutional
server, encrypted, 7-day retention, weekly restore test. M0 does not support `--oplog`, so a
dump is not point-in-time consistent across collections. The restore procedure therefore
runs a consistency check (for every request, `version == max(requestHistory.requestVersion)`)
and rebuilds `reportingCounts` before service resumes.
