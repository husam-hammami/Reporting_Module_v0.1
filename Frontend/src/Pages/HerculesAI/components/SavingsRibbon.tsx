/**
 * SavingsRibbon — Plan 5 §14.4 Band 1.
 *
 * The single verdict on the page: "Hercules saved you X OMR this month."
 * Absorbs StatusHero as a 16 px sub-line (post-review §16.7).
 *
 * Contract:
 *   props.savings        — output of /hercules-ai/savings
 *   props.plantStatus    — { level: 'ok'|'warn'|'crit', verdict: string }
 *   props.subline        — array of 5 status atoms (asset throughput, lines on, freshness, trust)
 *   props.trustScore     — number 0..100 or null (calibrating)
 *   props.isAdmin        — bool, gates large Trust Score smoke-detector display
 *   props.onAuditClick   — opens audit drawer
 *
 * Design rules enforced:
 *   - One verdict on the page (subline is informational, not a competing hero).
 *   - Money is the only gold figure on the page.
 *   - Count-up tween fires only on value-change ≥ 1 OMR.
 *   - Empty state shows "Calibrating · keep using Hercules for 30 days".
 *   - Hero motif: Lottie placeholder slot 160 × 160. Phase A ships static SVG; Lottie wired Phase C.
 */

import { useEffect, useState, type CSSProperties } from 'react';

interface SavingsBreakdown {
  omr: number;
  count: number;
}

interface SavingsResp {
  total_omr: number;
  total_omr_uncalibrated?: number;
  total_omr_user_attributed?: number;
  entries_count: number;
  disputed_count: number;
  breakdown: Record<string, SavingsBreakdown>;
  calibrating: boolean;
  days_of_history: number;
  period_start: string;
  period_end: string;
}

interface SavingsRibbonProps {
  savings: SavingsResp | null;
  plantStatus?: { level: 'ok' | 'warn' | 'crit'; verdict: string };
  subline?: string[];
  trustScore?: number | null;
  isAdmin?: boolean;
  onAuditClick?: () => void;
  className?: string;
}

/* ── Count-up tween (no external dep) ───────────────────────────────────── */
function useCountUp(target: number, durationMs = 1200, fireMinDelta = 1): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof target !== 'number' || isNaN(target)) {
      setValue(0);
      return;
    }
    if (Math.abs(target - value) < fireMinDelta) {
      setValue(target);
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      // Per Plan §16.7 — reduced motion: 280 ms cross-fade
      setValue(target);
      return;
    }
    const start = value;
    const delta = target - start;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / durationMs);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(Math.round(start + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

/* ── Subline status dot ─────────────────────────────────────────────────── */
const STATUS_DOT_COLOR: Record<'ok' | 'warn' | 'crit', string> = {
  ok: 'var(--hai-status-ok-600)',
  warn: 'var(--hai-status-warn-600)',
  crit: 'var(--hai-status-crit-600)',
};

/* ── Component ──────────────────────────────────────────────────────────── */
export default function SavingsRibbon({
  savings,
  plantStatus,
  subline,
  trustScore,
  isAdmin = false,
  onAuditClick,
  className,
}: SavingsRibbonProps) {
  const target = savings?.calibrating ? 0 : Math.round(savings?.total_omr ?? 0);
  const animated = useCountUp(target);

  const breakdownEntries = savings ? Object.entries(savings.breakdown) : [];

  // Trust smoke-detector: large only when below 70 AND admin (Plan §15)
  const showLargeTrust = isAdmin && typeof trustScore === 'number' && trustScore < 70;

  const ribbonStyle: CSSProperties = {
    minHeight: 128,
    background:
      'linear-gradient(90deg, rgba(240,181,79,0.06), rgba(240,181,79,0.02)), var(--hai-glass-1)',
    border: '1px solid var(--hai-glass-border)',
    borderRadius: 22,
    padding: 'var(--hai-space-4) var(--hai-space-8)',
    display: 'grid',
    gridTemplateColumns: '160px 1fr auto',
    alignItems: 'center',
    gap: 'var(--hai-space-6)',
    boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
    backdropFilter: 'blur(14px) saturate(160%)',
    WebkitBackdropFilter: 'blur(14px) saturate(160%)',
  };

  const motifStyle: CSSProperties = {
    width: 160,
    height: 160,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    filter: 'drop-shadow(0 8px 24px var(--hai-money-glow))',
  };

  const heroLabelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--hai-text-secondary)',
    marginBottom: 4,
  };

  const sublineStyle: CSSProperties = {
    fontSize: 13,
    color: 'var(--hai-text-secondary)',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 'var(--hai-space-3)',
    marginTop: 8,
  };

  const chipStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    background: 'var(--hai-glass-2)',
    border: '1px solid var(--hai-glass-border)',
    borderRadius: 999,
    fontSize: 11,
    color: 'var(--hai-text-primary)',
    cursor: onAuditClick ? 'pointer' : 'default',
  };

  return (
    <section
      className={`hai-num ${className ?? ''}`}
      role="region"
      aria-label="Hercules savings this month"
      style={ribbonStyle}
    >
      {/* Hero motif (Phase A: static SVG; Phase C: Lottie) */}
      <div style={motifStyle} aria-hidden="true">
        <HeroMotifPlaceholder />
      </div>

      {/* Verdict + subline */}
      <div>
        {savings?.calibrating ? (
          <>
            <div style={heroLabelStyle}>Hercules</div>
            <div
              className="hai-money-figure"
              style={{ color: 'var(--hai-text-secondary)', fontSize: 'var(--hai-roi-display-sm)' }}
            >
              <span>Calibrating</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--hai-text-tertiary)', marginTop: 6 }}>
              Keep using Hercules for {Math.max(0, 30 - (savings?.days_of_history ?? 0))} more days to see savings
            </div>
          </>
        ) : (
          <>
            <div style={heroLabelStyle}>Hercules saved you</div>
            <div className="hai-money-figure">
              <span aria-label={`${target.toLocaleString()} Omani Rial`}>
                {animated.toLocaleString()}
              </span>
              <span className="hai-money-unit">OMR</span>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--hai-text-secondary)',
                  marginLeft: 8,
                }}
              >
                this month
              </span>
            </div>
            {showLargeTrust && (
              <div
                role="status"
                aria-label={`Hercules accuracy below target: ${trustScore} of 100`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 8,
                  padding: '4px 10px',
                  background: 'var(--hai-status-warn-100)',
                  border: '1px solid var(--hai-status-warn-600)',
                  borderRadius: 6,
                  fontSize: 11,
                  color: 'var(--hai-status-warn-600)',
                }}
              >
                Trust {trustScore}/100 — accuracy below target
              </div>
            )}
          </>
        )}

        {/* Sub-line: absorbs StatusHero (post-review one-verdict rule) */}
        {(plantStatus || (subline && subline.length > 0)) && (
          <div style={sublineStyle}>
            {plantStatus && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: STATUS_DOT_COLOR[plantStatus.level],
                  }}
                />
                {plantStatus.verdict}
              </span>
            )}
            {subline?.slice(0, 4).map((atom, i) => (
              <span key={`${i}-${atom}`} style={{ display: 'inline-flex', gap: 'var(--hai-space-3)' }}>
                <span aria-hidden="true" style={{ color: 'var(--hai-glass-border)' }}>·</span>
                {atom}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Sub-attribution chips */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'flex-end',
        }}
      >
        {!savings?.calibrating &&
          breakdownEntries.slice(0, 3).map(([rule, b]) => (
            <button
              key={rule}
              onClick={onAuditClick}
              style={chipStyle}
              aria-label={`${ruleLabel(rule)} contributed ${b.omr} OMR`}
            >
              <span style={{ color: 'var(--hai-money)' }}>+{Math.round(b.omr).toLocaleString()}</span>
              <span style={{ color: 'var(--hai-text-secondary)' }}>{ruleLabel(rule)}</span>
            </button>
          ))}
        {breakdownEntries.length > 3 && onAuditClick && (
          <button onClick={onAuditClick} style={chipStyle}>
            +{breakdownEntries.length - 3} more
          </button>
        )}
      </div>
    </section>
  );
}

function ruleLabel(rule: string): string {
  switch (rule) {
    case 'pf_correction':  return 'Power';
    case 'yield_drift':    return 'Yield';
    case 'off_peak_shift': return 'Off-peak hours';
    default:               return rule.replace(/_/g, ' ');
  }
}

/* ── Hero motif placeholder ──────────────────────────────────────────────
 * Phase A: static SVG of stacked coins. Lottie integration deferred to Phase C
 * per Plan §15 — the bundle saving from skipping Three.js + Lottie in Phase A
 * is significant and the count-up + glass + ring deliver ~80% of the wow.
 *
 * The SVG is hand-tuned to feel premium without animation: layered translucent
 * gold disks with subtle highlight gradient. Ready to be swapped for Lottie.
 */
function HeroMotifPlaceholder() {
  return (
    <svg width="160" height="160" viewBox="0 0 160 160" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="haiMotifGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--hai-money)" stopOpacity="0.30" />
          <stop offset="100%" stopColor="var(--hai-money)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="haiCoinSheen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fff8e0" stopOpacity="0.4" />
          <stop offset="50%" stopColor="var(--hai-money)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#7a5a10" stopOpacity="1" />
        </linearGradient>
      </defs>
      {/* Glow halo */}
      <circle cx="80" cy="80" r="68" fill="url(#haiMotifGlow)" />
      {/* Three stacked coins */}
      <g>
        <ellipse cx="80" cy="118" rx="42" ry="9" fill="url(#haiCoinSheen)" stroke="var(--hai-money)" strokeOpacity="0.5" />
        <ellipse cx="80" cy="100" rx="44" ry="10" fill="url(#haiCoinSheen)" stroke="var(--hai-money)" strokeOpacity="0.5" />
        <ellipse cx="80" cy="80"  rx="46" ry="11" fill="url(#haiCoinSheen)" stroke="var(--hai-money)" strokeOpacity="0.5" />
        <ellipse cx="80" cy="60"  rx="44" ry="10" fill="url(#haiCoinSheen)" stroke="var(--hai-money)" strokeOpacity="0.5" />
        <ellipse cx="80" cy="42"  rx="42" ry="9"  fill="url(#haiCoinSheen)" stroke="var(--hai-money)" strokeOpacity="0.5" />
        {/* OMR text on top coin */}
        <text x="80" y="46" textAnchor="middle" fill="#3a2400" fontFamily="Inter Tight, sans-serif"
              fontWeight="700" fontSize="11" letterSpacing="0.1em">OMR</text>
      </g>
    </svg>
  );
}
