/**
 * MetricCard — the foundation. Every metric surface in the briefing is this.
 *
 * Plan spec 5.3. Label + hero number + unit + DeltaPill + SparklineInline +
 * optional subtitle. Handles default / hover / focus / loading / empty /
 * error / value-changed states. Number never scrubs; a bg flash confirms
 * value change. Number-too-big falls back to SI suffix.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Delta } from '../schemas';
import { DeltaPill } from './DeltaPill';
import { SparklineInline } from './SparklineInline';
import { LoadingState } from './LoadingState';

export type MetricCardState = 'default' | 'loading' | 'empty' | 'error';
export type MetricCardSize = 'sm' | 'md' | 'lg';

export interface MetricCardProps {
  label: string;
  value: number | string | null;
  unit: string;
  delta?: Delta | null;
  sparkline?: number[];
  status?: 'ok' | 'warn' | 'crit';
  subtitle?: string;
  onClick?: () => void;
  precision?: number;
  size?: MetricCardSize;
  state?: MetricCardState;
  onRetry?: () => void;
  className?: string;
}

const SIZE_HEIGHT: Record<MetricCardSize, number> = {
  sm: 88,
  md: 104,
  lg: 140,
};

function formatValue(value: number | string | null, precision?: number): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '—';

  const abs = Math.abs(value);
  // SI suffix for > 8 digits after locale grouping
  if (abs >= 1e9) return `${(value / 1e9).toFixed(precision ?? 2)}B`;
  if (abs >= 1e6 && abs >= 10_000_000) return `${(value / 1e6).toFixed(precision ?? 2)}M`;

  const opts: Intl.NumberFormatOptions =
    typeof precision === 'number'
      ? { minimumFractionDigits: precision, maximumFractionDigits: precision }
      : {};
  return value.toLocaleString(undefined, opts);
}

function toDeltaPillProps(delta: Delta) {
  return {
    pct: delta.pct,
    direction: delta.direction,
    polarity: delta.polarity,
    baselineLabel: delta.baseline_label,
    textOverride: delta.text_override,
  };
}

export function MetricCard(props: MetricCardProps) {
  const {
    label,
    value,
    unit,
    delta,
    sparkline,
    status,
    subtitle,
    onClick,
    precision,
    size = 'md',
    state = 'default',
    onRetry,
    className,
  } = props;

  const prefersReducedMotion = useReducedMotion();
  const [flash, setFlash] = useState(false);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prevValueRef.current !== value && state === 'default') {
      setFlash(true);
      const t = window.setTimeout(() => setFlash(false), 400);
      prevValueRef.current = value;
      return () => window.clearTimeout(t);
    }
    prevValueRef.current = value;
    return undefined;
  }, [value, state]);

  const formatted = useMemo(() => formatValue(value, precision), [value, precision]);

  const isInteractive = typeof onClick === 'function' && state === 'default';

  const a11yLabel = useMemo(() => {
    if (state !== 'default') return `${label}: ${state}`;
    const deltaText = delta
      ? `, ${delta.direction} ${
          delta.pct !== null ? Math.abs(delta.pct).toFixed(1) : ''
        }${delta.pct !== null ? ' percent' : ''} ${delta.baseline_label}`
      : '';
    const tail = isInteractive ? '. Activate to open details.' : '';
    return `${label}: ${formatted} ${unit}${deltaText}${tail}`;
  }, [label, formatted, unit, delta, isInteractive, state]);

  // Container style — flash uses info tint
  const containerStyle: React.CSSProperties = {
    backgroundColor: flash ? 'var(--hai-status-info-100)' : 'var(--hai-surface-100)',
    border: '1px solid var(--hai-surface-border)',
    borderRadius: 'var(--hai-radius-lg)',
    boxShadow: 'var(--hai-elev-1)',
    padding: 'var(--hai-space-3)',
    minHeight: SIZE_HEIGHT[size],
    transition: prefersReducedMotion
      ? undefined
      : `background-color var(--hai-motion-medium) var(--hai-ease-out-quart), box-shadow var(--hai-motion-micro) var(--hai-ease-out-quart), border-color var(--hai-motion-micro) var(--hai-ease-out-quart)`,
    color: 'var(--hai-text-primary)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--hai-space-3)',
    width: '100%',
    textAlign: 'left',
    cursor: isInteractive ? 'pointer' : 'default',
  };

  // Loading skeleton
  if (state === 'loading') {
    return (
      <div className={className} style={containerStyle}>
        <LoadingState shape="line" width="40%" height={10} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--hai-space-3)' }}>
          <LoadingState shape="block" width={140} height={40} />
          <LoadingState shape="pill" width={56} height={22} />
        </div>
        <LoadingState shape="line" width={60} height={20} />
      </div>
    );
  }

  // Error
  if (state === 'error') {
    return (
      <div className={className} style={containerStyle}>
        <div className="hai-text-label text-hai-tertiary" title={label}>
          {label}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hai-space-3)' }}>
          <TriangleAlert
            size={28}
            aria-hidden="true"
            style={{ color: 'var(--hai-status-warn-600)' }}
          />
          <span className="hai-text-body text-hai-secondary">Tag read failed</span>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="hai-text-body-sm text-hai-info"
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              alignSelf: 'flex-start',
            }}
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  // Empty
  if (state === 'empty') {
    return (
      <div className={className} style={containerStyle}>
        <div className="hai-text-label text-hai-tertiary" title={label}>
          {label}
        </div>
        <div
          className="hai-text-display-xl hai-num text-hai-tertiary"
          style={{ lineHeight: 1 }}
        >
          —
        </div>
        <div className="hai-text-body-sm text-hai-tertiary">
          {subtitle ?? 'No readings in this period'}
        </div>
      </div>
    );
  }

  const body = (
    <>
      <div
        className="hai-text-label text-hai-tertiary"
        title={label}
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 'var(--hai-space-3)',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--hai-space-2)',
            minWidth: 0,
          }}
        >
          <span
            className="hai-text-display-xl hai-num text-hai-primary"
            style={{
              color: status ? `var(--hai-status-${status}-600)` : 'var(--hai-text-primary)',
              lineHeight: 1,
              fontSize: size === 'lg' ? '2rem' : size === 'md' ? '1.75rem' : undefined,
            }}
          >
            {formatted}
          </span>
          <span className="hai-text-label text-hai-tertiary">{unit}</span>
        </div>
        {delta ? <DeltaPill {...toDeltaPillProps(delta)} /> : null}
      </div>

      {sparkline && sparkline.length > 1 ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
          <SparklineInline data={sparkline} polarity={delta?.polarity ?? 'neutral'} />
        </div>
      ) : null}

      {subtitle ? (
        <div className="hai-text-body-sm text-hai-tertiary">{subtitle}</div>
      ) : null}
    </>
  );

  // Default (interactive)
  if (isInteractive) {
    return (
      <motion.button
        type="button"
        className={className}
        style={containerStyle}
        onClick={onClick}
        aria-label={a11yLabel}
        whileHover={
          prefersReducedMotion
            ? undefined
            : {
                boxShadow: 'var(--hai-elev-2)',
                borderColor: 'var(--hai-surface-border-strong)',
              }
        }
        initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.25, 1, 0.5, 1] }}
      >
        {body}
      </motion.button>
    );
  }

  // Default (static)
  return (
    <motion.div
      className={className}
      style={containerStyle}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.25, 1, 0.5, 1] }}
    >
      {body}
    </motion.div>
  );
}
