/**
 * TimelineStrip — last 24 h at a glance. Borrowed from video scrubbers.
 *
 * Plan spec 5.11. 80 px tall band. Baseline at 40 px. Shift boundaries are
 * vertical ticks. Events are 8 px pills stacked up to 3 deep. Hover shows
 * timestamp + description. Empty band renders the baseline + caption.
 */

import { useMemo, useRef, useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { OctagonX, Package, TriangleAlert, MessageSquare } from 'lucide-react';
import type { TimelineEvent, ShiftBoundary } from '../schemas';

export interface TimelineStripProps {
  events: TimelineEvent[];
  rangeFrom: Date | string;
  rangeTo: Date | string;
  shifts?: ShiftBoundary[];
  height?: number;
  onSelectEvent?: (ev: TimelineEvent) => void;
  className?: string;
}

const CATEGORY_COLOR: Record<TimelineEvent['category'], string> = {
  shutdown: 'var(--hai-status-crit-600)',
  order_change: 'var(--hai-status-info-600)',
  alarm: 'var(--hai-status-warn-600)',
  note: 'var(--hai-status-idle-600)',
};

function toMs(v: Date | string): number {
  if (v instanceof Date) return v.getTime();
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState<number>(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setW(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function iconForCategory(category: TimelineEvent['category']) {
  switch (category) {
    case 'shutdown':
      return OctagonX;
    case 'order_change':
      return Package;
    case 'alarm':
      return TriangleAlert;
    case 'note':
    default:
      return MessageSquare;
  }
}

export function TimelineStrip(props: TimelineStripProps) {
  const {
    events,
    rangeFrom,
    rangeTo,
    shifts = [],
    height = 80,
    onSelectEvent,
    className,
  } = props;

  const prefersReducedMotion = useReducedMotion();
  const [containerRef, width] = useSize<HTMLDivElement>();

  const fromMs = toMs(rangeFrom);
  const toMsVal = toMs(rangeTo);
  const span = Math.max(1, toMsVal - fromMs);

  const baselineY = height / 2;

  const positions = useMemo(() => {
    return events
      .map((ev, i) => {
        const t = toMs(ev.timestamp);
        if (t < fromMs || t > toMsVal) return null;
        const x = ((t - fromMs) / span) * (width || 1);
        // stack up to 3 deep by simple row assignment
        const row = i % 3;
        const y = baselineY - 16 - row * 14;
        return { ev, x, y, row };
      })
      .filter(Boolean) as Array<{ ev: TimelineEvent; x: number; y: number; row: number }>;
  }, [events, fromMs, toMsVal, span, width, baselineY]);

  const shiftTicks = useMemo(() => {
    return shifts
      .map((s) => {
        const sMs = toMs(s.start);
        if (sMs < fromMs || sMs > toMsVal) return null;
        const x = ((sMs - fromMs) / span) * (width || 1);
        return { x, label: s.label };
      })
      .filter(Boolean) as Array<{ x: number; label: string }>;
  }, [shifts, fromMs, toMsVal, span, width]);

  const [hover, setHover] = useState<null | {
    ev: TimelineEvent;
    x: number;
    y: number;
  }>(null);

  const hasEvents = positions.length > 0;

  return (
    <section
      className={className}
      aria-label="Timeline of events in the last 24 hours"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hai-space-2)' }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="hai-text-heading-lg text-hai-tertiary">Timeline — last 24 h</span>
        {!hasEvents ? (
          <span className="hai-text-caption text-hai-tertiary">
            No events in the last 24 h.
          </span>
        ) : null}
      </header>

      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height,
          backgroundColor: 'var(--hai-surface-100)',
          border: '1px solid var(--hai-surface-border)',
          borderRadius: 'var(--hai-radius-md)',
          overflow: 'hidden',
        }}
      >
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ display: 'block' }}
          >
            <motion.line
              x1={0}
              y1={baselineY}
              x2={width}
              y2={baselineY}
              stroke="var(--hai-surface-border-strong)"
              strokeWidth={1}
              initial={prefersReducedMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.2,
                ease: [0.25, 1, 0.5, 1],
              }}
            />

            {shiftTicks.map((t, i) => (
              <g key={`shift-${i}`}>
                <line
                  x1={t.x}
                  y1={baselineY - 20}
                  x2={t.x}
                  y2={baselineY + 20}
                  stroke="var(--hai-surface-border-strong)"
                  strokeWidth={1}
                  strokeDasharray="2 2"
                />
                <text
                  x={t.x + 4}
                  y={baselineY + 30}
                  fill="var(--hai-text-tertiary)"
                  fontSize={10}
                >
                  {t.label}
                </text>
              </g>
            ))}

            {positions.map(({ ev, x, y }, i) => {
              const Icon = iconForCategory(ev.category);
              return (
                <motion.g
                  key={`${ev.timestamp}-${i}`}
                  initial={prefersReducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.2,
                    delay: prefersReducedMotion ? 0 : 0.2 + i * 0.04,
                  }}
                  onMouseEnter={() => setHover({ ev, x, y })}
                  onMouseLeave={() => setHover(null)}
                  onClick={onSelectEvent ? () => onSelectEvent(ev) : undefined}
                  style={{ cursor: onSelectEvent ? 'pointer' : 'default' }}
                >
                  <rect
                    x={x - 4}
                    y={y - 4}
                    width={8}
                    height={8}
                    rx={2}
                    fill={CATEGORY_COLOR[ev.category]}
                  />
                  <line
                    x1={x}
                    y1={y + 4}
                    x2={x}
                    y2={baselineY}
                    stroke={CATEGORY_COLOR[ev.category]}
                    strokeWidth={1}
                    opacity={0.5}
                  />
                  <Icon
                    x={x - 6}
                    y={y - 18}
                    width={12}
                    height={12}
                    color={CATEGORY_COLOR[ev.category]}
                    aria-hidden
                  />
                </motion.g>
              );
            })}
          </svg>
        ) : null}

        {hover ? (
          <div
            role="tooltip"
            style={{
              position: 'absolute',
              left: Math.min(Math.max(0, hover.x), Math.max(0, width - 220)),
              top: Math.max(4, hover.y - 48),
              backgroundColor: 'var(--hai-surface-300)',
              border: '1px solid var(--hai-surface-border)',
              borderRadius: 'var(--hai-radius-sm)',
              padding: 'var(--hai-space-2)',
              boxShadow: 'var(--hai-elev-2)',
              pointerEvents: 'none',
              maxWidth: 220,
              zIndex: 1,
            }}
          >
            <div className="hai-text-caption text-hai-tertiary hai-num">
              {new Date(hover.ev.timestamp).toLocaleString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                day: 'numeric',
                month: 'short',
              })}
            </div>
            <div className="hai-text-body-sm text-hai-primary">{hover.ev.title}</div>
            {hover.ev.description ? (
              <div className="hai-text-caption text-hai-secondary">{hover.ev.description}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
