# M3 staging deployment record: `v3.0-M3-rc`

Deployment of the M3 release candidate to the staging environment, following DEC-003 v0.4
(*Deployment procedure*). Record every command as run and every time in UTC. Do not record
the connection string, host, passwords or the full static IP.

| Field | Entry |
|---|---|
| Environment | `civicconnect-staging` (Azure VM, Spain Central; Atlas `civicconnectstaging`, M0, Azure `westeurope`) |
| Procedure | DEC-003 v0.4, steps 1 to 7 |
| Record status | DRAFT. Complete: step 5 (provisioning), step 7 and section 6 (health), section 3a (certificate), section 8 (NFR-2.4, PASS), section 9 (smoke, 6 of 6). Awaiting the deployer's outputs: sections 1, 3 (steps 1 to 4 and 6), 4, 5, 7 and 10, and the time of the configuration correction |

## Execution order (E. Lindsay, 15/10/2026)

1. **Provisioning**: DEC-003 step 5 on the staging cluster (section 3, step 5).
2. **Deploy**: DEC-003 steps 1 to 4, then 6 (section 3).
3. **`/health`**: DEC-003 step 7 (section 6).
4. **Performance test** (section 8).
5. **Smoke test** (section 9), last, so the records it writes do not affect the performance
   figures.

No E2E run on staging (E. Lindsay, 15/10/2026). The smoke test takes its place.

---

## 1. Deployer identity and machine

```
Deployer           : <name>
Machine            : <VM name / hostname as shown by `hostname`>   (not the IP)
SSH from           : <workstation, location>
OS                 : <`lsb_release -ds`>
Node               : <`node -v`>   (DEC-003: Node 22)
npm                : <`npm -v`>
git                : <`git --version`>
Session start (UTC): <YYYY-MM-DDTHH:MM:SSZ>   (`date -u +%FT%TZ`)
```

## 2. Release candidate: tag and commit

```
$ git fetch --tags origin
$ git rev-parse v3.0-M3-rc^{commit}
30ff0c6df9f73cd8b14be9cf3e0dc659e1cacbcc

$ git show -s --format='%H %an %ad' v3.0-M3-rc^{commit}
<output>
```

This commit hash is the value every later check is compared against (steps 6 and 8).

## 3. DEC-003 deployment steps 1 to 7

Prerequisite (DEC-003): this staging run is required before any production release tag.

### Step 1: fetch the release tag (initial clone)

This is the first deployment to the VM, so step 1 is an initial clone of the repository,
not a fetch into an existing checkout.

Application directory: `/opt/civicconnect`. DEC-003 v0.4 does not name the application
directory (it names only `/etc/civicconnect/<env>.env` for secrets). `/opt/civicconnect` is
the path the repository already uses (DEC-010, `scripts/backup/crontab.example`), confirmed by
E. Lindsay for this deployment. Owner: the service user, `ticketuser`.

```
Start (UTC): <time>
$ sudo mkdir -p /opt/civicconnect
$ sudo chown ticketuser:ticketuser /opt/civicconnect
$ git clone https://github.com/SEN381-org/Ticketing-System.git /opt/civicconnect
<output>
$ cd /opt/civicconnect && git checkout v3.0-M3-rc
<output>
$ git rev-parse HEAD
<must equal 30ff0c6df9f73cd8b14be9cf3e0dc659e1cacbcc (section 2)>
End (UTC)  : <time>
```

### Step 2: `npm ci --omit=dev` in the repository root

```
Start (UTC): <time>
$ echo "NODE_ENV=${NODE_ENV:-unset}"
<output>
$ npm ci --omit=dev
<output summary: packages added, vulnerabilities line>
End (UTC)  : <time>
```

### Step 3: build the client

DEC-003 warning: `NODE_ENV` must not be `production` in this shell, or `npm ci` skips the dev
dependencies and Vite does not install.

```
Start (UTC): <time>
$ npm --prefix client ci
<output summary>
$ npm run build:client
<output: built files in client/dist>
End (UTC)  : <time>
```

### Step 4: run migrations

**No migrations in this release.**

```
Checked (UTC): <time>
```

### Step 5: provision indexes (TD-004)

Temporary user `civicconnect-temp-provisioner`, custom role `civicconnect-index-provisioner`
only, restricted to the staging cluster, 6-hour expiry.

```
Phase 1 start (UTC)         : 2026-10-15T13:27:47Z
Temporary user created (UTC): 2026-10-15T13:20Z
Expiry                      : 2026-10-15T19:20Z (6 hours)
Credential file             : .env.provision in the repository root of R. van der Merwe's
                              workstation; git-ignored, never in the tracked tree. Checked before
                              the run: host starts "civicconnectstaging.", database
                              /civicconnect, user civicconnect-temp-provisioner (host and
                              password not printed)
Run from                    : that workstation, checked out at v3.0-M3-rc (30ff0c6), detached

Expected results, written before the run (UTC 2026-10-15T13:27:47Z):
  Run 1: Created this run: 31 (21 declared + 10 default _id_); RESULT PASS: 21 of 21; exit 0
  Run 2: Created this run: 0; RESULT PASS: 21 of 21; exit 0

$ node --env-file=.env.provision --import "data:text/javascript,import dns from 'node:dns';dns.setServers(['8.8.8.8','1.1.1.1']);" scripts/atlas/provision-indexes.js --env staging --out docs/evidence/M3-indexes/index_provisioning_staging_run1.txt
Full output: docs/evidence/M3-indexes/index_provisioning_staging_run1.txt
  Started 2026-10-15T13:28:08.122Z, ended 2026-10-15T13:28:17.063Z
  Server user civicconnect-temp-provisioner; Commit 30ff0c6, working tree clean
  Privileges: createIndex and listIndexes on the ten collections only; privilege check passed
  Before: all ten collections did not exist
  Created this run: 31 (21 declared + 10 default _id_)
  RESULT PASS: 21 of 21 declared indexes present with matching options (missing 0, different 0, undeclared 0)
Exit code: 0

$ node --env-file=.env.provision --import "data:text/javascript,import dns from 'node:dns';dns.setServers(['8.8.8.8','1.1.1.1']);" scripts/atlas/provision-indexes.js --env staging --out docs/evidence/M3-indexes/index_provisioning_staging_run2.txt
Full output: docs/evidence/M3-indexes/index_provisioning_staging_run2.txt
  Started 2026-10-15T13:28:17.458Z, ended 2026-10-15T13:28:25.526Z
  Commit 30ff0c6; "working tree NOT clean" because run 1's output file was untracked in the
  tree when run 2 started; no tracked file was modified
  Created this run: 0
  RESULT PASS: 21 of 21 declared indexes present with matching options (missing 0, different 0, undeclared 0)
Exit code: 0

Result: both runs as expected.
.env.provision deleted (UTC): 2026-10-15T13:28:25Z
Phase 1 end (UTC)           : 2026-10-15T13:28:25Z
Temporary user deleted (UTC): 2026-10-15T13:31Z (by R. van der Merwe, before its expiry)
Node on the workstation     : v26.0.0 (the VM runs Node 22; step 5 ran from the workstation,
                              not from the VM)
```

### Step 6: restart the service

```
Start (UTC): <time>
$ sudo systemctl restart civicconnect-staging
End (UTC)  : <time>
```

Status output is recorded in section 5.

### Step 7: health check

Run on the VM against the HTTPS endpoint, trusting the staging certificate explicitly
(`--cacert`), not by disabling verification. Certificate details: section 3a.

```
Start (UTC): 2026-10-15T14:19:22Z
$ curl -sS --cacert /etc/ssl/certs/staging.crt -w '
HTTP %{http_code}
' https://158.158.115.[redacted]/api/v1/health
{"application":"up","database":"up","release":"30ff0c6df9f73cd8b14be9cf3e0dc659e1cacbcc"}
HTTP 200
End (UTC)  : 2026-10-15T14:19:22Z
```

The curl flags above are as run (confirmed by R. van der Merwe); the address is redacted in
this record. An earlier health check, before the certificate was regenerated with the VM's IP
in its SAN, used `-sS -k -w`, which skips certificate verification. That check is not the
step 7 result: this one, with `--cacert` and verification on, is. The certificate
regeneration and this check completed within the same second, 14:19:22 UTC (confirmed).

Result: as expected. The database is up and `release` equals the tag's commit (section 2).
Response recorded in section 6.

### 3a. Self-signed certificate configuration

Staging serves HTTPS with a self-signed certificate. DEC-003's *Edge* row specifies a
Let's Encrypt certificate; the staging VM has no domain name, so it uses a self-signed
certificate whose Subject Alternative Name is the VM's IP address. Clients trust it
explicitly (`curl --cacert`, `NODE_EXTRA_CA_CERTS`); verification is never disabled.

```
Certificate file           : /etc/ssl/certs/staging.crt (on the VM)
SHA-256 fingerprint        : 74:2D:A5:C0:DF:68:F6:29:A7:61:41:33:5D:0B:53:F8:6D:5E:DD:2C:53:90:50:46:74:A4:DC:19:72:86:68:B2
Valid from (notBefore)     : 2026-10-15T14:19:22Z (Oct 15 14:19:22 2026 GMT)
Valid until (notAfter)     : 2027-10-15T14:19:22Z (Oct 15 14:19:22 2027 GMT)
Subject Alternative Name   : IP Address:158.158.115.[redacted]   (the VM's static IP; DEC-003 v0.4)
Regenerated (UTC)          : 2026-10-15, to add the VM's IP to the SAN
```

Commands, as run on the VM (address redacted in this record):

    $ sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/ssl/private/staging.key -out /etc/ssl/certs/staging.crt -subj "/CN=158.158.115.[redacted]" -addext "subjectAltName=IP:158.158.115.[redacted]" 2>/dev/null
    $ sudo systemctl restart nginx

<the Nginx server block's ssl_certificate and ssl_certificate_key lines are not recorded here>

---

## 4. `RELEASE_COMMIT` in the environment file

Show only this one line. The file also holds `MONGODB_URI`, which must not be printed.

```
$ sudo grep '^RELEASE_COMMIT=' /etc/civicconnect/staging.env
RELEASE_COMMIT=<hash>
```

The value must equal the commit in section 2.

## 5. Service status

```
$ systemctl status civicconnect-staging --no-pager
<output>
Captured (UTC): <time>
```

## 6. Health response

```
$ date -u +%FT%TZ; curl -sS --cacert /etc/ssl/certs/staging.crt -w '
HTTP %{http_code}
' https://158.158.115.[redacted]/api/v1/health; date -u +%FT%TZ
2026-10-15T14:19:22Z
{"application":"up","database":"up","release":"30ff0c6df9f73cd8b14be9cf3e0dc659e1cacbcc"}
HTTP 200
2026-10-15T14:19:22Z
```

`release` = `30ff0c6df9f73cd8b14be9cf3e0dc659e1cacbcc` = `v3.0-M3-rc` (section 2): **match**.

The `release` value must equal the tag's commit in section 2. A mismatch, or `unknown`, means
the deployed process is not the release candidate.

## 7. Environment file permissions

```
$ sudo stat -c '%a %U:%G %n' /etc/civicconnect/staging.env
600 <owner>:<group> /etc/civicconnect/staging.env
```

Required: exactly `600` (DEC-003, *Secrets*).

## 8. Performance test (NFR-2.4)

Run after `/health` (section 6) and before the smoke test (section 9). Workload, expected
results and pass/fail are written below **before the run** (UTC 2026-10-15T14:33:53Z). One run; it is not
repeated to get a better number. If the result is noisy, that is recorded.

### What NFR-2.4 states

- **NFR-2.4** (Non-Functional Requirements v0.3), quoted exactly: "The system will sustain 100
  concurrent authenticated users with no failed request and no unhandled server error."
- **AC-NFR-2.4** (Acceptance Criteria v0.3), quoted exactly: Given "100 concurrent authenticated
  users exercising the standard journeys for 10 minutes", When "the run completes", Then "no
  request failed and no unhandled server error was recorded".

So the requirement fixes the **load** (100 concurrent authenticated users), the **duration**
(10 minutes) and the **target** (zero failed requests, zero unhandled server errors).

It does **not** fix:
- the operations ("the standard journeys" is not defined in the record);
- a ramp-up, a think time or a request mix;
- any latency target. NFR-2.1's 3-second target is for request submission, which is not built.

The choices below fill those gaps. They are the team's, not the requirement's.

### Workload (team choices, justified)

| Parameter | Value | Source and justification |
|---|---|---|
| Concurrent users | 100 | NFR-2.4, AC-NFR-2.4 |
| Duration | 600 s, starting when the 100th user has logged in | AC-NFR-2.4 ("for 10 minutes"); measured from the last login so all 100 are concurrently authenticated for the whole window |
| Journey | Each user logs in once, then loops: read one request (`GET /api/v1/requests/{id}`), think, and every 6th iteration reject one fresh Received request (`POST /api/v1/requests/{id}/transitions`) | The authenticated operations the release candidate implements: login, read one request, status transition. Request submission and lists are not built. Team choice |
| Think time | 10 s | Data and Persistence Baseline v0.3 §7 assumes NFR-2.4's users are "mostly reads, ~10 s think time". A team assumption, not the requirement's |
| Transition rate | 1 in 6 iterations (about one per user per minute) | Team choice: mostly reads, per the same assumption, with enough transitions to exercise the transaction and the unique indexes |
| Ramp-up | Logins staggered over 60 s | Team choice. Each login is one scrypt verification of 32 MiB on a 2-vCPU VM (DEC-018); 100 at once would test the login burst, not the sustained load NFR-2.4 states. The ramp's requests still count towards pass/fail |
| Request timeout | 30 s, counted as a failed request | Team choice: a request that does not answer within 30 s has failed for its user |
| Fixtures | 100 synthetic Coordinators, each with 1 request to read and 12 to reject, created on the VM with `perf/generate-fixtures.js` and the application's credential | The staging cluster admits only the VM's IP (DEC-003 v0.4); the access list is not widened |

### Expected results and pass/fail (written before the run)

```
Written (UTC): 2026-10-15T14:33:53Z

PASS if, and only if, over the whole run (ramp and window):
  - 0 failed requests: every login returns 201, every read 200, every transition 201,
    none times out (30 s) and none fails at the network or TLS level; and
  - 0 unhandled server errors: no response with a 5xx status.
FAIL otherwise: one failed request or one 5xx is enough (NFR-2.4: "no failed request and no
unhandled server error").

Expected outcome: PASS.
Expected volume (estimate, not a criterion): 100 logins; about 5,000 to 6,000 reads; about 900
to 1,000 transitions; about 10 to 11 requests/s in the window.
Latency: no target in NFR-2.4. Reported as p50, p95, p99 and max per request type, for
interpretation only. Every request carries the South Africa to Spain round trip
(150 to 180 ms, measured; DEC-003 v0.4), and every database call the Spain to Netherlands hop.
Database throughput: DEC-010 re-opens if the load test exceeds 70 % of the M0 100 ops/s
ceiling. The load client cannot measure database operations; the data baseline (§7) estimates
about 9 operations per transition, which puts this workload around 40 to 50 ops/s. If the
Atlas metrics for the window are available, they are recorded with the result.
```

### Environment

```
VM                       : Azure, Spain Central (staging, 158.158.115.[redacted])
Database                 : Atlas civicconnectstaging, M0, Azure westeurope (Netherlands); not
                           colocated with the VM, so every database call crosses Spain to
                           the Netherlands (DEC-003 v0.4)
Client location          : Stellenbosch, South Africa (R. van der Merwe's workstation)
Client Node              : v26.0.0
TLS                      : NODE_EXTRA_CA_CERTS=<path to the local copy of staging.crt>;
                           the SHA-256 the run prints must be 74:2D:A5:C0:...:72:86:68:B2 (section 3a).
                           NODE_TLS_REJECT_UNAUTHORIZED=0 is NOT used; the script refuses to
                           run with it.
Scripts                  : perf/load-run.js as merged in PR #109 (commit 42cde98); perf/generate-fixtures.js and perf/cleanup-fixtures.js as in PR #110 (commit 934bf26)
```

### Fixtures (on the VM)

Four fixture runs were made. Each is recorded as it happened, from the console output and
R. van der Merwe's account.

```
Attempt 1, run 27406cf8 (perf/generate-fixtures.js as merged in PR #109)
  Started (UTC): 2026-10-15T15:27:28.797Z
  $ sudo node --env-file=/etc/civicconnect/staging.env /tmp/generate-fixtures.js --app-dir /opt/civicconnect --out /tmp/perf-fixtures.json
  Host check passed; database user civicconnect-app; Node v22.23.3 (the VM)
  FAILED: code 8000 MongoBulkWriteError; partial fixtures for run 27406cf8 may remain (synthetic)
  Exit code: 2
  Ended (UTC)  : 2026-10-15T15:27:29Z
  The script printed only the code. With the fixed script (below) the refusal read
  "not allowed to do action [find] on [test.users]". Two causes:
    1. MONGODB_URI in /etc/civicconnect/staging.env had no database name, so the driver used
       its default database, "test", on which civicconnect-app has no grants. The role itself
       was correct: find, insert, update and remove on users and requests in civicconnect.
       See "Configuration correction" below.
    2. Mongoose's automatic collection and index creation, which the application credential
       may not perform. The fixed script turns it off.
  Cleanup dry run (cleanup-fixtures.js), 2026-10-15T16:12:48Z: 0 users, 0 requests for run
  27406cf8. The attempt wrote nothing.

Fix (branch fix/perf-fixtures-batching, PR #110): writes in batches of 25, 500 ms apart;
automatic collection and index creation off; MongoDB's full message and nested write errors
printed (redacted); cleanup-fixtures.js removes one run by its tag.

Attempt 2, run f44598a6
  Started (UTC): 2026-10-15T16:14:16Z
  Aborted by hand (Ctrl+C) after the 100 users were inserted, before the requests.
  Its 100 users were removed with cleanup-fixtures.js --run f44598a6 --confirm.
  <cleanup output and time>

Attempt 3, run c0a3b855
  Started (UTC): 2026-10-15T16:15:36Z; succeeded 2026-10-15T16:16:06Z
  Not used by the load run. /tmp/perf-fixtures.json on the VM was removed before the run
  was used. Run c0a3b855 was then removed from the database with cleanup-fixtures.js.
  <cleanup output and time>
  A copy of run c0a3b855's fixture file was nevertheless found on the load client, in the
  user's home folder, and deleted at 2026-10-15T16:55:44Z (see the load run below).

Attempt 4, run 77b08804 (used by the load run)
  Started (UTC): 2026-10-15T16:25:03Z; succeeded 2026-10-15T16:25:33Z
  Fixture file copied to the client (scp), then deleted on the VM just before the load run
  started at 16:30 UTC (exact time not recorded).
```

### Configuration correction during the deploy

```
Found      : by fixture attempt 1's error, "not allowed to do action [find] on [test.users]"
Defect     : MONGODB_URI in /etc/civicconnect/staging.env did not name the database, so the
             application connected to the driver's default database, "test", instead of
             "civicconnect". The connection itself, and the health ping, succeeded.
Corrected  : /civicconnect added before the query string; the service restarted
             (sudo systemctl restart civicconnect-staging).
Time (UTC) : <time of the edit and restart>
Effect     : from the deploy until the restart, the running application used the wrong database.
             The step 7 health check at 14:19:22 UTC was made before the correction; its
             "database: up" shows the ping succeeded, which does not depend on the database
             name. The load run (16:30 UTC) and the smoke test (17:02 UTC) ran after it.
             Index provisioning (step 5) was unaffected: .env.provision named /civicconnect.
```

### Run (from South Africa)

```
Started (UTC): 2026-10-15T16:30:21Z
$ NODE_EXTRA_CA_CERTS=<local copy of staging.crt> node perf/load-run.js --base-url https://158.158.115.[redacted] --fixtures <local fixture file> --out docs/evidence/M3-perf/NFR-2.4_load_run_2026-10-15.txt --client-location "Stellenbosch, South Africa"
Full output: docs/evidence/M3-perf/NFR-2.4_load_run_2026-10-15.txt

Client location             : Stellenbosch, South Africa
Client Node                 : v26.0.0
NODE_EXTRA_CA_CERTS         : set; SHA-256 74:2D:A5:C0:DF:68:F6:29:A7:61:41:33:5D:0B:53:F8:6D:5E:DD:2C:53:90:50:46:74:A4:DC:19:72:86:68:B2
                              (matches the staging certificate, section 3a)
NODE_TLS_REJECT_UNAUTHORIZED: unset
Fixture run                 : 77b08804
Workload                    : 100 users; ramp 60 s; window 600 s after the last login; think 10 s;
                              a transition every 6 iterations; timeout 30 s
All users logged in (UTC)   : 2026-10-15T16:31:21.591Z
Ended (UTC)                 : 2026-10-15T16:41:31.777Z

Per request type (all phases):
  login      n=  100  failed=0  p50 430 ms  p95 451 ms  p99 697 ms  max 808 ms  statuses {"201":100}
  read       n= 5835  failed=0  p50 206 ms  p95 249 ms  p99 464 ms  max 748 ms  statuses {"200":5835}
  transition n=  900  failed=0  p50 315 ms  p95 631 ms  p99 703 ms  max 897 ms  statuses {"201":900}
Requests in the 600 s window: 6735 (11.04 requests/s)

Failed requests              : 0
Unhandled server errors (5xx): 0
RESULT PASS: NFR-2.4, 100 concurrent authenticated users for 600 s: 0 failed requests, 0 unhandled server errors
Exit code    : 0
Ended (UTC)  : 2026-10-15T16:41:31Z   (before the smoke test's start, section 9)
Fixture files deleted on the client (UTC): 2026-10-15T16:55:44Z (two copies: run 77b08804's, in the repository root,
                              not covered by .gitignore; and run c0a3b855's, from
                              attempt 3, in the home folder. Neither was ever committed)
```

**NFR-2.4: PASSED on staging.** 100 concurrent authenticated users for 600 s, with 0 failed
requests and 0 unhandled server errors, against the criterion written before the run.

Result against the expected outcome: **as expected.**

| Expected (written 2026-10-15T14:33:53Z) | Actual |
|---|---|
| PASS: 0 failed requests, 0 unhandled server errors | PASS: 0 and 0 |
| 100 logins | 100, all 201 |
| About 5,000 to 6,000 reads | 5,835, all 200 |
| About 900 to 1,000 transitions | 900, all 201 |
| About 10 to 11 requests/s in the window | 11.04 requests/s, at the top of the estimate |

Interpretation:
- **What it shows.** On the release candidate deployed to staging, 100 concurrently authenticated
  users ran login, read and status-transition requests for the 10 minutes AC-NFR-2.4 states, and
  no request failed and no server error occurred. The 900 transitions each ran the DEC-016
  transaction with the unique indexes provisioned in step 5 in place.
- **Latency, for interpretation only (NFR-2.4 sets no target).** The read median, 206 ms, is close
  to the measured South Africa to Spain round trip of 150 to 180 ms (DEC-003 v0.4), so most of
  it is network distance, not processing. Transitions cost more (p50 315 ms, p95 631 ms): each
  makes several database calls, and every one crosses from the VM in Spain to the cluster in the
  Netherlands. Login (p50 430 ms) includes the scrypt verification (DEC-018). The run is one
  sample; p99 and max are single outliers and are not compared across runs.
- **What it does not show.** One run from one client network. Staging, not production: synthetic
  data, a disposable VM, an M0 cluster in another country from the VM. "The standard journeys"
  are not defined by the requirement; the journey is the team's (login, read, transition), and
  request submission and lists are not built, so they are not exercised. Database throughput
  was not measured from the client: whether the DEC-010 trigger (70 % of 100 ops/s) was
  approached is not recorded: the Atlas metrics for 16:30 to 16:42 UTC were not captured.

## 9. Smoke test against the staging HTTPS URL

`scripts/smoke/phase0-smoke.js`, run on the VM against the staging HTTPS URL, with the staging
environment file. It seeds one synthetic Coordinator and one request on the staging cluster
and leaves them in place (synthetic data; DEC-003 *Environment map*).

### Expected results (write before the run)

```
Written (UTC): 2026-10-15T16:56:32Z

Run on the VM, not from South Africa: the script seeds its fixture directly on the staging
cluster through MONGODB_URI, and the cluster admits only the VM's IP (DEC-003 v0.4). The HTTP
calls go to the public HTTPS address, through Nginx, trusting the staging certificate via
NODE_EXTRA_CA_CERTS.

Expected, one line per check, each PASS:
  1 health is public and reports the database up          : 200, database "up"
  2 transition without a session is refused                : 401
  3 login sets __Host-sid and stores only its hash         : 201, __Host-sid set
  4 transition with the session commits, with exactly one
    history entry                                          : 201, 1 history entry
  5 logout ends the session                                : 204, session document removed
  6 the old cookie no longer works                         : 401
Exit code: 0 (the script exits 0 only if all six pass)
Database user printed: civicconnect-app
```

### Run

```
Started (UTC): 2026-10-15T17:02:22.774Z (as printed by the script)
$ cd /opt/civicconnect && sudo NODE_EXTRA_CA_CERTS=/etc/ssl/certs/staging.crt node --env-file=/etc/civicconnect/staging.env scripts/smoke/phase0-smoke.js --base-url https://158.158.115.[redacted]

M3 Phase 0 smoke check (reachability only)
Run at      : 2026-10-15T17:02:22.774Z
Node        : v22.23.3
Base URL    : https://158.158.115.[redacted]
Database user : civicconnect-app

Fixture     : user 6ad1071ff46f620b4b023a54, request 6ad1071ff46f620b4b023a56 (CC-2026-174933), status Received

PASS  1 health is public and reports the database up  - 200 {"application":"up","database":"up","release":"30ff0c6df9f73cd8b14be9cf3e0dc659e1cacbcc"}
PASS  2 transition without a session is refused  - 401
PASS  3 login sets __Host-sid and stores only its hash  - 201; attributes: Path=/; HttpOnly; Secure; SameSite=Lax
PASS  4 transition with the session commits, with exactly one history entry  - 201 ETag "v1"; status Rejected, version 1, history entries 1
PASS  5 logout ends the session  - 204; session document removed: true
PASS  6 the old cookie no longer works  - 401

6/6 checks passed.
Exit code    : 0
Ended (UTC)  : 2026-10-15T17:02:24Z
```

The output is as printed, except that the base URL's last octet is redacted here (DEC-003 v0.4).

**Record any failure exactly as it happens.** Do not edit the script, and do not re-run it
until it passes. A failed run is recorded here as it is; any later run is recorded separately,
with its own time and the reason for it.

Result against the expected outcome: **as expected.** All six checks passed, exit code 0, and
the database user was civicconnect-app.

Interpretation: on the deployed release candidate, reached over HTTPS through Nginx with the
staging certificate verified, the health endpoint reports the tagged commit (30ff0c6, section 2)
and the database up; an unauthenticated transition is refused; login sets a __Host- cookie with
Secure, HttpOnly, SameSite=Lax and Path=/; an authenticated transition commits with exactly one
history entry; logout removes the session; and the old cookie is refused. It ran after the load
run, as ordered. It does not show more than one user, any role other than the fixture's, or
behaviour under load (section 8).

## 10. Rollback plan (M3 brief §14)

**Target to restore:** `<previous tag or commit>`, deployed with DEC-003's rollback rule:
steps 1, 2, 3, 4, 6 and 7. Step 3 (client build) is included, because `client/dist` is
git-ignored and checking out the old tag does not replace it. Step 5 (index provisioning) is
not run; the indexes already provisioned stay in place.

**Data and configuration concerns:**

- Data: <documents written by this release that an older release may not read; migrations are
  forward-only and additive within a release, and this release has none>.
- Indexes: <the 21 indexes provisioned in step 5 stay; whether the older release declares the
  same set>.
- Configuration: <`RELEASE_COMMIT` in `/etc/civicconnect/staging.env` must be changed to the
  restored commit, or `/health` reports the wrong release>.
- Client: <client/dist rebuilt from the restored tag>.

**How a rollback is verified:** `/health` reports the restored commit; the smoke test re-run (section 9).

---

## What this record does not show

- <limits: staging is not production; synthetic data; the regions and the latency rule in
  DEC-003 v0.4, *Performance testing and region*; anything not run>.
