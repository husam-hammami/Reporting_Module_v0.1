ALTER TABLE distribution_rules
    ADD COLUMN IF NOT EXISTS include_ai_summary BOOLEAN DEFAULT false;
