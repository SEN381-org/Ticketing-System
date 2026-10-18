/**
 * Persistence access for in-application notifications.
 *
 * Traces to: FR-3.4, FR-3.5, DEC-011, DEC-017 (purpose A), DB-01 §3.4.
 *
 * `create` is idempotent on {sourceHistoryId, userId}: DEC-011 makes delivery
 * at-least-once, and the unique index turns a redelivered event into a duplicate
 * key, which is swallowed here so it produces one notification, not two.
 * Notifications are a derived copy; there is no update path.
 */

import Notification from '../models/Notification.js';

const DUPLICATE_KEY = 11000;

export const notificationRepository = {
  create: async (notification) => {
    try {
      await Notification.create(notification);
    } catch (error) {
      if (error?.code !== DUPLICATE_KEY) throw error;
    }
  },

  /** FR-3.4 — the recipient's notifications, newest first. */
  listForUser: (userId, { limit = 50 } = {}) =>
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean(),
};
