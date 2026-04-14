-- Migration: Add order tracking fields to report_builder_templates
-- and template_id columns to dynamic_orders / dynamic_order_counters
-- so order tracking can be driven by Report Builder templates
-- instead of live_monitor_layouts.

-- 1. Order tracking config on report templates
ALTER TABLE report_builder_templates
ADD COLUMN IF NOT EXISTS order_status_tag_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS order_prefix VARCHAR(50) DEFAULT '',
ADD COLUMN IF NOT EXISTS order_start_value INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS order_stop_value INTEGER DEFAULT 0;

-- 2. Add template_id to dynamic_orders (nullable; new orders use this)
ALTER TABLE dynamic_orders
ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES report_builder_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dynamic_orders_template ON dynamic_orders(template_id);

-- 3. Add template_id to dynamic_order_counters (nullable; new counters use this)
ALTER TABLE dynamic_order_counters
ADD COLUMN IF NOT EXISTS template_id INTEGER REFERENCES report_builder_templates(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dynamic_order_counters_template
ON dynamic_order_counters(template_id) WHERE template_id IS NOT NULL;

-- 4. Report Builder orders insert with template_id only (no Live Monitor layout).
--    Base schema required layout_id NOT NULL; relax so worker/API rows are valid.
ALTER TABLE dynamic_orders ALTER COLUMN layout_id DROP NOT NULL;
ALTER TABLE dynamic_order_counters ALTER COLUMN layout_id DROP NOT NULL;
