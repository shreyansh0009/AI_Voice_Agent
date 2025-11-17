import React, { useState, useEffect } from 'react';

/**
 * ResponseTimer - Shows response time for AI requests
 * Helps monitor and display latency to users
 */
const ResponseTimer = ({ isActive, onTimeUpdate }) => {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    let interval;
    
    if (isActive) {
      const startTime = Date.now();
      interval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        setElapsedTime(elapsed);
        if (onTimeUpdate) {
          onTimeUpdate(elapsed);
        }
      }, 100);
    } else {
      setElapsedTime(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, onTimeUpdate]);

  if (!isActive && elapsedTime === 0) return null;

  return (
    <div className="inline-flex items-center gap-1 text-xs text-slate-500">
      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span>{elapsedTime}s</span>
    </div>
  );
};

export default ResponseTimer;
