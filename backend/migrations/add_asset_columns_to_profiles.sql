-- Plan 5 §16.3 — adds asset linkage + SEC pair declaration columns to existing AI profile table.
-- Safe, additive, idempotent.

ALTER TABLE hercules_ai_tag_profiles
    ADD COLUMN IF NOT EXISTS parent_asset           VARCHAR(64) DEFAULT '',
    ADD COLUMN IF NOT EXISTS is_energy_meter        BOOLEAN     DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_production_counter  BOOLEAN     DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_hai_profiles_parent_asset
    ON hercules_ai_tag_profiles(parent_asset)
    WHERE parent_asset <> '';

-- Auto-derive parent_asset from existing tag_name prefix the first time only.
-- (Users keep ability to override via Setup wizard.)
UPDATE hercules_ai_tag_profiles
   SET parent_asset = CASE
       WHEN tag_name ILIKE 'mil_b_%'   OR tag_name ILIKE 'millb_%'  THEN 'Mill B'
       WHEN tag_name ILIKE 'c32_%'                                   THEN 'C32 Mill'
       WHEN tag_name ILIKE 'm30_%'                                   THEN 'M30 Mill'
       WHEN tag_name ILIKE 'm31_%'                                   THEN 'M31 Mill'
       WHEN tag_name ILIKE 'pasta_1_%'                               THEN 'Pasta 1'
       WHEN tag_name ILIKE 'pasta_4_%'                               THEN 'Pasta 4'
       WHEN tag_name ILIKE 'pasta_e_%'                               THEN 'Pasta E'
       ELSE parent_asset
   END
 WHERE COALESCE(parent_asset, '') = '';

-- Auto-flag obvious energy meters and production counters.
UPDATE hercules_ai_tag_profiles
   SET is_energy_meter = TRUE
 WHERE is_energy_meter = FALSE
   AND tag_name ILIKE '%total_active_energy%';

UPDATE hercules_ai_tag_profiles
   SET is_production_counter = TRUE
 WHERE is_production_counter = FALSE
   AND tag_type = 'counter'
   AND (tag_name ILIKE '%totalizer%' OR tag_name ILIKE '%total_kg%');
