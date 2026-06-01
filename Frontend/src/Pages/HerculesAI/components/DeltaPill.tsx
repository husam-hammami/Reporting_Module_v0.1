/**
 * DeltaPill — atomic comparison primitive.
 *
 * Plan spec 5.4. Wherever a number appears, a DeltaPill sits next to it.
 * Clamps at ±500 %; above that renders "+500%+". Colour follows direction ×
 * polarity. Arrow glyphs never flip under RTL (they are spatial-semantic).
 */

import { ArrowDown, ArrowUp, Minus, Activity } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Delta } from '../schemas';

export interface DeltaPillProps extends Omit<Delta, 'baseline_label' | 'text_override'> {
  baselineLabel: string;
  textOverride?: string;
  className?: string;
}

type ChipTone = 'ok' | 'warn' | 'crit' | 'idle' | 'info';

function resolveTone(direction: Delta['direction'], polarity: Delta['polarity']): ChipTone {
  if (direction === 'idle-to-active') return 'info';
  if (direction === 'flat') return 'idle';
  if (polarity === 'neutral') return 'idle';

  const good =
    (direction === 'up' && polarity === 'positive') ||
    (direction === 'down' && polarity === 'negative');
  return good ? 'ok' : 'crit';
}

const TONE_BG: Record<ChipTone, string> = {
  ok: 'var(--hai-status-ok-100)',
  warn: 'var(--hai-status-warn-100)',
  crit: 'var(--hai-status-crit-100)',
  info: 'var(--hai-status-info-100)',
  idle: 'var(--hai-status-idle-100)',
};
const TONE_FG: Record<ChipTone, string> = {
  ok: 'var(--hai-status-ok-600)',
  warn: 'var(--hai-status-warn-600)',
  crit: 'var(--hai-status-crit-600)',
  info: 'var(--hai-status-info-600)',
  idle: 'var(--hai-status-idle-600)',
};

function formatPct(pct: number): string {
  const abs = Math.abs(pct);
  if (abs >= 500) return '+500%+';
  const sign = pct > 0 ? '+' : pct < 0 ? '-' : '';
  const rounded = abs < 10 ? abs.toFixed(1) : Math.round(abs).toString();
  return `${sign}${rounded}%`;
}

export function DeltaPill(props: DeltaPillProps) {
  const { pct, direction, polarity, baselineLabel, textOverride, className } = props;
  const prefersReducedMotion = useReducedMotion();

  // idle-to-active OR null-pct uses text override
  const useOverride = direction === 'idle-to-active' || pct === null;
  const tone = resolveTone(direction, polarity);

  let Icon = Minus;
  if (direction === 'up') Icon = ArrowUp;
  else if (direction === 'down') Icon = ArrowDown;
  else if (direction === 'idle-to-active') Icon = Activity;

  const text = useOverride
    ? textOverride ?? (direction === 'idle-to-active' ? 'was idle, now active' : '—')
    : pct !== null
    ? formatPct(pct)
    : '—';

  return (
    <motion.span
      className={[
        'inline-flex items-center rounded-hai-sm hai-num',
        'hai-text-caption',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        backgroundColor: TONE_BG[tone],
        color: TONE_FG[tone],
        paddingLeft: 'var(--hai-space-2)',
        paddingRight: 'var(--hai-space-2)',
        height: 22,
        gap: 4,
        whiteSpace: 'nowrap',
      }}
      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.2,
        ease: [0.25, 1, 0.5, 1],
      }}
      title={baselineLabel}
      aria-label={`${text} ${baselineLabel}`}
    >
      <Icon size={12} strokeWidth={2.25} aria-hidden="true" />
      <span>{text}</span>
    </motion.span>
  );
}
