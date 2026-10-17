# DEC-015 Addendum A: routes added at M4 that DEC-015 v0.1 §1 does not list

| Field | Value |
|---|---|
| Decision | DEC-015, API semantics (`DEC-015_API_Semantics_v0.1.md`) |
| Addendum | A, version 0.1 |
| Date | 17/10/2026 |
| Status | Accepted by E. Lindsay, 17/10/2026. Decision Log row to follow (R. van der Merwe) |
| Change type | Additive within `/api/v1` (DEC-015 §6). No existing route changes |

## Why

The M4 build completes M1-scope journeys that need routes DEC-015 v0.1 §1 does not list: the
category list for the submission form, user administration, the management view, the category
target time and category deactivation. This addendum fixes their method, status codes and access
rule before they are built, so none is designed silently in code.

## Rules carried from DEC-015 v0.1

- Errors are RFC 9457 problem details from the existing handler (§4).
- Every route goes through the guard, DEC-012 enforcement point 1, and is listed in
  `docs/api/openapi.yaml`.
- A state-changing POST or PUT requires `Idempotency-Key` (§3). Missing → 400.
- "Operation" is the key in `OPERATION_RULES` (`src/domain/accessRules.js`). Roles are the FR-1.2
  values only. Where an operation already exists, its role list is used unchanged.

## Routes

| # | Route | Method | Requirement | Operation and roles | Success | Errors |
|---|---|---|---|---|---|---|
| A1 | `/api/v1/categories` | GET | FR-2.3; FR-9.1 (a deactivated category is not selectable) | `category:list` (new): every FR-1.2 role, as `request:read` | 200: the active categories of the actor's campus, `{ id, code, name, isSecurity }`, plus `targetResolutionHours` (null if unset) for an actor holding `category:set-target` (Manager) or `category:administer` (Administrator). An actor holding `category:administer` also receives the deactivated categories, each with `active` (boolean); no other role receives an inactive category or the `active` key. Sorted by name A-Z ignoring case | 401 |
| A2 | `/api/v1/users` | GET | FR-5.1 ("a named staff user"); FR-1.4 | `user:list` (new): Coordinator and Manager (the `request:assign` roles) and Administrator. Query `role`, `categoryId` | 200: `{ id, displayName, roles }`. E-mail is returned to an Administrator only (data minimisation, CON-007) | 400 (role value not in FR-1.2), 401, 403 |
| A3 | `/api/v1/users` | POST | FR-1.4 (create); FR-1.2 and AC-FR-1.2 (a role is required) | `user:administer` (new): Administrator (named by FR-1.4) | 201, `Location` | 400 (names the missing field; no role → "A role is required"), 401, 403, 409 (an account with that e-mail exists) |
| A4 | `/api/v1/users/{id}/roles` | PUT | FR-1.4 (amend role assignments) | `user:administer` | 200 | 400, 401, 403, 404 |
| A5 | `/api/v1/users/{id}/revocation` | POST | FR-1.4 and AC-FR-1.4 (revoke; the existing session-epoch mechanism, DEC-018 §3) | `user:administer` | 201; a repeated revoke replays | 401, 403, 404 |
| A6 | `/api/v1/reports/summary?from=&to=&categoryId=` | GET | FR-8.1, FR-8.2, FR-8.3, FR-8.5, FR-8.6 | `report:read` (existing, unchanged) | 200: `{ byStatus, byCategory, overdue, total }`. Security-category requests are counted; no element carries a description, comment or action (FR-8.6). Aggregated on `requests`, not `reportingCounts` (OI-14) | 400 (bad date or id), 401, 403 |
| A7 | `/api/v1/categories/{id}/target` | PUT | FR-8.4 (Proposed, OI-02) | `category:set-target` (new): Manager (named by FR-8.4) | 200 | 400, 401, 403, 404 |
| A8 | `/api/v1/categories/{id}/deactivation` | POST | FR-9.1 (Proposed, OI-03); FR-9.2 | `category:administer` (new): Administrator (named by FR-9.1) | 201; a repeated deactivation replays | 401, 403, 404 |

409 in A3 is a new use of that status: DEC-015 v0.1 §4 lists 409 for idempotency in progress and
exhausted write-conflict retries only. A duplicate account is a conflict with existing state, which
is what 409 means in RFC 9110 §15.5.10.

## Not added

- Routes already in DEC-015 v0.1 §1: submission, list, search, transitions, assignments, comments,
  actions, details, history, notifications.
- No separate audit route: NFR-3.6 is served by `GET /api/v1/requests/{id}/history`. RTM v0.10
  (NFR-3.6, data/persistence column) records the source: within retention, `requestHistory`
  `actorId`, `actorRole` and `occurredAt`.
- Category create and amend (FR-9.1 text): AC-FR-9.1 tests deactivation only. Categories are
  seeded (the seed record names its source).

## Consequences

- `OPERATION_RULES` gains `category:list`, `user:list`, `user:administer`, `category:set-target`
  and `category:administer`. The route-table test covers every new route.
- `docs/api/openapi.yaml` documents A1 to A8. The route-equality test fails if it does not.

## Changes

- 17/10/2026: A1 returns targetResolutionHours to the roles that may set it (decision after the local walkthrough).
- 17/10/2026: A1 returns inactive categories, with active, to the Administrator; names sorted A–Z ignoring case (polish pass).
