// The sign-in sheet: a teal hero above a rounded sheet. Shown in place of any
// page that needs a session (AC-FR-1.1), at the same address.

import { useState } from 'react';
import { ApiError, signIn } from './api.js';
import { useAuth } from './auth.jsx';
import { Field, Logo, Problem, asError } from './ui.jsx';

export default function SignIn({ onSubmit, error = null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="signin">
      <div className="signin__hero">
        <Logo size={56} inverse />
        <div>
          <h1>Report it.<br />Track it.<br />Done.</h1>
          <p>Campus service requests, from first report to closed.</p>
        </div>
      </div>
      <div className="signin__sheet">
        <form className="signin__form" onSubmit={(e) => { e.preventDefault(); onSubmit(email, password); }}>
          <h2>Sign in</h2>
          <Field id="email" label="Email">
            <input className="input" id="email" name="email" autoComplete="username" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field id="password" label="Password">
            <input className="input" id="password" name="password" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Problem error={error} />
          <button className="btn btn--lg" type="submit">Sign in</button>
        </form>
      </div>
    </div>
  );
}

/**
 * Shows the sign-in prompt in place of its children until a session exists.
 * A failed attempt keeps the prompt and shows the server's problem.
 */
export function SignInGate({ children }) {
  const auth = useAuth();
  const [error, setError] = useState(null);
  if (auth.authed) return children;
  const submit = async (email, password) => {
    setError(null);
    try {
      const r = await signIn(email, password);
      auth.setUser(r.data);
    } catch (e) { setError(e instanceof ApiError ? e : asError(e)); }
  };
  return <SignIn onSubmit={submit} error={error} />;
}
