-- Historian range queries often filter by tag_id + time only (segment engine, by-tags).
-- Existing idx_tag_history_layout_tag_time leads with layout_id; this index matches
-- those scans and speeds long-window LAG/LEAD over tag_history.

CREATE INDEX IF NOT EXISTS idx_tag_history_tag_timestamp
    ON tag_history (tag_id, "timestamp");
