// Submit a request. Traces to: FR-2.1, FR-2.2 (exactly three mandatory fields:
// category, location, description), AC-FR-2.2b (the 400 names the field),
// AC-FR-2.6 (the confirmation shows the reference), NFR-4.3 (privacy notice
// before submit). The server validates; the client only displays what it says.

import { useState } from 'react';
import { ApiError, listCategories, submitRequest, itemsOf } from '../api.js';
import PrivacyNotice from '../PrivacyNotice.jsx';
import { Link } from '../router.jsx';
import { Empty, Field, Loading, PageHead, Problem, asError, useActionKey, useLoad } from '../ui.jsx';

const MANDATORY = ['category', 'location', 'description'];

/** Field-level messages from a 400 problem: a structured list if sent, else a field name found in the detail. */
export function fieldErrorsOf(problem) {
  if (!problem) return {};
  const out = {};
  const structured = problem.errors ?? problem.fields;
  if (Array.isArray(structured)) {
    for (const item of structured) {
      const name = String(item.field ?? item.name ?? item.pointer ?? '').replace(/^.*\//, '');
      if (name) out[name === 'categoryId' ? 'category' : name] = item.detail ?? item.message ?? problem.detail ?? problem.title;
    }
  }
  if (problem.field) out[problem.field === 'categoryId' ? 'category' : problem.field] = problem.detail ?? problem.title;
  if (!Object.keys(out).length && problem.detail) {
    for (const name of MANDATORY) {
      if (new RegExp(`\\b${name}(Id)?\\b`, 'i').test(problem.detail)) out[name] = problem.detail;
    }
  }
  return out;
}

const idFromLocation = (location) => (location ? decodeURIComponent(location.split('/').filter(Boolean).pop()) : null);

export default function NewRequest() {
  const categories = useLoad(listCategories, []);
  const [form, setForm] = useState({ category: '', location: '', description: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const key = useActionKey();
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const fields = error?.status === 400 ? fieldErrorsOf(error.problem) : {};

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const r = await submitRequest({ categoryId: form.category, location: form.location, description: form.description }, key.current());
      key.renew();
      setDone({ reference: r.data?.reference, id: r.data?.id ?? idFromLocation(r.location) });
      setForm({ category: '', location: '', description: '' });
    } catch (err) { setError(err instanceof ApiError ? err : asError(err)); }
    setBusy(false);
  };

  if (done) {
    return (
      <div className="view">
        <PageHead title="New request" />
        <div className="success" role="status">
          <p>Your request has been received.</p>
          <p>Reference: <strong className="mono" data-testid="submitted-reference">{done.reference}</strong></p>
          <p className="small">Keep this reference to ask about your request.</p>
        </div>
        <div className="row">
          {done.id ? <Link className="btn" to={`/requests/${encodeURIComponent(done.id)}`}>View this request</Link> : null}
          <Link className="btn btn--quiet" to="/requests">My requests</Link>
          <button className="btn btn--quiet" type="button" onClick={() => setDone(null)}>Submit another</button>
        </div>
      </div>
    );
  }

  if (categories.loading) return <div className="card"><Loading label="Loading categories" /></div>;
  const list = itemsOf(categories.data?.data);
  if (categories.error || !list.length) {
    return (
      <div className="view">
        <PageHead title="New request" />
        <Problem error={categories.error} />
        <Empty title="No categories available" mark="?">A request cannot be submitted until a category is available.</Empty>
      </div>
    );
  }

  const invalid = (name) => (fields[name] ? { 'aria-invalid': 'true', 'aria-describedby': `${name}-error` } : {});

  return (
    <form className="view card" onSubmit={submit} noValidate>
      <PageHead title="New request" />
      <PrivacyNotice />
      <Field id="category" label="Category" error={fields.category}>
        <select className="select" id="category" value={form.category} onChange={set('category')} {...invalid('category')}>
          <option value="">Choose a category</option>
          {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field id="location" label="Location" hint="Where the problem is." error={fields.location}>
        <input className="input" id="location" value={form.location} onChange={set('location')} {...invalid('location')} />
      </Field>
      <Field id="description" label="Description" hint="What needs attention." error={fields.description}>
        <textarea className="textarea" id="description" value={form.description} onChange={set('description')} {...invalid('description')} />
      </Field>
      <Problem error={error} />
      <button className="btn" type="submit" disabled={busy}>{busy ? 'Submitting' : 'Submit request'}</button>
    </form>
  );
}
