-- Add machine info columns to licenses table for desktop app registration.
-- These fields are sent by the EXE on /api/license/register and displayed
-- in the admin Licenses page for machine identification.

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS label VARCHAR(255);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS mac_address VARCHAR(64);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS os_version VARCHAR(255);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS cpu_info VARCHAR(255);
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS ram_gb REAL;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS disk_serial VARCHAR(255);
