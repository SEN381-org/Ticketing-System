# M4 staging deployment record: `v4.0-M4-rc`

This is the record of deploying the M4 release candidate to staging and checking it there,
following DEC-003 v0.5 (*Deployment procedure*). Every command was run by E. Lindsay, as given in
one block at a time. The expected result of each block was written down before it was run, and
the output was pasted back and compared. All times are UTC. The connection string, the database
host, passwords, the environment file's contents and the VM's full IP address are not recorded;
the address appears as `158.158.115.[redacted]` or `$H`.

| Field | Entry |
|---|---|
| Environment | `civicconnect-staging`: Azure VM, Spain Central; Atlas `civicconnectstaging`, M0, Azure `westeurope` (Netherlands); not colocated (DEC-003 v0.4 and v0.5) |
| Release candidate | `v4.0-M4-rc`: annotated tag object `be008dcc845171ea9989d1185f75f76e3ca834a8` on commit `f1eb7af9ac56f148d8eeac19cb35ab5c9a5322ae`, the merge of `dev` into `main` (PR #138). Tested build `6408ab7` |
| Session | 18/10/2026 00:29 to 02:20 UTC, from the VM (as `ticketuser`) and, for the load runs, from Stellenbosch, South Africa |
| Procedure | DEC-003 v0.5, steps 1 to 7. Step 4 (migrations) and step 5 (index provisioning): nothing to run (section 3) |
| Record status | COMPLETE for the checks below. The end-of-session cleanup is in section 13. A post-RC change to the staging host (18/10/2026, 12:15 UTC) is in section 14 |

## Results at a glance

| Check | Acceptance criterion | Result |
|---|---|---|
| Deploy; `/health` release = the tag's commit | DEC-003 step 7 | **Passed** (`f1eb7af…`, database up) |
| `NODE_ENV=staging` in the running process | DEC-003 v0.5; #133 comparison | **Passed** (count 1 in each process; set by the unit) |
| Smoke test | Reachability (DEC-018) | **Passed**, 6 of 6 |
| NFR-2.4 load run, 100 users, 600 s | AC-NFR-2.4 | **FAIL**: 17 failed requests (submission timeouts at 30 s), 0 server errors |
| NFR-2.1 submission run, 100 simultaneous submissions | AC-NFR-2.1 | **Not met**: 2 of 100 confirmed within 3 s server-side; 30 submissions lost |
| Four role journeys in a browser | AC-NFR-1.3 | **Passed** |
| HTTP redirect and TLS versions | AC-NFR-3.2 | **Passed** |
| Performance log under load | AC-NFR-1.11 | Format and privacy **passed**; 16 abandoned requests have no entry (**Partial**) |
| No plaintext password | AC-NFR-3.1 | Credential store and logs **passed**; backups cannot be inspected: none exist (**Partial**) |
| Session state not in process memory; query plans | AC-NFR-2.7 | **Passed** |

---

## 1. Release candidate and the pre-tag checks

Before tagging, E. Lindsay ran the RC plan's §D checks against `origin/main` after merging PR #138:

```
git log -1 --format='%H %P %s' origin/main
f1eb7af9ac56f148d8eeac19cb35ab5c9a5322ae 558a6557c8828abf78da3dc6d9098a3fddaf2a61 1bf59ae9edead8fd953a6757be91309bb985cabc Merge pull request #138 from SEN381-org/dev
git rev-parse 'origin/main^{tree}' 'origin/dev^{tree}'
be48e3a8ed9c39cff17fa8d60a235d3adc6be06b
be48e3a8ed9c39cff17fa8d60a235d3adc6be06b
git diff --stat 6408ab7 origin/main -- . ':!docs' ':!deploy' ':!.github'
 tests/integration/_harness.js | 17 ++++++++++++++---
 1 file changed, 14 insertions(+), 3 deletions(-)
git diff --stat 6408ab7 origin/main -- src client e2e perf scripts shared package.json package-lock.json
(no output)
```

So the tagged tree differs from the tested build `6408ab7` only in `docs/`, `deploy/` (PR #133),
`.github/` and `tests/integration/_harness.js` (PR #122); no runtime path changed. The tag was
created on `f1eb7af…` and pushed on its own (`git push origin refs/tags/v4.0-M4-rc`).

On GitHub, the tag's peeled commit is `f1eb7af9ac56f148d8eeac19cb35ab5c9a5322ae`; its tag object is
`be008dcc…`, tagger Ethan Lindsay, 2026-10-18T00:22:57Z, with the message "M4 release candidate:
merge of dev into main (#138). Tested build 6408ab7.".

A first local tag, whose message had wrapped onto two lines during the paste, was deleted before
anything was pushed.

## 2. State before the deploy (00:29:33 to 00:29:42)

| Item | Value |
|---|---|
| Service | `civicconnect-staging` loaded, enabled, active (running) since Thu 2026-10-15 16:12:28 UTC |
| Checkout | HEAD `30ff0c6df9f73cd8b14be9cf3e0dc659e1cacbcc` = `v3.0-M3-rc`; no local changes |
| `/api/v1/health` | 200, `{"application":"up","database":"up","release":"30ff0c6df9f73cd8b14be9cf3e0dc659e1cacbcc"}` |
| Environment file | `-rw------- 1 root root 206 Oct 15 16:12 /etc/civicconnect/staging.env`; one `RELEASE_COMMIT=` line (a count; the file is never printed) |
| Disk / memory | `/dev/root` 29G, 26G free; 3,175 MB of memory available |
| Node / npm | v22.23.3 / 10.9.9 |

**Decision (E. Lindsay):**
- Deploy the application only. The live Nginx site and systemd unit were left as they are, not
  replaced by PR #133's `deploy/` files.
- The reference is the comparison posted on PR #133 (17/10/2026 22:57 UTC). After #133's fix
  `9d07b67`, only lines marked NOT RECORDED in #133's files, plus `Group=ticketuser`, differ from
  the live VM.
- The live Nginx also listens on IPv6, which #133's file does not; installing #133's files as
  they are would have removed it.

## 3. Deployment: DEC-003 steps 1 to 7 (00:33:45 to 00:38:06)

**Steps 1 to 3 (as `ticketuser`, in `/opt/civicconnect`, 00:33:45 to 00:33:48):**

| Step | Result |
|---|---|
| `git fetch --tags origin` | New tag `v4.0-M4-rc` (also `v3.0-M3-baseline` and one branch the clone had not fetched before) |
| Tag check | `git cat-file -t v4.0-M4-rc` = `tag`; `v4.0-M4-rc^{commit}` = `f1eb7af9…` |
| Checkout | `git checkout v4.0-M4-rc`: HEAD = `f1eb7af9…`; no local changes |
| `NODE_ENV` in the deploy shell | unset (DEC-003's warning: it must not be `production` for the client build) |
| `npm ci --omit=dev` | found 0 vulnerabilities |
| `npm --prefix client ci` | found 0 vulnerabilities |
| `npm --prefix client run build` | `index.html` 0.39 kB, `assets/index-Chjm-1_M.css` 33.37 kB, `assets/index-BbnaYHl-.js` 195.18 kB; ✓ built in 166 ms |
| `client/dist` | `index.html` 397 B; `assets/` (the JS and CSS above); `fonts/` with 5 woff2 files and 3 OFL licence texts |

**The deployed client is the tested client.**
- A local build of `client/` from `6408ab7` (identical to `f1eb7af` in `client/` and `shared/`)
  produces the same content-hashed file names, `index-BbnaYHl-.js` and `index-Chjm-1_M.css`.
- Vite derives these names from the file contents.

**Step 4 (migrations):** none in this release. Nothing was run.

**Step 5 (index provisioning):** nothing to run.
- The declared indexes are unchanged since `v3.0-M3-rc`. The only model change is the new
  `Counter.js`, which declares no index.
- The `counters` collection was created by hand on 17/10/2026 at 15:04 UTC (RC plan §E).

**Step 6 (`RELEASE_COMMIT`, restart).** The environment file is never printed; only counts are shown.
- `RELEASE_COMMIT` was set to `f1eb7af9ac56f148d8eeac19cb35ab5c9a5322ae` with `sed -i`.
- Counts afterwards: the new value 1; `RELEASE_COMMIT=` lines 1; `NODE_ENV=` lines 0.
- The file is still mode 600, root.
- After `systemctl restart civicconnect-staging` the service was active, and `git describe`
  gives `v4.0-M4-rc`.

**Step 7 (health, re-captured verbatim at 00:38:06):**

```
{"application":"up","database":"up","release":"f1eb7af9ac56f148d8eeac19cb35ab5c9a5322ae"}
HTTP 200
```

`release` = the `v4.0-M4-rc` commit: **match.**

**`NODE_ENV`:**
- `systemctl show -p Environment` gives `Environment=NODE_ENV=staging`, which comes from the unit;
  the environment file does not set it (count 0).
- `pgrep -f 'node src/server.js'` matched two processes, 124488 (`sh -c` wrapper) and 124489
  (`node src/server.js`).
- Checked per process, each environment holds `NODE_ENV=staging` (count 1) and
  `RELEASE_COMMIT=f1eb7af…` (count 1). These are counts only; no variable was printed.
- This step's output was summarised by E. Lindsay rather than pasted. The health line above was
  re-captured verbatim.

## 4. Demonstration seed (00:38:07 to 00:38:09)

`perf/seed-demo.js` (staging target), exit 0:
- **Host check:** passed (`civicconnectstaging`; the host is not printed).
- **Database user:** `civicconnect-app`.
- **Run id:** `8ecb330b`.
- **Categories:** 7 (1 security): FACILITY-FAULTS, DAMAGED-EQUIPMENT, SECURITY-CONCERNS (security),
  IT-SUPPORT, MAINTENANCE-ISSUES, LOST-PROPERTY, OTHER-OPERATIONAL-REQUESTS.
- **Users:** 6, one per FR-1.2 role, `seed-8ecb330b-<role>@example.test`.
- **Counter:** `request-ref:2026` present, seq 0.
- **The logins file** (`/tmp/seed-demo.json`, mode 600) was copied privately by E. Lindsay and
  deleted at the end of the session (section 13).

## 5. Smoke test (00:41:22 to 00:41:24), on the VM against the staging HTTPS address

`scripts/smoke/phase0-smoke.js`, unchanged since M3. Its output was IP-redacted at source:

```
M3 Phase 0 smoke check (reachability only)
Run at        : 2026-10-18T00:41:23.046Z
Node          : v22.23.3
Base URL      : https://158.158.115.[redacted]
Database user : civicconnect-app

Fixture       : user 6ad415b32042699f676e748e, request 6ad415b32042699f676e7490 (CC-2026-876060), status Received

PASS  1 health is public and reports the database up  — 200 {"application":"up","database":"up","release":"f1eb7af9ac56f148d8eeac19cb35ab5c9a5322ae"}
PASS  2 transition without a session is refused  — 401
PASS  3 login sets __Host-sid and stores only its hash  — 201; attributes: Path=/; HttpOnly; Secure; SameSite=Lax
PASS  4 transition with the session commits, with exactly one history entry  — 201 ETag "v1"; status Rejected, version 1, history entries 1
PASS  5 logout ends the session  — 204; session document removed: true
PASS  6 the old cookie no longer works  — 401

6/6 checks passed.
smoke exit=0
```

As expected, line for line. The fixture stays on staging (synthetic; history is append-only).

## 6. M3 leftover, and a correction to the M3 record

The first fixture generation (00:44:46) printed `NOT RUN: /tmp/perf-fixtures.json already exists`,
exit 2.
- **The file was an M3 leftover:** 15/10/2026 16:25, 58,526 bytes, owner `ticketuser`, mode 600.
- **By its time, it is the fixture file of M3 attempt 4, run `77b08804`,** the run the M3 load
  test used.

> **Correction, 18/10/2026 (E. Lindsay).** The M3 staging deploy record
> (`docs/evidence/M3_Staging_Deploy_v3.0-M3-rc.md`, *Fixtures*, attempt 4) says run `77b08804`'s
> fixture file was "deleted on the VM just before the load run". It was not: it was still at
> `/tmp/perf-fixtures.json` on 18/10/2026. The M3 record is not edited.

**What happened to the file (a fault in the commands, not the operator):**
- The block did not stop when the generator refused, so its next two lines ran on the M3 file:
  `install` copied it to `/home/ticketuser/perf-fixtures.json`, and `rm` deleted it from `/tmp`.
- E. Lindsay then deleted the home copy, and `ls` confirmed both paths gone.
- Nothing was copied off the VM. The file held run `77b08804`'s synthetic passwords.
- From then on, every multi-step block stopped at the first failing line.

**Run `77b08804`'s data had not been cleaned after the M3 load test.**
- **Dry run (00:48:13):** 100 users (all named by a request or history entry), 1,300 requests
  (903 with history entries), 0 sessions, 0 categories.
- **Runs `c0a3b855`, `f44598a6` and `27406cf8`:** nothing left.

Two differences from the expectation written before the dry run:
- **0 categories, not 1: the expectation was wrong.** The M3 generator (`perf/generate-fixtures.js`
  at `934bf26`) never inserted a Category document; its category was a bare new ObjectId.
- **903 requests with history, not 900.** The M3 load run made 900 transitions, so 3 requests
  gained a history entry from elsewhere. Not established, and it does not affect the cleanup.

**Cleanup of run `77b08804` (`--confirm`, 00:51:14 to 00:51:16):**
- **Deleted:** 0 users, 397 requests, 0 sessions, 0 categories.
- **Revoked:** 100 users, all still named by a kept request.
- **Known residual:** 903 requests remain, with append-only history.
- As expected.

## 7. NFR-2.4 load run (AC-NFR-2.4): FAIL

**Fixtures (00:51:16 to 00:51:51):** run **`7a5e8e2f`**.
- **Created:** 7 categories, 100 Coordinators, 100 Requesters and 1,400 requests.
- **Copied** to the laptop by `scp`, outside the repository, with the staging certificate.
- **Certificate fingerprint** (VM and client): `74:2D:A5:C0:DF:68:F6:29:A7:61:41:33:5D:0B:53:F8:6D:5E:DD:2C:53:90:50:46:74:A4:DC:19:72:86:68:B2`,
  the same certificate as M3.

**Run from Stellenbosch, South Africa**, with `perf/` identical to the tag:
- Full report: `docs/evidence/M4-perf/NFR-2.4_load_run_2026-10-18.txt`, as written by the script.
- Started 00:59:58.694Z; all users logged in at 01:00:58.527Z; ended 01:11:08.894Z.

```
Per request type (all phases):
  login      n=  100  failed=0  p50 432 ms  p95 456 ms  p99 691 ms  max 751 ms  statuses {"201":100}
  list       n= 5565  failed=0  p50 209 ms  p95 686 ms  p99 1946 ms  max 4291 ms  statuses {"200":5565}
  read       n= 5565  failed=0  p50 204 ms  p95 872 ms  p99 1978 ms  max 3990 ms  statuses {"200":5565}
  transition n=  450  failed=0  p50 319 ms  p95 3983 ms  p99 4909 ms  max 5023 ms  statuses {"201":450}
  submit     n=  450  failed=17  p50 343 ms  p95 24048 ms  p99 30001 ms  max30003 ms  statuses {"201":433,"error":17}

Requests in the 600 s window: 12030 (19.71 requests/s)

Failed requests      : 17
Unhandled server errors (5xx): 0
Failures by type:
  17 x submit: timeout after 30 s

RESULT FAIL: NFR-2.4, 100 concurrent authenticated users for 600 s: 17 failed requests, 0 unhandled server errors
```

**Result: FAIL**, against the criterion written before the run (no failed request and no unhandled
server error). It was recorded as produced and not re-run.

**Atlas metrics during the run** (screenshots by E. Lindsay; the values are transcribed here and
the images are not committed):
- **Opcounters at the 01:07:40 sample:** command 2.63, query 65.62, update 2.5, insert 3.23,
  totalling about **74 ops/s**. That is above RSK-019's 70 ops/s early-warning trigger, and below
  the M0 limit of 100.
- **Queries:** a plateau of about 63 to 66 per second from 01:03 to 01:10.
- **Connections:** about 3 before the run, then 53.

**Afterwards (01:23 to 01:24, read-only):**
- **Service:** active; `/health` 200, release `f1eb7af…`.
- **Database:** run `7a5e8e2f` holds **450 requests submitted through the API**.
- **Journal 00:59 to 01:12:** 12,114 lines, with 0 error, 0 warn, 0 WriteConflict and 0 unhandled.
- **Performance log, `POST /api/v1/requests`:** 434 entries, all 201; durationMs p50 214,
  p95 6,872, p99 26,900, max 29,911.
- **Nginx:** 16 × 499 (the client closed) on `POST /api/v1/requests`.

**Reconciliation: every submission was saved.** 434 logged + 16 abandoned = 450 = the database count.
- The client saw 433 × 201 and 17 timeouts.
- Its 17th timeout is the request the server finished at 29,911 ms, which reached the client
  after its 30 s limit.
- The performance log writes on `finish`, so abandoned requests have no entry.

## 8. NFR-2.1 submission run (AC-NFR-2.1): not met

The client timeout was set to 60 s (`--timeout 60`). This was decided and written down before the
run, to match Nginx's default proxy timeout, so that server-side timings would not be lost to
client aborts.
- Full report: `docs/evidence/M4-perf/NFR-2.1_submit_run_2026-10-18.txt`.
- Run from Stellenbosch: 100 Requesters authenticated, then 100 submissions, all started within
  15 ms of each other.
- Window [01:28:43.547Z, 01:29:43.572Z].

```
Confirmed (201)      : 27 of 100; statuses {"201":27,"error":73}
Client-side latency (network included; NOT the AC measure): p50 60010 ms  p95 60012 ms  max 60012 ms
  73 x timeout after 60 s
CLIENT-SIDE INCOMPLETE: 27 of 100 confirmations received (100 authenticated).
```

The prediction written before the run was 100 of 100 confirmed eventually, failing the AC
server-side. The actual result was worse.

**Server side and reconciliation (01:35:15 to 01:35:17, read-only):**
- **`perf/server-timings.js` over the window:** 27 entries, then `NOT RUN: 27 entries found; 100
  are needed`. This was predicted: requests the client abandoned have no entry.
- **Performance log, 01:28:43 to 01:33:00:** 27 entries, all 201; durationMs p50 29,751,
  p95 55,863, max 57,828; **2 within 3,000 ms**.
- **Journal, same window:** `[unhandled]` 30; `TransientTransactionError` 60; warn 0.
- **Nginx:** of 100 `POST /api/v1/requests`, 27 × 201 and 73 × 499; no 504.
- **Database:** run `7a5e8e2f` now holds 520 requests submitted through the API (450 before).

| | Count |
|---|---|
| Submitted | 100 |
| Saved (520 − 450) | 70 |
| Confirmed to the client | 27, of which 2 within 3 s server-side |
| Saved, but no reply received (client gave up at 60 s; Nginx 499) | 43 |
| **Not saved: the transaction failed after its retries; an unhandled 500 that no client received** | **30** |

**AC-NFR-2.1 is not met:** 2 of 100 were confirmed within 3 s, against the 95 required.
`server-timings.js` printed NOT RUN by its own rule, but the evidence is conclusive: with 73
unconfirmed after 60 s, at most 27 could have been within 3 s.

The AC says "a sustained load of 100 concurrent users". This run was 100 users submitting
together with no separate background load, as the perf plan designed.

**Error class of the 30** (the first entry, with URIs and hosts redacted before printing):
```
[unhandled] MongoServerError: Caused by :: Write conflict during plan execution and yielding is disabled. :: Please retry your operation or multi-document transaction.
  errorLabels: [ 'TransientTransactionError' ],
  code: 112,
  codeName: 'WriteConflict',
```

**Why it reached the error handler (from the code):**
- `unitOfWork.run()` uses the driver's retry loop, `session.withTransaction()`, with
  `readConcern` snapshot and `writeConcern` majority.
- The driver is mongodb 6.20.0 (`lib/sessions.js`). On a `TransientTransactionError` it aborts and
  re-runs the whole callback **immediately, with no backoff, until 120 s have passed**
  (`MAX_TIMEOUT`). No client `timeoutMS` is configured. After 120 s it rethrows.
- Every submission's callback increments the one per-year counter document
  (`counterRepository.next`: `findOneAndUpdate({_id: 'request-ref:2026'}, {$inc: {seq: 1}})`), so
  concurrent submissions conflict on it and retry until they win or time out.
- The rethrown error is not an `AppError`, so `errorHandler` logs `[unhandled]` and answers 500,
  after the client has gone.
- This fits the timings: client timeouts at 60 s, late commits after 60 s, failures after 120 s.

## 9. Fixture cleanup (01:40:09 to 01:40:12)

Cleanup of run `7a5e8e2f` (`--confirm`):

```
Found           : 200 users (200 named by a request or history entry), 1400 requests (450 with history entries), 175 sessions; 7 categories; 520 requests submitted through the API (left in place)
Deleted         : 67 users, 950 requests, 175 sessions, 0 categories (categories kept: 970 requests of the campus remain)
Revoked         : 133 users still named by a request or history entry (kept so names resolve; cannot sign in)
Known residual  : 970 requests remain in the run's campus (API-submitted or with history; append-only history cannot be deleted)
Remaining       : 133 users, 450 requests, 0 sessions; 7 categories; 970 requests in the run's campus
```

The fixture files were removed from the VM (both paths confirmed gone) and from the laptop
(`Test-Path` False).

Two differences from the expectation written before the step:
- **67 users deleted and 133 revoked, not 0 and 200.** `Found` counts the users named *before* the
  deletions. The script recomputes after deleting the 950 untouched fixture requests, and deletes
  users nothing names any more. Those are about 50 Coordinators the load run never used, and about
  17 Requesters with no saved submission.
- **175 sessions, not 200.** This is the 30-minute idle expiry of the load-run sessions.

**No reference to a deleted user remains.** A read-only check over run `7a5e8e2f`'s campus:
`requests in campus: 970 | history entries: 970 | distinct user ids referenced: 133 | existing: 133 | MISSING: 0`.

## 10. Role walkthrough in a browser (AC-NFR-1.3): passed

E. Lindsay ran the walkthrough with the seed run `8ecb330b` logins, against expected results
written before it began. Every step matched; there were no errors, no 500s and no slow submissions.

| Journey | Time (UTC) | Steps |
|---|---|---|
| Requester | 01:53 to 01:55 | Lands on My requests; submits (facility faults), confirmation **CC-2026-000521**; listed as Received |
| Coordinator | 01:56 to 01:58 | In the queue, Unassigned; assigns to the Technician (toast, status Assigned, Assignment entry in the history) |
| Technician | 01:59 to 02:01 | In Progress; Resolved with a resolution; posts a comment (toast; the buttons stayed in place) |
| Manager | 02:02 to 02:03 | The management view counts it under Resolved and facility faults; Categories shows seven, and a target was saved |
| Requester again | 02:04 to 02:05 | The notification bell shows the updates; the detail shows Resolved with dates |

- **Counter consistency:** CC-2026-000521 is the next number after the 520 saved submissions. The
  30 lost submissions' increments were rolled back with their transactions.
- **"With all campus system endpoints unreachable":** the server makes no outbound call (no
  `fetch`, HTTP client, LDAP or mail in `src/`). Its only dependency is Atlas, and the staging VM
  reaches no campus system.

## 11. T9 checks

**T9a: AC-NFR-3.2 (02:10:06), passed.**
- **Plain HTTP:** `301 -> https://158.158.115.[redacted]/`.
- **TLS 1.0 and 1.1** were offered by OpenSSL at security level 0 and **refused by the server**:
  `tlsv1 alert protocol version … SSL alert number 70`, `New, (NONE), Cipher is (NONE)`.
- **TLS 1.2:** `New, TLSv1.2, Cipher is ECDHE-RSA-AES256-GCM-SHA384`, `Verify return code: 0 (ok)`.
- **TLS 1.3:** `New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384`, `Verify return code: 0 (ok)`.
- A curl attempt at TLS 1.1 was refused on the client side ("no protocols available"):
  inconclusive, so not counted.

**T9b: AC-NFR-1.11 (02:12:04), Partial.** The performance log of the NFR-2.4 run (00:59 to 01:12)
went through a checker that prints only counts and route patterns:
- **Entries:** 12,114, all with exactly `{kind, operation, durationMs, outcome}`.
- **Values:** whole-millisecond durations and valid HTTP statuses.
- **Personal data:** 0 e-mail addresses and 0 identifiers or numbers.
- **Operations:** route patterns only: `GET /api/v1/requests` 5,565, `GET /api/v1/requests/:id`
  5,565, `POST /api/v1/requests/:id/transitions` 450, `POST /api/v1/requests` 434,
  `POST /api/v1/sessions` 100.
- **Nginx:** 12,130 `/api/` requests, of which 16 × 499. That reconciles exactly:
  12,130 = 12,114 + 16.
- **Decision (E. Lindsay): Partial.** The format and privacy clauses are fully met, but the 16
  requests abandoned before their response finished have no entry (the middleware writes on
  `finish` only), so "each operation has one structured entry" does not hold strictly.

**T9c: AC-NFR-3.1 (02:16:36), Partial.** The six seed passwords were used in the walkthrough
logins, so a plaintext leak would have reached the logs. The checker printed counts only:
- **Credential store:** 243 users, all `scrypt$N=32768,r=8,p=3$<salt>$<hash>`. The 10
  application-created users have 10 distinct salts. The 233 load-test fixture users share 2 salts,
  because each fixture run hashes one synthetic password once (`generate-fixtures.js`), a
  test-fixture shortcut, not the application's hashing.
- **Verification:** all 6 of the seed passwords verify against their stored hashes.
- **0 seed passwords in plaintext** in `users`, `sessions` (1), `auditLog` (332), `requests`
  (1,876), `requestHistory` (1,880) and `notifications` (454).
- **0 in the logs:** the service journal since 15/10 (13,442 lines) and every uncompressed Nginx
  log.
- **Decision (E. Lindsay): Partial.** The backups clause cannot be shown, because no backups exist
  (DEC-010; AC-NFR-1.5 Not Met).

**T9d: AC-NFR-2.7 (02:19:59 to 02:20:20), passed.**
- **Session state is not held in process memory:**
  - The seed Requester logged in (201) and listed (200).
  - A made-up cookie got 401, a control showing the 200s depend on the session.
  - After `systemctl restart` (active again at 02:20:00), the **same cookie got 200** from the new
    process. Session state is in the `sessions` collection (`authService.resolve()` reads it on
    every request).
- **Query plans** of the real services as the seed users, with every query to `requests`
  explained:

```
Coordinator queue (default) | requests.find | PROJECTION_SIMPLE < SORT < FETCH < IXSCAN(campusId_1_categoryId_1_assigneeId_1_status_1) | full-table scan: no
Coordinator queue, status Received | requests.find | PROJECTION_SIMPLE < SORT < FETCH < IXSCAN(campusId_1_status_1_submittedAt_-1) | full-table scan: no
Coordinator queue, unassigned | requests.find | PROJECTION_SIMPLE < SORT < FETCH < IXSCAN(campusId_1_assigneeId_1_status_1) | full-table scan: no
Coordinator search 'facility' | requests.find | PROJECTION_SIMPLE < SORT < FETCH < TEXT_MATCH(description_text_location_text) < FETCH < IXSCAN(description_text_location_text) | full-table scan: no
Requester My requests | requests.find | PROJECTION_SIMPLE < SORT < FETCH < IXSCAN(campusId_1_requesterId_1_submittedAt_-1) | full-table scan: no
Technician queue | requests.find | PROJECTION_SIMPLE < SORT < FETCH < IXSCAN(campusId_1_categoryId_1_assigneeId_1_status_1) | full-table scan: no
Manager management view | requests.aggregate | GROUP < PROJECTION_COVERED < IXSCAN(campusId_1_categoryId_1_assigneeId_1_status_1) | full-table scan: no
Manager management view | requests.find | PROJECTION_SIMPLE < FETCH < IXSCAN(campusId_1_status_1_submittedAt_-1) | full-table scan: no
plans with a full-table scan on requests or auditLog: 0
```

- The application never reads `auditLog` (`auditRepository` is insert-only), so no audit query plan
  exists.
- The plans were taken on staging's data volume.

## 12. Findings for the registers (proposed; IDs to be allocated by E. Lindsay)

*Allocated after the session (E. Lindsay, 18/10/2026, after a free-check): the defect below is
**DEF-032**, severity S1, priority P2.*

**Defect (high severity): concurrent submissions contend on the per-year reference counter inside
the create transaction, and under a burst they are delayed or lost.** Evidence: sections 7 and 8.
- **Mechanism:** each submission's transaction increments the one counter document
  `request-ref:<year>` (snapshot read concern, `w: majority`). Concurrent submissions write the same
  document, conflict (WriteConflict, `TransientTransactionError`) and re-run immediately until they
  win or 120 s pass. Each attempt crosses Spain to the Netherlands several times.
- **Under 100 concurrent users:** submission p95 6.9 s and max 29.9 s server-side; 17 client
  timeouts; all saved.
- **Under 100 simultaneous submissions:** 70 saved, 27 confirmed, 2 within 3 s, **30 lost** as
  unhandled 500s.
- **Business impact:** a requester's submission can be lost, or saved without the requester being
  told.
  - A retry on the same form replays the original through the `Idempotency-Key` (DEC-015 §3;
    `NewRequest` keeps the key until a 201).
  - A reload, or an API client retrying with a new key, can create a duplicate.
- **Proposed fix (future work; the code is frozen for M4):**
  1. Take the reference allocation out of the multi-document transaction: a single-document atomic
     `$inc` before it, accepting gaps (FR-2.6 requires unique and immutable, not gap-free), or
     allocate in blocks, or keep a counter per campus or shard.
  2. Give the transaction a time budget below the proxy timeout, and map an exhausted transaction
     to a defined problem response (for example 503 with `Retry-After`), so clients retry with the
     same `Idempotency-Key` instead of receiving an unhandled 500 or nothing.
  3. Use jittered backoff if any contention remains.
  4. Re-run AC-NFR-2.1 and AC-NFR-2.4, on a colocated cluster.

**Risk RSK-019 (Atlas free-tier limits): the early-warning indicator was reached.**
- During the NFR-2.4 run, Atlas reported about 74 ops/s (trigger 70, M0 limit 100), and connections
  rose from 3 to 53.
- Every request type's tail grew against M3 (read p95 0.87 s against 0.25 s), with about 1.8 times
  M3's request rate.
- Combined with the counter contention, submissions failed. The risk has partly materialised.

**Go-live (an additional no-go reason).** The release candidate fails AC-NFR-2.4 and AC-NFR-2.1:
under the AC's load it delays submissions and loses some. Production needs the counter fix, a
re-run of both ACs on a colocated cluster, and the RSK-019 tier decision.

**Future work (AC-NFR-1.11):** write a performance-log entry when a request is closed before its
response finishes (outcome "aborted"), so every operation has exactly one entry.

## 13. Acceptance criteria evidenced at the RC, and end-of-session cleanup

| AC | Before the session | After |
|---|---|---|
| AC-NFR-1.3 | Not Met | **Met** (section 10) |
| AC-NFR-1.11 | Partial | Partial (T9b) |
| AC-NFR-2.1 | Not Met | **Not Met**, now with evidence (section 8) |
| AC-NFR-2.4 | Partial (M3's run had no submission or lists) | **Not Met** (section 7) |
| AC-NFR-2.7 | Not Met | **Met** (T9d) |
| AC-NFR-3.1 | Not Met | **Partial** (T9c) |
| AC-NFR-3.2 | Partial | **Met** (T9a) |

The strict-rule figure moves from 60.5 to **63 of 80 (78.75 %)**: 59 Met, 8 Partially Met, 13
Not Met. CR-001 to CR-004 do not change it.

**End-of-session cleanup (02:30:33, VM; then the laptop), as pasted by E. Lindsay:**

```
2026-10-18T02:30:33Z
ls: cannot access '/tmp/seed-demo.json': No such file or directory
ls: cannot access '/tmp/perf-fixtures.json': No such file or directory
ls: cannot access '/tmp/perf-fixtures-m4.json': No such file or directory
ls: cannot access '/home/ticketuser/perf-fixtures.json': No such file or directory
active
{"application":"up","database":"up","release":"f1eb7af9ac56f148d8eeac19cb35ab5c9a5322ae"}
HTTP 200
2026-10-18T02:30:33Z
```

- **Files holding synthetic passwords:** the seed logins file and every fixture file path (the M3
  leftover's, the M4 run's, and the home-directory copy) no longer exist on the VM.
- **The checker scripts** (`/tmp/dangling-check.mjs`, `/tmp/perflog-check.mjs`,
  `/tmp/plaintext-check.mjs`, `/tmp/plan-check.mjs`) and the T9d temp directory were removed when
  each check ran (sections 9 and 11).
- **The service** ends the session active, with `/health` 200, database up and release
  `f1eb7af…`.
- **On the laptop,** the working folder (fixtures copy, `staging.crt` and the two reports, which
  are now committed in `docs/evidence/M4-perf/`) was deleted; `Test-Path` gives False.
- **Not shown in this output:** a general listing of `/tmp` and the home directory for anything
  else. In particular, the temporary directory of the #133 comparison
  (`/tmp/deploy133.XXXX`, 17/10/2026) is neither shown present nor shown removed.
- **Follow-up (18/10/2026, 12:30 UTC, E. Lindsay, on the VM as `ticketuser`):** the #133
  comparison's temporary directory no longer exists:

  ```
  ticketuser@civicconnect-staging:~$ ls -d /tmp/deploy133.* 2>&1
  ls: cannot access '/tmp/deploy133.*': No such file or directory
  ```

**Left on staging by design** (synthetic data; `requestHistory` and `auditLog` are append-only):
- the seed campus and its six accounts (run `8ecb330b`), for the demonstration;
- request CC-2026-000521 and its history;
- the smoke fixture;
- the revoked load-test users and their remaining requests (runs `77b08804` and `7a5e8e2f`).

---

## 14. Post-RC note (18/10/2026): staging moved to a domain with a Let's Encrypt certificate

*Added after the RC session. Sections 1 to 13 are unchanged.*

**What changed (as reported by E. Lindsay; the commands and their output are not recorded here).**
- Since 12:15 UTC, staging serves `https://civicconnect.co.za` with a Let's Encrypt certificate.
  The certificate expires on 2027-01-16, and a renewal dry run passed.
- Only the live Nginx site file changed: `server_name` and the two certificate paths
  (`ssl_certificate`, `ssl_certificate_key`). The previous file is backed up in `/root`.
- The application, its code, the environment file and the systemd unit did not change. The tag
  is still `v4.0-M4-rc`.
- Afterwards, `/health` answered 200 with release `f1eb7af…`, and plain HTTP answered 301 to the
  domain.

**What it does not change.** The checks in sections 3 to 11 were run against the VM's address
with the self-signed certificate (`/etc/ssl/certs/staging.crt`). They stand as the evidence
of the release candidate as tested. The AC-NFR-3.2 re-check against the domain, below, is
recorded alongside T9a and does not replace it.

**Difference from the repository.** `deploy/nginx/civicconnect-staging.conf` (PR #133) still has
`server_name _;` and the self-signed certificate paths, so it no longer matches the live file
in those three lines. Only `docs/` and `perf/` may change between `v4.0-M4-rc` and
`v4.0-M4-baseline`, so `deploy/` is not updated before the baseline. The difference is recorded
here instead.

**AC-NFR-3.2 re-check against the domain (T9a repeated).**

Run on the VM as `ticketuser` by E. Lindsay, against the domain, with OpenSSL offering each
version at security level 0 (as in T9a) and checking the certificate's name
(`-verify_hostname`). The expected result was written before the run.

```
ticketuser@civicconnect-staging:~$ date -u +%FT%TZ; for v in tls1 tls1_1 tls1_2 tls1_3; do echo "== $v"; echo | openssl s_client -connect civicconnect.co.za:443 -servername civicconnect.co.za -verify_hostname civicconnect.co.za -$v -cipher 'DEFAULT:@SECLEVEL=0' 2>&1 | grep -E "alert|^New,|Verify return code|^subject=|^issuer="; done
2026-10-18T12:30:04Z
== tls1
403782D4EB7A0000:error:0A00042E:SSL routines:ssl3_read_bytes:tlsv1 alert protocol version:../ssl/record/rec_layer_s3.c:1599:SSL alert number 70
New, (NONE), Cipher is (NONE)
    Verify return code: 0 (ok)
== tls1_1
40B79C7861780000:error:0A00042E:SSL routines:ssl3_read_bytes:tlsv1 alert protocol version:../ssl/record/rec_layer_s3.c:1599:SSL alert number 70
New, (NONE), Cipher is (NONE)
    Verify return code: 0 (ok)
== tls1_2
subject=CN = civicconnect.co.za
issuer=C = US, O = Let's Encrypt, CN = YE2
New, TLSv1.2, Cipher is ECDHE-ECDSA-AES256-GCM-SHA384
    Verify return code: 0 (ok)
== tls1_3
subject=CN = civicconnect.co.za
issuer=C = US, O = Let's Encrypt, CN = YE2
New, TLSv1.3, Cipher is TLS_AES_256_GCM_SHA384
Verify return code: 0 (ok)
```

- **TLS 1.0 and 1.1: refused by the server** (`tlsv1 alert protocol version`, alert 70; no
  cipher). The "Verify return code: 0 (ok)" on these two lines means nothing: no session was
  established, so no certificate was verified.
- **TLS 1.2:** `ECDHE-ECDSA-AES256-GCM-SHA384`, certificate verified against the system's trust
  store, with the name checked. The ECDSA cipher (RSA in T9a) follows from the certificate's key
  type, as expected.
- **TLS 1.3:** `TLS_AES_256_GCM_SHA384`, verified.
- **Certificate:** subject `CN = civicconnect.co.za`, issued by Let's Encrypt (intermediate YE2).
- **As expected. AC-NFR-3.2 holds on the domain**, with a publicly trusted certificate: no
  `--cacert` or supplied certificate is needed to verify staging any more.
