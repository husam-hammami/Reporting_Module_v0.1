-- Migration: Create report execution log for audit trail
-- Tracks every distribution rule execution with full metadata
-- Date: 2026-03

CREATE TABLE IF NOT EXISTS report_execution_log (
    id SERIAL PRIMARY KEY,
    rule_id INTEGER NOT NULL,
    report_ids JSONB DEFAULT '[]'::jsonb,
    executed_at TIMESTAMP DEFAULT NOW(),
    time_range_from TIMESTAMP,
    time_range_to TIMESTAMP,
    format VARCHAR(10),
    delivery_method VARCHAR(20),
    recipients JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL,
    error_message TEXT,
    file_names JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_exec_log_rule_id ON report_execution_log(rule_id);
CREATE INDEX IF NOT EXISTS idx_exec_log_executed_at ON report_execution_log(executed_at);
