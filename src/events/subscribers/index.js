/**
 * The single subscription registration point. DEC-011.
 *
 * Adding a consequence of a status transition means adding a line to this file
 * and a subscriber module beside it. It does not mean editing
 * StatusTransitionService, which is the extensibility property DEC-011 was
 * chosen for. SCP-014 (notification delivery) attaches here when it is
 * admitted to scope; it is deferred, not excluded.
 */

import { EVENTS, subscribe } from '../requestEvents.js';
import { onStatusChanged as notify } from './notificationSubscriber.js';
import { onStatusChanged as project } from './reportingProjectionSubscriber.js';

export function registerSubscribers({ notifications, reportingCounts }) {
  subscribe(
    EVENTS.REQUEST_STATUS_CHANGED,
    'NotificationSubscriber',
    'FR-3.4 / SCP-004',
    (payload) => notify(payload, { notifications }),
  );

  subscribe(
    EVENTS.REQUEST_STATUS_CHANGED,
    'ReportingProjectionSubscriber',
    'Feature group 8',
    (payload) => project(payload, { reportingCounts }),
  );

  // SCP-014 — NotificationDeliverySubscriber attaches here when admitted.
}
