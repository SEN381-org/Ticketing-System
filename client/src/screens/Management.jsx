// Management view. Traces to: FR-8.1 (counts by status), FR-8.2 (by category),
// FR-8.3 (date range), FR-8.5 (category filter), FR-8.6 (counts only: no
// description, comment or action is ever shown here).

import { useState } from 'react';
import { STATUS } from '../../../shared/domainValues.js';
import { getSummary, itemsOf, listCategories } from '../api.js';
import { Empty, Field, Loading, PageHead, Problem, StatusBadge, useLoad } from '../ui.jsx';

/** { key: n } or [{ key|status|category|name, count }] become [[key, n]]. */
function pairs(value) {
  if (Array.isArray(value)) {
    return value.map((v) => [v.status ?? v.category ?? v.categoryName ?? v.name ?? v.categoryId ?? v.key, v.count ?? v.n ?? 0]);
  }
  return Object.entries(value ?? {}).map(([k, v]) => [k, typeof v === 'object' && v ? (v.count ?? 0) : v]);
}

function Bars({ rows, total, renderKey }) {
  return (
    <ul className="list">
      {rows.map(([k, n]) => (
        <li className="list__item" key={k} style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <div className="list__top"><span>{renderKey(k)}</span><strong>{n}</strong></div>
          <div className="bar" aria-hidden="true"><div className="bar__fill" style={{ width: `${total ? Math.round((n / total) * 100) : 0}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

export default function Management() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const categories = useLoad(listCategories, []);
  const { data, error, loading } = useLoad(() => getSummary({ from, to, categoryId }), [from, to, categoryId]);
  const summary = data?.data;
  const cats = itemsOf(categories.data?.data);
  const nameOfCategory = (k) => cats.find((c) => c.id === k)?.name ?? k;

  const byStatus = pairs(summary?.byStatus);
  const statusRows = Object.values(STATUS).map((s) => [s, byStatus.find(([k]) => k === s)?.[1] ?? 0]);
  const total = summary?.total ?? 0;

  return (
    <div className="view">
      <PageHead title="Management view" />
      <form className="card" onSubmit={(e) => e.preventDefault()}>
        <div className="row">
          <Field id="from" label="From"><input className="input" id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field id="to" label="To"><input className="input" id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field id="m-category" label="Category">
            <select className="select" id="m-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
      </form>
      <Problem error={error} />
      {loading ? <Loading lines={4} label="Loading counts" /> : !summary ? null : (
        <>
          <div className="stats">
            <div className="stat"><div className="muted small">Total</div><div className="stat__n" data-testid="total">{total}</div></div>
            <div className="stat"><div className="muted small">Overdue</div><div className="stat__n" data-testid="overdue">{summary.overdue ?? 0}</div></div>
          </div>
          {total === 0 ? <Empty title="No requests in this range" mark="0">Widen the dates or clear the category filter.</Empty> : (
            <>
              <section className="card"><h2>By status</h2>
                <Bars rows={statusRows} total={total} renderKey={(k) => <StatusBadge status={k} />} />
              </section>
              <section className="card"><h2>By category</h2>
                <Bars rows={pairs(summary.byCategory)} total={total} renderKey={nameOfCategory} />
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
