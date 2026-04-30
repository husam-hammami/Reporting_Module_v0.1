-- Plan 6 hotfix: assets_view always returns assets, regardless of whether
-- parent_asset was successfully bulk-populated by add_asset_columns_to_profiles.sql.
--
-- Falls through (first non-empty wins):
--   1) explicit parent_asset value
--   2) tag_name pattern match (Salalah-known)
--   3) line_name from AI scan classification
--
-- Same energy_meter / production_counter detection: explicit flag OR tag_name pattern.
-- This means the view is correct even on installs where the bulk UPDATE in
-- add_asset_columns_to_profiles.sql didn't run cleanly.

CREATE OR REPLACE VIEW assets_view AS
SELECT
    asset_name,
    COUNT(*)                                  AS total_tags,
    COUNT(*) FILTER (WHERE is_tracked)        AS tracked_tags,
    COUNT(*) FILTER (WHERE is_e)              AS energy_meters,
    COUNT(*) FILTER (WHERE is_p)              AS production_counters,
    BOOL_OR(is_e)                             AS has_energy_meter,
    BOOL_OR(is_p)                             AS has_production_counter,
    (BOOL_OR(is_e) AND BOOL_OR(is_p))         AS sec_available,
    MIN(created_at)                           AS first_seen_at,
    MAX(updated_at)                           AS last_updated_at
FROM (
    SELECT
        CASE
            WHEN parent_asset IS NOT NULL AND TRIM(parent_asset) <> ''
                THEN parent_asset
            WHEN tag_name ILIKE 'mil_b_%'   OR tag_name ILIKE 'millb_%' THEN 'Mill B'
            WHEN tag_name ILIKE 'c32_%'                                  THEN 'C32 Mill'
            WHEN tag_name ILIKE 'm30_%'                                  THEN 'M30 Mill'
            WHEN tag_name ILIKE 'm31_%'                                  THEN 'M31 Mill'
            WHEN tag_name ILIKE 'pasta_1_%'                              THEN 'Pasta 1'
            WHEN tag_name ILIKE 'pasta_4_%'                              THEN 'Pasta 4'
            WHEN tag_name ILIKE 'pasta_e_%'                              THEN 'Pasta E'
            WHEN line_name IS NOT NULL AND TRIM(line_name) <> ''
                THEN line_name
            ELSE NULL
        END AS asset_name,
        is_tracked,
        -- Energy meter: explicit flag OR tag_name suggests it
        (is_energy_meter OR tag_name ILIKE '%total_active_energy%')        AS is_e,
        -- Production counter: explicit flag OR tag_name suggests it
        (is_production_counter
         OR (tag_type = 'counter' AND (tag_name ILIKE '%totalizer%' OR tag_name ILIKE '%total_kg%'))
        )                                                                  AS is_p,
        created_at, updated_at
    FROM hercules_ai_tag_profiles
) p
WHERE asset_name IS NOT NULL AND TRIM(asset_name) <> ''
GROUP BY asset_name;

COMMENT ON VIEW assets_view IS
    'Plan 6 hotfix: self-healing — derives asset_name from parent_asset, tag_name pattern, or line_name; auto-flags energy/production by tag name.';
