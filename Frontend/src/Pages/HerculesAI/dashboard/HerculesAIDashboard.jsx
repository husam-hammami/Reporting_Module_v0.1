/**
 * HerculesAIDashboard — Plan 14 single-page bento.
 *
 * Replaces the BoardroomCard + SegmentedStage + four-tab structure with one
 * no-scroll bento. Tabs are gone. Tier 2 detail lives in side drawers.
 *
 * Commit 1: scaffold only — placeholder tiles wired to useRoiPayload, real
 * data shown as text. Subsequent commits build the proper visualisations,
 * tokens, motion, drawers per Plan 14 §11 sequence.
 *
 * Feature flag: localStorage 'hercules.dashboard.v2' === '1' enables this
 * surface. Old surface remains the default until commit 11 flips the flag.
 */

import { useRoiPayload } from '../hooks/useRoiPayload';
import RoiRibbon from './RoiRibbon';
import IntensityTile from './IntensityTile';
import TodaysBill from './TodaysBill';
import TopActions from './TopActions';
import NeedsAttention from './NeedsAttention';
import Predictions from './Predictions';
import MachinesStrip from './MachinesStrip';
import Footer from './Footer';

const PAGE_MAX = 1400;

export default function HerculesAIDashboard() {
  const { payload, loading, error } = useRoiPayload();

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
      <RoiRibbon payload={payload} loading={loading} error={error} />

      {/* Row 2 — Intensity (3) + Today's Bill (5) + Top 3 Actions (4) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '3fr 5fr 4fr',
          gap: 16,
        }}
      >
        <IntensityTile payload={payload} />
        <TodaysBill payload={payload} />
        <TopActions payload={payload} />
      </div>

      {/* Row 3 — Needs Attention (6) + Predictions (6) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}
      >
        <NeedsAttention payload={payload} />
        <Predictions payload={payload} />
      </div>

      {/* Row 4 — Machines strip, full-width */}
      <MachinesStrip payload={payload} />

      {/* Row 5 — Footer */}
      <Footer payload={payload} />
    </div>
  );
}
