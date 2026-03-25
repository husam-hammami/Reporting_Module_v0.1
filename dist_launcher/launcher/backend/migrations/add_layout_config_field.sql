-- Migration: Add config JSONB field to live_monitor_layouts
-- This allows storing full layout configuration (including sections) as JSON

-- Add config field to store full layout as JSONB
ALTER TABLE live_monitor_layouts 
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

-- Add index for config queries (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_layouts_config ON live_monitor_layouts USING GIN (config);

-- Add comment
COMMENT ON COLUMN live_monitor_layouts.config IS 'Full layout configuration stored as JSONB, including sections, tables, columns, and all settings';

