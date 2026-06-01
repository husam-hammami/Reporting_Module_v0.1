/**
 * SparklineInline — trend hint, not a chart.
 *
 * Plan spec 5.9. 60 × 20 px, no axes, no tooltip. Stroke colour derived from
 * slope × polarity so a "good" trend reads green and a "bad" trend reads red,
 * matching the sibling DeltaPill.
 *
 * Implementation note: the plan permits a lightweight custom SVG path instead
 * of uplot for this component (uplot renders to canvas, which makes the
 * stroke-dasharray draw-on-mount animation much harder). This SVG path is
 * tiny, supports the required mount animation, and stays aria-hidden.
 */

import { useId, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { DeltaPolarity } from '../schemas';

export interface SparklineInlineProps {
  data: number[];
  width?: number;
  height?: number;
  polarity?: DeltaPolarity;
  className?: string;
}

function buildPath(
  points: number[],
  width: number,
  height: number,
  paddingY: number,
): { d: string; slope: 'up' | 'down' | 'flat'; lastX: number; lastY: number } {
  const n = points.length;
  if (n === 0) {
    return { d: '', slope: 'flat', lastX: 0, lastY: height / 2 };
  }
  if (n === 1) {
    const y = height / 2;
    return { d: `M0,${y} L${width},${y}`, slope: 'flat', lastX: width, lastY: y };
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const innerH = height - paddingY * 2;
  const xStep = width / (n - 1);

  const coords = points.map((v, i) => {
    const x = i * xStep;
    const y = paddingY + innerH - ((v - min) / range) * innerH;
    return [x, y] as const;
  });

  const d = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');

  const first = points[0];
  const last = points[n - 1];
  const diff = last - first;
  const slope: 'up' | 'down' | 'flat' =
    Math.abs(diff) / (range || 1) < 0.02 ? 'flat' : diff > 0 ? 'up' : 'down';

  const lastCoord = coords[coords.length - 1]!;
  return { d, slope, lastX: lastCoord[0], lastY: lastCoord[1] };
}

function resolveStrokeColor(
  slope: 'up' | 'down' | 'flat',
  polarity: DeltaPolarity,
): string {
  if (slope === 'flat' || polarity === 'neutral') return 'var(--hai-status-idle-600)';
  const good =
    (slope === 'up' && polarity === 'positive') ||
    (slope === 'down' && polarity === 'negative');
  return good ? 'var(--hai-status-ok-600)' : 'var(--hai-status-crit-600)';
}

export function SparklineInline(props: SparklineInlineProps) {
  const {
    data,
    width = 60,
    height = 20,
    polarity = 'neutral',
    className,
  } = props;

  const prefersReducedMotion = useReducedMotion();
  const animId = useId();

  const { d, slope, lastX, lastY } = useMemo(
    () => buildPath(data, width, height, 2),
    [data, width, height],
  );

  if (!d) return null;

  const color = resolveStrokeColor(slope, polarity);

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      {!prefersReducedMotion && (
        <style>{`
          @keyframes hai-spark-draw-${animId.replace(/[^a-zA-Z0-9]/g, '')} {
            from { stroke-dashoffset: 200; }
            to   { stroke-dashoffset: 0; }
          }
        `}</style>
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          prefersReducedMotion
            ? undefined
            : {
                strokeDasharray: 200,
                strokeDashoffset: 0,
                animation: `hai-spark-draw-${animId.replace(
                  /[^a-zA-Z0-9]/g,
                  '',
                )} 300ms cubic-bezier(0.25, 1, 0.5, 1) both`,
              }
        }
      />
      <circle cx={lastX} cy={lastY} r={2} fill={color} />
    </svg>
  );
}
