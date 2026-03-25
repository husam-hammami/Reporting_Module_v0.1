-- Migration: Add dynamic monitoring tables and fields
-- This migration adds support for dynamic data storage and archiving

-- Add order tracking fields to live_monitor_layouts
ALTER TABLE live_monitor_layouts 
ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS published_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS order_status_tag_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS order_prefix VARCHAR(50) DEFAULT '',
ADD COLUMN IF NOT EXISTS order_start_value INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS order_stop_value INTEGER DEFAULT 0;

-- Create table to track active monitors
CREATE TABLE IF NOT EXISTS dynamic_monitor_registry (
    id SERIAL PRIMARY KEY,
    layout_id INTEGER NOT NULL REFERENCES live_monitor_layouts(id) ON DELETE CASCADE,
    layout_name VARCHAR(255) NOT NULL,
    live_table_name VARCHAR(255) NOT NULL UNIQUE,
    archive_table_name VARCHAR(255) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    last_archive_at TIMESTAMP,
    UNIQUE(layout_id)
);

CREATE INDEX IF NOT EXISTS idx_monitor_registry_active 
ON dynamic_monitor_registry(is_active) WHERE is_active = true;

-- Create table to track order counters per layout
CREATE TABLE IF NOT EXISTS dynamic_order_counters (
    id SERIAL PRIMARY KEY,
    layout_id INTEGER NOT NULL REFERENCES live_monitor_layouts(id) ON DELETE CASCADE,
    layout_name VARCHAR(255) NOT NULL,
    current_counter INTEGER DEFAULT 0,
    last_order_name VARCHAR(255),
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(layout_id)
);

-- Create table to track active orders
CREATE TABLE IF NOT EXISTS dynamic_orders (
    id SERIAL PRIMARY KEY,
    layout_id INTEGER NOT NULL REFERENCES live_monitor_layouts(id) ON DELETE CASCADE,
    order_name VARCHAR(255) NOT NULL,
    order_number INTEGER NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    status VARCHAR(50) DEFAULT 'running', -- 'running' or 'completed'
    duration_seconds NUMERIC,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dynamic_orders_layout ON dynamic_orders(layout_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_orders_name ON dynamic_orders(order_name);
CREATE INDEX IF NOT EXISTS idx_dynamic_orders_status ON dynamic_orders(status);

