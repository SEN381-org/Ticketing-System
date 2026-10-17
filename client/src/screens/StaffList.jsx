// Staff request list. Traces to: FR-4.1, FR-4.3 (text search, POST so the text
// stays out of URIs), FR-4.4 (status and category filters), FR-4.5 (sort),
// FR-5.x (unassigned view). Filtering and sorting are requested from the
// server; the one exception is the unassigned view, which narrows the page the
// server returned (see the notes: the contract has no unassigned parameter).

import { useState } from 'react';
import { STATUS } from '../../../shared/domainValues.js';
import { itemsOf, listCategories, listRequests, searchRequests } from '../api.js';
import { Field, Loading, PageHead, Problem, useLoad } from '../ui.jsx';
import { RequestItems } from './RequestList.jsx';

const isUnassigned = (i) => !(i.assignee ?? i.assigneeName ?? i.assigneeId);

export default function StaffList() {
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [text, setText] = useState('');
  const [applied, setApplied] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);
  const [unassigned, setUnassigned] = useState(false);
  const categories = useLoad(listCategories, []);

  const { data, error, loading } = useLoad(() => (applied
    ? searchRequests({ text: applied, status: status || undefined, categoryId: categoryId || undefined })
    : listRequests({ status, categoryId, sort: newestFirst ? '-submittedAt' : 'submittedAt' })),
  [status, categoryId, applied, newestFirst]);

  let items = itemsOf(data?.data);
  if (applied && !newestFirst) items = [...items].reverse();
  if (unassigned) items = items.filter(isUnassigned);

  return (
    <div className="view">
      <PageHead title="Requests" />
      <form className="card" role="search" onSubmit={(e) => { e.preventDefault(); setApplied(text.trim()); }}>
        <div className="row">
          <Field id="q" label="Search">
            <input className="input" id="q" type="search" value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Reference, location or description" />
          </Field>
          <button className="btn" type="submit">Search</button>
          {applied ? <button className="btn btn--quiet" type="button" onClick={() => { setText(''); setApplied(''); }}>Clear search</button> : null}
        </div>
        <div className="row">
          <Field id="f-status" label="Filter by status">
            <select className="select" id="f-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {Object.values(STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field id="f-category" label="Filter by category">
            <select className="select" id="f-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All categories</option>
              {itemsOf(categories.data?.data).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field id="f-sort" label="Sort">
            <select className="select" id="f-sort" value={newestFirst ? 'new' : 'old'} onChange={(e) => setNewestFirst(e.target.value === 'new')}>
              <option value="new">Newest first</option>
              <option value="old">Oldest first</option>
            </select>
          </Field>
        </div>
        <div className="check">
          <input id="f-unassigned" type="checkbox" checked={unassigned} onChange={(e) => setUnassigned(e.target.checked)} />
          <label htmlFor="f-unassigned">Unassigned only</label>
        </div>
      </form>
      <Problem error={error} />
      {loading ? <Loading lines={4} label="Loading requests" /> : (
        <RequestItems
          items={items}
          emptyTitle={applied || status || categoryId || unassigned ? 'Nothing matches' : 'No requests'}
          emptyText={applied || status || categoryId || unassigned ? 'Try removing a filter or changing the search.' : 'Requests in your categories will be listed here.'} />
      )}
    </div>
  );
}
