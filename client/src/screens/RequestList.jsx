// The requester's own list as tickets. Traces to: FR-3.1 (a requester sees
// status), FR-3.5 (the status is the mapped one the server returns; nothing is
// computed here), FR-3.6 (own requests only; the server filters), FR-4.4
// (filter by status, requested from the server). A 403 (no Requester role) is
// shown as a no-access state.

import { useState } from 'react';
import { STATUS } from '../../../shared/domainValues.js';
import { listRequests } from '../api.js';
import { Link } from '../router.jsx';
import { Chips, Empty, Loading, NoAccess, PageHead, Problem, Ticket, formatDay, useCategories, usePages } from '../ui.jsx';

const ALL = '';
const FILTERS = [{ value: ALL, label: 'All' }, ...Object.values(STATUS).map((s) => ({ value: s, label: s }))];

/** A request from a list response as a ticket. */
export function RequestTicket({ item, categoryName }) {
  const when = formatDay(item.submittedAt);
  return (
    <Ticket
      to={`/requests/${encodeURIComponent(item.id)}`}
      title={categoryName ?? 'Request'}
      status={item.status}
      meta={[item.location, when].filter(Boolean).join(' · ')}
      reference={item.reference}
    />
  );
}

export default function MyRequests() {
  const [status, setStatus] = useState(ALL);
  const categories = useCategories();
  const pages = usePages((cursor) => listRequests({ status, sort: '-submittedAt', cursor }), [status]);

  if (pages.error?.status === 403) return <NoAccess what="a list of your requests" />;

  return (
    <div className="view view--fab">
      <PageHead title="My requests">
        {!pages.loading || pages.items.length ? <span className="muted small">{pages.items.length}{pages.cursor ? '+' : ''} shown</span> : null}
      </PageHead>
      <Chips label="Filter by status" options={FILTERS} value={status} onChange={setStatus} />
      <Problem error={pages.error} />
      {pages.loading && !pages.items.length ? <Loading lines={3} label="Loading your requests" /> : !pages.items.length && !pages.error ? (
        <Empty title={status === ALL ? 'No requests yet' : 'Nothing with this status'} mark="☐">
          {status === ALL ? 'Requests you submit will be listed here with their current status.' : 'Try another filter.'}
        </Empty>
      ) : (
        <ul className="tickets">
          {pages.items.map((i) => <RequestTicket key={i.id} item={i} categoryName={categories.nameOf(i.categoryId)} />)}
        </ul>
      )}
      {pages.cursor ? <button className="btn btn--quiet" type="button" onClick={pages.loadMore} disabled={pages.loading}>Load more</button> : null}
      <Link className="fab" to="/requests/new">
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        New request
      </Link>
    </div>
  );
}
