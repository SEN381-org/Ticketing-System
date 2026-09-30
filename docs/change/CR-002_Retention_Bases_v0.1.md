# CR-002 — NFR-1.4 / NFR-1.9 / NFR-4.2 measurement bases; AC-NFR-4.2 v0.3

*Extracted from DEC-017. Status: Proposed.*


| Field | Entry |
|---|---|
| Change ID | CR-002 |
| Requested change | (1) NFR-1.4 measurement basis: add *"Entries are held in `auditLog` under the accountability purpose recorded in DEC-017, contain identifiers, event types, changed field names and status values only, and are retained for 90 days by a TTL of 92 days."* Requirement text and figure unchanged. (2) NFR-1.9: append *"Audit rows record which fields changed, not their values, for any field classified personal under DEC-017."* (3) NFR-4.2 measurement basis: *"One month is measured as 30 days from `closure.closedAt`. Backup archives retained under DEC-010 (7 days) are excluded from the live-data measurement and are re-anonymised on restore."* (4) **AC-NFR-4.2 v0.3** replaces the v0.2 text, which still carries "[NOT VERIFIABLE UNTIL R IS CONFIRMED — see OI-05]" although PED Appendix A already cites v0.3 |
| **AC-NFR-4.2 v0.3** | *Given* a request closed more than 30 days ago, *when* its `requests` document, its `requestHistory` entries and the `notifications` for it are examined, *then* every field listed in `REQUEST_PERSONAL_FIELDS` and `HISTORY_PERSONAL_FIELDS` is null, `anonymisedAt` is set, no notification for it remains, and the FR-8.1/FR-8.2 counts computed before and after anonymisation are identical |
| Reason | Resolves OI-06. Makes AC-NFR-4.2 evaluable and brings the AC register in line with PED Appendix A (handover §3.2) |
| Requirements affected | NFR-1.4, NFR-1.9, NFR-4.2 (bases), AC-NFR-4.2 |
| Data | Trigger `full_document: false`; auditLog TTL 92 d; notifications TTL 30 d |
| Security/privacy | Positive: removes the only path by which personal free text would outlive DEC-005 |
| Testing | M3: trigger output inspected for absence of value fields; AC-NFR-4.2 scripted check after a PROC-001 run |
| Recommendation | **ACCEPT** |
