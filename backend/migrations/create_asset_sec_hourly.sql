-- Plan 5 §4.2 — Hourly SEC (Specific Energy Consumption) per asset, materialised hourly.
-- Computed by ai_money.sec.refresh_hour() called from dynamic_archive_worker.

CREATE TABLE IF NOT EXISTS asset_sec_hourly (
    asset_name      VARCHAR(64) NOT NULL,
    hour_start      TIMESTAMP   NOT NULL,
    kwh_consumed    NUMERIC(14,4),
    kg_produced     NUMERIC(14,4),
    sec_kwh_per_t   NUMERIC(10,4),
    cost_omr        NUMERIC(10,4),
    revenue_omr     NUMERIC(10,4),
    computed_at     TIMESTAMP   DEFAULT NOW(),
    PRIMARY KEY (asset_name, hour_start)
);

-- Index for sweep / "last 30 days" queries
CREATE INDEX IF NOT EXISTS idx_sec_hourly_time
    ON asset_sec_hourly(hour_start DESC);

-- Index for asset-scoped queries
CREATE INDEX IF NOT EXISTS idx_sec_hourly_asset_time
    ON asset_sec_hourly(asset_name, hour_start DESC);
