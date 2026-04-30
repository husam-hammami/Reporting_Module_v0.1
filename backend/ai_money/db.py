"""Shared DB helpers for ai_money.

Reuses the same connection-resolution trick as hercules_ai_bp — finds
get_db_connection in the running app module so this package is import-safe
even when Flask context is not active.
"""

import sys
from contextlib import contextmanager


def get_conn_factory():
    """Return the app's get_db_connection function."""
    for mod_name in ('app', '__main__'):
        mod = sys.modules.get(mod_name)
        if mod is not None:
            fn = getattr(mod, 'get_db_connection', None)
            if fn:
                return fn
    raise RuntimeError("ai_money.db: could not locate get_db_connection — call from a running Flask context")


@contextmanager
def cursor(dict_cursor=False):
    """Context manager that yields a real psycopg2 cursor.

    Usage:
        with cursor(dict_cursor=True) as cur:
            cur.execute(...)
            rows = cur.fetchall()
    """
    from psycopg2.extras import RealDictCursor
    get_conn = get_conn_factory()
    conn = get_conn()
    actual = conn._conn if hasattr(conn, '_conn') else conn
    try:
        cur_kwargs = {'cursor_factory': RealDictCursor} if dict_cursor else {}
        cur = actual.cursor(**cur_kwargs)
        try:
            yield cur, actual
        finally:
            cur.close()
    finally:
        try:
            conn.close()
        except Exception:
            pass


def get_config_value(cur, key, default=None):
    """Read a single value from hercules_ai_config; returns the inner 'value' field."""
    import json
    cur.execute("SELECT value FROM hercules_ai_config WHERE key = %s", (key,))
    row = cur.fetchone()
    if not row:
        return default
    val = row[0] if not isinstance(row, dict) else row.get('value')
    if isinstance(val, str):
        try:
            val = json.loads(val)
        except Exception:
            return default
    if isinstance(val, dict) and 'value' in val:
        return val['value']
    return val if val is not None else default


# ── Asset derivation (Plan 6 hotfix — same logic as assets_view SQL) ────────

def derive_asset(tag_name, parent_asset=None, line_name=None):
    """Derive an asset_name for a tag. Same priority as assets_view SQL:
        1) explicit parent_asset value (if non-empty)
        2) tag_name pattern match (Salalah-known: c32_, mil_b_, m30_, m31_, pasta_*)
        3) line_name from AI scan classification
        4) None
    Returns: str asset name or None.
    """
    if parent_asset and str(parent_asset).strip():
        return str(parent_asset).strip()
    if tag_name:
        n = str(tag_name).lower()
        if n.startswith('mil_b_') or n.startswith('millb_'): return 'Mill B'
        if n.startswith('c32_'):                              return 'C32 Mill'
        if n.startswith('m30_'):                              return 'M30 Mill'
        if n.startswith('m31_'):                              return 'M31 Mill'
        if n.startswith('pasta_1_'):                          return 'Pasta 1'
        if n.startswith('pasta_4_'):                          return 'Pasta 4'
        if n.startswith('pasta_e_'):                          return 'Pasta E'
    if line_name and str(line_name).strip():
        return str(line_name).strip()
    return None


def is_energy_meter_name(tag_name):
    """Pattern match for energy meters when the column flag isn't set."""
    if not tag_name:
        return False
    n = str(tag_name).lower()
    return 'total_active_energy' in n


def is_production_counter_name(tag_name, tag_type=None):
    """Pattern match for production counters when the column flag isn't set."""
    if not tag_name:
        return False
    n = str(tag_name).lower()
    if (tag_type or '').lower() == 'counter' and ('totalizer' in n or 'total_kg' in n):
        return True
    return False
