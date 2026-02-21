-- Migration: Add Bin Activation Fields to Tags Table
-- Description: Adds fields to support dynamic active bin detection based on activation conditions
-- Date: 2025-01

-- ============================================================================
-- Add Bin Activation Fields
-- ============================================================================
ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_bin_tag BOOLEAN DEFAULT FALSE;
ALTER TABLE tags ADD COLUMN IF NOT EXISTS activation_tag_name VARCHAR(255);
ALTER TABLE tags ADD COLUMN IF NOT EXISTS activation_condition VARCHAR(50);
ALTER TABLE tags ADD COLUMN IF NOT EXISTS activation_value VARCHAR(255);

-- Index for bin tags
CREATE INDEX IF NOT EXISTS idx_tags_is_bin_tag ON tags(is_bin_tag) WHERE is_bin_tag = true;

-- Add comment to columns
COMMENT ON COLUMN tags.is_bin_tag IS 'Flag to mark if this tag represents a bin ID that requires activation checking';
COMMENT ON COLUMN tags.activation_tag_name IS 'Tag name to check for activation (e.g., flap_1_selected)';
COMMENT ON COLUMN tags.activation_condition IS 'Condition type: equals, not_equals, true, false, greater_than, less_than';
COMMENT ON COLUMN tags.activation_value IS 'Value to compare against for activation condition';

