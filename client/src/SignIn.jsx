import { useState } from 'react';

export default function SignIn({ onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(email, password); }}>
      <h1>Sign in</h1>
      <p>
        <label htmlFor="email">Email</label>{' '}
        <input id="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </p>
      <p>
        <label htmlFor="password">Password</label>{' '}
        <input id="password" name="password" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} />
      </p>
      <button type="submit">Sign in</button>
    </form>
  );
}
