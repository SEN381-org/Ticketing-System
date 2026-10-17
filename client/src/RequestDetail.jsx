// One request. Traces to: FR-1.1 (a request address opened signed out shows the
// sign-in prompt in place), FR-4.2 (the detail fields the server chooses to
// send), FR-5.1 / FR-5.2 (assign, accept), FR-6.6 (the reason), FR-7.1 / FR-7.2
// (comments, actions), FR-2.4 (a requester adds detail), TD-003.
//
// The server decides everything. A field it does not send is not shown, and the
// "Update status" panel is built only from `permittedTransitions`, the list of
// { toStatus, requiresReason, requiresResolution } the server computed for the
// signed-in user. The client checks no rule: a submission is sent as typed and
// the server's refusal is shown.

import { useCallback, useEffect, useState } from 'react';
import { ROLE } from '../../shared/domainValues.js';
import {
  ApiError, addAction, addComment, addDetail, assign, getHistory, getRequest, itemsOf, listUsers, signIn, transition,
} from './api.js';
import { useAuth } from './auth.jsx';
import { homePath, shows } from './permissions.js';
import SignIn from './SignIn.jsx';
import Timeline from './Timeline.jsx';
import {
  BackLink, Empty, Field, Loading, Problem, StatusBadge, asError, formatWhen, useActionKey, useCategories,
} from './ui.jsx';

const present = (v) => v !== undefined && v !== null && v !== '';
const textOf = (v) => (v && typeof v === 'object' ? (v.summary ?? v.body ?? '') : v);

function NoteForm({ id, label, button, send, onDone }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const key = useActionKey();
  const field = `note-${button.replace(/\s+/g, '-').toLowerCase()}`;
  const submit = async (e) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try { await send(id, text, key.current()); key.renew(); setText(''); await onDone(); } catch (err) { setError(asError(err)); }
    setBusy(false);
  };
  return (
    <form onSubmit={submit}>
      <Field id={field} label={label}>
        <textarea className="textarea" id={field} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <button className="btn btn--quiet" type="submit" disabled={busy || !text.trim()}>{button}</button>
      <Problem error={error} />
    </form>
  );
}

export default function RequestDetail({ id }) {
  const auth = useAuth();
  const categories = useCategories();
  const [request, setRequest] = useState(null);
  const [etag, setEtag] = useState(null);
  const [history, setHistory] = useState({ entries: [], unavailable: false });
  const [pool, setPool] = useState([]);
  const [assignee, setAssignee] = useState('');
  const [needSignIn, setNeedSignIn] = useState(false);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);
  const [chosen, setChosen] = useState('');
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('');
  const transitionKey = useActionKey();
  const assignKey = useActionKey();

  // A 401 from GET or a write shows the prompt. A failed sign-in (the prompt's
  // own call) keeps the prompt and shows the problem. Anything that is not an
  // API response, such as a network failure, is shown, not rethrown.
  const handle = useCallback((e, { fromSignIn = false } = {}) => {
    if (!(e instanceof ApiError)) { setError(asError(e)); return; }
    if (e.status === 401 && !fromSignIn) {
      setRequest(null); setEtag(null); setNeedSignIn(true); setError(null); auth.markUnauthed(); return;
    }
    setError(e);
  }, [auth]);

  const loadHistory = useCallback(async () => {
    try {
      const h = await getHistory(id);
      setHistory({ entries: itemsOf(h.data), unavailable: false });
    } catch { setHistory({ entries: [], unavailable: true }); }
  }, [id]);

  const load = useCallback(async () => {
    try {
      const r = await getRequest(id);
      setRequest(r.data); setEtag(r.etag); setNeedSignIn(false);
      auth.markAuthed();
      loadHistory();
    } catch (e) { handle(e); }
  }, [id, handle, loadHistory, auth]);

  useEffect(() => { load(); }, [load]);

  // The people a request can be given to: Technicians and Security Officers (FR-5.1).
  const canAssign = shows(auth.user, 'assign');
  const shown = request !== null;
  const categoryId = request?.categoryId;
  useEffect(() => {
    if (!shown || !canAssign) return;
    Promise.all([ROLE.TECHNICIAN, ROLE.SECURITY_OFFICER].map((role) => listUsers({ role, categoryId })))
      .then((rs) => {
        const merged = new Map();
        for (const r of rs) for (const u of itemsOf(r.data)) merged.set(u.id, u);
        setPool([...merged.values()]);
      })
      .catch(() => setPool([]));
  }, [shown, canAssign, categoryId]);

  const onSignIn = async (email, password) => {
    setError(null);
    try { const r = await signIn(email, password); auth.setUser(r.data); } catch (e) { handle(e, { fromSignIn: true }); return; }
    await load();
  };

  // Every append changes the ETag (DB-01), so a 412 means the page was out of
  // date: read again and let the person try once more.
  const failed = async (e) => {
    handle(e);
    if (e instanceof ApiError && e.status === 412) { setStale(true); await load(); }
  };

  const permitted = Array.isArray(request?.permittedTransitions) ? request.permittedTransitions : null;
  const selected = permitted?.find((t) => t.toStatus === chosen) ?? permitted?.[0] ?? null;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null); setStale(false);
    const extra = selected?.requiresResolution || resolution ? { resolution } : {};
    try {
      await transition(id, etag, selected.toStatus, reason, extra, transitionKey.current());
      transitionKey.renew(); setReason(''); setResolution('');
      await load();
    } catch (err) { await failed(err); }
  };

  const onAssign = async (assigneeId) => {
    setError(null); setStale(false);
    try { await assign(id, etag, assigneeId, assignKey.current()); assignKey.renew(); setAssignee(''); await load(); } catch (err) { await failed(err); }
  };

  const nameFor = (userId) => {
    if (!userId) return null;
    if (auth.user?.id === userId) return 'You';
    return pool.find((u) => u.id === userId)?.displayName ?? null;
  };

  if (needSignIn) return <SignIn onSubmit={onSignIn} error={error} />;
  if (!request) return (<><div className="panel"><Loading label="Loading request" /></div><Problem error={error} /></>);

  const categoryName = request.categoryId ? categories.nameOf(request.categoryId) : null;
  const description = present(request.description) ? request.description : null;
  const resolutionText = present(request.resolution) ? textOf(request.resolution) : null;
  const facts = [
    present(request.location) ? ['Location', request.location, false] : null,
    present(request.submittedAt) ? ['Submitted', formatWhen(request.submittedAt), true] : null,
    present(request.assigneeId) ? ['Assignee', nameFor(request.assigneeId) ?? 'Staff member', false] : null,
  ].filter(Boolean);

  return (
    <div className="view">
      <BackLink to={homePath(auth.user)} />

      <section className="ticket-card" aria-label="Request">
        <div className="ticket-card__top">
          <div className="ticket-card__ref-row">
            <span className="ticket-card__ref" data-testid="reference">{request.reference}</span>
            <StatusBadge status={request.status} testId="status" />
          </div>
          <h1 className="cap">{categoryName ?? 'Request'}</h1>
          {description ? <p>{description}</p> : null}
        </div>
        {facts.length || resolutionText ? <div className="ticket-card__perf" /> : null}
        {facts.length || resolutionText ? (
          <dl className="facts">
            {facts.map(([k, v, mono]) => <div key={k}><dt>{k}</dt><dd className={mono ? 'mono' : undefined}>{v}</dd></div>)}
            {resolutionText ? <div className="facts__wide"><dt>Resolution</dt><dd>{resolutionText}</dd></div> : null}
          </dl>
        ) : null}
      </section>

      {shows(auth.user, 'assign') || (shows(auth.user, 'accept') && !present(request.assigneeId)) ? (
        <section className="panel" aria-label="Assignment">
          <h2 className="label">Assignment</h2>
          {shows(auth.user, 'assign') ? (
            <form onSubmit={(e) => { e.preventDefault(); if (assignee) onAssign(assignee); }}>
              <Field id="assignee" label="Assign to">
                <select className="select" id="assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Choose a staff member</option>
                  {pool.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
                </select>
              </Field>
              <button className="btn" type="submit" disabled={!assignee}>Assign request</button>
            </form>
          ) : null}
          {shows(auth.user, 'accept') && auth.user?.id && !present(request.assigneeId) ? (
            <button className="btn" type="button" onClick={() => onAssign(auth.user.id)}>Accept this request</button>
          ) : null}
        </section>
      ) : null}

      {permitted ? (
        <section className="panel status-panel" aria-label="Update status">
          <h2 className="label">Update status</h2>
          {permitted.length ? (
            <form onSubmit={onSubmit}>
              <Field id="toStatus" label="New status">
                <select className="select" id="toStatus" value={selected.toStatus} onChange={(e) => setChosen(e.target.value)}>
                  {permitted.map((t) => <option key={t.toStatus} value={t.toStatus}>{t.toStatus}</option>)}
                </select>
              </Field>
              <Field id="reason" label="Reason" hint={selected.requiresReason ? 'The server requires a reason for this change.' : 'Optional.'}>
                <textarea className="textarea" id="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              {selected.requiresResolution ? (
                <Field id="resolutionText" label="Resolution" hint="The server requires a resolution summary for this change.">
                  <textarea className="textarea" id="resolutionText" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />
                </Field>
              ) : null}
              <button className="btn btn--lg" type="submit">Submit transition</button>
            </form>
          ) : (
            <p className="notice-line">No status changes are available to you for this request right now.</p>
          )}
          {permitted.length ? <p className="notice-line">Only the next steps the server allows for your role are shown.</p> : null}
        </section>
      ) : null}

      <Problem error={error} />
      {stale ? <p className="notice-line">This request changed while you were looking at it. It has been reloaded; check it and try again.</p> : null}

      <section className="panel" aria-label="History">
        <h2 className="label">History</h2>
        {history.unavailable ? (
          <Empty title="History is not available" mark="!">It could not be loaded for this request.</Empty>
        ) : <Timeline entries={history.entries} nameFor={nameFor} />}
      </section>

      {shows(auth.user, 'comment') || shows(auth.user, 'detail') ? (
        <section className="panel" aria-label="Notes">
          <h2 className="label">Notes</h2>
          {shows(auth.user, 'comment') ? (
            <>
              <NoteForm id={id} label="Add a comment" button="Post comment" send={addComment} onDone={load} />
              <NoteForm id={id} label="Record an action" button="Record action" send={addAction} onDone={load} />
            </>
          ) : null}
          {shows(auth.user, 'detail') ? (
            <NoteForm id={id} label="Add more detail" button="Add detail" send={addDetail} onDone={load} />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
