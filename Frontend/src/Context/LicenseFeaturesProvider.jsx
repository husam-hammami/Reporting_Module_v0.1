import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from '../API/axios';

const DEFAULT_FEATURES = { digital_twin: true, atlas_ai: true };

export const LicenseFeaturesContext = createContext({
  features: DEFAULT_FEATURES,
  loading: true,
  hasFeature: () => true,
  refresh: () => {},
});

export function LicenseFeaturesProvider({ children }) {
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    axios
      .get('/api/license/entitlements')
      .then((res) => {
        const next = res.data?.features;
        if (next && typeof next === 'object') {
          setFeatures({
            digital_twin: next.digital_twin !== false,
            atlas_ai: next.atlas_ai !== false,
          });
        }
      })
      .catch(() => {
        setFeatures(DEFAULT_FEATURES);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10 * 60 * 1000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const hasFeature = useCallback(
    (key) => {
      if (!key) return true;
      return features[key] !== false;
    },
    [features],
  );

  return (
    <LicenseFeaturesContext.Provider value={{ features, loading, hasFeature, refresh }}>
      {children}
    </LicenseFeaturesContext.Provider>
  );
}

export function useLicenseFeatures() {
  return useContext(LicenseFeaturesContext);
}
