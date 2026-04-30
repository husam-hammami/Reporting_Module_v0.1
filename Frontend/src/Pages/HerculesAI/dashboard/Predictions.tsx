/**
 * Predictions — Plan 14 §3.5.
 *
 * Three forward-looking signals at most: trend drifts (sec_drift), at-risk
 * shift_pace, week-trending bill. Each card: directional arrow, headline,
 * sub-line (sustained period or gap), OMR/month at risk.
 *
 * The whole point of this tile (per Husam's feedback): predictions are NOT
 * buried in a sub-tab — they're first-class on the boardroom. Same row as
 * Needs Attention, equal real estate.
 */

import type { CSSProperties } from 'react';
import type { RoiPayload } from '../hooks/useRoiPayload';

interface Props {
  payload: RoiPayload | null;
  onYieldClick?: (card: { asset?: string | null; trend?: any }) => void;
  onHeaderClick?: () => void;
}

const tile: CSSProperties = {
  background: 'var(--hai-glass-1)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 16,
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  boxShadow: 'var(--hai-shadow-rest), inset 0 1px 0 var(--hai-glass-highlight)',
  minHeight: 200,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginBottom: 4,
};

interface PredictionCard {
  arrow: string;
  arrowColor: string;
  headline: string;
  sub?: string;
  omr?: number;
  unit?: string;
  // Drilldown payload — when user clicks the card, what does the drawer show?
  drilldown?: { kind: 'yield'; asset?: string | null; trend?: any } | null;
}

function arrowFor(direction: 'up' | 'down' | 'time'): { glyph: string; color: string } {
  if (direction === 'up')   return { glyph: '↗', color: 'var(--hai-status-warn-600)' };
  if (direction === 'down') return { glyph: '↘', color: 'var(--hai-status-warn-600)' };
  return                            { glyph: '⏱', color: 'var(--hai-text-secondary)' };
}

function buildCards(payload: RoiPayload | null): PredictionCard[] {
  const out: PredictionCard[] = [];

  // 1) SEC drift / trend signals (forecasts.trends)
  const trends = (payload?.forecasts?.trends ?? []) as any[];
  for (const t of trends.slice(0, 2)) {
    const dir = (t.delta_pct ?? t.drift_pct ?? 0) > 0 ? 'up' : 'down';
    const a = arrowFor(dir);
    const isYield = (t.metric || '').toLowerCase().includes('yield') ||
      (t.headline || '').toLowerCase().includes('yield');
    out.push({
      arrow: a.glyph,
      arrowColor: a.color,
      headline: t.headline || `${t.metric || 'Trend'} drifts on ${t.asset || 'plant'}`,
      sub: t.sustained_hours
        ? `Sustained ${t.sustained_hours} h`
        : (t.evidence ? String(t.evidence).split('.')[0] : undefined),
      omr: t.estimated_omr_per_month_at_risk ?? t.omr_at_risk ?? undefined,
      unit: 'OMR/mo',
      drilldown: isYield ? { kind: 'yield', asset: t.asset, trend: t } : null,
    });
  }

  // 2) At-risk shift_pace
  const atRisk = (payload?.forecasts?.shift_pace ?? []).filter(
    (s: any) => s?.status === 'will_miss',
  );
  if (atRisk.length > 0 && out.length < 3) {
    const s = atRisk[0];
    out.push({
      arrow: '⏱',
      arrowColor: 'var(--hai-status-warn-600)',
      headline: `Shift on ${s.asset} likely to miss target`,
      sub: s.gap_kg ? `Gap ~${Math.round(s.gap_kg)} kg` : 'Pace below target',
    });
  }

  // 3) Daily bill trending unusually (lifetime delta vs band)
  const bill = payload?.forecasts?.daily_bill;
  if (bill && bill.projected_omr != null && bill.p90_omr != null && out.length < 3) {
    const p90 = bill.p90_omr;
    const proj = bill.projected_omr;
    if (typeof p90 === 'number' && typeof proj === 'number' && proj > p90 * 1.05) {
      out.push({
        arrow: '↗',
        arrowColor: 'var(--hai-status-warn-600)',
        headline: 'Energy bill running above usual range',
        sub: `Projected ${Math.round(proj).toLocaleString()} OMR vs typical ${Math.round(p90).toLocaleString()}`,
      });
    }
  }

  return out;
}

export default function Predictions({ payload, onYieldClick, onHeaderClick }: Props) {
  const cards = buildCards(payload);

  return (
    <div style={tile} className="hai-num">
      <div
        role={onHeaderClick ? 'button' : undefined}
        tabIndex={onHeaderClick ? 0 : undefined}
        onClick={onHeaderClick}
        onKeyDown={(e) => {
          if (onHeaderClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onHeaderClick();
          }
        }}
        style={{ ...labelStyle, cursor: onHeaderClick ? 'pointer' : 'default', outline: 'none' }}
        aria-label={onHeaderClick ? 'Open full watch list' : undefined}
      >
        Predictions
      </div>

      {cards.length === 0 && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--hai-text-tertiary)',
            fontSize: 12,
            textAlign: 'center',
            padding: 16,
            lineHeight: 1.5,
          }}
        >
          No drift or risk signals right now. Hercules will flag forward-looking issues here as they form.
        </div>
      )}

      {cards.map((c, i) => (
        <div
          key={i}
          role={c.drilldown ? 'button' : undefined}
          tabIndex={c.drilldown ? 0 : undefined}
          aria-label={c.drilldown ? `Open detail: ${c.headline}` : undefined}
          onClick={() => {
            if (c.drilldown?.kind === 'yield' && onYieldClick) {
              onYieldClick({ asset: c.drilldown.asset, trend: c.drilldown.trend });
            }
          }}
          onKeyDown={(e) => {
            if (c.drilldown?.kind === 'yield' && onYieldClick && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              onYieldClick({ asset: c.drilldown.asset, trend: c.drilldown.trend });
            }
          }}
          style={{
            display: 'grid',
            gridTemplateColumns: '20px 1fr auto',
            alignItems: 'baseline',
            gap: 12,
            padding: '10px 0',
            borderBottom: i === cards.length - 1 ? 'none' : '1px solid var(--hai-glass-border)',
            cursor: c.drilldown ? 'pointer' : 'default',
            outline: 'none',
          }}
        >
          <span style={{ fontSize: 16, color: c.arrowColor, lineHeight: 1 }} aria-hidden="true">
            {c.arrow}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--hai-text-primary)', lineHeight: 1.3 }}>
              {c.headline}
            </span>
            {c.sub && (
              <span style={{ fontSize: 11, color: 'var(--hai-text-tertiary)' }}>
                {c.sub}
              </span>
            )}
          </div>
          {c.omr != null && c.omr > 0 && (
            <span
              className="hai-money-figure"
              style={{ fontSize: 13, whiteSpace: 'nowrap' }}
            >
              {Math.round(c.omr).toLocaleString()}
              <span className="hai-money-unit" style={{ fontSize: 9, marginLeft: 4 }}>
                {c.unit || 'OMR/mo'}
              </span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
