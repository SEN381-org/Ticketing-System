// Management view. Traces to: FR-8.1 (counts by status), FR-8.2 (by category,
// deactivated ones included, FR-9.2), FR-8.3 (overdue), FR-8.5 (date range and
// category filter), FR-8.6 (counts and references only: no description, comment
// or action is ever shown here). GET /reports/summary returns
// { byStatus: { <status>: n }, byCategory: [{ categoryId, code, name, active, count }],
// overdue: { count, requests: [{ id, reference, categoryId, status, openHours }] }, total }.
// A 403 is shown as a no-access state.

import { useState } from 'react';
import { STATUS } from '../../../shared/domainValues.js';
import { getSummary } from '../api.js';
import { useAuth } from '../auth.jsx';
import { homePath } from '../permissions.js';
import {
  BackLink, Empty, Field, Loading, NoAccess, PageHead, Problem, StatusBadge, Ticket, byName, useCategories, useLoad,
} from '../ui.jsx';

function Meters({ rows, total }) {
  return (
    <div className="meters">
      {rows.map(([key, label, n]) => (
        <div className="meter" key={key}>
          <div className="meter__top"><span>{label}</span><span className="meter__n">{n}</span></div>
          <div className="bar-track" aria-hidden="true"><div className="bar-track__fill" style={{ width: `${total ? Math.round((n / total) * 100) : 0}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default function Management() {
  const auth = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const categories = useCategories();
  const { data, error, loading } = useLoad(() => getSummary({ from, to, categoryId }), [from, to, categoryId]);

  if (error?.status === 403) return <NoAccess what="the management view" />;

  const summary = data?.data;
  const total = summary?.total ?? 0;
  const statusRows = Object.values(STATUS).map((s) => [s, <StatusBadge status={s} />, summary?.byStatus?.[s] ?? 0]);
  const categoryRows = byName(summary?.byCategory ?? []).map((c) => [
    c.categoryId,
    <span className="cap">{c.name ?? c.code ?? 'Unnamed category'}{c.active === false ? ' (deactivated)' : ''}</span>,
    c.count,
  ]);
  const late = summary?.overdue?.requests ?? [];

  return (
    <div className="view">
      <BackLink to={homePath(auth.user)} />
      <PageHead title="Management view" />
      <form className="panel" onSubmit={(e) => e.preventDefault()}>
        <div className="row">
          <Field id="from" label="From"><input className="input" id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field id="to" label="To"><input className="input" id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field id="m-category" label="Category">
            <select className="select" id="m-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {categories.list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
      </form>
      <Problem error={error} />
      {loading ? <Loading lines={4} label="Loading counts" /> : !summary ? null : (
        <>
          <div className="tiles">
            <div className="tile tile--dark"><span className="label">Total</span><span className="tile__n" data-testid="total">{total}</span></div>
            <div className="tile"><span className="label">Overdue</span><span className="tile__n" data-testid="overdue">{summary.overdue?.count ?? 0}</span></div>
          </div>
          {total === 0 ? <Empty title="No requests in this range" mark="0">Widen the dates or clear the category filter.</Empty> : (
            <div className="split">
              <section className="panel"><h2 className="label">By status</h2><Meters rows={statusRows} total={total} /></section>
              <section className="panel"><h2 className="label">By category</h2><Meters rows={categoryRows} total={total} /></section>
            </div>
          )}
          {late.length ? (
            <section aria-label="Overdue requests">
              <h2 className="label">Overdue</h2>
              <ul className="tickets">
                {late.map((r) => (
                  <Ticket key={r.id} to={`/requests/${encodeURIComponent(r.id)}`} reference={r.reference} status={r.status}
                    title={categories.nameOf(r.categoryId) ?? 'Request'} meta={`Open for ${r.openHours} hours`} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
