-- Plan 5 §13.4 — User feedback on raised anomalies, drives auto-tightening of detector thresholds.
-- Note: ml_anomaly_events is created by Plan 3's create_ml_tables.sql (separate plan).
-- This table is ours; it FK-links by id but does NOT hard-fail if ml_anomaly_events is missing
-- (so this plan can ship before Plan 3).

CREATE TABLE IF NOT EXISTS ml_anomaly_feedback (
    id              BIGSERIAL    PRIMARY KEY,
    anomaly_id      BIGINT       NOT NULL,                    -- soft FK to ml_anomaly_events.id
    user_id         INT,
    label           VARCHAR(8)   NOT NULL CHECK (label IN ('useful','noise')),
    note            TEXT,
    created_at      TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomfb_anomaly
    ON ml_anomaly_feedback(anomaly_id);

CREATE INDEX IF NOT EXISTS idx_anomfb_label_time
    ON ml_anomaly_feedback(label, created_at DESC);

COMMENT ON TABLE ml_anomaly_feedback IS
    'Plan 5 §13.4 — anomaly precision feedback loop. Below 70% precision over 30 events triggers auto-tighten.';
