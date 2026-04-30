/**
 * useRoiPayload — single fetch + 30s polling for the boardroom card and stages.
 *
 * Plan 6 — all stages share one payload to avoid duplicate fetches.
 *
 * Plan 6 hotfix #2: when the backend's payload.plant_score is null
 * (either path failed), we transparently fall back to the existing
 * /api/hercules-ai/insights endpoint that demonstrably works (Time tab
 * uses it to render 92/100). Extracts kpi.score and merges into payload.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { herculesAIApi } from '../../../API/herculesAIApi';

const REFRESH_MS = 30_000;
const INSIGHTS_FALLBACK_INTERVAL = 5 * 60_000;          // refresh insights fallback every 5 min

export interface RoiPayload {
  generated_at: string;
  period_from: string;
  period_to: string;
  plant_status_level: 'ok' | 'warn' | 'crit';
  plant_status_verdict: string;
  money: {
    savings_this_month_omr: number;
    savings_calibrating: boolean;
    pf_penalty_omr_month: number;
    sec_excess_omr_today: number;
    cost_omr_today: number;
  };
  savings: {
    total_omr: number;
    calibrating: boolean;
    days_of_history: number;
    breakdown: Record<string, { omr: number; count: number }>;
    entries_count: number;
    disputed_count: number;
  };
  per_asset: Array<{
    asset: string;
    has_energy_meter: boolean;
    has_production_counter: boolean;
    sec_available: boolean;
    sec: any;
    pf:  any;
  }>;
  levers: any[];
  forecasts: {
    shift_pace: any[];
    daily_bill: any | null;
    trends: any[];
  };
  anomalies: any[];
  trust: { score: number | null; calibrating: boolean; components?: any } | null;
  plant_score: {
    value: number;
    breakdown: Record<string, { score: number; label: string }>;
    efficiency: any;
    previous_omr: number | null;
  } | null;
}

/** Try to read kpi.score from /insights (the endpoint Time tab uses).
 *  Returns plant_score-shaped object on success, null on failure.
 *  Use yesterday's full day for stable data — same as the Time tab default.
 */
async function fetchInsightsPlantScore(): Promise<RoiPayload['plant_score']> {
  try {
    const now = new Date();
    const yStart = new Date(now);
    yStart.setDate(yStart.getDate() - 1);
    yStart.setHours(0, 0, 0, 0);
    const yEnd = new Date(yStart);
    yEnd.setHours(23, 59, 59, 999);
    const res = await herculesAIApi.insights({
      from: yStart.toISOString(),
      to:   yEnd.toISOString(),
      // omit report_ids — the endpoint will pick all active templates
    });
    const kpi = res?.data?.kpi;
    if (!kpi || typeof kpi.score !== 'number') return null;
    return {
      value: kpi.score,
      breakdown: kpi.breakdown || {},
      efficiency: kpi.efficiency || null,
      previous_omr: null,
    };
  } catch {
    return null;
  }
}

export function useRoiPayload() {
  const [payload, setPayload] = useState<RoiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const insightsRef = useRef<{ score: RoiPayload['plant_score']; ts: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await herculesAIApi.getRoiPayload();
      let merged: RoiPayload = res.data;

      // If backend payload has no plant_score, fall back to /insights
      const needsFallback = !merged?.plant_score || merged.plant_score.value == null;
      if (needsFallback) {
        const cached = insightsRef.current;
        const fresh = cached && (Date.now() - cached.ts) < INSIGHTS_FALLBACK_INTERVAL;
        if (fresh && cached) {
          merged = { ...merged, plant_score: cached.score };
        } else {
          const score = await fetchInsightsPlantScore();
          if (score) {
            insightsRef.current = { score, ts: Date.now() };
            merged = { ...merged, plant_score: score };
          }
        }
      } else {
        // backend gave us a score — keep it cached so we have something on next failure
        insightsRef.current = { score: merged.plant_score, ts: Date.now() };
      }

      setPayload(merged);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Could not load');
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

  return { payload, loading, error, reload: load };
}
