/**
 * AssetDrawer — Plan 14 §5.7.
 *
 * Trigger: click on a MachinesStrip row.
 * Content: existing SecCard + PfPenaltyCard + PacingRing for the chosen
 * asset, mounted side-by-side inside the drawer (re-uses Phase 1 components
 * verbatim per Plan 14 §11 "Components to reuse").
 */

import type { CSSProperties } from 'react';
import DrawerFrame from './DrawerFrame';
import SecCard from '../../components/SecCard';
import PfPenaltyCard from '../../components/PfPenaltyCard';
import PacingRing from '../../components/PacingRing';
import type { RoiPayload } from '../../hooks/useRoiPayload';

interface Props {
  open: boolean;
  onClose: () => void;
  asset: string | null;
  payload: RoiPayload | null;
}

const sectionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--hai-text-secondary)',
  marginBottom: 8,
  marginTop: 16,
};

export default function AssetDrawer({ open, onClose, asset, payload }: Props) {
  const assetData = (payload?.per_asset ?? []).find((a: any) => a?.asset === asset);
  const pace = (payload?.forecasts?.shift_pace ?? []).find((s: any) => s?.asset === asset);

  return (
    <DrawerFrame
      open={open}
      onClose={onClose}
      eyebrow="Asset detail"
      title={asset || 'Asset'}
      width={720}
    >
      {!assetData && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--hai-text-tertiary)' }}>
          No data for this asset yet.
        </div>
      )}

      {assetData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* SEC */}
          {assetData.sec_available && (
            <>
              <div style={sectionLabel}>Energy efficiency</div>
              {/* @ts-expect-error — Phase 1 component is JS, takes asset prop */}
              <SecCard asset={asset} secData={assetData.sec} />
            </>
          )}

          {/* PF */}
          {assetData.pf && (
            <>
              <div style={sectionLabel}>Power factor</div>
              {/* @ts-expect-error — Phase 1 component is JS */}
              <PfPenaltyCard asset={asset} pfData={assetData.pf} />
            </>
          )}

          {/* Shift pace */}
          {pace && (
            <>
              <div style={sectionLabel}>Today's pace</div>
              {/* @ts-expect-error — Phase 1 component is JS */}
              <PacingRing pace={pace} />
            </>
          )}

          {!assetData.sec_available && !assetData.pf && !pace && (
            <div style={{ padding: 16, fontSize: 13, color: 'var(--hai-text-tertiary)', textAlign: 'center' }}>
              No instrumented signals for this asset yet. Connect an energy meter
              and a production counter to start tracking.
            </div>
          )}
        </div>
      )}
    </DrawerFrame>
  );
}
