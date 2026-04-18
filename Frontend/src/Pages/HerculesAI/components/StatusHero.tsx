/**
 * StatusHero — five-second verdict. One per briefing.
 *
 * Plan spec 5.2. Level-pulsing dot + short verdict + period + freshness pill.
 * Background is surface/100 with a 2 % overlay of the status tint. Pulse is
 * off when level === 'ok' (steady green is calmer).
 */

import { useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { StatusLevel } from '../schemas';
import { StatusBadge } from './StatusBadge';
import { LoadingState } from './LoadingState';

export type StatusHeroState = 'default' | 'loading' | 'error';

export interface StatusHeroProps {
  level: StatusLevel;
  verdict: string;
  period: { from: string; to: string; label: string };
  generatedAt: string; // ISO
  dataAgeMinutes: number;
  state?: StatusHeroState;
  onRetry?: () => void;
  className?: string;
}

function freshnessTone(mins: number): 'ok' | 'warn' | 'crit' {
  if (mins < 15) return 'ok';
  if (mins <= 60) return 'warn';
  return 'crit';
}

function freshnessLabel(mins: number): string {
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.round(mins)} min ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${hrs.toFixed(1)} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function formatGenerated(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function StatusHero(props: StatusHeroProps) {
  const {
    level,
    verdict,
    period,
    generatedAt,
    dataAgeMinutes,
    state = 'default',
    onRetry,
    className,
  } = props;

  const prefersReducedMotion = useReducedMotion();

  const tint = useMemo(() => {
    // 2% overlay of the status tint over surface/100
    const colorVar =
      level === 'ok'
        ? '--hai-status-ok-600'
        : level === 'warn'
        ? '--hai-status-warn-600'
        : '--hai-status-crit-600';
    return `color-mix(in oklab, var(${colorVar}) 4%, var(--hai-surface-100))`;
  }, [level]);

  const freshTone = freshnessTone(dataAgeMinutes);

  const bandStyle: React.CSSProperties = {
    backgroundColor: tint,
    border: '1px solid var(--hai-surface-border)',
    borderRadius: 'var(--hai-radius-xl)',
    boxShadow: 'var(--hai-elev-2)',
    padding: 'var(--hai-space-6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--hai-space-6)',
    width: '100%',
  };

  if (state === 'loading') {
    return (
      <div className={className} style={bandStyle} role="status" aria-live="polite">
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--hai-space-5)', flex: 1 }}
        >
          <LoadingState shape="circle" width={48} height={48} />
          <LoadingState shape="line" width="60%" height={36} />
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={className} style={bandStyle} role="alert">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--hai-space-5)' }}>
          <StatusBadge level="idle" dotSizePx={24} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hai-space-1)' }}>
            <span className="hai-text-heading-md text-hai-secondary">
              Unable to generate briefing — last successful run 2 hrs ago
            </span>
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
        </div>
      </div>
    );
  }

  const shouldPulse = level !== 'ok';

  return (
    <div
      className={className}
      style={bandStyle}
      role="status"
      aria-live="polite"
      aria-label={`Plant status ${level}. ${verdict}. Data age ${freshnessLabel(dataAgeMinutes)}.`}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--hai-space-5)',
          flex: 1,
          minWidth: 0,
        }}
      >
        <StatusBadge level={level} pulse={shouldPulse} dotSizePx={24} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={verdict}
            className="hai-text-primary"
            style={{
              fontFamily: 'var(--hai-font-sans)',
              fontSize: '1.25rem',
              fontWeight: 620,
              lineHeight: 1.3,
              letterSpacing: '-0.01em',
            }}
            initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.25, 1, 0.5, 1] }}
          >
            {verdict}
          </motion.span>
        </AnimatePresence>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 'var(--hai-space-1)',
          textAlign: 'end',
          flexShrink: 0,
        }}
      >
        <span className="hai-text-label text-hai-tertiary" title={`${period.from} → ${period.to}`}>
          {period.label}
        </span>
        <span className="hai-text-body-sm text-hai-secondary hai-num">
          {formatGenerated(generatedAt)}
        </span>
        <span
          className="hai-text-caption rounded-hai-sm"
          style={{
            backgroundColor: `var(--hai-status-${freshTone}-100)`,
            color: `var(--hai-status-${freshTone}-600)`,
            padding: '2px var(--hai-space-2)',
          }}
        >
          {freshnessLabel(dataAgeMinutes)}
        </span>
      </div>
    </div>
  );
}
