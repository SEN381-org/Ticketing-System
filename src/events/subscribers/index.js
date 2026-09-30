/**
 * The single subscription registration point. DEC-011.
 *
 * Adding a consequence of a status transition means adding a line here and a
 * subscriber module beside it. It does not mean editing StatusTransitionService,
 * which is the extensibility property DEC-011 was chosen for. SCP-014
 * (notification delivery) attaches here when it is admitted to scope; it is
 * deferred, not excluded.
 *
 * Review comment R-19: registration is idempotent. Calling this twice — from the
 * app factory and again from a test or a hot reload — previously registered
 * every subscriber twice, so every requester received duplicate notifications
 * and the counts double-counted.
 */

import { EVENTS, subscribe, listSubscriptions } from '../requestEvents.js';
import { onStatusChanged as notify } from './notificationSubscriber.js';
import { onStatusChanged as project } from './reportingProjectionSubscriber.js';

export function registerSubscribers({ notifications, reportingCounts }) {
  if (listSubscriptions().length > 0) return listSubscriptions();

  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'NotificationSubscriber', 'FR-3.4 / FR-3.5 / SCP-004',
    (payload) => notify(payload, { notifications }));

  subscribe(EVENTS.REQUEST_STATUS_CHANGED, 'ReportingProjectionSubscriber', 'FR-8.1 / FR-8.2',
    (payload) => project(payload, { reportingCounts }));

  // SCP-014 — NotificationDeliverySubscriber attaches here when admitted.

  return listSubscriptions();
}
