# DEC-003 — Deployment: Azure virtual machine for the application, MongoDB Atlas (one M0 per environment) for data

| Field | Entry |
|---|---|
| **ID** | DEC-003 (closed at M2 in the Decision Log v0.4. This ADR is the full structured record Master Brief §13 requires, replacing the one-row log entry as the authoritative rationale) |
| **Version** | 0.4 (13/10/2026). v0.3 (13/10/2026), v0.2 (11/10/2026) and v0.1 (29/09/2026) are preserved in `Outdated/` |
| **Changes from v0.1** | For DEC-018: the `civicconnect-app` role gains CRUD on `sessions`; the *Sessions / state* row names the store; the *Edge* row records the application settings that depend on the proxy. The `find`+`insert`-only grants on `requestHistory` and `auditLog` are **unchanged**, and the *Database users* row now states that the role's grants are per collection with no database-wide role, so the restriction cannot be undone by an additive grant. No other content changes |
| **Changes from v0.2** | The deploy procedure is written out as numbered steps (*Deployment procedure*) and gains two: a client build step (DEC-019's Consequences bullet and its Evidence still required item 3) and an index provisioning step (TD-004 repayment). A new rollback rule: a rollback must rebuild the client (step 3), because `client/dist` is gitignored and checking out the previous tag does not replace it. A new prerequisite: a staging run is required before a production release tag. The *Database users* row names the temporary index-provisioning user. The *Environment map* separates the Atlas project name from the cluster hostname and records the test environment's actual names (OI-19). The Test row's *App runs on* entry now reads "Developer machine" in place of the CI runner, and the *Status* line is updated for v0.3. The Test row's "database dropped per run" is unchanged and remains the subject of DEF-006 |
| **Changes from v0.3** | The application host changes from a Hostinger KVM VPS to an Azure virtual machine. No Hostinger VPS was provisioned. The *Application host* row records the provider (Azure for Students), region (Spain Central), VM size, operating system, cost and static IP, which answers evidence items 1 and 2. "VPS" becomes "VM" throughout. The *Alternatives considered* table gains a row for the Hostinger VPS. A new section, *Performance testing and region*, requires the staging Atlas cluster to be placed in Spain or the nearest Azure region and every performance result to state the region. The *Environment map* Production row becomes "TBD - separate infrastructure required": the Azure VM is for staging only and production will not share it. The deployment procedure, database users, secrets, release and rollback rules are unchanged |
| **Date** | 29/09/2026 |
| **Owner** | Robert van der Merwe (technology stack and deployment compatibility) |
| **Status** | Decided (v0.1); v0.4 changes take effect on approval of their PR. Plan-specific evidence items outstanding (see *Evidence still required*) |
| **Affects** | CON-003, CON-006, CON-007, CON-008, CON-010, CON-014, CON-015, CON-016, CON-019, NFR-1.5, NFR-1.6, NFR-1.8, NFR-1.9, NFR-2.4, NFR-2.5, NFR-2.7, NFR-3.2, NFR-3.5, NFR-3.7, SCP-014, SCP-015, DEC-002, DEC-010, RSK-008, RSK-015 |
| **Supersedes** | The DEC-003 deferment recorded at v1.0 (preserved in the log) |

## Context

The M1 deferment named the conflict precisely: CON-003 favours free services, while CON-006,
CON-007 and CON-019 need audit retention, backup and encryption, which free tiers commonly
omit. DEC-002 then committed to MERN on MongoDB Atlas. That moves the audit, replica-set and
encryption capabilities into the managed database and leaves the application host with a
narrower job: run a Node.js process behind TLS, hold secrets, and host four environments
(CON-016).

M2 brief §5.8 asks for a deployment *direction* and its compatibility implications, not a
production deployment. This ADR records the direction, the configuration, secrets, state and
networking implications, and what is deliberately left for M3.

## Decision

| Concern | Decision |
|---|---|
| **Application host** | *v0.4:* an **Azure virtual machine** under **Azure for Students**, replacing the Hostinger KVM VPS of v0.1 to v0.3. **Region:** Spain Central. The region is forced by the student subscription's policy, which allows only specific regions such as `malaysiawest`, `austriaeast`, `italynorth`, `indiasouthcentral` and `spaincentral`. **VM:** `Standard_B2ls_v2`, 2 vCPU, 4 GiB, Ubuntu Server 24.04 LTS, security type Standard. **Cost:** $34.97 per month list price, $0 actual: it is paid from the $100 student credit, which expires on 02/08/2027, and there is no renewal cost. **Static IP:** `158.158.115.[redacted]`. Root access on the VM is what lets us run Node.js, a reverse proxy and several environments side by side. The VM is a throwaway host for staging only: production will not share it and needs separate infrastructure, which is not yet decided |
| **Runtime** | **Node.js >=22.0.0**: Node 22 (maintenance LTS, supported to April 2027) is the minimum and the version deployed on the VM; `engines: ">=22.0.0"` lets developers on newer lines (e.g. 26) install without EBADENGINE, and `.nvmrc` = 22 fixes the default for nvm users. Replaces `>=20`: Node 20 reached end-of-life on 30 April 2026. Move to the next LTS line through controlled change before 22 reaches end-of-life |
| **Process model** | One `systemd` unit per environment (`civicconnect-staging`, `civicconnect-prod`), restart-on-failure. No pm2, so no additional dependency (CON-003/CON-008) |
| **Edge** | Nginx reverse proxy terminating **TLS 1.2+** with a Let's Encrypt certificate. HTTP→HTTPS redirect and HSTS (NFR-3.2). Node listens on localhost only. *v0.2:* Express runs with `trust proxy` set to `loopback`, so `req.secure` reflects Nginx's `X-Forwarded-Proto` and the `__Host-sid` cookie (DEC-018) is issued as `Secure`; only the local proxy is trusted |
| **Database** | MongoDB Atlas, **one Atlas project per environment, each with its own free cluster** (the docs allow one free cluster *per project*). Dev, test, staging and production are therefore separate clusters with separate credentials and separate 0.5 GB quotas: real separation for CON-016/NFR-1.8 at zero cost |
| **Database access** | Atlas IP access list restricted to the VM static IP, `158.158.115.[redacted]` (and the backup server's IP for the backup user). **No `0.0.0.0/0`.** Free clusters do not offer private endpoints, so traffic crosses the public internet under Atlas-enforced TLS. Recorded as a residual risk |
| **Database users (least privilege, CON-006)** | `civicconnect-app` (custom role: CRUD on `requests`, `notifications`, `reportingCounts`, `users`, `groups`, `categories`, `counters`, `sessions` *(v0.2, DEC-018)*; **find+insert only** on `requestHistory` and `auditLog`, unchanged in v0.2. *v0.2:* every grant is per collection and the role inherits no database-wide role such as `readWrite`. MongoDB privileges are additive, so one database-wide grant would restore `update` and `remove` on `requestHistory` and `auditLog`); `civicconnect-backup` (read-only, used by the DEC-010 dump); `retention-operator` (created as a *temporary* user only for each PROC-001 run). *v0.3:* `civicconnect-temp-provisioner`, a *temporary* index-provisioning user created on the same pattern for deployment step 5 only, restricted to `createIndex` and `listIndexes`, and deleted when the step ends. `civicconnect-app` is not given either action |
| **Audit trigger** | Atlas App Services app per environment. Trigger and function definitions live in `scripts/atlas/app/` in the repository and are deployed with `appservices push` (CON-015: configuration, not console state) |
| **Secrets** | `/etc/civicconnect/<env>.env`, mode 600, owned by the service user, loaded by `systemd EnvironmentFile`. Never in the repository (NFR-3.5); `.env*` in `.gitignore`; GitHub push protection / secret scanning enabled (A2 §5.8) |
| **Sessions / state** | No state in process memory (NFR-2.7). Sessions are held in a MongoDB-backed store, so a restart or a second process loses nothing. *v0.2:* the store is the `sessions` collection (DB-01 v0.3 §3.9, DEC-018) |
| **Release & rollback** | Release = a signed/annotated git tag on `main` (DEC-008). Deploy = script on the VM: fetch tag → `npm ci --omit=dev` → build the client *(v0.3)* → run migrations → provision indexes *(v0.3)* → `systemctl restart` → health check (`/api/v1/health`, NFR-1.6). The steps are set out under *Deployment procedure*. Rollback = redeploy the previous tag. Migrations are forward-only and additive within a release, so the previous tag still runs against the new schema |
| **Logs** | Structured JSON to journald (NFR-1.11, no personal information), rotated at 30 days (DEC-017 purpose D) |

### Deployment procedure (v0.3)

**Prerequisite.** A staging run is required before a production release tag.

Run by the deploy script on the VM, for one environment at a time, in this order:

1. Fetch the release tag (DEC-008).
2. `npm ci --omit=dev` in the repository root.
3. **Build the client** *(new in v0.3)*. First install the `client/` package's own
   dependencies from its lockfile: `npm ci` inside `client/` (from the repository root,
   `npm --prefix client ci`). Then build it with Vite into `client/dist`
   (`npm run build:client`, DEC-019). Nginx serves `client/dist` as static files and
   proxies `/api` to Node (DEC-015 §5). Vite is a development dependency of the `client/`
   package, which is why that package needs its own install; the root install in step 2 is
   unaffected. This resolves DEC-019's Consequences bullet and its Evidence still required item 3: until v0.3
   nothing put `client/dist` on the host.
   **Warning:** Ensure `NODE_ENV` is not set to `production` in the deployment shell,
   otherwise `npm ci` will skip dev dependencies and Vite will not install.
4. Run migrations (forward-only and additive within a release).
5. **Provision indexes** *(new in v0.3; repays TD-004)*. The indexes the schemas declare are
   created and then listed, before the application starts. `civicconnect-app` is granted neither
   `createIndex` nor `listIndexes`, so this step follows the `retention-operator` pattern
   (PROC-001): a **temporary** Atlas user, `civicconnect-temp-provisioner`, is created for
   the step, restricted to `createIndex` and `listIndexes`, used once, and deleted. The
   index listing is kept as evidence in docs/evidence/M3-indexes/, and shows whether the
   unique indexes exist on that cluster (DEF-014, DEF-015).
6. `systemctl restart` of the environment's unit. The application does not start before
   step 5 has completed. Note: on every forward deploy, step 5 is required first; during a
   rollback, step 5 is already complete and skipped.
7. Health check: `/api/v1/health` (NFR-1.6).

Rollback redeploys the previous tag and runs steps 1, 2, 3, 4, 6 and 7 for it. Step 3
(client build) is INCLUDED: `client/dist` is gitignored, so checking out the old tag does
not replace it, and a rollback MUST rebuild the client. Otherwise the previous API would be
served with the newer client. Step 5 (index provisioning) is not run: the indexes already
provisioned stay in place.

### Environment map (CON-016 / NFR-1.8)

*v0.3 (OI-19):* the Atlas project name and the cluster hostname are separate identifiers and
are recorded in separate columns. Until v0.2 one column held both, which read as if the
environment name, the project name and the hostname were the same string. They are not.

| Environment | Environment name | App runs on | Atlas project | Cluster hostname | Data |
|---|---|---|---|---|---|
| Development | `civicconnect-dev` | Developer machine | `civicconnect-dev` as recorded in v0.2; not re-checked | Not recorded | Synthetic |
| Test | `civicconnect-test` | Developer machine | `CivicConnect-Test` (free cluster, database dropped per run) | `civicconnecttest.[redacted].mongodb.net`. Evidence: Atlas UI connection string | Synthetic |
| Staging | `civicconnect-staging` | Azure VM (Spain Central), `civicconnect-staging` unit, `staging.` subdomain | `civicconnect-staging` as recorded in v0.2; not yet created. *v0.4:* the cluster is to be placed in Spain, or the nearest Azure region (*Performance testing and region*) | To be recorded when the cluster is created | Synthetic, production-shaped |
| Production | `civicconnect-prod` | TBD - separate infrastructure required | `civicconnect-prod` as recorded in v0.2; not re-checked | Not recorded | Real (POPIA scope) |

For the test environment the three names differ and must not be substituted for one another:
the environment is `civicconnect-test`, the Atlas project is `CivicConnect-Test`, and the
cluster hostname is `civicconnecttest.[redacted].mongodb.net` (evidence: Atlas UI connection
string). The hostname contains `civicconnecttest`, with no hyphen, so anything that matches
on the hostname must use the unhyphenated form. The integration suite's safety guard
(`tests/integration/_harness.js`) does: it runs only when the host in `MONGODB_URI` contains
`civicconnecttest`.

*v0.4:* staging and production do not share a host. The Azure VM is for staging only, and
production needs separate infrastructure that is still to be decided (TBD). Until v0.3 the
two shared one VPS, separated by database, credentials and config file. The
environment-parity trade-off the Master Brief §17 asks teams to name therefore now also
covers the host itself: until the production infrastructure is chosen, how closely staging
matches it is unknown. Load can also differ: staging does not reproduce production
concurrency.

### Performance testing and region (v0.4)

The application host is in Spain Central, and the team works from South Africa. Two rules
follow, and both are mandatory:

1. **The staging Atlas cluster must be placed in Spain, or the nearest Azure region.**
2. **All performance results must explicitly state the region.**

A round trip from South Africa to Madrid introduces a baseline latency of 150–180 ms before
application processing. This is expected behaviour, not an application fault.

## Alternatives considered

| Alternative | Assessment | Outcome |
|---|---|---|
| **Vercel** (recorded in the log) | Excellent for the React front end. The Express API becomes serverless functions, which raises open questions about long-lived MongoDB connections, cold starts against NFR-2.1's 3 s budget, and running an in-process EventEmitter (DEC-011) across stateless invocations | Rejected for the API. Could host the static React build later without changing this decision |
| **Render / Railway PaaS** | Simpler deploys and managed TLS. Free tiers sleep on idle, which conflicts with NFR-2.5's 99 % availability in the operating window | Rejected on availability at free tier; viable paid fallback |
| **Institutional (BC) server** | Would satisfy data locality but is not guaranteed available or supported (CON-008). Unknown uptime and access | Rejected as the app host; used only for backup storage (DEC-010), where its failure does not stop the service |
| **Self-managed MongoDB on the VM** | Removes the second provider, but loses managed triggers (CON-015), replica-set transactions (CON-017) and at-rest encryption, all of which the team would then have to build and operate | Rejected (see DEC-002) |
| **Hostinger KVM VPS** (the decision in v0.1 to v0.3) | Root access and a static IP, the same properties the Azure VM provides. No Hostinger VPS was provisioned, and its plan and cost were never recorded (evidence item 1 of v0.1 to v0.3) | Replaced at v0.4 by the Azure VM |
| **Single Atlas cluster, one database per environment** | Also satisfies "separate schemas", but all four environments share one 0.5 GB quota, one 100 ops/s budget and one credential boundary | Rejected in favour of a project per environment |

## Trade-offs and risks

- **Two providers** (Azure + Atlas) widen the dependency surface (CON-008). Accepted:
  each carries the capability it is best placed to provide.
- **Single VM** is an application SPOF. Accepted at CON-010 scale. Recovery is a redeploy
  of the tag onto a new VM plus the same env files, and must be rehearsed at M3.
- **Region (v0.4).** The student subscription's policy fixes the region, so the host is in
  Spain Central and not in South Africa. The latency this adds, and the rule for reporting
  it, are in *Performance testing and region*.
- **Free-cluster limits** (0.5 GB, 500 connections, 100 ops/s, 10 GB in/out per 7 days, no
  backups, auto-pause after 30 days idle): throughput is the binding one (data baseline §7).
  Raised as **RSK-019**. The upgrade trigger is recorded in DEC-010.
- **No private networking** on free clusters: mitigated by the IP allow-list, TLS and
  least-privilege users. Residual, recorded.
- **Encryption at rest (NFR-3.7):** Atlas encrypts cluster storage at rest. Customer-managed
  keys are not available on free clusters. Whether volume-level encryption satisfies NFR-3.7
  as CON-019 will probe it, or whether field-level encryption of `description` is needed, is
  an **open evidence item** for M3. Not claimed as met.

## Evidence still required (dated tasks, owner Robert)

1. ~~The exact Hostinger VPS plan, its monthly cost and its renewal cost beyond the educational
   context (CON-003, Master Brief §18).~~ Recorded at v0.4 for the Azure VM that replaces it:
   `Standard_B2ls_v2` under Azure for Students, $34.97 per month list price, $0 actual from
   the $100 student credit expiring 02/08/2027, no renewal cost. *Recorded as a figure, not a
   claim that it is cheap.*
2. The static IP of the VM, added to each Atlas access list. The IP is recorded at v0.4:
   `158.158.115.[redacted]`. Still required: adding it to the staging access list once the staging
   cluster exists.
3. Confirmation that the institutional backup server exists, can reach Atlas on 27017 and has
   encrypted storage (DEC-010 dependency; CON-008).
4. Atlas documentation reference for encryption at rest on the free tier (NFR-3.7).

## Later consequence (to be filled in at M3/M4)

*Record here whether the free-cluster throughput limit was reached in the NFR-2.4 load
test, and whether the single-VM SPOF materialised.*
