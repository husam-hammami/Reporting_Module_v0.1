/**
 * Read CSS variable colors from the Atlas root (which carries `data-theme`)
 * so charts pick up the dark/light values that actually apply on the page —
 * not the inherited html-level ones, which may differ when tokens.css' light
 * `:root` block wins source order.
 *
 * Re-resolves whenever the Atlas root's data-theme attribute or html.class
 * changes.
 */

import { useEffect, useState } from 'react';

const TOKEN_KEYS = [
  '--hai-text-primary',
  '--hai-text-tertiary',
  '--hai-text-disabled',
  '--hai-surface-100',
  '--hai-surface-border',
  '--hai-money',
  '--hai-status-ok-600',
  '--hai-status-info-600',
  '--hai-future',
  '--hai-forecast-band',
];

function findScope() {
  if (typeof document === 'undefined') return null;
  return document.querySelector('.atlas-root') ?? document.documentElement;
}

function readTokens() {
  const el = findScope();
  if (!el) return {};
  const cs = getComputedStyle(el);
  return TOKEN_KEYS.reduce((acc, k) => {
    acc[k] = cs.getPropertyValue(k).trim();
    return acc;
  }, {});
}

export function useTokenColors() {
  const [tokens, setTokens] = useState(() => readTokens());

  useEffect(() => {
    const refresh = () => setTokens(readTokens());
    const observer = new MutationObserver(refresh);
    // Watch html (for `.dark` toggling) and the atlas root (for data-theme).
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    const scope = findScope();
    if (scope && scope !== document.documentElement) {
      observer.observe(scope, {
        attributes: true,
        attributeFilter: ['data-theme', 'class'],
      });
    }
    // First paint may settle after fonts/CSS — re-read once.
    const t = window.setTimeout(refresh, 50);
    return () => {
      observer.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  return tokens;
}
