-- Migration: Create distribution_rules table for scheduled report delivery
-- Date: 2026-03

CREATE TABLE IF NOT EXISTS distribution_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL DEFAULT '',
    report_id INTEGER DEFAULT 0,
    report_ids JSONB DEFAULT '[]'::jsonb,
    delivery_method VARCHAR(20) NOT NULL DEFAULT 'email',
    recipients JSONB DEFAULT '[]'::jsonb,
    save_path TEXT DEFAULT '',
    format VARCHAR(10) DEFAULT 'pdf',
    schedule_type VARCHAR(10) NOT NULL DEFAULT 'daily',
    schedule_time TIME NOT NULL DEFAULT '08:00',
    schedule_day_of_week INTEGER DEFAULT NULL,
    schedule_day_of_month INTEGER DEFAULT NULL,
    enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP DEFAULT NULL,
    last_run_status VARCHAR(20) DEFAULT NULL,
    last_run_error TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
