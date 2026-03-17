"""
License Blueprint

Public endpoints for EXE registration and admin endpoints for
managing machine license activations (superadmin only).
"""

import logging
from datetime import datetime, timedelta
from functools import wraps
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from contextlib import closing
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

license_bp = Blueprint('license_bp', __name__)

DEFAULT_TRIAL_DAYS = 15


def _get_db_connection():
    import sys
    if 'app' in sys.modules:
        app_module = sys.modules['app']
        fn = getattr(app_module, 'get_db_connection', None)
        if fn is None:
            raise ImportError("get_db_connection not found in app module")
        return fn
    else:
        from app import get_db_connection
        return get_db_connection


def _require_superadmin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({'error': 'Not authenticated'}), 401
        if current_user.role != 'superadmin':
            return jsonify({'error': 'Insufficient permissions'}), 403
        return f(*args, **kwargs)
    return wrapper


# ---------------------------------------------------------------------------
# Public routes (called by customer EXE, no auth required)
# ---------------------------------------------------------------------------

@license_bp.route('/license/register', methods=['POST'])
def register_machine():
    """Register or check-in a machine. Creates a pending row if new."""
    data = request.get_json(silent=True) or {}
    machine_id = (data.get('machine_id') or '').strip()
    if not machine_id:
        return jsonify({'error': 'machine_id is required'}), 400

    user_id = (data.get('user_id') or '').strip() or None
    hostname = (data.get('hostname') or '').strip() or None

    get_conn = _get_db_connection()
    try:
        with closing(get_conn()) as conn:
            actual = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual.cursor(cursor_factory=RealDictCursor)

            cur.execute(
                "SELECT id, machine_id, status, expiry FROM licenses WHERE machine_id = %s",
                (machine_id,),
            )
            row = cur.fetchone()

            if row:
                cur.execute(
                    "UPDATE licenses SET last_seen_at = NOW(), user_id = COALESCE(%s, user_id), hostname = COALESCE(%s, hostname) WHERE machine_id = %s",
                    (user_id, hostname, machine_id),
                )
                actual.commit()
                expiry_str = row['expiry'].strftime('%Y-%m-%d') if row['expiry'] else None
                return jsonify({'status': row['status'], 'expiry': expiry_str}), 200

            cur.execute(
                """INSERT INTO licenses (machine_id, user_id, hostname, status)
                   VALUES (%s, %s, %s, 'pending')
                   RETURNING id""",
                (machine_id, user_id, hostname),
            )
            actual.commit()
            return jsonify({'status': 'pending', 'expiry': None}), 200

    except Exception as e:
        logger.error("license/register error: %s", e, exc_info=True)
        return jsonify({'error': 'Server error', 'detail': str(e)}), 500


@license_bp.route('/license/status', methods=['GET'])
def license_status():
    """Return license status for a machine_id (no record creation)."""
    machine_id = (request.args.get('machine_id') or '').strip()
    if not machine_id:
        return jsonify({'error': 'machine_id query param required'}), 400

    get_conn = _get_db_connection()
    try:
        with closing(get_conn()) as conn:
            actual = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                "SELECT status, expiry FROM licenses WHERE machine_id = %s",
                (machine_id,),
            )
            row = cur.fetchone()
            if not row:
                return jsonify({'error': 'Not found'}), 404
            expiry_str = row['expiry'].strftime('%Y-%m-%d') if row['expiry'] else None
            return jsonify({'status': row['status'], 'expiry': expiry_str}), 200
    except Exception as e:
        logger.error("license/status error: %s", e, exc_info=True)
        return jsonify({'error': 'Server error', 'detail': str(e)}), 500


# ---------------------------------------------------------------------------
# Admin routes (superadmin only, called from Vercel portal)
# ---------------------------------------------------------------------------

@license_bp.route('/admin/licenses', methods=['GET'])
@login_required
@_require_superadmin
def list_licenses():
    """List all license records. Optional ?status=pending filter."""
    status_filter = request.args.get('status')
    get_conn = _get_db_connection()
    try:
        with closing(get_conn()) as conn:
            actual = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual.cursor(cursor_factory=RealDictCursor)
            if status_filter:
                cur.execute(
                    "SELECT * FROM licenses WHERE status = %s ORDER BY created_at DESC",
                    (status_filter,),
                )
            else:
                cur.execute("SELECT * FROM licenses ORDER BY created_at DESC")
            rows = cur.fetchall()
            for r in rows:
                if r.get('expiry'):
                    r['expiry'] = r['expiry'].strftime('%Y-%m-%d')
                for col in ('created_at', 'updated_at', 'last_seen_at'):
                    if r.get(col):
                        r[col] = r[col].isoformat()
            return jsonify(rows), 200
    except Exception as e:
        logger.error("admin/licenses list error: %s", e, exc_info=True)
        return jsonify({'error': 'Server error', 'detail': str(e)}), 500


@license_bp.route('/admin/licenses/<int:license_id>', methods=['PATCH'])
@login_required
@_require_superadmin
def update_license(license_id):
    """Approve, deny, or extend a license. Default expiry = today + 15 days on approve."""
    data = request.get_json(silent=True) or {}
    new_status = data.get('status')
    expiry_str = data.get('expiry')

    sets = []
    params = []

    if new_status:
        if new_status not in ('approved', 'denied', 'pending'):
            return jsonify({'error': 'Invalid status'}), 400
        sets.append("status = %s")
        params.append(new_status)

        if new_status == 'approved' and not expiry_str:
            default_expiry = (datetime.now() + timedelta(days=DEFAULT_TRIAL_DAYS)).strftime('%Y-%m-%d')
            sets.append("expiry = %s")
            params.append(default_expiry)

    if expiry_str:
        try:
            datetime.strptime(expiry_str, '%Y-%m-%d')
        except ValueError:
            return jsonify({'error': 'Invalid expiry format, use YYYY-MM-DD'}), 400
        sets.append("expiry = %s")
        params.append(expiry_str)

    if not sets:
        return jsonify({'error': 'Nothing to update'}), 400

    sets.append("updated_at = NOW()")
    params.append(license_id)

    get_conn = _get_db_connection()
    try:
        with closing(get_conn()) as conn:
            actual = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                f"UPDATE licenses SET {', '.join(sets)} WHERE id = %s RETURNING *",
                params,
            )
            row = cur.fetchone()
            actual.commit()
            if not row:
                return jsonify({'error': 'License not found'}), 404
            if row.get('expiry'):
                row['expiry'] = row['expiry'].strftime('%Y-%m-%d')
            for col in ('created_at', 'updated_at', 'last_seen_at'):
                if row.get(col):
                    row[col] = row[col].isoformat()
            return jsonify(row), 200
    except Exception as e:
        logger.error("admin/licenses update error: %s", e, exc_info=True)
        return jsonify({'error': 'Server error', 'detail': str(e)}), 500


@license_bp.route('/admin/licenses/<int:license_id>', methods=['DELETE'])
@login_required
@_require_superadmin
def delete_license(license_id):
    """Remove a license record."""
    get_conn = _get_db_connection()
    try:
        with closing(get_conn()) as conn:
            actual = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual.cursor()
            cur.execute("DELETE FROM licenses WHERE id = %s", (license_id,))
            actual.commit()
            if cur.rowcount == 0:
                return jsonify({'error': 'License not found'}), 404
            return jsonify({'status': 'deleted'}), 200
    except Exception as e:
        logger.error("admin/licenses delete error: %s", e, exc_info=True)
        return jsonify({'error': 'Server error', 'detail': str(e)}), 500
