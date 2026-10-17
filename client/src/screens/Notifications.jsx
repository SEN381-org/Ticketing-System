// Notifications indicator and list. Traces to: FR-3.4 (a requester is told of a
// status change), DEC-015 §1 (GET /api/v1/me/notifications). A notification
// carries requestReference, kind, displayStatus and read (data baseline §3.8).

import { useEffect, useState } from 'react';
import { getNotifications, itemsOf } from '../api.js';
import { Link } from '../router.jsx';
import { Empty, Loading, PageHead, Problem, StatusBadge, formatWhen, useLoad } from '../ui.jsx';

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
      <span aria-hidden="true">✉</span>
      {unread ? <span className="bell__count" data-testid="unread">{unread}</span> : null}
    </Link>
  );
}

export default function Notifications() {
  const { data, error, loading } = useLoad(getNotifications, []);
  const items = itemsOf(data?.data);
  return (
    <div className="view">
      <PageHead title="Notifications" />
      <Problem error={error} />
      {loading ? <Loading lines={3} label="Loading notifications" /> : !items.length ? (
        <Empty title="Nothing new" mark="✉">You will be told here when the status of one of your requests changes.</Empty>
      ) : (
        <ul className="list">
          {items.map((n, i) => (
            <li className="list__item" key={n.id ?? i}>
              <div className="list__link">
                <div className="list__top">
                  <span className="list__ref">{n.requestReference}</span>
                  {n.displayStatus ? <StatusBadge status={n.displayStatus} /> : null}
                </div>
                <div className="small muted">
                  {[n.kind, n.createdAt ? formatWhen(n.createdAt) : null, n.read ? null : 'unread'].filter(Boolean).join(' · ')}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
