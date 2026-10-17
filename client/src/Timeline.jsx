// The request timeline: dated entries from GET /requests/{id}/history, oldest
// first (DEC-015 §1, ascending requestVersion). Renders whatever fields are
// present. Traces to: FR-3.3, FR-6.7, FR-7.4.

import { StatusBadge, Empty, formatWhen } from './ui.jsx';

const TITLES = {
  created: 'Request created',
  status: 'Status changed',
  assignment: 'Assignment changed',
  comment: 'Comment',
  action: 'Action taken',
  detail: 'Detail added',
  resolution: 'Resolution recorded',
};

export default function Timeline({ entries }) {
  if (!entries.length) {
    return <Empty title="No history yet" mark="◷">Changes to this request will appear here with their date and reason.</Empty>;
  }
  return (
    <ol className="timeline" aria-label="History">
      {entries.map((e, i) => (
        <li className="timeline__item" data-kind={e.changeType} key={e.id ?? e._id ?? `${e.requestVersion}-${i}`}
          style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <div className="timeline__title">
            <span>{TITLES[e.changeType] ?? e.changeType}</span>
            {e.changeType === 'status' || (e.toStatus && e.changeType !== 'created') ? (
              <>
                {e.fromStatus ? <><StatusBadge status={e.fromStatus} /><span aria-hidden="true">→</span></> : null}
                <StatusBadge status={e.toStatus} />
              </>
            ) : null}
            {e.changeType === 'created' && e.toStatus ? <StatusBadge status={e.toStatus} /> : null}
          </div>
          <div className="timeline__when">
            <time dateTime={e.occurredAt}>{formatWhen(e.occurredAt)}</time>
            {e.actorName || e.actorRole ? <span> · {e.actorName ?? e.actorRole}</span> : null}
          </div>
          {e.toAssigneeName || e.toAssigneeId ? (
            <div className="small muted">To: {e.toAssigneeName ?? e.toAssigneeId}</div>
          ) : null}
          {e.body ? (
            <p className="timeline__body">
              {e.changeType === 'status' ? <span className="muted">Reason: </span> : null}
              {e.body}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
