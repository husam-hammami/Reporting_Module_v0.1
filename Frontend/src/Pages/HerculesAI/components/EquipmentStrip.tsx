/**
 * EquipmentStrip - replaces the decorative "6/9 running" donut.
 *
 * Plan spec 5.10. Horizontal row of tiles, one per asset. Tile bg uses the
 * status-100 token, dot inside uses status-600. Click filters the briefing
 * to that asset. Hover tooltip shows asset name + last change.
 */

import { motion, useReducedMotion } from 'framer-motion';
import type { EquipmentStripItem } from '../schemas';

export interface EquipmentStripProps {
  items: EquipmentStripItem[];
  onSelectAsset?: (item: EquipmentStripItem) => void;
  selectedAsset?: string;
  className?: string;
  tileWidth?: number;
  tileHeight?: number;
}

const STATUS_BG: Record<EquipmentStripItem['status'], string> = {
  ok: 'var(--hai-status-ok-100)',
  warn: 'var(--hai-status-warn-100)',
  crit: 'var(--hai-status-crit-100)',
  idle: 'var(--hai-status-idle-100)',
};
const STATUS_DOT: Record<EquipmentStripItem['status'], string> = {
  ok: 'var(--hai-status-ok-600)',
  warn: 'var(--hai-status-warn-600)',
  crit: 'var(--hai-status-crit-600)',
  idle: 'var(--hai-status-idle-600)',
};

function formatLastChange(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function EquipmentStrip(props: EquipmentStripProps) {
  const {
    items,
    onSelectAsset,
    selectedAsset,
    className,
    tileWidth = 24,
    tileHeight = 24,
  } = props;

  const prefersReducedMotion = useReducedMotion();

  const runningCount = items.filter((i) => i.status === 'ok').length;
  const total = items.length;

  if (total === 0) {
    return null;
  }

  return (
    <section className={className} aria-label="Equipment status">
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--hai-space-2)',
        }}
      >
        <span className="hai-text-heading-lg text-hai-tertiary">Equipment</span>
        <span className="hai-text-label text-hai-tertiary hai-num">
          {runningCount} of {total} running
        </span>
      </header>

      <div
        role="list"
        style={{
          display: 'flex',
          gap: 'var(--hai-space-1)',
          flexWrap: 'wrap',
        }}
      >
        {items.map((item, i) => {
          const selected = selectedAsset === item.asset_name;
          const title = `${item.asset_name} — ${item.status}${
            item.last_change ? ` (since ${formatLastChange(item.last_change)})` : ''
          }`;
          return (
            <motion.button
              key={`${item.asset_short}-${i}`}
              type="button"
              role="listitem"
              title={title}
              aria-label={title}
              onClick={onSelectAsset ? () => onSelectAsset(item) : undefined}
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.3,
                delay: prefersReducedMotion ? 0 : i * 0.04,
                ease: [0.25, 1, 0.5, 1],
              }}
              style={{
                width: tileWidth,
                height: tileHeight,
                minWidth: 44,
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 2,
                backgroundColor: STATUS_BG[item.status],
                border: `1px solid ${selected ? 'var(--hai-surface-border-strong)' : 'var(--hai-surface-border)'}`,
                borderRadius: 'var(--hai-radius-sm)',
                cursor: onSelectAsset ? 'pointer' : 'default',
                padding: 2,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '999px',
                  backgroundColor: STATUS_DOT[item.status],
                }}
              />
              <span
                className="hai-text-caption text-hai-tertiary"
                style={{
                  fontSize: '0.625rem',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.asset_short}
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
