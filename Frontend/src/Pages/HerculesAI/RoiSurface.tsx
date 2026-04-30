/**
 * RoiSurface — composes the AI tab's bento.
 *
 * Plan 5 §14.4 page composition:
 *   Band 1 — SavingsRibbon (the only verdict)
 *   Band 2 — Asset bento (PacingRing + SecCard + PfPenaltyCard per asset)
 *   Band 3 — Top-3 Levers (Phase C)
 *   Band 4 — Plant-wide Bill projection
 *   Band 5 — Watch (forecasts + anomalies)
 *
 * Phase A: SavingsRibbon + SecCard + PfPenaltyCard.
 * Phase B (this commit): + PacingRing + BillProjection + WatchBand.
 *
 * Data load: single `/api/hercules-ai/roi-payload` call, refreshed every 30 s.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { herculesAIApi } from '../../API/herculesAIApi';
import SavingsRibbon from './components/SavingsRibbon';
import SecCard from './components/SecCard';
import PfPenaltyCard from './components/PfPenaltyCard';
import PacingRing from './components/PacingRing';
import BillProjectionCard from './components/BillProjectionCard';
import WatchBand from './components/WatchBand';

import './tokens.css';

interface PerAsset {
  asset: string;
  has_energy_meter: boolean;
  has_production_counter: boolean;
  sec_available: boolean;
  sec: any;       // SecSummary | null
  pf:  any;       // PfStatus | null
}

interface ForecastsBlock {
  shift_pace: any[];
  daily_bill: any | null;
  trends: any[];
}

interface RoiPayload {
  generated_at: string;
  plant_status_level: 'ok' | 'warn' | 'crit';
  plant_status_verdict: string;
  money: {
    savings_this_month_omr: number;
    savings_calibrating: boolean;
    pf_penalty_omr_month: number;
    sec_excess_omr_today: number;
    cost_omr_today: number;
  };
  savings: any;
  per_asset: PerAsset[];
  levers: any[];
  forecasts: ForecastsBlock;
  anomalies: any[];
  trust: { score: number | null; calibrating: boolean } | null;
}

const REFRESH_MS = 30_000;

export default function RoiSurface() {
  const [payload, setPayload] = useState<RoiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await herculesAIApi.getRoiPayload();
      setPayload(res.data);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Could not load ROI payload');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = window.setInterval(load, REFRESH_MS);
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, [load]);

  if (loading && !payload) {
    return <RoiSurfaceSkeleton />;
  }

  if (error && !payload) {
    return (
      <div
        role="alert"
        style={{
          padding: 'var(--hai-space-5)',
          border: '1px solid var(--hai-status-crit-600)',
          borderRadius: 12,
          color: 'var(--hai-status-crit-600)',
          background: 'var(--hai-status-crit-100)',
          fontSize: 13,
          margin: 'var(--hai-space-4) 0',
        }}
      >
        Couldn't load — {error}.{' '}
        <button
          onClick={load}
          style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
        >
          Try again
        </button>
      </div>
    );
  }

  const subline: string[] = [];
  if (payload?.money?.cost_omr_today != null && payload.money.cost_omr_today > 0) {
    subline.push(`Today's cost so far: ${Math.round(payload.money.cost_omr_today).toLocaleString()} OMR`);
  }
  if (payload?.money?.pf_penalty_omr_month != null && payload.money.pf_penalty_omr_month > 0) {
    subline.push(`Utility penalty: ${Math.round(payload.money.pf_penalty_omr_month).toLocaleString()} OMR/month`);
  }
  const trackedAssets = (payload?.per_asset ?? []).filter((p) => p.sec_available);
  if (trackedAssets.length > 0) {
    subline.push(`${trackedAssets.length} machine${trackedAssets.length === 1 ? '' : 's'} watched`);
  }

  // Index shift_pace forecasts by asset for AssetCard lookup
  const paceByAsset: Record<string, any> = {};
  for (const p of payload?.forecasts?.shift_pace ?? []) {
    if (p?.asset) paceByAsset[p.asset] = p;
  }

  return (
    <section className="hai-num" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hai-space-5)' }}>
      <SavingsRibbon
        savings={payload?.savings ?? null}
        plantStatus={payload ? { level: payload.plant_status_level, verdict: payload.plant_status_verdict } : undefined}
        subline={subline}
        trustScore={payload?.trust?.score ?? null}
      />

      {/* Band 2 — Asset bento */}
      {(payload?.per_asset?.length ?? 0) > 0 && (
        <div
          className="hai-roi-bento"
          style={{
            display: 'grid',
            gap: 'var(--hai-space-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          }}
        >
          {(payload?.per_asset ?? []).map((a) => (
            <AssetCard key={a.asset} asset={a} pace={paceByAsset[a.asset] ?? null} />
          ))}
        </div>
      )}

      {(payload?.per_asset?.length ?? 0) === 0 && (
        <div
          style={{
            padding: 'var(--hai-space-5)',
            border: '1px dashed var(--hai-glass-border)',
            borderRadius: 12,
            color: 'var(--hai-text-secondary)',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          No machines being watched yet. Hercules will pick them up automatically as it learns your equipment.
        </div>
      )}

      {/* Band 4 — Plant-wide bill projection */}
      <BillProjectionCard projection={payload?.forecasts?.daily_bill ?? null} />

      {/* Band 5 — Watch (trends + anomalies) */}
      <WatchBand
        trends={payload?.forecasts?.trends ?? []}
        anomalies={payload?.anomalies ?? []}
      />
    </section>
  );
}

/* ── Asset card: title + PacingRing + SEC + PF stacked ────────────────── */
function AssetCard({ asset, pace }: { asset: PerAsset; pace: any | null }) {
  return (
    <article
      className="hai-roi-card"
      style={{
        padding: 'var(--hai-space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--hai-space-3)',
      }}
      aria-label={`Asset card for ${asset.asset}`}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontSize: 16, fontWeight: 600, color: 'var(--hai-text-primary)',
          fontFamily: 'Inter Tight, system-ui, sans-serif',
        }}>{asset.asset}</span>
        {!asset.sec_available && (
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 999,
            background: 'var(--hai-status-warn-100)', color: 'var(--hai-status-warn-600)',
            fontWeight: 600, letterSpacing: '0.04em',
          }}>
            Needs setup
          </span>
        )}
      </header>

      {pace && <PacingRing pace={pace} size={180} />}
      <SecCard summary={asset.sec} />
      <PfPenaltyCard status={asset.pf} />
    </article>
  );
}

function RoiSurfaceSkeleton() {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hai-space-5)' }} aria-busy="true">
      <div
        style={{
          minHeight: 128,
          background: 'var(--hai-glass-1)',
          border: '1px solid var(--hai-glass-border)',
          borderRadius: 22,
          opacity: 0.5,
        }}
      />
      <div style={{ display: 'grid', gap: 'var(--hai-space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            minHeight: 280, background: 'var(--hai-glass-1)',
            border: '1px solid var(--hai-glass-border)', borderRadius: 18, opacity: 0.5,
          }} />
        ))}
      </div>
    </section>
  );
}
