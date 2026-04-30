/**
 * useRealAssets — Plan 14 §3.7 filter.
 *
 * Drops phantom assets from payload.per_asset:
 *   - Empty / falsy asset names
 *   - Test entries (asset === 'ttt')
 *   - Line-name fallbacks with no instrumentation
 *     (no energy meter, no production counter, no tracked tags)
 *
 * Returns the filtered array. Single source of truth for the dashboard's
 * "real assets" view — used by MachinesStrip and any other surface that
 * counts machines.
 */

import { useMemo } from 'react';
import type { RoiPayload } from '../../hooks/useRoiPayload';

const JUNK_NAMES = new Set(['ttt', 'test', 'TEST', 'Mil-A']);

export interface RealAsset {
  asset: string;
  has_energy_meter: boolean;
  has_production_counter: boolean;
  sec_available: boolean;
  sec: any;
  pf: any;
}

export function useRealAssets(payload: RoiPayload | null): RealAsset[] {
  return useMemo(() => {
    const list = (payload?.per_asset ?? []) as RealAsset[];
    return list.filter((a) => {
      if (!a?.asset) return false;
      if (JUNK_NAMES.has(a.asset)) return false;
      // Drop assets that have no measurable instrumentation at all.
      // These are typically line_name-only fallbacks the AI scan couldn't classify.
      if (!a.has_energy_meter && !a.has_production_counter) return false;
      return true;
    });
  }, [payload]);
}
