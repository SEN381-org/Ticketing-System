import { useCallback, useEffect, useState } from 'react';
import { STATUS, ROLE } from '../../shared/domainValues.js';
import {
  ApiError, addAction, addComment, assign, getHistory, getRequest, itemsOf, listUsers, signIn, transition,
} from './api.js';
import { useAuth } from './auth.jsx';
import { shows } from './permissions.js';
import SignIn from './SignIn.jsx';
import Timeline from './Timeline.jsx';
import { Empty, Field, Loading, Problem, StatusBadge, asError, formatWhen, useActionKey } from './ui.jsx';

/** Reads one display field that may arrive under more than one name; absent fields are simply not shown. */
const pick = (obj, ...names) => names.map((n) => obj?.[n]).find((v) => v !== undefined && v !== null && v !== '');
const nameOf = (v) => (v && typeof v === 'object' ? (v.displayName ?? v.name ?? v.code ?? v.id) : v);

function Facts({ request }) {
  const rows = [
    ['Category', nameOf(pick(request, 'category', 'categoryName', 'categoryId'))],
    ['Location', pick(request, 'location')],
    ['Submitted', pick(request, 'submittedAt', 'createdAt') ? formatWhen(pick(request, 'submittedAt', 'createdAt')) : null],
    ['Assignee', nameOf(pick(request, 'assignee', 'assigneeName', 'assigneeId'))],
  ].filter(([, v]) => v);
  const description = pick(request, 'description');
  const resolution = pick(request, 'resolution');
  return (
    <>
      {rows.length ? (
        <dl className="facts">
          {rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{String(v)}</dd></div>)}
        </dl>
      ) : null}
      {description ? <><h3>Description</h3><p>{description}</p></> : null}
      {resolution ? <><h3>Resolution</h3><p>{typeof resolution === 'object' ? resolution.body : resolution}</p></> : null}
    </>
  );
}

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

// No rule checks here: the server decides what is allowed (TD-003).
export default function RequestDetail({ id }) {
  const auth = useAuth();
  const [request, setRequest] = useState(null);
  const [etag, setEtag] = useState(null);
  const [history, setHistory] = useState({ entries: [], unavailable: false });
  const [technicians, setTechnicians] = useState([]);
  const [assignee, setAssignee] = useState('');
  const [needSignIn, setNeedSignIn] = useState(false);
  const [error, setError] = useState(null);
  const [toStatus, setToStatus] = useState(Object.values(STATUS)[0]);
  const [reason, setReason] = useState('');
  const [resolution, setResolution] = useState('');
  const transitionKey = useActionKey();
  const assignKey = useActionKey();

  // A 401 from GET or a transition shows the prompt. A failed sign-in (the
  // prompt's own call) keeps the prompt and shows the problem. Anything that is
  // not an API response, such as a network failure, is shown, not rethrown.
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
      setToStatus(r.data.status);
      auth.markAuthed();
      loadHistory();
    } catch (e) { handle(e); }
  }, [id, handle, loadHistory, auth]);

  useEffect(() => { load(); }, [load]);

  const canAssign = shows(auth.user, 'assign');
  const shown = request !== null;
  useEffect(() => {
    if (!shown || !canAssign) return;
    listUsers({ role: ROLE.TECHNICIAN }).then((r) => setTechnicians(itemsOf(r.data))).catch(() => setTechnicians([]));
  }, [shown, canAssign]);

  const onSignIn = async (email, password) => {
    setError(null);
    try { const r = await signIn(email, password); auth.setUser(r.data); } catch (e) { handle(e, { fromSignIn: true }); return; }
    await load();
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const extra = toStatus === STATUS.RESOLVED && resolution ? { resolution } : {};
    try {
      await transition(id, etag, toStatus, reason, extra, transitionKey.current());
      transitionKey.renew();
      await load();
    } catch (err) { handle(err); }
  };

  const onAssign = async (assigneeId) => {
    setError(null);
    try { await assign(id, etag, assigneeId, assignKey.current()); assignKey.renew(); await load(); } catch (err) { handle(err); }
  };

  if (needSignIn) return (<><SignIn onSubmit={onSignIn} /><Problem error={error} /></>);
  if (!request) return (<><div className="card"><Loading label="Loading request" /></div><Problem error={error} /></>);

  const staleness = error?.status === 412;

  return (
    <div className="view">
      <h1>Request</h1>
      <section className="card">
        <p>Reference: <span className="mono" data-testid="reference">{request.reference}</span></p>
        <p>Status: <StatusBadge status={request.status} testId="status" /></p>
        <Facts request={request} />
      </section>

      {shows(auth.user, 'assign') || shows(auth.user, 'accept') ? (
        <section className="card" aria-label="Assignment">
          <h2>Assignment</h2>
          {shows(auth.user, 'assign') ? (
            <form onSubmit={(e) => { e.preventDefault(); if (assignee) onAssign(assignee); }}>
              <Field id="assignee" label="Assign to">
                <select className="select" id="assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Choose a staff member</option>
                  {technicians.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
                </select>
              </Field>
              <button className="btn" type="submit" disabled={!assignee}>Assign request</button>
            </form>
          ) : null}
          {shows(auth.user, 'accept') && auth.user?.id ? (
            <button className="btn btn--quiet" type="button" onClick={() => onAssign(auth.user.id)}>Accept this request</button>
          ) : null}
        </section>
      ) : null}

      {shows(auth.user, 'transition') ? (
        <section className="card" aria-label="Change status">
          <h2>Change status</h2>
          <form onSubmit={onSubmit}>
            <Field id="toStatus" label="New status">
              <select className="select" id="toStatus" value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
                {Object.values(STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field id="reason" label="Reason">
              <textarea className="textarea" id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            {toStatus === STATUS.RESOLVED ? (
              <Field id="resolutionText" label="Resolution">
                <textarea className="textarea" id="resolutionText" value={resolution} onChange={(e) => setResolution(e.target.value)} />
              </Field>
            ) : null}
            <button className="btn" type="submit">Submit transition</button>
          </form>
        </section>
      ) : null}

      <Problem error={error} />
      {staleness ? (
        <p><button className="btn btn--quiet" type="button" onClick={() => { setError(null); load(); }}>Reload this request</button></p>
      ) : null}

      <section className="card" aria-label="History">
        <h2>History</h2>
        {history.unavailable ? (
          <Empty title="History is not available" mark="!">It could not be loaded for this request.</Empty>
        ) : <Timeline entries={history.entries} />}
      </section>

      {shows(auth.user, 'comment') ? (
        <section className="card" aria-label="Notes">
          <h2>Notes</h2>
          <NoteForm id={id} label="Add a comment" button="Post comment" send={addComment} onDone={loadHistory} />
          <NoteForm id={id} label="Record an action" button="Record action" send={addAction} onDone={loadHistory} />
        </section>
      ) : null}
    </div>
  );
}
