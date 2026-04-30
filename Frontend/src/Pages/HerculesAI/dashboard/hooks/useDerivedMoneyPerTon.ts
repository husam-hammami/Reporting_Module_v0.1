/**
 * useDerivedMoneyPerTon — rolling 24 h cost intensity (OMR/ton).
 *
 * Plan 14 §3.2 + locked answer to §12 Q1: rolling 24 h is more stable than
 * instantaneous "today" math (which whips around at 06:00 with low volume).
 *
 * Source: payload.per_asset[i].sec is sec.summary_for_asset(asset, period_hours=24)
 * which returns kg_today + cost_omr_today over the trailing 24 h. We sum those
 * across REAL assets (junk filtered) and divide.
 *
 * Returns null when:
 *   - total_kg === 0 (no production to attribute cost to)
 *   - any structural piece is missing
 *
 * The UI labels the figure "24 h average" so users know it's a rolling window,
 * not "right now".
 */

import { useMemo } from 'react';
import type { RoiPayload } from '../../hooks/useRoiPayload';
import { useRealAssets } from './useRealAssets';

export function useDerivedMoneyPerTon(payload: RoiPayload | null): number | null {
  const assets = useRealAssets(payload);
  return useMemo(() => {
    if (!assets.length) return null;
    let totalKg = 0;
    let totalCostOmr = 0;
    for (const a of assets) {
      const s = a?.sec;
      if (!s) continue;
      const kg = typeof s.kg_today === 'number' ? s.kg_today : 0;
      const cost = typeof s.cost_omr_today === 'number' ? s.cost_omr_today : 0;
      totalKg += kg;
      totalCostOmr += cost;
    }
    if (totalKg <= 0) return null;
    return totalCostOmr / (totalKg / 1000); // OMR per ton
  }, [assets]);
}
