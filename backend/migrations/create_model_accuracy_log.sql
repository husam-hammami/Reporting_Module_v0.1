-- Plan 5 §13.1 + §16.2 — Forecast accuracy log. Throttled inserts, 90-day retention.

CREATE TABLE IF NOT EXISTS model_accuracy_log (
    id              BIGSERIAL    PRIMARY KEY,
    feature         VARCHAR(32)  NOT NULL,    -- 'shift_pace' | 'daily_bill' | 'pf_trend' | 'yield_drift' | 'sec_forecast'
    asset_name      VARCHAR(64),
    code_sha        VARCHAR(40),              -- §16.2: segments MAPE history by formula version
    predicted_at    TIMESTAMP    NOT NULL,
    horizon_minutes INT          NOT NULL,
    target_at       TIMESTAMP    NOT NULL,
    predicted_value NUMERIC(14,4) NOT NULL,
    predicted_p10   NUMERIC(14,4),
    predicted_p90   NUMERIC(14,4),
    actual_value    NUMERIC(14,4),            -- filled by accuracy_closer
    abs_error       NUMERIC(14,4),
    pct_error       NUMERIC(8,4),
    band_hit        BOOLEAN,
    closed          BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acclog_feature_asset_time
    ON model_accuracy_log(feature, asset_name, target_at DESC);

CREATE INDEX IF NOT EXISTS idx_acclog_open
    ON model_accuracy_log(target_at)
    WHERE closed = FALSE;

CREATE INDEX IF NOT EXISTS idx_acclog_created
    ON model_accuracy_log(created_at);

COMMENT ON TABLE model_accuracy_log IS
    'Plan 5 §13.1 — every forecast logs predicted, accuracy_closer fills actuals nightly. 90d retention.';
