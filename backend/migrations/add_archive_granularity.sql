-- Migration: Add granularity column for tiered data retention
-- Supports 'hourly' (default, 1-year retention) and 'daily' (long-term rollup, kept forever)
-- Date: 2026-03

ALTER TABLE tag_history_archive ADD COLUMN IF NOT EXISTS granularity VARCHAR(10) DEFAULT 'hourly';

CREATE INDEX IF NOT EXISTS idx_archive_granularity ON tag_history_archive (granularity);

-- Unique constraint for daily rollup rows (prevents duplicate daily aggregates)
CREATE UNIQUE INDEX IF NOT EXISTS uq_archive_daily
ON tag_history_archive (COALESCE(layout_id, 0), tag_id, archive_hour)
WHERE granularity = 'daily';
