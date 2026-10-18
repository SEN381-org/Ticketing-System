# scripts/ — operational scripts and Atlas configuration

Extracted from the controlled documents so the code can be reviewed, diffed and restored
like any other engineering artefact (CON-015: configuration, not console state). The
documents remain the rationale. If a script and its document disagree, fix both in the same PR.

| Path | What it does | Governing document | Run by / where |
|---|---|---|---|
| `backup/civicconnect-backup.sh` | `mongodump` → gzip → GnuPG-encrypt → disk; sha256; prunes archives older than 7 days | DEC-010 (`docs/decisions/ADR/DEC-010_Backup_and_Recovery_v0.1.md`) | cron on the institutional backup server, 02:00 and 14:00 |
| `backup/crontab.example` | The 12-hourly schedule for the dedicated `ccbackup` user | DEC-010 | copy into `crontab -e` |
| `backup/restore-test.sh` | Weekly: verify checksum, decrypt newest archive, restore into the **test** project, run the consistency check (AC-NFR-1.5 evidence) | DEC-010 | backup server, weekly |
| `backup/consistency-check.js` | mongosh: every request's `version` equals its latest `requestHistory.requestVersion` (+1 if anonymised); exits 1 on mismatch | DEC-010, DEC-016 | called by `restore-test.sh`; also recovery step 3 |
| `retention/proc-001-anonymise.js` | mongosh: nulls personal fields of requests closed ≥ 14 days ago, in batched transactions; verifies 0 remaining and unchanged aggregates | PROC-001 (`docs/operations/PROC-001_Manual_Anonymisation_v0.1.md`), DEC-017 | Administrator, twice monthly (1st and 16th), temporary `retention-operator` credential |
| `atlas/app/triggers/auditRequests.json`, `auditHistory.json` | Atlas Database Trigger definitions on `requests` and `requestHistory` (`full_document: false`) | NFR-1.9, DEC-016, DEC-017 (data baseline §3.6) | `appservices push`, one App Services app per environment |
| `atlas/app/functions/writeAuditLog.js`, `config.json` | Trigger function writing minimised, idempotent `auditLog` entries | same | same |
| `ci/extract-office-documents.sh` | Unzips every committed version of every `.xlsx`/`.docx`/`.pptx` into a temp directory (plus `MANIFEST.txt` mapping blobs to paths) so Gitleaks can scan text it otherwise skips as binary | NFR-3.5 | CI secret-scan job; locally: `scripts/ci/extract-office-documents.sh . /tmp/office && gitleaks detect --no-git --source /tmp/office` |
| `verify_layer3_role.js` | Node, native driver: with the application credential, attempts an update and a delete on `requestHistory` and on `auditLog` and expects the database to refuse all four; `find` on each and a write on `sessions` are the controls. Writes `docs/evidence/DB-01_layer3_verification.txt`; exits 1 if not verified | DB-01 v0.3 §4, DEC-003 v0.2 (FR-6.7, NFR-1.4) | Robert, against the **test** cluster, after the `civicconnect-app` role is created or changed: `node --env-file=.env.test scripts/verify_layer3_role.js` |
| `atlas/provision-indexes.js` (with `atlas/indexComparison.js`, `atlas/declaredIndexes.js`, `lib/clusterMarkers.js`) | Node, Mongoose models and native driver: after a host, database and privilege self-check, creates the indexes the models declare (`createIndexes` only) and compares them with `listIndexes`; classifies each PRESENT, DIFFERENT or MISSING, fails on any UNDECLARED index; never reads or writes a document and never drops, modifies or renames. `--check-only` lists and compares without creating; `--list-declared` prints the declared indexes with no connection. Exit 0 pass, 1 comparison failed, 2 never reached the comparison. Layer: PED v2.0 section 6A.5 places versioned migration scripts in the data-access layer; this is an operational entry point at that layer, importing the models directly, with precedent in `admin/create-user.js` and `tests/integration/_harness.js`. The CI layer check covers `src/routes` and `src/middleware` only | TD-004, DEC-003 v0.3 deployment step 5, DEF-014, DEF-015, DEF-017 | Project owner, per environment, with the temporary `civicconnect-temp-provisioner` credential: `node --env-file=.env.provision.test scripts/atlas/provision-indexes.js --env test`. The test and staging host markers are recorded in DEC-003 v0.4 and `lib/clusterMarkers.js` (staging since PR #103, run on staging in PR #111); production has no marker, so it is refused until DEC-003 records one |

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

## What has been verified against a live cluster

**Verified.** `verify_layer3_role.js` was run on 11/10/2026 against the test cluster (Atlas
project CivicConnect-Test, database `civicconnect`) with the `civicconnect-app` credential.
The record is `docs/evidence/DB-01_layer3_verification.txt`. The `civicconnect-app` custom
role exists on that cluster. It was created by hand in the Atlas console, so it is still
console state rather than configuration (CON-015), and it exists on the test cluster only.

**Not yet verified.** The backup, retention and Atlas trigger scripts were checked with
`bash -n`, `node --check` and by parsing the JSON. None of them has been run against Atlas
yet. First real runs are DEC-010 evidence item E2 (restore test) and the first PROC-001 run
after go-live. The Atlas custom roles (`civicconnect-app`, `civicconnect-backup`,
`civicconnect-retention`) are specified in DEC-003 and data baseline §4 but not yet
scripted. That's a forward item: `atlas` CLI `customDbRoles create`.

No credentials are held in this folder (NFR-3.5).
