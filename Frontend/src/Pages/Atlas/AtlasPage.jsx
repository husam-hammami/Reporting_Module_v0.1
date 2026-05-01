/**
 * Hercules Atlas — Phase 1 page entry.
 *
 * New route at /atlas. Reuses the existing Hercules AI design tokens and
 * renders inside the standard app shell (top bar + sidebar provided by Home).
 * Phase 1 ships with mock data; Phase 2 swaps the snapshot source for a real
 * GET /api/hercules-ai/mill-b-snapshot call.
 *
 * Layout (per build prompt — AI bar on top):
 *   - AI verdict bar
 *   - Production hero | Production cumulative chart
 *   - Energy-cost hero | Energy-cost trend chart
 *   - KPI strip (Pace · Yield · Energy · Maintenance)
 */

import { useContext, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../Hooks/useLanguage';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import '../HerculesAI/tokens.css';
import './Atlas.css';

import { mockSnapshot } from './data/mockSnapshot';
import AtlasVerdictBar from './AtlasVerdictBar';
import AtlasKpiStrip from './AtlasKpiStrip';
import ProductionHero from './heroes/ProductionHero';
import EnergyCostHero from './heroes/EnergyCostHero';
import ProductionChart from './charts/ProductionChart';
import EnergyCostChart from './charts/EnergyCostChart';

function useDensity() {
  const [density, setDensity] = useState(() => {
    if (typeof window === 'undefined') return 'compact';
    return window.matchMedia('(min-width: 1536px)').matches ? 'wallboard' : 'compact';
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mql = window.matchMedia('(min-width: 1536px)');
    const handler = (e) => setDensity(e.matches ? 'wallboard' : 'compact');
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  return density;
}

export default function AtlasPage() {
  const { t } = useLanguage();
  const density = useDensity();
  const { mode } = useContext(DarkModeContext) ?? {};
  // Bind the local theme attribute so tokens.css' [data-theme='dark'] block
  // wins over its later :root light block (which inherits light vars onto html).
  const dataTheme = mode === 'dark' ? 'dark' : 'light';

  // Phase 1: hold the mock snapshot in state so future Phase 2 can swap with
  // the React Query hook with no other code change.
  const [snapshot] = useState(mockSnapshot);

  const verdict = useMemo(() => snapshot.verdict, [snapshot]);

  return (
    <div className="atlas-root" data-hai-density={density} data-theme={dataTheme}>
      <div className="atlas-grid">
        <AtlasVerdictBar verdict={verdict} t={t} />

        <ProductionHero data={snapshot.production} t={t} />

        <div className="atlas-chart-card atlas-chart-card--prod">
          <div className="atlas-chart-head">
            <div>
              <div className="atlas-chart-title">{t('atlas.chart.production.title')}</div>
              <div className="atlas-chart-sub">{t('atlas.chart.production.sub')}</div>
            </div>
            <div className="atlas-chart-legend">
              <div className="atlas-legend-item">
                <span className="atlas-legend-swatch atlas-legend-swatch--prod" />
                {t('atlas.chart.legend.actual')}
              </div>
              <div className="atlas-legend-item">
                <span className="atlas-legend-swatch atlas-legend-swatch--forecast" />
                {t('atlas.chart.legend.forecast')}
              </div>
            </div>
          </div>
          <ProductionChart series={snapshot.production_series} />
        </div>

        <EnergyCostHero data={snapshot.energy_cost_per_ton} t={t} />

        <div className="atlas-chart-card atlas-chart-card--cost">
          <div className="atlas-chart-head">
            <div>
              <div className="atlas-chart-title">{t('atlas.chart.cost.title')}</div>
              <div className="atlas-chart-sub">{t('atlas.chart.cost.sub')}</div>
            </div>
            <div className="atlas-chart-legend">
              <div className="atlas-legend-item">
                <span className="atlas-legend-swatch atlas-legend-swatch--cost" />
                {t('atlas.chart.legend.actual')}
              </div>
              <div className="atlas-legend-item">
                <span className="atlas-legend-swatch atlas-legend-swatch--forecast" />
                {t('atlas.chart.legend.forecast')}
              </div>
            </div>
          </div>
          <EnergyCostChart series={snapshot.energy_cost_per_ton} />
        </div>

        <AtlasKpiStrip kpis={snapshot.kpis} />
      </div>
    </div>
  );
}
