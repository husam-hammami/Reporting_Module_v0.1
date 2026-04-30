/**
 * useCountUp — easeOutQuart count-up tween for numeric values.
 *
 * Extracted from SavingsRibbon.tsx so the new dashboard tiles can share
 * the same animation primitive without duplication. Behaviour preserved
 * verbatim (including the prefers-reduced-motion + change-gate semantics
 * MASTER §6.2 mandates).
 */

import { useEffect, useState } from 'react';

export function useCountUp(target: number, durationMs = 1200, fireMinDelta = 1): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) {
      setValue(0);
      return;
    }
    if (Math.abs(target - value) < fireMinDelta) {
      setValue(target);
      return;
    }
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // Per MASTER §6.2 — reduced motion: snap to target.
      setValue(target);
      return;
    }
    const start = value;
    const delta = target - start;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart
      setValue(Math.round(start + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}
