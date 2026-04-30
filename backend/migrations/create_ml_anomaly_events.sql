-- Plan 5 §5.5 — anomaly events table (slim version of Plan 3's create_ml_tables.sql).
-- Compatible with Plan 3 when that lands; both migrations use IF NOT EXISTS so order
-- is forgiving. Only the columns Phase B actually uses are required.

CREATE TABLE IF NOT EXISTS ml_anomaly_events (
    id              BIGSERIAL    PRIMARY KEY,
    feature_id      VARCHAR(8)   NOT NULL,           -- 'stuck' | 'flow0' | 'pf_cliff' | 'sec_drift' | (Plan 3 F4 etc.)
    detected_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    window_from     TIMESTAMP    NOT NULL,
    window_to       TIMESTAMP    NOT NULL,
    asset_name      VARCHAR(64),
    tag_name        VARCHAR(128),
    severity        VARCHAR(8)   DEFAULT 'warn' CHECK (severity IN ('info','warn','crit')),
    score           NUMERIC(10,4) NOT NULL DEFAULT 0,
    significance    NUMERIC(10,4) NOT NULL DEFAULT 0,    -- 0..1; passes floor before insert
    delta_pct       NUMERIC(10,2),
    baseline_value  NUMERIC(14,4),
    observed_value  NUMERIC(14,4),
    headline        TEXT,                                 -- plain-language one-liner
    evidence        TEXT,                                 -- plain-language sentence
    omr_at_risk     NUMERIC(10,4) DEFAULT 0,             -- estimated monthly OMR impact
    suppressed      BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_window
    ON ml_anomaly_events(window_to DESC, significance DESC);

CREATE INDEX IF NOT EXISTS idx_anomaly_feature_asset
    ON ml_anomaly_events(feature_id, asset_name, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_anomaly_active
    ON ml_anomaly_events(detected_at DESC)
    WHERE suppressed = FALSE;
