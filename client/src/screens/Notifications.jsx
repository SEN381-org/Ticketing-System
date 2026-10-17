// Notifications indicator and list. Traces to: FR-3.4 (a requester is told of a
// status change), FR-3.5 (displayStatus is already the mapped status; it is
// shown as received), DEC-015 §1 (GET /api/v1/me/notifications returns
// { notifications: [{ id, requestId, requestReference, kind, displayStatus,
// read, createdAt }] }, newest 50). There is no mark-as-read route.

import { useEffect, useState } from 'react';
import { getNotifications, itemsOf } from '../api.js';
import { useAuth } from '../auth.jsx';
import { homePath } from '../permissions.js';
import { Link } from '../router.jsx';
import { BackLink, Empty, Loading, PageHead, Problem, Ticket, formatWhen, useLoad } from '../ui.jsx';

/** The kinds the server records (Notification model), as a sentence. */
const KIND_TEXT = {
  accepted: 'Your request was accepted',
  rejected: 'Your request was rejected',
  updated: 'Your request was updated',
  completed: 'Your request was completed',
};

/** The header indicator. Failures are silent here: the list page shows them. */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let live = true;
    getNotifications()
      .then((r) => { if (live) setUnread(itemsOf(r.data).filter((n) => !n.read).length); })
      .catch(() => { if (live) setUnread(0); });
    return () => { live = false; };
  }, []);
  return (
    <Link className="bell" to="/notifications" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {unread ? <span className="bell__count" data-testid="unread">{unread}</span> : null}
    </Link>
  );
}

export default function Notifications() {
  const auth = useAuth();
  const { data, error, loading } = useLoad(getNotifications, []);
  const items = itemsOf(data?.data);
  return (
    <div className="view">
      <BackLink to={homePath(auth.user)} />
      <PageHead title="Notifications" />
      <Problem error={error} />
      {loading ? <Loading lines={3} label="Loading notifications" /> : !items.length ? (
        <Empty title="Nothing new" icon="bell">You will be told here when the status of one of your requests changes.</Empty>
      ) : (
        <ul className="tickets">
          {items.map((n) => (
            <Ticket
              key={n.id}
              to={`/requests/${encodeURIComponent(n.requestId)}`}
              title={KIND_TEXT[n.kind] ?? 'Your request has changed'}
              status={n.displayStatus}
              meta={[formatWhen(n.createdAt), n.read ? null : 'unread'].filter(Boolean).join(' · ')}
              reference={n.requestReference}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
