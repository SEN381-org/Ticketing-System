# CR-001 — AC-NFR-1.10 narrowing

*Extracted from DEC-015 (`docs/decisions/ADR/DEC-015_Transaction_Boundary_v0.1.md`). Status: Proposed.*


| Field | Entry |
|---|---|
| Change ID | CR-001 |
| Requested by | R. van der Merwe, 29/09/2026 |
| Requested change | Replace AC-NFR-1.10 (v0.2) with the v0.3 text below. NFR-1.10 wording unchanged, because the audit row is written by the trigger, not by "the operation" |
| AC-NFR-1.10 v0.2 (preserved) | *Given* a status transition that writes to the request, the assignment and the audit trail, *when* a failure is injected after the first write and before the last, *then* no partial change is committed and all three tables remain in their pre-transition state |
| **AC-NFR-1.10 v0.3 (proposed)** | *Given* a status transition that writes the `requests` document (including its assignment fields) and a `requestHistory` entry inside one transaction, *when* a failure is injected after the first write and before commit, *then* neither document is changed, no `auditLog` entry for the aborted transition ever appears, and no event is published; *and given* the same transition committed, *then* exactly one `auditLog` entry per written document appears within 60 seconds |
| Reason | Atlas triggers execute after commit via change streams; the M1 criterion assumed SQL trigger semantics |
| Requirements affected | NFR-1.10 (AC only), NFR-1.9 (unchanged; its AC already targets a trigger-written row) |
| Architecture/design | DEC-011 unchanged. DEC-015 new. StatusTransitionService gains a unit-of-work port |
| UI/API/data | DEC-014 `If-Match`/412. `version` field added to `requests` |
| Security/privacy | None negative; audit remains unbypassable |
| Quality/testing | New unit test (append failure → nothing published); M3 integration fault-injection test; audit-lag measurement |
| Scope / schedule / cost | Small, within the follow-up PR to the slice; no cost |
| Risk | RSK-016 raised (trigger suspension) |
| Recommendation | **ACCEPT** |
