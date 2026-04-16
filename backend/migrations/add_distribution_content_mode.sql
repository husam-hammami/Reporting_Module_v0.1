-- Add content_mode to distribution_rules.
-- Replaces the boolean include_ai_summary with a 3-way option:
--   'report_only'    = report attachments, no AI (default)
--   'report_with_ai' = report attachments + AI summary
--   'ai_only'        = AI summary only, no attachments

ALTER TABLE distribution_rules
    ADD COLUMN IF NOT EXISTS content_mode VARCHAR(20) DEFAULT 'report_only';

-- Backfill: existing rules with include_ai_summary=true become 'report_with_ai'
UPDATE distribution_rules
SET content_mode = 'report_with_ai'
WHERE include_ai_summary = true AND content_mode = 'report_only';
