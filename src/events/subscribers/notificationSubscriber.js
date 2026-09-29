/**
 * In-application feedback to the requester when a request changes status.
 * Traces to: FR-3.4, SCP-004. Subscribes under DEC-011.
 */
export async function onStatusChanged(payload, { notifications }) {
  await notifications.create({
    userId:    payload.reporterId,
    requestId: payload.requestId,
    message:   `Your request moved from '${payload.fromStatus}' to '${payload.toStatus}'.`,
    createdAt: payload.occurredAt,
    read:      false,
  });
}
