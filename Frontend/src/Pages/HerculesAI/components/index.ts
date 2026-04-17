/**
 * Hercules AI briefing — component library barrel.
 *
 * Import via:
 *   import { MetricCard, StatusHero, type MetricCardProps } from './components';
 *
 * Tokens live in ../tokens.css and must be imported at the page/app root.
 * Types come from ../schemas.ts; re-exported here for convenience.
 */

// Phase C — atomic
export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps } from './StatusBadge';

export { DeltaPill } from './DeltaPill';
export type { DeltaPillProps } from './DeltaPill';

export { SparklineInline } from './SparklineInline';
export type { SparklineInlineProps } from './SparklineInline';

export { MetricCard } from './MetricCard';
export type { MetricCardProps, MetricCardState, MetricCardSize } from './MetricCard';

export { LoadingState } from './LoadingState';
export type { LoadingStateProps, SkeletonShape } from './LoadingState';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps } from './ErrorState';

// Phase D — composite
export { StatusHero } from './StatusHero';
export type { StatusHeroProps, StatusHeroState } from './StatusHero';

export { AttentionCard } from './AttentionCard';
export type { AttentionCardProps } from './AttentionCard';

export { PowerFactorGauge } from './PowerFactorGauge';
export type { PowerFactorGaugeProps } from './PowerFactorGauge';

export { ProductionTargetRing } from './ProductionTargetRing';
export type { ProductionTargetRingProps } from './ProductionTargetRing';

// Phase E — container
export { AssetPanel } from './AssetPanel';
export type { AssetPanelProps } from './AssetPanel';

export { EquipmentStrip } from './EquipmentStrip';
export type { EquipmentStripProps } from './EquipmentStrip';

export { TimelineStrip } from './TimelineStrip';
export type { TimelineStripProps } from './TimelineStrip';

export { DensityProvider } from './DensityProvider';
export type { DensityProviderProps, HaiDensity } from './DensityProvider';

// Hooks
export { useRtl } from './useRtl';

// Re-exports from schemas for convenience
export type {
  StatusLevel,
  StatusLevelWithIdle,
  AttentionSeverity,
  Delta,
  DeltaDirection,
  DeltaPolarity,
  MetricPayload,
  StatusHero as StatusHeroData,
  AttentionItem,
  AssetPanelData,
  ProductionRing as ProductionRingData,
  TimelineEvent,
  ShiftBoundary,
  Timeline as TimelineData,
  EquipmentStripItem,
  InsightsResponse,
} from '../schemas';
