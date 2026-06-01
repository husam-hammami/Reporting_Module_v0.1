"""
Hercules AI Blueprint — Phase 1
================================
Tag profiling, classification, config management, and preview summary.
"""

import base64
import json
import logging
import re
import sys
from contextlib import closing
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
from flask_login import login_required
from psycopg2.extras import RealDictCursor

import ai_prompts

logger = logging.getLogger(__name__)

hercules_ai_bp = Blueprint('hercules_ai_bp', __name__)

# ── Scan lock & init flag ───────────────────────────────────────────────────
_scan_in_progress = False
_tables_ensured = False


def _ensure_tables():
    """Create Hercules AI tables if they don't exist (safe to call repeatedly)."""
    global _tables_ensured
    if _tables_ensured:
        return
    try:
        get_conn = _get_db_connection()
        conn = get_conn()
        # Get the real psycopg2 connection (not the PooledConnection wrapper)
        actual = conn._conn if hasattr(conn, '_conn') else conn
        actual.autocommit = True
        with actual.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS hercules_ai_tag_profiles (
                    id SERIAL PRIMARY KEY,
                    tag_name VARCHAR(255) NOT NULL UNIQUE,
                    label VARCHAR(255) DEFAULT '',
                    tag_type VARCHAR(50) DEFAULT 'unknown',
                    line_name VARCHAR(100) DEFAULT '',
                    category VARCHAR(100) DEFAULT '',
                    source VARCHAR(20) DEFAULT 'auto',
                    is_tracked BOOLEAN DEFAULT true,
                    is_reviewed BOOLEAN DEFAULT false,
                    confidence REAL DEFAULT 0.0,
                    evidence JSONB DEFAULT '{}',
                    user_notes TEXT DEFAULT '',
                    data_status VARCHAR(20) DEFAULT 'unknown',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS hercules_ai_config (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(100) UNIQUE NOT NULL,
                    value JSONB NOT NULL DEFAULT '{}',
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_hai_profiles_line ON hercules_ai_tag_profiles(line_name)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_hai_profiles_reviewed ON hercules_ai_tag_profiles(is_reviewed)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_hai_profiles_tracked ON hercules_ai_tag_profiles(is_tracked)")
            # Triggers — ignore if already exist (each in its own savepoint so failures don't abort)
            for tbl in ('hercules_ai_tag_profiles', 'hercules_ai_config'):
                try:
                    cur.execute(f"""
                        CREATE TRIGGER update_{tbl.replace('.','_')}_modtime
                            BEFORE UPDATE ON {tbl}
                            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
                    """)
                except Exception:
                    pass  # trigger already exists or function missing — non-critical
            # distribution column
            try:
                cur.execute("ALTER TABLE distribution_rules ADD COLUMN IF NOT EXISTS include_ai_summary BOOLEAN DEFAULT false")
            except Exception:
                pass  # table may not exist yet
        conn.close()
        _tables_ensured = True
        logger.info("Hercules AI tables ensured.")
    except Exception as e:
        logger.warning("Could not ensure AI tables (will retry next request): %s", e)


@hercules_ai_bp.before_request
def _before_request():
    _ensure_tables()


def _get_db_connection():
    """Get database connection function, avoiding circular imports."""
    for mod_name in ('app', '__main__'):
        mod = sys.modules.get(mod_name)
        if mod is not None:
            fn = getattr(mod, 'get_db_connection', None)
            if fn:
                return fn
    raise RuntimeError("Could not get database connection function")


# ── Config defaults ──────────────────────────────────────────────────────────

_CONFIG_DEFAULTS = {
    'setup_completed': {'value': False},
    'last_scan_at': {'value': None},
    'production_value_per_ton': {'value': 0, 'currency': 'USD'},
    'ai_provider': {'value': 'cloud'},
    'llm_api_key': {'value': ''},
    'llm_model': {'value': 'claude-opus-4-6'},
    'local_server_url': {'value': 'http://localhost:1234/v1'},
    'local_model': {'value': ''},
    'electricity_tariff_omr_per_kwh': {'value': 0.025},
}


def _ensure_config_defaults(cur):
    """Insert default config rows if they don't exist."""
    for key, val in _CONFIG_DEFAULTS.items():
        cur.execute("""
            INSERT INTO hercules_ai_config (key, value)
            VALUES (%s, %s)
            ON CONFLICT (key) DO NOTHING
        """, (key, json.dumps(val)))


def _get_raw_config(cur):
    """Load all config as a flat dict WITH raw values (for ai_provider calls)."""
    _ensure_config_defaults(cur)
    cur.execute("SELECT key, value FROM hercules_ai_config")
    config = {}
    for row in cur.fetchall():
        val = row['value'] if isinstance(row['value'], dict) else json.loads(row['value'])
        config[row['key']] = val.get('value', val)
    return config


def _get_config(cur):
    """Load all config as a flat dict. API key is REDACTED."""
    _ensure_config_defaults(cur)
    cur.execute("SELECT key, value FROM hercules_ai_config")
    config = {}
    for row in cur.fetchall():
        val = row['value'] if isinstance(row['value'], dict) else json.loads(row['value'])
        if row['key'] == 'llm_api_key':
            raw = val.get('value', '')
            config['llm_api_key_set'] = bool(raw)
            config['llm_api_key_hint'] = ('...' + raw[-4:]) if len(raw) >= 4 else ''
        else:
            config[row['key']] = val.get('value', val)
    return config


# ── Classification rules ─────────────────────────────────────────────────────

def _classify_tag(tag_name, meta, label=''):
    """Rule-based tag classification. Returns (tag_type, confidence).

    Uses metadata first (unit, data_type, is_counter), then falls back to
    name/label keyword matching so obvious tags never show as 'unknown'.
    """
    is_counter = meta.get('is_counter', False)
    data_type = (meta.get('data_type') or '').upper()
    unit = (meta.get('unit') or '').lower().strip()
    name_lower = tag_name.lower()
    label_lower = (label or '').lower()
    text = f"{name_lower} {label_lower}"  # combined for keyword search

    # ── Priority 1: Strong metadata matches ─────────────────────────────
    if is_counter and unit in ('kg', 't', 'ton', 'tons', 'lb', 'lbs'):
        return 'counter', 0.95
    if is_counter:
        return 'counter', 0.85
    if data_type == 'BOOL':
        return 'boolean', 0.90
    if unit == '%':
        return 'percentage', 0.85
    if unit in ('t/h', 'kg/h', 'l/min', 'm3/h', 'l/h'):
        return 'rate', 0.90
    if unit in ('°c', '°f', 'k', 'c', 'f'):
        return 'analog', 0.90
    if unit in ('bar', 'psi', 'kpa', 'mbar'):
        return 'analog', 0.90
    if unit in ('rpm',):
        return 'analog', 0.85
    if unit in ('a', 'v', 'kw', 'kwh', 'mwh', 'w', 'hz'):
        return 'analog', 0.80

    # ── Priority 2: Name/label keyword matching ─────────────────────────
    # Counters / totals
    if any(w in text for w in ('total', 'counter', 'accumulator', 'totalizer',
                                'cumulative', 'production_total', 'prod_total')):
        return 'counter', 0.75

    # Booleans / on-off / status
    if any(w in text for w in ('running', 'on_off', 'on/off', 'status', 'active',
                                'enabled', 'disabled', 'start', 'stop', 'alarm',
                                'fault', 'trip', 'interlock', 'selected',
                                'emptying', 'filling', 'open', 'closed')):
        return 'boolean', 0.70

    # Rates / flow
    if any(w in text for w in ('flow', 'rate', 'speed', 'feed_rate', 'feedrate',
                                'throughput', 'capacity')):
        return 'rate', 0.70

    # Percentages / levels
    if any(w in text for w in ('percent', 'level', 'moisture', 'humidity',
                                'efficiency', 'utilization', 'load')):
        return 'percentage', 0.70

    # Temperatures
    if any(w in text for w in ('temp', 'temperature', 'heating', 'cooling')):
        return 'analog', 0.70

    # Pressures
    if any(w in text for w in ('pressure', 'vacuum')):
        return 'analog', 0.70

    # General analog (current, voltage, power, weight, etc.)
    if any(w in text for w in ('current', 'voltage', 'power', 'energy',
                                'weight', 'torque', 'vibration', 'position',
                                'setpoint', 'set_point', 'sp_')):
        if any(w in text for w in ('setpoint', 'set_point', 'sp_')):
            return 'setpoint', 0.70
        return 'analog', 0.65

    # ID / selector / recipe / destination
    if re.search(r'(?:_|^)id(?:_|$|\d)|_id\b|\bid_|\bbin\b|\brecipe\b|\bproduct\b|\bgrade\b|dest|selector|sender', text):
        return 'id_selector', 0.70

    return 'unknown', 0.30


# ── Label / context extraction from layout_config ────────────────────────────

def _extract_tag_context(layout_config, template_name=''):
    """Walk layout_config to extract label/line/category per tag.
    Returns {tag_name: {label, line_name, category, reports: [template_name]}}.
    """
    context = {}

    # Derive line_name from first header title or template name
    default_line = ''
    for s in (layout_config.get('paginatedSections') or []):
        if s.get('type') == 'header' and s.get('title'):
            default_line = s['title']
            break
    if not default_line:
        default_line = template_name

    def _add(tag_name, label='', category=''):
        if not tag_name:
            return
        if tag_name not in context:
            context[tag_name] = {
                'label': label or '',
                'line_name': default_line,
                'category': category or '',
                'reports': [],
            }
        else:
            if label and not context[tag_name]['label']:
                context[tag_name]['label'] = label
            if category and not context[tag_name]['category']:
                context[tag_name]['category'] = category
        if template_name and template_name not in context[tag_name]['reports']:
            context[tag_name]['reports'].append(template_name)

    # Walk paginatedSections
    for s in (layout_config.get('paginatedSections') or []):
        s_type = s.get('type', '')
        section_label = s.get('label', '')

        if s_type == 'header':
            if s.get('statusTagName'):
                _add(s['statusTagName'], label=s.get('statusLabel', ''), category=section_label)

        elif s_type == 'kpi-row':
            for k in (s.get('kpis') or []):
                if k.get('tagName'):
                    _add(k['tagName'], label=k.get('label', ''), category=section_label)

        elif s_type == 'table':
            rows = s.get('rows') or []
            for row in rows:
                cells = row.get('cells') or []
                # Pair static cells with adjacent tag cells for labels
                prev_static = ''
                for cell in cells:
                    src = cell.get('sourceType', 'static')
                    if src == 'static':
                        prev_static = cell.get('value', '')
                    elif src in ('tag', 'formula', 'group'):
                        tag = cell.get('tagName', '')
                        if tag:
                            _add(tag, label=prev_static, category=section_label)
                        prev_static = ''
                    else:
                        prev_static = ''

    # Walk dashboard widgets
    for widget in (layout_config.get('widgets') or []):
        config = widget.get('config', {})
        title = config.get('title', '')
        ds = config.get('dataSource', {})
        if ds.get('tagName'):
            _add(ds['tagName'], label=title)
        for key in ('capacityTag', 'tonsTag'):
            if config.get(key):
                _add(config[key], label=f"{title} {key}")
        for series in config.get('series', []):
            s_ds = series.get('dataSource', {})
            if s_ds.get('tagName'):
                _add(s_ds['tagName'], label=series.get('label', title))
        for col in config.get('tableColumns', []):
            if col.get('tagName'):
                _add(col['tagName'], label=col.get('header', ''))

    return context


# ── Routes ───────────────────────────────────────────────────────────────────

@hercules_ai_bp.route('/hercules-ai/scan', methods=['POST'])
@login_required
def scan_reports():
    """Auto-scan: extract tags from templates, classify, check data status."""
    global _scan_in_progress
    if _scan_in_progress:
        return jsonify({'error': 'Scan already in progress'}), 409

    _scan_in_progress = True
    try:
        from distribution_engine import extract_all_tags

        get_conn = _get_db_connection()

        with closing(get_conn()) as conn:
            actual = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual.cursor(cursor_factory=RealDictCursor)

            # ── Step 1 & 2: Extract tags + context from all templates ────
            cur.execute("SELECT id, name, layout_config FROM report_builder_templates")
            templates = cur.fetchall()

            all_tags = set()
            all_context = {}  # tag_name -> context dict
            errors = []

            for tpl in templates:
                try:
                    lc = tpl['layout_config']
                    if isinstance(lc, str):
                        lc = json.loads(lc)

                    tags = extract_all_tags(lc)
                    all_tags.update(tags)

                    ctx = _extract_tag_context(lc, template_name=tpl['name'])
                    for tag_name, info in ctx.items():
                        if tag_name not in all_context:
                            all_context[tag_name] = info
                        else:
                            # Merge: keep first label, accumulate reports
                            if info['label'] and not all_context[tag_name]['label']:
                                all_context[tag_name]['label'] = info['label']
                            if info['category'] and not all_context[tag_name]['category']:
                                all_context[tag_name]['category'] = info['category']
                            for r in info['reports']:
                                if r not in all_context[tag_name]['reports']:
                                    all_context[tag_name]['reports'].append(r)
                except Exception as e:
                    errors.append({'template_id': tpl['id'], 'name': tpl['name'], 'error': str(e)})
                    logger.warning("Scan error on template %s: %s", tpl['name'], e)

            if not all_tags:
                actual.commit()
                return jsonify({
                    'status': 'empty',
                    'message': 'No tags found in report templates',
                    'templates_scanned': len(templates),
                    'errors': errors,
                })

            # ── Step 3: Load tag metadata ────────────────────────────────
            tag_list = list(all_tags)
            cur.execute("""
                SELECT tag_name, display_name, unit, data_type, is_counter, is_active, source_type
                FROM tags WHERE tag_name = ANY(%s)
            """, (tag_list,))
            tag_meta = {r['tag_name']: r for r in cur.fetchall()}

            # ── Step 4: Classify ─────────────────────────────────────────
            profiles = []
            for tag_name in all_tags:
                meta = tag_meta.get(tag_name, {})
                ctx = all_context.get(tag_name, {})
                label = ctx.get('label', '') or meta.get('display_name', '') or ''
                tag_type, confidence = _classify_tag(tag_name, meta, label=label)
                line_name = ctx.get('line_name', '')
                category = ctx.get('category', '')
                evidence = {
                    'reports': ctx.get('reports', []),
                    'unit': meta.get('unit', ''),
                    'data_type': meta.get('data_type', ''),
                    'is_counter': meta.get('is_counter', False),
                    'source_type': meta.get('source_type', ''),
                }

                profiles.append({
                    'tag_name': tag_name,
                    'label': label,
                    'tag_type': tag_type,
                    'line_name': line_name,
                    'category': category,
                    'confidence': confidence,
                    'evidence': json.dumps(evidence),
                })

            # ── Step 5: Data availability ────────────────────────────────
            cur.execute("""
                SELECT t.tag_name, COUNT(a.id) as reading_count
                FROM tags t LEFT JOIN tag_history_archive a ON a.tag_id = t.id
                    AND a.archive_hour > NOW() - INTERVAL '30 days'
                WHERE t.tag_name = ANY(%s) AND t.is_active = true
                GROUP BY t.tag_name
            """, (tag_list,))
            data_counts = {r['tag_name']: r['reading_count'] for r in cur.fetchall()}

            def _data_status(tag_name):
                count = data_counts.get(tag_name, 0)
                if count > 1000:
                    return 'active'
                elif count > 0:
                    return 'sparse'
                return 'empty'

            # ── Step 7: Load existing profiles for orphan detection ──────
            cur.execute("SELECT id, tag_name, source, data_status FROM hercules_ai_tag_profiles")
            existing = {r['tag_name']: r for r in cur.fetchall()}

            # Orphaned profiles (tags removed from templates)
            for tag_name, prof in existing.items():
                if tag_name not in all_tags:
                    if prof['source'] == 'auto':
                        cur.execute("""
                            UPDATE hercules_ai_tag_profiles
                            SET data_status='deleted', is_tracked=false
                            WHERE id = %s
                        """, (prof['id'],))
                    else:
                        cur.execute("""
                            UPDATE hercules_ai_tag_profiles
                            SET data_status='deleted'
                            WHERE id = %s
                        """, (prof['id'],))

            # Auto-clean stale deleted profiles older than 30 days
            cur.execute("""
                DELETE FROM hercules_ai_tag_profiles
                WHERE data_status = 'deleted' AND source = 'auto'
                  AND updated_at < NOW() - INTERVAL '30 days'
            """)

            # Revival: tags re-added
            for tag_name, prof in existing.items():
                if prof['data_status'] == 'deleted' and tag_name in all_tags:
                    cur.execute("""
                        UPDATE hercules_ai_tag_profiles
                        SET data_status=%s
                        WHERE id = %s
                    """, (_data_status(tag_name), prof['id']))

            # ── Step 8: UPSERT (protect user corrections) ───────────────
            for p in profiles:
                ds = _data_status(p['tag_name'])
                cur.execute("""
                    INSERT INTO hercules_ai_tag_profiles
                        (tag_name, label, tag_type, line_name, category, source, confidence, evidence, data_status)
                    VALUES (%s, %s, %s, %s, %s, 'auto', %s, %s, %s)
                    ON CONFLICT (tag_name) DO UPDATE SET
                        label = EXCLUDED.label,
                        tag_type = EXCLUDED.tag_type,
                        line_name = EXCLUDED.line_name,
                        category = EXCLUDED.category,
                        confidence = EXCLUDED.confidence,
                        evidence = EXCLUDED.evidence,
                        data_status = EXCLUDED.data_status
                    WHERE hercules_ai_tag_profiles.source = 'auto'
                """, (
                    p['tag_name'], p['label'], p['tag_type'], p['line_name'],
                    p['category'], p['confidence'], p['evidence'], ds,
                ))

            # ── Step 10: Update last_scan_at ─────────────────────────────
            _ensure_config_defaults(cur)
            now_str = datetime.now().isoformat()
            cur.execute("""
                UPDATE hercules_ai_config SET value = %s WHERE key = 'last_scan_at'
            """, (json.dumps({'value': now_str}),))

            actual.commit()

            return jsonify({
                'status': 'ok',
                'tags_found': len(all_tags),
                'templates_scanned': len(templates),
                'errors': errors,
            })

    except Exception as e:
        logger.exception("Scan failed: %s", e)
        return jsonify({'error': str(e)}), 500
    finally:
        _scan_in_progress = False


@hercules_ai_bp.route('/hercules-ai/profiles', methods=['GET'])
@login_required
def get_profiles():
    """List all profiles grouped by line_name with counts."""
    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        actual = conn._conn if hasattr(conn, '_conn') else conn
        cur = actual.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT id, tag_name, label, tag_type, line_name, category,
                   source, is_tracked, is_reviewed, confidence, evidence,
                   user_notes, data_status, created_at, updated_at
            FROM hercules_ai_tag_profiles
            ORDER BY line_name, tag_name
        """)
        rows = cur.fetchall()

    # Group by line
    grouped = {}
    for r in rows:
        line = r['line_name'] or 'Other Tags'
        if line not in grouped:
            grouped[line] = []
        # Serialize datetimes
        r['created_at'] = r['created_at'].isoformat() if r['created_at'] else None
        r['updated_at'] = r['updated_at'].isoformat() if r['updated_at'] else None
        grouped[line].append(r)

    return jsonify({
        'profiles': grouped,
        'total': len(rows),
    })


@hercules_ai_bp.route('/hercules-ai/profiles/bulk', methods=['PUT'])
@login_required
def bulk_update_profiles():
    """Bulk update — transaction, all-or-nothing."""
    data = request.get_json()
    profiles_data = data.get('profiles', [])
    if not profiles_data:
        return jsonify({'error': 'No profiles provided'}), 400

    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        actual = conn._conn if hasattr(conn, '_conn') else conn
        cur = actual.cursor(cursor_factory=RealDictCursor)

        updated = 0
        for p in profiles_data:
            pid = p.get('id')
            if not pid:
                continue

            fields = []
            values = []
            for col in ('tag_type', 'label', 'line_name', 'category', 'user_notes', 'is_tracked', 'is_reviewed'):
                if col in p:
                    fields.append(f"{col} = %s")
                    values.append(p[col])

            # ALWAYS mark as user-edited
            fields.append("source = %s")
            values.append('user')
            fields.append("is_reviewed = %s")
            values.append(True)

            values.append(pid)
            cur.execute(
                f"UPDATE hercules_ai_tag_profiles SET {', '.join(fields)} WHERE id = %s",
                values
            )
            updated += cur.rowcount

        actual.commit()

    return jsonify({'updated': updated})


@hercules_ai_bp.route('/hercules-ai/profiles/bulk', methods=['DELETE'])
@login_required
def bulk_delete_profiles():
    """Permanently delete profiles by ID list."""
    data = request.get_json()
    ids = data.get('ids', [])
    if not ids:
        return jsonify({'error': 'No IDs provided'}), 400

    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        actual = conn._conn if hasattr(conn, '_conn') else conn
        cur = actual.cursor()
        cur.execute("DELETE FROM hercules_ai_tag_profiles WHERE id = ANY(%s)", (ids,))
        deleted = cur.rowcount
        actual.commit()

    return jsonify({'deleted': deleted})


@hercules_ai_bp.route('/hercules-ai/profiles/<int:profile_id>', methods=['PUT'])
@login_required
def update_profile(profile_id):
    """Update single profile by ID."""
    data = request.get_json()

    # ALWAYS mark as user-edited so re-scans don't overwrite
    data['source'] = 'user'
    data['is_reviewed'] = True

    fields = []
    values = []
    for col in ('tag_type', 'label', 'line_name', 'category', 'user_notes',
                'is_tracked', 'is_reviewed', 'source'):
        if col in data:
            fields.append(f"{col} = %s")
            values.append(data[col])

    if not fields:
        return jsonify({'error': 'No fields to update'}), 400

    values.append(profile_id)
    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        actual = conn._conn if hasattr(conn, '_conn') else conn
        cur = actual.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            f"UPDATE hercules_ai_tag_profiles SET {', '.join(fields)} WHERE id = %s RETURNING *",
            values
        )
        row = cur.fetchone()
        actual.commit()

    if not row:
        return jsonify({'error': 'Profile not found'}), 404

    row['created_at'] = row['created_at'].isoformat() if row['created_at'] else None
    row['updated_at'] = row['updated_at'].isoformat() if row['updated_at'] else None
    return jsonify(row)


@hercules_ai_bp.route('/hercules-ai/config', methods=['GET'])
@login_required
def get_config():
    """Get global config (flattened, API key REDACTED)."""
    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        actual = conn._conn if hasattr(conn, '_conn') else conn
        cur = actual.cursor(cursor_factory=RealDictCursor)
        config = _get_config(cur)
        actual.commit()
    return jsonify(config)


@hercules_ai_bp.route('/hercules-ai/config', methods=['PUT'])
@login_required
def update_config():
    """Update config entries."""
    data = request.get_json()
    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        actual = conn._conn if hasattr(conn, '_conn') else conn
        cur = actual.cursor(cursor_factory=RealDictCursor)
        _ensure_config_defaults(cur)

        for key, val in data.items():
            if key in _CONFIG_DEFAULTS:
                cur.execute("""
                    UPDATE hercules_ai_config SET value = %s WHERE key = %s
                """, (json.dumps({'value': val}), key))

        actual.commit()
        config = _get_config(cur)
        actual.commit()

    return jsonify(config)


@hercules_ai_bp.route('/hercules-ai/status', methods=['GET'])
@login_required
def get_status():
    """Status: setup_completed, tag counts, last_scan_at, unseen_reports_count."""
    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        actual = conn._conn if hasattr(conn, '_conn') else conn
        cur = actual.cursor(cursor_factory=RealDictCursor)

        config = _get_config(cur)

        # Tag counts
        cur.execute("""
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE is_reviewed = true AND is_tracked = true) AS confirmed,
                COUNT(*) FILTER (WHERE is_reviewed = false AND is_tracked = true) AS pending,
                COUNT(*) FILTER (WHERE is_tracked = false) AS excluded
            FROM hercules_ai_tag_profiles
        """)
        counts = cur.fetchone()

        # Line breakdown
        cur.execute("""
            SELECT line_name, COUNT(*) AS count
            FROM hercules_ai_tag_profiles
            WHERE is_tracked = true
            GROUP BY line_name ORDER BY line_name
        """)
        lines = [{'name': r['line_name'] or 'Other', 'count': r['count']} for r in cur.fetchall()]

        # Unseen reports count
        unseen = 0
        last_scan = config.get('last_scan_at')
        if last_scan:
            cur.execute("""
                SELECT COUNT(*) AS cnt FROM report_builder_templates
                WHERE updated_at > %s
            """, (last_scan,))
            unseen = cur.fetchone()['cnt']

        actual.commit()

    return jsonify({
        'setup_completed': config.get('setup_completed', False),
        'last_scan_at': config.get('last_scan_at'),
        'total': counts['total'],
        'confirmed': counts['confirmed'],
        'pending': counts['pending'],
        'excluded': counts['excluded'],
        'lines': lines,
        'unseen_reports_count': unseen,
    })


@hercules_ai_bp.route('/hercules-ai/preview-summary', methods=['POST'])
@login_required
def preview_summary():
    """Generate a sample AI summary from most recent report data."""
    get_conn = _get_db_connection()

    with closing(get_conn()) as conn:
        actual = conn._conn if hasattr(conn, '_conn') else conn
        cur = actual.cursor(cursor_factory=RealDictCursor)

        config = _get_config(cur)

        if not config.get('setup_completed'):
            return jsonify({'error': 'Complete setup first'}), 400

        # Load full raw config for ai_provider
        ai_config = _get_raw_config(cur)

        # Validate provider is configured
        provider = ai_config.get('ai_provider', 'cloud')
        if provider == 'cloud' and not ai_config.get('llm_api_key'):
            return jsonify({'error': 'API key required'}), 400

        # Pick first template with tracked tags
        cur.execute("""
            SELECT DISTINCT unnest(ARRAY(
                SELECT tag_name FROM hercules_ai_tag_profiles WHERE is_tracked = true
            )) AS tag_name
        """)
        tracked_tags = {r['tag_name'] for r in cur.fetchall()}

        if not tracked_tags:
            return jsonify({'error': 'No tracked tags found'}), 400

        # Find a template that uses tracked tags
        from distribution_engine import extract_all_tags
        cur.execute("SELECT id, name, layout_config FROM report_builder_templates ORDER BY updated_at DESC")
        templates = cur.fetchall()

        chosen_template = None
        chosen_tags = set()
        for tpl in templates:
            lc = tpl['layout_config']
            if isinstance(lc, str):
                lc = json.loads(lc)
            tpl_tags = extract_all_tags(lc)
            overlap = tpl_tags & tracked_tags
            if overlap:
                chosen_template = tpl
                chosen_tags = overlap
                break

        if not chosen_template:
            return jsonify({'error': 'No templates with tracked tags found'}), 400

        # Fetch last 24h of data
        from distribution_engine import _fetch_tag_data_multi_agg
        lc = chosen_template['layout_config']
        if isinstance(lc, str):
            lc = json.loads(lc)
        to_dt = datetime.now()
        from_dt = to_dt - __import__('datetime').timedelta(hours=24)
        tag_data = _fetch_tag_data_multi_agg(lc, chosen_tags, from_dt, to_dt)

        # Build context from profiles
        cur.execute("""
            SELECT tag_name, label, tag_type, line_name, evidence
            FROM hercules_ai_tag_profiles
            WHERE tag_name = ANY(%s) AND is_tracked = true
        """, (list(chosen_tags),))
        profile_map = {}
        for r in cur.fetchall():
            evidence = r.get('evidence') or {}
            if isinstance(evidence, str):
                evidence = json.loads(evidence)
            r['unit'] = evidence.get('unit', '')
            profile_map[r['tag_name']] = r

        actual.commit()

    # Build structured data table with aggregation context
    data_rows = []
    for key, value in tag_data.items():
        if '::' in key:
            agg_prefix, tag_name = key.split('::', 1)
        else:
            tag_name = key
            agg_prefix = 'last'
        prof = profile_map.get(tag_name, {})
        if not prof:
            continue
        unit = prof.get('unit', '')
        data_rows.append(
            f"{prof.get('label', tag_name) or tag_name} | "
            f"{prof.get('tag_type', 'unknown')} | "
            f"{unit} | "
            f"{value} | "
            f"{agg_prefix} | "
            f"{prof.get('line_name', '')}"
        )

    if not data_rows:
        return jsonify({'error': 'No data available for preview'}), 400

    structured_data = '\n'.join(data_rows)
    time_from = from_dt.strftime('%Y-%m-%d %H:%M')
    time_to = to_dt.strftime('%Y-%m-%d %H:%M')

    # Extract report structure context
    from distribution_engine import _extract_report_context
    report_context = _extract_report_context({chosen_template['name']: lc})

    prompt = ai_prompts.build_single_report_prompt(
        report_name=chosen_template['name'],
        time_from=time_from,
        time_to=time_to,
        structured_data=structured_data,
        report_context=report_context,
    )

    try:
        import ai_provider
        summary = ai_provider.generate(prompt, ai_config, timeout=30)
        if not summary:
            logger.warning("Preview summary returned empty — provider: %s, model: %s",
                           ai_config.get('ai_provider'), ai_config.get('llm_model'))
            return jsonify({'error': 'Could not generate summary. Check your provider settings and API key.'}), 400
        return jsonify({
            'summary': summary,
            'report_name': chosen_template['name'],
            'tags_used': len(data_rows),
        })
    except Exception as e:
        logger.warning("Preview summary failed: %s", e)
        err_msg = str(e)
        if 'authentication' in err_msg.lower() or 'api key' in err_msg.lower() or '401' in err_msg:
            return jsonify({'error': 'Invalid API key. Please re-enter your key and test the connection.'}), 400
        if 'timeout' in err_msg.lower() or 'timed out' in err_msg.lower():
            return jsonify({'error': 'Summary generation timed out. Try again or use a faster model (Haiku).'}), 504
        if 'not_found' in err_msg.lower() or 'model' in err_msg.lower():
            return jsonify({'error': f'Model error: {err_msg}'}), 400
        return jsonify({'error': f'Could not generate summary: {err_msg}'}), 500


def _fmt_trend_val(val, unit=''):
    """Format a numeric value for trend display (e.g. 1234567 -> '1,234.6K')."""
    if val is None or val == 'N/A':
        return 'N/A'
    try:
        v = float(val)
        if v >= 1_000_000:
            s = f'{v/1_000_000:,.1f}M'
        elif v >= 1_000:
            s = f'{v/1_000:,.1f}K'
        else:
            s = f'{v:,.0f}'
        return f'{s} {unit}'.strip() if unit else s
    except (ValueError, TypeError):
        return str(val)


def _safe_float(val):
    """Safely convert a value to float, returning None on failure."""
    if val is None or val == 'N/A':
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _humanize_tag_name(tag_name):
    """Convert raw PLC tag name to readable label.

    MilB_C32_Total_Kwh → C32 Total Kwh
    B1_Deopt_Emptying → B1 Deopt Emptying
    """
    name = re.sub(r'^(?:Mil(?:l)?[_ ]?[A-Z]?[_ ]?)', '', tag_name)
    name = name.replace('_', ' ').strip()
    parts = name.split()
    result = []
    for p in parts:
        if p.isupper() or re.match(r'^[A-Z]\d', p):
            result.append(p)
        else:
            result.append(p.capitalize())
    return ' '.join(result) or tag_name


def _collect_tag_data_for_period(report_ids, from_dt, to_dt):
    """Shared helper: load templates, fetch current + previous period tag data.

    Returns a dict on success:
        {
            'templates': list of template rows,
            'all_tag_data': dict of {tag_key: value} for current period,
            'prev_tag_data': dict of {tag_key: value} for previous period,
            'report_names': list of report name strings,
            'report_map': list of {id, name},
            'all_layout_configs': dict of {name: layout_config},
            'profile_map': dict of {tag_name: profile_row},
            'ai_config': dict from hercules_ai_config,
            'prev_from': datetime, 'prev_to': datetime,
        }
    On error returns a tuple (error_message, http_status_code).
    """
    from distribution_engine import extract_all_tags, _fetch_tag_data_multi_agg

    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual.cursor(cursor_factory=RealDictCursor)

            config = _get_config(cur)
            if not config.get('setup_completed'):
                return ('Complete AI setup first', 400)

            ai_config = _get_raw_config(cur)

            # Load templates
            if report_ids and isinstance(report_ids, list) and len(report_ids) > 0:
                cur.execute("SELECT id, name, layout_config FROM report_builder_templates WHERE id = ANY(%s) AND is_active = true",
                            (report_ids,))
            else:
                cur.execute("SELECT id, name, layout_config FROM report_builder_templates WHERE is_active = true ORDER BY name")
            templates = cur.fetchall()

            if not templates:
                return ('No active report templates found', 400)

            actual.commit()
    except Exception as e:
        logger.exception("_collect_tag_data: failed to load config/templates: %s", e)
        return (f'Failed to load data: {e}', 500)

    # Previous period (same duration shifted back)
    period_duration = to_dt - from_dt
    prev_to = from_dt
    prev_from = prev_to - period_duration

    try:
        all_tag_data = {}
        prev_tag_data = {}
        all_layout_configs = {}
        report_names = []
        report_map = []
        for tpl in templates:
            tpl_name = tpl.get('name') or f"Report_{tpl.get('id', '?')}"
            try:
                lc = tpl.get('layout_config')
                if not lc:
                    logger.debug("_collect_tag_data: skipping '%s' — no layout_config", tpl_name)
                    continue
                if isinstance(lc, str):
                    try:
                        lc = json.loads(lc)
                    except (json.JSONDecodeError, TypeError):
                        logger.debug("_collect_tag_data: skipping '%s' — invalid JSON", tpl_name)
                        continue
                if not isinstance(lc, dict) or not lc:
                    logger.debug("_collect_tag_data: skipping '%s' — layout_config is %s", tpl_name, type(lc))
                    continue
                tags = extract_all_tags(lc)
                if not tags:
                    continue
                # Current period
                td = _fetch_tag_data_multi_agg(lc, tags, from_dt, to_dt)
                all_tag_data.update(td)
                # Previous period
                ptd = _fetch_tag_data_multi_agg(lc, tags, prev_from, prev_to)
                prev_tag_data.update(ptd)
                all_layout_configs[tpl_name] = lc
                report_names.append(tpl_name)
                report_map.append({'id': tpl['id'], 'name': tpl_name})
            except Exception as tpl_err:
                logger.warning("_collect_tag_data: error processing template '%s': %s", tpl_name, tpl_err, exc_info=True)
                continue

        if not report_names:
            return ('Selected reports have no data or configuration. Try different reports.', 400)

        # Load profiles
        raw_tags = set()
        for k in all_tag_data:
            raw_tags.add(k.split('::', 1)[1] if '::' in k else k)

        profile_map = {}
        if raw_tags:
            get_conn2 = _get_db_connection()
            with closing(get_conn2()) as conn2:
                actual2 = conn2._conn if hasattr(conn2, '_conn') else conn2
                cur2 = actual2.cursor(cursor_factory=RealDictCursor)
                cur2.execute("""SELECT tag_name, label, tag_type, line_name, evidence
                               FROM hercules_ai_tag_profiles
                               WHERE tag_name = ANY(%s) AND is_tracked = true""",
                             (list(raw_tags),))
                for r in cur2.fetchall():
                    evidence = r.get('evidence') or {}
                    if isinstance(evidence, str):
                        evidence = json.loads(evidence)
                    r['unit'] = evidence.get('unit', '')
                    profile_map[r['tag_name']] = r
                actual2.commit()

        # Fetch 4-period trend for counter tags (production metrics)
        trend_data = {}  # {tag_name: {period_idx: value}}
        counter_tags = [
            tn for tn, p in profile_map.items()
            if p.get('tag_type') == 'counter'
        ]

        if counter_tags:
            for i in range(2, 5):  # periods 2, 3, 4 (period 1 = prev_tag_data)
                p_to = from_dt - period_duration * (i - 1)
                p_from = p_to - period_duration
                try:
                    for tpl in templates:
                        lc = tpl.get('layout_config') or tpl.get('lc')
                        if not lc:
                            continue
                        if isinstance(lc, str):
                            lc = json.loads(lc)
                        tags_in = extract_all_tags(lc)
                        relevant = [t for t in tags_in if t in counter_tags]
                        if relevant:
                            vals = _fetch_tag_data_multi_agg(lc, relevant, p_from, p_to)
                            for key, val in (vals or {}).items():
                                tag_name = key.split('::')[-1] if '::' in key else key
                                agg = key.split('::')[0] if '::' in key else 'last'
                                if agg == 'delta' and tag_name in counter_tags:
                                    if tag_name not in trend_data:
                                        trend_data[tag_name] = {}
                                    trend_data[tag_name][i] = val
                except Exception as e:
                    logger.warning("Trend fetch for period %d failed: %s", i, e)

        return {
            'templates': templates,
            'all_tag_data': all_tag_data,
            'prev_tag_data': prev_tag_data,
            'report_names': report_names,
            'report_map': report_map,
            'all_layout_configs': all_layout_configs,
            'profile_map': profile_map,
            'ai_config': ai_config,
            'prev_from': prev_from,
            'prev_to': prev_to,
            'trend_data': trend_data,
            'counter_tags': counter_tags,
        }
    except Exception as e:
        logger.exception("_collect_tag_data: failed to collect tag data: %s", e)
        return (f'Failed to collect data: {e}', 500)


# =============================================================================
# Structured-briefing helpers (Plan 1 — Phase B)
# =============================================================================

def _known_assets_from_profiles(profile_map):
    """Derive the set of valid asset names from tag profiles (line_name)."""
    assets = set()
    for p in (profile_map or {}).values():
        ln = (p.get('line_name') or '').strip()
        if ln:
            assets.add(ln)
    return assets


def _build_equipment_strip(all_tag_data, profile_map):
    """Build the equipment strip: up to 10 boolean-tagged assets."""
    items = []
    seen_lines = set()
    now_iso = datetime.now().isoformat()
    for key, val in (all_tag_data or {}).items():
        tag_name = key.split('::')[-1] if '::' in key else key
        prof = (profile_map or {}).get(tag_name) or {}
        if prof.get('tag_type') != 'boolean':
            continue
        line_name = (prof.get('line_name') or '').strip()
        if not line_name or line_name in seen_lines:
            continue
        seen_lines.add(line_name)

        is_on = False
        try:
            if isinstance(val, bool):
                is_on = val
            elif isinstance(val, (int, float)):
                is_on = val > 0
            elif val is not None:
                is_on = str(val).strip().lower() in ('true', '1', 'on')
        except Exception:
            is_on = False

        status = 'ok' if is_on else 'idle'
        asset_short = (line_name[:4] or 'ASSET').upper()
        items.append({
            'asset_short': asset_short,
            'asset_name': line_name,
            'status': status,
            'last_change': now_iso,
        })
        if len(items) >= 10:
            break
    return items


def _build_production_ring(templates, all_tag_data, from_dt, to_dt):
    """Return production-target ring data, or None if we have no target.

    First ship: we do not have a server-side target registry. Return None so
    the UI hides the ring gracefully.
    """
    return None


def _build_timeline(templates, from_dt, to_dt):
    """Build the timeline strip: order_change events from dynamic_orders table
    + shift boundaries from shifts_config. OK to return empty events[] if the
    query fails; UI handles empty gracefully.
    """
    events = []
    shifts = []

    # ── Events: dynamic_orders ──────────────────────────────────────────
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual.cursor(cursor_factory=RealDictCursor)
            # Guard: table may not exist in all deployments
            cur.execute("""
                SELECT to_regclass('public.dynamic_orders') AS tbl
            """)
            row = cur.fetchone()
            if row and row.get('tbl'):
                cur.execute("""
                    SELECT order_name, status, start_time, end_time
                    FROM dynamic_orders
                    WHERE (start_time BETWEEN %s AND %s)
                       OR (end_time BETWEEN %s AND %s)
                    ORDER BY COALESCE(start_time, end_time) ASC
                    LIMIT 16
                """, (from_dt, to_dt, from_dt, to_dt))
                for r in cur.fetchall() or []:
                    ts = r.get('start_time') or r.get('end_time')
                    if not ts:
                        continue
                    events.append({
                        'timestamp': ts.isoformat() if hasattr(ts, 'isoformat') else str(ts),
                        'category': 'order_change',
                        'title': (r.get('order_name') or 'Order change'),
                        'description': f"status={r.get('status') or 'n/a'}",
                    })
            actual.commit()
    except Exception as e:
        logger.warning("_build_timeline: dynamic_orders query failed (non-blocking): %s", e)

    # ── Shifts ──────────────────────────────────────────────────────────
    try:
        import shifts_config as _shifts_cfg
        cfg = _shifts_cfg.get_shifts_config() or {}
        shift_defs = cfg.get('shifts') or []

        # Project shift boundaries across the period
        day_cursor = from_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        end_day = to_dt.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
        while day_cursor <= end_day and len(shifts) < 32:
            for s in shift_defs:
                try:
                    sh, sm = [int(p) for p in (s.get('start') or '00:00').split(':')[:2]]
                    eh, em = [int(p) for p in (s.get('end') or '00:00').split(':')[:2]]
                except Exception:
                    continue
                start_dt = day_cursor.replace(hour=sh, minute=sm)
                end_dt = day_cursor.replace(hour=eh, minute=em)
                if end_dt <= start_dt:
                    end_dt += timedelta(days=1)
                # Keep only boundaries that touch our window
                if end_dt < from_dt or start_dt > to_dt:
                    continue
                shifts.append({
                    'start': start_dt.isoformat(),
                    'end': end_dt.isoformat(),
                    'label': s.get('name') or '',
                })
            day_cursor += timedelta(days=1)
    except Exception as e:
        logger.warning("_build_timeline: shifts_config read failed (non-blocking): %s", e)

    # Rule 4: truncate events to 16
    return {'events': events[:16], 'shifts': shifts}


def _derive_overview_markdown(sanitised):
    """Build a short markdown overview from status_hero + top 3 attention_items.

    Used to populate the legacy `overview` field so distribution_engine and
    the old HerculesAISetup.jsx:534 rendering path keep working.
    """
    try:
        sh = sanitised.get('status_hero') or {}
        verdict = sh.get('verdict') or 'Briefing ready'
        lines = [f"**Plant Status** — {verdict}"]
        items = (sanitised.get('attention_items') or [])[:3]
        for it in items:
            asset = it.get('asset', '')
            headline = it.get('headline', '')
            bullet = f"• **{asset}**: {headline}" if asset else f"• {headline}"
            lines.append(bullet)
        if not items:
            lines.append("• **Alerts**: None")
        return '\n\n'.join(lines)
    except Exception as e:
        logger.warning("_derive_overview_markdown failed: %s", e)
        return '**Plant Status** — Briefing ready'


def _derive_reports_from_assets(assets, report_map):
    """Build the legacy `reports: [{id, name, summary}]` list by iterating
    assets and mapping related_report_ids back to the report registry."""
    report_by_id = {r['id']: r for r in (report_map or []) if r.get('id') is not None}
    out = []
    for a in (assets or []):
        name = a.get('name', '')
        notes = a.get('notes') or []
        summary_parts = []
        if notes:
            summary_parts.extend(f"• {n}" for n in notes[:3])
        hmetrics = a.get('headline_metrics') or []
        for m in hmetrics[:2]:
            label = m.get('label') or ''
            value = m.get('value')
            unit = m.get('unit') or ''
            if value is not None:
                summary_parts.append(f"• {label}: {value} {unit}".rstrip())
        summary_text = '\n'.join(summary_parts) or f"Status: {a.get('status', 'ok')}"
        related = a.get('related_report_ids') or []
        if related:
            # Emit one row per related report id (keeps old UI happy)
            for rid in related:
                r = report_by_id.get(rid)
                out.append({
                    'id': rid,
                    'name': r['name'] if r else name,
                    'summary': summary_text,
                })
        else:
            out.append({'id': None, 'name': name, 'summary': summary_text})
    return out


def _call_llm_json(prompt_bundle, ai_config, known_assets, period_from,
                   period_to, max_tokens=2000, timeout=45):
    """Call the LLM with the JSON-mode prompt, parse + validate, and retry once
    on validation failure. Returns a sanitised dict (never raises).
    """
    import ai_provider

    def _single_call(bundle, call_timeout=None):
        try:
            return ai_provider.generate(
                bundle['user'], ai_config,
                timeout=call_timeout or timeout,
                max_tokens=max_tokens,
                system=bundle.get('system'),
            )
        except Exception as e:
            logger.warning("_call_llm_json: provider raised %s", e)
            return None

    def _parse_json(raw_text):
        if not raw_text:
            return None, 'empty response'
        s = raw_text.strip()
        # Strip markdown code fences if the model wrapped the output
        if s.startswith('```'):
            s = re.sub(r'^```(?:json)?\s*', '', s)
            s = re.sub(r'\s*```\s*$', '', s)
        # Extract the outermost JSON object
        first = s.find('{')
        last = s.rfind('}')
        if first == -1 or last == -1 or last <= first:
            return None, 'no JSON object found'
        try:
            return json.loads(s[first:last + 1]), None
        except Exception as e:
            return None, f'JSON parse failed: {e}'

    raw = _single_call(prompt_bundle)
    parsed, parse_err = _parse_json(raw)
    errs = ai_prompts.validate_insights_schema(parsed) if parsed is not None else [parse_err or 'no parse']

    if errs:
        logger.warning("LLM JSON validation failed on first try: %s", errs[:3])
        # Retry once with the error fed back
        retry_bundle = dict(prompt_bundle)
        retry_bundle['user'] = (
            prompt_bundle['user']
            + '\n\nYour previous output failed validation:\n'
            + '\n'.join(f'- {e}' for e in errs[:5])
            + '\nReturn a new JSON object that fixes these issues.'
        )
        raw2 = _single_call(retry_bundle, call_timeout=30)  # shorter retry
        parsed2, parse_err2 = _parse_json(raw2)
        errs2 = ai_prompts.validate_insights_schema(parsed2) if parsed2 is not None else [parse_err2 or 'no parse']
        if not errs2:
            parsed = parsed2
        else:
            logger.warning("LLM JSON validation failed on retry too: %s — using stub", errs2[:3])
            parsed = ai_prompts.minimal_insights_stub()

    sanitised = ai_prompts.sanitize_insights_payload(
        parsed, known_assets, period_from, period_to
    )
    return sanitised


def _assemble_insights_response(sanitised, computed, period, meta):
    """Merge the sanitised LLM output with server-computed fields into the
    final /insights response dict. Does NOT include legacy fields — those
    are appended by the endpoint after calling this.
    """
    # data_age_minutes: how old is the newest data point (best-effort 0)
    data_age_minutes = 0
    try:
        to_dt = datetime.fromisoformat(period['to'].replace('Z', '+00:00')).replace(tzinfo=None)
        delta = datetime.now() - to_dt
        data_age_minutes = max(0, int(delta.total_seconds() // 60))
    except Exception:
        data_age_minutes = 0

    status_hero = dict(sanitised.get('status_hero') or {})
    status_hero.setdefault('level', 'warn')
    status_hero.setdefault('verdict', 'Briefing ready')
    status_hero['data_age_minutes'] = data_age_minutes

    # Ensure attention_items carry the period-scoped drill object
    cleaned_attn = []
    for it in (sanitised.get('attention_items') or []):
        entry = dict(it)
        drill = dict(entry.get('drill') or {})
        drill.setdefault('from', period.get('from', ''))
        drill.setdefault('to', period.get('to', ''))
        entry['drill'] = drill
        cleaned_attn.append(entry)

    # Ensure every asset has full_metrics + normalised notes
    cleaned_assets = []
    for a in (sanitised.get('assets') or []):
        a2 = dict(a)
        a2.setdefault('headline_metrics', [])
        a2.setdefault('full_metrics', list(a2['headline_metrics']))
        a2.setdefault('notes', [])
        a2.setdefault('related_report_ids', [])
        cleaned_assets.append(a2)

    response = {
        'schema_version': 3,
        'generated_at': datetime.now().isoformat(),
        'period': period,
        'status_hero': status_hero,
        'attention_items': cleaned_attn,
        'assets': cleaned_assets,
        'equipment_strip': computed.get('equipment_strip') or [],
        'meta': meta,
    }

    ring = computed.get('production_ring')
    if ring:
        response['production_ring'] = ring
    timeline = computed.get('timeline')
    if timeline and timeline.get('events'):
        response['timeline'] = timeline

    return response


@hercules_ai_bp.route('/hercules-ai/insights', methods=['POST'])
@login_required
def generate_insights():
    """Generate AI insights for selected reports and time range.

    Body: { report_ids?: int[], from: ISO8601, to: ISO8601 }
    Returns: InsightsResponse (see Frontend/src/Pages/HerculesAI/schemas.ts)
             plus backward-compat fields (overview, reports, tags_analyzed,
             kpi, comparison). If ?format=markdown is set, returns only the
             legacy markdown-compatible fields for the distribution engine.
    """
    data = request.get_json() or {}
    from_str = data.get('from')
    to_str = data.get('to')
    if not from_str or not to_str:
        return jsonify({'error': 'from and to are required'}), 400

    try:
        from_dt = datetime.fromisoformat(from_str.replace('Z', '+00:00')).replace(tzinfo=None)
        to_dt = datetime.fromisoformat(to_str.replace('Z', '+00:00')).replace(tzinfo=None)
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid date format: {e}'}), 400

    collected = _collect_tag_data_for_period(data.get('report_ids'), from_dt, to_dt)
    if isinstance(collected, tuple):
        return jsonify({'error': collected[0]}), collected[1]

    templates = collected['templates']
    all_tag_data = collected['all_tag_data']
    prev_tag_data = collected['prev_tag_data']
    report_names = collected['report_names']
    report_map = collected['report_map']
    all_layout_configs = collected['all_layout_configs']
    profile_map = collected['profile_map']
    ai_config = collected['ai_config']
    prev_from = collected['prev_from']
    prev_to = collected['prev_to']
    trend_data = collected.get('trend_data', {})
    counter_tags = collected.get('counter_tags', [])

    # Compute KPI score (no LLM, fast)
    try:
        import ai_kpi_scorer
        tariff = float(ai_config.get('electricity_tariff_omr_per_kwh', 0.025))
        kpi = ai_kpi_scorer.compute_kpi_score(
            tag_data=all_tag_data,
            prev_tag_data=prev_tag_data,
            profiles=profile_map,
            tariff_omr_per_kwh=tariff,
        )
    except Exception as e:
        logger.warning("KPI scoring failed: %s", e)
        kpi = None

    # Build text rows for the LLM prompt
    data_rows = []
    for key, value in all_tag_data.items():
        if '::' in key:
            agg_prefix, tag_name = key.split('::', 1)
        else:
            tag_name = key
            agg_prefix = 'last'
        prof = profile_map.get(tag_name)
        prev_val = prev_tag_data.get(key, 'N/A')
        unit = prof.get('unit', '') if prof else ''
        # Compute change percentage server-side
        change_pct = 'N/A'
        if prev_val not in ('N/A', None, ''):
            try:
                now_f = float(value)
                prev_f = float(prev_val)
                if prev_f != 0:
                    change_pct = f"{((now_f - prev_f) / prev_f * 100):+.1f}%"
                elif now_f != 0:
                    change_pct = '+inf'
            except (ValueError, TypeError):
                pass
        label = (prof.get('label') or tag_name) if prof else tag_name
        ttype = prof.get('tag_type', 'unknown') if prof else 'unknown'
        line = prof.get('line_name', '') if prof else ''
        data_rows.append(
            f"{label} | {ttype} | {unit} | {value} | {prev_val} | {change_pct} | {agg_prefix} | {line}"
        )

    if not data_rows:
        return jsonify({'error': 'No tag data available for the selected period'}), 400

    # Build structured comparison data for frontend table
    # Only show meaningful values: deltas (production), rates, and key booleans
    # Skip raw counter readings (last aggregation on counters = cumulative, not useful)
    comparison_rows = []
    for key, val in all_tag_data.items():
        tag_name = key.split('::')[-1] if '::' in key else key
        agg = key.split('::')[0] if '::' in key else 'last'
        prof = profile_map.get(tag_name, {})
        tag_type = prof.get('tag_type', '')

        # Filter: only deltas (production amounts), rates, percentages, and booleans
        if tag_type == 'counter' and agg != 'delta':
            continue  # skip raw meter readings
        if tag_type in ('unknown', 'id_selector', 'setpoint'):
            continue  # skip non-actionable tags

        label = prof.get('label') or tag_name
        unit = prof.get('unit', '')
        line = prof.get('line_name', '')
        prev_val = prev_tag_data.get(key)

        now_f = _safe_float(val)
        prev_f = _safe_float(prev_val)
        change = None
        if now_f is not None and prev_f is not None and prev_f != 0:
            change = round(((now_f - prev_f) / prev_f) * 100, 1)

        comparison_rows.append({
            'label': label,
            'type': tag_type,
            'unit': unit,
            'line': line,
            'aggregation': agg,
            'current': round(now_f, 2) if now_f is not None else None,
            'previous': round(prev_f, 2) if prev_f is not None else None,
            'change_pct': change,
        })

    # Sort: counters (delta) first, then rates, then by absolute change
    comparison_rows.sort(key=lambda r: (
        0 if r['type'] == 'counter' else 1 if r['type'] == 'rate' else 2,
        -(abs(r['change_pct']) if r['change_pct'] is not None else 0)
    ))

    from distribution_engine import _extract_report_context
    report_context = _extract_report_context(all_layout_configs)

    # Limit to 40 rows for insights
    structured_data = '\n'.join(data_rows[:40])
    time_from = from_dt.strftime('%Y-%m-%d %H:%M')
    time_to = to_dt.strftime('%Y-%m-%d %H:%M')
    prev_from_str = prev_from.strftime('%Y-%m-%d %H:%M')
    prev_to_str = prev_to.strftime('%Y-%m-%d %H:%M')

    # Determine comparison label based on period duration
    period_duration = to_dt - from_dt
    cmp_label = ai_prompts.resolve_comparison_label(period_duration)

    # Build trend summary for counter tags (oldest -> newest over 5 periods)
    trend_lines = []
    for tag_name in counter_tags:
        if tag_name not in trend_data or len(trend_data[tag_name]) < 2:
            continue
        profile = profile_map.get(tag_name, {})
        label = profile.get('label') or tag_name
        unit = profile.get('unit', '')

        # Build period values: [oldest(4), 3, 2, prev(1), current]
        vals = []
        for period_idx in [4, 3, 2]:
            v = trend_data[tag_name].get(period_idx)
            vals.append(_fmt_trend_val(v, unit))

        # Add previous period value (period 1)
        prev_key = f'delta::{tag_name}'
        prev_v = prev_tag_data.get(prev_key, prev_tag_data.get(tag_name))
        vals.append(_fmt_trend_val(prev_v, unit))

        # Add current period value
        curr_key = f'delta::{tag_name}'
        curr_v = all_tag_data.get(curr_key, all_tag_data.get(tag_name))
        vals.append(_fmt_trend_val(curr_v, unit))

        # Determine trend direction from numeric values
        numeric_vals = [_safe_float(v) for v in [
            trend_data[tag_name].get(4), trend_data[tag_name].get(3),
            trend_data[tag_name].get(2), prev_v, curr_v
        ] if _safe_float(v) is not None]

        direction = ''
        if len(numeric_vals) >= 3:
            if all(numeric_vals[j] >= numeric_vals[j + 1] for j in range(len(numeric_vals) - 1)):
                direction = '[declining]'
            elif all(numeric_vals[j] <= numeric_vals[j + 1] for j in range(len(numeric_vals) - 1)):
                direction = '[rising]'
            else:
                direction = '[fluctuating]'

        trend_lines.append(f"{label}: {' -> '.join(vals)} {direction}")

    trend_summary = '\n'.join(trend_lines) if trend_lines else ''

    # ── Legacy markdown pathway (distribution engine, old UI) ───────────
    if request.args.get('format') == 'markdown':
        prompt = ai_prompts.build_insights_prompt(
            report_names=[t['name'] for t in templates],
            time_from=time_from,
            time_to=time_to,
            cmp_label=cmp_label,
            prev_from_str=prev_from_str,
            prev_to_str=prev_to_str,
            structured_data=structured_data,
            report_context=report_context,
            trend_summary=trend_summary,
        )
        try:
            import ai_provider
            result = ai_provider.generate(
                prompt, ai_config, timeout=45,
                max_tokens=min(700 + 150 * len(templates), 2000)
            )
            if not result:
                return jsonify({'error': 'Could not generate insights. Check your provider settings.'}), 400

            overview = ''
            report_summaries = []
            parts = result.split('---REPORT:')
            overview = parts[0].strip()
            for part in parts[1:]:
                lines = part.strip().split('\n', 1)
                rname = lines[0].replace('---', '').strip()
                rsummary = lines[1].strip() if len(lines) > 1 else ''
                if not rsummary:
                    continue
                matched = next((r for r in report_map if r['name'].lower() == rname.lower()), None)
                report_summaries.append({
                    'id': matched['id'] if matched else None,
                    'name': matched['name'] if matched else rname,
                    'summary': rsummary,
                })

            return jsonify({
                'overview': overview,
                'reports': report_summaries,
                'period': {'from': from_str, 'to': to_str},
                'tags_analyzed': len(data_rows),
                'kpi': kpi,
                'comparison': comparison_rows[:15],
            })
        except Exception as e:
            logger.warning("Insights (markdown) generation failed: %s", e)
            err_msg = str(e)
            if 'authentication' in err_msg.lower() or '401' in err_msg:
                return jsonify({'error': 'Invalid API key. Please check your provider settings.'}), 400
            if 'timeout' in err_msg.lower():
                return jsonify({'error': 'Analysis timed out. Try a shorter time range or fewer reports.'}), 504
            return jsonify({'error': f'Insights failed: {err_msg}'}), 500

    # ── New JSON-mode pathway (primary) ─────────────────────────────────
    try:
        known_assets = _known_assets_from_profiles(profile_map)

        # Compute structured fields server-side
        production_ring = _build_production_ring(templates, all_tag_data, from_dt, to_dt)
        timeline = _build_timeline(templates, from_dt, to_dt)
        equipment_strip = _build_equipment_strip(all_tag_data, profile_map)

        # Build JSON-mode prompt
        prompt_bundle = ai_prompts.build_insights_prompt_json(
            report_names=[t['name'] for t in templates],
            time_from=time_from,
            time_to=time_to,
            cmp_label=cmp_label,
            prev_from_str=prev_from_str,
            prev_to_str=prev_to_str,
            structured_data=structured_data,
            known_assets=known_assets,
            report_context=report_context,
            trend_summary=trend_summary,
        )

        # Call LLM with JSON mode (retry-once-on-failure inside)
        sanitised = _call_llm_json(
            prompt_bundle, ai_config, known_assets,
            period_from=from_str, period_to=to_str,
            max_tokens=min(900 + 200 * len(templates), 2500),
            timeout=90,
        )

        # Assemble final response
        period = {'from': from_str, 'to': to_str, 'label': cmp_label}
        meta = {
            'model': ai_config.get('llm_model', 'unknown'),
            'prompt_version': ai_prompts.INSIGHTS_PROMPT_VERSION,
            'tokens_in': 0,
            'tokens_out': 0,
            'source_report_ids': [r['id'] for r in report_map if r.get('id') is not None],
        }
        response = _assemble_insights_response(
            sanitised,
            {
                'production_ring': production_ring,
                'timeline': timeline,
                'equipment_strip': equipment_strip,
            },
            period=period,
            meta=meta,
        )

        # ── Inject report_ids into attention_items + assets for "Open" button ──
        name_to_id = {r['name'].lower(): r['id'] for r in report_map if r.get('id')}
        for item in response.get('attention_items', []):
            asset = (item.get('asset') or '').lower()
            drill = item.get('drill') or {}
            if not drill.get('report_id'):
                # Match asset name to any report name (fuzzy)
                for rname, rid in name_to_id.items():
                    if asset in rname or rname in asset:
                        drill['report_id'] = rid
                        break
                item['drill'] = drill
        for asset in response.get('assets', []):
            name = (asset.get('name') or '').lower()
            if not asset.get('related_report_ids'):
                for rname, rid in name_to_id.items():
                    if name in rname or rname in name:
                        asset['related_report_ids'] = [rid]
                        break

        # ── Backward-compat fields (derived; no second LLM call) ────────
        response['overview'] = _derive_overview_markdown(sanitised)
        response['reports'] = _derive_reports_from_assets(sanitised.get('assets') or [], report_map)
        response['tags_analyzed'] = len(data_rows)
        response['kpi'] = kpi
        response['comparison'] = comparison_rows[:15]

        return jsonify(response)

    except Exception as e:
        logger.warning("Insights generation failed: %s", e)
        err_msg = str(e)
        if 'authentication' in err_msg.lower() or '401' in err_msg:
            return jsonify({'error': 'Invalid API key. Please check your provider settings.'}), 400
        if 'timeout' in err_msg.lower():
            return jsonify({'error': 'Analysis timed out. Try a shorter time range or fewer reports.'}), 504
        return jsonify({'error': f'Insights failed: {err_msg}'}), 500


@hercules_ai_bp.route('/hercules-ai/preview-charts', methods=['POST'])
@login_required
def preview_charts():
    """Generate chart previews for selected reports and time range.

    Body: { report_ids?: int[], from: ISO8601, to: ISO8601 }
    Returns: { charts: [{ title: str, image_base64: str }] }
    """
    data = request.get_json() or {}
    from_str = data.get('from')
    to_str = data.get('to')
    if not from_str or not to_str:
        return jsonify({'error': 'from and to are required'}), 400

    try:
        from_dt = datetime.fromisoformat(from_str.replace('Z', '+00:00')).replace(tzinfo=None)
        to_dt = datetime.fromisoformat(to_str.replace('Z', '+00:00')).replace(tzinfo=None)
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid date format: {e}'}), 400

    collected = _collect_tag_data_for_period(data.get('report_ids'), from_dt, to_dt)
    if isinstance(collected, tuple):
        return jsonify({'error': collected[0]}), collected[1]

    try:
        import ai_chart_generator
    except ImportError:
        return jsonify({'error': 'Chart generation not available (matplotlib not installed)'}), 500

    try:
        charts = ai_chart_generator.generate_charts_safe(
            collected['all_tag_data'],
            collected['prev_tag_data'],
            collected['profile_map'],
            collected['report_names'],
            from_dt, to_dt,
        )

        result = []
        for chart in charts:
            img_bytes = chart.get('image_bytes')
            if not img_bytes:
                continue
            result.append({
                'title': chart.get('title', ''),
                'image_base64': base64.b64encode(img_bytes).decode('ascii'),
            })

        return jsonify({'charts': result})

    except Exception as e:
        logger.exception("Chart preview failed: %s", e)
        return jsonify({'error': f'Chart generation failed: {e}'}), 500


@hercules_ai_bp.route('/hercules-ai/chart-data', methods=['POST'])
@login_required
def chart_data():
    """Return raw chart data for frontend Chart.js rendering.

    Body: { report_ids?: int[], from: ISO8601, to: ISO8601 }
    Returns: { production: {...}, equipment: {...}, rates: {...} }
    """
    data = request.get_json() or {}
    from_str = data.get('from')
    to_str = data.get('to')
    if not from_str or not to_str:
        return jsonify({'error': 'from and to are required'}), 400

    try:
        from_dt = datetime.fromisoformat(from_str.replace('Z', '+00:00')).replace(tzinfo=None)
        to_dt = datetime.fromisoformat(to_str.replace('Z', '+00:00')).replace(tzinfo=None)
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid date format: {e}'}), 400

    collected = _collect_tag_data_for_period(data.get('report_ids'), from_dt, to_dt)
    if isinstance(collected, tuple):
        return jsonify({'error': collected[0]}), collected[1]

    all_tag_data = collected['all_tag_data']
    prev_tag_data = collected['prev_tag_data']
    profiles = collected['profile_map']

    production = {'labels': [], 'current': [], 'previous': [], 'units': []}
    equipment = {'labels': [], 'states': []}
    rates = {'labels': [], 'current': [], 'previous': [], 'units': []}

    for key, val in all_tag_data.items():
        tag_name = key.split('::')[-1] if '::' in key else key
        agg = key.split('::')[0] if '::' in key else 'last'
        profile = profiles.get(tag_name, {})
        tag_type = profile.get('tag_type', 'unknown')
        label = profile.get('label') or _humanize_tag_name(tag_name)
        unit = profile.get('unit', '')
        prev_val = prev_tag_data.get(key)

        if tag_type == 'counter' and agg == 'delta':
            production['labels'].append(label)
            production['current'].append(_safe_float(val))
            production['previous'].append(_safe_float(prev_val))
            production['units'].append(unit)
        elif tag_type == 'boolean':
            equipment['labels'].append(label)
            v = val
            if isinstance(v, bool):
                equipment['states'].append(v)
            elif isinstance(v, (int, float)):
                equipment['states'].append(v > 0)
            else:
                equipment['states'].append(str(v).lower() in ('true', '1', 'on'))
        elif tag_type == 'rate':
            rates['labels'].append(label)
            rates['current'].append(_safe_float(val))
            rates['previous'].append(_safe_float(prev_val))
            rates['units'].append(unit)

    # Sort production by current value descending, top 8
    if production['labels']:
        combined = sorted(
            zip(production['labels'], production['current'],
                production['previous'], production['units']),
            key=lambda x: abs(x[1] or 0), reverse=True)[:8]
        production = {
            'labels': [c[0] for c in combined],
            'current': [c[1] or 0 for c in combined],
            'previous': [c[2] or 0 for c in combined],
            'units': [c[3] for c in combined],
        }

    # Same for rates
    if rates['labels']:
        combined = sorted(
            zip(rates['labels'], rates['current'],
                rates['previous'], rates['units']),
            key=lambda x: abs(x[1] or 0), reverse=True)[:8]
        rates = {
            'labels': [c[0] for c in combined],
            'current': [c[1] or 0 for c in combined],
            'previous': [c[2] or 0 for c in combined],
            'units': [c[3] for c in combined],
        }

    return jsonify({
        'production': production if production['labels'] else None,
        'equipment': equipment if equipment['labels'] else None,
        'rates': rates if rates['labels'] else None,
    })


@hercules_ai_bp.route('/hercules-ai/test-connection', methods=['POST'])
@login_required
def test_ai_connection():
    """Test AI provider connectivity and return detected model."""
    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        actual = conn._conn if hasattr(conn, '_conn') else conn
        cur = actual.cursor(cursor_factory=RealDictCursor)
        ai_config = _get_raw_config(cur)
        actual.commit()

    import ai_provider
    result = ai_provider.test_connection(ai_config)
    return jsonify(result)
