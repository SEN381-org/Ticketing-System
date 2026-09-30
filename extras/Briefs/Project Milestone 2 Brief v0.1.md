SOFTWARE ENGINEERING 381 — SEN381

CIVICCONNECT PROJECT

MILESTONE 2 (M2)

Architecture, Technology & Initial Design Baseline

From Research Evidence to Controlled Development

Team size  Exactly 3 students

Raw assessment  50 marks

Project weighting  25 project marks

Shared team artefacts/evidence  30 raw marks

Individual presentation  5 raw marks

Individual engineering defence  15 raw marks

PED v2.0 — Architecture, Technology & Initial Design

Primary controlled output

Baseline

Evidence of Development process

Governing document  SEN381 CivicConnect Master Project Brief

Raw: 50 marks  |  Project weighting: 25 marks  |  Team evidence: 30  |  Individual evidence: 20

Central Question

Can the team evolve its M1 requirements baseline into defensible architecture, data, technology and initial design

decisions, use relevant Assignment 2 (A2) research as evidence where those decisions require it, baseline the

resulting solution direction, and show that controlled development has begun?

1. Relationship to the Master Project Brief

This is a focused milestone brief. The SEN381 CivicConnect Master Project Brief remains the single source of truth for

project-wide standards, team rules, GitHub governance, AI accountability, presentation expectations, evidence quality,

baseline/change control and assessment conduct.

When unsure — return to the Master Project Brief

If the team is unclear about the expected standard, evidence quality, repository controls, documentation conventions,

presentation  requirements,  AI  use,  accountability  or  change-control  process,  consult  the  SEN381  CivicConnect

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline

Master Project Brief first. This milestone brief does not repeat every project-wide rule.

2. M2 Progression: M1 + Teaching + A2 Evidence → Engineering

Commitment

Milestone 1 established the engineering foundation and requirements baseline. M2 does not restart the project. It

extends the same Project Engineering Document (PED) and converts the evidence now available to the team into

controlled project-specific decisions that are sufficiently mature for meaningful development.

M1 Baseline → Week 2 Architecture/Data/Technology Knowledge → Relevant A2 Research → Project-Specific

Judgement → PED/ADR/RTM → Architecture, Technology & Initial Design Baseline → Application Evidence

A2 researches — M2 decides and applies

Assignment 2 provides research, alternatives and recommendations. M2 must not copy that research into the PED.

The team must use relevant evidence together with CivicConnect requirements, ASRs, constraints, risks, architecture

and  implementation  realities  to  make  the  final  project  decision.  A  final  M2  decision  may  differ  from  the  A2

recommendation when the team can defend the project-specific reason.

M2 is a continuation — not a new report

Continue developing the SAME Project Engineering Document created for M1. The expected controlled version at

this  checkpoint  is  PED  v2.0.  An  unchanged  M1  PED  plus  a  separate  'Milestone  2  Report'  does  not  satisfy  the

documentation requirement.

3. Progressive Evidence — Do Not Wait to Finish All Research

A2 spans Weeks 3–4 and M2 development is already progressing. Teams must therefore use research when it becomes

relevant rather than waiting for the final A2 submission. Not every later A2 topic has to be complete before M2, but a

decision that materially shapes implementation should not be baselined without the best evidence reasonably available

at that point.

•  Architecture, quality attributes, data/persistence direction and technology selection primarily build from Week

2 teaching and project evidence.

•  A2 design-quality/design-pattern research should inform the initial design-pattern decisions before substantial

affected code is built.

•  A2 persistence research should strengthen data-integrity and implementation decisions as relevant operations

are developed.

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline

•  A2 API/integration research should inform interface/boundary decisions when those interactions are being

established.

•  A2 SCM/CI research is progressively adopted as Week 4 develops; M2 does not require a mature CI/CD

pipeline.

•  Where stronger evidence arrives after a decision was baselined, use controlled change rather than silently

rewriting the original decision.

4. One Evolving PED — Explicit Documentation Evidence

PED v2.0 must visibly show the evolution from M1. Baselined content must not be silently overwritten or removed.

The assessor must be able to distinguish what was established in M1, what new evidence became available, what

decisions were made for M2, and what application evidence now exists.

4.1 Continued engineering documentation

•  Update document control to PED v2.0, including version history, contributors, review and approval/sign-off.

•  Review M1 requirements, assumptions, constraints, acceptance criteria and Forward Engineering

Considerations; update only where evidence justifies change.

•  Maintain the Risk Register with new architecture, data, technology, dependency, design, security, deployment,

cost and implementation risks.

•  Expand the Decision Log/ADRs for significant architecture, persistence, technology, design and interface

decisions.

•  Where A2 evidence informs a decision, reference the relevant research finding/source or A2 section from the

ADR/decision record without copying the entire research discussion into the PED.

•  Preserve superseded decisions and the reason for change.

4.2 The Requirements Traceability Matrix MUST evolve

The RTM is a living engineering matrix, not an M1-only requirements table and not an Assignment 2 tracker. Its

columns must progressively show how requirements are being translated into engineering decisions and

implementation/verification evidence.

Required RTM progression

Where M2 has produced relevant evidence, populate the corresponding columns. Where evidence legitimately does

not yet exist, use a controlled status such as Planned / Not Yet Implemented. Do not add an 'Assignment 2' column

simply to prove the assignment was completed; supporting research belongs in ADR/decision evidence.

RTM field / equivalent

What should be visible by M2

Requirement ID & current wording

Stable identifier and approved requirement.

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline

Stakeholder/source & priority

Origin and current importance.

Acceptance criteria

Measurable/testable acceptance evidence.

ASR / quality-driver link

Where the requirement materially drives architecture or

quality.

Architecture / module / component

Allocated responsibility/boundary.

Data / persistence impact

Relevant entity, ownership, storage, integrity or

consistency implication.

Design / interface decision

Relevant pattern, component collaboration or interface

decision where established.

Technology decision

Relevant stack/runtime/framework/store decision.

Implementation evidence

Branch, class, module, endpoint, migration, UI artefact

or other meaningful evidence.

Verification evidence

Initial test/check reference where available; otherwise

Planned.

Status

Approved / In Development / Implemented / Changed /

Deferred or controlled equivalent.

ADR / change / risk reference

Links to significant decisions or approved changes

affecting the requirement.

5. Required M2 Engineering Decisions and Evidence

5.1 M1 baseline review and controlled evolution

•  Review the approved M1 baseline before adding M2 decisions.

•

Identify material clarifications, new constraints, changed assumptions or scope effects.

•  Use formal change control where a baselined requirement/scope/constraint materially changes.

•  Update affected PED sections, RTM, risks, assumptions/dependencies and acceptance evidence.

•  Preserve the original baseline and reason for change.

5.2 ASRs and quality drivers

•

Identify the requirements/quality attributes that materially influence CivicConnect architecture.

•  Link each significant driver to stakeholder/project evidence, constraints or risks.

•  Use measurable/testable expectations where appropriate.

•  Show how the selected drivers influence architecture, data, technology and design decisions.

•  Avoid generic lists of every quality attribute taught.

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline

5.3 Architecture decision and diagrams

•  Consider realistic architecture alternatives appropriate to CivicConnect.

•  Select and justify a proportionate architecture against ASRs, constraints, team capability, deployment

implications and complexity.

•  Provide clear architecture diagrams showing meaningful responsibilities/boundaries and interactions.

•  Distinguish architecture from technologies and logical layers/modules from physical deployment tiers.

•  Record significant architecture decisions and consequences in ADRs.

Proportional architecture

A more distributed architecture is not automatically more advanced. Complexity must be justified by project

evidence.

5.4 Data and persistence baseline

•

Identify important data entities/aggregates, relationships, ownership and lifecycle implications.

•  Provide an appropriate initial data model/schema.

•

Justify the persistence model(s) from structure, relationships, access patterns, integrity, consistency, sensitivity

and expected growth.

•  Address relevant database bottleneck/SPOF, scalability, availability and backup/recovery implications at an

architectural level.

•  Where A2 persistence research is already relevant to an operation being implemented, use it to strengthen

transaction, validation, integrity/concurrency and responsibility decisions.

•  Record significant decisions/risks and update related RTM/application evidence.

5.5 Technology-stack decision

•  Select frontend, backend/runtime, persistence and relevant build/dependency/testing/deployment-compatible

technologies.

•  Show evidence of comparison against requirements/ASRs, team capability, schedule, cost/licensing, security,

maintainability, ecosystem/dependency risk and deployment compatibility.

•  Record important versions, compatibility assumptions and dependencies.

•  Use authoritative evidence for version/licensing/security/deployment claims, including claims initially

obtained using AI.

•  Record significant decisions in ADRs and update risks/assumptions.

5.6 Initial design decisions — informed by A2 research

Before substantial implementation of the affected areas, identify at least TWO genuine CivicConnect design problems

and make a final project-specific design-pattern/approach decision for each. Assignment 2 research should provide the

alternatives/evidence; M2 assesses the team's final judgement and translation into the software.

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline

•  State the actual design problem/context before naming a pattern.

•  Reference the relevant A2 research evidence and alternatives considered.

•  Select the final pattern/approach and explain why it fits CivicConnect requirements, architecture and

constraints.

•  Document the expected benefit (for example reduced coupling, improved cohesion, extensibility,

maintainability or testability) AND the complexity/trade-off introduced.

•

Identify the affected modules/components/classes/interfaces and provide an appropriate design diagram where

useful.

•  Record the decision in an ADR/design record and link it to relevant RTM/application evidence.

•  Show initial implementation evidence where development of the affected area has begun.

Research recommendation ≠ automatic project decision

The M2 choice may match or differ from the A2 recommendation. If it differs, explain the CivicConnect-specific

evidence that changed the judgement. Marks are awarded for defensible application of evidence, not obedience to the

assignment recommendation.

5.7 Initial API / integration decisions where applicable

Where implementation has reached a meaningful component/module/external interaction, document the initial

interface/integration decision. Use relevant A2 integration research if available.

•  Define responsibilities and information exchanged.

•  Choose a proportionate interaction mechanism; do not create a network boundary simply because APIs or

microservices were taught.

•  Document validation, error/failure behaviour, security boundary and change/version implications at the level

currently known.

•  Update ADR/design/application documentation and RTM where the interaction supports traced requirements.

•

If the interaction is legitimately not yet established, record it as a forward engineering consideration rather than

inventing evidence.

5.8 Deployment compatibility — anticipate, do not over-implement

•

Identify the current deployment direction/environment assumption.

•  Show that selected architecture/data/technology decisions are plausible for that direction.

•

Identify known configuration, secrets, persistence/state and networking implications.

•  Record material compatibility, cost, availability or operational risks.

•  Record deliberately deferred deployment decisions and the evidence required later.

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline

6. Architecture, Technology & Initial Design Baseline

Once the above decisions are sufficiently stable, the team must identify and approve the M2 Architecture, Technology

& Initial Design Baseline. This does NOT mean the complete detailed design is finished. It means the team has enough

controlled direction to develop without repeatedly making foundational decisions ad hoc.

•

Identify what is included in the baseline and its version/date.

•  Record approval/sign-off using the project standard.

•

Identify known open decisions/deferred concerns separately.

•  Any material post-baseline change must follow controlled change/ADR practices.

•  The baseline must remain traceable to requirements/ASRs and the evidence used to make significant decisions.

7. Development MUST Now Be Meaningful

M2 marks the transition from baselining into controlled construction. Teams must show verifiable project-specific

implementation against the approved direction. There is no required percentage completion; quality, traceability and

authenticity matter.

•  Repository/project structure aligned to architecture/modules.

•  Working project/bootstrap configuration using the selected stack.

•  Meaningful initial domain/model/application components.

•

•

Initial schema/migrations/persistence artefacts where appropriate.

Initial interface/API/UI/functional path where appropriate.

•  At least initial application of the selected design decisions in areas that have been developed.

•  Configuration/environment structure without committed secrets.

•

Initial automated verification where meaningful at the current stage.

•  Progressive issues/tasks, branches, commits and reviewed Pull Requests.

Insufficient development evidence

Empty folders, untouched framework scaffolding, bulk uploads immediately before assessment, generated

boilerplate with no project-specific work, or a stand-alone 'Hello World' screen do not demonstrate meaningful

construction.

8. Application / Technical Documentation

The PED explains engineering reasoning. Application documentation explains the software that now exists and how

another developer/assessor can understand, run and continue it. Both are required and must agree.

•  README with purpose, current implementation status, prerequisites and setup/run instructions.

•  Current technology/runtime/dependency versions.

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline

•  Repository structure mapped sufficiently to architecture/modules.

•  Database/schema/migration setup where implemented.

•  Defined interfaces/API endpoints where established.

•  Environment/configuration requirements without exposing secrets.

•  Module/component responsibilities and relevant design-pattern application documented.

•

Initial testing/run instructions and known limitations/TODOs.

•  Meaningful code documentation for non-obvious intent.

•  Links/references to PED/RTM/ADR evidence where practical.

Evidence completeness rule

A documented decision with no visible translation into the application is incomplete once implementation of that

area has begun. Code with no traceable engineering reasoning is also incomplete.

9. Required Traceability Demonstration

Demonstrate at least one meaningful end-to-end implementation path:

Requirement → ASR/Constraint → Architecture Responsibility → Data Decision → Design/Interface Decision

→ Technology/ADR → Application Artefact → Initial Verification

Where Assignment 2 research informed one of these decisions, the relevant ADR may reference that supporting

research, but the RTM should continue tracing the engineered product rather than the assessment.

10. Progressive GitHub / Collaborative Engineering Evidence

•  Continue using the same controlled team repository and project-wide GitHub standards.

•  Maintain protected main and the required two independent approvals for substantive Pull Requests.

•  Use meaningful issues/tasks, branches, commits and PR descriptions.

•  Review documentation and code changes; peer review is not only for source code.

•  Do not commit credentials, secrets or sensitive configuration.

•  Show authentic progressive contributions by all team members.

•  Where A2 SCM/CI research has already produced an appropriate improvement, begin adopting it and

document the decision.

•  A mature CI/CD pipeline is not an M2 requirement, but repeatable automated checks already introduced

should be shown as evidence.

11. Explicit M2 Boundaries

M2 does not require:

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline

•  A completed application.

•  A mature CI/CD pipeline.

•  Complete automated test coverage.

•  Production deployment or full observability/operations.

•  Final performance/security testing or final UI polish.

•  Completion of every API/integration decision.

•  A complete detailed design for every future class/component.

•  Copying Assignment 2 research into the PED.

Teams may progress further where work is controlled and understood. Additional volume earns no credit by itself;

evidence must remain aligned, traceable and professionally engineered.

12. Required Submission / Evidence Set

•  PED v2.0 — the evolved M1 document.

•  Updated RTM with relevant M2 design/interface/implementation/verification/status evidence.

•  Updated Risk Register, assumptions/dependencies and Forward Engineering Considerations.

•  Architecture diagrams, ASR evidence and architecture ADR(s).

•

Initial data/persistence model and decision evidence.

•  Technology-stack selection evidence and ADR(s).

•  At least TWO final project-specific design-pattern/approach decisions informed by relevant A2 research, with

ADR/design/application evidence.

•

Initial interface/integration decision evidence where implementation has reached such boundaries.

•  Architecture, Technology & Initial Design Baseline approval/sign-off.

•  Controlled repository containing progressive documentation and meaningful application development.

•  Application/technical documentation including README/setup/current structure.

•  At least one end-to-end trace from requirement to implementation/verification evidence.

•  Updated AI Usage Register where applicable.

13. Assessment Structure — 50 Raw Marks

M2 is assessed on a 50-mark raw scale and converted to the approved project weighting of 25 marks. The established

30 shared team + 20 individual structure remains.

13.1 Team Evidence — 30 Marks

Criterion

Marks

Evidence focus

A. PED v2.0 continuity, RTM

5

evolution & controlled M1

Visible evolution, version/change

history, updated RTM columns,

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline

changes

B. ASRs, architecture &

5

Architecture/Technology baseline

reasoning

risks/assumptions/forward

considerations; no parallel M2 report.

Project-specific drivers, alternatives,

diagrams, proportional architecture,

ADRs and controlled baseline.

C. Data/persistence engineering

4

Data

D. Technology selection &

4

deployment compatibility

E. Research-informed initial

5

design & integration decisions

F. Meaningful development,

7

application documentation &

GitHub evidence

model/ownership/integrity/consistency

and relevant

scalability/availability/SPOF

implications; research evidence used

where applicable.

Evidence-based stack selection,

versions/dependencies,

cost/security/team/compatibility risks

and deployment direction.

At least two genuine design problems;

A2 evidence referenced; final

pattern/approach judgement, trade-offs,

ADR/design/interface traceability and

application translation.

Project-specific construction,

README/technical docs, traceable

requirement→decision→implementation

evidence, progressive controlled

repository/reviews and initial

verification.

13.2 Individual Examination — 20 Marks

Presentation Skill & Professional Communication — 5 Marks

•  Logical structure, timing and professional flow.

•  Clear explanation rather than reading the PED/slides.

•  Effective use of live controlled artefacts and diagrams.

•  Professional handovers and evidence navigation.

•  Ability to locate requested evidence efficiently.

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline

Individual Engineering Defence & SE Understanding — 15 Marks

•  Command of actual M2 artefacts and personal contribution — 3 marks.

•  Architecture/data/technology/design reasoning and trade-offs — 3 marks.

•  Ability to explain how research evidence informed but did not dictate project decisions — 3 marks.

•  Traceability, baseline/change consequences and forward engineering implications — 3 marks.

•  Authenticity, accountability and ability to defend/critique implementation decisions — 3 marks.

14. Presentation / Defence Expectations

•  Show how PED v1 evolved into PED v2.0 rather than presenting a new report.

•  Show the RTM live and demonstrate how relevant columns have progressed from M1.

•  Defend architecture, data and technology decisions using project evidence.

•  For at least one design decision, show: A2 evidence/alternatives → final M2 judgement → ADR/design →

application evidence.

•  Show at least one end-to-end requirement trace into implementation/verification.

•  Demonstrate meaningful application progress and current application documentation.

•  Explain at least one decision deliberately deferred and what evidence is still needed.

•  Every student must be able to navigate and defend the shared engineering evidence.

15. Indicative Engineering Defence Questions

1.  Show one M1 requirement and trace how its engineering evidence has evolved by M2.

2.  Which ASR most influenced your architecture, and what evidence supports that judgement?

3.  What architecture alternative did you reject and why?

4.  Show a data/persistence decision that protects business correctness.

5.  Show the evidence behind one technology-stack choice and the alternative considered.

6.

Identify one A2 research finding that materially informed an M2 decision.

7.  For one of your two design problems, what alternatives did A2 research identify and why is your final M2

choice appropriate here?

8.  Did any final M2 decision differ from the A2 recommendation? If so, what CivicConnect-specific evidence

changed the judgement?

9.  Show where a selected design pattern/approach appears in your design/application. What complexity did it

introduce?

10.  Show an ADR and explain what other PED/RTM/application artefacts would change if the decision changed.

11.  Open the RTM. Which columns have progressed since M1 and why?

12.  Show a requirement marked In Development and its repository/application evidence.

13.  Show your application documentation and explain how another developer would run/continue the project.

14.  What part of your implementation is meaningful project-specific work rather than generated scaffolding?

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline

15.  Which A2/Week 4 collaboration or CI recommendation have you adopted already, and which remains

deferred?

16.  What did AI assist with, what did the team verify, and where is the evidence?

16. M2 Completion Check

☐ PED v2.0 visibly continues M1 and retains traceable history.

☐ RTM has evolved with relevant architecture/data/design/interface/technology/implementation/verification/status

evidence.

☐ Risk Register, assumptions/dependencies and Forward Engineering Considerations reflect new evidence.

☐ ASRs/quality drivers are project-specific and linked to architecture decisions.

☐ Architecture selection and diagrams are defensible and proportionate.

☐ Data/persistence decisions are documented and linked to correctness/quality needs.

☐ Technology stack is justified with evidence rather than preference.

☐ At least two genuine design problems have final pattern/approach decisions informed by relevant A2 research.

☐ A2 research is referenced as supporting evidence, not copied into the PED.

☐ Initial interface/integration decisions are documented where applicable.

☐ Architecture, Technology & Initial Design Baseline is identifiable and controlled.

☐ Meaningful development has begun against the baseline.

☐ Application/technical documentation matches the repository/application.

☐ At least one requirement traces into actual implementation and initial verification evidence.

☐ GitHub history demonstrates progressive controlled work and peer review.

☐ Relevant A2 SCM/CI recommendations are adopted progressively where appropriate.

☐ AI use, where applicable, is recorded and verified.

☐ Every team member can defend the shared evidence and explain the research-to-decision relationship.

17. Final Reminder

Research informs — engineering judgement commits

M2 is not a second research report and not a coding race. It demonstrates that the team can evolve M1, use teaching

and relevant A2 evidence to make project-specific decisions, baseline enough architecture/technology/initial design

to  develop  responsibly,  and  show  traceable  documentation  plus  application  evidence.  When  uncertain  about

standards, return to the Master Project Brief.

SEN381 • CivicConnect • Milestone 2 • Architecture, Technology & Initial Design Baseline
