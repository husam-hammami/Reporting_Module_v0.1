-- Migration: Prevent duplicate universal rows in tag_history_archive
-- Description: One row per (tag_id, archive_hour) when layout_id IS NULL.
--              Enables INSERT ... ON CONFLICT DO NOTHING in dynamic_archive_worker.
-- Date: 2026-02

-- Partial unique index: universal historian rows (layout_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_history_archive_universal_tag_hour
    ON tag_history_archive (tag_id, archive_hour)
    WHERE layout_id IS NULL;
