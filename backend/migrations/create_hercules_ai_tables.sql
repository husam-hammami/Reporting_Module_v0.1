CREATE TABLE IF NOT EXISTS hercules_ai_tag_profiles (
    id SERIAL PRIMARY KEY,
    tag_name VARCHAR(255) NOT NULL UNIQUE,
    label VARCHAR(255) DEFAULT '',
    tag_type VARCHAR(50) DEFAULT 'unknown',
    line_name VARCHAR(100) DEFAULT '',
    category VARCHAR(100) DEFAULT '',
    source VARCHAR(20) DEFAULT 'auto',
    is_tracked BOOLEAN DEFAULT true,
    is_reviewed BOOLEAN DEFAULT false,
    confidence REAL DEFAULT 0.0,
    evidence JSONB DEFAULT '{}',
    user_notes TEXT DEFAULT '',
    data_status VARCHAR(20) DEFAULT 'unknown',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hercules_ai_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hai_profiles_line ON hercules_ai_tag_profiles(line_name);
CREATE INDEX IF NOT EXISTS idx_hai_profiles_reviewed ON hercules_ai_tag_profiles(is_reviewed);
CREATE INDEX IF NOT EXISTS idx_hai_profiles_tracked ON hercules_ai_tag_profiles(is_tracked);

-- Reuse trigger from create_tags_tables.sql (runs first in MIGRATION_ORDER)
CREATE TRIGGER update_hai_profiles_modtime
    BEFORE UPDATE ON hercules_ai_tag_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hai_config_modtime
    BEFORE UPDATE ON hercules_ai_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
