-- Migration: Add must_change_password flag to users table
-- Forces default admin to change password on first login
-- Date: 2026-03

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
