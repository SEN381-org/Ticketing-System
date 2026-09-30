# DEC-016 — Retention by purpose: request data 30 days after closure; audit log 90 days as a separate purpose (resolves OI-06)

| Field | Entry |
|---|---|
| **ID** | DEC-016 (new at M2) |
| **Date** | 29/09/2026 |
| **Owner** | Robert van der Merwe |
| **Status** | Proposed; decided on approval together with **CR-002** |
| **Closes** | OI-06 (escalated at v0.3) |
| **Affects** | NFR-1.4, AC-NFR-1.4, NFR-1.9, NFR-1.11, NFR-4.2, AC-NFR-4.2, NFR-4.5, DEC-005, CON-007, CON-014, CON-015, SCP-020, RSK-002, OI-12 |

## Context

OI-06 records a genuine contradiction between two baselined commitments:

- **NFR-1.4:** immutable log entries for every authentication attempt, status transition and
  assignment action, retained for **a minimum of 90 days**.
- **DEC-005 / NFR-4.2:** identifiable personal information retained for **no longer than one
  month** from closure.

If the audit log holds personal information, both cannot hold. Ethan's handover gives the
history: 90 days was chosen to sit *inside* any likely POPIA period, and DEC-005 then went
shorter, which inverted the relationship. **POPIA constrains the maximum retention period and
does not mandate a minimum**, so "the law requires 90 days" is not an available argument.

## Decision

Retention is set **per processing purpose**, not per system. The two commitments govern
different purposes and different data, and the data model is designed so that they never
govern the same fields.

| Purpose | Data | Retention | Justification |
|---|---|---|---|
| **A: service-request handling** | Personal fields of `requests` and `requestHistory` (description, location, requester, submitter, assignee, comment/action/resolution/closure text, actor on history entries); `notifications` | **≤ 30 days from closure** (`closure.closedAt`). "One month" in DEC-005 is **measured as 30 days** so AC-NFR-4.2 is evaluable by a third party | POPIA s.14(1): no longer than necessary for the purpose collected. After closure plus a reconciliation window, the purpose is spent (DEC-005 rationale) |
| **B: accountability and security audit** | `auditLog`: identifiers (request id, staff actor id, role), event type, **field names changed**, status values, auth outcome, timestamps. **No free text, no description, no location, no requester contact data** | **≥ 90 days** (TTL 92 days) | A distinct purpose, related to the organisation's functions: detecting and investigating misuse, supporting SCP-008 accountability and CON-015. Retention for a related lawful purpose is one of the s.14(1) exceptions ("reasonably requires the record for lawful purposes related to its functions or activities"). The purpose, the period and the minimised content are all recorded here, which is what makes relying on that exception defensible rather than convenient |
| **C: recovery** | `mongodump` archives (contain purpose-A data) | 7 days rolling | Needed for NFR-1.5 only. Short, encrypted, access-restricted. Restore re-applies PROC-001 |
| **D: operations** | Performance logs (NFR-1.11) | 30 days | NFR-1.11 forbids personal information in these entries, so POPIA retention does not apply. 30 days is an operational choice |
| **Aggregates** | Non-identifying remainder of anonymised requests; `reportingCounts` | Indefinite | CFL-004, FR-9.2, SCP-011 |

**Minimisation rule M-1 (binds the trigger function and code review):** `auditLog` entries
must be computable **without reading any purpose-A field value**. The trigger runs with
`full_document: false` on `requests` and copies only field *names*
(`updateDescription.updatedFields` keys), status values and actor identifiers. See the data
baseline §3.6.

**Consequence of M-1 for staff identity:** staff actor ids *are* personal information about
staff. They survive in `auditLog` for 90 days under purpose B, and are nulled from
`requestHistory` at anonymisation under purpose A. Accountability for a staff action therefore
lasts 90 days from the action, stated openly rather than implied.

## Why OI-06 is closed rather than just narrowed

OI-06 asked, for each of NFR-1.4, NFR-1.9 and NFR-1.11, whether the retained data contains
personal information. The answers:

| Requirement | Contains personal info? | Resolution |
|---|---|---|
| NFR-1.4 (auth, transition, assignment log) | Staff/user identifiers only, under M-1 | Purpose B, 90 days, keeps its figure. Measurement basis amended (CR-002) |
| NFR-1.9 (trigger audit) | Same store as NFR-1.4 | Purpose B. CR-002 adds the minimisation clause |
| NFR-1.11 (performance log) | No, by its own wording | Purpose D; no conflict |

No commitment needs its number changed. What was missing was the **purpose** attached to each
figure, together with a data design that keeps them apart.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Reduce NFR-1.4 to 30 days | Accountability would be lost exactly when it is most needed (disputes surface after closure). It also treats staff audit data as if it served the requester's purpose, which it does not |
| Extend DEC-005 to 90 days for all data | Keeps requester descriptions three times longer with no service purpose; weakens the CON-007 position; reverses a team decision without new evidence |
| Keep both figures and full-document audit | That is the contradiction OI-06 recorded. The audit copy of `description` would outlive the original by 60 days |
| Pseudonymise audit actor ids with a keyed hash | Adds key management for little gain at 90 days. Can be revisited if STK-009 asks for it |

## Residual items

- **OI-12 remains open.** The 30-day figure is still a team position, not STK-009-validated.
  DEC-016 does not change that. The purpose-B justification should be put to STK-009 at the
  same time.
- **New conflict raised as OI-13:** FR-6.7 says no user, including an Administrator, may
  alter a history entry. PROC-001 must null personal fields in `requestHistory`. See CR-003
  in `docs/operations/PROC-001_Manual_Anonymisation_v0.1.md`.
- **Backups** hold purpose-A data for up to 30 + 7 days. This is recorded as an accepted
  residual in the NFR-4.2 measurement basis, not hidden (CR-002).

## CR-002 — NFR-1.4, NFR-1.9 and NFR-4.2 measurement bases; AC-NFR-4.2 (Appendix E)

| Field | Entry |
|---|---|
| Change ID | CR-002 |
| Requested change | (1) NFR-1.4 measurement basis: add *"Entries are held in `auditLog` under the accountability purpose recorded in DEC-016, contain identifiers, event types, changed field names and status values only, and are retained for 90 days by a TTL of 92 days."* Requirement text and figure unchanged. (2) NFR-1.9: append *"Audit rows record which fields changed, not their values, for any field classified personal under DEC-016."* (3) NFR-4.2 measurement basis: *"One month is measured as 30 days from `closure.closedAt`. Backup archives retained under DEC-010 (7 days) are excluded from the live-data measurement and are re-anonymised on restore."* (4) **AC-NFR-4.2 v0.3** replaces the v0.2 text, which still carries "[NOT VERIFIABLE UNTIL R IS CONFIRMED — see OI-05]" although PED Appendix A already cites v0.3 |
| **AC-NFR-4.2 v0.3** | *Given* a request closed more than 30 days ago, *when* its `requests` document, its `requestHistory` entries and the `notifications` for it are examined, *then* every field listed in `REQUEST_PERSONAL_FIELDS` and `HISTORY_PERSONAL_FIELDS` is null, `anonymisedAt` is set, no notification for it remains, and the FR-8.1/FR-8.2 counts computed before and after anonymisation are identical |
| Reason | Resolves OI-06. Makes AC-NFR-4.2 evaluable and brings the AC register in line with PED Appendix A (handover §3.2) |
| Requirements affected | NFR-1.4, NFR-1.9, NFR-4.2 (bases), AC-NFR-4.2 |
| Data | Trigger `full_document: false`; auditLog TTL 92 d; notifications TTL 30 d |
| Security/privacy | Positive: removes the only path by which personal free text would outlive DEC-005 |
| Testing | M3: trigger output inspected for absence of value fields; AC-NFR-4.2 scripted check after a PROC-001 run |
| Recommendation | **ACCEPT** |
