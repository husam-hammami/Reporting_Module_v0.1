-- Migration: Make layout_id nullable in tag_history tables
-- Description: The universal historian worker records tags without a layout context
--              (layout_id = NULL). This migration drops the NOT NULL constraint
--              and updates the unique constraint to allow NULL layout_id rows.
-- Date: 2026-02

-- ============================================================================
-- tag_history: make layout_id nullable
-- ============================================================================
ALTER TABLE tag_history ALTER COLUMN layout_id DROP NOT NULL;

-- Drop the old unique constraint that required layout_id to be non-null
ALTER TABLE tag_history DROP CONSTRAINT IF EXISTS uq_tag_history_layout_tag_time;

-- Create a new unique index that handles NULL layout_id correctly
-- (UNIQUE constraints treat NULLs as distinct, so we use COALESCE)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_history_layout_tag_time
    ON tag_history (COALESCE(layout_id, 0), tag_id, "timestamp");

-- ============================================================================
-- tag_history_archive: make layout_id nullable
-- ============================================================================
ALTER TABLE tag_history_archive ALTER COLUMN layout_id DROP NOT NULL;
