"""
Hercules AI Blueprint — Phase 1
================================
Tag profiling, classification, config management, and preview summary.
"""

import json
import logging
import re
import sys
from contextlib import closing
from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_login import login_required
from psycopg2.extras import RealDictCursor

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
            SELECT tag_name, label, tag_type, line_name
            FROM hercules_ai_tag_profiles
            WHERE tag_name = ANY(%s) AND is_tracked = true
        """, (list(chosen_tags),))
        profile_map = {r['tag_name']: r for r in cur.fetchall()}

        actual.commit()

    # Build structured data table
    data_rows = []
    for tag_name in sorted(chosen_tags):
        prof = profile_map.get(tag_name, {})
        # Check plain and namespaced keys
        value = tag_data.get(tag_name)
        if value is None:
            for k, v in tag_data.items():
                if k.endswith('::' + tag_name):
                    value = v
                    break
        if value is None:
            value = 'N/A'

        data_rows.append(
            f"{prof.get('label', tag_name) or tag_name} | "
            f"{prof.get('tag_type', 'unknown')} | "
            f"{value} | "
            f"{prof.get('line_name', '')}"
        )

    if not data_rows:
        return jsonify({'error': 'No data available for preview'}), 400

    structured_data = '\n'.join(data_rows)
    time_from = from_dt.strftime('%Y-%m-%d %H:%M')
    time_to = to_dt.strftime('%Y-%m-%d %H:%M')

    prompt = f"""You summarize production data for plant managers. Be extremely concise.

Report: {chosen_template['name']}
Period: {time_from} to {time_to}

Data (Label | Type | Value | Line):
{structured_data}

Output format — use EXACTLY this structure:
**{chosen_template['name']}** — {{one-line verdict: running normally / reduced output / line down / no data}}

• **Production**: {{key totals with values, or "No data recorded"}}
• **Status**: {{equipment on/off states, only if notable}}
• **Alerts**: {{zero counters, unusual values — or "None"}}

Rules:
- Maximum 4 bullet points. No bullet longer than 15 words.
- Only cite numbers from the data above. Never calculate or infer.
- N/A values mean no data was recorded — say "no data", don't speculate why.
- Skip any bullet that has nothing useful to report.
- No paragraphs. No filler. No recommendations."""

    try:
        import ai_provider
        summary = ai_provider.generate(prompt, ai_config)
        if not summary:
            return jsonify({'error': 'Could not generate summary. Check your provider settings.'}), 400
        return jsonify({
            'summary': summary,
            'report_name': chosen_template['name'],
            'tags_used': len(data_rows),
        })
    except Exception as e:
        logger.warning("Preview summary failed: %s", e)
        err_msg = str(e)
        if 'authentication' in err_msg.lower() or 'api key' in err_msg.lower() or '401' in err_msg:
            return jsonify({'error': 'Could not generate summary. Check your API key.'}), 400
        if 'timeout' in err_msg.lower() or 'timed out' in err_msg.lower():
            return jsonify({'error': 'Summary generation timed out. Try again.'}), 504
        return jsonify({'error': f'Could not generate summary: {err_msg}'}), 500


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
