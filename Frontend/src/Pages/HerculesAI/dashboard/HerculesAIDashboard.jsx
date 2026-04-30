/**
 * HerculesAIDashboard — Plan 14 single-page bento.
 *
 * Replaces the BoardroomCard + SegmentedStage + four-tab structure with one
 * no-scroll bento. Tabs are gone. Tier 2 detail lives in side drawers.
 *
 * Drawer state lifted here so only one drawer is open at a time. Each tile
 * receives a callback to open its drawer; the drawer payload (selected
 * lever, asset, anomaly) is held in this component.
 *
 * Feature flag: localStorage 'hercules.dashboard.v2' === '1' enables this
 * surface. Old surface remains the default until commit 11 flips the flag.
 */

import { useState, useCallback } from 'react';
import { useRoiPayload } from '../hooks/useRoiPayload';
import RoiRibbon from './RoiRibbon';
import IntensityTile from './IntensityTile';
import TodaysBill from './TodaysBill';
import TopActions from './TopActions';
import NeedsAttention from './NeedsAttention';
import Predictions from './Predictions';
import MachinesStrip from './MachinesStrip';
import Footer from './Footer';
import SavingsLedgerDrawer from './drawers/SavingsLedgerDrawer';
import BillDrilldownDrawer from './drawers/BillDrilldownDrawer';
import LeverDrawer from './drawers/LeverDrawer';
import TrustDrawer from './drawers/TrustDrawer';
import YieldDrawer from './drawers/YieldDrawer';
import AssetDrawer from './drawers/AssetDrawer';
import WatchDrawer from './drawers/WatchDrawer';
import AnomalyDrawer from './drawers/AnomalyDrawer';

const PAGE_MAX = 1400;

export default function HerculesAIDashboard() {
  const { payload, loading, error } = useRoiPayload();
  const [drawer, setDrawer] = useState({ kind: null, data: null });

  const openDrawer = useCallback((kind, data = null) => setDrawer({ kind, data }), []);
  const closeDrawer = useCallback(() => setDrawer({ kind: null, data: null }), []);

  return (
    <div
      style={{
        maxWidth: PAGE_MAX,
        margin: '0 auto',
        padding: '16px 24px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      {/* Row 1 — full-width gold ROI ribbon */}
      <RoiRibbon
        payload={payload}
        loading={loading}
        error={error}
        onSavingsClick={() => openDrawer('savings')}
        onTrustClick={() => openDrawer('trust')}
      />

      {/* Row 2 — Intensity (3) + Today's Bill (5) + Top 3 Actions (4) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '3fr 5fr 4fr',
          gap: 16,
        }}
      >
        <IntensityTile payload={payload} />
        <TodaysBill payload={payload} onClick={() => openDrawer('bill')} />
        <TopActions payload={payload} onLeverClick={(lever) => openDrawer('lever', lever)} />
      </div>

      {/* Row 3 — Needs Attention (6) + Predictions (6) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}
      >
        <NeedsAttention
          payload={payload}
          onItemClick={(anomaly) => openDrawer('anomaly', anomaly)}
          onHeaderClick={() => openDrawer('watch')}
        />
        <Predictions
          payload={payload}
          onYieldClick={(card) => openDrawer('yield', card)}
          onHeaderClick={() => openDrawer('watch')}
        />
      </div>

      {/* Row 4 — Machines strip, full-width */}
      <MachinesStrip
        payload={payload}
        onAssetClick={(asset) => openDrawer('asset', asset)}
      />

      {/* Row 5 — Footer (TimeDrawer is owned by Footer itself) */}
      <Footer payload={payload} />

      {/* Drawers — only the matching `kind` renders open=true at any time */}
      <SavingsLedgerDrawer
        open={drawer.kind === 'savings'}
        onClose={closeDrawer}
      />
      <BillDrilldownDrawer
        open={drawer.kind === 'bill'}
        onClose={closeDrawer}
        payload={payload}
      />
      <LeverDrawer
        open={drawer.kind === 'lever'}
        onClose={closeDrawer}
        lever={drawer.data}
      />
      <TrustDrawer
        open={drawer.kind === 'trust'}
        onClose={closeDrawer}
        payload={payload}
      />
      <YieldDrawer
        open={drawer.kind === 'yield'}
        onClose={closeDrawer}
        asset={drawer.data?.asset}
        trend={drawer.data?.trend}
      />
      <AssetDrawer
        open={drawer.kind === 'asset'}
        onClose={closeDrawer}
        asset={drawer.data}
        payload={payload}
      />
      <WatchDrawer
        open={drawer.kind === 'watch'}
        onClose={closeDrawer}
        payload={payload}
      />
      <AnomalyDrawer
        open={drawer.kind === 'anomaly'}
        onClose={closeDrawer}
        anomaly={drawer.data}
      />
    </div>
  );
}
