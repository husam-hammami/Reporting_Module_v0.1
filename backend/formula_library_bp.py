"""
Formula Library Blueprint
=========================
CRUD API for industry KPI formula templates with multi-instance variable assignment.
Supports plant-type-specific KPIs (feed_mill, flour_mill, grain_silo).
"""

import logging
import json
import re
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from contextlib import closing
from psycopg2.extras import RealDictCursor
from asteval import Interpreter

logger = logging.getLogger(__name__)

formula_library_bp = Blueprint('formula_library_bp', __name__)
_table_ensured = False


def _get_db_connection():
    import sys
    for mod_name in ('app', '__main__'):
        mod = sys.modules.get(mod_name)
        if mod is not None:
            fn = getattr(mod, 'get_db_connection', None)
            if fn is not None:
                return fn
    raise RuntimeError("Could not get database connection function")


def _ensure_table():
    global _table_ensured
    if _table_ensured:
        return
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_config (
                    key VARCHAR(100) PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS formula_library (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    category VARCHAR(50) NOT NULL,
                    plant_type VARCHAR(30) NOT NULL,
                    formula TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    unit VARCHAR(20) DEFAULT '',
                    variables JSONB DEFAULT '[]'::jsonb,
                    is_builtin BOOLEAN DEFAULT false,
                    is_archived BOOLEAN DEFAULT false,
                    version INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS formula_instances (
                    id SERIAL PRIMARY KEY,
                    formula_id INTEGER NOT NULL REFERENCES formula_library(id) ON DELETE CASCADE,
                    instance_label VARCHAR(100) NOT NULL,
                    display_name VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(formula_id, instance_label)
                )
            """)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS formula_variable_assignments (
                    id SERIAL PRIMARY KEY,
                    formula_id INTEGER NOT NULL REFERENCES formula_library(id) ON DELETE CASCADE,
                    instance_id INTEGER REFERENCES formula_instances(id) ON DELETE CASCADE,
                    variable_name VARCHAR(100) NOT NULL,
                    tag_id INTEGER,
                    aggregation VARCHAR(20) DEFAULT 'last',
                    default_value DOUBLE PRECISION,
                    assigned_at TIMESTAMP DEFAULT NOW()
                )
            """)
            actual_conn.commit()
            _table_ensured = True
    except Exception as e:
        logger.error(f"Error ensuring formula_library tables: {e}")


def _serialize_row(row):
    if isinstance(row.get('variables'), str):
        row['variables'] = json.loads(row['variables'])
    return row


# ── Plant Config ─────────────────────────────────────────────────────────────

@formula_library_bp.route('/plant-config', methods=['GET'])
@login_required
def get_plant_config():
    _ensure_table()
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT key, value FROM system_config WHERE key = 'plant_type'")
            row = cursor.fetchone()
        return jsonify({'plant_type': row['value'] if row else None})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@formula_library_bp.route('/plant-config', methods=['POST'])
@login_required
def set_plant_config():
    _ensure_table()
    if current_user.role not in ('admin', 'superadmin'):
        return jsonify({'error': 'Forbidden'}), 403
    data = request.get_json(silent=True) or {}
    plant_type = data.get('plant_type', '')
    if plant_type not in ('feed_mill', 'flour_mill', 'grain_silo'):
        return jsonify({'error': 'Invalid plant type'}), 400
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO system_config (key, value) VALUES ('plant_type', %s)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            """, (plant_type,))
            # Un-archive formulas for selected plant type, archive others
            cursor.execute("UPDATE formula_library SET is_archived = true WHERE is_builtin = true AND plant_type != %s", (plant_type,))
            cursor.execute("UPDATE formula_library SET is_archived = false WHERE is_builtin = true AND plant_type = %s", (plant_type,))
            conn.commit()
        return jsonify({'status': 'ok', 'plant_type': plant_type})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Formula Library CRUD ─────────────────────────────────────────────────────

@formula_library_bp.route('/formula-library', methods=['GET'])
@login_required
def list_formulas():
    _ensure_table()
    try:
        get_conn = _get_db_connection()
        plant_type = request.args.get('plant_type')
        category = request.args.get('category')
        include_archived = request.args.get('include_archived', 'false') == 'true'

        with closing(get_conn()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            query = "SELECT * FROM formula_library WHERE 1=1"
            params = []
            if plant_type:
                query += " AND plant_type = %s"
                params.append(plant_type)
            if category:
                query += " AND category = %s"
                params.append(category)
            if not include_archived:
                query += " AND is_archived = false"
            query += " ORDER BY category, name"
            cursor.execute(query, params)
            rows = [_serialize_row(dict(r)) for r in cursor.fetchall()]

        return jsonify({'data': rows})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@formula_library_bp.route('/formula-library', methods=['POST'])
@login_required
def create_formula():
    _ensure_table()
    data = request.get_json(silent=True) or {}
    required = ['name', 'formula', 'plant_type']
    for f in required:
        if not data.get(f):
            return jsonify({'error': f'{f} is required'}), 400
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin)
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, false)
                RETURNING *
            """, (
                data['name'], data.get('category', 'custom'), data['plant_type'],
                data['formula'], data.get('description', ''), data.get('unit', ''),
                json.dumps(data.get('variables', []))
            ))
            row = _serialize_row(dict(cursor.fetchone()))
            conn.commit()
        return jsonify({'data': row}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@formula_library_bp.route('/formula-library/<int:formula_id>', methods=['PUT'])
@login_required
def update_formula(formula_id):
    _ensure_table()
    data = request.get_json(silent=True) or {}
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            # Check if built-in
            cursor.execute("SELECT is_builtin FROM formula_library WHERE id = %s", (formula_id,))
            row = cursor.fetchone()
            if not row:
                return jsonify({'error': 'Not found'}), 404
            if row['is_builtin']:
                return jsonify({'error': 'Built-in formulas cannot be edited. Use Clone instead.'}), 403

            cursor.execute("""
                UPDATE formula_library SET
                    name = COALESCE(%s, name), category = COALESCE(%s, category),
                    formula = COALESCE(%s, formula), description = COALESCE(%s, description),
                    unit = COALESCE(%s, unit), variables = COALESCE(%s::jsonb, variables),
                    version = version + 1, updated_at = NOW()
                WHERE id = %s RETURNING *
            """, (
                data.get('name'), data.get('category'), data.get('formula'),
                data.get('description'), data.get('unit'),
                json.dumps(data['variables']) if 'variables' in data else None,
                formula_id
            ))
            updated = _serialize_row(dict(cursor.fetchone()))
            conn.commit()
        return jsonify({'data': updated})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@formula_library_bp.route('/formula-library/<int:formula_id>', methods=['DELETE'])
@login_required
def delete_formula(formula_id):
    _ensure_table()
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT is_builtin FROM formula_library WHERE id = %s", (formula_id,))
            row = cursor.fetchone()
            if not row:
                return jsonify({'error': 'Not found'}), 404
            if row[0]:
                return jsonify({'error': 'Built-in formulas cannot be deleted'}), 403
            cursor.execute("DELETE FROM formula_library WHERE id = %s", (formula_id,))
            conn.commit()
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@formula_library_bp.route('/formula-library/<int:formula_id>/clone', methods=['POST'])
@login_required
def clone_formula(formula_id):
    _ensure_table()
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT * FROM formula_library WHERE id = %s", (formula_id,))
            original = cursor.fetchone()
            if not original:
                return jsonify({'error': 'Not found'}), 404
            cursor.execute("""
                INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin)
                VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, false)
                RETURNING *
            """, (
                f"{original['name']} (Custom)", original['category'], original['plant_type'],
                original['formula'], original['description'], original['unit'],
                json.dumps(original['variables']) if isinstance(original['variables'], list) else original['variables']
            ))
            cloned = _serialize_row(dict(cursor.fetchone()))
            conn.commit()
        return jsonify({'data': cloned}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Formula Instances (Multi-instance) ───────────────────────────────────────

@formula_library_bp.route('/formula-library/<int:formula_id>/instances', methods=['GET'])
@login_required
def list_instances(formula_id):
    _ensure_table()
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT * FROM formula_instances WHERE formula_id = %s ORDER BY instance_label
            """, (formula_id,))
            rows = [dict(r) for r in cursor.fetchall()]
        return jsonify({'data': rows})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@formula_library_bp.route('/formula-library/<int:formula_id>/instances', methods=['POST'])
@login_required
def create_instance(formula_id):
    _ensure_table()
    data = request.get_json(silent=True) or {}
    label = data.get('instance_label', '')
    display = data.get('display_name', '')
    if not label or not display:
        return jsonify({'error': 'instance_label and display_name are required'}), 400
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                INSERT INTO formula_instances (formula_id, instance_label, display_name)
                VALUES (%s, %s, %s) RETURNING *
            """, (formula_id, label, display))
            row = dict(cursor.fetchone())
            conn.commit()
        return jsonify({'data': row}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@formula_library_bp.route('/formula-instances/<int:instance_id>', methods=['DELETE'])
@login_required
def delete_instance(instance_id):
    _ensure_table()
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM formula_instances WHERE id = %s", (instance_id,))
            conn.commit()
        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Variable Assignments ─────────────────────────────────────────────────────

@formula_library_bp.route('/formula-library/all-assignments', methods=['GET'])
@login_required
def get_all_assignments():
    """Bulk load all variable assignments for all formulas (avoids N+1 queries)."""
    _ensure_table()
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT a.formula_id, a.instance_id, a.variable_name, a.tag_id,
                       a.aggregation, a.default_value,
                       t.tag_name, t.display_name as tag_display_name
                FROM formula_variable_assignments a
                LEFT JOIN tags t ON t.id = a.tag_id
                ORDER BY a.formula_id, a.instance_id, a.variable_name
            """)
            rows = [dict(r) for r in cursor.fetchall()]

        # Group by formula_id
        grouped = {}
        for r in rows:
            fid = r['formula_id']
            if fid not in grouped:
                grouped[fid] = []
            grouped[fid].append(r)

        return jsonify({'data': grouped})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@formula_library_bp.route('/formula-library/<int:formula_id>/assignments', methods=['GET'])
@login_required
def get_assignments(formula_id):
    _ensure_table()
    instance_id = request.args.get('instance_id', type=int)
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            if instance_id:
                cursor.execute("""
                    SELECT a.*, t.tag_name, t.display_name as tag_display_name
                    FROM formula_variable_assignments a
                    LEFT JOIN tags t ON t.id = a.tag_id
                    WHERE a.formula_id = %s AND a.instance_id = %s
                    ORDER BY a.variable_name
                """, (formula_id, instance_id))
            else:
                cursor.execute("""
                    SELECT a.*, t.tag_name, t.display_name as tag_display_name
                    FROM formula_variable_assignments a
                    LEFT JOIN tags t ON t.id = a.tag_id
                    WHERE a.formula_id = %s AND a.instance_id IS NULL
                    ORDER BY a.variable_name
                """, (formula_id,))
            rows = [dict(r) for r in cursor.fetchall()]
        return jsonify({'data': rows})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@formula_library_bp.route('/formula-library/<int:formula_id>/assignments', methods=['POST'])
@login_required
def save_assignments(formula_id):
    """Bulk upsert variable assignments."""
    _ensure_table()
    data = request.get_json(silent=True) or {}
    assignments = data.get('assignments', [])
    instance_id = data.get('instance_id')  # None for default

    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor()
            # Delete existing assignments for this formula/instance
            if instance_id:
                cursor.execute("""
                    DELETE FROM formula_variable_assignments
                    WHERE formula_id = %s AND instance_id = %s
                """, (formula_id, instance_id))
            else:
                cursor.execute("""
                    DELETE FROM formula_variable_assignments
                    WHERE formula_id = %s AND instance_id IS NULL
                """, (formula_id,))

            # Insert new assignments
            for a in assignments:
                cursor.execute("""
                    INSERT INTO formula_variable_assignments
                        (formula_id, instance_id, variable_name, tag_id, aggregation, default_value)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    formula_id, instance_id,
                    a.get('variable_name', ''),
                    a.get('tag_id'),
                    a.get('aggregation', 'last'),
                    a.get('default_value')
                ))
            conn.commit()
        return jsonify({'status': 'ok', 'count': len(assignments)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Live Values ──────────────────────────────────────────────────────────────

@formula_library_bp.route('/formula-library/values', methods=['GET'])
@login_required
def get_formula_values():
    """Get live evaluated values for all configured formulas."""
    _ensure_table()
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            # Get all non-archived formulas with their assignments
            cursor.execute("""
                SELECT fl.id, fl.name, fl.formula, fl.unit, fl.variables,
                       fi.id as instance_id, fi.display_name as instance_display,
                       fva.variable_name, fva.tag_id, fva.default_value, fva.aggregation,
                       t.tag_name
                FROM formula_library fl
                LEFT JOIN formula_instances fi ON fi.formula_id = fl.id
                LEFT JOIN formula_variable_assignments fva ON fva.formula_id = fl.id
                    AND (fva.instance_id = fi.id OR (fva.instance_id IS NULL AND fi.id IS NULL))
                LEFT JOIN tags t ON t.id = fva.tag_id
                WHERE fl.is_archived = false
                ORDER BY fl.id, fi.id, fva.variable_name
            """)
            rows = cursor.fetchall()

        # Get live tag values from cache
        try:
            from utils.tag_value_cache import get_tag_value_cache
            cache = get_tag_value_cache()
            tag_values = cache.get_values() or {}
        except Exception:
            tag_values = {}

        # Group by formula+instance and evaluate
        results = []
        current_key = None
        current_formula = None
        variable_map = {}

        for row in rows:
            key = (row['id'], row.get('instance_id'))
            if key != current_key:
                # Evaluate previous formula
                if current_formula:
                    val = _evaluate_with_variables(current_formula['formula'], variable_map, tag_values) if variable_map else None
                    results.append({
                        'formula_id': current_formula['id'],
                        'instance_id': current_formula.get('instance_id'),
                        'instance_display': current_formula.get('instance_display'),
                        'name': current_formula['name'],
                        'unit': current_formula['unit'],
                        'value': val,
                        'configured': len(variable_map) == 0 or all(v.get('tag_name') for v in variable_map.values()),
                    })
                current_key = key
                current_formula = dict(row)
                variable_map = {}

            if row.get('variable_name'):
                variable_map[row['variable_name']] = {
                    'tag_name': row.get('tag_name'),
                    'default_value': row.get('default_value'),
                    'aggregation': row.get('aggregation', 'last'),
                }

        # Don't forget last formula
        if current_formula:
            val = _evaluate_with_variables(current_formula['formula'], variable_map, tag_values) if variable_map else None
            results.append({
                'formula_id': current_formula['id'],
                'instance_id': current_formula.get('instance_id'),
                'instance_display': current_formula.get('instance_display'),
                'name': current_formula['name'],
                'unit': current_formula['unit'],
                'value': val,
                'configured': len(variable_map) == 0 or all(v.get('tag_name') for v in variable_map.values()),
            })

        return jsonify({'data': results})
    except Exception as e:
        logger.error(f"Formula values error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


def _evaluate_with_variables(formula, variable_map, tag_values):
    """Evaluate a formula by resolving variables to tag values."""
    try:
        expr = formula
        for var_name, var_info in variable_map.items():
            tag_name = var_info.get('tag_name')
            default = var_info.get('default_value', 0)
            if tag_name and tag_name in tag_values:
                val = float(tag_values[tag_name])
            elif default is not None:
                val = float(default)
            else:
                val = 0.0
            expr = re.sub(r'\{' + re.escape(var_name) + r'\}', str(val), expr)

        # Sanitize and evaluate
        sanitized = re.sub(r'[^0-9+\-*/%().eE\s]', '', expr)
        if not sanitized.strip():
            return None
        result = Interpreter()(sanitized)
        if isinstance(result, (int, float)) and not (isinstance(result, float) and (result != result or result == float('inf') or result == float('-inf'))):
            return round(float(result), 3)
        return None
    except Exception:
        return None


# ── Test Evaluation ──────────────────────────────────────────────────────────

@formula_library_bp.route('/formula-library/<int:formula_id>/test', methods=['POST'])
@login_required
def test_formula(formula_id):
    """Test evaluate a formula with current tag values."""
    _ensure_table()
    data = request.get_json(silent=True) or {}
    instance_id = data.get('instance_id')

    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT * FROM formula_library WHERE id = %s", (formula_id,))
            formula_row = cursor.fetchone()
            if not formula_row:
                return jsonify({'error': 'Not found'}), 404

            # Get assignments
            if instance_id:
                cursor.execute("""
                    SELECT fva.variable_name, t.tag_name, fva.default_value
                    FROM formula_variable_assignments fva
                    LEFT JOIN tags t ON t.id = fva.tag_id
                    WHERE fva.formula_id = %s AND fva.instance_id = %s
                """, (formula_id, instance_id))
            else:
                cursor.execute("""
                    SELECT fva.variable_name, t.tag_name, fva.default_value
                    FROM formula_variable_assignments fva
                    LEFT JOIN tags t ON t.id = fva.tag_id
                    WHERE fva.formula_id = %s AND fva.instance_id IS NULL
                """, (formula_id,))
            assignments = {r['variable_name']: dict(r) for r in cursor.fetchall()}

        # Get live values
        try:
            from utils.tag_value_cache import get_tag_value_cache
            cache = get_tag_value_cache()
            tag_values = cache.get_values() or {}
        except Exception:
            tag_values = {}

        value = _evaluate_with_variables(formula_row['formula'], assignments, tag_values)
        unassigned = [v['name'] for v in (formula_row['variables'] or [])
                      if v['name'] not in assignments or not assignments[v['name']].get('tag_name')]

        return jsonify({
            'value': value,
            'unit': formula_row['unit'],
            'unassigned_variables': unassigned,
            'formula': formula_row['formula'],
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
