# DEC-003 — Deployment: Hostinger VPS for the application, MongoDB Atlas (one M0 per environment) for data

| Field | Entry |
|---|---|
| **ID** | DEC-003 (closed at M2 in the Decision Log v0.4. This ADR is the full structured record Master Brief §13 requires, replacing the one-row log entry as the authoritative rationale) |
| **Date** | 29/09/2026 |
| **Owner** | Robert van der Merwe (technology stack and deployment compatibility) |
| **Status** | Decided. Plan-specific evidence items outstanding (see *Evidence still required*) |
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
| **Application host** | Hostinger **KVM VPS** (Linux). Root access is the property the log cites ("we have access to the server"), and it is what lets us run Node.js, a reverse proxy and several environments side by side |
| **Runtime** | **Node.js >=22.0.0**: Node 22 (maintenance LTS, supported to April 2027) is the minimum and the version deployed on the VPS; `engines: ">=22.0.0"` lets developers on newer lines (e.g. 26) install without EBADENGINE, and `.nvmrc` = 22 fixes the default for nvm users. Replaces `>=20`: Node 20 reached end-of-life on 30 April 2026. Move to the next LTS line through controlled change before 22 reaches end-of-life |
| **Process model** | One `systemd` unit per environment (`civicconnect-staging`, `civicconnect-prod`), restart-on-failure. No pm2, so no additional dependency (CON-003/CON-008) |
| **Edge** | Nginx reverse proxy terminating **TLS 1.2+** with a Let's Encrypt certificate. HTTP→HTTPS redirect and HSTS (NFR-3.2). Node listens on localhost only |
| **Database** | MongoDB Atlas, **one Atlas project per environment, each with its own free cluster** (the docs allow one free cluster *per project*). Dev, test, staging and production are therefore separate clusters with separate credentials and separate 0.5 GB quotas: real separation for CON-016/NFR-1.8 at zero cost |
| **Database access** | Atlas IP access list restricted to the VPS static IP (and the backup server's IP for the backup user). **No `0.0.0.0/0`.** Free clusters do not offer private endpoints, so traffic crosses the public internet under Atlas-enforced TLS. Recorded as a residual risk |
| **Database users (least privilege, CON-006)** | `civicconnect-app` (custom role: CRUD on `requests`, `notifications`, `reportingCounts`, `users`, `groups`, `categories`, `counters`; **find+insert only** on `requestHistory` and `auditLog`); `civicconnect-backup` (read-only, used by the DEC-010 dump); `retention-operator` (created as a *temporary* user only for each PROC-001 run) |
| **Audit trigger** | Atlas App Services app per environment. Trigger and function definitions live in `scripts/atlas/app/` in the repository and are deployed with `appservices push` (CON-015: configuration, not console state) |
| **Secrets** | `/etc/civicconnect/<env>.env`, mode 600, owned by the service user, loaded by `systemd EnvironmentFile`. Never in the repository (NFR-3.5); `.env*` in `.gitignore`; GitHub push protection / secret scanning enabled (A2 §5.8) |
| **Sessions / state** | No state in process memory (NFR-2.7). Sessions are held in a MongoDB-backed store, so a restart or a second process loses nothing |
| **Release & rollback** | Release = a signed/annotated git tag on `main` (DEC-008). Deploy = script on the VPS: fetch tag → `npm ci --omit=dev` → run migrations → `systemctl restart` → health check (`/api/v1/health`, NFR-1.6). Rollback = redeploy the previous tag. Migrations are forward-only and additive within a release, so the previous tag still runs against the new schema |
| **Logs** | Structured JSON to journald (NFR-1.11, no personal information), rotated at 30 days (DEC-016 purpose D) |

### Environment map (CON-016 / NFR-1.8)

| Environment | App runs on | Atlas project / cluster | Data |
|---|---|---|---|
| Development | Developer machine | `civicconnect-dev` / free cluster | Synthetic |
| Test | CI runner (GitHub Actions), per run | `civicconnect-test` / free cluster, database dropped per run | Synthetic |
| Staging | VPS, `civicconnect-staging` unit, `staging.` subdomain | `civicconnect-staging` / free cluster | Synthetic, production-shaped |
| Production | VPS, `civicconnect-prod` unit | `civicconnect-prod` / free cluster | Real (POPIA scope) |

Staging and production share the VPS but not the database, credentials or config file. That
is the environment-parity trade-off the Master Brief §17 asks teams to name. What can still
differ is load: staging does not reproduce production concurrency.

## Alternatives considered

| Alternative | Assessment | Outcome |
|---|---|---|
| **Vercel** (recorded in the log) | Excellent for the React front end. The Express API becomes serverless functions, which raises open questions about long-lived MongoDB connections, cold starts against NFR-2.1's 3 s budget, and running an in-process EventEmitter (DEC-011) across stateless invocations | Rejected for the API. Could host the static React build later without changing this decision |
| **Render / Railway PaaS** | Simpler deploys and managed TLS. Free tiers sleep on idle, which conflicts with NFR-2.5's 99 % availability in the operating window | Rejected on availability at free tier; viable paid fallback |
| **Institutional (BC) server** | Would satisfy data locality but is not guaranteed available or supported (CON-008). Unknown uptime and access | Rejected as the app host; used only for backup storage (DEC-010), where its failure does not stop the service |
| **Self-managed MongoDB on the VPS** | Removes the second provider, but loses managed triggers (CON-015), replica-set transactions (CON-017) and at-rest encryption, all of which the team would then have to build and operate | Rejected (see DEC-002) |
| **Single Atlas cluster, one database per environment** | Also satisfies "separate schemas", but all four environments share one 0.5 GB quota, one 100 ops/s budget and one credential boundary | Rejected in favour of a project per environment |

## Trade-offs and risks

- **Two providers** (Hostinger + Atlas) widen the dependency surface (CON-008). Accepted:
  each carries the capability it is best placed to provide.
- **Single VPS** is an application SPOF. Accepted at CON-010 scale. Recovery is a redeploy
  of the tag onto a new VPS plus the same env files, and must be rehearsed at M3.
- **Free-cluster limits** (0.5 GB, 500 connections, 100 ops/s, 10 GB in/out per 7 days, no
  backups, auto-pause after 30 days idle): throughput is the binding one (data baseline §7).
  Raised as **RSK-017**. The upgrade trigger is recorded in DEC-010.
- **No private networking** on free clusters: mitigated by the IP allow-list, TLS and
  least-privilege users. Residual, recorded.
- **Encryption at rest (NFR-3.7):** Atlas encrypts cluster storage at rest. Customer-managed
  keys are not available on free clusters. Whether volume-level encryption satisfies NFR-3.7
  as CON-019 will probe it, or whether field-level encryption of `description` is needed, is
  an **open evidence item** for M3. Not claimed as met.

## Evidence still required (dated tasks, owner Robert)

1. The exact Hostinger VPS plan, its monthly cost and its renewal cost beyond the educational
   context (CON-003, Master Brief §18). *Recorded as a figure, not a claim that it is cheap.*
2. The static IP of the VPS, added to each Atlas access list.
3. Confirmation that the institutional backup server exists, can reach Atlas on 27017 and has
   encrypted storage (DEC-010 dependency; CON-008).
4. Atlas documentation reference for encryption at rest on the free tier (NFR-3.7).

## Later consequence (to be filled in at M3/M4)

*Record here whether the free-cluster throughput limit was reached in the NFR-2.4 load
test, and whether the single-VPS SPOF materialised.*
