/**
 * AttentionCard — the short list of things requiring human action.
 *
 * Plan spec 5.5. Max 3 items (already server-enforced; we belt-and-brace).
 * Crit before warn; within severity, newest `since` first. Items slide in
 * with 60 ms stagger. Dismissible inline. Header shows the remaining count.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, X } from 'lucide-react';
import type { AttentionItem } from '../schemas';
import { StatusBadge } from './StatusBadge';
import { useRtl } from './useRtl';

export interface AttentionCardProps {
  items: AttentionItem[];
  onDrill?: (item: AttentionItem) => void;
  dismissible?: boolean;
  className?: string;
}

const SEVERITY_RANK = { crit: 0, warn: 1 } as const;

export function AttentionCard(props: AttentionCardProps) {
  const { items, onDrill, dismissible = true, className } = props;
  const prefersReducedMotion = useReducedMotion();
  const { isRtl } = useRtl();

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const keyOf = (it: AttentionItem) => `${it.asset}::${it.headline.slice(0, 40).toLowerCase()}`;

    return [...items]
      .filter((it) => !dismissed.has(keyOf(it)))
      .sort((a, b) => {
        const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (severityDiff !== 0) return severityDiff;
        const aTs = a.since ? new Date(a.since).getTime() : 0;
        const bTs = b.since ? new Date(b.since).getTime() : 0;
        return bTs - aTs;
      })
      .slice(0, 3);
  }, [items, dismissed]);

  if (sorted.length === 0) return null;

  const keyOf = (it: AttentionItem) => `${it.asset}::${it.headline.slice(0, 40).toLowerCase()}`;

  return (
    <section
      className={className}
      aria-label="Needs attention"
      style={{
        backgroundColor: 'var(--hai-surface-200)',
        border: '1px solid var(--hai-surface-border)',
        borderRadius: 'var(--hai-radius-xl)',
        boxShadow: 'var(--hai-elev-2)',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--hai-space-3) var(--hai-space-5)',
          borderBottom: '1px solid var(--hai-surface-border)',
        }}
      >
        <span className="hai-text-heading-lg text-hai-tertiary">Needs attention</span>
        <span className="hai-text-label text-hai-tertiary hai-num">{sorted.length}</span>
      </header>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        <AnimatePresence initial={true}>
          {sorted.map((item, i) => {
            const itemKey = keyOf(item);
            return (
              <motion.li
                key={itemKey}
                layout
                initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, height: 0 }}
                transition={{
                  duration: prefersReducedMotion ? 0 : 0.3,
                  ease: [0.25, 1, 0.5, 1],
                  delay: prefersReducedMotion ? 0 : i * 0.06,
                }}
                style={{
                  borderTop: i === 0 ? 'none' : '1px solid var(--hai-surface-border)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--hai-space-3)',
                    padding: 'var(--hai-space-4) var(--hai-space-5)',
                  }}
                >
                  <div style={{ paddingTop: 6, flexShrink: 0 }}>
                    <StatusBadge level={item.severity} pulse />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--hai-space-2)',
                        marginBottom: 'var(--hai-space-1)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        className="hai-text-label text-hai-secondary rounded-hai-sm"
                        style={{
                          backgroundColor: 'var(--hai-surface-300)',
                          padding: '2px var(--hai-space-2)',
                        }}
                      >
                        {item.asset}
                      </span>
                      <span className="hai-text-heading-md text-hai-primary">
                        {item.headline}
                      </span>
                    </div>
                    <p className="hai-text-body text-hai-secondary" style={{ margin: 0 }}>
                      {item.evidence}
                    </p>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--hai-space-2)',
                      flexShrink: 0,
                    }}
                  >
                    {onDrill ? (
                      <button
                        type="button"
                        onClick={() => onDrill(item)}
                        className="hai-text-body-sm text-hai-info rounded-hai-sm"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: 'var(--hai-space-1) var(--hai-space-2)',
                          background: 'transparent',
                          border: '1px solid var(--hai-surface-border)',
                          cursor: 'pointer',
                          minHeight: 32,
                        }}
                        aria-label={`Open ${item.asset}: ${item.headline}`}
                      >
                        <span>Open</span>
                        <ChevronRight
                          size={14}
                          aria-hidden="true"
                          style={{ transform: isRtl ? 'scaleX(-1)' : undefined }}
                        />
                      </button>
                    ) : null}
                    {dismissible ? (
                      <button
                        type="button"
                        onClick={() =>
                          setDismissed((prev) => {
                            const next = new Set(prev);
                            next.add(itemKey);
                            return next;
                          })
                        }
                        className="text-hai-tertiary rounded-hai-sm"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: 'var(--hai-space-1)',
                          cursor: 'pointer',
                          minHeight: 32,
                          minWidth: 32,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        aria-label="Dismiss"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
