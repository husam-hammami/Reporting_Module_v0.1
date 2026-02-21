-- Migration: Add Line Running Tag Fields to live_monitor_layouts
-- Description: Adds fields to support line running status tag configuration
-- Date: 2025-01

-- ============================================================================
-- Add Line Running Tag Fields
-- ============================================================================
ALTER TABLE live_monitor_layouts 
ADD COLUMN IF NOT EXISTS include_line_running_tag BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS line_running_tag_name VARCHAR(255);

-- Add comment to columns
COMMENT ON COLUMN live_monitor_layouts.include_line_running_tag IS 'Flag to indicate if this layout should display line running status';
COMMENT ON COLUMN live_monitor_layouts.line_running_tag_name IS 'Name of the BOOL tag to use for line running status (1 = Running, 0 = Stopped)';

