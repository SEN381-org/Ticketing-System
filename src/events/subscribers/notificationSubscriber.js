/**
 * In-application feedback to the requester when a request changes status.
 *
 * Traces to: FR-3.4, FR-3.5, FR-1.5, CFL-002, SCP-004. Subscribes under DEC-011.
 *
 * Review comment R-18. The message previously embedded the internal status
 * verbatim, so an "On Hold" or "Resolved" notification on a security-category
 * request disclosed exactly what FR-3.5 restricts. The status is now mapped
 * through the single rule set before it is stored, and the stored field is
 * `displayStatus` — the value as the requester may see it — so the restriction
 * cannot be lost by a later change to the view layer.
 *
 * DEC-011 contains subscriber failures, which makes delivery at-least-once. The
 * unique {sourceHistoryId, userId} index in the data baseline is what makes a
 * redelivered event produce one notification rather than two.
 */

import { visibleStatusFor } from '../../domain/accessRules.js';
import { STATUS } from '../../models/_shared.js';
import { ROLE } from '../../models/_shared.js';

const KIND_BY_STATUS = Object.freeze({
  [STATUS.RECEIVED]:    'accepted',
  [STATUS.ASSIGNED]:    'accepted',
  [STATUS.IN_PROGRESS]: 'updated',
  [STATUS.ON_HOLD]:     'updated',
  [STATUS.RESOLVED]:    'completed',
  [STATUS.CLOSED]:      'completed',
  [STATUS.REJECTED]:    'rejected',
});

export async function onStatusChanged(payload, { notifications }) {
  // The recipient is the requester, so the rule set is asked the requester's question.
  const recipient = { id: payload.reporterId, roles: [ROLE.REQUESTER] };

  const displayStatus = visibleStatusFor(payload.toStatus, payload.securityCategory, recipient);

  await notifications.create({
    campusId:         payload.campusId,
    userId:           payload.reporterId,
    requestId:        payload.requestId,
    requestReference: payload.reference,          // FR-3.4 "identifying the request"
    kind:             KIND_BY_STATUS[payload.toStatus] ?? 'updated',
    displayStatus,                                 // FR-3.5 — never the internal value
    sourceHistoryId:  payload.historyId,           // idempotency key for redelivery
    read:             false,
    createdAt:        payload.occurredAt,
  });
}
