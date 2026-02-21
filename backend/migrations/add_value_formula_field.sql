-- Migration: Add Value Formula Field to Tags Table
-- Description: Adds value_formula field to allow formula-based transformations of PLC tag values
-- Date: 2025-01

-- ============================================================================
-- Add Value Formula Field
-- ============================================================================
ALTER TABLE tags ADD COLUMN IF NOT EXISTS value_formula TEXT;

-- Add comment to column
COMMENT ON COLUMN tags.value_formula IS 'Formula to transform raw PLC value (e.g., value * 0.277778 for t/h to kg/s). Use "value" as variable name. If provided, this formula will be used instead of scaling multiplier.';

