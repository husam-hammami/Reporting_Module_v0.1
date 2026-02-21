-- Migration: Create Tag Historian Tables (Single Historian)
-- Description: Central plant-wide historian tables for tag history and archive.
--              Replaces per-layout live/archive tables with one tag_history + tag_history_archive.
-- Date: 2025-02
-- Phase: 1.1 (SINGLE_HISTORIAN_MIGRATION_PLAN.md)

-- ============================================================================
-- tag_history (main historian — one row per layout_id, tag_id, timestamp)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tag_history (
    id BIGSERIAL PRIMARY KEY,
    layout_id INTEGER REFERENCES live_monitor_layouts(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,

    -- Value for display/reporting (BOOL stored as 0/1)
    value DOUBLE PRECISION NOT NULL,

    -- Counter/reset handling (optional)
    value_raw DOUBLE PRECISION,
    value_delta DOUBLE PRECISION,
    is_counter BOOLEAN DEFAULT FALSE,

    -- Industrial quality (SCADA standard)
    quality_code VARCHAR(20) NOT NULL DEFAULT 'GOOD',

    -- Time and optional order context
    "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
    order_name TEXT,

    CONSTRAINT chk_quality_code CHECK (quality_code IN ('GOOD', 'BAD', 'STALE', 'COMM_ERROR'))
);

-- Unique index for deduplication (COALESCE handles NULL layout_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_history_layout_tag_time
    ON tag_history (COALESCE(layout_id, 0), tag_id, "timestamp");

-- Indexes for time-range and layout/tag queries (partitioning-friendly)
CREATE INDEX IF NOT EXISTS idx_tag_history_layout_tag_time ON tag_history (layout_id, tag_id, "timestamp");
CREATE INDEX IF NOT EXISTS idx_tag_history_timestamp ON tag_history ("timestamp");

-- ============================================================================
-- tag_history_archive (hourly aggregated — for reporting/KPI)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tag_history_archive (
    id BIGSERIAL PRIMARY KEY,
    layout_id INTEGER REFERENCES live_monitor_layouts(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,

    value DOUBLE PRECISION NOT NULL,
    value_raw DOUBLE PRECISION,
    value_delta DOUBLE PRECISION,
    is_counter BOOLEAN DEFAULT FALSE,
    quality_code VARCHAR(20) NOT NULL DEFAULT 'GOOD',

    archive_hour TIMESTAMP NOT NULL,
    order_name TEXT,

    CONSTRAINT chk_quality_code_archive CHECK (quality_code IN ('GOOD', 'BAD', 'STALE', 'COMM_ERROR'))
);

CREATE INDEX IF NOT EXISTS idx_tag_history_archive_layout_tag_hour ON tag_history_archive (layout_id, tag_id, archive_hour);
CREATE INDEX IF NOT EXISTS idx_tag_history_archive_hour ON tag_history_archive (archive_hour);
