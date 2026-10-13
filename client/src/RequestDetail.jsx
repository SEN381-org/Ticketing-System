import { useCallback, useEffect, useState } from 'react';
import { STATUS } from '../../shared/domainValues.js';
import { ApiError, getRequest, signIn, signOut, transition } from './api.js';
import SignIn from './SignIn.jsx';

function Problem({ error }) {
  if (!error) return null;
  const p = error.problem;
  return (
    <div role="alert">
      {p ? (
        <>
          <span>{p.status}</span> <span>{p.code}</span> <span>{p.title}</span> <span>{p.detail}</span>
        </>
      ) : (error.status ? `HTTP ${error.status}` : error.message)}
    </div>
  );
}

// No rule checks here: the server decides what is allowed (TD-003).
export default function RequestDetail({ id }) {
  const [request, setRequest] = useState(null);
  const [etag, setEtag] = useState(null);
  const [needSignIn, setNeedSignIn] = useState(false);
  const [error, setError] = useState(null);
  const [toStatus, setToStatus] = useState(Object.values(STATUS)[0]);
  const [reason, setReason] = useState('');

  // A 401 from GET or a transition shows the prompt. A failed sign-in (the
  // prompt's own call) keeps the prompt and shows the problem. Anything that is
  // not an API response, such as a network failure, is shown, not rethrown.
  const handle = useCallback((e, { fromSignIn = false } = {}) => {
    if (!(e instanceof ApiError)) { setError({ status: 0, problem: null, message: e?.message || 'Network error' }); return; }
    if (e.status === 401 && !fromSignIn) { setRequest(null); setEtag(null); setNeedSignIn(true); setError(null); return; }
    setError(e);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await getRequest(id);
      setRequest(r.data); setEtag(r.etag); setNeedSignIn(false);
      setToStatus(r.data.status);
    } catch (e) { handle(e); }
  }, [id, handle]);

  useEffect(() => { load(); }, [load]);

  const onSignIn = async (email, password) => {
    setError(null);
    try { await signIn(email, password); } catch (e) { handle(e, { fromSignIn: true }); return; }
    await load();
  };

  const onSignOut = async () => {
    setError(null);
    try { await signOut(); } catch (e) { handle(e); return; }
    setRequest(null); setEtag(null); setNeedSignIn(true);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try { await transition(id, etag, toStatus, reason); await load(); } catch (err) { handle(err); }
  };

  if (needSignIn) return (<><SignIn onSubmit={onSignIn} /><Problem error={error} /></>);
  if (!request) return (<><p>Loading</p><Problem error={error} /></>);

  return (
    <main>
      <h1>Request</h1>
      <p>Reference: <span data-testid="reference">{request.reference}</span></p>
      <p>Status: <span data-testid="status">{request.status}</span></p>
      <form onSubmit={onSubmit}>
        <p>
          <label htmlFor="toStatus">New status</label>{' '}
          <select id="toStatus" value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
            {Object.values(STATUS).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </p>
        <p>
          <label htmlFor="reason">Reason</label>{' '}
          <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </p>
        <button type="submit">Submit transition</button>
      </form>
      <button type="button" onClick={onSignOut}>Sign out</button>
      <Problem error={error} />
    </main>
  );
}
