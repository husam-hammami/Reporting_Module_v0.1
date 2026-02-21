import React, { useState, useEffect, useRef } from 'react';

export default function LiveDataIndicator({ lastUpdated, className = '' }) {
  const [secondsAgo, setSecondsAgo] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsAgo(prev => prev + 1);
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    setSecondsAgo(0);
  }, [lastUpdated]);

  return (
    <div className={`inline-flex items-center gap-2 print:hidden ${className}`}>
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
      </span>
      <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
        {secondsAgo}s ago
      </span>
    </div>
  );
}
