/**
 * PowerFactorGauge — hard-target visual for bounded ratios.
 *
 * Plan spec 5.6. 120° arc with three coloured zones (crit / warn / ok),
 * pointer, tick at target, centre number in display-md. Mount animation:
 * pointer sweeps from min to value over 700 ms. Updates snap.
 */

import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

export interface PowerFactorGaugeProps {
  value: number | null;
  target: number;
  penaltyThreshold: number;
  min?: number;
  max?: number;
  unit?: string;
  width?: number;
  height?: number;
  className?: string;
}

const ARC_SPAN_DEG = 120; // total arc span
const ARC_START_DEG = -150; // where the arc begins (left of 12-o'clock)

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  const sweep = endDeg > startDeg ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x.toFixed(
    2,
  )} ${end.y.toFixed(2)}`;
}

function valueToDeg(v: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, v));
  const frac = (clamped - min) / (max - min || 1);
  return ARC_START_DEG + frac * ARC_SPAN_DEG;
}

export function PowerFactorGauge(props: PowerFactorGaugeProps) {
  const {
    value,
    target,
    penaltyThreshold,
    min = 0.7,
    max = 1.0,
    unit = 'PF',
    width = 180,
    height = 100,
    className,
  } = props;

  const prefersReducedMotion = useReducedMotion();

  const cx = width / 2;
  const cy = height - 10; // anchor pivot near bottom
  const r = Math.min(width / 2 - 6, height - 20);

  const penaltyDeg = valueToDeg(penaltyThreshold, min, max);
  const targetDeg = valueToDeg(target, min, max);
  const endDeg = ARC_START_DEG + ARC_SPAN_DEG;

  const pointerDeg = useMemo(() => {
    if (value === null) return ARC_START_DEG;
    return valueToDeg(value, min, max);
  }, [value, min, max]);

  const outOfRange =
    value !== null && (value < min - 1e-9 || value > max + 1e-9);
  const caption = outOfRange
    ? value! < min
      ? '⚠ below range'
      : 'above range'
    : null;

  const valueColor =
    value === null
      ? 'var(--hai-text-tertiary)'
      : value < penaltyThreshold
      ? 'var(--hai-status-crit-600)'
      : value < target
      ? 'var(--hai-status-warn-600)'
      : 'var(--hai-status-ok-600)';

  return (
    <div className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="meter"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-label={`Power factor ${value !== null ? value.toFixed(2) : 'unknown'}, target ${target.toFixed(2)}`}
      >
        {/* zones */}
        <path
          d={arcPath(cx, cy, r, ARC_START_DEG, penaltyDeg)}
          fill="none"
          stroke="var(--hai-status-crit-600)"
          strokeWidth={10}
          strokeLinecap="butt"
          opacity={0.85}
        />
        <path
          d={arcPath(cx, cy, r, penaltyDeg, targetDeg)}
          fill="none"
          stroke="var(--hai-status-warn-600)"
          strokeWidth={10}
          strokeLinecap="butt"
          opacity={0.85}
        />
        <path
          d={arcPath(cx, cy, r, targetDeg, endDeg)}
          fill="none"
          stroke="var(--hai-status-ok-600)"
          strokeWidth={10}
          strokeLinecap="butt"
          opacity={0.85}
        />

        {/* target tick */}
        {(() => {
          const inner = polar(cx, cy, r - 8, targetDeg);
          const outer = polar(cx, cy, r + 8, targetDeg);
          return (
            <line
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--hai-text-primary)"
              strokeWidth={2}
            />
          );
        })()}

        {/* pointer */}
        <motion.g
          initial={prefersReducedMotion ? false : { rotate: ARC_START_DEG - pointerDeg }}
          animate={{ rotate: 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.7,
            ease: [0.25, 1, 0.5, 1],
          }}
          style={{ transformBox: 'fill-box', transformOrigin: `${cx}px ${cy}px` }}
        >
          {(() => {
            const tip = polar(cx, cy, r - 2, pointerDeg);
            return (
              <>
                <line
                  x1={cx}
                  y1={cy}
                  x2={tip.x}
                  y2={tip.y}
                  stroke="var(--hai-text-primary)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <circle cx={cx} cy={cy} r={4} fill="var(--hai-text-primary)" />
              </>
            );
          })()}
        </motion.g>
      </svg>

      <div
        className="hai-text-display-md hai-num"
        style={{ color: valueColor, marginTop: 'calc(-1 * var(--hai-space-6))' }}
      >
        {value === null ? '—' : value.toFixed(2)}
      </div>
      <div className="hai-text-label text-hai-tertiary">{unit}</div>
      {caption ? (
        <div className="hai-text-caption text-hai-crit" style={{ marginTop: 'var(--hai-space-1)' }}>
          {caption}
        </div>
      ) : null}
    </div>
  );
}
