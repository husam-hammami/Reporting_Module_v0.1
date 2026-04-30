/**
 * BoardroomCard — Plan 6 §1, §2.
 *
 * Single sticky glass card on `/hercules-ai`. Replaces the SavingsRibbon +
 * 7-asset bento + Bill + Watch stack with one premium verdict card + sub-list.
 *
 * Composition:
 *   ┌──────────────────────────────────────────────────────┐
 *   │  [coin]   PLANT VERDICT · ts          [trust 87/100]  │
 *   │           {hero number} · {verdict}                   │
 *   │           {money line with ghost projection}          │
 *   │           {inline KPI atoms}                          │
 *   │   ─────────────────────────────                       │
 *   │   ▸ teaser links to chips                             │
 *   └──────────────────────────────────────────────────────┘
 *
 * Anti-PhD enforced rules (CSS + props):
 *   - max-height: 320px
 *   - Hero is ALWAYS a number (HeroVerdict guarantees)
 *   - Gold reserved for OMR
 *   - Sub-list: max 3 bullets
 */

import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import GoldCoinStatic from './components/GoldCoinStatic';
import HeroVerdict from './components/HeroVerdict';
import type { RoiPayload } from './hooks/useRoiPayload';

interface BoardroomCardProps {
  payload: RoiPayload | null;
  isAdmin?: boolean;
  onChipChange?: (chip: 'attention' | 'machines' | 'time' | 'audit') => void;
  className?: string;
}

const containerStyle: CSSProperties = {
  background:
    'linear-gradient(135deg, rgba(202,138,4,0.04), rgba(202,138,4,0.01)), var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 24,
  padding: 'var(--hai-space-6) var(--hai-space-8)',
  boxShadow: 'var(--hai-shadow-deep), inset 0 1px 0 var(--hai-trust-glow, var(--hai-glass-highlight))',
  backdropFilter: 'blur(18px) saturate(160%)',
  WebkitBackdropFilter: 'blur(18px) saturate(160%)',
  position: 'sticky',
  top: 'var(--hai-space-4)',
  zIndex: 30,
  minHeight: 240,
  maxHeight: 320,
  display: 'grid',
  gridTemplateColumns: '80px 1fr auto',
  gridTemplateRows: 'auto 1fr auto',
  gap: 'var(--hai-space-2) var(--hai-space-5)',
};

const stripLabel: CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  fontWeight: 500,
};

function formatTimestamp(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const date = d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  } catch {
    return '';
  }
}

function trustGlowFor(score: number | null | undefined): string {
  if (score == null)        return 'rgba(255, 255, 255, 0.18)';
  if (score >= 95)          return 'rgba(240, 181, 79, 0.30)';
  if (score >= 80)          return 'rgba(240, 181, 79, 0.18)';
  if (score >= 70)          return 'rgba(240, 181, 79, 0.10)';
  return 'rgba(180, 180, 180, 0.10)';
}

export default function BoardroomCard({ payload, isAdmin = false, onChipChange, className }: BoardroomCardProps) {
  const trustScore = payload?.trust?.score ?? null;
  const calibrating = payload?.savings?.calibrating;
  const daysOfHistory = payload?.savings?.days_of_history ?? 0;
  const daysLeft = Math.max(0, 30 - daysOfHistory);
  const showLargeTrust = isAdmin && typeof trustScore === 'number' && trustScore < 70;

  const coinState = useMemo<'cold' | 'active'>(() => {
    if (!payload) return 'cold';
    const sav = payload.savings;
    if (sav?.calibrating) return 'cold';
    if (sav?.total_omr > 0) return 'active';
    return 'cold';
  }, [payload]);

  const styleWithGlow: CSSProperties = {
    ...containerStyle,
    // Drives the inset highlight via custom property
    ['--hai-trust-glow' as any]: trustGlowFor(trustScore),
  };

  // Sub-list teasers
  const attentionCount =
    (payload?.anomalies?.length ?? 0) + (payload?.forecasts?.trends?.length ?? 0);
  const machinesCount = payload?.per_asset?.length ?? 0;

  const subItems: Array<{ key: string; chip: 'attention' | 'machines' | 'time'; text: string }> = [];
  if (attentionCount > 0) {
    subItems.push({
      key: 'attn',
      chip: 'attention',
      text: `${attentionCount} thing${attentionCount === 1 ? '' : 's'} worth your attention`,
    });
  }
  if (machinesCount > 0) {
    subItems.push({
      key: 'mach',
      chip: 'machines',
      text: `${machinesCount} machine${machinesCount === 1 ? '' : 's'} watched`,
    });
  }
  if (calibrating && daysLeft > 0) {
    subItems.push({
      key: 'cal',
      chip: 'time',
      text: `Hercules learning · ${daysLeft} days left`,
    });
  }
  // Ensure max 3
  const subItemsVisible = subItems.slice(0, 3);

  return (
    <article
      className={`hai-num ${className ?? ''}`}
      style={styleWithGlow}
      role="region"
      aria-label="Plant verdict"
    >
      {/* Top row — coin + title strip + trust badge */}
      <div style={{ gridRow: 1, gridColumn: 1, alignSelf: 'center' }}>
        <GoldCoinStatic state={coinState} size={80} />
      </div>
      <div style={{ gridRow: 1, gridColumn: 2, alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 'var(--hai-space-3)' }}>
        <span style={stripLabel}>Plant Verdict</span>
        <span style={{ ...stripLabel, color: 'var(--hai-text-tertiary)' }}>·</span>
        <span style={{ ...stripLabel, textTransform: 'none', letterSpacing: '0.02em' }}>
          {formatTimestamp(payload?.generated_at)}
        </span>
      </div>
      <div style={{ gridRow: 1, gridColumn: 3, alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 8 }}>
        {trustScore != null && !showLargeTrust && (
          <span
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 999,
              border: '1px solid var(--hai-glass-border)',
              background: 'var(--hai-glass-2)',
              color: 'var(--hai-text-secondary)',
              fontWeight: 500,
            }}
          >
            Trust {trustScore}/100
          </span>
        )}
        {showLargeTrust && (
          <span
            role="status"
            aria-label={`Hercules accuracy below target: ${trustScore} of 100`}
            style={{
              fontSize: 11,
              padding: '4px 10px',
              borderRadius: 6,
              background: 'var(--hai-status-warn-100)',
              border: '1px solid var(--hai-status-warn-600)',
              color: 'var(--hai-status-warn-600)',
              fontWeight: 600,
            }}
          >
            Trust {trustScore}/100 — below target
          </span>
        )}
        <Link
          to="/hercules-ai/settings"
          aria-label="Hercules AI settings"
          title="Settings"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: 999,
            border: '1px solid var(--hai-glass-border)',
            background: 'var(--hai-glass-1)',
            color: 'var(--hai-text-secondary)',
            textDecoration: 'none',
            transition: 'background 200ms cubic-bezier(.22,1,.36,1)',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = 'var(--hai-glass-2)')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = 'var(--hai-glass-1)')}
        >
          <SettingsIcon size={14} />
        </Link>
      </div>

      {/* Middle row — hero verdict block (spans column 2 + 3) */}
      <div style={{ gridRow: 2, gridColumn: '2 / 4', alignSelf: 'center' }}>
        <HeroVerdict payload={payload} />
      </div>

      {/* Bottom row — sub-list (spans column 2 + 3) */}
      {subItemsVisible.length > 0 && (
        <div style={{ gridRow: 3, gridColumn: '2 / 4', borderTop: '1px solid var(--hai-glass-border)', paddingTop: 'var(--hai-space-3)' }}>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {subItemsVisible.map((it) => (
              <li key={it.key}>
                <button
                  onClick={() => onChipChange?.(it.chip)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    fontFamily: 'inherit',
                    fontSize: 13,
                    color: 'var(--hai-text-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span aria-hidden="true" style={{ color: 'var(--hai-money)' }}>▸</span>
                  {it.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
