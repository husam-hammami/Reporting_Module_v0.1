/**
 * AssetPanel — unit of organisation. Replaces the per-report card flock.
 *
 * Plan spec 5.8. Collapsed strip shows asset name, status, 2 headline metrics
 * as inline chips. Expanded shows a responsive metric grid, notes, and related
 * report chips. Expansion state persists in localStorage per asset. If
 * `autoExpand` is true (caller passes this when an AttentionItem targets the
 * asset), the panel auto-expands unless the user has explicitly collapsed it.
 */

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import type { AssetPanelData, MetricPayload } from '../schemas';
import { StatusBadge } from './StatusBadge';
import { MetricCard, type MetricCardProps } from './MetricCard';
import { useRtl } from './useRtl';

export interface AssetPanelProps {
  data: AssetPanelData;
  autoExpand?: boolean;
  onSelectReport?: (reportId: number) => void;
  className?: string;
}

const LS_PREFIX = 'hai:asset:';

function metricPayloadToCardProps(m: MetricPayload, size: MetricCardProps['size'] = 'md'): MetricCardProps {
  return {
    label: m.label,
    value: m.value ?? null,
    unit: m.unit,
    delta: m.delta ?? undefined,
    sparkline: m.sparkline,
    status: m.status,
    precision: m.precision,
    size,
  };
}

function readStored(name: string): boolean | null {
  try {
    const v = window.localStorage.getItem(`${LS_PREFIX}${name}:expanded`);
    if (v === '1') return true;
    if (v === '0') return false;
    return null;
  } catch {
    return null;
  }
}

function writeStored(name: string, expanded: boolean): void {
  try {
    window.localStorage.setItem(`${LS_PREFIX}${name}:expanded`, expanded ? '1' : '0');
  } catch {
    /* ignore quota / SSR */
  }
}

export function AssetPanel(props: AssetPanelProps) {
  const { data, autoExpand = false, onSelectReport, className } = props;
  const prefersReducedMotion = useReducedMotion();
  const { isRtl } = useRtl();

  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return autoExpand;
    const stored = readStored(data.name);
    if (stored !== null) return stored;
    return autoExpand;
  });

  // If autoExpand becomes true AND user has no explicit override stored,
  // expand.
  useEffect(() => {
    if (!autoExpand) return;
    if (typeof window === 'undefined') return;
    const stored = readStored(data.name);
    if (stored === null) setExpanded(true);
  }, [autoExpand, data.name]);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      writeStored(data.name, next);
      return next;
    });
  };

  const headlineMetrics = data.headline_metrics.slice(0, 2);
  const fullMetrics = data.full_metrics;

  const headingId = useMemo(
    () => `hai-asset-${data.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    [data.name],
  );

  return (
    <section
      aria-labelledby={headingId}
      className={className}
      style={{
        backgroundColor: 'var(--hai-surface-100)',
        border: '1px solid var(--hai-surface-border)',
        borderRadius: 'var(--hai-radius-lg)',
        boxShadow: 'var(--hai-elev-1)',
        overflow: 'hidden',
      }}
    >
      <motion.button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={`${headingId}-body`}
        layout
        style={{
          width: '100%',
          minHeight: 56,
          padding: 'var(--hai-space-3) var(--hai-space-5)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--hai-space-4)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--hai-text-primary)',
          textAlign: isRtl ? 'right' : 'left',
        }}
      >
        <motion.span
          aria-hidden="true"
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.2,
            ease: [0.65, 0, 0.35, 1],
          }}
          style={{
            display: 'inline-flex',
            color: 'var(--hai-text-tertiary)',
            transform: isRtl ? 'scaleX(-1)' : undefined,
          }}
        >
          <ChevronRight size={16} />
        </motion.span>

        <span id={headingId} className="hai-text-heading-md text-hai-primary">
          {data.name}
        </span>

        <StatusBadge level={data.status} />

        <div
          style={{
            marginInlineStart: 'auto',
            display: 'flex',
            gap: 'var(--hai-space-3)',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {headlineMetrics.map((m, i) => (
            <HeadlineChip key={`${m.label}-${i}`} metric={m} />
          ))}
        </div>
      </motion.button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={`${headingId}-body`}
            key="body"
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.2,
              ease: [0.65, 0, 0.35, 1],
            }}
            style={{ overflow: 'hidden' }}
          >
            <div
              style={{
                padding: 'var(--hai-space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--hai-space-3)',
                borderTop: '1px solid var(--hai-surface-border)',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gap: 'var(--hai-space-3)',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                }}
              >
                {fullMetrics.map((m, i) => (
                  <MetricCard key={`${m.label}-${i}`} {...metricPayloadToCardProps(m)} />
                ))}
              </div>

              {data.notes && data.notes.length > 0 ? (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--hai-space-2)',
                  }}
                >
                  {data.notes.map((note, i) => (
                    <li
                      key={i}
                      className="hai-text-body text-hai-secondary"
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 'var(--hai-space-2)',
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-block',
                          width: 4,
                          height: 4,
                          backgroundColor: 'var(--hai-text-tertiary)',
                          marginTop: 10,
                          flexShrink: 0,
                        }}
                      />
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {data.related_report_ids && data.related_report_ids.length > 0 ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--hai-space-2)',
                  }}
                >
                  {data.related_report_ids.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={onSelectReport ? () => onSelectReport(id) : undefined}
                      className="hai-text-caption text-hai-secondary rounded-hai-sm"
                      style={{
                        backgroundColor: 'var(--hai-surface-200)',
                        border: '1px solid var(--hai-surface-border)',
                        padding: '2px var(--hai-space-2)',
                        cursor: onSelectReport ? 'pointer' : 'default',
                      }}
                    >
                      #{id}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function HeadlineChip({ metric }: { metric: MetricPayload }) {
  const formatted =
    metric.value === null
      ? '—'
      : typeof metric.value === 'number'
      ? metric.value.toLocaleString(undefined, {
          minimumFractionDigits: metric.precision ?? 0,
          maximumFractionDigits: metric.precision ?? 0,
        })
      : String(metric.value);

  return (
    <div
      className="rounded-hai-sm"
      style={{
        backgroundColor: 'var(--hai-surface-200)',
        border: '1px solid var(--hai-surface-border)',
        padding: '6px var(--hai-space-2)',
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 72,
      }}
    >
      <span className="hai-text-caption text-hai-tertiary">{metric.label}</span>
      <span className="hai-text-body-sm hai-num text-hai-primary">
        {formatted}
        {metric.unit ? <span className="text-hai-tertiary"> {metric.unit}</span> : null}
      </span>
    </div>
  );
}
