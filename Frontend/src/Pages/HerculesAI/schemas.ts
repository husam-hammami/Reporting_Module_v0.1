/**
 * Hercules AI Briefing — Backend Contract (Plan 1)
 *
 * Source of truth for the /insights response shape.
 * Backend sanitises before returning; frontend runtime-validates with zod.
 */

import { z } from 'zod';

/* =========================================================================
   PRIMITIVES
   ========================================================================= */

export const statusLevelSchema = z.enum(['ok', 'warn', 'crit']);
export const statusLevelWithIdleSchema = z.enum(['ok', 'warn', 'crit', 'idle']);
export const attentionSeveritySchema = z.enum(['warn', 'crit']);

export const deltaDirectionSchema = z.enum(['up', 'down', 'flat', 'idle-to-active']);
export const deltaPolaritySchema = z.enum(['positive', 'negative', 'neutral']);

export const deltaSchema = z.object({
  pct: z.number().nullable(),
  direction: deltaDirectionSchema,
  polarity: deltaPolaritySchema,
  baseline_label: z.string(),
  text_override: z.string().optional(),
});

export const metricPayloadSchema = z.object({
  label: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  precision: z.number().optional(),
  delta: deltaSchema.optional(),
  sparkline: z.array(z.number()).optional(),
  status: statusLevelSchema.optional(),
  tag_name: z.string().optional(),
});

/* =========================================================================
   TOP-LEVEL RESPONSE
   ========================================================================= */

export const statusHeroSchema = z.object({
  level: statusLevelSchema,
  verdict: z.string().max(80),
  data_age_minutes: z.number(),
});

export const attentionItemSchema = z.object({
  severity: attentionSeveritySchema,
  asset: z.string(),
  headline: z.string(),
  evidence: z.string(),
  since: z.string().optional(),
  drill: z.object({
    report_id: z.number().optional(),
    tag_name: z.string().optional(),
    from: z.string(),
    to: z.string(),
  }),
});

export const assetPanelSchema = z.object({
  name: z.string(),
  status: statusLevelSchema,
  headline_metrics: z.array(metricPayloadSchema),
  full_metrics: z.array(metricPayloadSchema),
  notes: z.array(z.string()),
  related_report_ids: z.array(z.number()),
});

export const productionRingSchema = z.object({
  produced: z.number(),
  target: z.number(),
  unit: z.string(),
  time_elapsed_fraction: z.number(),
});

export const timelineEventSchema = z.object({
  timestamp: z.string(),
  category: z.enum(['shutdown', 'order_change', 'alarm', 'note']),
  title: z.string(),
  description: z.string().optional(),
  drill: z.object({
    report_id: z.number().optional(),
    tag_name: z.string().optional(),
  }).optional(),
});

export const shiftBoundarySchema = z.object({
  start: z.string(),
  end: z.string(),
  label: z.string(),
});

export const timelineSchema = z.object({
  events: z.array(timelineEventSchema),
  shifts: z.array(shiftBoundarySchema),
});

export const equipmentStripItemSchema = z.object({
  asset_short: z.string(),
  asset_name: z.string(),
  status: statusLevelWithIdleSchema,
  last_change: z.string(),
});

export const insightsPeriodSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string(),
});

export const insightsMetaSchema = z.object({
  model: z.string(),
  prompt_version: z.number(),
  tokens_in: z.number(),
  tokens_out: z.number(),
  source_report_ids: z.array(z.number()),
});

export const insightsResponseSchema = z.object({
  schema_version: z.literal(3),
  generated_at: z.string(),
  period: insightsPeriodSchema,

  status_hero: statusHeroSchema,
  attention_items: z.array(attentionItemSchema).max(3),
  assets: z.array(assetPanelSchema),

  production_ring: productionRingSchema.optional(),
  timeline: timelineSchema.optional(),
  equipment_strip: z.array(equipmentStripItemSchema),

  meta: insightsMetaSchema,

  // Backward-compat fields (kept for distribution engine + old UI path)
  overview: z.string().optional(),
  reports: z.array(z.object({
    id: z.number().nullable(),
    name: z.string(),
    summary: z.string(),
  })).optional(),
  tags_analyzed: z.number().optional(),
  kpi: z.any().optional(),
  comparison: z.array(z.any()).optional(),
});

/* =========================================================================
   TYPESCRIPT TYPES
   ========================================================================= */

export type StatusLevel = z.infer<typeof statusLevelSchema>;
export type StatusLevelWithIdle = z.infer<typeof statusLevelWithIdleSchema>;
export type AttentionSeverity = z.infer<typeof attentionSeveritySchema>;
export type DeltaDirection = z.infer<typeof deltaDirectionSchema>;
export type DeltaPolarity = z.infer<typeof deltaPolaritySchema>;
export type Delta = z.infer<typeof deltaSchema>;
export type MetricPayload = z.infer<typeof metricPayloadSchema>;
export type StatusHero = z.infer<typeof statusHeroSchema>;
export type AttentionItem = z.infer<typeof attentionItemSchema>;
export type AssetPanelData = z.infer<typeof assetPanelSchema>;
export type ProductionRing = z.infer<typeof productionRingSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type ShiftBoundary = z.infer<typeof shiftBoundarySchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export type EquipmentStripItem = z.infer<typeof equipmentStripItemSchema>;
export type InsightsResponse = z.infer<typeof insightsResponseSchema>;

/* =========================================================================
   SAFE PARSER — returns minimal stub on failure so UI never blank-screens
   ========================================================================= */

export function parseInsightsResponse(raw: unknown): InsightsResponse {
  const result = insightsResponseSchema.safeParse(raw);
  if (result.success) return result.data;

  // Fallback minimal stub
  console.warn('[insights] schema validation failed', result.error);
  return {
    schema_version: 3,
    generated_at: new Date().toISOString(),
    period: { from: '', to: '', label: '' },
    status_hero: {
      level: 'warn',
      verdict: 'Briefing degraded — see raw data',
      data_age_minutes: 0,
    },
    attention_items: [],
    assets: [],
    equipment_strip: [],
    meta: {
      model: 'unknown',
      prompt_version: 0,
      tokens_in: 0,
      tokens_out: 0,
      source_report_ids: [],
    },
  };
}
