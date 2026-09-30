# PROC-001 — Manual anonymisation of closed requests (interim control for NFR-4.2; SCP-020 remains deferred)

| Field | Entry |
|---|---|
| **ID** | PROC-001 (new; controlled procedure, referenced from SCP-020, NFR-4.2, DEC-017) |
| **Version** | 0.1 |
| **Owner** | Robert van der Merwe. **Executed by** an Administrator; a second team member witnesses and signs the run record |
| **Frequency** | **Twice monthly**, on the 1st and the 16th (or the next working day) |
| **Status** | Proposed; effective on approval, first run due on the first 1st/16th after the production go-live |

## 1. Why a manual procedure, and why SCP-020 stays deferred

SCP-020 (automated enforcement) is a capability distinct from the rule. It needs a
scheduler inside the system, an owner for failures of that scheduler, and evidence that
deletion occurred. The scope baseline v0.3 already records the interim position: *"the
constraint is met in the interim by a recorded manual procedure: identifiable data older than
one month is removed on a stated schedule by a named owner, and each removal is recorded."*
This document **is** that procedure. CON-007 requires that personal information is not
retained longer than necessary. It does not require the removal to be automated.

An unenforced requirement in the baseline is worse than a deferred capability with a stated
workaround (handover §4.2). PROC-001 takes NFR-4.2 from "stated" to "enforced by procedure".

## 2. The schedule arithmetic (read before changing the frequency)

A periodic procedure can only guarantee a maximum retention R if records become eligible
early enough that the *next* run always falls inside R:

> **eligibility age = R − (longest gap between runs)**

- R = 30 days (DEC-017).
- Runs on the 1st and 16th: the longest gap is 16 days (16th → 1st of a 31-day month).
- **Eligibility: closed at least 14 days before the run date.**
- Result: every closed request is anonymised between **14 and 30 days** after closure. It is
  never later than 30.

> ⚠ **If "bi-monthly" was intended as *every two months*, NFR-4.2 cannot be met by this
> procedure.** A 61-day gap exceeds R on its own, so identifiable data would survive up to
> about 91 days. The twice-monthly reading is the only one compatible with the 30-day rule.
> A weekly run (eligibility ≥ 23 days) would give staff a longer reconciliation window
> (23–30 days) at the cost of about twice the operator effort. That is a team choice to make
> explicitly, not by default.

## 3. What is nulled, and what survives

| Collection | Nulled (personal, purpose A) | Kept (non-identifying, aggregates) |
|---|---|---|
| `requests` | `description`, `location`, `requesterId`, `submittedById`, `assigneeId`, `resolution.summary`, `resolution.recordedById`, `closure.reason`, `closure.closedById` (the single list `REQUEST_PERSONAL_FIELDS`) | `_id`, `reference`, `campusId`, `categoryId`, `securityCategory`, `status`, `submittedAt`, `assignedAt`, `statusChangedAt`, `closure.closedAt`, `dueAt`, `version` (+1), `anonymisedAt` |
| `requestHistory` | `body`, `actorId`, `fromAssigneeId`, `toAssigneeId` (`HISTORY_PERSONAL_FIELDS`) | `changeType`, `fromStatus`, `toStatus`, `actorRole`, `occurredAt`, `requestVersion`, `idempotencyKey` |
| `notifications` | whole documents deleted (normally already removed by the 30-day TTL) | – |
| `auditLog` | untouched: purpose B, 90 days, contains no purpose-A values (DEC-017 M-1) | – |

Nulling, not deleting, keeps FR-8.1/8.2/8.5 counts, overdue history (FR-8.3) and
category retention (FR-9.2) intact. That is what AC-NFR-4.2 v0.3 checks.
`fromAssigneeId`/`toAssigneeId` on assignment history entries are **also** staff identifiers
and are nulled with `actorId`. The run script covers them.

## 4. Preconditions (stop if any fails)

1. The last scheduled backup (DEC-010) completed within the last 12 h. Check `backup.log`.
2. A witness (a second team member) is present or on a call and has the run record open.
3. Create a **temporary** Atlas database user `retention-operator-<yyyymmdd>` with the custom
   role `civicconnect-retention` (`find`, `update` on `requests` and `requestHistory`; `find`,
   `remove` on `notifications`) and **expiry set to 6 hours** (Atlas temporary user). This
   credential is the *only* one able to update `requestHistory` (data baseline §4, layer 3).
4. Connect from an IP on the production access list (the VPS, over SSH).

## 5. Steps

1. **Dry run.** `mongosh "$URI" --file scripts/retention/proc-001-anonymise.js --eval 'var DRY_RUN=true'`
   prints the cutoff, the number of eligible requests, and the FR-8.1/8.2 counts *before*.
   The witness records all three.
2. **Execute.** Run the same command with `DRY_RUN=false`. Each batch of ≤ 100 requests is
   anonymised in one transaction: requests, their history and their notifications change
   together or not at all.
3. **Verify.** The script re-runs the eligibility query (expects 0 remaining) and recomputes
   the counts (expects them identical to the dry run). Any mismatch exits non-zero: **stop
   and escalate**. Do not re-run blindly.
4. **Delete** the temporary Atlas user, even though it would expire anyway.
5. **Record** the run in `docs/operations/retention-runs.md` (template below) through a PR.
   The Atlas trigger has independently written one `auditLog` entry per changed document,
   with `changedFields` listing the nulled fields. That is the machine evidence that the
   removal happened, and it is inspected at review.

## 6. Script — `scripts/retention/proc-001-anonymise.js` (mongosh)

```js
// PROC-001 — anonymise requests closed >= 14 days ago. NFR-4.2, DEC-017. Run via mongosh.
// Usage: mongosh "$URI" --eval 'var DRY_RUN=true' --file scripts/retention/proc-001-anonymise.js
const DRY = (typeof DRY_RUN === 'undefined') ? true : DRY_RUN;   // safe default
const ELIGIBILITY_DAYS = 14;                                      // = 30 - longest run gap (16); see §2
const BATCH = 100;
const d = db.getSiblingDB('civicconnect');
const now = new Date();
const cutoff = new Date(now.getTime() - ELIGIBILITY_DAYS * 86400000);
const eligible = { 'closure.closedAt': { $ne: null, $lte: cutoff }, anonymisedAt: null,
                   status: { $in: ['Closed', 'Rejected'] } };

const counts = () => d.requests.aggregate([
  { $group: { _id: { c: '$categoryId', s: '$status' }, n: { $sum: 1 } } }, { $sort: { _id: 1 } },
]).toArray();

const before = counts();
const total = d.requests.countDocuments(eligible);
print(`PROC-001 run ${now.toISOString()} cutoff=${cutoff.toISOString()} eligible=${total} dryRun=${DRY}`);
if (DRY) { printjson(before); quit(0); }

const reqUnset = {
  description: null, location: null, requesterId: null, submittedById: null, assigneeId: null,
  'resolution.summary': null, 'resolution.recordedById': null,
  'closure.reason': null, 'closure.closedById': null,
};
let done = 0;
while (true) {
  const ids = d.requests.find(eligible, { _id: 1 }).limit(BATCH).toArray().map((r) => r._id);
  if (ids.length === 0) break;
  const session = db.getMongo().startSession();
  try {
    session.withTransaction(() => {
      const s = session.getDatabase('civicconnect');
      s.requests.updateMany({ _id: { $in: ids }, anonymisedAt: null }, {
        $set: { ...reqUnset, anonymisedAt: now, lastActorId: null, lastActorRole: 'PROC-001' },
        $inc: { version: 1 },
      });
      s.requestHistory.updateMany({ requestId: { $in: ids }, anonymisedAt: null },
        { $set: { body: null, actorId: null, fromAssigneeId: null, toAssigneeId: null, anonymisedAt: now } });
      s.notifications.deleteMany({ requestId: { $in: ids } });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally { session.endSession(); }
  done += ids.length;
  print(`  anonymised ${done}/${total}`);
}

const remaining = d.requests.countDocuments(eligible);
const after = counts();
const same = JSON.stringify(before) === JSON.stringify(after);
print(`done=${done} remaining=${remaining} aggregatesUnchanged=${same}`);
if (remaining !== 0 || !same) { print('VERIFICATION FAILED — stop and escalate'); quit(1); }
```

Note: `requests` receives `$inc: { version: 1 }` **without** a new history entry. That is
deliberate: the anonymisation is not a lifecycle event. The DEC-010 consistency check
therefore expects `version == maxRequestVersion + 1` for documents with `anonymisedAt` set.
The check in `docs/decisions/ADR/DEC-010_Backup_and_Recovery_v0.1.md` already does this.

## 7. Run record template — `docs/operations/retention-runs.md`

| Run date | Operator | Witness | Cutoff | Eligible (dry) | Anonymised | Remaining | Aggregates unchanged | Temp user deleted | auditLog entries checked | PR |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | Y/N | Y/N | Y/N | # |

## 8. Failure and exception handling

- **Missed run:** run at the next opportunity with the same 14-day eligibility. Any request
  that has passed 30 days is a **breach of NFR-4.2**. Record it in the run log with a count
  and raise it at the team sync. Never back-date.
- **Restore from backup:** run PROC-001 before return to service (DEC-010 recovery step 4).
- **Legal hold / active dispute** on a specific request: not supported in v0.1. Raise with
  STK-009 if it arises, as a change to this procedure, not an ad-hoc skip.

## CR-003 — FR-6.7 and AC-FR-6.7 vs NFR-4.2 (raises OI-13)

| Field | Entry |
|---|---|
| Change ID | CR-003 |
| Conflict | FR-6.7: *"prevent any user, including an Administrator, from altering or deleting a recorded status transition, assignment or comment entry."* NFR-4.2 requires identifiable data, which includes comment text and actor identity on those entries, to be gone 30 days after closure. Taken literally, both cannot hold after day 30 |
| Requested change | FR-6.7 text unchanged. Add to its measurement basis: *"Immutability applies to every interface the system provides and to every application database credential. The removal of personal fields at the end of the retention period under PROC-001 (NFR-4.2, DEC-017) is not an alteration of the record's lifecycle content: status values, change types, roles, timestamps and sequence are preserved. It is executed only by a temporary, audited database credential outside the system's interfaces."* AC-FR-6.7 unchanged; it already says "through any interface the system provides" |
| Reason | Makes the one sanctioned exception explicit and bounded, rather than leaving two baselined requirements in silent contradiction |
| Requirements affected | FR-6.7 (basis only), NFR-4.2 |
| Security | The exception is narrow (two fields, eligible records only), time-limited (6 h credential), witnessed and audited |
| Recommendation | **ACCEPT**. Record OI-13 as open until this CR is approved |
