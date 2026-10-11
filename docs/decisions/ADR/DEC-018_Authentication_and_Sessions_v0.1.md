# DEC-018 — Authentication mechanism and server-side sessions

| Field | Entry |
|---|---|
| **ID** | DEC-018 |
| **Date** | 11/10/2026 |
| **Owner** | Ethan Lindsay |
| **Status** | Proposed. Decided on approval of this PR. **Condition:** the password-hash cost in §2 was measured on a development machine, not on the VPS. It must be re-measured on the VPS before production use, and this ADR superseded by a new version if the figure changes the parameters (see *Evidence still required*) |
| **Affects** | FR-1.1, FR-1.4, NFR-1.4, NFR-2.7, NFR-3.1, NFR-3.4, NFR-3.5, AC-FR-1.1, AC-FR-1.4, AC-NFR-1.4, AC-NFR-3.1, AC-NFR-3.4, CON-006, CON-019, DEC-003, DEC-012, DEC-015, DEC-017, DB-01 |
| **Closes** | The forward item in DEC-015 §5: *"The authentication mechanism itself is a separate decision (forward item), not made here."* |

## Context

At the end of M2 no requirement was reachable over HTTP. The guard (DEC-012 enforcement
point 1) refuses any request without `req.actor`, and nothing in the application sets it.
DEC-015 §5 fixed the *shape* of the session: a cookie (`HttpOnly`, `Secure`,
`SameSite=Lax`), a server-side store, and `req.actor` set only by the session middleware.
It deliberately left the authentication mechanism undecided.

The record already constrains the answer:

- **FR-1.1** requires a unique individual account before any request data is displayed.
- **NFR-3.1** requires credentials stored only as salted, computationally slow one-way hashes.
  `users.passwordHash` exists for this.
- **NFR-1.3 / SCP-016** keep users, categories and locations local, with no campus-system
  identifiers.
- **NFR-2.7** forbids session state in process memory. DEC-003 puts sessions in a
  MongoDB-backed store.
- **NFR-3.4** sets a 30-minute idle limit.
- **FR-1.4 / AC-FR-1.4** require revocation to terminate existing sessions. `users.sessionEpoch`
  exists for this.
- **NFR-1.4** requires every authentication attempt to be logged and kept for 90 days.
  `auditLog` already supports `origin: 'auth'` and `actorSource: 'session'` (DB-01 §3.6).

## Decision

### 1. Mechanism

**Local accounts: email and password, verified by the application, followed by an opaque
server-side session.** No campus single sign-on and no token-based (JWT) session.

### 2. Password hashing (NFR-3.1)

- **Function:** `scrypt`, from Node's built-in `node:crypto`. No new dependency (CON-003,
  CON-008).
- **Parameters:** N = 2¹⁵, r = 8, p = 3, 16-byte random salt, 64-byte derived key. These are
  one of the OWASP Password Storage Cheat Sheet's equivalent scrypt settings. This one was
  chosen for its 32 MiB working memory per hash, which matters on a small VPS.
- **`maxmem` is set explicitly to 64 MiB.** The parameters need 128 · N · r = 33 554 432
  bytes, which is exactly Node's default `maxmem` of 32 MiB. scrypt's working overhead takes
  it over that limit, so with the default the call fails. **Observed 11/10/2026:** without
  `maxmem`, `crypto.scrypt` throws `ERR_CRYPTO_INVALID_SCRYPT_PARAMS … memory limit
  exceeded` synchronously.
- **Stored form:** one self-describing string,
  `scrypt$N=32768,r=8,p=3$<salt base64>$<hash base64>`. The parameters travel with the hash,
  so they can be raised later without a migration. A hash with weaker parameters is
  re-hashed at the next successful login.
- **Comparison** with `crypto.timingSafeEqual`.
- **Measured cost (condition on this decision):** median **293 ms** per hash, minimum 255 ms,
  maximum 358 ms, n = 20, after one warm-up. Environment: Node v22.20.0, Windows 11 x64,
  Intel Core i7-1360P, 15.7 GiB RAM, measured 11/10/2026. **This is a development laptop,
  not the VPS.** The VPS figure is expected to be higher. It is recorded under *Evidence
  still required*, not assumed.

This supersedes the annotation in DB-01 v0.2 §3.7 (`passwordHash: … argon2id/bcrypt encoded
hash only`). DB-01 v0.3 carries the corrected annotation.

### 3. Sessions

| Property | Decision |
|---|---|
| **Session identifier** | 32 bytes from `crypto.randomBytes`, sent to the client base64url-encoded. **Only its SHA-256 hash is stored.** A read of the `sessions` collection (a backup, a log, a compromised read credential) therefore yields nothing that can be presented as a cookie |
| **Store** | A `sessions` collection, defined in DB-01 v0.3 §3.9, accessed only through `sessionRepository`. No session library: the FR-1.4 epoch check and the NFR-3.4 idle check are explicit application code that can be negative-verified |
| **Cookie** | Name **`__Host-sid`**. Attributes `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`. The `__Host-` prefix makes the browser *refuse* the cookie unless it is `Secure`, `Path=/` and has no `Domain`, so a misconfiguration fails visibly. Browsers treat only `localhost` as a secure origin over plain HTTP, so local development works on `http://localhost` but **not** on a LAN IP |
| **Fixation** | Every successful login issues a new identifier. An identifier presented at login is never adopted |
| **Idle expiry (NFR-3.4)** | See the tolerance statement below |
| **Absolute lifetime** | **None required by the record; not implemented.** NFR-3.4 sets an idle limit only. A maximum lifetime would be a new value, and it is not chosen here |
| **Revocation (FR-1.4)** | Each session stores the user's `sessionEpoch` when it is created. A session whose epoch differs from the user's current epoch is refused. A user whose `status` is `revoked` is refused whatever the epoch |
| **Resolution per request** | The session middleware reads the session **and the user** on every request. Roles, category authorisations and group memberships are never copied into the session, so a change takes effect on the next request (FR-1.4, FR-1.6, NFR-2.7) |

**Idle-expiry tolerance (identical wording in DB-01 v0.3 §3.9):**

> A session is refused once 30 minutes have elapsed since its recorded last activity
> (`lastSeenAt`). `lastSeenAt` is refreshed at most once per 60 seconds, so a session expires
> between 29 and 30 minutes after the user's last request and is never valid after 30
> minutes of inactivity.

The refresh limit exists because a write on every request would count against the Atlas
free-cluster throughput ceiling of 100 ops/s (RSK-019). Because `lastSeenAt` can only lag the
user's real last request, the error is always on the early side. The TTL index on
`lastSeenAt` deletes expired documents in the background, roughly once a minute. It is
**cleanup only**. Expiry is enforced by the middleware's own comparison.

### 4. Where 401 is decided

The session middleware **only resolves**. On a valid session it sets
`req.actor = { id, roles, categoryAuthorisations, groupIds }`. On a missing, unknown, expired,
epoch-mismatched or revoked-user session it clears the cookie and leaves `req.actor`
undefined. **Only the guard (DEC-012) returns 401 or 403.** Public routes therefore need no
exemption logic. They are listed, each with its reason, in `PUBLIC_ROUTES`.

`groupIds` is carried but not evaluated. DB-01 §3.7 specifies the union of role and group
permissions, and its implementation is recorded as technical debt TD-002. Repaying it is a
change inside `src/domain/accessRules.js` under DEC-012, not a change to the session
middleware.

### 5. API (DEC-015 resource style)

| Route | Guard | Behaviour |
|---|---|---|
| `POST /api/v1/sessions` | Public: logging in cannot require being logged in | `{ email, password }`, JSON only. `201` with `{ id, displayName, roles }` and `Set-Cookie`. Any failure (unknown email, wrong password, revoked account) returns **one identical `401`**. For an unknown email a dummy hash is still computed, so response time does not reveal which emails exist |
| `DELETE /api/v1/sessions/current` | Public and idempotent | Deletes the session named by the cookie, if there is one. Always clears the cookie and returns `204`. It never reveals whether a session existed. It can only end the caller's own session, and `SameSite=Lax` stops the cookie being sent on a cross-site `DELETE` |
| `GET /api/v1/health` | Public, by NFR-1.6 | Database `ping` only. No collection read, no personal data. `200` or `503` |

CSRF: DEC-015 §5 relies on `SameSite=Lax` plus a mandatory JSON content type. The
content-type requirement is enforced (`415`) on every write, including login.

### 6. Audit (NFR-1.4)

Login success, login failure and logout (only when a session was actually deleted) are
written to `auditLog` with `origin: 'auth'`, through `auditRepository.recordSecurityEvent()`,
which is insert-only. Minimisation rule M-1 (DEC-017) applies. A failed login for an unknown
email records `actorId: null`, and **the submitted email is never recorded**. AC-FR-1.3 (the
guard's rejected attempt, `origin: 'access'`) will use the same function. It is not wired by
this decision.

### 7. Bootstrap

The first Administrator is created by `scripts/admin/create-user.js`, run on the host under
the environment's configuration. The script reads the password from an interactive prompt,
never from an argument or an environment variable, and writes an `auth` audit event. **There
is no HTTP bootstrap endpoint and no default credential.**

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| **Campus single sign-on** (SAML or OIDC against the institution) | Conflicts with NFR-1.3 / SCP-016 (no campus-system identifiers; users held locally). Depends on institutional cooperation outside the team's control (CON-008) |
| **JWT access token, stateless** | Revocation (AC-FR-1.4, "existing sessions are terminated") would need a server-side deny-list, which is a session store under another name. Idle expiry needs server-side activity tracking for the same reason |
| **`express-session` + `connect-mongo`** | Two new dependencies. The stored shape (`expires`, serialised blob) does not match the RTM's "TTL on `lastSeenAt`" design. The epoch and idle checks become library options that are hard to negative-verify |
| **argon2id** | OWASP's first preference, but in Node it needs a native dependency (`argon2`) built on the VPS. scrypt is built in and is an OWASP-listed alternative |
| **bcrypt** | Also a native dependency. It truncates passwords at 72 bytes |
| **Middleware returns 401 itself** | Two places would decide 401, and every public route would need an exemption. DEC-012 puts the decision in one guard |
| **An absolute session lifetime of N hours** | No requirement states one. Choosing N would invent a value (project rule: never invent a domain value) |
| **Login throttling or account lockout** | No requirement or threshold exists. Lockout gives an attacker a denial-of-service lever against real users. Recorded as **RSK-021**, not decided here |

## Consequences

- **AC-FR-1.1, AC-NFR-3.4 and AC-FR-1.4 become testable over HTTP.** AC-FR-1.1's "presents
  the authentication prompt" is a client behaviour. The API half (`401`, no request data) is
  what this decision can evidence until a UI exists.
- **AC-FR-1.4 is only partly met.** Termination through `sessionEpoch` is implemented. The
  Administrator create, amend and revoke functions of FR-1.4 are not. Only the bootstrap
  script creates users.
- **AC-NFR-1.4 is only partly met.** Authentication events are written and minimised.
  Retention at day 90 rests on the TTL index definition (DB-01 §3.6), which is not
  retention observed. Transitions and assignments are logged by the Atlas trigger, which
  this decision does not touch.
- **The `civicconnect-app` database role needs CRUD on `sessions`.** That is recorded in the
  DEC-003 version that accompanies this ADR. The `find`+`insert`-only grants on
  `requestHistory` and `auditLog` are unchanged.
- **The hash makes login deliberately slow.** About 0.3 s per attempt on the development
  machine. Concurrent logins hold 32 MiB each while hashing.
- **No login throttling** (RSK-021). The slow hash is the only rate limit, per process.
- **Local development** must use `http://localhost`, not a LAN IP (see the cookie row).

## Evidence still required

1. **VPS hash timing.** Re-run the measurement on the Hostinger VPS (DEC-003) with the same
   script and record the result here in a new version. If the median is materially above
   about 1 s, revisit p within the OWASP-equivalent set.
2. **Smoke check against the test cluster.** Reachability evidence in `docs/evidence/`, which
   must state the database user it ran as.
3. **Atlas role.** When DB-01 layer 3 is created, verify both that the `sessions` grant works
   and that an update on `requestHistory` with the application credential fails.
