import { useState } from 'react';
import { ApiError, signIn } from './api.js';
import { useAuth } from './auth.jsx';
import { Field, Problem, asError } from './ui.jsx';

export default function SignIn({ onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form className="card view" onSubmit={(e) => { e.preventDefault(); onSubmit(email, password); }}>
      <h1>Sign in</h1>
      <Field id="email" label="Email">
        <input className="input" id="email" name="email" autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field id="password" label="Password">
        <input className="input" id="password" name="password" type="password" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <button className="btn" type="submit">Sign in</button>
    </form>
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
  return (<><SignIn onSubmit={submit} /><Problem error={error} /></>);
}
