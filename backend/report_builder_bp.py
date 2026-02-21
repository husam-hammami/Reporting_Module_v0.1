"""
Report Builder Blueprint
========================
CRUD API for report builder templates with grid-based widget layouts.
"""

import logging
import json
from datetime import datetime
from flask import Blueprint, jsonify, request
from contextlib import closing
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

report_builder_bp = Blueprint('report_builder_bp', __name__)


def _get_db_connection():
    """Helper function to get database connection, avoiding circular imports"""
    import sys
    if 'app' in sys.modules:
        app_module = sys.modules['app']
        get_db_connection = getattr(app_module, 'get_db_connection', None)
        if get_db_connection:
            return get_db_connection
    raise RuntimeError("Could not get database connection function")


def _ensure_table():
    """Create report_builder_templates table if it doesn't exist."""
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS report_builder_templates (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    description TEXT DEFAULT '',
                    thumbnail TEXT DEFAULT '',
                    is_active BOOLEAN DEFAULT true,
                    is_default BOOLEAN DEFAULT false,
                    layout_config JSONB DEFAULT '{"widgets":[],"grid":{"cols":12,"rowHeight":60}}'::jsonb,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """)
            actual_conn.commit()
    except Exception as e:
        logger.error(f"Error ensuring report_builder_templates table: {e}")


# ---------------------------------------------------------------------------
# GET /api/report-builder/templates — List all templates
# ---------------------------------------------------------------------------
@report_builder_bp.route('/report-builder/templates', methods=['GET'])
def list_templates():
    try:
        _ensure_table()
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT id, name, description, thumbnail, is_active, is_default,
                       layout_config, created_at, updated_at
                FROM report_builder_templates
                ORDER BY updated_at DESC
            """)
            templates = cursor.fetchall()

        result = []
        for t in templates:
            row = dict(t)
            row['created_at'] = row['created_at'].isoformat() if row.get('created_at') else None
            row['updated_at'] = row['updated_at'].isoformat() if row.get('updated_at') else None
            if isinstance(row.get('layout_config'), str):
                row['layout_config'] = json.loads(row['layout_config'])
            result.append(row)

        return jsonify({'status': 'success', 'data': result})
    except Exception as e:
        logger.error(f"Error listing report builder templates: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ---------------------------------------------------------------------------
# POST /api/report-builder/templates — Create a template
# ---------------------------------------------------------------------------
@report_builder_bp.route('/report-builder/templates', methods=['POST'])
def create_template():
    try:
        _ensure_table()
        data = request.get_json(silent=True) or {}
        name = data.get('name', 'Untitled Report')
        description = data.get('description', '')
        layout_config = data.get('layout_config', {
            'widgets': [],
            'grid': {'cols': 12, 'rowHeight': 60}
        })

        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                INSERT INTO report_builder_templates (name, description, layout_config)
                VALUES (%s, %s, %s::jsonb)
                RETURNING id, name, description, thumbnail, is_active, is_default,
                          layout_config, created_at, updated_at
            """, (name, description, json.dumps(layout_config)))
            row = dict(cursor.fetchone())
            actual_conn.commit()

        row['created_at'] = row['created_at'].isoformat() if row.get('created_at') else None
        row['updated_at'] = row['updated_at'].isoformat() if row.get('updated_at') else None
        if isinstance(row.get('layout_config'), str):
            row['layout_config'] = json.loads(row['layout_config'])

        return jsonify({'status': 'success', 'data': row}), 201
    except Exception as e:
        logger.error(f"Error creating report builder template: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ---------------------------------------------------------------------------
# GET /api/report-builder/templates/<id> — Get one template
# ---------------------------------------------------------------------------
@report_builder_bp.route('/report-builder/templates/<int:template_id>', methods=['GET'])
def get_template(template_id):
    try:
        _ensure_table()
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT id, name, description, thumbnail, is_active, is_default,
                       layout_config, created_at, updated_at
                FROM report_builder_templates
                WHERE id = %s
            """, (template_id,))
            row = cursor.fetchone()

        if not row:
            return jsonify({'status': 'error', 'message': 'Template not found'}), 404

        row = dict(row)
        row['created_at'] = row['created_at'].isoformat() if row.get('created_at') else None
        row['updated_at'] = row['updated_at'].isoformat() if row.get('updated_at') else None
        if isinstance(row.get('layout_config'), str):
            row['layout_config'] = json.loads(row['layout_config'])

        return jsonify({'status': 'success', 'data': row})
    except Exception as e:
        logger.error(f"Error getting report builder template: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ---------------------------------------------------------------------------
# PUT /api/report-builder/templates/<id> — Update a template
# ---------------------------------------------------------------------------
@report_builder_bp.route('/report-builder/templates/<int:template_id>', methods=['PUT'])
def update_template(template_id):
    try:
        _ensure_table()
        data = request.get_json(silent=True) or {}
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)

            # Build dynamic SET clause
            fields = []
            values = []
            for key in ['name', 'description', 'thumbnail', 'is_active', 'is_default']:
                if key in data:
                    fields.append(f"{key} = %s")
                    values.append(data[key])
            if 'layout_config' in data:
                fields.append("layout_config = %s::jsonb")
                values.append(json.dumps(data['layout_config']))

            fields.append("updated_at = NOW()")
            values.append(template_id)

            if not fields:
                return jsonify({'status': 'error', 'message': 'No fields to update'}), 400

            query = f"""
                UPDATE report_builder_templates
                SET {', '.join(fields)}
                WHERE id = %s
                RETURNING id, name, description, thumbnail, is_active, is_default,
                          layout_config, created_at, updated_at
            """
            cursor.execute(query, values)
            row = cursor.fetchone()
            actual_conn.commit()

        if not row:
            return jsonify({'status': 'error', 'message': 'Template not found'}), 404

        row = dict(row)
        row['created_at'] = row['created_at'].isoformat() if row.get('created_at') else None
        row['updated_at'] = row['updated_at'].isoformat() if row.get('updated_at') else None
        if isinstance(row.get('layout_config'), str):
            row['layout_config'] = json.loads(row['layout_config'])

        return jsonify({'status': 'success', 'data': row})
    except Exception as e:
        logger.error(f"Error updating report builder template: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ---------------------------------------------------------------------------
# DELETE /api/report-builder/templates/<id> — Delete a template
# ---------------------------------------------------------------------------
@report_builder_bp.route('/report-builder/templates/<int:template_id>', methods=['DELETE'])
def delete_template(template_id):
    try:
        _ensure_table()
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor()
            cursor.execute("DELETE FROM report_builder_templates WHERE id = %s RETURNING id", (template_id,))
            deleted = cursor.fetchone()
            actual_conn.commit()

        if not deleted:
            return jsonify({'status': 'error', 'message': 'Template not found'}), 404

        return jsonify({'status': 'success', 'message': 'Template deleted'})
    except Exception as e:
        logger.error(f"Error deleting report builder template: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ---------------------------------------------------------------------------
# POST /api/report-builder/templates/<id>/duplicate — Duplicate a template
# ---------------------------------------------------------------------------
@report_builder_bp.route('/report-builder/templates/<int:template_id>/duplicate', methods=['POST'])
def duplicate_template(template_id):
    try:
        _ensure_table()
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)

            # Get original
            cursor.execute("""
                SELECT name, description, layout_config
                FROM report_builder_templates WHERE id = %s
            """, (template_id,))
            original = cursor.fetchone()

            if not original:
                return jsonify({'status': 'error', 'message': 'Template not found'}), 404

            original = dict(original)
            new_name = f"{original['name']} (Copy)"
            layout_config = original['layout_config']
            if isinstance(layout_config, str):
                layout_config = json.loads(layout_config)

            cursor.execute("""
                INSERT INTO report_builder_templates (name, description, layout_config)
                VALUES (%s, %s, %s::jsonb)
                RETURNING id, name, description, thumbnail, is_active, is_default,
                          layout_config, created_at, updated_at
            """, (new_name, original['description'], json.dumps(layout_config)))
            row = dict(cursor.fetchone())
            actual_conn.commit()

        row['created_at'] = row['created_at'].isoformat() if row.get('created_at') else None
        row['updated_at'] = row['updated_at'].isoformat() if row.get('updated_at') else None
        if isinstance(row.get('layout_config'), str):
            row['layout_config'] = json.loads(row['layout_config'])

        return jsonify({'status': 'success', 'data': row}), 201
    except Exception as e:
        logger.error(f"Error duplicating report builder template: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500
