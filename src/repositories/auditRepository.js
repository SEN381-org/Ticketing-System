/**
 * Application-written accountability events. Traces to: NFR-1.4, AC-NFR-1.4,
 * FR-1.3 (AC-FR-1.3, not yet wired), DEC-017, DEC-018 §6.
 *
 * Insert-only. The Atlas role grants the application find and insert on
 * `auditLog` (DB-01 §4), and this interface offers nothing else.
 *
 * Minimisation rule M-1 (DEC-017): identifiers and fixed values only. The
 * submitted email of a failed login is never recorded. The account a failed
 * login targeted, where one exists, is recorded as the *object*
 * (`collectionName: 'users'`, `documentId`), not as the actor, because the
 * actor of a failed login is unauthenticated.
 */

import { randomUUID } from 'node:crypto';
import AuditLog from '../models/AuditLog.js';

export const auditRepository = {
  /**
   * @param {{origin: 'auth'|'access', eventType: string, outcome: string, occurredAt: Date,
   *          actorId?: any, actorRole?: string, actorSource: 'session'|'unattributed',
   *          campusId?: any, collectionName?: string, documentId?: any}} event
   */
  recordSecurityEvent: async (event) => {
    await AuditLog.create([{
      eventId:        randomUUID(),
      origin:         event.origin,
      eventType:      event.eventType,
      campusId:       event.campusId ?? null,
      collectionName: event.collectionName ?? null,
      documentId:     event.documentId ?? null,
      actorId:        event.actorId ?? null,
      actorRole:      event.actorRole ?? null,
      actorSource:    event.actorSource,
      outcome:        event.outcome,
      occurredAt:     event.occurredAt,
      recordedAt:     new Date(),
    }]);
  },
};
