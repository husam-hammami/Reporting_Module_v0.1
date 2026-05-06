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
    # Plan 5 — ROI Genius settings (Phase A surfaces; Settings page in Phase C)
    'pf_target': {'value': 0.90},
    'pf_penalty_rate_bz_per_kvarh': {'value': 4.0},
    'pf_correction_target': {'value': 0.95},
    'capacitor_cost_omr_per_kvar': {'value': 12},
    'value_per_ton_flour': {'value': None},
    'value_per_ton_bran': {'value': None},
    'value_per_ton_pasta': {'value': None},
    'shift_target_kg': {'value': {}},
    'savings_ledger_confidence_default_pct': {'value': 50},
    'savings_ledger_show_confidence_breakdown': {'value': True},
    'cfo_digest_enabled': {'value': False},
    'cfo_digest_recipients': {'value': []},
    'forecast_band_visible': {'value': True},
    'forecast_min_history_days': {'value': 7},
    'equipment_on_voltage_threshold_v': {'value': 0},
    'peak_hours': {'value': {'summer': [7, 22], 'winter': [7, 22]}},
    'roi_phase': {'value': 'A'},
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


# ═══════════════════════════════════════════════════════════════════════════
# Plan 5 — ROI Genius Layer endpoints (Phase A)
# ═══════════════════════════════════════════════════════════════════════════
# Public composed endpoint: /roi-payload (drives the entire AI tab in one call)
# Drilldown endpoints (used by tooltips, drawers, Model Health):
#     /asset-health, /sec, /pf-status, /savings, /levers, /savings/<id>/attribute,
#     /savings/<id>/dispute
# ═══════════════════════════════════════════════════════════════════════════

