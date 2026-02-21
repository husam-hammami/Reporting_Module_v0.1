"""
Historian Helpers (Single Historian — Phase 1.3)

Provides tag_name → tag_id mapping for dual-write into tag_history.
Cache is reloaded every CACHE_TTL_SECONDS so the worker does not hit the DB every second.
Reload on interval handles tags added/renamed/deactivated while the worker runs.
"""

import logging
import time
from contextlib import closing
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

# Cache: tag_name → {tag_id, is_counter} for active tags. Reload every CACHE_TTL_SECONDS.
_tag_metadata_cache = None
_tag_metadata_cache_time = 0.0
CACHE_TTL_SECONDS = 60


def _load_tag_metadata(db_connection_func, force_reload=False):
    """Load tag_name → {tag_id, is_counter}. Uses tags.is_counter (run add_is_counter migration first)."""
    global _tag_metadata_cache, _tag_metadata_cache_time
    now = time.time()
    if not force_reload and _tag_metadata_cache is not None and (now - _tag_metadata_cache_time) < CACHE_TTL_SECONDS:
        return _tag_metadata_cache
    try:
        with closing(db_connection_func()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            try:
                cursor.execute("""
                    SELECT id, tag_name, COALESCE(is_counter, false) AS is_counter
                    FROM tags WHERE is_active = TRUE
                """)
            except Exception:
                cursor.execute("SELECT id, tag_name FROM tags WHERE is_active = TRUE")
            rows = cursor.fetchall()
            _tag_metadata_cache = {}
            for row in rows:
                r = dict(row)
                _tag_metadata_cache[r["tag_name"]] = {
                    "tag_id": r["id"],
                    "is_counter": bool(r.get("is_counter", False)),
                }
            _tag_metadata_cache_time = now
            logger.debug(f"[Historian] Tag metadata reloaded: {len(_tag_metadata_cache)} active tags")
            return _tag_metadata_cache
    except Exception as e:
        logger.error(f"[Historian] Failed to load tag metadata: {e}", exc_info=True)
        return _tag_metadata_cache if _tag_metadata_cache is not None else {}


def get_tag_name_to_id_map(db_connection_func, force_reload=False):
    """
    Return a dict mapping tag_name → tag_id for all active tags.
    Cached for CACHE_TTL_SECONDS; pass force_reload=True to refresh immediately.
    """
    meta = _load_tag_metadata(db_connection_func, force_reload)
    return {name: m["tag_id"] for name, m in meta.items()}


def get_tag_metadata_map(db_connection_func, force_reload=False):
    """
    Return tag_name → {tag_id, is_counter} for all active tags.
    Use for historian dual-write so value_delta and is_counter are set correctly.
    """
    return _load_tag_metadata(db_connection_func, force_reload)
