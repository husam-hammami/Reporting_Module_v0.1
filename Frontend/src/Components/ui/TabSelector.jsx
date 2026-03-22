/**
 * TabSelector — Generic animated tab switcher with a sliding active indicator.
 *
 * Fully controlled. The sliding pill is measured with offsetLeft/offsetWidth
 * so it always tracks the real rendered size of each tab — no fixed widths needed.
 *
 * Props:
 *   tabs      — [{ id, label, dot?: 'live'|'error'|'warning' }]
 *   activeId  — currently selected tab id
 *   onChange  — (id: string) => void
 *   size      — 'sm' | 'md'  (default 'sm')
 *   className — extra classes on the outer wrapper
 *
 * Accessibility: arrow-key navigation, Home/End keys, role=tablist/tab,
 *   aria-selected, focus follows active tab. Respects prefers-reduced-motion.
 */

import React, { useRef, useState, useLayoutEffect, useCallback } from 'react';

/* ── Constants ───────────────────────────────────────────────────── */

const DOT = {
  live:    { color: 'bg-[#059669] dark:bg-[#34d399]', pulse: true  },
  error:   { color: 'bg-[#ef4444]',                   pulse: false },
  warning: { color: 'bg-[#d97706]',                   pulse: false },
};

const SIZE = {
  sm: { px: 'px-3',   py: 'py-1.5', text: 'text-[11px]' },
  md: { px: 'px-3.5', py: 'py-2',   text: 'text-[12px]' },
};

/* ── Indicator hook ──────────────────────────────────────────────── */

/**
 * Returns { left, width } in px relative to the container's padding edge.
 * Uses offsetLeft/offsetWidth so it stays accurate even when the container
 * is inside a transformed or scrolled ancestor.
 */
function useIndicator(containerRef, tabRefs, activeId, tabs) {
  const [geo, setGeo] = useState({ left: 0, width: 0, ready: false });

  const measure = useCallback(() => {
    const idx = tabs.findIndex((t) => t.id === activeId);
    const el  = tabRefs.current[idx];
    if (!el) return;
    setGeo({ left: el.offsetLeft, width: el.offsetWidth, ready: true });
  }, [activeId, tabs, tabRefs]);

  /* Run after every paint where activeId or tabs change */
  useLayoutEffect(() => { measure(); }, [measure]);

  /* Re-measure when the container is resized (e.g. sidebar open/close) */
  useLayoutEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [containerRef, measure]);

  return geo;
}

/* ══════════════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════════════ */

export default function TabSelector({
  tabs = [],
  activeId,
  onChange,
  size = 'sm',
  className = '',
}) {
  const s = SIZE[size] ?? SIZE.sm;

  /* Single ref on the wrapper — both the ResizeObserver target AND the
     offsetParent used by offsetLeft/offsetWidth calculations. */
  const containerRef = useRef(null);
  const tabRefs      = useRef([]);

  const geo     = useIndicator(containerRef, tabRefs, activeId, tabs);
  const animate = typeof window !== 'undefined'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Keyboard navigation ── */
  const handleKeyDown = useCallback((e) => {
    const idx  = tabs.findIndex((t) => t.id === activeId);
    const last = tabs.length - 1;

    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
    if (e.key === 'ArrowLeft')  next = (idx - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home')       next = 0;
    if (e.key === 'End')        next = last;

    if (next !== -1) {
      e.preventDefault();
      onChange?.(tabs[next].id);
      tabRefs.current[next]?.focus();
    }
  }, [activeId, tabs, onChange]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Time period"
      onKeyDown={handleKeyDown}
      className={[
        /* Positioning context for the sliding indicator */
        'relative inline-flex items-center',
        'p-0.5 rounded-xl',
        'bg-[#f1f5f9] dark:bg-[#0d1e30]',
        'border border-[#e3e9f0] dark:border-[#1e293b]',
        className,
      ].join(' ')}
    >
      {/* ── Sliding background pill ── */}
      {geo.ready && (
        <span
          aria-hidden="true"
          style={{
            position:  'absolute',
            top:       2,
            bottom:    2,
            left:      geo.left,
            width:     geo.width,
            borderRadius: 8,
            pointerEvents: 'none',
            zIndex: 0,
            ...(animate
              ? { transition: 'left 180ms cubic-bezier(0.4,0,0.2,1), width 180ms cubic-bezier(0.4,0,0.2,1)' }
              : {}),
          }}
          className="bg-white dark:bg-[#0a1525] shadow-sm border border-[#e3e9f0] dark:border-[#2a3347]"
        />
      )}

      {/* ── Tab buttons ── */}
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeId;
        const dot      = tab.dot ? DOT[tab.dot] : null;

        return (
          <button
            key={tab.id}
            ref={(el) => { tabRefs.current[i] = el; }}
            role="tab"
            aria-selected={isActive}
            /* tabIndex: only the active tab is in the tab order; others are
               navigated with arrow keys (WAI-ARIA tablist pattern). */
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange?.(tab.id)}
            className={[
              'relative z-10 inline-flex items-center gap-1.5',
              'whitespace-nowrap font-semibold rounded-lg select-none',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-[var(--brand)] focus-visible:ring-offset-1',
              s.px, s.py, s.text,
              animate ? 'transition-[color,transform] duration-150 active:scale-[0.94]' : '',
              isActive
                ? 'text-brand dark:text-brand'
                : 'text-[#6b7f94] dark:text-[#8898aa] hover:text-[#3a4a5c] dark:hover:text-[#c1ccd9]',
            ].join(' ')}
          >
            {/* Status dot (live pulse, error, warning)
                'live' dots keep their DOM space at all times so the tab
                width never changes; they animate in/out via scale+opacity. */}
            {dot && (
              <span
                aria-hidden="true"
                style={tab.dot === 'live' ? {
                  opacity:    isActive ? 1 : 0,
                  transform:  isActive ? 'scale(1)' : 'scale(0.3)',
                  transition: animate
                    ? 'opacity 200ms ease, transform 220ms cubic-bezier(0.34,1.56,0.64,1)'
                    : 'none',
                } : {}}
                className={[
                  'flex-shrink-0 w-1.5 h-1.5 rounded-full',
                  dot.color,
                  dot.pulse && isActive ? 'animate-pulse' : '',
                ].join(' ')}
              />
            )}

            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
