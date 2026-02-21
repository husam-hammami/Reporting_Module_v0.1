import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { getApiBaseUrl, setApiFallback } from '../API/axios';

const SocketContext = createContext();
const LOCAL_TEST_MODE = false;

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const triedFallback = useRef(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (LOCAL_TEST_MODE) {
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const socketUrl = getApiBaseUrl() || (import.meta.env.DEV ? 'http://localhost:5000' : window.location.origin);

    let newSocket;
    try {
      newSocket = io(socketUrl, {
        transports: ['websocket'],
        withCredentials: true,
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 3000,
      });

      newSocket.on('connect', () => { setIsConnected(true); triedFallback.current = false; });
      newSocket.on('disconnect', () => { setIsConnected(false); });
      newSocket.on('connect_error', () => {
        setIsConnected(false);
        if (import.meta.env.DEV && !triedFallback.current && socketUrl !== 'http://localhost:5000') {
          triedFallback.current = true;
          setApiFallback();
          newSocket.close();
          const fallbackSocket = io(getApiBaseUrl(), {
            transports: ['websocket'],
            withCredentials: true,
            reconnection: true,
            reconnectionAttempts: 3,
          });
          fallbackSocket.on('connect', () => setIsConnected(true));
          fallbackSocket.on('disconnect', () => setIsConnected(false));
          socketRef.current = fallbackSocket;
          setSocket(fallbackSocket);
          fallbackSocket.connect();
        }
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
      newSocket.connect();
    } catch (e) {
      console.warn('[Socket] Could not create socket:', e.message);
    }

    return () => { socketRef.current?.disconnect(); };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
