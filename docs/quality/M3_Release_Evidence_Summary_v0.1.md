# CivicConnect — M3 Release Evidence Summary

| | |
|---|---|
| **Release candidate** | `v3.0-M3-rc` (`30ff0c6`), deployed to staging 15/10/2026 |
| **Version** | 0.1 |
| **Author** | Ethan Lindsay (drafted); agreed by R. van der Merwe and C. Burger [SLOT: agreement recorded in the pull request reviews] |
| **Date** | 16 October 2026 |
| **Basis** | M3 brief §15 and §16. Each line points to its evidence; PED v3.0 M3.5 to M3.10 interpret it |

## Classification: CONDITIONALLY READY

The core evidence is credible: every required gate passes at the release candidate, the
critical journey completes end to end, NFR-2.4 passes on staging, and staging is shown to run
the tagged commit. It is not READY because known, non-blocking limitations remain: P1 defects
open against DEC-015, unbuilt requirements, and a staging environment that differs from
production in recorded ways. None of them is a release-blocking risk for a staging candidate
holding synthetic data; each is listed below with its owner.

## Evidence

| Evidence area | Result | Interpretation | Concern / action |
|---|---|---|---|
| Build and CI | **Pass.** All five required checks on PR #106 (run 38737312900, Node 22), on a tree identical to the tag | The build, tests, layer rule, secret scan, lint, dependency audit and CodeQL analysis gate every merge; no bypass exists | CI does not run on pushes to `main` (accepted: `main` changes only by reviewed PR) |
| Automated regression | **Pass:** 199 tests, 191 pass, 0 fail, 8 skipped | Critical behaviour is protected: each of the ten M3 test records was seen to fail with its behaviour broken (NV-91 to NV-100, earlier NVs) | One gap found and recorded: no test asserts a reject without a reason is refused (NV-97, TD-006). Three intermittent failures open (DEF-013, DEF-016, DEF-018) |
| API/integration | **Partial, as designed:** 25 of 40 checks pass; the 15 failures are the five documented DEC-015 differences | The transaction boundary holds against a real cluster (NFR-1.10). Idempotency replay, the 412 body, the fingerprint, the problem type and the wrong-role status differ from DEC-015 | DEF-007 to DEF-011 open. The cases run by hand only (TD-008) |
| System/E2E | **Pass, as expected**, at the tag on the test cluster: E2E-1 and E2E-2a pass, E2E-2b fails as expected (DEF-011) | The critical journey completes in a browser: sign-in, read, a refused and an accepted reject with its history entry, sign-out; a wrong role is refused with nothing written | Not run in a browser on staging (Playwright targets localhost; no submission route on staging). On staging the smoke test passed 6 of 6 over HTTPS |
| Static/security | **One open finding:** CodeQL alert #1, missing rate limiting on login (high). Alert #2 was a false positive, fixed. npm audit clean; no secrets | The login route has no throttling; the slow password hash is the only limit (RSK-021, DEC-018) | Accepted for a synthetic staging release; must be decided before production |
| Performance | **Pass:** NFR-2.4, 100 concurrent authenticated users for 600 s, 0 failed requests, 0 unhandled server errors, 11.04 requests/s | Meets the requirement's own criterion. Latency (read p50 206 ms) is mostly the South Africa to Spain distance plus the Spain to Netherlands database hop | One run, one client network, on an M0 cluster not colocated with the VM; Atlas metrics not captured |
| Data integrity (indexes) | **Pass:** the 21 declared indexes provisioned and confirmed, RESULT PASS 21 of 21, on the test cluster (14/10, PR #102) and the staging cluster (15/10, PR #111); duplicates refused with 11000 on the test cluster (L2 to L4) | The uniqueness the design relies on (DEC-015 §3, DEC-016, FR-1.1) is enforced by the database on both clusters. TD-004 repaid | Duplicate refusal itself was exercised on the test cluster only; production has no cluster yet, and step 5 must run there before its first deploy |
| Known defects | **8 closed, 12 open** (Defect Register v0.5) | Closed include DEF-014, DEF-015 and DEF-017 (the missing unique indexes, closed on the test and staging evidence) and DEF-020 (the staging database name). Open: DEF-005 to DEF-013, DEF-016, DEF-018, DEF-019. Ten of them (DEF-006 to DEF-013, DEF-016, DEF-018) are P1, "before the M3 release candidate", and were not met | Recorded, not re-labelled. Each is judged non-blocking on its row; DEF-009 (S2) is the most serious |
| Acceptance | **Partial:** 27 requirements in M3 scope, traced in RTM v0.10 to test cases, expected results and execution evidence | Lifecycle, authorisation, append-only history, sessions, health and performance criteria are demonstrated | AC-FR-1.3 (rejected attempt recorded) is not met (TD-005); AC-FR-1.5 is met more strictly than written (OI-17); 52 requirements are out of M3 scope |

## Residual risks

| Residual risk | Why it remains | Current mitigation | Next action / owner |
|---|---|---|---|
| An idempotency key is honoured across requests (DEF-009) | The fingerprint omits method and path; fixing it changes DEC-015 behaviour, after the release candidate was frozen | The client generates a fresh random key for every transition (`client/src/api.js`); found and recorded by the API tests | Fix with DEF-007 to DEF-011 together, and run the integration cases in CI (TD-008). R. van der Merwe |
| Field-level restriction of security-category requests is not built (DEC-012 point 3) | Blocked on the stakeholder conflict CFL-002 / OI-16 | Non-Security-Officer staff are refused the whole request (stricter than FR-1.5) | Resolve OI-16, then build the serialiser. E. Lindsay |
| Unauthorised attempts leave no record (AC-FR-1.3) | Recorded as debt, not built (TD-005) | Every attempt is refused before any write | Record refusals before any production deployment. E. Lindsay |
| Login can be brute-forced at the rate the hash allows (CodeQL #1, RSK-021) | No throttling or lockout was required or designed | Slow scrypt hash; synthetic data only | Decide a throttling design before production. Team |
| Staging is not production-shaped | Disposable VM, self-signed certificate on an IP, database in another country, hand deploy with no deploy script or Nginx configuration in the repository, a configuration fault that went unseen by `/health` (DEF-020), and the client not served until Nginx was corrected (15/10, 20:35:57 UTC) | Every staging check verified the certificate; the release is identified by commit; the fault was found and fixed before the load run | Production infrastructure, a deploy script, a configuration check that rejects a URI without a database, and the next DEC-003 version. R. van der Merwe |
| Production-scale behaviour unknown | One load run on a free M0 cluster from one client network | NFR-2.4 met on its own criterion | Re-test on representative infrastructure before a real release. R. van der Merwe |
| The transition model may change (OI-15) | The edges and roles are a team proposal, not confirmed by the stakeholders | The model is data in one file, tested as the code's own table | Confirm with the stakeholders; tests follow. E. Lindsay |
| Intermittent test failures (DEF-013, DEF-016, DEF-018) | Causes unknown; messages not captured | Reported, never re-run to green | Capture names and messages with a reporter that records them. E. Lindsay |
