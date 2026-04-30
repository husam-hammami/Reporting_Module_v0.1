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
