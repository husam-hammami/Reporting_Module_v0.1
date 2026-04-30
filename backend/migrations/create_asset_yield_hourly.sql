-- Plan 5 §4.5 — Hourly extraction-yield drift tracking (Mill B specific, but keyed by asset).
-- Computed alongside asset_sec_hourly by ai_money.yield_drift.refresh_hour().

CREATE TABLE IF NOT EXISTS asset_yield_hourly (
    asset_name             VARCHAR(64) NOT NULL,
    hour_start             TIMESTAMP   NOT NULL,
    flour_pct              NUMERIC(6,2),
    bran_pct               NUMERIC(6,2),
    b1_pct                 NUMERIC(6,2),
    intake_kg              NUMERIC(14,4),
    flour_kg               NUMERIC(14,4),
    yield_revenue_omr      NUMERIC(10,4),
    drift_omr_vs_baseline  NUMERIC(10,4),
    computed_at            TIMESTAMP   DEFAULT NOW(),
    PRIMARY KEY (asset_name, hour_start)
);

CREATE INDEX IF NOT EXISTS idx_yield_hourly_time
    ON asset_yield_hourly(hour_start DESC);

CREATE INDEX IF NOT EXISTS idx_yield_hourly_asset_time
    ON asset_yield_hourly(asset_name, hour_start DESC);
