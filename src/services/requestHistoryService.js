/**
 * RequestHistoryService — read side for a request's history.
 *
 * Traces to: FR-3.3, FR-6.6, FR-7.3, FR-7.4, FR-7.5, FR-5.4, NFR-3.6, FR-1.5, FR-3.5,
 *            AC-NFR-4.4, DB-01, DEC-012 (points 2 and 3), DEC-014, DEC-015 §1.
 *
 * Entries are ordered by requestVersion ascending, which is the order the unique
 * {requestId, requestVersion} index guarantees (review comment R-12).
 *
 * What each viewer receives. DB-01 and DEC-012 do not say who sees comment and
 * action entries, so the safer reading is taken (recorded as a question in the
 * handover notes):
 *   staff who may view the request    every entry, with actor and assignment detail
 *   a Requester on their own request  created, status and detail entries only; no
 *                                     comment, action, assignment or resolution
 *                                     entry; the staff actor's identifier is withheld
 *   a Requester on a security-category request, in addition (FR-1.5 read literally):
 *                                     no body or reason at all, statuses mapped through
 *                                     visibleStatusFor (FR-3.5), and entries that change
 *                                     nothing the requester may see are dropped
 *
 * The view check is the same one the single-request read makes (mayViewRequest),
 * so staff without the Security Officer role are refused a security request here
 * exactly as they are there (OI-17 unchanged).
 */

import { visibleStatusFor } from '../domain/accessRules.js';
import { assertObjectId } from '../domain/objectId.js';
import { NotFoundError } from '../errors.js';
import { STATUS } from '../models/_shared.js';
import { assertMayView, isStaffActor } from './viewAccess.js';

const REQUESTER_TYPES = Object.freeze(['created', 'status', 'detail']);

const sameInstant = (a, b) => Boolean(a && b) && new Date(a).getTime() === new Date(b).getTime();

export function createRequestHistoryService({ requests, history }) {
  async function listHistory(requestId, actor) {
    assertObjectId(requestId);
    const request = await requests.findById(requestId);
    if (!request) throw new NotFoundError(requestId);
    assertMayView(request, actor, requestId);

    // FR-7.4: ascending requestVersion. The repository sorts too; the guarantee is held here.
    const entries = [...await history.listForRequest(requestId)]
      .sort((a, b) => a.requestVersion - b.requestVersion);
    const security = Boolean(request.securityCategory);

    const shown = isStaffActor(actor)
      ? entries.map((e) => staffView(e, request))
      : entries.filter((e) => REQUESTER_TYPES.includes(e.changeType))
        .map((e) => requesterView(e, actor, security))
        .filter((e) => !(security && e.changeType === 'status' && e.fromStatus === e.toStatus));
    return { requestId, entries: shown };
  }

  return { listHistory };
}

function common(entry) {
  return {
    id:             String(entry._id),
    requestVersion: entry.requestVersion,
    changeType:     entry.changeType,
    occurredAt:     entry.occurredAt,
    actorRole:      entry.actorRole,
  };
}

/** Staff who may view the request see the whole entry. FR-4.2, FR-7.3, NFR-3.6. */
function staffView(entry, request) {
  const view = { ...common(entry), actorId: entry.actorId ? String(entry.actorId) : null };
  if (entry.changeType === 'created' || entry.changeType === 'status') {
    view.fromStatus = entry.fromStatus;
    view.toStatus = entry.toStatus;
  }
  if (entry.changeType === 'status') {
    view.reason = entry.body ?? null;                       // FR-6.6 "displays it in the history"
    // FR-6.5 / FR-7.5: the resolution recorded by this very transition. The request holds
    // one resolution, so it is attached only to the entry written at the same instant.
    if (entry.toStatus === STATUS.RESOLVED && sameInstant(request.resolution?.recordedAt, entry.occurredAt)) {
      view.resolution = request.resolution.summary ?? null;
    }
  }
  if (entry.changeType === 'assignment') {                  // FR-5.4
    view.fromAssigneeId = entry.fromAssigneeId ? String(entry.fromAssigneeId) : null;
    view.toAssigneeId = entry.toAssigneeId ? String(entry.toAssigneeId) : null;
  }
  if (['comment', 'action', 'detail', 'resolution'].includes(entry.changeType)) {
    view.body = entry.body ?? null;                         // FR-7.1, FR-7.2, FR-2.4
  }
  return view;
}

/** DEC-012 enforcement point 3, for the entries a Requester may see at all. */
function requesterView(entry, actor, security) {
  const view = common(entry);
  // Staff identifiers are not the requester's to know; their own entries keep theirs.
  view.actorId = entry.actorId && String(entry.actorId) === String(actor.id) ? String(entry.actorId) : null;
  if (entry.changeType === 'created' || entry.changeType === 'status') {
    view.fromStatus = entry.fromStatus === null ? null : visibleStatusFor(entry.fromStatus, security, actor);
    view.toStatus = entry.toStatus === null ? null : visibleStatusFor(entry.toStatus, security, actor);
  }
  if (!security) {
    if (entry.changeType === 'status') view.reason = entry.body ?? null;
    if (entry.changeType === 'detail') view.body = entry.body ?? null;
  }
  return view;
}
