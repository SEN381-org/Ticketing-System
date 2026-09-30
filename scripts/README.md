# scripts/ — operational scripts and Atlas configuration

Extracted from the controlled documents so the code can be reviewed, diffed and restored
like any other engineering artefact (CON-015: configuration, not console state). The
documents remain the rationale. If a script and its document disagree, fix both in the same PR.

| Path | What it does | Governing document | Run by / where |
|---|---|---|---|
| `backup/civicconnect-backup.sh` | `mongodump` → gzip → GnuPG-encrypt → disk; sha256; prunes archives older than 7 days | DEC-010 (`docs/decisions/ADR/DEC-010_Backup_and_Recovery_v0.1.md`) | cron on the institutional backup server, 02:00 and 14:00 |
| `backup/crontab.example` | The 12-hourly schedule for the dedicated `ccbackup` user | DEC-010 | copy into `crontab -e` |
| `backup/restore-test.sh` | Weekly: verify checksum, decrypt newest archive, restore into the **test** project, run the consistency check (AC-NFR-1.5 evidence) | DEC-010 | backup server, weekly |
| `backup/consistency-check.js` | mongosh: every request's `version` equals its latest `requestHistory.requestVersion` (+1 if anonymised); exits 1 on mismatch | DEC-010, DEC-015 | called by `restore-test.sh`; also recovery step 3 |
| `retention/proc-001-anonymise.js` | mongosh: nulls personal fields of requests closed ≥ 14 days ago, in batched transactions; verifies 0 remaining and unchanged aggregates | PROC-001 (`docs/operations/PROC-001_Manual_Anonymisation_v0.1.md`), DEC-016 | Administrator, twice monthly (1st and 16th), temporary `retention-operator` credential |
| `atlas/app/triggers/auditRequests.json`, `auditHistory.json` | Atlas Database Trigger definitions on `requests` and `requestHistory` (`full_document: false`) | NFR-1.9, DEC-015, DEC-016 (data baseline §3.6) | `appservices push`, one App Services app per environment |
| `atlas/app/functions/writeAuditLog.js`, `config.json` | Trigger function writing minimised, idempotent `auditLog` entries | same | same |

## Usage

```bash
# Backup server (secrets in /etc/civicconnect/backup.env, mode 600: MONGODB_BACKUP_URI, GPG_RECIPIENT)
. /etc/civicconnect/backup.env && scripts/backup/civicconnect-backup.sh
MONGODB_TEST_URI=... scripts/backup/restore-test.sh

# PROC-001: always dry-run first (DRY_RUN defaults to true)
mongosh "$URI" --eval 'var DRY_RUN=true'  --file scripts/retention/proc-001-anonymise.js
mongosh "$URI" --eval 'var DRY_RUN=false' --file scripts/retention/proc-001-anonymise.js

# Atlas triggers: the app skeleton (root config files, data source) comes from
# `appservices pull --remote=<App ID>` for each environment. Copy triggers/ and functions/
# from here into it, then `appservices push`. The database name in the trigger JSON
# ("civicconnect") must match the environment's database.
```

## Not yet verified against a live cluster

The shell scripts were checked with `bash -n`, the JS with `node --check` and the JSON by
parsing. None has been run against Atlas yet. First real runs are DEC-010 evidence item E2
(restore test) and the first PROC-001 run after go-live. The Atlas custom roles
(`civicconnect-app`, `civicconnect-backup`, `civicconnect-retention`) are specified in DEC-003
and data baseline §4 but not yet scripted. That's a forward item: `atlas` CLI
`customDbRoles create`.

No credentials are held in this folder (NFR-3.5).
