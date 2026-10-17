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
import { useToast } from '../toast.jsx';
import {
  BackLink, Empty, Field, Loading, NoAccess, Problem, Ticket, asError, formatDay, useActionKey, useCategories,
} from '../ui.jsx';

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

const SUBMIT_FIELDS = ['categoryId', 'category', 'location', 'description'];

// Plain wording for the three mandatory fields (FR-2.2), used only when the
// server's 400 says the field is required. Any other message (too long, not a
// string) is the server's own, shown as it came.
const REQUIRED_TEXT = { categoryId: 'Choose a category.', location: 'Add a location.', description: 'Add a description.' };

/** The 400's field messages for the submit form, keyed by form field. */
export function submitFieldErrors(problem) {
  const out = {};
  for (const [name, detail] of Object.entries(fieldErrorsOf(problem, SUBMIT_FIELDS))) {
    const field = name === 'category' ? 'categoryId' : name;
    out[field] = /\bis required\b/.test(detail) ? REQUIRED_TEXT[field] : detail;
  }
  return out;
}

export default function NewRequest() {
  const auth = useAuth();
  const categories = useCategories();
  const [form, setForm] = useState({ categoryId: '', location: '', description: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const key = useActionKey();
  const toast = useToast();
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const fields = error?.status === 400 ? submitFieldErrors(error.problem) : {};
  // 422: the chosen category is not one that can be used (AC-FR-2.3).
  if (error?.status === 422 && error.problem?.code === 'CATEGORY_NOT_SELECTABLE') fields.categoryId = error.problem.detail;

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const r = await submitRequest(form, key.current());
      key.renew();
      setDone({
        reference: r.data?.reference, id: r.data?.id, status: r.data?.status, submittedAt: r.data?.submittedAt,
        category: categories.nameOf(form.categoryId), location: form.location.trim(),
      });
      toast('Request submitted.', { reference: r.data?.reference ?? null });
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
          <p className="small">Keep this reference to ask about your request.</p>
        </div>
        <ul className="tickets">
          <Ticket
            to={done.id ? `/requests/${encodeURIComponent(done.id)}` : '/'}
            title={done.category ?? 'Request'}
            status={done.status}
            meta={[done.location, formatDay(done.submittedAt)].filter(Boolean).join(' · ')}
            reference={done.reference}
            refTestId="submitted-reference"
          />
        </ul>
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
