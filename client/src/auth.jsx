// Who is signed in, as far as this tab knows. The session itself is the
// server's HttpOnly cookie; the profile {id, displayName, roles} returned by
// sign-in is kept in sessionStorage for display and for showing controls only.
// It is never an authority: every request is checked by the server.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { signOut as apiSignOut } from './api.js';

const KEY = 'cc.profile';
const LAST = 'cc.last'; // id of the last user who signed in in this tab
const Auth = createContext(null);

function readProfile() {
  try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(readProfile);
  const [authed, setAuthed] = useState(Boolean(readProfile()));
  const userRef = useRef(user);
  const [epoch, setEpoch] = useState(0); // bumped on sign-out so screens remount and re-read

  const setUser = useCallback((profile) => {
    if (profile) {
      sessionStorage.setItem(KEY, JSON.stringify(profile));
      if (profile.id) sessionStorage.setItem(LAST, profile.id);
    } else sessionStorage.removeItem(KEY);
    // A different person: screens remount so nothing loaded for the last one is kept.
    if (userRef.current?.id && profile?.id && userRef.current.id !== profile.id) setEpoch((n) => n + 1);
    userRef.current = profile;
    setUserState(profile);
    setAuthed(Boolean(profile));
  }, []);

  const value = useMemo(() => ({
    user,
    authed,
    epoch,
    setUser,
    lastUserId: () => sessionStorage.getItem(LAST),
    markAuthed: () => setAuthed(true),
    markUnauthed: () => { setAuthed(false); sessionStorage.removeItem(KEY); userRef.current = null; setUserState(null); },
    async signOut() {
      await apiSignOut();
      sessionStorage.removeItem(KEY);
      userRef.current = null;
      setUserState(null);
      setAuthed(false);
      setEpoch((n) => n + 1);
    },
  }), [user, authed, epoch, setUser]);

  return <Auth.Provider value={value}>{children}</Auth.Provider>;
}

export const useAuth = () => useContext(Auth);
