# DEC-002 — Technology stack: MERN on MongoDB Atlas, with a weighted comparison of the alternatives

| Field | Entry |
|---|---|
| **ID** | DEC-002 (closed at M2 in the Decision Log v0.4; the DEC-002 row in Decision Log v0.6 cites this ADR. This ADR adds the structured comparison that M2 brief §5.5 asks for; the log entry remains the record of the decision) |
| **Date** | Decision 29/09/2026 (E. Lindsay). Comparison recorded 30/09/2026 |
| **Owner** | Decision: Ethan Lindsay. Comparison: Robert van der Merwe (technology stack and deployment compatibility) |
| **Status** | Decided. The comparison is **pending review by the decision owner** and team agreement on the weights |
| **Affects** | CON-003, CON-004, CON-006, CON-007, CON-008, CON-013, CON-015, CON-017, CON-019, ASR-02, ASR-05, NFR-1.7, NFR-1.10, NFR-3.7, DEC-003, DEC-010, DEC-016, RSK-007, RSK-015 |
| **Supersedes** | Nothing. It formalises the one-line alternatives entry in the Decision Log |

## Context

The Decision Log records DEC-002 as MERN (MongoDB, Express, React, Node.js) on MongoDB Atlas.
It lists the alternatives in one line ("Postgres and MySQL") and gives no comparison. M2 brief
§5.5 requires "evidence of comparison against requirements/ASRs, team capability, schedule,
cost/licensing, security, maintainability, ecosystem/dependency risk and deployment
compatibility".

**This comparison was recorded one day after the decision.** It formalises the reasoning in
the log against the brief's criteria. It is not presented as the instrument that produced the
decision, and it does not re-open it. Where the evidence favours an alternative, this record
says so.

Front end and runtime are common to every candidate: React on the client, and Node.js with
Express on the server. The log's capability argument, one language across client and server
for three part-time members (CON-004), therefore applies equally to all three. The
alternatives differ in the **persistence engine**, which is where the comparison is made.

| | Candidate | Persistence |
|---|---|---|
| **A** | MERN (selected) | MongoDB on Atlas, one free M0 cluster per environment (DEC-003), Mongoose ODM |
| **B** | PostgreSQL + Express + React + Node | PostgreSQL, self-hosted on the DEC-003 VPS |
| **C** | MySQL + Express + React + Node | MySQL (InnoDB), self-hosted on the DEC-003 VPS |

B and C are assessed as self-hosted on the VPS the team already has under DEC-003. Managed
free tiers for PostgreSQL and MySQL were **not evaluated**, so no claim is made about them.

## Criteria and weights

The criteria are the eight named in M2 brief §5.5. Each weight comes from a baselined
constraint or ASR, and the weights sum to 100.

| # | Criterion | Weight | Why this weight |
|---|---|---|---|
| 1 | Fit to requirements and ASRs | 20 | ASR-02 (lifecycle integrity and audit) with CON-015 (auditable via triggers) and CON-017 (transactional). This is the criterion the persistence engine decides |
| 2 | Team capability | 15 | CON-004: three part-time students; the technology must be learnable and supportable |
| 3 | Schedule | 15 | CON-013 week-3 gate; RSK-015 (the 22/09 deadline) had already materialised |
| 4 | Cost and licensing | 15 | CON-003: free or low-cost where practical |
| 5 | Security | 10 | CON-006, CON-007, CON-019, NFR-3.7 (encryption at rest) |
| 6 | Maintainability | 10 | ASR-05, NFR-1.7, CON-015 (database changes version-controlled) |
| 7 | Ecosystem and dependency risk | 5 | RSK-007; lock-in of the audit mechanism |
| 8 | Deployment compatibility | 10 | CON-008, DEC-003, and the repeatable-build properties from A2 §5.6 |

Scale: 1 = poor, 3 = adequate, 5 = strong. Where the evidence does not tell the candidates
apart, they get the **same** score, and that is stated rather than a difference being invented.

## Weighted comparison matrix

| # | Criterion (weight) | A: MERN / Atlas | B: PostgreSQL | C: MySQL | Evidence |
|---|---|---|---|---|---|
| 1 | Requirements / ASR fit (20) | **3** | **5** | **4** | A2 §3.2: a relational trigger "fires within the transaction of the statement that caused it", so CON-015 and CON-017 are met together, and A2 §3.6 recommended database enforcement on that basis. Atlas Database Triggers run from change streams **after commit** (MongoDB documentation, cited in DEC-016), so on A the audit write cannot be inside the transaction; that required DEC-016 and CR-001 (AC-NFR-1.10). A still supports multi-document transactions, because M0 is a three-node replica set. C: InnoDB triggers are transactional but row-level only |
| 2 | Team capability (15) | 4 | 4 | 4 | JavaScript across client and server in every candidate (Decision Log DEC-002 rationale). No recorded evidence of the team's relative experience with document or relational databases, so the scores are equal |
| 3 | Schedule (15) | **5** | **2** | **2** | The application slice (PR #57, 29/09/2026) was built on Mongoose before DEC-002 closed, and the corrected slice now passes 80 tests on it. Moving to B or C means rewriting 9 schemas in `src/models/`, the repositories and the unit of work after RSK-015 has already materialised |
| 4 | Cost and licensing (15) | 4 | 4 | 4 | A: Atlas M0 is free, one per environment, but has no backups, which costs the DEC-010 operated dump. B/C: open-source engines on the already-paid DEC-003 VPS, with no licence cost but the team operates them. Licences: PostgreSQL Licence, MySQL Community (GPLv2), MongoDB (SSPL, which restricts offering MongoDB as a service, not using it). Equal |
| 5 | Security (10) | 3 | 3 | 3 | TLS is available in all three. Encryption at rest is unproven in all three: A's NFR-3.7 is an open DEC-003 evidence item, and on B/C it depends on disk encryption the team would configure on the VPS. Equal |
| 6 | Maintainability (10) | 3 | 3 | 3 | Each splits some logic out of application code: A's trigger configuration in `scripts/atlas/`, B/C's trigger DDL in migrations. A2 §3.6 notes that split as a cost for every database-enforced option. Schemas are version-controlled in all three. Equal |
| 7 | Ecosystem / dependency risk (5) | 3 | 4 | 4 | Mongoose, pg and mysql2 are all mature. A's audit mechanism is a vendor-managed Atlas service with no self-hosted equivalent, so CON-015's mechanism is tied to one provider. B/C run their triggers in the engine |
| 8 | Deployment compatibility (10) | **4** | **3** | **3** | A: hosted independently of the institutional environment (CON-008), with no database administration on the team's VPS. B/C: the database shares the single VPS, which adds a second single point of failure on one host (RSK-017) and puts patching and backups on three part-time members. All three satisfy A2 §5.6: a lock file and one-command build and test |
| | **Weighted total (out of 100)** | **74.0** | **72.0** | **68.0** | Σ(weight × score) ÷ 5 |

## Sensitivity

The result is **close** and depends on the schedule criterion:

| Weighting | A: MERN | B: PostgreSQL | C: MySQL | Leader |
|---|---|---|---|---|
| As above | 74.0 | 72.0 | 68.0 | A |
| Schedule weight 0 (a greenfield choice) | 69.4 | **77.6** | 72.9 | **B** |
| Fit 30, cost 5 | 72.0 | **74.0** | 68.0 | **B** |
| Schedule 25, fit 10 | **78.0** | 66.0 | 64.0 | A |

## Conclusion

- **MERN is supported, but narrowly.** Its lead comes from schedule (working code and tests
  already exist on it) and from deployment independence (a hosted database, and no database
  administration on the team's single VPS).
- **On fit to requirements alone, PostgreSQL is the stronger engine.** It is also what A2
  §3.2 and §3.6 implied: the transactional trigger that CON-015 and CON-017 assume is
  native to a relational engine.
- The cost of choosing MERN is already on record. The audit write moved outside the
  transaction (DEC-016), AC-NFR-1.10 needs controlled change (CR-001), the trigger-suspension
  risk RSK-018 exists, and the audit mechanism is tied to Atlas.
- **The decision stands.** Changing it now would cost more than the fit gap it would close,
  and that is the judgement the matrix records. It is the direct answer to M2 brief §15 Q8:
  the final decision **differs** from the A2 research, and the CivicConnect-specific
  evidence that changed the judgement is schedule and hosting.

## Re-open triggers

Re-open DEC-002 through controlled change if any of the following happens:

- CR-001 is rejected, i.e. the team requires the audit row inside the transaction.
- Atlas Database Triggers become unavailable to the project.
- RSK-018 materialises: audit events are lost to trigger suspension.
- The M3 load test or storage growth crosses the DEC-010 upgrade triggers, and the paid-tier
  cost (DEC-010 E3) exceeds a self-hosted relational alternative.

## Verification of this record

The weights and scores are team judgements drafted with AI assistance (AI Usage Register
v0.6). The arithmetic was checked by script. Each evidence cell cites a project artefact or
A2 section. Before the M2 baseline, **the decision owner (E. Lindsay) and the team must
review and confirm the weights**.
