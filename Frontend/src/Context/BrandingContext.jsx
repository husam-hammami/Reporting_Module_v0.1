import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from '../API/axios';

const BrandingContext = createContext();

const FALLBACK = { clientLogo: null, loading: false, fetchLogo: () => {}, uploadLogo: () => {}, removeLogo: () => {} };

export const useBranding = () => {
  const ctx = useContext(BrandingContext);
  return ctx || FALLBACK;
};

export const BrandingProvider = ({ children }) => {
  const [clientLogo, setClientLogo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchLogo = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/settings/client-logo');
      setClientLogo(data.logo || null);
    } catch (e) {
      console.warn('[Branding] Failed to fetch client logo:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogo();
  }, [fetchLogo]);

  const uploadLogo = useCallback(async (base64) => {
    const { data } = await axios.post('/api/settings/client-logo', { logo: base64 });
    setClientLogo(base64);
    return data;
  }, []);

  const removeLogo = useCallback(async () => {
    await axios.delete('/api/settings/client-logo');
    setClientLogo(null);
  }, []);

  return (
    <BrandingContext.Provider value={{
      clientLogo, loading, fetchLogo, uploadLogo, removeLogo,
    }}>
      {children}
    </BrandingContext.Provider>
  );
};
