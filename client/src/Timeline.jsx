// The request timeline: dated entries from GET /requests/{id}/history, oldest
// first (the server orders by requestVersion ascending, FR-7.4). Renders only
// the fields an entry carries: a requester's entries have no staff identifiers
// or bodies, and none are invented. Traces to: FR-3.3, FR-5.4, FR-6.6, FR-6.7,
// FR-7.3, FR-7.4.

import { TONE, Empty, formatWhen } from './ui.jsx';

const TITLES = {
  created: 'Request submitted',
  assignment: 'Assignment',
  comment: 'Comment',
  action: 'Action taken',
  detail: 'Detail added',
  resolution: 'Resolution recorded',
};

/** The title of an entry: a status change is titled by the status it reached. */
function titleOf(e) {
  if (e.changeType === 'status' && e.toStatus) return e.toStatus;
  return TITLES[e.changeType] ?? 'Update';
}

export default function Timeline({ entries, nameFor = () => null }) {
  if (!entries.length) {
    return <Empty title="No history yet" mark="◷">Changes to this request will appear here with their date and reason.</Empty>;
  }
  return (
    <ol className="timeline" aria-label="Changes">
      {entries.map((e, i) => {
        const who = nameFor(e.actorId);
        const to = e.toAssigneeId ? nameFor(e.toAssigneeId) : null;
        return (
          <li className="timeline__item" key={e.id ?? `${e.requestVersion}-${i}`} data-kind={e.changeType}
            data-tone={TONE[e.toStatus] ?? 'other'} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <div className="timeline__rail"><span className="timeline__dot" /><span className="timeline__line" /></div>
            <div className="timeline__body-wrap">
              <div className="timeline__title">{titleOf(e)}</div>
              <div className="timeline__when">
                {[who, e.actorRole].filter(Boolean).join(', ')}{who || e.actorRole ? ' · ' : ''}
                <time dateTime={e.occurredAt}>{formatWhen(e.occurredAt)}</time>
              </div>
              {e.changeType === 'assignment' && to ? <div className="timeline__when">To: {to}</div> : null}
              {e.reason ? <p className="timeline__text"><span className="muted">Reason: </span>{e.reason}</p> : null}
              {e.resolution ? <p className="timeline__text"><span className="muted">Resolution: </span>{e.resolution}</p> : null}
              {e.body ? <p className="timeline__text">{e.body}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
