-- Migration: Add rich machine info columns to licenses table.
-- Allows the admin to see hardware details and assign a human-readable label.

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS mac_address VARCHAR(64);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS os_version VARCHAR(255);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS cpu_info VARCHAR(255);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS ram_gb REAL;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS disk_serial VARCHAR(255);
