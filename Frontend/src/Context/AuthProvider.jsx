import { createContext, useEffect, useState } from 'react';
import axios from '../API/axios';
import { AUTH_TOKEN_KEY } from '../API/axios';
import endpoints from '../API/endpoints';
import { toast } from 'react-toastify';

export const AuthContext = createContext();

// ── DEV / LOCAL TEST MODE ──────────────────────────────────────────
// Set to true to skip all backend auth and use a mock admin user.
// Set to false to restore normal backend authentication.
const DEV_MODE = true;
// ────────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState(DEV_MODE ? { id: 0, username: 'dev_admin', role: 'admin' } : null);
  const [authLoading, setAuthLoading] = useState(!DEV_MODE);

  const validateUser = async () => {
    if (DEV_MODE) return;

    try {
      setAuthLoading(true);
      const response = await axios.get(endpoints.auth.checkAuth);
      if (response.data?.authenticated) {
        setAuth(response.data.user_data);
      } else {
        setAuth(null);
      }
    } catch (err) {
      console.warn('[AuthProvider] Auth check failed:', err.code || err.message);
      setAuth(null);
      try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch (_) {}
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    if (DEV_MODE) { setAuth(null); toast.success('Logged out!'); return; }
    try {
      setAuthLoading(true);
      try { await axios.post(endpoints.auth.logout); } catch (_) {}
      setAuth(null);
      try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch (_) {}
      toast.success('Logged out!');
    } catch (err) {
      toast.error('Something went wrong: ' + err);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!DEV_MODE) validateUser();
  }, []);

  return (
    <AuthContext.Provider value={{ auth, setAuth, authLoading, setAuthLoading, validateUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
