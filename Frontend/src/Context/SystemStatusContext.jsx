import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from '../API/axios';

const SystemStatusContext = createContext();

export const useSystemStatus = () => {
  const ctx = useContext(SystemStatusContext);
  if (!ctx) throw new Error('useSystemStatus must be used within SystemStatusProvider');
  return ctx;
};

export const SystemStatusProvider = ({ children }) => {
  const [demoMode, setDemoMode] = useState(null);    // null = loading
  const [plcConfig, setPlcConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/settings/system-status');
      setDemoMode(data.demo_mode);
      setPlcConfig(data.plc_config);
    } catch (e) {
      console.warn('[SystemStatus] Failed to fetch:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const toggleDemoMode = useCallback(async (enabled) => {
    const { data } = await axios.post('/api/settings/demo-mode', { enabled });
    setDemoMode(data.demo_mode);
    return data;
  }, []);

  const updatePlcConfig = useCallback(async (ip, rack, slot) => {
    const { data } = await axios.post('/api/settings/plc-config', { ip, rack, slot });
    setPlcConfig(data);
    return data;
  }, []);

  return (
    <SystemStatusContext.Provider value={{
      demoMode, plcConfig, loading, fetchStatus, toggleDemoMode, updatePlcConfig,
    }}>
      {children}
    </SystemStatusContext.Provider>
  );
};
