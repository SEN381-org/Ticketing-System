# CR-004 — NFR-2.6 index justification scope

*Status: Proposed.*


| Field | Entry |
|---|---|
| Requested change | NFR-2.6 currently permits an index only if justified against a named query from FR-4.3, FR-4.4, FR-4.5 or FR-8.1–8.5. Proposed: *"… against a named query arising from a functional requirement, or against an integrity invariant recorded in the data baseline."* AC-NFR-2.6 amended likewise |
| Reason | As worded, NFR-2.6 forbids the indexes FR-3.1 (requester's list), FR-3.3/FR-7.4 (timeline) and FR-2.6 (unique reference) require, and the unique indexes that enforce DB-01 and DEC-014 idempotency. The M1 text listed only the staff and reporting queries |
| Impact | Requirements (NFR-2.6, AC); data baseline index table already written against the proposed text; no code impact |
| Recommendation | ACCEPT |

