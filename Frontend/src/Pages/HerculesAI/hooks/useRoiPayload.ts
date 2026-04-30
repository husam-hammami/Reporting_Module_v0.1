/**
 * useRoiPayload — single fetch + 30s polling for the boardroom card and stages.
 *
 * Plan 6 — all stages share one payload to avoid duplicate fetches.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { herculesAIApi } from '../../../API/herculesAIApi';

const REFRESH_MS = 30_000;

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

export function useRoiPayload() {
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
