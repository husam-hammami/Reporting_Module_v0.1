/**
 * DensityProvider — sets `data-hai-density` on a wrapper so tokens.css can
 * scale spacing and text per plan section 10.
 *
 * Three explicit modes: compact (default), comfortable (tablet), wallboard
 * (4K TV). If the viewport is ≥ 1536 px wide, wallboard auto-activates when
 * the caller has not pinned a mode.
 */

import { useEffect, useState, type ReactNode } from 'react';

export type HaiDensity = 'compact' | 'comfortable' | 'wallboard';

export interface DensityProviderProps {
  /** If set, overrides the auto-detection. */
  density?: HaiDensity;
  /** Auto-upgrade to wallboard at ≥ 1536 px. Default true. */
  autoWallboard?: boolean;
  children: ReactNode;
  className?: string;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Safari < 14 fallback
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, [query]);

  return matches;
}

export function DensityProvider(props: DensityProviderProps) {
  const { density, autoWallboard = true, children, className } = props;
  const isWallboardWidth = useMediaQuery('(min-width: 1536px)');

  const resolved: HaiDensity =
    density ?? (autoWallboard && isWallboardWidth ? 'wallboard' : 'compact');

  return (
    <div data-hai-density={resolved} className={className}>
      {children}
    </div>
  );
}
