// The staff request queue. Traces to: FR-4.1, FR-4.3 (text search, POST so the
// text stays out of URIs), FR-4.4 (status and category filters), FR-4.5 (sort),
// FR-4.6 (the unassigned set is requested as assigneeId=none), FR-5.1 and
// FR-5.2 (assign, accept). Filtering, sorting and the unassigned set are all
// requested from the server; the client narrows nothing. A 403 (an
// Administrator, or a user with no staff role) is shown as a no-access state.
//
// A list row carries no version, and assigning needs If-Match, so the row's
// action reads the request first and uses the ETag it returns.

import { useState } from 'react';
import { ROLE, STATUS, TERMINAL_STATUSES } from '../../../shared/domainValues.js';
import { assign, getRequest, getSummary, itemsOf, listRequests, listUsers, searchRequests } from '../api.js';
import { useAuth } from '../auth.jsx';
import { shows } from '../permissions.js';
import { Link } from '../router.jsx';
import { useToast } from '../toast.jsx';
import {
  Empty, Loading, NoAccess, PageHead, Problem, StatusBadge, asError, formatWhen, useActionKey, useCategories, useLoad, usePages,
} from '../ui.jsx';

const COLUMNS = ['Ref', 'Category', 'Location', 'Status', `${STATUS.ASSIGNED} to`, 'Submitted', 'Action'];

const SORTS = [
  { value: '-submittedAt', label: 'Newest first' },
  { value: 'submittedAt', label: 'Oldest first' },
];
const TILE_STATUSES = [STATUS.RECEIVED, STATUS.ASSIGNED, STATUS.IN_PROGRESS, STATUS.ON_HOLD];

/** Search takes the same filters as the list, and rejects empty strings. */
const stripEmpty = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== ''));

/**
 * Counts from the management summary, for roles that may read it (FR-8.1).
 * Absent if it cannot be read. `refresh` changes after every action, so the
 * counts are read again; the figures on screen stay until the new ones arrive.
 */
function Tiles({ refresh }) {
  const { data } = useLoad(() => getSummary(), [refresh]);
  const summary = data?.data;
  if (!summary) return null;
  return (
    <div className="stack-tight">
      <div className="tiles" role="group" aria-label="Summary">
        <div className="tile tile--dark"><span className="label">Total</span><span className="tile__n" data-testid="tile-total">{summary.total}</span></div>
        {TILE_STATUSES.map((s) => (
          <div className="tile" key={s}><span className="label">{s}</span><span className="tile__n">{summary.byStatus?.[s] ?? 0}</span></div>
        ))}
        <div className="tile"><span className="label">Overdue</span><span className="tile__n">{summary.overdue?.count ?? 0}</span></div>
      </div>
      <p className="notice-line">{"Counts include requests you can't open"}</p>
    </div>
  );
}

/** The action cell: assign or reassign (Coordinator, Manager), accept (Technician, Security Officer). */
function RowAction({ item, onDone }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [pool, setPool] = useState(null);
  const [choice, setChoice] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = useActionKey();
  const toast = useToast();
  const unassigned = !item.assigneeId;
  const view = <Link className="btn btn--quiet btn--small" to={`/requests/${encodeURIComponent(item.id)}`}>Open</Link>;

  const act = async (assigneeId) => {
    setError(null); setBusy(true);
    try {
      const current = await getRequest(item.id);          // the ETag to present
      await assign(item.id, current.etag, assigneeId, key.current());
      key.renew(); setOpen(false); toast(assigneeId === auth.user?.id ? 'Request accepted.' : 'Request assigned.'); await onDone();
    } catch (e) { setError(asError(e)); }
    setBusy(false);
  };

  const openPicker = async () => {
    setOpen(true); setError(null);
    if (pool) return;
    try {
      // Technicians and Security Officers are the people a request can be given to.
      const roles = [ROLE.TECHNICIAN, ROLE.SECURITY_OFFICER];
      const found = await Promise.all(roles.map((role) => listUsers({ role, categoryId: item.categoryId })));
      const merged = new Map();
      for (const r of found) for (const u of itemsOf(r.data)) merged.set(u.id, u);
      setPool([...merged.values()]);
    } catch (e) { setPool([]); setError(asError(e)); }
  };

  if (TERMINAL_STATUSES.includes(item.status)) return view;
  if (shows(auth.user, 'assign')) {
    return (
      <div>
        {open ? (
          <div className="assign-inline">
            <label className="sr-only" htmlFor={`pick-${item.id}`}>Assign {item.reference} to</label>
            <select className="select" id={`pick-${item.id}`} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{pool ? 'Choose a staff member' : 'Loading staff'}</option>
              {(pool ?? []).map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
            </select>
            <button className="btn btn--small" type="button" disabled={!choice || busy} onClick={() => act(choice)}>Confirm</button>
            <button className="btn btn--quiet btn--small" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        ) : (
          <button className="btn btn--small" type="button" onClick={openPicker}>{unassigned ? 'Assign' : 'Reassign'}</button>
        )}
        <Problem error={error} />
      </div>
    );
  }
  if (shows(auth.user, 'accept') && unassigned && auth.user?.id) {
    return (
      <div>
        <button className="btn btn--small" type="button" disabled={busy} onClick={() => act(auth.user.id)}>Accept</button>
        <Problem error={error} />
      </div>
    );
  }
  return view;
}

export default function StaffList() {
  const auth = useAuth();
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState(SORTS[0].value);
  const [unassigned, setUnassigned] = useState(false);
  const [text, setText] = useState('');
  const [applied, setApplied] = useState('');
  const [tick, setTick] = useState(0);        // changes after every action, so the tiles are read again
  const categories = useCategories();

  const filters = { status, categoryId, sort, assigneeId: unassigned ? 'none' : undefined };
  const pages = usePages((cursor) => (applied
    ? searchRequests({ text: applied, ...stripEmpty(filters), ...(cursor ? { cursor } : {}) })
    : listRequests({ ...filters, cursor })),
  [status, categoryId, sort, unassigned, applied]);

  if (pages.error?.status === 403) return <NoAccess what="the request queue" />;

  const refreshAll = async () => { setTick((t) => t + 1); await pages.reload(); };
  const youId = auth.user?.id;
  const assigneeText = (i) => {
    if (!i.assigneeId) return 'Unassigned';
    if (i.assigneeName) return i.assigneeName;
    return i.assigneeId === youId ? 'You' : 'Staff member';
  };
  const filtered = Boolean(applied || status || categoryId || unassigned);

  return (
    <div className="view">
      <PageHead title="Request queue">
        {shows(auth.user, 'submit') ? <Link className="btn btn--head" to="/requests/new">New request</Link> : null}
      </PageHead>
      <form role="search" className="row" onSubmit={(e) => { e.preventDefault(); setApplied(text.trim()); }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="sr-only" htmlFor="q">Search requests</label>
          <input className="input" id="q" type="search" value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Search requests" />
        </div>
        <button className="btn" type="submit" style={{ flex: '0 0 auto' }}>Search</button>
        {applied ? (
          <button className="btn btn--quiet" style={{ flex: '0 0 auto' }} type="button" onClick={() => { setText(''); setApplied(''); }}>Clear search</button>
        ) : null}
      </form>

      {shows(auth.user, 'report') ? <Tiles refresh={tick} /> : null}

      <div className="chips chips--wrap" role="group" aria-label="Filters">
        <button type="button" className="chip" aria-pressed={unassigned} onClick={() => setUnassigned((v) => !v)}>Unassigned</button>
        <label className="sr-only" htmlFor="f-status">Filter by status</label>
        <select className="select select--chip" id="f-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.values(STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-category">Filter by category</label>
        <select className="select select--chip" id="f-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {categories.list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="f-sort">Sort</label>
        <select className="select select--chip" id="f-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <Problem error={pages.error} />
      {pages.loading && !pages.items.length ? <Loading lines={4} label="Loading requests" /> : !pages.items.length && !pages.error ? (
        <Empty title={filtered ? 'Nothing matches' : 'No requests'} icon="ticket">
          {filtered ? 'Try removing a filter or changing the search.' : 'Requests in your categories will be listed here.'}
        </Empty>
      ) : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Requests">
          {/* Explicit roles: on phones the rows are laid out as cards (NFR-1.2), and a
              table whose display is changed by CSS can lose its table semantics. */}
          <table className="table table--cards" role="table">
            <thead role="rowgroup">
              <tr role="row">
                {COLUMNS.map((c) => <th key={c} scope="col" role="columnheader">{c}</th>)}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {pages.items.map((i) => (
                <tr key={i.id} role="row">
                  <td role="cell" data-label={COLUMNS[0]}><Link className="mono" to={`/requests/${encodeURIComponent(i.id)}`}>{i.reference}</Link></td>
                  <td role="cell" data-label={COLUMNS[1]} className="table__title">{categories.nameOf(i.categoryId) ? <span className="cap">{categories.nameOf(i.categoryId)}</span> : null}</td>
                  <td role="cell" data-label={COLUMNS[2]}>{i.location}</td>
                  <td role="cell" data-label={COLUMNS[3]}><StatusBadge status={i.status} /></td>
                  <td role="cell" data-label={COLUMNS[4]} className={i.assigneeId ? undefined : 'muted'}>{assigneeText(i)}</td>
                  <td role="cell" data-label={COLUMNS[5]} className="mono muted">{formatWhen(i.submittedAt)}</td>
                  <td role="cell" data-label={COLUMNS[6]} className="table__action"><RowAction item={i} onDone={refreshAll} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages.cursor ? <button className="btn btn--quiet" type="button" onClick={pages.loadMore} disabled={pages.loading}>Load more</button> : null}
    </div>
  );
}
