-- Per-machine module entitlements (Digital Twin, Hercules AI).
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS enable_digital_twin BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS enable_atlas_ai BOOLEAN NOT NULL DEFAULT TRUE;
