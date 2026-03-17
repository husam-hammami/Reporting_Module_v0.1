-- License activation table for online machine registration.
-- Each row represents one customer machine that has called /api/license/register.

CREATE TABLE IF NOT EXISTS licenses (
    id SERIAL PRIMARY KEY,
    machine_id VARCHAR(128) NOT NULL UNIQUE,
    user_id VARCHAR(255),
    hostname VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    expiry DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_seen_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licenses_machine_id ON licenses(machine_id);
CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
