"""
Branding Blueprint
==================
API for managing client logo and branding assets.
Stores branding data in a generic system_settings table.
"""

import logging
from flask import Blueprint, jsonify, request
from contextlib import closing

logger = logging.getLogger(__name__)

branding_bp = Blueprint('branding_bp', __name__)

_table_ensured = False


def _get_db_connection():
    """Helper function to get database connection, avoiding circular imports."""
    import sys
    for mod_name in ('app', '__main__'):
        mod = sys.modules.get(mod_name)
        if mod is not None:
            get_db_connection = getattr(mod, 'get_db_connection', None)
            if get_db_connection is not None:
                return get_db_connection
    raise RuntimeError("Could not get database connection function")


def _ensure_table():
    """Create system_settings table if it doesn't exist (lazy, called on first request)."""
    global _table_ensured
    if _table_ensured:
        return
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_settings (
                    key VARCHAR(100) PRIMARY KEY,
                    value TEXT NOT NULL DEFAULT '',
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """)
            actual_conn.commit()
            _table_ensured = True
            logger.info("system_settings table ensured")
    except Exception as e:
        logger.error("Failed to ensure system_settings table: %s", e)


# ── GET client logo ──────────────────────────────────────────────
@branding_bp.route('/settings/client-logo', methods=['GET'])
def get_client_logo():
    _ensure_table()
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT value FROM system_settings WHERE key = 'client_logo'"
            )
            row = cursor.fetchone()
            logo = row['value'] if row else None
            return jsonify({'logo': logo}), 200
    except Exception as e:
        logger.error("Failed to get client logo: %s", e)
        return jsonify({'error': str(e)}), 500


# ── POST (upload/update) client logo ────────────────────────────
@branding_bp.route('/settings/client-logo', methods=['POST'])
def set_client_logo():
    _ensure_table()
    data = request.get_json(silent=True) or {}
    logo = data.get('logo')
    if not logo or not isinstance(logo, str):
        return jsonify({'error': 'logo field (base64 string) is required'}), 400

    # Server-side size guard: reject if base64 payload > 2MB
    if len(logo) > 2 * 1024 * 1024:
        return jsonify({'error': 'Logo image is too large (max 2 MB)'}), 400

    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor()
            cursor.execute("""
                INSERT INTO system_settings (key, value, updated_at)
                VALUES ('client_logo', %s, NOW())
                ON CONFLICT (key)
                DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            """, (logo,))
            actual_conn.commit()
            return jsonify({'status': 'saved'}), 200
    except Exception as e:
        logger.error("Failed to save client logo: %s", e)
        return jsonify({'error': str(e)}), 500


# ── DELETE client logo ───────────────────────────────────────────
@branding_bp.route('/settings/client-logo', methods=['DELETE'])
def delete_client_logo():
    _ensure_table()
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor()
            cursor.execute("DELETE FROM system_settings WHERE key = 'client_logo'")
            actual_conn.commit()
            return jsonify({'status': 'deleted'}), 200
    except Exception as e:
        logger.error("Failed to delete client logo: %s", e)
        return jsonify({'error': str(e)}), 500
