-- Migration: Add is_counter to Tags Table (Single Historian — Critical Improvement #1)
-- Description: Marks cumulative/counter tags so historian uses SUM(value_delta) over time instead of AVG(value).
--              Enables correct historical KPI for counters (e.g. total kWh, production count) across resets.
-- Date: 2026-02
-- Reference: SINGLE_HISTORIAN_MIGRATION_PLAN.md

ALTER TABLE tags ADD COLUMN IF NOT EXISTS is_counter BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN tags.is_counter IS 'If true, tag is a cumulative counter; historian stores value_delta and aggregates with SUM. If false, uses AVG(value).';
