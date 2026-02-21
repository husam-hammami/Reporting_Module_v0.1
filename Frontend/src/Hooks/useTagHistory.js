/**
 * Accumulates tag values over time for sparklines and trend charts.
 *
 * Collects samples at emulator speed (200ms / 5Hz) into a mutable
 * buffer (ref), but only flushes to React state every FLUSH_MS to avoid
 * excessive re-renders.  The chart sees a 1500-point (~5 min) buffer
 * that updates 2× per second — enough for smooth uPlot streaming
 * without hammering React reconciliation.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_POINTS = 1500;     // ~5 min at 5 samples/sec — wide enough for meaningful trends
const MIN_INTERVAL_MS = 200;  // match emulator tick rate (5Hz)
const FLUSH_MS = 500;         // push to React state every 500ms (2 fps — plenty for smooth chart)

export function useTagHistory(tagNames, tagValues) {
  const [history, setHistory] = useState({});
  const bufferRef = useRef({});       // mutable buffer — collects at full speed
  const lastTsRef = useRef({});       // per-tag last-sample timestamp
  const flushTimerRef = useRef(null);

  // Collect samples into the mutable buffer (no React re-render)
  useEffect(() => {
    if (!Array.isArray(tagNames) || tagNames.length === 0 || !tagValues || typeof tagValues !== 'object') return;

    const now = Date.now();
    let hasNew = false;

    tagNames.forEach((tagName) => {
      const v = tagValues[tagName];
      if (v === undefined || v === null) return;
      const num = Number(v);
      if (Number.isNaN(num)) return;

      const last = lastTsRef.current[tagName] ?? 0;
      if (now - last < MIN_INTERVAL_MS) return;
      lastTsRef.current[tagName] = now;

      if (!bufferRef.current[tagName]) bufferRef.current[tagName] = [];
      const arr = bufferRef.current[tagName];
      arr.push({ t: now, v: num });
      // Trim to max
      while (arr.length > MAX_POINTS) arr.shift();
      hasNew = true;
    });

    // Schedule a flush if we have new data and no flush is pending
    if (hasNew && !flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        // Snapshot the buffer into React state
        const snapshot = {};
        for (const [tag, arr] of Object.entries(bufferRef.current)) {
          snapshot[tag] = arr.slice(); // shallow copy so React sees new ref
        }
        setHistory(snapshot);
      }, FLUSH_MS);
    }
  }, [tagNames, tagValues]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  return history;
}
