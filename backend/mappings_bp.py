"""
Mappings Blueprint

API endpoints for managing value lookup mappings.
Maps PLC tag values (e.g., bin IDs) to readable names (e.g., material names)
via configurable lookup tables stored in the database.
"""

import logging
import json
from flask import Blueprint, jsonify, request
from contextlib import closing
import psycopg2
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

mappings_bp = Blueprint('mappings_bp', __name__)

# PostgreSQL clusters/databases with WIN1252 encoding reject Unicode such as U+2192 (→).
# Prefer readable ASCII replacements; then coerce anything left with cp1252 replace.
_WIN1252_SAFE_TRANSLATE = str.maketrans({
    '\u2192': '->',
    '\u2190': '<-',
    '\u2194': '<->',
    '\u2014': '--',
    '\u2013': '-',
    '\u2018': "'",
    '\u2019': "'",
    '\u201c': '"',
    '\u201d': '"',
    '\u2026': '...',
    '\u00a0': ' ',
})


def _coerce_string_for_win1252_db(s):
    """Make text storable on WIN1252 PostgreSQL; harmless on UTF-8 databases."""
    if s is None:
        return None
    if not isinstance(s, str):
        s = str(s)
    s = s.translate(_WIN1252_SAFE_TRANSLATE)
    try:
        s.encode('cp1252')
        return s
    except UnicodeEncodeError:
        out = s.encode('cp1252', errors='replace').decode('cp1252')
        if out != s:
            logger.debug(
                'Coerced non-CP1252 text for DB storage: %r -> %r',
                s[:120],
                out[:120],
            )
        return out


def _sanitize_lookup_for_db(lookup):
    """Recursively sanitize string keys/values in lookup JSON for WIN1252-safe storage."""
    if isinstance(lookup, dict):
        out = {}
        for k, v in lookup.items():
            nk = _coerce_string_for_win1252_db(str(k)) if k is not None else ''
            out[nk] = _sanitize_lookup_for_db(v)
        return out
    if isinstance(lookup, list):
        return [_sanitize_lookup_for_db(x) for x in lookup]
    if isinstance(lookup, str):
        return _coerce_string_for_win1252_db(lookup)
    return lookup


def _get_db_connection():
    """Resolve get_db_connection without re-importing app (avoids double app.py load on python app.py)."""
    import sys
    for mod_name in ('app', '__main__'):
        mod = sys.modules.get(mod_name)
        if mod is not None:
            fn = getattr(mod, 'get_db_connection', None)
            if fn is not None:
                return fn
    raise RuntimeError('Could not get database connection function (expected app or __main__)')


def _ensure_table_exists(cursor):
    """Create mappings table if it doesn't exist."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS mappings (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            input_tag VARCHAR(255) NOT NULL,
            output_tag_name VARCHAR(255) NOT NULL,
            lookup JSONB NOT NULL DEFAULT '{}',
            fallback VARCHAR(255) DEFAULT 'Unknown',
            is_active BOOLEAN DEFAULT true,
            output_type VARCHAR(20) DEFAULT 'text',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
    """)
    # Add output_type column for existing installations
    cursor.execute("""
        ALTER TABLE mappings ADD COLUMN IF NOT EXISTS output_type VARCHAR(20) DEFAULT 'text'
    """)
    # Create indexes if they don't exist
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_mappings_active ON mappings(is_active) WHERE is_active = true
    """)
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_mappings_input_tag ON mappings(input_tag)
    """)
    cursor.execute("""
        DROP INDEX IF EXISTS idx_mappings_name_unique
    """)


# ── GET /mappings ──────────────────────────────────────────────────────────
@mappings_bp.route('/mappings', methods=['GET'])
def get_mappings():
    """List all mappings."""
    try:
        conn = _get_db_connection()()
        with closing(conn) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            _ensure_table_exists(cursor)
            conn.commit()

            cursor.execute("""
                SELECT id, name, description, input_tag, output_tag_name,
                       lookup, fallback, is_active, output_type, created_at, updated_at
                FROM mappings
                ORDER BY name
            """)
            rows = cursor.fetchall()
            mappings = []
            for row in rows:
                m = dict(row)
                # Ensure lookup is a dict (JSONB returns as dict already)
                if isinstance(m.get('lookup'), str):
                    m['lookup'] = json.loads(m['lookup'])
                mappings.append(m)

            return jsonify({'status': 'success', 'mappings': mappings})

    except Exception as e:
        logger.error(f"Error fetching mappings: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ── GET /mappings/<id> ─────────────────────────────────────────────────────
@mappings_bp.route('/mappings/<int:mapping_id>', methods=['GET'])
def get_mapping(mapping_id):
    """Get a single mapping by ID."""
    try:
        conn = _get_db_connection()()
        with closing(conn) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            _ensure_table_exists(cursor)
            conn.commit()

            cursor.execute("""
                SELECT id, name, description, input_tag, output_tag_name,
                       lookup, fallback, is_active, output_type, created_at, updated_at
                FROM mappings WHERE id = %s
            """, (mapping_id,))
            row = cursor.fetchone()
            if not row:
                return jsonify({'status': 'error', 'message': 'Mapping not found'}), 404

            m = dict(row)
            if isinstance(m.get('lookup'), str):
                m['lookup'] = json.loads(m['lookup'])
            return jsonify({'status': 'success', 'mapping': m})

    except Exception as e:
        logger.error(f"Error fetching mapping {mapping_id}: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ── POST /mappings ─────────────────────────────────────────────────────────
@mappings_bp.route('/mappings', methods=['POST'])
def create_mapping():
    """Create a new mapping."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'No data received'}), 400

        name = _coerce_string_for_win1252_db((data.get('name') or '').strip())
        input_tag = _coerce_string_for_win1252_db((data.get('input_tag') or '').strip())
        output_tag_name = _coerce_string_for_win1252_db((data.get('output_tag_name') or '').strip())

        if not name:
            return jsonify({'status': 'error', 'message': 'Name is required'}), 400
        if not input_tag:
            return jsonify({'status': 'error', 'message': 'Input tag is required'}), 400
        if not output_tag_name:
            return jsonify({'status': 'error', 'message': 'Output tag name is required'}), 400

        lookup = data.get('lookup', {})
        if isinstance(lookup, str):
            lookup = json.loads(lookup)
        lookup = _sanitize_lookup_for_db(lookup)

        description = (data.get('description') or '').strip() or None
        if description:
            description = _coerce_string_for_win1252_db(description)
        fallback = _coerce_string_for_win1252_db((data.get('fallback') or 'Unknown').strip())
        is_active = data.get('is_active', True)
        output_type = (data.get('output_type') or 'text').strip()
        if output_type not in ('text', 'tag_value'):
            return jsonify({'status': 'error', 'message': 'output_type must be "text" or "tag_value"'}), 400

        conn = _get_db_connection()()
        with closing(conn) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            _ensure_table_exists(cursor)
            conn.commit()

            cursor.execute("""
                INSERT INTO mappings (name, description, input_tag, output_tag_name, lookup, fallback, is_active, output_type)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (name, description, input_tag, output_tag_name,
                  json.dumps(lookup), fallback, bool(is_active), output_type))

            result = cursor.fetchone()
            mapping_id = result['id'] if isinstance(result, dict) else result[0]
            conn.commit()

            logger.info(f"Created mapping: {name} (ID: {mapping_id})")
            return jsonify({
                'status': 'success',
                'mapping_id': mapping_id,
                'message': f'Mapping "{name}" created successfully'
            }), 201

    except Exception as e:
        logger.error(f"Error creating mapping: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ── PUT /mappings/<id> ─────────────────────────────────────────────────────
@mappings_bp.route('/mappings/<int:mapping_id>', methods=['PUT'])
def update_mapping(mapping_id):
    """Update an existing mapping."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'status': 'error', 'message': 'No data received'}), 400

        name = _coerce_string_for_win1252_db((data.get('name') or '').strip())
        input_tag = _coerce_string_for_win1252_db((data.get('input_tag') or '').strip())
        output_tag_name = _coerce_string_for_win1252_db((data.get('output_tag_name') or '').strip())

        if not name:
            return jsonify({'status': 'error', 'message': 'Name is required'}), 400
        if not input_tag:
            return jsonify({'status': 'error', 'message': 'Input tag is required'}), 400
        if not output_tag_name:
            return jsonify({'status': 'error', 'message': 'Output tag name is required'}), 400

        lookup = data.get('lookup', {})
        if isinstance(lookup, str):
            lookup = json.loads(lookup)
        lookup = _sanitize_lookup_for_db(lookup)

        description = (data.get('description') or '').strip() or None
        if description:
            description = _coerce_string_for_win1252_db(description)
        fallback = _coerce_string_for_win1252_db((data.get('fallback') or 'Unknown').strip())
        is_active = data.get('is_active', True)
        output_type = (data.get('output_type') or 'text').strip()
        if output_type not in ('text', 'tag_value'):
            return jsonify({'status': 'error', 'message': 'output_type must be "text" or "tag_value"'}), 400

        conn = _get_db_connection()()
        with closing(conn) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            # Check mapping exists
            cursor.execute("SELECT id FROM mappings WHERE id = %s", (mapping_id,))
            if not cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Mapping not found'}), 404

            cursor.execute("""
                UPDATE mappings
                SET name = %s, description = %s, input_tag = %s, output_tag_name = %s,
                    lookup = %s, fallback = %s, is_active = %s, output_type = %s
                WHERE id = %s
            """, (name, description, input_tag, output_tag_name,
                  json.dumps(lookup), fallback, bool(is_active), output_type, mapping_id))

            conn.commit()
            logger.info(f"Updated mapping: {name} (ID: {mapping_id})")
            return jsonify({
                'status': 'success',
                'message': f'Mapping "{name}" updated successfully'
            })

    except Exception as e:
        logger.error(f"Error updating mapping {mapping_id}: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ── DELETE /mappings/<id> ──────────────────────────────────────────────────
@mappings_bp.route('/mappings/<int:mapping_id>', methods=['DELETE'])
def delete_mapping(mapping_id):
    """Delete a mapping."""
    try:
        conn = _get_db_connection()()
        with closing(conn) as conn:
            cursor = conn.cursor()

            cursor.execute("SELECT name FROM mappings WHERE id = %s", (mapping_id,))
            row = cursor.fetchone()
            if not row:
                return jsonify({'status': 'error', 'message': 'Mapping not found'}), 404

            name = row[0] if not isinstance(row, dict) else row.get('name', '')
            cursor.execute("DELETE FROM mappings WHERE id = %s", (mapping_id,))
            conn.commit()

            logger.info(f"Deleted mapping: {name} (ID: {mapping_id})")
            return jsonify({
                'status': 'success',
                'message': f'Mapping "{name}" deleted successfully'
            })

    except Exception as e:
        logger.error(f"Error deleting mapping {mapping_id}: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ── PATCH /mappings/<id>/toggle ────────────────────────────────────────────
@mappings_bp.route('/mappings/<int:mapping_id>/toggle', methods=['PATCH'])
def toggle_mapping(mapping_id):
    """Toggle a mapping's active state."""
    try:
        conn = _get_db_connection()()
        with closing(conn) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)

            cursor.execute("SELECT id, is_active FROM mappings WHERE id = %s", (mapping_id,))
            row = cursor.fetchone()
            if not row:
                return jsonify({'status': 'error', 'message': 'Mapping not found'}), 404

            new_state = not row['is_active']
            cursor.execute("UPDATE mappings SET is_active = %s WHERE id = %s", (new_state, mapping_id))
            conn.commit()

            return jsonify({
                'status': 'success',
                'is_active': new_state,
                'message': f'Mapping {"activated" if new_state else "deactivated"}'
            })

    except Exception as e:
        logger.error(f"Error toggling mapping {mapping_id}: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ── POST /mappings/migrate-from-local ──────────────────────────────────────
@mappings_bp.route('/mappings/migrate-from-local', methods=['POST'])
def migrate_from_local():
    """Migrate mappings sent from localStorage into the database (one-time migration)."""
    try:
        data = request.get_json()
        if not data or not isinstance(data, list):
            return jsonify({'status': 'error', 'message': 'Expected array of mappings'}), 400

        conn = _get_db_connection()()
        with closing(conn) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            _ensure_table_exists(cursor)
            conn.commit()

            imported = 0
            skipped = 0
            for m in data:
                if not isinstance(m, dict):
                    skipped += 1
                    continue

                raw_name = m.get('name')
                name = (str(raw_name).strip() if raw_name is not None else '')
                name = _coerce_string_for_win1252_db(name)
                if not name:
                    skipped += 1
                    continue

                # Skip if already exists
                cursor.execute("SELECT id FROM mappings WHERE LOWER(name) = LOWER(%s)", (name,))
                if cursor.fetchone():
                    skipped += 1
                    continue

                lookup = m.get('lookup', {})
                if lookup is None:
                    lookup = {}
                if isinstance(lookup, str):
                    lookup = json.loads(lookup)
                if not isinstance(lookup, (dict, list)):
                    lookup = {}
                lookup = _sanitize_lookup_for_db(lookup)

                output_type = (m.get('output_type') or 'text')
                if isinstance(output_type, str):
                    output_type = output_type.strip() or 'text'
                else:
                    output_type = 'text'
                if output_type not in ('text', 'tag_value'):
                    output_type = 'text'

                cursor.execute("""
                    INSERT INTO mappings (name, description, input_tag, output_tag_name, lookup, fallback, is_active, output_type)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    name,
                    _coerce_string_for_win1252_db((m.get('description') or '').strip()) or None,
                    _coerce_string_for_win1252_db((m.get('input_tag') or '').strip()),
                    _coerce_string_for_win1252_db((m.get('output_tag_name') or '').strip()),
                    json.dumps(lookup),
                    _coerce_string_for_win1252_db((m.get('fallback') or 'Unknown').strip()),
                    bool(m.get('is_active', True)),
                    output_type,
                ))
                imported += 1

            conn.commit()
            logger.info(f"Migrated {imported} mappings from localStorage (skipped {skipped})")
            return jsonify({
                'status': 'success',
                'message': f'Migrated {imported} mappings, skipped {skipped}',
                'imported': imported,
                'skipped': skipped
            })

    except Exception as e:
        logger.error(f"Error migrating mappings: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ── GET /mappings/resolve ──────────────────────────────────────────────────
@mappings_bp.route('/mappings/resolve', methods=['GET'])
def resolve_mapping():
    """Resolve a mapping value. Query params: mapping_name, input_value."""
    try:
        mapping_name = request.args.get('name', '').strip()
        input_value = request.args.get('input_value', '').strip()

        if not mapping_name:
            return jsonify({'status': 'error', 'message': 'name parameter required'}), 400

        conn = _get_db_connection()()
        with closing(conn) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            _ensure_table_exists(cursor)
            conn.commit()

            cursor.execute("""
                SELECT lookup, fallback FROM mappings
                WHERE LOWER(name) = LOWER(%s) AND is_active = true
            """, (mapping_name,))
            row = cursor.fetchone()
            if not row:
                return jsonify({'status': 'error', 'message': f'Mapping "{mapping_name}" not found'}), 404

            lookup = row['lookup']
            if isinstance(lookup, str):
                lookup = json.loads(lookup)

            resolved = lookup.get(input_value, row.get('fallback', 'Unknown'))
            return jsonify({
                'status': 'success',
                'resolved_value': resolved,
                'input_value': input_value
            })

    except Exception as e:
        logger.error(f"Error resolving mapping: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500
