/**
 * NotificationService — read side for the actor's own in-application notifications.
 *
 * Traces to: FR-3.4, FR-3.5, FR-1.5, DEC-011, DEC-012 (point 3), DEC-015 §1.
 *
 * The recipient is always the authenticated actor; no identifier is accepted from
 * the client. The projection is an explicit whitelist: a notification carries the
 * request reference, the kind of change and `displayStatus`. NotificationSubscriber
 * stores `displayStatus` already passed through visibleStatusFor (FR-3.5, review
 * comment R-18); no description, comment, action or reason is ever copied into a
 * notification, so none can be returned (FR-1.5).
 */

export function createNotificationService({ notifications }) {
  async function listForActor(actor) {
    const rows = await notifications.listForUser(actor.id);
    return {
      notifications: rows.map((n) => ({
        id:               String(n._id),
        requestId:        String(n.requestId),
        requestReference: n.requestReference,
        kind:             n.kind,
        displayStatus:    n.displayStatus,
        read:             Boolean(n.read),
        createdAt:        n.createdAt,
      })),
    };
  }

  return { listForActor };
}
