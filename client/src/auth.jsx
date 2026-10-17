// Who is signed in, as far as this tab knows. The session itself is the
// server's HttpOnly cookie; the profile {id, displayName, roles} returned by
// sign-in is kept in sessionStorage for display and for showing controls only.
// It is never an authority: every request is checked by the server.

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { signOut as apiSignOut } from './api.js';

const KEY = 'cc.profile';
const Auth = createContext(null);

function readProfile() {
  try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(readProfile);
  const [authed, setAuthed] = useState(Boolean(readProfile()));
  const [epoch, setEpoch] = useState(0); // bumped on sign-out so screens remount and re-read

  const setUser = useCallback((profile) => {
    if (profile) sessionStorage.setItem(KEY, JSON.stringify(profile)); else sessionStorage.removeItem(KEY);
    setUserState(profile);
    setAuthed(Boolean(profile));
  }, []);

  const value = useMemo(() => ({
    user,
    authed,
    epoch,
    setUser,
    markAuthed: () => setAuthed(true),
    markUnauthed: () => { setAuthed(false); sessionStorage.removeItem(KEY); setUserState(null); },
    async signOut() {
      await apiSignOut();
      sessionStorage.removeItem(KEY);
      setUserState(null);
      setAuthed(false);
      setEpoch((n) => n + 1);
    },
  }), [user, authed, epoch, setUser]);

  return <Auth.Provider value={value}>{children}</Auth.Provider>;
}

export const useAuth = () => useContext(Auth);
