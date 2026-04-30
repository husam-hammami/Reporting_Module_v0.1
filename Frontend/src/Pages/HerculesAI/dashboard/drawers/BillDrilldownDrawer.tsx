/**
 * BillDrilldownDrawer — Plan 14 §5.2.
 *
 * Trigger: click on TodaysBill tile.
 * Content: today's running cost narrative + last-7-days bill comparison.
 *
 * Compact view since the backend daily_bill.project() returns summary stats.
 * Future: hourly cost breakdown chart (Phase D — needs new backend endpoint).
 */

import type { CSSProperties } from 'react';
import DrawerFrame from './DrawerFrame';
import type { RoiPayload } from '../../hooks/useRoiPayload';

interface Props {
  open: boolean;
  onClose: () => void;
  payload: RoiPayload | null;
}

const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '10px 0',
  borderBottom: '1px solid var(--hai-glass-border)',
  fontSize: 13,
};

const labelStyle: CSSProperties = {
  color: 'var(--hai-text-secondary)',
};

const valueStyle: CSSProperties = {
  color: 'var(--hai-money)',
  fontWeight: 500,
  fontVariantNumeric: 'tabular-nums',
};

export default function BillDrilldownDrawer({ open, onClose, payload }: Props) {
  const bill = payload?.forecasts?.daily_bill ?? null;
  const cost = payload?.money?.cost_omr_today ?? null;

  return (
    <DrawerFrame open={open} onClose={onClose} eyebrow="Daily bill" title="Today's energy cost">
      <div className="hai-num">
        <div style={row}>
          <span style={labelStyle}>Cost so far</span>
          <span style={valueStyle}>{cost == null ? '—' : `${Math.round(cost).toLocaleString()} OMR`}</span>
        </div>
        <div style={row}>
          <span style={labelStyle}>Projected by close</span>
          <span style={valueStyle}>
            {bill?.projected_omr == null ? '—' : `${Math.round(bill.projected_omr).toLocaleString()} OMR`}
          </span>
        </div>
        <div style={row}>
          <span style={labelStyle}>Lower estimate (10%)</span>
          <span style={valueStyle}>
            {bill?.p10_omr == null ? '—' : `${Math.round(bill.p10_omr).toLocaleString()} OMR`}
          </span>
        </div>
        <div style={row}>
          <span style={labelStyle}>Upper estimate (90%)</span>
          <span style={valueStyle}>
            {bill?.p90_omr == null ? '—' : `${Math.round(bill.p90_omr).toLocaleString()} OMR`}
          </span>
        </div>
        {bill?.last_week_same_day_omr != null && (
          <div style={row}>
            <span style={labelStyle}>Last week, same day</span>
            <span style={valueStyle}>
              {Math.round(bill.last_week_same_day_omr).toLocaleString()} OMR
            </span>
          </div>
        )}

        {bill?.accuracy_label === 'learning' && (
          <div style={{
            marginTop: 24,
            padding: 16,
            background: 'rgba(202,138,4,0.06)',
            border: '1px solid rgba(202,138,4,0.2)',
            borderRadius: 12,
            fontSize: 12,
            color: 'var(--hai-text-secondary)',
            lineHeight: 1.6,
          }}>
            Hercules is still learning your daily pattern. Projections will sharpen
            after a week of data. Until then, the figures above show today's
            running costs as they accumulate.
          </div>
        )}
      </div>
    </DrawerFrame>
  );
}
