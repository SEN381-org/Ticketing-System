// The request row used by both lists, and the "My requests" screen.
// Traces to: FR-3.1 (a requester sees status), FR-3.6 (own requests only; the
// server filters, the client does not).

import { itemsOf, listRequests } from '../api.js';
import { Link } from '../router.jsx';
import { Empty, Loading, PageHead, Problem, StatusBadge, formatWhen, useLoad } from '../ui.jsx';

const nameOf = (v) => (v && typeof v === 'object' ? (v.displayName ?? v.name ?? v.id) : v);

export function RequestRow({ item }) {
  const category = nameOf(item.category ?? item.categoryName);
  const assignee = nameOf(item.assignee ?? item.assigneeName);
  const when = item.submittedAt ?? item.createdAt;
  return (
    <li className="list__item">
      <Link className="list__link" to={`/requests/${encodeURIComponent(item.id)}`}>
        <div className="list__top">
          <span className="list__ref">{item.reference}</span>
          <StatusBadge status={item.status} />
        </div>
        <div className="small muted">
          {[category, item.location, when ? formatWhen(when) : null].filter(Boolean).join(' · ')}
        </div>
        {assignee ? <div className="small muted">Assignee: {assignee}</div> : null}
      </Link>
    </li>
  );
}

export function RequestItems({ items, emptyTitle, emptyText, action }) {
  if (!items.length) return <Empty title={emptyTitle} mark="☐" action={action}>{emptyText}</Empty>;
  return <ul className="list">{items.map((i) => <RequestRow item={i} key={i.id ?? i.reference} />)}</ul>;
}

export default function MyRequests() {
  const { data, error, loading } = useLoad(() => listRequests({ sort: '-submittedAt' }), []);
  return (
    <div className="view">
      <PageHead title="My requests">
        <Link className="btn" to="/requests/new">New request</Link>
      </PageHead>
      <Problem error={error} />
      {loading ? <Loading lines={3} label="Loading your requests" /> : (
        <RequestItems
          items={itemsOf(data?.data)}
          emptyTitle="No requests yet"
          emptyText="Requests you submit will be listed here with their current status."
          action={<Link className="btn" to="/requests/new">Submit your first request</Link>} />
      )}
    </div>
  );
}
