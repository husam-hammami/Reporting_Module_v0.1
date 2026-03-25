-- Report Builder tables
-- Stores report templates with grid-based widget layouts (Power BI / Grafana style)

CREATE TABLE IF NOT EXISTS report_builder_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    thumbnail TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    layout_config JSONB DEFAULT '{"widgets":[],"grid":{"cols":12,"rowHeight":60}}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_report_builder_active ON report_builder_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_report_builder_default ON report_builder_templates(is_default);
