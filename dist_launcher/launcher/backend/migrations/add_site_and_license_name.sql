-- Migration: Add superadmin-editable site_name and license_name columns to licenses table.

ALTER TABLE licenses ADD COLUMN IF NOT EXISTS site_name TEXT;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS license_name TEXT;
