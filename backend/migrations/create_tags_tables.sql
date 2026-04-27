-- Migration: Create Tags and Live Monitor Tables
-- Description: Creates tables for dynamic tag-based live monitoring system
-- Date: 2024-12

-- ============================================================================
-- Tags Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    tag_name VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    source_type VARCHAR(50) NOT NULL DEFAULT 'PLC', -- 'PLC', 'Formula', 'Mapping', 'Manual'
    
    -- PLC-specific fields (when source_type = 'PLC')
    db_number INTEGER,
    "offset" INTEGER,
    data_type VARCHAR(20) NOT NULL DEFAULT 'REAL', -- 'BOOL', 'INT', 'DINT', 'REAL', 'STRING', 'WSTRING'
    bit_position INTEGER, -- For BOOL type (0-7)
    string_length INTEGER DEFAULT 40, -- For STRING / WSTRING (max characters)
    byte_swap BOOLEAN DEFAULT false, -- For REAL type (endianness) - false = big-endian (standard for Siemens)
    
    -- Display fields
    unit VARCHAR(20),
    scaling DECIMAL(10,4) DEFAULT 1.0,
    decimal_places INTEGER DEFAULT 2,
    
    -- Formula/Mapping fields (when source_type = 'Formula' or 'Mapping')
    formula TEXT, -- Formula expression
    mapping_name VARCHAR(255), -- Mapping rule name
    
    -- Metadata
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_source_type CHECK (source_type IN ('PLC', 'Formula', 'Mapping', 'Manual')),
    CONSTRAINT chk_data_type CHECK (data_type IN ('BOOL', 'INT', 'DINT', 'REAL', 'STRING', 'WSTRING')),
    CONSTRAINT chk_bit_position CHECK (bit_position IS NULL OR (bit_position >= 0 AND bit_position <= 7))
);

-- Indexes for tags
CREATE INDEX IF NOT EXISTS idx_tags_active ON tags(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tags_db_offset ON tags(db_number, "offset") WHERE source_type = 'PLC';
CREATE INDEX IF NOT EXISTS idx_tags_source_type ON tags(source_type);

-- ============================================================================
-- Tag Groups Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS tag_groups (
    id SERIAL PRIMARY KEY,
    group_name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for tag groups
CREATE INDEX IF NOT EXISTS idx_tag_groups_active ON tag_groups(is_active) WHERE is_active = true;

-- ============================================================================
-- Tag Group Members (Junction Table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tag_group_members (
    id SERIAL PRIMARY KEY,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    group_id INTEGER NOT NULL REFERENCES tag_groups(id) ON DELETE CASCADE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Ensure unique tag-group combination
    UNIQUE(tag_id, group_id)
);

-- Indexes for tag_group_members
CREATE INDEX IF NOT EXISTS idx_tag_group_members_tag ON tag_group_members(tag_id);
CREATE INDEX IF NOT EXISTS idx_tag_group_members_group ON tag_group_members(group_id);

-- ============================================================================
-- Live Monitor Layouts Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS live_monitor_layouts (
    id SERIAL PRIMARY KEY,
    layout_name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for layouts
CREATE INDEX IF NOT EXISTS idx_layouts_active ON live_monitor_layouts(is_active) WHERE is_active = true;

-- ============================================================================
-- Live Monitor Sections Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS live_monitor_sections (
    id SERIAL PRIMARY KEY,
    layout_id INTEGER NOT NULL REFERENCES live_monitor_layouts(id) ON DELETE CASCADE,
    section_name VARCHAR(255) NOT NULL,
    section_type VARCHAR(50) NOT NULL, -- 'Table', 'KPI'
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_section_type CHECK (section_type IN ('Table', 'KPI'))
);

-- Index for sections
CREATE INDEX IF NOT EXISTS idx_sections_layout ON live_monitor_sections(layout_id);
CREATE INDEX IF NOT EXISTS idx_sections_active ON live_monitor_sections(is_active) WHERE is_active = true;

-- ============================================================================
-- Live Monitor Columns Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS live_monitor_columns (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES live_monitor_sections(id) ON DELETE CASCADE,
    column_label VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL, -- 'Tag', 'Formula', 'Mapping', 'Text'
    tag_name VARCHAR(255), -- Tag name (if source_type = 'Tag')
    formula TEXT, -- Formula expression (if source_type = 'Formula')
    mapping_name VARCHAR(255), -- Mapping rule name (if source_type = 'Mapping')
    text_value TEXT, -- Static text (if source_type = 'Text')
    unit VARCHAR(20),
    decimals INTEGER DEFAULT 2,
    alignment VARCHAR(10) DEFAULT 'left', -- 'left', 'center', 'right'
    width INTEGER, -- Column width in pixels or percentage
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_column_source_type CHECK (source_type IN ('Tag', 'Formula', 'Mapping', 'Text')),
    CONSTRAINT chk_column_alignment CHECK (alignment IN ('left', 'center', 'right'))
);

-- Index for columns
CREATE INDEX IF NOT EXISTS idx_columns_section ON live_monitor_columns(section_id);

-- ============================================================================
-- Table Section Configuration (for Table sections)
-- ============================================================================
CREATE TABLE IF NOT EXISTS live_monitor_table_config (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES live_monitor_sections(id) ON DELETE CASCADE,
    tag_group_id INTEGER REFERENCES tag_groups(id) ON DELETE SET NULL,
    row_mode VARCHAR(20) DEFAULT 'Dynamic', -- 'Dynamic', 'Static'
    refresh_interval INTEGER DEFAULT 1, -- Update frequency in seconds
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_row_mode CHECK (row_mode IN ('Dynamic', 'Static')),
    UNIQUE(section_id)
);

-- ============================================================================
-- KPI Section Configuration (for KPI sections)
-- ============================================================================
CREATE TABLE IF NOT EXISTS live_monitor_kpi_config (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES live_monitor_sections(id) ON DELETE CASCADE,
    card_label VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL, -- 'Tag', 'Formula'
    tag_name VARCHAR(255), -- Tag name (if source_type = 'Tag')
    formula TEXT, -- Formula expression (if source_type = 'Formula')
    unit VARCHAR(20),
    decimals INTEGER DEFAULT 2,
    icon VARCHAR(100), -- Icon name/class
    color VARCHAR(50), -- Color code
    size VARCHAR(20) DEFAULT 'Medium', -- 'Small', 'Medium', 'Large'
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_kpi_source_type CHECK (source_type IN ('Tag', 'Formula')),
    CONSTRAINT chk_kpi_size CHECK (size IN ('Small', 'Medium', 'Large'))
);

-- Index for KPI config
CREATE INDEX IF NOT EXISTS idx_kpi_config_section ON live_monitor_kpi_config(section_id);

-- ============================================================================
-- Update Timestamp Trigger Function
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_tags_updated_at BEFORE UPDATE ON tags
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tag_groups_updated_at BEFORE UPDATE ON tag_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_layouts_updated_at BEFORE UPDATE ON live_monitor_layouts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sections_updated_at BEFORE UPDATE ON live_monitor_sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_columns_updated_at BEFORE UPDATE ON live_monitor_columns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_table_config_updated_at BEFORE UPDATE ON live_monitor_table_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kpi_config_updated_at BEFORE UPDATE ON live_monitor_kpi_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

