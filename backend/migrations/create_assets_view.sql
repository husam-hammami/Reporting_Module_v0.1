-- Plan 5 §16.1 — Materialised view of assets derived from hercules_ai_tag_profiles.
-- Single source of truth for "what assets exist, what's their tag pair status".
--
-- Implemented as a regular VIEW (not MATERIALIZED) since it reads small data and stays
-- consistent automatically; refresh cost is zero. Promote to MATERIALIZED later if needed.

CREATE OR REPLACE VIEW assets_view AS
SELECT
    parent_asset                             AS asset_name,
    COUNT(*)                                  AS total_tags,
    COUNT(*) FILTER (WHERE is_tracked)        AS tracked_tags,
    COUNT(*) FILTER (WHERE is_energy_meter)   AS energy_meters,
    COUNT(*) FILTER (WHERE is_production_counter) AS production_counters,
    BOOL_OR(is_energy_meter)                  AS has_energy_meter,
    BOOL_OR(is_production_counter)            AS has_production_counter,
    (BOOL_OR(is_energy_meter) AND BOOL_OR(is_production_counter)) AS sec_available,
    MIN(created_at)                           AS first_seen_at,
    MAX(updated_at)                           AS last_updated_at
FROM hercules_ai_tag_profiles
WHERE parent_asset IS NOT NULL AND parent_asset <> ''
GROUP BY parent_asset;

COMMENT ON VIEW assets_view IS
    'Plan 5 §16.1 — composed asset list. Drives /api/hercules-ai/asset-health endpoint.';
