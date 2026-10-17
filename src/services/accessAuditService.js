/**
 * AccessAuditService - records an operation that was refused.
 *
 * Traces to: FR-1.3, AC-FR-1.3, AC-FR-5.3, TD-005, NFR-1.4, DEC-012, DEC-014,
 *            DEC-017 (minimisation rule M-1).
 *
 * Both refusal paths use this one function: the route guard (DEC-012 point 1,
 * through `app.locals.recordRefusal`) and the services that refuse after the
 * document is loaded (point 2). It is the service layer's face on the audit
 * repository, so neither the middleware nor a route reaches a repository.
 *
 * What is recorded: the acting user's id, their role(s), the operation, the
 * target request id where known, and the time. Nothing else about the person or
 * the request (M-1). The operation is carried in the event type, because the
 * auditLog schema has no operation field and this change does not alter it.
 *
 * Contract: `recordRefusal` never throws. A refusal that cannot be recorded is
 * still a refusal (403 or 422), so a failure is logged without personal data
 * and reported to the caller as `false`. The alternative, failing the response,
 * would turn a correct refusal into a 500 and tell an attacker nothing useful.
 */

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export function createAccessAuditService({ audit, log = console, clock = () => new Date() }) {
  /**
   * @param {{actor: {id: string, roles?: string[]}, operation: string, targetId?: string|null}} refusal
   * @returns {Promise<boolean>} whether the event was recorded
   */
  async function recordRefusal({ actor, operation, targetId = null }) {
    try {
      const known = typeof targetId === 'string' && OBJECT_ID.test(targetId);
      await audit.recordSecurityEvent({
        origin:         'access',
        eventType:      `access.refused.${operation}`,
        outcome:        'refused',
        occurredAt:     clock(),
        actorSource:    'session',
        actorId:        actor.id,
        actorRole:      (actor.roles ?? []).join(','),     // FR-1.2 allows several; names hold no comma
        collectionName: known ? 'requests' : null,
        documentId:     known ? targetId : null,
      });
      return true;
    } catch (error) {
      log.error('[accessAudit] a refused attempt could not be recorded:', error?.message);
      return false;
    }
  }

  return { recordRefusal };
}
