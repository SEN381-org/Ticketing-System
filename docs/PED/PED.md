# 2. Problem and Business Need

---

## 2.1 Problem statement

The campus currently manages service requests through a fragmented combination of
email, telephone calls, WhatsApp messages, spreadsheets and paper records. Requests
span facility faults, damaged equipment, security concerns, IT support, maintenance
issues and lost property.

The defining characteristic of the current process is not that requests go
unhandled, but that **no single controlled record of a request's lifecycle exists**.
Each channel holds a partial view. Nothing reconciles them.

Four consequences follow from that root cause, each affecting a different
stakeholder group:

**Requests are lost between channels.** A request submitted by email and repeated by
WhatsApp becomes two requests, or none. There is no mechanism to detect duplication
because there is no shared record to compare against.

**Requesters cannot see what is happening.** A requester (STK-001) has no way to
determine whether a request was received, assigned, delayed or resolved without
contacting someone directly — which generates further informal traffic and
compounds the original problem.

**Ownership and accountability are unclear.** Staff (STK-002, STK-003) cannot
reliably establish who is responsible for a request. Changes to status and actions
taken are not attributable to an acting person, so the coordinator (STK-004) cannot
resolve competing claims of ownership or identify unassigned work.

**Management has no reliable operational picture.** The operations manager (STK-005)
cannot answer basic questions — what is open, what is overdue, what has been
resolved — without manual collation. Reporting is inconsistent and cannot be
audited.

A fifth concern cuts across all of these: sensitive request information, including
security concerns and personal information of students and staff, is currently
handled inconsistently across informal channels with no access control and no audit
trail.

## 2.2 Business need

The campus needs a controlled digital platform that provides a reliable, traceable
and usable way to submit, manage, monitor and report on service requests.

The need is not primarily for new capability. Requests are already submitted,
assigned and resolved today. The need is for those activities to occur against **a
single authoritative record**, with attribution of who did what and when, and with
access appropriate to the sensitivity of the information involved.

The solution must achieve this without creating an unsustainable technical,
operational or financial burden. This is a constraint on the solution, not an
aspiration: it is recorded as CON-003 and CON-004 and it directly shapes what has
been committed to scope.

## 2.3 Intended stakeholder value

| Stakeholder | Value delivered | Traceable to |
|---|---|---|
| Requester (STK-001) | Confirmation that a request was received, and visibility of its status without contacting staff | SCP-003, SCP-004 |
| Technicians (STK-002, STK-003) | A clear view of work they are responsible for, with status updatable at the point of work | SCP-005, SCP-008 |
| Service desk coordinator (STK-004) | A single queue in which duplication and unassigned work are visible | SCP-006, SCP-007 |
| Operations manager (STK-005) | Reliable information on open, overdue, resolved and closed work by category | SCP-011 |
| Security officer (STK-006) | Sensitive reports handled with restricted visibility rather than in open channels | SCP-012, CFL-002 |
| System administrator (STK-007) | A defined role model with controlled assignment and revocation of access | SCP-012 |
| Executive sponsor (STK-008) | Service accountability without unsustainable operational cost | CON-003, DEC-003 |
| Information officer (STK-009) | Auditable, access-controlled handling of personal information | CON-007, SCP-012 |

## 2.4 How success will be judged

Project success is not "the system works". It is whether the problems in 2.1 are
demonstrably reduced. Three measures follow directly from the problem statement, and
Member B should express each as a measurable requirement:

1. **Single record** — a request exists once, in one place, with a complete lifecycle
   history attributable to acting users.
2. **Visibility** — a requester can determine the state of their request without
   contacting a member of staff.
3. **Reportable position** — management can obtain the open, overdue and resolved
   position without manual collation.

## 2.5 Relationship to scope

Two boundaries follow directly from this analysis and are recorded in the scope
baseline.

The platform **replaces** the fragmented channels rather than federating them
(SCP-017). Ingesting requests from email and WhatsApp would preserve the
duplication that section 2.1 identifies as the root cause, so integration with the
existing channels is out of scope by design rather than by omission.

Access control is **in scope despite not being a stated business capability**
(SCP-012). The sensitivity concern in 2.1 and the conflict resolution in CFL-002
make role-based access a precondition of the platform being usable for security
concerns at all.

---

