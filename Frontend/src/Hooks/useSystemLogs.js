import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getApiBaseUrl } from '../API/axios';

const MAX_CLIENT_LOGS = 3000;

export default function useSystemLogs() {
  const [logs, setLogs] = useState([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);
  const idCounter = useRef(0);

  const addEntry = useCallback((entry) => {
    setLogs((prev) => {
      const next = [...prev, { ...entry, _id: ++idCounter.current }];
      return next.length > MAX_CLIENT_LOGS ? next.slice(-MAX_CLIENT_LOGS) : next;
    });
  }, []);

  const addBatch = useCallback((entries) => {
    setLogs((prev) => {
      const tagged = entries.map((e) => ({ ...e, _id: ++idCounter.current }));
      const next = [...prev, ...tagged];
      return next.length > MAX_CLIENT_LOGS ? next.slice(-MAX_CLIENT_LOGS) : next;
    });
  }, []);

  useEffect(() => {
    const baseUrl = getApiBaseUrl() || (import.meta.env.DEV ? 'http://localhost:5001' : window.location.origin);

    fetch(`${baseUrl}/api/settings/logs/recent?n=500`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => { if (data.logs) addBatch(data.logs); })
      .catch(() => {})
      .finally(() => setLoading(false));

    const sock = io(baseUrl + '/logs', {
      transports: ['websocket'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    sock.on('connect', () => setConnected(true));
    sock.on('disconnect', () => setConnected(false));
    sock.on('system_log', (entry) => addEntry(entry));
    socketRef.current = sock;

    return () => { sock.disconnect(); };
  }, [addEntry, addBatch]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, connected, loading, clearLogs };
}
