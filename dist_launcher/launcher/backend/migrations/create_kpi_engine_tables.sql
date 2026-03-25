-- Migration: Create KPI Engine Tables (KPI_ENGINE_PLAN.md Phase 2)
-- Description: kpi_config, kpi_tag_mapping, kpi_history for historian-based KPI calculation.
-- Date: 2025-02
-- Depends on: create_tags_tables.sql, create_tag_history_tables.sql (tags, live_monitor_layouts, tag_history, tag_history_archive)

-- ============================================================================
-- kpi_config
-- ============================================================================
CREATE TABLE IF NOT EXISTS kpi_config (
    id SERIAL PRIMARY KEY,
    kpi_name VARCHAR(255) NOT NULL,
    layout_id INTEGER NULL REFERENCES live_monitor_layouts(id) ON DELETE SET NULL,
    formula_expression TEXT NOT NULL,
    aggregation_type VARCHAR(50) DEFAULT 'instant',
    unit VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER NULL,
    CONSTRAINT chk_aggregation_type CHECK (aggregation_type IN ('instant', 'sum', 'avg', 'ratio'))
);

CREATE INDEX IF NOT EXISTS idx_kpi_config_layout ON kpi_config(layout_id);
CREATE INDEX IF NOT EXISTS idx_kpi_config_active ON kpi_config(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE kpi_config IS 'Plant/layout-level KPI definitions with formula and aggregation (KPI Engine)';

-- ============================================================================
-- kpi_tag_mapping (alias_name in formula -> tag_id)
-- ============================================================================
CREATE TABLE IF NOT EXISTS kpi_tag_mapping (
    id SERIAL PRIMARY KEY,
    kpi_id INTEGER NOT NULL REFERENCES kpi_config(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
    alias_name VARCHAR(255) NOT NULL,
    UNIQUE(kpi_id, alias_name)
);

CREATE INDEX IF NOT EXISTS idx_kpi_tag_mapping_kpi ON kpi_tag_mapping(kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpi_tag_mapping_tag ON kpi_tag_mapping(tag_id);

COMMENT ON TABLE kpi_tag_mapping IS 'Maps formula variable names (alias_name) to tags for KPI calculation';

-- ============================================================================
-- kpi_history (optional: cached KPI values for trends/reports)
-- ============================================================================
CREATE TABLE IF NOT EXISTS kpi_history (
    id BIGSERIAL PRIMARY KEY,
    kpi_id INTEGER NOT NULL REFERENCES kpi_config(id) ON DELETE CASCADE,
    layout_id INTEGER NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP NOT NULL,
    period_type VARCHAR(20) NULL,
    CONSTRAINT chk_period_type CHECK (period_type IS NULL OR period_type IN ('instant', 'hour', 'shift', 'day'))
);

CREATE INDEX IF NOT EXISTS idx_kpi_history_kpi_time ON kpi_history(kpi_id, "timestamp");
CREATE INDEX IF NOT EXISTS idx_kpi_history_layout_time ON kpi_history(layout_id, "timestamp");

COMMENT ON TABLE kpi_history IS 'Cached KPI values for trends and report performance (optional write on schedule or on-demand)';
