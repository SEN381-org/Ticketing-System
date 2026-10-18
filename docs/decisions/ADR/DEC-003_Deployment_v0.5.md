# DEC-003 — Deployment: Azure virtual machine for the application, MongoDB Atlas (one M0 per environment) for data

| Field | Entry |
|---|---|
| **ID** | DEC-003 (closed at M2 in the Decision Log v0.4. This ADR is the full structured record Master Brief §13 requires, replacing the one-row log entry as the authoritative rationale) |
| **Version** | 0.5 (17/10/2026). v0.4 (15/10/2026), v0.3 (13/10/2026), v0.2 (11/10/2026) and v0.1 (29/09/2026) are preserved in `Outdated/` |
| **Changes from v0.1** | For DEC-018: the `civicconnect-app` role gains CRUD on `sessions`; the *Sessions / state* row names the store; the *Edge* row records the application settings that depend on the proxy. The `find`+`insert`-only grants on `requestHistory` and `auditLog` are **unchanged**, and the *Database users* row now states that the role's grants are per collection with no database-wide role, so the restriction cannot be undone by an additive grant. No other content changes |
| **Changes from v0.2** | The deploy procedure is written out as numbered steps (*Deployment procedure*) and gains two: a client build step (DEC-019's Consequences bullet and its Evidence still required item 3) and an index provisioning step (TD-004 repayment). A new rollback rule: a rollback must rebuild the client (step 3), because `client/dist` is gitignored and checking out the previous tag does not replace it. A new prerequisite: a staging run is required before a production release tag. The *Database users* row names the temporary index-provisioning user. The *Environment map* separates the Atlas project name from the cluster hostname and records the test environment's actual names (OI-19). The Test row's *App runs on* entry now reads "Developer machine" in place of the CI runner, and the *Status* line is updated for v0.3. The Test row's "database dropped per run" is unchanged and remains the subject of DEF-006 |
| **Changes from v0.3** | Reason: OI-21 (Open Items v0.7), a baselined decision resting on a VPS that never existed. The application host changes from a Hostinger KVM VPS to an Azure virtual machine. No Hostinger VPS was provisioned. The *Application host* row records the provider (Azure for Students, on E. Lindsay's own credit), region (Spain Central, with the regions that were refused or unavailable), VM size, operating system, open ports, cost and static IP, that the VM is disposable, and that it is not the CTRLWEB VPS, which hosts live client sites. This answers evidence items 1 and 2: the VM's IP is confirmed on the staging cluster's access list. The cost is $0 only while the student credit lasts (about 2.9 months of continuous running, to early January 2027); beyond the student context it is $34.97 per month at list price, including the OS disk and static IP, which keep billing while the VM is deallocated. Port 22 accepts key-only authentication. "VPS" becomes "VM" throughout. The *Alternatives considered* table gains a row for the Hostinger VPS. A new section, *Performance testing and region*, requires the staging Atlas cluster to be placed in Spain or the nearest region where the free tier is available, and every performance result to state the region. The 150–180 ms South Africa to Madrid latency is recorded as measured (E. Lindsay, ping from Pretoria to the VM, 14/10/2026), and the NFR-2.4 load test is run from South Africa. The section records that the staging cluster is not colocated with the VM and why, and that production cannot inherit the staging regions without a decision (CON-007). The *Database access* row marks the IP as staging-only. The *Environment map* Production row becomes "TBD - separate infrastructure required": the Azure VM is for staging only and production will not share it. The *Database users* row and deployment step 5 name the provisioner's custom role, `civicconnect-index-provisioner`. The *Environment map* Staging row records the staging cluster as built (`civicconnectstaging`, M0 Sandbox, Azure, Netherlands `westeurope`), its hostname evidence (Atlas UI connection string), and its host marker, `civicconnectstaging`, which `scripts/lib/clusterMarkers.js` uses (D5). The Production row records that production has no host and no marker, so the provisioning script refuses it, and the *Process model* row marks the `civicconnect-prod` unit as undecided. Otherwise the deployment procedure, database users, secrets, release and rollback rules are unchanged |
| **Changes from v0.4** | Reason: the follow-ups recorded at M3 for the next DEC-003 version (PED v3.0 M3.3 and M3.8; the staging deploy record, PR #111, and its note of 15/10/2026, PR #117). The record is brought into line with how staging was actually deployed, and each place where the two differed is decided, not just described. **(1) Hand deploy:** the *Release & rollback* row and the *Deployment procedure* said "run by the deploy script"; no deploy script exists, and staging was deployed by hand following the numbered steps. The procedure is now a manual one, and a script is recorded as not built. **(2) Host configuration in the repository:** the Nginx site file and the systemd unit are now held in `deploy/` (PR #133) and cited by the *Edge* and *Process model* rows. They were compared with the live VM files before #133 merged (17/10/2026, 22:57 UTC); the two missing lines found were added (`9d07b67`), and the live files were left in place because they also listen on IPv6. Until v0.5 they existed only on the VM, and the Nginx file proxied every path to Node, so the client was not served until 15/10/2026 (DEF-021). **(3) Health row:** a new *Health check* row states what `/api/v1/health` proves and what it does not: `release` must equal the tag's commit, and "database up" proves only that a ping succeeded, not which database is used (DEF-020). **(4) Commit hash on `/health`:** accepted for staging. Not accepted as-is for production, because the repository is public and the hash names the exact source being served. **(5) "On Azure":** rule 1 of *Performance testing and region* is reworded to say what was done: the nearest Azure region where the free tier was available. Other cloud providers' regions were not checked. **(6) Backup IP:** the *Database access* row's "the backup server's IP" applies only once the DEC-010 backup server exists. It does not, and no backup IP is on any access list. **(7) Non-colocation:** accepted as a standing staging condition and no longer something to be fixed. This settles the colocation clause of OI-21's closing condition for staging. **(8) Certificate:** staging uses a self-signed certificate with the VM's IP in its Subject Alternative Name, because there is no domain name. Let's Encrypt remains the decision for any environment with a domain name, including production. HSTS is not set on staging (browsers ignore it for an IP address). **Also:** step 5's access-list exception is recorded as a rule. The environment file's ownership by `root` is adopted. The staging row's "`staging.` subdomain" is removed, as no domain exists. The Test row's "database dropped per run" is corrected to what happens (DEF-006). *Later consequence* is filled in. The decisions in the *Application host*, *Runtime*, *Database*, *Database users*, *Audit trigger*, *Sessions / state* and *Logs* rows are unchanged |
| **Date** | 29/09/2026 |
| **Owner** | Robert van der Merwe (technology stack and deployment compatibility) |
| **Status** | Decided (v0.1); v0.5 changes take effect on approval of their PR. Final M4 version. Staging is decided and built. The production host is not decided (see *Application host* and *Later consequence*). Evidence items 3 and 4 were not obtained (see *Evidence still required*) |
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
| **Application host** | *v0.4:* an **Azure virtual machine** under **Azure for Students**, replacing the Hostinger KVM VPS of v0.1 to v0.3. **Region:** Spain Central. The region is forced by the student subscription's policy, which allows only specific regions such as `malaysiawest`, `austriaeast`, `italynorth`, `indiasouthcentral` and `spaincentral`. South Africa North and West Europe were refused; Italy North had no small sizes available. **VM:** `Standard_B2ls_v2`, 2 vCPU, 4 GiB, Ubuntu Server 24.04 LTS, security type Standard. **Cost:** $34.97 per month list price, which includes the OS disk and the static IP. It is $0 actual only while E. Lindsay's own Azure for Students credit lasts: $100 covers about 2.9 months of continuous running, so the credit runs out in early January 2027. The OS disk and static IP keep billing even when the VM is deallocated. Beyond the student context the cost is the list price, $34.97 per month. **Static IP:** `158.158.115.[redacted]`. **Open ports:** 22, 80, 443. Port 22 is restricted to key-only authentication. Root access on the VM is what lets us run Node.js, a reverse proxy and several environments side by side. The VM is disposable: a throwaway host for staging only, and it is not the CTRLWEB VPS, which hosts live client sites. Production will not share it and needs separate infrastructure, which is not yet decided |
| **Runtime** | **Node.js >=22.0.0**: Node 22 (maintenance LTS, supported to April 2027) is the minimum and the version deployed on the VM; `engines: ">=22.0.0"` lets developers on newer lines (e.g. 26) install without EBADENGINE, and `.nvmrc` = 22 fixes the default for nvm users. Replaces `>=20`: Node 20 reached end-of-life on 30 April 2026. Move to the next LTS line through controlled change before 22 reaches end-of-life |
| **Process model** | One `systemd` unit per environment (`civicconnect-staging`; `civicconnect-prod`: *v0.4:* Undecided, because production has no host), restart-on-failure. No pm2, so no additional dependency (CON-003/CON-008). *v0.5:* the staging unit is held in the repository as `deploy/systemd/civicconnect-staging.service` (PR #133): `npm start` as the service user `ticketuser` in `/opt/civicconnect`, with the environment file as its `EnvironmentFile` and `Environment=NODE_ENV=staging`. The VM's own unit file was never captured at M3 (deploy record, section 5). **Compared with the VM** by E. Lindsay on 17/10/2026 at 22:57 UTC (`diff -u`, posted on PR #133; nothing on the VM changed). The live unit sets `Environment=NODE_ENV=staging`, which the first repository copy left out, and `staging.env` does not set it. Commit `9d07b67` added it before #133 merged. Remaining differences, all harmless: the live unit orders on `network.target` (not `network-online.target`), starts `/usr/bin/env npm start` (the same `/usr/bin/npm`), and sets no `RestartSec` and no `Group` (the same effective group). **The live unit was not replaced** with the repository copy. The repository file records the configuration, and the VM still runs its own |
| **Edge** | Nginx reverse proxy terminating **TLS 1.2+** with a Let's Encrypt certificate. HTTP→HTTPS redirect and HSTS (NFR-3.2). Node listens on localhost only. *v0.2:* Express runs with `trust proxy` set to `loopback`, so `req.secure` reflects Nginx's `X-Forwarded-Proto` and the `__Host-sid` cookie (DEC-018) is issued as `Secure`; only the local proxy is trusted. *v0.5:* the staging site file is held in the repository as `deploy/nginx/civicconnect-staging.conf` (PR #133). Nginx serves `client/dist` as static files, falls back to `index.html` for client paths, proxies only `/api/` to `127.0.0.1:3000` with `proxy_http_version 1.1`, and pins `ssl_protocols TLSv1.2 TLSv1.3`, as corrected on the VM on 15/10/2026 (DEF-021). **Compared with the VM** on 17/10/2026 at 22:57 UTC (PR #133): the live `/api/` block sets `proxy_http_version 1.1`, which the first repository copy left out; commit `9d07b67` added it. The live file also listens on IPv6 (`[::]:80`, `[::]:443`), which the repository file does not. Installing the repository file would therefore turn IPv6 off, so **the live site file was not replaced**. Adding the IPv6 listeners to the repository file is future work. **Certificate, staging:** self-signed, with the VM's IP in its Subject Alternative Name (deploy record, section 3a), because the VM has no domain name. Clients trust it explicitly (`curl --cacert`, `NODE_EXTRA_CA_CERTS`), and verification is never disabled; in a browser the warning is accepted by hand. **Certificate, production and any environment with a domain name:** Let's Encrypt, unchanged. **HSTS:** not set on staging. Browsers ignore Strict-Transport-Security from a host that is an IP address (RFC 6797 §8.1), so it takes effect only with a domain name |
| **Health check** | *New in v0.5.* `GET /api/v1/health` (NFR-1.6) answers without a session and reports `application`, `database` and `release`. `release` is the commit in `RELEASE_COMMIT`, set in the environment file at deploy time (PR #105). A deploy is accepted only if `release` equals the tag's commit and `database` is `up` (step 7). **What it does not prove:** `database: up` means a ping succeeded. It does not show which database the application uses, so on staging it reported "up" while the application was connected to the driver's default `test` database (DEF-020). The URI must name the `civicconnect` database (*Secrets*). **Commit hash in a public response:** accepted for staging, where it is how a deploy is verified. Not accepted as-is for production: the repository is public, so the hash tells anyone which exact source, and which known open defects, are being served. Before a production release, `release` is either removed from the public response or `/api/v1/health` is reachable only from the deploy host. That change is not built |
| **Database** | MongoDB Atlas, **one Atlas project per environment, each with its own free cluster** (the docs allow one free cluster *per project*). Dev, test, staging and production are therefore separate clusters with separate credentials and separate 0.5 GB quotas: real separation for CON-016/NFR-1.8 at zero cost |
| **Database access** | Atlas IP access list restricted to the application host's static IP. *v0.4:* that is the staging VM's IP, `158.158.115.[redacted]`, for staging only; production has no host yet (and the backup server's IP for the backup user). **No `0.0.0.0/0`.** Free clusters do not offer private endpoints, so traffic crosses the public internet under Atlas-enforced TLS. Recorded as a residual risk. *v0.5:* **backup IP:** "the backup server's IP" applies only once the DEC-010 backup server exists. It does not (evidence item 3), so no backup IP is on any access list, and no backup has been taken from any cluster. **Temporary entries:** on 15/10/2026 deployment step 5 was run from a developer workstation, whose IP was on the staging access list alongside the VM's until it was removed at 18:37 UTC (PR #111). From v0.5, a step that cannot run from the VM may add one temporary access-list entry for the person running it, recorded with the times it was added and removed, and removed when the step ends. The VM's entry is the only standing one |
| **Database users (least privilege, CON-006)** | `civicconnect-app` (custom role: CRUD on `requests`, `notifications`, `reportingCounts`, `users`, `groups`, `categories`, `counters`, `sessions` *(v0.2, DEC-018)*; **find+insert only** on `requestHistory` and `auditLog`, unchanged in v0.2. *v0.2:* every grant is per collection and the role inherits no database-wide role such as `readWrite`. MongoDB privileges are additive, so one database-wide grant would restore `update` and `remove` on `requestHistory` and `auditLog`); `civicconnect-backup` (read-only, used by the DEC-010 dump); `retention-operator` (created as a *temporary* user only for each PROC-001 run). *v0.3:* `civicconnect-temp-provisioner`, a *temporary* index-provisioning user created on the same pattern for deployment step 5 only, restricted to `createIndex` and `listIndexes`, and deleted when the step ends. *v0.4:* its custom role is `civicconnect-index-provisioner`. `civicconnect-app` is not given either action |
| **Audit trigger** | Atlas App Services app per environment. Trigger and function definitions live in `scripts/atlas/app/` in the repository and are deployed with `appservices push` (CON-015: configuration, not console state) |
| **Secrets** | `/etc/civicconnect/<env>.env`, mode 600, owned by the service user, loaded by `systemd EnvironmentFile`. Never in the repository (NFR-3.5); `.env*` in `.gitignore`; GitHub push protection / secret scanning enabled (A2 §5.8). *v0.5:* **owned by `root`**, mode 600, as on staging (deploy record, section 7). systemd reads an `EnvironmentFile` as root before it starts the process, so the service user never needs to read the file. Root ownership is the narrower grant, so it replaces "owned by the service user". **`MONGODB_URI` must name the database** (`…/civicconnect?…`). Without it the driver uses `test`, on which the application credential has no grants (DEF-020). The perf scripts refuse such a URI (PR #110). `src/config.js` does not, and that check is not built |
| **Sessions / state** | No state in process memory (NFR-2.7). Sessions are held in a MongoDB-backed store, so a restart or a second process loses nothing. *v0.2:* the store is the `sessions` collection (DB-01 v0.3 §3.9, DEC-018) |
| **Release & rollback** | Release = a signed/annotated git tag on `main` (DEC-008). Deploy = script on the VM: fetch tag → `npm ci --omit=dev` → build the client *(v0.3)* → run migrations → provision indexes *(v0.3)* → `systemctl restart` → health check (`/api/v1/health`, NFR-1.6). The steps are set out under *Deployment procedure*. Rollback = redeploy the previous tag. Migrations are forward-only and additive within a release, so the previous tag still runs against the new schema. *v0.5:* **by hand, not by script.** No deploy script exists. The M3 staging deploy was run by hand, step by step, with each step's output recorded (PR #111), and the M4 redeploy follows the same procedure. The steps are unchanged; what changes is that a person runs them and records each one. A deploy script is not built and remains future work: it would remove the operator errors seen at M3 (DEF-020, DEF-021), but it is not needed to deploy and verify one tag on one VM |
| **Logs** | Structured JSON to journald (NFR-1.11, no personal information), rotated at 30 days (DEC-017 purpose D) |

### Deployment procedure (v0.3; v0.5)

**Prerequisite.** A staging run is required before a production release tag.

*v0.5:* run **by hand** on the VM (there is no deploy script; see *Release & rollback*), for one
environment at a time, in this order. Each step's command and output are recorded in the
deploy record, with the expected result written before the step is run. Until v0.4 this read
"Run by the deploy script on the VM".

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
   *v0.5:* building `client/dist` is not enough on its own: Nginx must also serve it. On
   15/10/2026 the client was built but not served, because the site file proxied every
   path to Node (DEF-021). The site file is now recorded in `deploy/nginx/civicconnect-staging.conf`
   (the live file is kept until the repository copy also carries its IPv6 listeners; *Edge*),
   and step 7 checks `/` as well as the API.
   **Warning:** Ensure `NODE_ENV` is not set to `production` in the deployment shell,
   otherwise `npm ci` will skip dev dependencies and Vite will not install.
4. Run migrations (forward-only and additive within a release).
5. **Provision indexes** *(new in v0.3; repays TD-004)*. The indexes the schemas declare are
   created and then listed, before the application starts. `civicconnect-app` is granted neither
   `createIndex` nor `listIndexes`, so this step follows the `retention-operator` pattern
   (PROC-001): a **temporary** Atlas user, `civicconnect-temp-provisioner`, with the custom
   role `civicconnect-index-provisioner`, is created for the step, restricted to `createIndex` and `listIndexes`, used once, and deleted. The
   index listing is kept as evidence in docs/evidence/M3-indexes/, and shows whether the
   unique indexes exist on that cluster (DEF-014, DEF-015).
   *v0.5:* the step runs from the VM where it can. If it cannot, a temporary access-list
   entry is added, recorded and removed (*Database access*).
6. `systemctl restart` of the environment's unit. The application does not start before
   step 5 has completed. Note: on every forward deploy, step 5 is required first; during a
   rollback, step 5 is already complete and skipped.
   *v0.5:* `deploy/` is the record of the host configuration. Its files are installed
   (`deploy/README.md`) only once they match the live files, including the IPv6 listeners
   (*Edge*); until then a deploy leaves the live Nginx site and unit in place, as the
   `v4.0-M4-rc` deploy of 18/10/2026 did.
7. Health check: `/api/v1/health` (NFR-1.6).
   *v0.5:* pass only if `release` equals the tag's commit and `database` is `up`
   (*Health check*), the certificate is verified (`--cacert`, never `-k`), and `/` returns
   the client's `index.html` (DEF-021).

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
| Test | `civicconnect-test` | Developer machine | `CivicConnect-Test` (free cluster, database dropped per run). *v0.5:* **not dropped per run.** It was dropped once, on 14/10/2026, and synthetic data accumulates between runs (DEF-006). Until v0.4 this cell said it was dropped per run, which never happened. A run that needs an empty database uses the CI job's throwaway replica set instead (TD-008, PR #122) | `civicconnecttest.[redacted].mongodb.net`. Evidence: Atlas UI connection string | Synthetic |
| Staging | `civicconnect-staging` | Azure VM (Spain Central), `civicconnect-staging` unit, `staging.` subdomain. *v0.5:* no subdomain. The VM has no domain name and is reached by its IP address over HTTPS (*Edge*) | `civicconnect-staging` as recorded in v0.2. *v0.4:* cluster `civicconnectstaging`, tier M0 Sandbox, on Azure, region Netherlands (`westeurope`), the nearest region where the free tier was available (*Performance testing and region*) | *v0.4:* `civicconnectstaging.[redacted].mongodb.net`. Evidence: Atlas UI connection string. Host marker: `civicconnectstaging`, the first label of the hostname (`scripts/lib/clusterMarkers.js`, decision D5 of PR #98) | Synthetic, production-shaped |
| Production | `civicconnect-prod` | TBD - separate infrastructure required | `civicconnect-prod` as recorded in v0.2; not re-checked | *v0.4:* none. Production has no host and no host marker, so the provisioning script refuses it | Real (POPIA scope) |

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

1. **The staging Atlas cluster must be placed in Spain, or the nearest region where the free
   tier is available.** As built: `civicconnectstaging`, M0 Sandbox, Netherlands
   (`westeurope`), the nearest region where the free tier was available.
   *v0.5:* what was done is narrower than "nearest region". Only Atlas's Azure regions
   were considered, and the nearest of them with the free tier was the Netherlands. The
   regions Atlas offers on other cloud providers were not checked, so the record does not
   show that no nearer free-tier region existed. Until v0.4 the rule read as if every
   provider had been checked.
2. **All performance results must explicitly state the region** of the VM and of the Atlas
   cluster.

The staging Atlas cluster is **not** colocated with the VM: the VM is in Spain Central and
the cluster is in the Netherlands (Azure `westeurope`). The split is required, not chosen.
The VM's region is constrained by the Azure for Students credit's allowed-regions policy,
and the nearest Atlas free tier (M0 Sandbox) on Azure is available only in the Netherlands,
not in Spain Central. Staging performance results therefore include the latency of this
VM-to-cluster network hop as well as the South Africa round trip below.

*v0.5:* **non-colocation is accepted** as a standing condition of staging, not a fault to be
fixed. Colocating would need a paid tier or a VM outside the student subscription's regions
(CON-003). The cost is recorded instead: every staging performance result states both
regions and includes the hop (the NFR-2.4 run, PED M3.8). OI-21's closing condition asked for
the cluster to be colocated with the VM; this decision replaces that clause for staging.

A round trip from South Africa to Madrid introduces a baseline latency of 150–180 ms before
application processing (measured by E. Lindsay, ping from Pretoria to the VM, 14/10/2026).
This is expected behaviour, not an application fault. The NFR-2.4 load test is run from
South Africa, so its results include this baseline.

Staging data is synthetic, so these regions are acceptable for staging. Production cannot
inherit them without a decision: CON-007 governs where real data may be held.

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
   `Standard_B2ls_v2` under Azure for Students. List price $34.97 per month, including the OS
   disk and static IP. $0 actual only while the $100 student credit lasts: about 2.9 months of
   continuous running, so it runs out in early January 2027. The OS disk and static IP keep
   billing while the VM is deallocated. Beyond the student context the cost is $34.97 per
   month at list price. *Recorded as a figure, not a claim that it is cheap.*
2. ~~The static IP of the VM, added to each Atlas access list.~~ Recorded at v0.4: the IP is
   `158.158.115.[redacted]`, and it is confirmed on the staging cluster's access list
   (added by E. Lindsay, 15/10/2026). Production has no host, so no production access list
   entry exists yet.
3. Confirmation that the institutional backup server exists, can reach Atlas on 27017 and has
   encrypted storage (DEC-010 dependency; CON-008). *v0.5: not obtained.* No backup server
   was confirmed, so no DEC-010 dump has run and no backup IP is on any access list.
4. Atlas documentation reference for encryption at rest on the free tier (NFR-3.7). *v0.5:
   not obtained.* NFR-3.7 is not claimed as met.

## Later consequence (filled in at v0.5, 17/10/2026; M4 release candidate results added 18/10/2026)

- **Free-cluster throughput (RSK-019, DEC-010 trigger).** Not measured. The NFR-2.4 run on
  staging (15/10/2026: 100 users for 600 s, 6,735 requests in the window at 11.04 requests/s,
  0 failed, PASS; PED M3.8) did not reach any limit visible to the application. The Atlas
  metrics for the window were not captured, though, so the 70 % of 100 ops/s trigger was
  neither confirmed nor ruled out. The estimate is about 40 to 50 ops/s.
  *M4 (18/10/2026):* **reached.** `v4.0-M4-rc` (`f1eb7af`) was deployed to staging by hand
  between 00:29 and 02:20 UTC on 18/10/2026, following this procedure, with `/health`
  reporting `release` `f1eb7af` and the database up. The NFR-2.4 run (100 users for 600 s,
  12,030 requests at 19.7 requests/s, now including submissions) took Atlas to about
  74 ops/s, over the 70 ops/s trigger, and **failed**: 17 of 450 submissions timed out at the
  client, though all 450 were saved. The NFR-2.1 burst (100 simultaneous submissions) also
  failed: 30 were not saved. The cause is write contention on the single per-year reference
  counter inside the create transaction (FR-2.6, DEC-016), made worse by the Spain to
  Netherlands hop on a shared free cluster (*Performance testing and region*). The DEC-010
  re-open condition is met (M4 staging deploy record, `docs/evidence/M4-perf/`).
- **Single-VM point of failure.** Not materialised during M3 or M4 as far as the record
  shows: no outage was recorded. That is not evidence of availability, because nothing
  monitored the VM. Recovery onto a new VM was not rehearsed, as the trade-offs section
  required for M3. `deploy/` now holds the host configuration such a recovery needs.
- **What the record got wrong, and how it was found.** v0.1 to v0.3 rested on a VPS that did
  not exist (OI-21). It was found only when someone was asked to deploy. Two further faults
  were found on the first staging deploy, not by review: the URI without a database name
  (DEF-020) and the client not served (DEF-021). Each happened because the host
  configuration lived only on the VM, and each would also have passed the health check as it
  stood. v0.5 moves that configuration into the repository and states what the health check
  does and does not prove.
- **Production.** Still has no host, no cluster and no access list. The staging regions do
  not carry over (CON-007), and the commit hash on `/health` must be removed or restricted
  first (*Health check*). Release to production is therefore not possible under this
  decision as it stands.
