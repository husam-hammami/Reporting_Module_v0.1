import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from '../API/axios';
import endpoints from '../API/endpoints';
import { AuthContext } from './AuthProvider';

export const FeatureContext = createContext();

const DEFAULT_FEATURES = { digital_twin: false, atlas_ai: false };

export function FeatureProvider({ children }) {
  const { auth } = useContext(AuthContext);
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('default');

  const refresh = useCallback(async (force = false) => {
    if (!auth) {
      setFeatures(DEFAULT_FEATURES);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const url = force
        ? `${endpoints.licenses.entitlements}?refresh=1`
        : endpoints.licenses.entitlements;
      const res = await axios.get(url);
      const feats = res.data?.features || DEFAULT_FEATURES;
      setFeatures({
        digital_twin: Boolean(feats.digital_twin),
        atlas_ai: Boolean(feats.atlas_ai),
      });
      setSource(res.data?.source || 'default');
    } catch {
      setFeatures(DEFAULT_FEATURES);
      setSource('default');
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => {
    refresh(false);
  }, [refresh]);

  // Periodic refresh only — do NOT refresh on window focus (caused PowerShell flash loop).
  useEffect(() => {
    if (!auth) return undefined;
    const interval = setInterval(() => refresh(false), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [auth, refresh]);

  return (
    <FeatureContext.Provider value={{ features, loading, source, refresh }}>
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeatures() {
  const ctx = useContext(FeatureContext);
  if (!ctx) {
    return {
      features: DEFAULT_FEATURES,
      loading: false,
      source: 'default',
      refresh: () => {},
    };
  }
  return ctx;
}
