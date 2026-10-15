# CivicConnect — M3 E2E Test Plan: thin React client, E2E-1 and E2E-2

| | |
|---|---|
| **Artefact** | Test plan for the thin client and the two end-to-end cases on PR #89 |
| **Version** | 0.1 |
| **Author** | Ethan Lindsay |
| **Written** | 12 October 2026, before the client, the E2E specs or any E2E run existed |
| **Published** | 13 October 2026, in PR #89, after the runs |
| **Status** | Executed. The client, `e2e/` and `tests/clientBoundary.test.js` were built from this plan and run on 12 October 2026. Run record: `docs/evidence/M3-e2e/E2E_local_run_2026-10-12.txt`. Negative verifications (§7): NV-71 to NV-82 in `docs/evidence/M3-e2e/`. Tooling decision: DEC-019 |
| **Code examined** | `task/M3-request-read-endpoint` at `a22b450`. Line numbers in this plan refer to that commit |
| **Traces to** | FR-1.1, FR-1.3, FR-6.3, FR-6.4, FR-6.6, NFR-3.3; AC-FR-1.1, AC-FR-1.3, AC-FR-6.3, AC-FR-6.4, AC-FR-6.6, AC-NFR-3.3; DEC-015, DEC-018, DEC-019 |

**When it was written.** The negative-verification records cite §7 for their expected
failures, which were "written down before the run". The plan's content was last changed at
17:05 UTC on 12 October 2026, and the first E2E run (NV-71) started at 21:22 UTC that day.
That time is the file's modification time on the author's machine, not a repository record.
The repository can show only that the plan was committed on 13 October 2026, after the runs.

**Predictions are left as written.** Where an outcome differed from §7 (NV-76, NV-77, NV-80
were caught one step earlier than predicted), the NV record says so; the plan was not
corrected to match.

**Edits made when publishing.** Content is otherwise unchanged from the 12 October text.
1. This header replaces the working note at the top.
2. §0 is reworded so that it does not depend on an earlier unpublished draft.
3. §6: "checked" now names what was checked, the harness source.
4. §8: the heading, and D10's "(number yours)".
5. §8 "Contradictions in the record": one item about a local, uncommitted file is removed.
6. The closing verification section's heading.

---

## 0. Starting point
- The read endpoint exists: GET /:id returns exactly {reference, status, version} with ETag "v<n>".
- The client has a status source: shared/domainValues.js, which has no imports.
- E2E-2 asserts 403 and is expected to fail until DEF-011 is fixed.
- Removing the GET guard is already NV-27, caught by npm test. Not repeated at E2E level.
- Fixtures: reuse #88's harness instead of a separate e2e seed script.
- The npm test baseline is 158 tests (docs/evidence/M3-read-endpoint/INDEX.txt). Re-measure.
- FR-4.2 must not be recorded as verified. AC-FR-4.2 needs category, location, description, status, submission details, assignment, comment and action history. The endpoint returns three fields.
- "Nginx serves the React build" comes from DEC-015 §5. DEC-003 v0.2 says only that Nginx is the reverse proxy.

## 1. The client: what it does and nothing more
Its purpose is to drive E2E-1 and E2E-2. It is not a UI deliverable.

**Screens.** No router library; App reads location.pathname.
- **/requests/:id:** the detail view. Any other path shows "No such page".
- **Sign-in prompt:** rendered in place on the detail address, with the URL unchanged (AC-FR-1.1 decision). It has a labelled email and password form.
- **Detail view:** reference, status (the server's value, unmapped), a transition form and a sign-out button.
- **Transition form:**
  - a select built from Object.values(STATUS), all seven values, unfiltered;
  - a reason textarea that is always visible;
  - a submit button;
  - no resolution field.
- **Problems:** one role="alert" element showing the problem's status, code, title and detail verbatim. A body that isn't problem JSON shows "HTTP <status>".

**API calls.** All go through one client/src/api.js wrapper (DEC-015 Consequences), same-origin, with relative /api/v1 URLs.
1. **GET /api/v1/requests/{id}** on load and after each successful transition. The ETag header is kept as an opaque string, never rebuilt from body.version.
2. **POST /api/v1/sessions** with {email, password} and Content-Type: application/json (415 otherwise). On 201 it re-reads.
3. **POST /api/v1/requests/{id}/transitions** with {toStatus, reason}; reason is omitted when empty.
   - Headers: Content-Type application/json; If-Match set to the stored ETag verbatim; Idempotency-Key set to crypto.randomUUID(), new per click.
   - No automatic retry.
4. **DELETE /api/v1/sessions/current**: 204, then the prompt is shown.
5. **Any 401** shows the prompt.

**Domain values.** client/src imports STATUS from ../../shared/domainValues.js. That is the only import from outside client/. vite server.fs.allow may need ../shared. The E2E specs import STATUS and ROLE from the same module.

**It will NOT:**
- have a list, submission, history, assignment, comments, notifications or reports;
- have any security-category UI or status mapping;
- do any client-side rule or field validation (TD-003 containment);
- have 412 reload handling;
- retry, store tokens, make cross-origin calls or need CORS;
- use a router, state library or UI kit;
- make any NFR-1.1 or NFR-1.2 claim;
- show the NFR-4.3 notice.

## 2. The two cases

### E2E-1: Coordinator rejects a Received request (Chromium)

**Traces to:**
- FR-1.1 / AC-FR-1.1, detail address only;
- FR-6.6 / AC-FR-6.6, refusal and store-reason clauses only, not "displays it in the history";
- FR-6.3 / AC-FR-6.3;
- DEC-015 §2–4, DEC-018 §3–5.

It exercises FR-4.2's provisional endpoint but does NOT verify FR-4.2.

**Inputs.** One fixture from #88's createFixture():
- fresh campus and category;
- a user with [ROLE.COORDINATOR], authorised for that category;
- a Received request at version 0 with securityCategory false, keeping it out of OI-15, OI-16 and OI-17;
- a run-unique reason.

**Steps and expected results:**
1. **Unauthenticated: open /requests/{id}.**
   - The prompt is visible, the URL is unchanged, and the reference is absent from the page.
   - The GET is 401 problem+json, code UNAUTHENTICATED, with no reference, status or version.
   - A direct page.request.get with no cookie gets the same.
   - [AC-FR-1.1 Then; DEC-015 §4; DEC-018 §4; owner: "address" = page and API]
2. **Sign in.**
   - POST /sessions returns 201.
   - The GET returns 200 with ETag exactly "v0" and a body of exactly {reference, status, version}: the seeded reference, STATUS.RECEIVED, 0.
   - The page shows them.
   - This is the NV-43 assertion.
3. **Rejected with no reason.**
   - A transition POST must be observed; if none is sent, the client validated and the test fails.
   - Response 422 INVALID_TRANSITION, shown in the alert.
   - Database: Received, version 0, no closure.reason, zero history entries for the requestId.
   - [DEC-015 §4 row 422; AC-FR-6.6 "first attempt is refused"; RTM FR-6.2 "a refused transition writes nothing". This stays 422 after the DEF-011 fix.]
4. **With a reason.**
   - The request carried If-Match equal to step 2's ETag and an Idempotency-Key in UUID v4 form.
   - Response 201 with ETag "v1"; the re-read shows Rejected.
   - Database: Rejected, version 1, closure.reason equal to the reason.
   - Exactly one history entry, with actorId the fixture user, actorRole Coordinator, Received to Rejected, body equal to the reason, occurredAt within the test window, and requestVersion 1.
   - [AC-FR-6.3 Then; AC-FR-6.6 "stores the reason"]
5. **Sign out.**
   - DELETE returns 204 and the prompt is shown.
   - Reload: the prompt with no reference, and the GET returns 401.

**What it shows:** a real Chromium session through the composed production entry point (src/server.js → composeApplication) on the Atlas test cluster:
- the __Host-sid cookie round trip;
- the prompt shown in place;
- the read path reading the requests collection (NV-43);
- If-Match taken from the server's ETag;
- the server, not the client, refusing a missing reason;
- the history entry checked field by field;
- on staging, the Nginx/TLS same-origin path.

**What it does not show:**
- "displays it in the history";
- any list address;
- atomicity (#88 case 3);
- replay or indexes (DEF-014);
- the audit trigger, idle expiry or refusal of plain HTTP;
- non-Chromium browsers;
- FR-4.2.

### E2E-2: wrong role, bypassing the UI (split, D1)

**Traces to:**
- **E2E-2a:** FR-6.4 / AC-FR-6.4, NFR-3.3 / AC-NFR-3.3, and FR-1.3 / AC-FR-1.3's first two clauses. The recording clause is not built.
- **E2E-2b:** DEC-015 §4 row 403, which cites FR-1.3, FR-6.4 and NFR-3.3. No AC states a status code.

**Inputs:**
- createFixture({ roles: [ROLE.TECHNICIAN] }), authorised for the category on purpose, so that only checkTransition's role rule can refuse;
- a Received request at version 0;
- a body of {toStatus: STATUS.REJECTED, reason: <unique>};
- a fresh key, and If-Match taken from the GET.

**Steps:**
1. Sign in through the UI.
2. Precondition: the GET returns 200, so a later 403 can't come from category authorisation.
3. page.request.post to /transitions, bypassing the form.

**E2E-2a expected results (passes today):**
- status ≥ 400 and problem+json;
- no reference, status or version in the body;
- database: Received, version 0, no closure, zero history;
- reload shows Received.

**E2E-2b expected result:** 403, code FORBIDDEN.

## 3. The expected failure
- **E2E-2b** fails until DEF-011 is fixed. Its assertion is expect(response.status()).toBe(403).
- **Today it gets** 422 INVALID_TRANSITION, from statusTransitionService.js:88 via the role refusal at requestStatus.js:126–127.
- **openapi.yaml:282–286** currently lists "a role that may not make this move" under 422, which contradicts 2b until the DEF-011 fix PR changes it.

## 4. Running them, fixtures and the gate

**Tool and settings:**
- Playwright, Chromium only;
- retries 0, workers 1;
- no waitForTimeout;
- trace retain-on-failure;
- list and json reporters.

**Command:** npm run test:e2e, which runs npm --prefix e2e test.

**webServer** starts two processes, with reuseExistingServer false (required for the NV-43 re-run):
1. node --env-file=<env> src/server.js, readiness on /api/v1/health;
2. vite preview of a fresh client/dist, proxying /api to http://127.0.0.1:$PORT.

The page is opened at http://localhost:<port>, the only plain-HTTP origin where a __Host- Secure cookie works (DEC-018 §3). The proxy targets 127.0.0.1 because of DEF-004. Locally, vite preview stands in for Nginx, and the run record says so.

**Where they run:** locally against the Atlas test cluster, and on staging once deployed. NOT in CI:
- the DEC-003 access list (no 0.0.0.0/0);
- DEF-006 fixtures;
- no stored credential.

The database-free parts (the client build and tests/clientBoundary.test.js) run in CI.

**Fixtures:**
- Reuse #88's harness helpers: createFixture, snapshot, entriesForKey and the skip reason. Don't copy them.
- civicconnect-app's grants are enough.
- DEF-006: assertions are scoped to requestId or actorId, never to counts.
- DEF-014: no assertion depends on an index.
- The Playwright config refuses to start unless MONGODB_URI contains civicconnecttest, the same rule as the harness, and never prints the URI.
- The server and the fixtures must read the SAME env file. Otherwise you get a false 404 that looks like NV-43.
- DEF-013: any login or cookie failure is recorded as a possible occurrence and never re-run until green.

**The gate:**
- It is not a GitHub required check (D3).
- E2E-2b is marked test.fail("DEF-011: DEC-015 §4 requires 403; code returns 422"), so the run exits 0.
- When DEF-011 is fixed, Playwright reports "expected to fail, but passed" and the run goes red until the annotation is removed. The 403 assertion is never edited.
- E2E-2a carries the refusal assertions as an ordinary test, because test.fail is satisfied by any failure.
- Each run record quotes 2b's actual "Expected: 403, Received: 422" text.

## 5. Files

**New:**
- **client/** (own lockfile):
  - package.json: react and react-dom; dev dependencies vite and @vitejs/plugin-react;
  - vite.config.js, index.html;
  - src/main.jsx, App.jsx, api.js, SignIn.jsx, RequestDetail.jsx.
- **e2e/** at the repository root, outside node --test's default patterns:
  - package.json with @playwright/test only, and no mongoose (one model registry);
  - playwright.config.js;
  - journey.spec.js (E2E-1);
  - wrong-role.spec.js (2a and 2b);
  - support/cluster.js.
- **tests/clientBoundary.test.js,** in npm test with no database:
  - client/src imports nothing from src/;
  - client/src imports shared/domainValues.js;
  - client/src contains none of the seven STATUS strings or the six ROLE strings as literals.
- **docs/evidence/M3-e2e/:**
  - INDEX.txt;
  - one run record per case per environment;
  - one NV record per §7 item, under the next free NV numbers;
  - one --repeat-each stability measurement.

**Changed:**
- Root package.json: test:e2e and build:client scripts. This conflicts with #88's package.json, so sequence after #88.
- .gitignore: client/dist, e2e/test-results, e2e/playwright-report.
- ci.yml: a client build job and the boundary test.
- ESLint config: browser and JSX for client/, and e2e/.

**Unchanged:** src/app.js (no static serving), CORS and openapi.yaml.

**Not in #89:** the Nginx site config (try_files … /index.html, /api proxy) and the staging deploy. Those are Robert's (D7).

## 6. Dependencies on #87 / #88
- Harness reuse needs #88 merged and #89 updated from dev. Merge order: #87, then #88, then update #89.
- Importing the harness registers no hooks; only useCluster() does. Checked against the harness source. Its top-level imports of mongoose and the models are side-effect free for this purpose.
- The guard and the env file (D5): #88's test:integration reads .env with a DNS override; SMOKE-01 used .env.test.
- D5 / DEF-011: #88 now has tests/integration/wrongRoleTransition.integration.test.js, which asserts 403 (DEF-011's regression test). E2E-2b overlaps it. Keep both: the integration test is DEF-011's regression evidence, and E2E-2b is the deployed-surface check for AC-NFR-3.3.
- Nothing on #88 reads GET /:id, so NV-43 stays open there.

## 7. Negative verifications
Each record follows the existing format: claim, sabotage diff, expected failures written down beforehand, output, restore with SHA-256, re-run. All are local on the test cluster.

**E2E-1:**
- **NV-43 re-run:**
  - Sabotage: at composition.js:39 change `requests: requestRepository` to `requests: historyRepository`. Expected: step 2 fails, GET 500.
  - Second variant: userRepository, which has findById. Expected: a 404, showing the catch doesn't rely on a crash.
  - Needs reuseExistingServer false.
  - Recorded under the next free NV number. NV-43 itself stays "NOT CAUGHT in npm test and CI".
- **Client validates the reason itself:** step 3 fails, no POST observed.
- **Client drops Idempotency-Key:** step 4 fails, 400.
- **Client drops If-Match:** step 4 fails, 428.
- **Remove the hasReason clause in checkTransition:** step 3 fails, 201.
- **History body set to null:** step 4's field check fails.
- **Fake sign-out without DELETE:** step 5's reload gets 200 and fails.

**E2E-2:**
- **Add TECHNICIAN to DISPOSITION_ROLES:** 2a fails with 201. 2b stays an "expected failure"; record this as the evidence for the split.
- **Simulated DEF-011 fix (local throwaway):** 2b passes, "expected to fail, but passed", and the run exits non-zero.

**Boundary test:**
- a STATUS literal copied into client/src: fails;
- an import from src/ in client/src: fails.

## 8. Decisions for the project owner
- **D1. Split E2E-2 into 2a (normal) and 2b (test.fail)?** Yes: under a single test.fail, a real authorisation regression would pass as "expected failure".
- **D2. DEF-011's fix PR removes the 2b annotation and attaches a local E2E run?** Yes. Record it in DEF-011's K and M cells on #88.
- **D3. What the gate blocks:**
  - #89 leaves draft only with a recorded local run (E2E-1 and 2a pass; 2b an expected failure, quoted) and the §7 records;
  - the production release tag requires a recorded staging run;
  - no GitHub required check.
- **D4. Reuse #88's harness after it merges?** Yes.
- **D5. One env file name** across #88 and E2E, settled on #88.
- **D6. Staging:**
  - fixtures created by a host-side script on the VPS;
  - API-level assertions only;
  - test accounts revoked at teardown;
  - or defer staging until the deployment exists.
- **D7. Who builds client/dist for Nginx?** DEC-003's deploy procedure has no client step. Robert's call; a new DEC-003 version.
- **D8. Client choices:** all seven statuses, the reason always visible, no resolution field.
- **D9. CI:** the boundary test goes in npm test on #89; the client build job lands after #86.
- **D10. Vite and Playwright** need a Decision Log entry (number to be allocated by the owner). DEC-002 doesn't cover build or test tooling.
- **D11. Don't assert AC-FR-1.3's recording clause.** It stays partial in the RTM.
- **D12. Is a whitespace-only reason acceptable under FR-6.6?** statusTransitionService.js:80 uses hasReason: Boolean(reason). If not, log it as the next free DEF. E2E won't test it.

**Contradictions in the record:**
1. openapi.yaml:286 lists the wrong-role refusal under 422, against DEC-015 §4 (DEF-011).
2. RTM v0.9 FR-6.4, cell I: "DEC-015: 403/422". It should say 403 for the role, and 422 for an undefined move or a missing reason.
3. DEC-003's Test row says "CI runner … database dropped per run". In practice runs are local and nothing is dropped (DEF-006). The access list says VPS IP only, yet local runs reach the test cluster.
4. DEC-015 §5 says Nginx serves the React build, but DEC-003's deploy procedure has no client build step (D7).
5. #87/#88 spec: D5 is in §2, but §4–§6 have no matching case section (the test file exists). S3 describes the old skip rule.
6. AC-FR-1.1 says "any request list or request detail address", but no list exists, so claim the detail address only.

## Verification against the record and the code (12 October 2026)
- **AC wording:** checked against Acceptance Criteria v0.3 on dev, not the outdated CSV. All IDs exist: AC-FR-1.1, AC-FR-1.3, AC-FR-4.2, AC-FR-6.3, AC-FR-6.4, AC-FR-6.6, AC-NFR-3.3. Given, When and Then match the plan.
- **AC-FR-1.3** Given/When: "a user authenticated as a Technician … invokes an operation reserved to the Coordinator role". That is E2E-2 exactly.
- **AC-NFR-3.3** When: "invoked directly against the server interface, bypassing the user interface". That is E2E-2 step 3.
- **RTM v0.9 FR-6.4 cell I** confirmed: "DEC-015: 403/422 [further design entries pending - criterion E]".
- **Code:**
  - composition.js:39 is the requestQueryService wiring line;
  - the role refusal is at requestStatus.js:126–127;
  - openapi.yaml:286 has "a role that may not make this move";
  - DEC-015 line 123 is the Nginx source;
  - DELETE /sessions/current returns 204 (sessionRoutes.js:31–35);
  - 415 and 401 UNAUTHENTICATED are in errors.js;
  - hasReason is at statusTransitionService.js:80.
- **Not verified:** the exact 201 body keys of POST /sessions. sessionRoutes.js:25 returns `json(user)`, whatever authService returns. Check during implementation.
- **Not verified:** Playwright and Vite behaviour (test.fail semantics, the vite preview proxy, fs.allow). Standard tool behaviour, to confirm while building.
