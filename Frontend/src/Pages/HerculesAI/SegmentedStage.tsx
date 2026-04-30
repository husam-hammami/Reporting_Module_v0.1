/**
 * SegmentedStage — Plan 6 §5.
 *
 * Renders the chip-row beneath the BoardroomCard. Default chip selection
 * algorithm guarantees the stage is never empty.
 *
 * Stages mounted by the parent (HerculesAISetup.jsx) — this component
 * is presentation-only for the chips.
 */

import type { CSSProperties } from 'react';
import type { RoiPayload } from './hooks/useRoiPayload';

export type ChipId = 'attention' | 'machines' | 'time' | 'audit';

export interface SegmentedStageProps {
  active: ChipId;
  onChange: (chip: ChipId) => void;
  payload: RoiPayload | null;
}

export function defaultChip(payload: RoiPayload | null): ChipId {
  if (!payload) return 'time';
  const att = (payload.anomalies?.length ?? 0) + (payload.levers?.length ?? 0);
  if (att > 0) return 'attention';
  if (payload.savings?.calibrating) return 'time';
  return 'attention';
}

const chipBase: CSSProperties = {
  fontFamily: 'Inter Tight, system-ui, sans-serif',
  fontSize: 13,
  padding: '10px 18px',
  borderRadius: 12,
  background: 'transparent',
  border: '1px solid var(--hai-glass-border)',
  color: 'var(--hai-text-secondary)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  transition: 'all 200ms cubic-bezier(.22,1,.36,1)',
  fontWeight: 500,
};
const chipActive: CSSProperties = {
  ...chipBase,
  background: 'var(--hai-glass-2)',
  color: 'var(--hai-text-primary)',
  borderColor: 'var(--hai-glass-highlight)',
  borderBottomColor: 'var(--hai-money)',
  borderBottomWidth: 3,
  boxShadow: '0 4px 12px -4px rgba(202,138,4,0.18)',
};

const countBadge: CSSProperties = {
  padding: '1px 8px',
  borderRadius: 999,
  background: 'var(--hai-glass-2)',
  color: 'var(--hai-text-secondary)',
  fontSize: 11,
  fontWeight: 600,
};

export default function SegmentedStage({ active, onChange, payload }: SegmentedStageProps) {
  const attentionCount =
    (payload?.anomalies?.length ?? 0) +
    (payload?.forecasts?.trends?.length ?? 0) +
    (payload?.levers?.length ?? 0);
  const machinesCount = payload?.per_asset?.length ?? 0;
  const auditCount = payload?.savings?.entries_count ?? 0;

  const chips: Array<{ id: ChipId; label: string; count?: number }> = [
    { id: 'attention', label: 'Attention',  count: attentionCount },
    { id: 'machines',  label: 'Machines',   count: machinesCount },
    { id: 'time',      label: 'Time',       count: undefined },
    { id: 'audit',     label: 'Audit',      count: auditCount },
  ];

  return (
    <div
      role="tablist"
      aria-label="Stage selector"
      style={{
        display: 'flex',
        gap: 'var(--hai-space-2)',
        padding: 'var(--hai-space-4) 0',
        flexWrap: 'wrap',
      }}
    >
      {chips.map((c) => {
        const isActive = c.id === active;
        return (
          <button
            key={c.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(c.id)}
            style={isActive ? chipActive : chipBase}
            onMouseEnter={(e) => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--hai-glass-1)';
            }}
            onMouseLeave={(e) => {
              if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
          >
            {c.label}
            {c.count != null && c.count > 0 && (
              <span style={countBadge}>{c.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
