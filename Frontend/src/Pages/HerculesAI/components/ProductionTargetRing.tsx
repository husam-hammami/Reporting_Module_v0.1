/**
 * ProductionTargetRing — today's output toward today's target.
 *
 * Plan spec 5.7. 160 px circle, 12 px ring. Colour by pace vs time-elapsed
 * fraction. Faint pace-marker notch. Centre shows produced value, target
 * subtitle, pace verdict.
 */

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface ProductionTargetRingProps {
  produced: number;
  target: number;
  unit: string;
  timeElapsedFraction: number; // 0..1
  size?: number;
  thickness?: number;
  className?: string;
}

function formatAmount(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return Math.round(n).toLocaleString();
}

function hoursBehind(produced: number, target: number, timeElapsedFraction: number): number {
  // assume 24-hour day for pace estimate; caller can always pre-compute if different
  const expected = target * timeElapsedFraction;
  const deficit = expected - produced;
  if (deficit <= 0) return 0;
  const ratePerHour = target / 24;
  return deficit / (ratePerHour || 1);
}

export function ProductionTargetRing(props: ProductionTargetRingProps) {
  const {
    produced,
    target,
    unit,
    timeElapsedFraction,
    size = 160,
    thickness = 12,
    className,
  } = props;

  const prefersReducedMotion = useReducedMotion();

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  const progress = target > 0 ? Math.max(0, Math.min(1, produced / target)) : 0;
  const elapsed = Math.max(0, Math.min(1, timeElapsedFraction));

  const { ringColor, paceLabel, paceColor } = useMemo(() => {
    const ratio = target > 0 ? produced / target : 0;
    if (ratio >= elapsed) {
      return {
        ringColor: 'var(--hai-status-ok-600)',
        paceLabel: 'on pace',
        paceColor: 'var(--hai-status-ok-600)',
      };
    }
    if (ratio >= elapsed - 0.05) {
      return {
        ringColor: 'var(--hai-status-warn-600)',
        paceLabel: 'slightly behind',
        paceColor: 'var(--hai-status-warn-600)',
      };
    }
    const hrs = hoursBehind(produced, target, elapsed);
    const hh = Math.floor(hrs);
    const mm = Math.round((hrs - hh) * 60);
    return {
      ringColor: 'var(--hai-status-crit-600)',
      paceLabel: `behind by ${hh} h ${mm.toString().padStart(2, '0')} m`,
      paceColor: 'var(--hai-status-crit-600)',
    };
  }, [produced, target, elapsed]);

  // Pace marker notch — position along the circle
  const paceMarker = useMemo(() => {
    const angle = -Math.PI / 2 + elapsed * 2 * Math.PI; // start at top
    const rOuter = r + thickness / 2 + 2;
    const rInner = r - thickness / 2 - 2;
    return {
      x1: cx + Math.cos(angle) * rInner,
      y1: cy + Math.sin(angle) * rInner,
      x2: cx + Math.cos(angle) * rOuter,
      y2: cy + Math.sin(angle) * rOuter,
    };
  }, [cx, cy, r, thickness, elapsed]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={produced}
      aria-label={`Produced ${formatAmount(produced)} of ${formatAmount(target)} ${unit} target, ${paceLabel}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--hai-surface-300)"
          strokeWidth={thickness}
        />
        {/* progress */}
        <motion.circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeDasharray={circumference}
          initial={
            prefersReducedMotion
              ? { strokeDashoffset: circumference * (1 - progress) }
              : { strokeDashoffset: circumference }
          }
          animate={{ strokeDashoffset: circumference * (1 - progress) }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.7,
            ease: [0.25, 1, 0.5, 1],
          }}
        />
        {/* pace marker notch */}
        <line
          x1={paceMarker.x1}
          y1={paceMarker.y1}
          x2={paceMarker.x2}
          y2={paceMarker.y2}
          stroke="var(--hai-text-tertiary)"
          strokeWidth={1.5}
          opacity={0.7}
        />
      </svg>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--hai-space-1)',
          textAlign: 'center',
        }}
      >
        <span className="hai-text-display-md hai-num text-hai-primary" style={{ lineHeight: 1 }}>
          {formatAmount(produced)}
        </span>
        <span className="hai-text-label text-hai-tertiary">{unit}</span>
        <span className="hai-text-body-sm text-hai-tertiary hai-num">
          of {formatAmount(target)} {unit}
        </span>
        <span
          className="hai-text-body-sm"
          style={{ color: paceColor, marginTop: 'var(--hai-space-1)' }}
        >
          {paceLabel}
        </span>
      </div>
    </div>
  );
}
