/**
 * StatusBadge — atomic severity marker.
 *
 * Plan spec 5.1. 8 px circle (6 px in sm), optional label in text/label style.
 * Pulse on warn/crit where the caller asks for it; reduced motion collapses
 * to a static 0.75 opacity.
 */

import { useReducedMotion } from 'framer-motion';
import type { StatusLevelWithIdle } from '../schemas';

export interface StatusBadgeProps {
  level: StatusLevelWithIdle | 'info';
  label?: string;
  pulse?: boolean;
  size?: 'sm' | 'md';
  /**
   * Optional pixel override for the dot diameter. Used by StatusHero which
   * needs a larger 48 px dot than the standard sm/md sizes.
   */
  dotSizePx?: number;
  className?: string;
}

const LEVEL_COLOR_VAR: Record<StatusBadgeProps['level'], string> = {
  ok: 'var(--hai-status-ok-600)',
  warn: 'var(--hai-status-warn-600)',
  crit: 'var(--hai-status-crit-600)',
  info: 'var(--hai-status-info-600)',
  idle: 'var(--hai-status-idle-600)',
};

export function StatusBadge(props: StatusBadgeProps) {
  const { level, label, pulse = false, size = 'md', dotSizePx, className } = props;
  const prefersReducedMotion = useReducedMotion();

  const baseSize = size === 'sm' ? 6 : 8;
  const diameter = dotSizePx ?? baseSize;
  const color = LEVEL_COLOR_VAR[level];

  const shouldAnimate = pulse && !prefersReducedMotion;

  return (
    <span
      className={['inline-flex items-center', className].filter(Boolean).join(' ')}
      style={{ gap: 'var(--hai-space-2)' }}
    >
      <span
        aria-hidden="true"
        style={{
          width: diameter,
          height: diameter,
          borderRadius: '999px',
          backgroundColor: color,
          display: 'inline-block',
          flexShrink: 0,
          opacity: pulse && prefersReducedMotion ? 0.75 : 1,
          animation: shouldAnimate ? 'hai-status-pulse 2s ease-in-out infinite' : undefined,
        }}
      />
      {label ? (
        <span className="hai-text-label text-hai-secondary">{label}</span>
      ) : null}
      <style>{`
        @keyframes hai-status-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
      `}</style>
    </span>
  );
}
