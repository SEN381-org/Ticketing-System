# DEC-019 — Client build tool (Vite) and end-to-end test runner (Playwright)

| Field | Entry |
|---|---|
| **ID** | DEC-019 |
| **Date** | 12/10/2026 |
| **Owner** | Ethan Lindsay |
| **Status** | Proposed. Decided on approval of this PR |
| **Affects** | FR-1.1, FR-1.3, FR-6.3, FR-6.4, FR-6.6, NFR-3.3, AC-FR-1.1, AC-FR-1.3, AC-FR-6.3, AC-FR-6.4, AC-FR-6.6, AC-NFR-3.3, CON-003, CON-008, DEC-002, DEC-003, DEC-014, DEC-015, DEC-018, TD-003 |
| **Closes** | Nothing open. DEC-002 fixes React as the client framework but says nothing about how the client is built or how it is tested end to end |

## Context

M3 is assessed on a running, deployed, integrated release candidate. Two end-to-end cases
are planned for PR #89: a Coordinator rejecting a Received request (E2E-1), and a wrong-role
transition sent straight to the server (E2E-2). Both need a browser client, and a browser
to drive it.

The record already constrains both choices:

- **DEC-002** fixes React on the client.
- **DEC-015 §5** has Nginx serve the React build and proxy `/api`, same-origin, so the build
  output must be static files with no server runtime of its own.
- **DEC-018 §3** sets the session cookie as `__Host-sid` with `Secure`. A test must run in a
  real browser for the cookie round trip and the in-place sign-in prompt (AC-FR-1.1) to be
  exercised at all.
- **DEC-014** keeps the client a separate tier. The client may import only the browser-safe
  `shared/domainValues.js`, never the server's `src/`.
- **TD-003** relies on the client doing no rule checks, so the E2E cases must be able to
  observe that a request was actually sent.
- **CON-003** prefers free tooling. **CON-008** says the institution does not guarantee any
  framework or tool on its platforms.
- **DEF-011.** The wrong-role case asserts 403 per DEC-015 §4 and is expected to fail until
  DEF-011 is fixed. The runner must be able to record an expected failure without the
  assertion being weakened.

## Decision

### 1. Vite builds the client

- `client/` is its own package with its own lockfile. React and react-dom are dependencies;
  Vite and its React plugin are development dependencies. The root package, its lockfile and
  the VPS's `npm ci --omit=dev` are unaffected.
- `npm run build:client` produces static files in `client/dist`, which Nginx serves
  (DEC-015 §5). Locally, `vite preview` stands in for Nginx and proxies `/api` to the API on
  `127.0.0.1` (DEF-004).
- Versions are those pinned in `client/package-lock.json`.

### 2. Playwright runs the end-to-end cases

- `@playwright/test`, Chromium only, in its own `e2e/` package. It is added when the E2E
  specs are built, after PR #88 merges, because they reuse its fixture harness.
- Settings: `retries: 0`, so a failure is never retried until green (CLAUDE.md §6, DEF-013);
  `workers: 1`.
- Playwright starts the real API entry point (`src/server.js`) and a fresh client build for
  each run, never reusing a running server. The NV-43 check depends on that.
- E2E-2's 403 assertion is marked as an expected failure, citing DEF-011. When DEF-011 is
  fixed, Playwright reports "expected to fail, but passed" and the run fails until the mark is
  removed. The assertion itself is never edited.
- The E2E cases run locally against the Atlas test cluster, and on staging once it exists.
  They do not run in CI: the DEC-003 IP access list, the fixtures left behind (DEF-006) and a
  stored credential all rule it out. The run is recorded as evidence, and it is the condition
  for PR #89 leaving draft. It is not a blocking gate.

### 3. The blocking gate is database-free

`tests/clientBoundary.test.js` runs in `npm test`, and so in CI alongside the #86 gates. It
fails if client source imports anything from `src/`, if it does not import
`shared/domainValues.js`, or if it contains any status or role value as a literal.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Create React App | No longer maintained, and it bundles a development server and test setup this project does not use |
| A hand-written webpack configuration | More configuration to own and review, for the same static output |
| Next.js or another server-rendering framework | Adds a Node rendering server beside Express. DEC-015 §5 has Nginx serve a static build |
| Cypress | Viable: it can also drive the client and send direct requests with the session cookie. Not chosen, because Playwright has a built-in expected-failure annotation (`test.fail`) for DEF-011, and its `webServer` setting starts both the API and the client build for every run |
| Selenium / WebDriver | Needs a separate driver for each browser and more setup, for a Chromium-only, two-case suite |
| No browser: `node:test` and `fetch` only | Cannot exercise the `__Host-` cookie in a browser or the in-place prompt (AC-FR-1.1), and cannot observe that the client sent a request instead of validating it (TD-003) |

## Consequences

- **DEC-003's deploy procedure has no client build step.** Today it is `npm ci --omit=dev`,
  migrations, restart. A procedure gap for R. van der Merwe to close at staging time, in a
  new version of DEC-003. Until then, nothing puts `client/dist` on the VPS.
- **Static analysis.** Once #89 is updated from dev, `eslint.config.js` (from #86) needs a
  block for `client/` with browser globals and JSX.
- **CI** does not build the client. A client-build job is a later change, not part of this
  decision.
- **NFR-1.1 browser coverage** is not claimed. Chromium only.

## Evidence still required

1. The pinned Playwright version, recorded when `e2e/` lands.
2. A recorded local E2E run: E2E-1 and E2E-2a pass, and E2E-2b is an expected failure with
   its 422 quoted. It is the condition for #89 leaving draft.
3. The client build step, added to DEC-003's deploy procedure before the staging run.
