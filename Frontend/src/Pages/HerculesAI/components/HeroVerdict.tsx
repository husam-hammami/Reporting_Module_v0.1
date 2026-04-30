/**
 * HeroVerdict — Plan 6 §3 hero number selection algorithm.
 *
 * Renders the centre-row block of the BoardroomCard. The hero number is
 * always a real number (today's OMR > Plant Score > savings > date),
 * never the word "Calibrating" / "Loading" / "Standing by" — those go
 * in the verdict text.
 */

import type { CSSProperties } from 'react';
import type { RoiPayload } from '../hooks/useRoiPayload';

interface HeroVerdictProps {
  payload: RoiPayload | null;
  now?: Date;
}

interface HeroBlock {
  kind: 'omr_with_projection' | 'omr' | 'score' | 'savings' | 'standby';
  primary: string | number;
  ghost?: number | null;
  verdict: string;
  subline?: string;
  goldPrimary?: boolean;
}

/** Pick the hero block contextually. Total — never returns null. */
export function pickHero(payload: RoiPayload | null, now: Date = new Date()): HeroBlock {
  if (!payload) {
    return { kind: 'standby', primary: 'Standing by', verdict: '—' };
  }

  const bill = payload.forecasts?.daily_bill;
  const score = payload.plant_score;
  const sav = payload.savings;
  const verdict = payload.plant_status_verdict;

  // Material confidence on forecast: band-width / projected ≤ 30%
  const confidentForecast =
    bill?.projected_omr != null &&
    bill?.p10_omr != null &&
    bill?.p90_omr != null &&
    bill.projected_omr > 0
      ? (bill.p90_omr - bill.p10_omr) / bill.projected_omr <= 0.30
      : false;

  // 1. Mid-shift with confident forecast → today's OMR + ghost
  if (bill?.so_far_omr != null && bill.so_far_omr > 0 && confidentForecast) {
    return {
      kind: 'omr_with_projection',
      primary: bill.so_far_omr,
      ghost: bill.projected_omr,
      verdict,
      goldPrimary: true,
    };
  }

  // 2. Today's OMR alone — promote whenever > 0 (Plan 6 hotfix: dropped >50 threshold)
  if (bill?.so_far_omr != null && bill.so_far_omr > 0) {
    return {
      kind: 'omr',
      primary: bill.so_far_omr,
      verdict,
      goldPrimary: true,
    };
  }

  // 3. Plant Score (Phase 1 fallback)
  if (score?.value != null) {
    return {
      kind: 'score',
      primary: `${score.value}/100`,
      verdict,
      subline: score.previous_omr
        ? `Yesterday: ${Math.round(score.previous_omr).toLocaleString()} OMR`
        : undefined,
    };
  }

  // 4. Today's running cost from money block (Plan 6 hotfix — even when bill projection is null)
  if (payload?.money?.cost_omr_today != null && payload.money.cost_omr_today > 0) {
    return {
      kind: 'omr',
      primary: payload.money.cost_omr_today,
      verdict,
      goldPrimary: true,
    };
  }

  // 5. Confirmed savings (cold start with no Phase 1 data)
  if (sav && !sav.calibrating && sav.total_omr > 0) {
    return {
      kind: 'savings',
      primary: Math.round(sav.total_omr),
      verdict: 'Hercules earned for you',
      goldPrimary: true,
    };
  }

  // 6. Final fallback — date + "Standing by"
  const dayName = now.toLocaleDateString(undefined, { weekday: 'long' });
  return { kind: 'standby', primary: dayName, verdict: 'Standing by' };
}

/* ── Render ───────────────────────────────────────────────────────────── */

const display: CSSProperties = {
  fontFamily: 'Inter Tight, system-ui, sans-serif',
  fontWeight: 300,
  fontSize: 'clamp(56px, 6vw, 80px)',
  lineHeight: 1,
  letterSpacing: '-0.02em',
  fontVariantNumeric: 'tabular-nums lining-nums',
};

const moneyLine: CSSProperties = {
  fontFamily: 'Inter Tight, system-ui, sans-serif',
  fontWeight: 400,
  fontSize: 22,
  color: 'var(--hai-money)',
  fontVariantNumeric: 'tabular-nums lining-nums',
};

const inlineKpi: CSSProperties = {
  fontFamily: 'Inter Tight, system-ui, sans-serif',
  fontWeight: 500,
  fontSize: 14,
  color: 'var(--hai-text-secondary)',
  fontVariantNumeric: 'tabular-nums lining-nums',
};

const STATUS_DOT: Record<'ok' | 'warn' | 'crit', string> = {
  ok: 'var(--hai-status-ok-600)',
  warn: 'var(--hai-status-warn-600)',
  crit: 'var(--hai-status-crit-600)',
};

export default function HeroVerdict({ payload, now }: HeroVerdictProps) {
  const hero = pickHero(payload, now);
  const level = (payload?.plant_status_level || 'ok') as 'ok' | 'warn' | 'crit';

  // Build inline KPI atoms
  const atoms: string[] = [];
  if (payload?.plant_score?.efficiency) {
    const eff = payload.plant_score.efficiency;
    if (eff.kwh_per_ton != null) atoms.push(`${eff.kwh_per_ton.toFixed(1)} kWh/ton`);
    if (eff.tons != null) atoms.push(`${Math.round(eff.tons).toLocaleString()} t produced`);
  }
  if (hero.kind !== 'omr' && hero.kind !== 'omr_with_projection' && payload?.money?.cost_omr_today) {
    atoms.push(`${Math.round(payload.money.cost_omr_today).toLocaleString()} OMR today`);
  }
  // Cap at 4 atoms
  const atomsVisible = atoms.slice(0, 4);

  return (
    <div className="hai-num" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Line 1 — hero + verdict */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
        <span
          style={{
            ...display,
            color: hero.goldPrimary ? 'var(--hai-money)' : 'var(--hai-text-primary)',
          }}
          aria-label={`${typeof hero.primary === 'number' ? hero.primary.toLocaleString() : hero.primary}`}
        >
          {typeof hero.primary === 'number'
            ? hero.primary.toLocaleString()
            : hero.primary}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 'clamp(22px, 2.4vw, 36px)',
            fontWeight: 400,
            color: 'var(--hai-text-secondary)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: STATUS_DOT[level],
              flexShrink: 0,
            }}
          />
          {hero.verdict}
        </span>
      </div>

      {/* Line 2 — money line (only when there's a money number) */}
      {(hero.kind === 'omr' || hero.kind === 'omr_with_projection') && (
        <div style={moneyLine}>
          {hero.kind === 'omr_with_projection' && hero.ghost != null ? (
            <>
              <span>{Math.round(hero.primary as number).toLocaleString()} OMR today</span>
              <span aria-hidden="true" style={{ margin: '0 12px', color: 'var(--hai-money)' }}>→</span>
              <span style={{ opacity: 0.55 }}>~{Math.round(hero.ghost).toLocaleString()} by close</span>
            </>
          ) : (
            <span>{Math.round(hero.primary as number).toLocaleString()} OMR today</span>
          )}
        </div>
      )}
      {hero.subline && (
        <div style={{ fontSize: 13, color: 'var(--hai-text-tertiary)' }}>{hero.subline}</div>
      )}

      {/* Line 3 — inline KPIs */}
      {atomsVisible.length > 0 && (
        <div style={inlineKpi}>
          {atomsVisible.map((atom, i) => (
            <span key={i}>
              {i > 0 && <span aria-hidden="true" style={{ margin: '0 10px', color: 'var(--hai-glass-border)' }}>·</span>}
              {atom}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
