-- Bins and materials tables for Bin and Material pages.
-- Run via: python run_bins_materials_migration.py (uses same DB as app).
-- Database: same as app (POSTGRES_DB, default dynamic_db_hercules).

-- Materials first (bins.material_id references materials.id)
CREATE TABLE IF NOT EXISTS materials (
    id             SERIAL PRIMARY KEY,
    material_name  VARCHAR(100) NOT NULL,
    material_code  VARCHAR(50) NOT NULL,
    category       VARCHAR(50) NOT NULL,
    is_released    BOOLEAN DEFAULT TRUE
);

-- Bins (references materials)
CREATE TABLE IF NOT EXISTS bins (
    id           SERIAL PRIMARY KEY,
    bin_name     VARCHAR(50) NOT NULL,
    bin_code     VARCHAR(50) NOT NULL,
    material_id  INTEGER REFERENCES materials(id)
);

CREATE INDEX IF NOT EXISTS idx_bins_material_id ON bins(material_id);
CREATE INDEX IF NOT EXISTS idx_bins_bin_code ON bins(bin_code);
