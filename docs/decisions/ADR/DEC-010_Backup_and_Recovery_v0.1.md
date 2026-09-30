# DEC-010 — Closed: Atlas free cluster (M0) in production; NFR-1.5 met by a scheduled `mongodump` to a secure institutional server

| Field | Entry |
|---|---|
| **ID** | DEC-010 (deferred 29/09/2026 by E. Lindsay; **closed** here) |
| **Date closed** | 29/09/2026 |
| **Owner** | Robert van der Merwe |
| **Status** | Decided. Two evidence items are dated below; the decision holds only while they hold |
| **Affects** | NFR-1.5, AC-NFR-1.5, CON-003, CON-004, CON-005, CON-007, CON-008, NFR-4.2, DEC-003, DEC-005, OI-10, RSK-008, RSK-017 (new), RSK-018 (new) |

## Decision

1. **Cluster tier:** the free Atlas cluster (M0) for all four environments, one per Atlas
   project (DEC-003).
2. **Recovery point (NFR-1.5, ≤ 24 h):** met by `mongodump` of the production database,
   **scheduled every 12 hours** (02:00 and 14:00 SAST), run by the scheduler on a secure
   institutional server using a read-only Atlas user. Archives are gzip-compressed and
   encrypted to a team public key before they reach disk.
3. **Why 12 h and not 24 h:** with a 24-hour cadence, a single failed run means a gap of
   24 hours or more, which breaches NFR-1.5 on the first failure. At 12 hours the normal
   worst case is about 12 h plus the dump duration, and **one missed run still stays within
   24 h**. The alert on a failed run gives the operator a full cycle to react.
4. **Backup retention:** 7 days rolling (14 archives), bounded because the archives contain
   personal information (DEC-016 purpose C).
5. **Restore verification:** a weekly restore of the newest archive into the `civicconnect-test`
   project, followed by the consistency check below. The log of that restore is the evidence
   for AC-NFR-1.5.

## Rationale

- The three alternatives in the deferment were (a) M0 plus a scheduled dump, (b) the lowest
  paid tier with managed backup, and (c) amend NFR-1.5.
- **(c)** is rejected: 24 h is already modest and nothing suggests the stakeholder would
  accept losing more.
- **(b)** buys a platform capability but adds recurring cost against STK-008 (CON-003) when
  the storage and throughput arithmetic (data baseline §7) shows M0 is sufficient at the M2–M4
  scale.
- **(a)** turns NFR-1.5 into an *operated* control instead of a *platform* control. That costs
  CON-004 effort (a script, a schedule, a weekly check) but no money, and the effort is small
  and scriptable. MongoDB's own free-cluster documentation names `mongodump`/`mongorestore` as
  the alternative to backups.

## Constraints the free cluster imposes on the dump (verified against MongoDB docs)

- `mongodump --oplog` and `mongorestore --oplogReplay` are **not supported** on free
  clusters, and neither are users/roles dumps. **The dump is therefore not a single
  point-in-time snapshot across collections.** A transaction that commits while the dump is
  running can appear in `requestHistory` but not in `requests`, or the reverse.
  - Mitigation: the dump runs at low-activity hours, and **restore always runs the
    consistency check** (for each request, `version == max(requestVersion)` in its history).
    Mismatches are reconciled by rolling the request forward from its last history entry,
    then `reportingCounts` is rebuilt, before return to service.
- Database users and roles are not in the dump. They are re-created from the repository's
  Atlas configuration (`scripts/atlas/`) during recovery.
- The dump counts against the 10 GB/7-day data-transfer allowance. At about 50 MB per dump
  (data baseline §7) × 14 per week, that is roughly 0.7 GB/week, well inside the limit.

## Upgrade trigger (recorded so this is re-opened on evidence, not preference)

Re-open DEC-010 and move production to a paid tier with managed backup if **any** of these
occurs:

- the NFR-2.4 load test at M3 exceeds 70 % of the 100 ops/s free-cluster ceiling;
- storage exceeds 60 % of 0.5 GB;
- two consecutive scheduled dumps fail;
- the institutional server becomes unavailable for more than 72 h;
- the system goes into real production use beyond the educational context (free clusters
  carry no SLA).

## Evidence still required

| # | Evidence | Due | Owner |
|---|---|---|---|
| E1 | Written confirmation from BC IT that an institutional server is available, with encrypted storage, scheduled-task capability and outbound 27017 to Atlas (CON-008) | Before M2 presentation | Robert |
| E2 | First successful restore-test log (restore + consistency check) | M3 | Robert |
| E3 | Cost of the lowest paid tier with managed backup, recorded against the upgrade trigger (CON-003, Master Brief §18) | M3 | Robert |

If E1 fails, the fallback is to run the same script on a team member's machine with
full-disk encryption. That is weaker: it depends on one person and one machine staying
online. Record it as a controlled change to this decision if it is used.

## Operating procedure

### Atlas setup (once per production project)

- Database user `civicconnect-backup`, built-in role **`readAnyDatabase`**, authentication by
  password stored only on the backup server.
- Add the institutional server's public IP to the production project's IP access list.

### Backup script — `scripts/backup/civicconnect-backup.sh` (Linux; held in the repository, secrets excluded)

```bash
#!/usr/bin/env bash
# CivicConnect scheduled backup — DEC-010 / NFR-1.5.
# Runs every 12 h from cron on the institutional backup server. Exits non-zero on any failure
# so the scheduler's mail/alert fires. Never writes an unencrypted archive to disk.
set -euo pipefail
umask 077

: "${MONGODB_BACKUP_URI:?set in /etc/civicconnect/backup.env (mode 600)}"   # mongodb+srv://civicconnect-backup:...@.../civicconnect
: "${BACKUP_DIR:=/srv/civicconnect-backups}"
: "${GPG_RECIPIENT:=civicconnect-backup@team}"                               # public key only on this server
: "${RETENTION_DAYS:=7}"
LOG="${BACKUP_DIR}/backup.log"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/civicconnect-${STAMP}.archive.gz.gpg"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }
trap 'log "FAILED (exit $?) at line $LINENO"; rm -f "${OUT}.partial"' ERR

mkdir -p "$BACKUP_DIR"
log "START dump -> $(basename "$OUT")"

# --oplog is unsupported on free clusters (Atlas docs), so the dump is per-collection consistent only;
# restore runs the consistency check. Stream: dump -> gzip -> encrypt -> disk.
mongodump --uri="$MONGODB_BACKUP_URI" --archive --gzip --quiet \
  | gpg --batch --yes --trust-model always --encrypt --recipient "$GPG_RECIPIENT" \
  > "${OUT}.partial"
mv "${OUT}.partial" "$OUT"
sha256sum "$OUT" > "${OUT}.sha256"

SIZE=$(stat -c %s "$OUT")
[ "$SIZE" -gt 1024 ] || { log "archive suspiciously small (${SIZE} B)"; exit 2; }

# Retention: DEC-016 purpose C — archives contain personal data; keep 7 days only.
find "$BACKUP_DIR" -name 'civicconnect-*.archive.gz.gpg*' -mtime +"$RETENTION_DAYS" -print -delete | sed 's/^/pruned /' >> "$LOG"

log "OK size=${SIZE}B sha256=$(cut -d' ' -f1 "${OUT}.sha256")"
```

`crontab -e` for the dedicated `ccbackup` user:

```cron
MAILTO=robertvdm13@gmail.com
0 2,14 * * *  . /etc/civicconnect/backup.env && /opt/civicconnect/scripts/backup/civicconnect-backup.sh
```

*(Windows-server equivalent: the same pipeline in a `.ps1` run by Task Scheduler at 02:00 and
14:00. Swap `gpg` for the Gpg4win CLI and `find -mtime` for
`Get-ChildItem | Where LastWriteTime -lt (Get-Date).AddDays(-7) | Remove-Item`.)*

### Weekly restore test — `scripts/backup/restore-test.sh` (evidence for AC-NFR-1.5)

```bash
#!/usr/bin/env bash
set -euo pipefail
: "${MONGODB_TEST_URI:?}"          # civicconnect-test project, NOT production
LATEST=$(ls -1t /srv/civicconnect-backups/civicconnect-*.archive.gz.gpg | head -1)
sha256sum -c "${LATEST}.sha256"
gpg --batch --decrypt "$LATEST" \
  | mongorestore --uri="$MONGODB_TEST_URI" --archive --gzip --drop \
      --nsFrom='civicconnect.*' --nsTo='civicconnect_restore.*'
mongosh "$MONGODB_TEST_URI" --quiet --file /opt/civicconnect/scripts/backup/consistency-check.js
```

`consistency-check.js` (exits non-zero on any mismatch):

```js
const d = db.getSiblingDB('civicconnect_restore');
const bad = d.requests.aggregate([
  { $lookup: { from: 'requestHistory', localField: '_id', foreignField: 'requestId', as: 'h',
               pipeline: [{ $group: { _id: null, maxV: { $max: '$requestVersion' } } }] } },
  // PROC-001 bumps version once without a history entry (not a lifecycle event), so expect +1 when anonymised.
  { $project: { version: 1, anonymisedAt: 1,
                expected: { $add: [{ $ifNull: [{ $first: '$h.maxV' }, 0] },
                                   { $cond: [{ $ifNull: ['$anonymisedAt', false] }, 1, 0] }] } } },
  { $match: { $expr: { $ne: ['$version', '$expected'] } } },
]).toArray();
print(`requests=${d.requests.countDocuments()} history=${d.requestHistory.countDocuments()} mismatched=${bad.length}`);
if (bad.length) { printjson(bad.slice(0, 20)); quit(1); }
```

### Recovery (production loss) — outline for the M3 runbook

1. Provision a replacement Atlas project with a free cluster. Re-create the users and the
   trigger app from `scripts/atlas/` (`appservices push`).
2. Decrypt the newest archive (the private key is held offline by two team members) and
   `mongorestore` it.
3. Run `consistency-check.js`, reconcile the mismatches, and rebuild `reportingCounts`.
4. **Run PROC-001** before reopening. The archive may hold records that were anonymised
   after it was taken (DEC-016).
5. Point the production env file at the new URI, restart, check health, and record the
   achieved recovery point (the timestamp of the archive) against NFR-1.5.

## New risks

| ID | Risk | P | I | Band | Mitigation | Owner |
|---|---|---|---|---|---|---|
| RSK-017 | Free-cluster throughput (100 ops/s) or storage limit is reached, degrading NFR-2.1/2.4 | 2 | 2 | Medium (4) | Arithmetic in the data baseline §7; upgrade trigger above; measure in the M3 load test | Robert |
| RSK-018 | Scheduled dump silently stops (server down, credential rotated, key expired), so NFR-1.5 is unmet without anyone knowing | 2 | 3 | High (6) | Non-zero exit + MAILTO alert; 12 h cadence tolerates one miss; weekly restore test; log reviewed at the team sync | Robert |
