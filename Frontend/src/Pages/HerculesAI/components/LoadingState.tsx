/**
 * LoadingState — universal shimmer skeleton.
 *
 * Plan spec 5.12. Shimmer runs `surface/100 → surface/200 → surface/100` over
 * 1.2 s on a translateX transform. Never a spinner, never a progress bar.
 * Consumers pass shape primitives (block, pill, line, circle) so the skeleton
 * matches the component it replaces.
 */

import type { CSSProperties, ReactNode } from 'react';

export type SkeletonShape = 'block' | 'pill' | 'line' | 'circle';

export interface LoadingStateProps {
  /** Shape of the skeleton primitive. Default "block". */
  shape?: SkeletonShape;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** Render a plain div with shimmer and no shape constraints. */
  raw?: boolean;
}

const SHAPE_RADIUS: Record<SkeletonShape, string> = {
  block: 'var(--hai-radius-md)',
  pill: '999px',
  line: '4px',
  circle: '999px',
};

export function LoadingState(props: LoadingStateProps) {
  const {
    shape = 'block',
    width,
    height,
    className,
    style,
    children,
    raw = false,
  } = props;

  const baseStyle: CSSProperties = {
    width: width ?? '100%',
    height: height ?? (shape === 'line' ? 8 : shape === 'pill' ? 22 : shape === 'circle' ? 24 : 16),
    borderRadius: raw ? undefined : SHAPE_RADIUS[shape],
    background:
      'linear-gradient(90deg, var(--hai-surface-100) 0%, var(--hai-surface-200) 50%, var(--hai-surface-100) 100%)',
    backgroundSize: '200% 100%',
    animation: 'hai-skeleton-shimmer 1.2s cubic-bezier(0.65, 0, 0.35, 1) infinite',
    ...style,
  };

  return (
    <div
      className={className}
      style={baseStyle}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <style>{`
        @keyframes hai-skeleton-shimmer {
          0%   { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-hai-skeleton] { animation: none !important; }
        }
      `}</style>
      {children}
    </div>
  );
}
