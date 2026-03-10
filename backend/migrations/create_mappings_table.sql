-- Migration: Create Mappings Table
-- Description: Stores tag value lookup mappings (e.g., Bin ID -> Material Name)
-- Previously stored in browser localStorage, now properly persisted in database

CREATE TABLE IF NOT EXISTS mappings (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    input_tag VARCHAR(255) NOT NULL,        -- Source tag whose value is looked up
    output_tag_name VARCHAR(255) NOT NULL,  -- Virtual tag name for reports
    lookup JSONB NOT NULL DEFAULT '{}',     -- { "21": "Wheat", "22": "Barley", ... }
    fallback VARCHAR(255) DEFAULT 'Unknown',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mappings_active ON mappings(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_mappings_input_tag ON mappings(input_tag);
CREATE INDEX IF NOT EXISTS idx_mappings_output_tag ON mappings(output_tag_name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mappings_name_unique ON mappings(LOWER(name));

-- Update trigger
CREATE TRIGGER update_mappings_updated_at BEFORE UPDATE ON mappings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
