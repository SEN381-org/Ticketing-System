// Submit a request. Traces to: FR-2.1, FR-2.2 (exactly three mandatory fields:
// category, location, description), AC-FR-2.2b (the 400 names the missing field
// in its detail, for example "'location' is required"), AC-FR-2.3 (a category
// that cannot be chosen is a 422), AC-FR-2.6 (the confirmation shows the
// reference), NFR-4.3 (privacy notice before submit). The server validates; the
// client only displays what it says.

import { useState } from 'react';
import { ApiError, submitRequest } from '../api.js';
import { useAuth } from '../auth.jsx';
import { homePath } from '../permissions.js';
import PrivacyNotice from '../PrivacyNotice.jsx';
import { Link } from '../router.jsx';
import { BackLink, Empty, Field, Loading, NoAccess, Problem, asError, useActionKey, useCategories } from '../ui.jsx';

/**
 * Field-level messages from a 400 problem. The server names the field inside
 * the detail, quoted ('location' is required) or bare (email is required).
 * `names` are the field names to look for, in the form the server uses.
 */
export function fieldErrorsOf(problem, names) {
  if (!problem?.detail) return {};
  let found = null;
  for (const name of names) {
    const at = problem.detail.search(new RegExp(String.raw`(^|[\s'"])${name}(?=$|[\s'"])`));
    if (at !== -1 && (!found || at < found.at)) found = { name, at };
  }
  return found ? { [found.name]: problem.detail } : {};
}

const SUBMIT_FIELDS = ['categoryId', 'location', 'description'];

export default function NewRequest() {
  const auth = useAuth();
  const categories = useCategories();
  const [form, setForm] = useState({ categoryId: '', location: '', description: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const key = useActionKey();
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const fields = error?.status === 400 ? fieldErrorsOf(error.problem, SUBMIT_FIELDS) : {};
  // 422: the chosen category is not one that can be used (AC-FR-2.3).
  if (error?.status === 422 && error.problem?.code === 'CATEGORY_NOT_SELECTABLE') fields.categoryId = error.problem.detail;

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const r = await submitRequest(form, key.current());
      key.renew();
      setDone({ reference: r.data?.reference, id: r.data?.id });
      setForm({ categoryId: '', location: '', description: '' });
    } catch (err) { setError(err instanceof ApiError ? err : asError(err)); }
    setBusy(false);
  };

  const back = <BackLink to={homePath(auth.user)}>Back</BackLink>;

  if (done) {
    return (
      <div className="view">
        {back}
        <h1>Request received</h1>
        <div className="success" role="status">
          <p>Your request has been received.</p>
          <p>Reference: <strong className="mono" data-testid="submitted-reference">{done.reference}</strong></p>
          <p className="small">Keep this reference to ask about your request.</p>
        </div>
        <div className="row">
          {done.id ? <Link className="btn" to={`/requests/${encodeURIComponent(done.id)}`}>View this request</Link> : null}
          <button className="btn btn--quiet" type="button" onClick={() => setDone(null)}>Submit another</button>
        </div>
      </div>
    );
  }

  if (categories.loading) return <div className="panel"><Loading label="Loading categories" /></div>;
  if (categories.error?.status === 403) return <NoAccess what="submitting requests" />;
  if (categories.error || !categories.list.length) {
    return (
      <div className="view">
        {back}
        <h1>New request</h1>
        <Problem error={categories.error} />
        <Empty title="No categories available" mark="?">A request cannot be submitted until a category is available.</Empty>
      </div>
    );
  }

  const invalid = (name) => (fields[name] ? { 'aria-invalid': 'true', 'aria-describedby': `${name}-error` } : {});

  return (
    <form className="view" onSubmit={submit} noValidate>
      {back}
      <div>
        <h1>What needs attention?</h1>
        <p className="muted">All three fields are required.</p>
      </div>

      <fieldset className="field" aria-describedby={fields.categoryId ? 'categoryId-error' : undefined}>
        <legend className="field__label">Category</legend>
        <div className="choices">
          {categories.list.map((c) => (
            <label className="choice" key={c.id}>
              <input type="radio" name="category" value={c.id} checked={form.categoryId === c.id} onChange={set('categoryId')} />
              <span className="cap">{c.name}</span>
            </label>
          ))}
        </div>
        {fields.categoryId ? <span className="field__error" id="categoryId-error">{fields.categoryId}</span> : null}
      </fieldset>

      <Field id="location" label="Location" error={fields.location}>
        <input className="input" id="location" value={form.location} onChange={set('location')} {...invalid('location')} />
      </Field>
      <Field id="description" label="Description" error={fields.description}>
        <textarea className="textarea" id="description" rows={4} value={form.description} onChange={set('description')} {...invalid('description')} />
      </Field>

      <PrivacyNotice />
      {Object.keys(fields).length ? null : <Problem error={error} />}
      <button className="btn btn--lg" type="submit" disabled={busy}>{busy ? 'Submitting' : 'Submit request'}</button>
    </form>
  );
}
