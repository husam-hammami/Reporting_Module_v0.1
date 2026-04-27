-- ============================================================
-- Add value_text column to tag_history and tag_history_archive
-- ============================================================
-- Background:
--   tag_history.value is DOUBLE PRECISION NOT NULL, so STRING tags
--   (e.g. material/product names) couldn't be persisted by the
--   historian worker — it would silently drop those samples.
--
-- This migration:
--   1. Adds a nullable TEXT column "value_text" to both tables.
--   2. Drops the NOT NULL constraint on "value" so text-only rows
--      can be inserted with value=NULL.
--
-- Idempotent: safe to re-run on every backend start-up.
-- ============================================================

ALTER TABLE tag_history          ADD COLUMN IF NOT EXISTS value_text TEXT;
ALTER TABLE tag_history          ALTER COLUMN value DROP NOT NULL;

ALTER TABLE tag_history_archive  ADD COLUMN IF NOT EXISTS value_text TEXT;
ALTER TABLE tag_history_archive  ALTER COLUMN value DROP NOT NULL;
