"""
Distribution Engine
====================
Executes a distribution rule: loads the report template, fetches tag data,
generates HTML/PDF, and delivers via email and/or disk.
"""

import os
import re
import json
import logging
import smtplib
import base64
from datetime import datetime, timedelta
from email.message import EmailMessage
from html import escape as html_escape
from contextlib import closing

from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

# Default save directory (used when no path is provided)
DEFAULT_SAVE_DIR = os.getenv(
    'REPORT_SAVE_ROOT',
    os.path.join(os.path.abspath(os.path.dirname(__file__)), 'reports')
)


def _get_db_connection():
    """Get database connection function, avoiding circular imports."""
    import sys
    if 'app' in sys.modules:
        fn = getattr(sys.modules['app'], 'get_db_connection', None)
        if fn:
            return fn
    raise RuntimeError("Could not get database connection function")


# ── Tag extraction from layout_config ────────────────────────────────────────

def _parse_formula_tags(formula):
    """Extract {tagName} references from formula strings (paginated uses {Tag})."""
    tags = set()
    tags.update(re.findall(r'\[([^\]]+)\]', formula or ''))
    tags.update(t for t in re.findall(r'\{([^}]+)\}', formula or '') if not t.startswith('col:'))
    return tags


def _extract_datasource_tags(ds):
    """Extract tag names from a single dataSource dict."""
    tags = set()
    ds_type = ds.get('type', 'tag')
    if ds_type == 'tag' and ds.get('tagName'):
        tags.add(ds['tagName'])
    elif ds_type == 'group' and ds.get('groupTags'):
        tags.update(ds['groupTags'])
    elif ds_type == 'formula' and ds.get('formula'):
        tags.update(_parse_formula_tags(ds['formula']))
    return tags


def _extract_paginated_tags(sections):
    """Extract tag names from paginatedSections (Table Report format)."""
    tags = set()
    for s in (sections or []):
        s_type = s.get('type', '')

        if s_type == 'header':
            if s.get('statusTagName'):
                tags.add(s['statusTagName'])
            if s.get('statusFormula'):
                tags.update(_parse_formula_tags(s['statusFormula']))
            if s.get('statusSourceType') == 'group':
                for t in (s.get('statusGroupTags') or []):
                    if t:
                        tags.add(t)

        elif s_type == 'kpi-row':
            for k in (s.get('kpis') or []):
                if k.get('tagName'):
                    tags.add(k['tagName'])
                if k.get('formula'):
                    tags.update(_parse_formula_tags(k['formula']))
                if k.get('sourceType') == 'group':
                    for t in (k.get('groupTags') or []):
                        if t:
                            tags.add(t)

        elif s_type == 'table':
            for row in (s.get('rows') or []):
                for cell in (row.get('cells') or []):
                    if cell.get('tagName'):
                        tags.add(cell['tagName'])
                    if cell.get('formula'):
                        tags.update(_parse_formula_tags(cell['formula']))
                    if cell.get('sourceType') == 'group':
                        for t in (cell.get('groupTags') or []):
                            if t:
                                tags.add(t)
            if s.get('summaryFormula'):
                tags.update(_parse_formula_tags(s['summaryFormula']))
            for col in (s.get('columns') or []):
                sf = col.get('summary', {}).get('formula')
                if sf:
                    tags.update(_parse_formula_tags(sf))

    return tags


def extract_all_tags(layout_config):
    """Extract every tag name referenced in a report layout_config."""
    tags = set()

    # Dashboard widgets
    for widget in layout_config.get('widgets', []):
        config = widget.get('config', {})
        widget_type = widget.get('type', '')

        ds = config.get('dataSource', {})
        tags.update(_extract_datasource_tags(ds))

        if widget_type == 'silo':
            for key in ('capacityTag', 'tonsTag'):
                if config.get(key):
                    tags.add(config[key])

        for series in config.get('series', []):
            s_ds = series.get('dataSource', {})
            tags.update(_extract_datasource_tags(s_ds))

        for col in config.get('tableColumns', []):
            col_type = col.get('sourceType', 'tag')
            if col_type == 'tag' and col.get('tagName'):
                tags.add(col['tagName'])
            elif col_type == 'group' and col.get('groupTags'):
                tags.update(col['groupTags'])
            elif col_type == 'formula' and col.get('formula'):
                tags.update(_parse_formula_tags(col['formula']))

    # Paginated (Table Report) sections
    tags.update(_extract_paginated_tags(layout_config.get('paginatedSections', [])))

    return tags


def _collect_aggregation_groups(layout_config):
    """Collect per-tag aggregation types from paginated sections.
    Returns { aggregation_type: set(tag_names) } so we can fetch each group separately.
    Tags with no explicit aggregation default to 'last'.
    """
    agg_groups = {}  # { 'last': set(), 'first': set(), 'delta': set(), ... }

    def add_tag(tag_name, aggregation):
        agg = aggregation or 'last'
        if agg not in agg_groups:
            agg_groups[agg] = set()
        agg_groups[agg].add(tag_name)

    for s in (layout_config.get('paginatedSections') or []):
        s_type = s.get('type', '')

        if s_type == 'kpi-row':
            for k in (s.get('kpis') or []):
                if k.get('tagName'):
                    add_tag(k['tagName'], k.get('aggregation'))
                if k.get('formula'):
                    for t in _parse_formula_tags(k['formula']):
                        add_tag(t, k.get('aggregation'))

        elif s_type == 'table':
            for row in (s.get('rows') or []):
                for cell in (row.get('cells') or []):
                    src = cell.get('sourceType', 'static')
                    if src == 'tag' and cell.get('tagName'):
                        add_tag(cell['tagName'], cell.get('aggregation'))
                    elif src == 'formula' and cell.get('formula'):
                        for t in _parse_formula_tags(cell['formula']):
                            add_tag(t, cell.get('aggregation'))

    return agg_groups


def _fetch_tag_data_multi_agg(layout_config, tag_names, from_dt, to_dt):
    """Fetch tag data with per-cell aggregation support.
    For non-'last' aggregations, keys are namespaced as 'agg::tagName'.
    Returns a single merged dict.
    """
    agg_groups = _collect_aggregation_groups(layout_config)

    # Always fetch 'last' for all tags (default)
    tag_data = _fetch_tag_data(tag_names, from_dt, to_dt, aggregation='last')

    # Fetch additional aggregation groups and namespace the keys
    for agg, agg_tags in agg_groups.items():
        if agg == 'last':
            continue  # already fetched
        agg_result = _fetch_tag_data(agg_tags, from_dt, to_dt, aggregation=agg)
        for tag_name, value in agg_result.items():
            tag_data[f'{agg}::{tag_name}'] = value

    return tag_data


# ── Time range helper ────────────────────────────────────────────────────────

def _time_range_for_schedule(schedule_type):
    """Return (from_dt, to_dt) based on schedule frequency."""
    now = datetime.now()
    if schedule_type == 'daily':
        return now - timedelta(hours=24), now
    elif schedule_type == 'weekly':
        return now - timedelta(days=7), now
    else:  # monthly
        return now - timedelta(days=30), now


# ── Fetch tag data ───────────────────────────────────────────────────────────

def _fetch_tag_data(tag_names, from_dt, to_dt, aggregation='last'):
    """Fetch aggregated tag values from historian — same SQL as historian_bp /by-tags."""
    if not tag_names:
        return {}

    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        actual_conn = conn._conn if hasattr(conn, '_conn') else conn
        cur = actual_conn.cursor(cursor_factory=RealDictCursor)

        cur.execute(
            "SELECT id, tag_name FROM tags WHERE tag_name = ANY(%s) AND is_active = true",
            (list(tag_names),)
        )
        tag_map = {row['tag_name']: row['id'] for row in cur.fetchall()}
        if not tag_map:
            return {}

        tag_ids = list(tag_map.values())
        id_to_name = {v: k for k, v in tag_map.items()}
        result = {}

        if aggregation == 'last':
            cur.execute("""
                SELECT DISTINCT ON (h.tag_id) h.tag_id, h.value
                FROM tag_history h
                WHERE h.tag_id = ANY(%s)
                  AND h."timestamp" >= %s::timestamp
                  AND h."timestamp" <= %s::timestamp
                ORDER BY h.tag_id, h."timestamp" DESC
            """, (tag_ids, from_dt, to_dt))
            for row in cur.fetchall():
                name = id_to_name.get(row['tag_id'])
                if name:
                    result[name] = row['value']
        elif aggregation == 'first':
            cur.execute("""
                SELECT DISTINCT ON (h.tag_id) h.tag_id, h.value
                FROM tag_history h
                WHERE h.tag_id = ANY(%s)
                  AND h."timestamp" >= %s::timestamp
                  AND h."timestamp" <= %s::timestamp
                ORDER BY h.tag_id, h."timestamp" ASC
            """, (tag_ids, from_dt, to_dt))
            for row in cur.fetchall():
                name = id_to_name.get(row['tag_id'])
                if name:
                    result[name] = row['value']
        elif aggregation == 'delta':
            cur.execute("""
                SELECT DISTINCT ON (h.tag_id) h.tag_id, h.value
                FROM tag_history h
                WHERE h.tag_id = ANY(%s)
                  AND h."timestamp" >= %s::timestamp
                  AND h."timestamp" <= %s::timestamp
                ORDER BY h.tag_id, h."timestamp" ASC
            """, (tag_ids, from_dt, to_dt))
            first_vals = {row['tag_id']: row['value'] for row in cur.fetchall()}

            cur.execute("""
                SELECT DISTINCT ON (h.tag_id) h.tag_id, h.value
                FROM tag_history h
                WHERE h.tag_id = ANY(%s)
                  AND h."timestamp" >= %s::timestamp
                  AND h."timestamp" <= %s::timestamp
                ORDER BY h.tag_id, h."timestamp" DESC
            """, (tag_ids, from_dt, to_dt))
            for row in cur.fetchall():
                name = id_to_name.get(row['tag_id'])
                first = first_vals.get(row['tag_id'])
                if name and first is not None and row['value'] is not None:
                    result[name] = float(row['value']) - float(first)
        else:
            agg_fn = {'avg': 'AVG', 'min': 'MIN', 'max': 'MAX', 'sum': 'SUM', 'count': 'COUNT'}
            fn = agg_fn.get(aggregation, 'AVG')
            cur.execute(f"""
                SELECT h.tag_id, {fn}(h.value) AS agg_value
                FROM tag_history h
                WHERE h.tag_id = ANY(%s)
                  AND h."timestamp" >= %s::timestamp
                  AND h."timestamp" <= %s::timestamp
                GROUP BY h.tag_id
            """, (tag_ids, from_dt, to_dt))
            for row in cur.fetchall():
                name = id_to_name.get(row['tag_id'])
                if name:
                    result[name] = row['agg_value']

    return result


# ── Safe string helper ───────────────────────────────────────────────────────

def _esc(val):
    """HTML-escape a value for safe embedding in generated reports."""
    return html_escape(str(val))


# ── Formula evaluator (mirrors frontend formulaEngine.js) ────────────────────

def _safe_aggregate(fn_name, args_str):
    """Safely compute aggregate functions without eval()."""
    try:
        nums = [float(x.strip()) for x in args_str.split(',') if x.strip()]
    except (ValueError, TypeError):
        return '0'
    if not nums:
        return '0'
    if fn_name == 'sum':
        return str(sum(nums))
    elif fn_name == 'avg':
        return str(sum(nums) / len(nums))
    elif fn_name == 'min':
        return str(min(nums))
    elif fn_name == 'max':
        return str(max(nums))
    return '0'


# Thread-safe asteval interpreter — create per call to avoid shared state
def _get_formula_interp():
    from asteval import Interpreter
    return Interpreter()


def _evaluate_formula(formula, tag_data):
    """Evaluate a formula string like '{Tag1} + {Tag2} * 100'. Returns float or None."""
    if not formula or not formula.strip():
        return None
    try:
        expr = re.sub(r'\{([^}]+)\}', lambda m: str(float(tag_data.get(m.group(1), 0))), formula)

        for fn_pattern, fn_safe in [('SUM', 'sum'), ('AVG', 'avg'), ('MIN', 'min'), ('MAX', 'max')]:
            expr = re.sub(
                rf'\b{fn_pattern}\s*\(([^)]*)\)',
                lambda m, f=fn_safe: _safe_aggregate(f, m.group(1)),
                expr, flags=re.IGNORECASE
            )
        expr = re.sub(r'\bABS\s*\(([^)]*)\)', lambda m: str(abs(float(m.group(1)))), expr, flags=re.IGNORECASE)
        expr = re.sub(r'\bROUND\s*\(([^,]*),([^)]*)\)', lambda m: str(round(float(m.group(1)), int(m.group(2)))), expr, flags=re.IGNORECASE)
        expr = re.sub(r'\bIF\s*\(([^,]*),([^,]*),([^)]*)\)', lambda m: m.group(2).strip() if float(m.group(1)) else m.group(3).strip(), expr, flags=re.IGNORECASE)
        expr = re.sub(r'\bCLAMP\s*\(([^,]*),([^,]*),([^)]*)\)', lambda m: str(max(float(m.group(2)), min(float(m.group(3)), float(m.group(1))))), expr, flags=re.IGNORECASE)
        expr = re.sub(r'\bDIFF\s*\(([^)]*)\)', lambda m: m.group(1), expr, flags=re.IGNORECASE)
        expr = re.sub(r'\bRATE\s*\(([^)]*)\)', lambda m: m.group(1), expr, flags=re.IGNORECASE)

        sanitized = re.sub(r'[^0-9+\-*/%().eE\s]', '', expr)
        if not sanitized.strip():
            return None
        interp = _get_formula_interp()
        result = interp(sanitized)
        return float(result) if isinstance(result, (int, float)) and not (isinstance(result, float) and (result != result)) else None
    except Exception:
        return None


# ── Resolve a paginated cell value ───────────────────────────────────────────

def _resolve_cell(cell, tag_data):
    """Resolve a single paginated cell to a display string."""
    if not cell:
        return ''
    src = cell.get('sourceType', 'static')
    decimals = cell.get('decimals', 1) if cell.get('decimals') is not None else 1
    unit = cell.get('unit', '')
    if unit == '__checkbox__':
        unit = ''
    elif unit == '__custom__':
        unit = cell.get('customUnit', '')

    def _fmt(val):
        if val is None:
            return '—'
        try:
            n = float(val)
            formatted = f"{n:,.{decimals}f}"
            return f"{formatted} {unit}".strip() if unit else formatted
        except (TypeError, ValueError):
            return str(val)

    if src == 'static':
        return cell.get('value', '')

    if src == 'tag':
        tag_name = cell.get('tagName', '')
        agg = cell.get('aggregation', 'last')
        key = f'{agg}::{tag_name}' if agg and agg != 'last' else tag_name
        raw = tag_data.get(key)
        return _fmt(raw)

    if src == 'formula':
        result = _evaluate_formula(cell.get('formula', ''), tag_data)
        return _fmt(result)

    if src == 'group':
        vals = [float(tag_data.get(t, 0)) for t in (cell.get('groupTags') or []) if tag_data.get(t) is not None]
        if not vals:
            return '—'
        agg = cell.get('aggregation', 'avg')
        if agg == 'sum':
            n = sum(vals)
        elif agg == 'min':
            n = min(vals)
        elif agg == 'max':
            n = max(vals)
        elif agg == 'count':
            n = len(vals)
        else:
            n = sum(vals) / len(vals)
        return _fmt(n)

    return '—'


def _resolve_cell_raw(cell, tag_data):
    """Resolve a single cell to a raw (value, unit, decimals) tuple for Excel output.
    Returns: (value: float|str|None, unit: str, decimals: int)
    - value is a raw float for numeric cells (no formatting), str for static, None for missing
    """
    if not cell:
        return (None, '', 1)
    src = cell.get('sourceType', 'static')
    decimals = cell.get('decimals', 1) if cell.get('decimals') is not None else 1
    unit = cell.get('unit', '')
    if unit == '__checkbox__':
        unit = ''
    elif unit == '__custom__':
        unit = cell.get('customUnit', '')

    def _to_num(val):
        if val is None:
            return None
        try:
            return float(val)
        except (TypeError, ValueError):
            return str(val)

    if src == 'static':
        v = cell.get('value', '')
        try:
            return (float(v), unit, decimals)
        except (TypeError, ValueError):
            return (v, unit, decimals)

    if src == 'tag':
        tag_name = cell.get('tagName', '')
        agg = cell.get('aggregation', 'last')
        key = f'{agg}::{tag_name}' if agg and agg != 'last' else tag_name
        raw = tag_data.get(key)
        return (_to_num(raw), unit, decimals)

    if src == 'formula':
        result = _evaluate_formula(cell.get('formula', ''), tag_data)
        return (_to_num(result), unit, decimals)

    if src == 'group':
        vals = [float(tag_data.get(t, 0)) for t in (cell.get('groupTags') or []) if tag_data.get(t) is not None]
        if not vals:
            return (None, unit, decimals)
        agg = cell.get('aggregation', 'avg')
        if agg == 'sum':
            n = sum(vals)
        elif agg == 'min':
            n = min(vals)
        elif agg == 'max':
            n = max(vals)
        elif agg == 'count':
            n = len(vals)
        else:
            n = sum(vals) / len(vals)
        return (n, unit, decimals)

    return (None, '', 1)


# ── Row visibility (mirrors frontend isRowHidden) ────────────────────────────

def _is_row_hidden(row, tag_data):
    """Return True if the row should be hidden (bin inactive)."""
    if not row.get('hideWhenInactive'):
        return False
    ref_col = row.get('hideReferenceCol', 0) or 0
    cells = row.get('cells', [])
    if ref_col >= len(cells):
        return False
    cell = cells[ref_col]
    if not cell:
        return False
    resolved = _resolve_cell(cell, tag_data)
    if resolved in ('—', ''):
        return True
    cleaned = re.sub(r'[^0-9.\-]', '', str(resolved))
    if cleaned:
        try:
            return float(cleaned) == 0
        except (TypeError, ValueError):
            pass
    return False


# ── Logo helpers ─────────────────────────────────────────────────────────────

def _file_to_base64_data_uri(filepath):
    """Read an image file and return a data:image URI for HTML embedding."""
    if not os.path.isfile(filepath):
        return ''
    ext = os.path.splitext(filepath)[1].lower()
    mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'svg': 'image/svg+xml', 'gif': 'image/gif'}.get(ext.lstrip('.'), 'image/png')
    with open(filepath, 'rb') as f:
        encoded = base64.b64encode(f.read()).decode('ascii')
    return f'data:{mime};base64,{encoded}'


def _get_logo_data_uris():
    """Return (hercules_uri, asm_uri, client_logo_uri) for embedding in HTML reports."""
    backend_dir = os.path.abspath(os.path.dirname(__file__))
    project_root = os.path.dirname(backend_dir)

    # Search multiple possible logo directories (Vite dist, static, source assets)
    search_dirs = [
        os.path.join(backend_dir, 'static', 'assets'),           # backend/static/assets/
        os.path.join(project_root, 'Frontend', 'dist', 'assets'),  # Frontend/dist/assets/
        os.path.join(project_root, 'Frontend', 'src', 'Assets'),   # Frontend/src/Assets/
    ]

    hercules_uri = ''
    asm_uri = ''
    for search_dir in search_dirs:
        if not os.path.isdir(search_dir):
            continue
        for fname in os.listdir(search_dir):
            if fname.startswith('Hercules_New') and fname.endswith('.png') and not hercules_uri:
                hercules_uri = _file_to_base64_data_uri(os.path.join(search_dir, fname))
            elif fname.startswith('Asm_Logo') and fname.endswith('.png') and not asm_uri:
                asm_uri = _file_to_base64_data_uri(os.path.join(search_dir, fname))
        if hercules_uri and asm_uri:
            break  # Found both, stop searching

    # Client logo from DB (stored as base64 data URI)
    client_logo_uri = ''
    try:
        get_conn = _get_db_connection()
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual_conn.cursor(cursor_factory=RealDictCursor)
            cur.execute("SELECT value FROM system_settings WHERE key = 'client_logo'")
            row = cur.fetchone()
            if row and row.get('value'):
                client_logo_uri = row['value']
    except Exception:
        pass

    return hercules_uri, asm_uri, client_logo_uri


# ── Shared CSS (matches frontend PaginatedReportPreview / ReportViewer) ──────

_SHARED_CSS = """
@page { size: A4; margin: 8mm 10mm; }
body {
  font-family: Inter, system-ui, -apple-system, sans-serif;
  font-size: 13px;
  color: #1a1a2e;
  line-height: 1.4;
  margin: 0;
  padding: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Logo header bar (table-based for xhtml2pdf compat) ── */
.logo-header-table { margin-bottom: 4px; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 4px; }
.logo-header-table img { vertical-align: middle; }

/* ── Report header ── */
h1.report-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #0f172a;
  margin: 2px 0 2px 0;
}
p.subtitle { font-size: 13px; color: #64748b; margin: 0 0 2px 0; }
p.period   { font-size: 12px; color: #94a3b8; font-weight: 500; margin: 0 0 4px 0; }
.header-rule {
  margin-top: 4px;
  height: 2px;
  background-color: #1a5276;
}

/* ── Section label ── */
.section-label {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
  margin: 12px 0 4px 0;
}
.kpi-section-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  margin: 10px 0 4px 0;
}

/* ── KPI row (table-based for xhtml2pdf compat) ── */
.kpi-row-table { width: 100%; margin-bottom: 8px; }
.kpi-row-table td { text-align: right; padding: 2px 8px; }
.kpi-label { font-size: 10px; font-weight: 500; color: #64748b; }
.kpi-value { font-size: 13px; font-weight: 700; color: #0f172a; }

/* ── Data tables ── */
table.data-table {
  width: 100%;
  border-collapse: collapse;
  margin: 4px 0 8px 0;
  font-size: 11px;
}
table.data-table th {
  padding: 6px 8px;
  font-weight: 700;
  font-size: 10px;
  border: 1px solid #94a3b8;
  background-color: #1e293b;
  color: #ffffff;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
table.data-table td {
  padding: 5px 8px;
  font-size: 11px;
  border: 1px solid #d1d5db;
  color: #1e293b;
}
table.data-table .alt-row { background-color: #f1f5f9; }
table.data-table .summary-row { font-weight: 700; background-color: #e0f2fe; }
table.data-table .summary-row td { border-top: 2px solid #94a3b8; font-size: 11px; }

/* ── Text blocks ── */
.text-block { margin-bottom: 6px; }

/* ── Signature block ── */
.sig-block { margin-top: 24px; margin-bottom: 8px; }
.sig-block table { width: 100%; border-collapse: collapse; }
.sig-block td { padding: 0 16px; vertical-align: top; }
.sig-label { font-size: 11px; font-weight: 500; color: #64748b; margin-bottom: 24px; }
.sig-line  { border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; font-size: 12px; color: #334155; min-height: 18px; }
.sig-date  { font-size: 10px; color: #94a3b8; margin-top: 4px; }

/* ── Page footer ── */
.page-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 4px 10mm;
  font-size: 10px;
  color: #94a3b8;
}

/* ── Dashboard grid (for dashboard-type reports) ── */
.dashboard-section { margin-bottom: 12px; }
.dashboard-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 10px;
}
.widget-label { font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 4px; }
.widget-value { font-size: 22px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums; }
.widget-unit  { font-size: 13px; font-weight: 500; color: #94a3b8; margin-left: 4px; }
.widget-silo  { font-size: 14px; color: #334155; }
.widget-chart-note { font-size: 11px; color: #94a3b8; font-style: italic; padding: 8px 0; }

/* ── Generated footer ── */
.gen-footer {
  margin-top: 28px;
  font-size: 10px;
  color: #94a3b8;
  border-top: 1px solid #e5e7eb;
  padding-top: 8px;
}
"""


# ── Logo header HTML builder ─────────────────────────────────────────────────

def _build_logo_header_html(hercules_uri, asm_uri, client_logo_uri):
    """Build the logo header bar using table layout (xhtml2pdf doesn't support flexbox)."""
    herc_td = f'<img src="{hercules_uri}" alt="Hercules" style="height:44px;width:auto" />' if hercules_uri else '&nbsp;'
    right_imgs = ''
    if client_logo_uri:
        right_imgs += f'<img src="{client_logo_uri}" alt="Client" style="height:40px;width:auto;max-width:140px" /> '
    if asm_uri:
        right_imgs += f'<img src="{asm_uri}" alt="ASM" style="height:40px;width:auto" />'
    right_td = right_imgs or '&nbsp;'

    return f"""<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;border-bottom:1.5px solid #e2e8f0;padding-bottom:4px">
  <tr>
    <td style="text-align:left;vertical-align:middle">{herc_td}</td>
    <td style="text-align:right;vertical-align:middle">{right_td}</td>
  </tr>
</table>"""


# ── HTML report generation ───────────────────────────────────────────────────

def _generate_dashboard_html(report_name, widgets, tag_data, from_dt, to_dt):
    """Generate HTML report from dashboard widgets, styled to match frontend viewer."""
    period = f"{from_dt.strftime('%d/%m/%Y, %H:%M:%S')} to {to_dt.strftime('%d/%m/%Y, %H:%M:%S')}"
    hercules_uri, asm_uri, client_logo_uri = _get_logo_data_uris()

    cards_html = ""
    for widget in sorted(widgets, key=lambda w: (w.get('y', 0), w.get('x', 0))):
        w_type = widget.get('type', '')
        config = widget.get('config', {})
        label = config.get('label') or config.get('title') or widget.get('i', w_type)

        if w_type in ('kpi', 'gauge', 'stat'):
            ds = config.get('dataSource', {})
            tag = ds.get('tagName', '')
            val = tag_data.get(tag, '—')
            if isinstance(val, float):
                val = f"{val:,.2f}"
            unit = config.get('unit', '')
            unit_html = f'<span class="widget-unit">{_esc(unit)}</span>' if unit else ''
            cards_html += f'<div class="dashboard-card"><div class="widget-label">{_esc(label)}</div><div class="widget-value">{_esc(val)}{unit_html}</div></div>\n'

        elif w_type == 'silo':
            ds = config.get('dataSource', {})
            tag = ds.get('tagName', '')
            val = tag_data.get(tag, '—')
            if isinstance(val, float):
                val = f"{val:.1f}"
            cap_tag = config.get('capacityTag', '')
            cap_val = tag_data.get(cap_tag, '—')
            tons_tag = config.get('tonsTag', '')
            tons_val = tag_data.get(tons_tag, '—')
            if isinstance(cap_val, float):
                cap_val = f"{cap_val:,.0f}"
            if isinstance(tons_val, float):
                tons_val = f"{tons_val:,.1f}"
            cards_html += f'<div class="dashboard-card"><div class="widget-label">{_esc(label)}</div>'
            cards_html += f'<div class="widget-silo">Level: <strong>{_esc(val)}%</strong> &nbsp;|&nbsp; Capacity: <strong>{_esc(cap_val)}</strong> &nbsp;|&nbsp; Tons: <strong>{_esc(tons_val)}</strong></div></div>\n'

        elif w_type in ('chart', 'barchart'):
            series_parts = []
            for s in config.get('series', []):
                s_ds = s.get('dataSource', {})
                s_tag = s_ds.get('tagName', '')
                s_val = tag_data.get(s_tag, '—')
                if isinstance(s_val, float):
                    s_val = f"{s_val:,.2f}"
                s_label = s.get('label', s_tag)
                series_parts.append(f'<span class="kpi-item"><span class="kpi-label">{_esc(s_label)}: </span><span class="kpi-value">{_esc(s_val)}</span></span>')
            cards_html += f'<div class="dashboard-card"><div class="widget-label">{_esc(label)}</div>'
            cards_html += f'<div class="widget-chart-note">Chart — latest data point values:</div>'
            cards_html += f'<div class="kpi-row" style="justify-content:flex-start">{"  ".join(series_parts)}</div></div>\n'

        elif w_type == 'table':
            cols = config.get('tableColumns', [])
            header_cells = ''.join(f'<th>{_esc(c.get("label", ""))}</th>' for c in cols)
            # Single row of latest values
            data_cells = ''
            for col in cols:
                col_type = col.get('sourceType', 'tag')
                if col_type == 'tag':
                    c_val = tag_data.get(col.get('tagName', ''), '—')
                    if isinstance(c_val, float):
                        c_val = f"{c_val:,.2f}"
                    data_cells += f'<td>{_esc(c_val)}</td>'
                elif col_type == 'group':
                    vals = [str(tag_data.get(t, '—')) for t in col.get('groupTags', [])]
                    data_cells += f'<td>{_esc(", ".join(vals))}</td>'
                elif col_type == 'formula':
                    result = _evaluate_formula(col.get('formula', ''), tag_data)
                    data_cells += f'<td>{_esc(f"{result:,.2f}" if isinstance(result, float) else (result or "—"))}</td>'
                else:
                    data_cells += '<td>—</td>'
            cards_html += f'<div class="dashboard-card"><div class="widget-label">{_esc(label)}</div>'
            cards_html += f'<table class="data-table"><thead><tr>{header_cells}</tr></thead><tbody><tr>{data_cells}</tr></tbody></table></div>\n'

        elif w_type in ('text', 'header', 'image', 'spacer', 'divider'):
            if w_type == 'text':
                text = config.get('text', config.get('content', ''))
                if text:
                    cards_html += f'<div class="text-block" style="font-size:13px;color:#334155">{_esc(text)}</div>\n'
            elif w_type == 'header':
                text = config.get('text', config.get('title', ''))
                if text:
                    cards_html += f'<div class="text-block" style="font-size:16px;font-weight:700;color:#0f172a">{_esc(text)}</div>\n'

        else:
            ds = config.get('dataSource', {})
            tag = ds.get('tagName', '')
            if tag:
                val = tag_data.get(tag, '—')
                if isinstance(val, float):
                    val = f"{val:,.2f}"
                unit = config.get('unit', '')
                unit_html = f'<span class="widget-unit">{_esc(unit)}</span>' if unit else ''
                cards_html += f'<div class="dashboard-card"><div class="widget-label">{_esc(label)}</div><div class="widget-value">{_esc(val)}{unit_html}</div></div>\n'

    logo_html = _build_logo_header_html(hercules_uri, asm_uri, client_logo_uri)

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>{_SHARED_CSS}</style></head>
<body style="padding: 4mm 10mm 8mm 10mm; width: 190mm;">
{logo_html}
<h1 class="report-title" style="text-align:center">{_esc(report_name)}</h1>
<p class="period" style="text-align:center">({_esc(period)})</p>
<div class="header-rule"></div>
<div class="dashboard-section" style="margin-top:12px">
{cards_html}
</div>
<div class="gen-footer">
Generated by Hercules Reporting Module on {datetime.now().strftime('%d/%m/%Y, %H:%M:%S')}
</div>
</body></html>"""


def _generate_paginated_html(report_name, sections, tag_data, from_dt, to_dt):
    """Generate HTML report from paginated (Table Report) sections, styled to match frontend."""
    period = f"{from_dt.strftime('%d/%m/%Y, %H:%M:%S')} to {to_dt.strftime('%d/%m/%Y, %H:%M:%S')}"
    hercules_uri, asm_uri, client_logo_uri = _get_logo_data_uris()
    logo_html = _build_logo_header_html(hercules_uri, asm_uri, client_logo_uri)
    body_parts = [logo_html]

    total_rows = sum(len(s.get('rows', [])) for s in (sections or []) if s.get('type') == 'table')

    for s in (sections or []):
        s_type = s.get('type', '')

        if s_type == 'header':
            title = s.get('title', report_name) or report_name
            subtitle = s.get('subtitle', '')
            align = s.get('align', 'center')
            body_parts.append(f'<div style="text-align:{_esc(align)};margin-bottom:4px">')
            body_parts.append(f'<h1 class="report-title">{_esc(title)}</h1>')
            if subtitle:
                body_parts.append(f'<p class="subtitle">{_esc(subtitle)}</p>')

            # Status field
            status_src = s.get('statusSourceType', 'static')
            status_val = None
            if status_src == 'static':
                sv = s.get('statusValue', '')
                if sv is not None and sv != '':
                    status_val = str(sv)
            elif status_src == 'tag' and s.get('statusTagName'):
                cell = {'sourceType': 'tag', 'tagName': s['statusTagName'],
                        'decimals': 1, 'unit': '', 'customUnit': ''}
                status_val = _resolve_cell(cell, tag_data)
            elif status_src == 'formula' and s.get('statusFormula'):
                cell = {'sourceType': 'formula', 'formula': s['statusFormula'],
                        'decimals': 1, 'unit': '', 'customUnit': ''}
                status_val = _resolve_cell(cell, tag_data)
            elif status_src == 'group' and s.get('statusGroupTags'):
                cell = {'sourceType': 'group', 'groupTags': s['statusGroupTags'],
                        'aggregation': s.get('statusAggregation', 'avg'),
                        'decimals': 1, 'unit': '', 'customUnit': ''}
                status_val = _resolve_cell(cell, tag_data)

            if status_val and status_val not in ('—', ''):
                status_label = s.get('statusLabel', 'Status')
                body_parts.append(f'<p class="subtitle">{_esc(status_label)}: {_esc(status_val)}</p>')

            if s.get('showDateRange', True):
                body_parts.append(f'<p class="period">({_esc(period)})</p>')
            body_parts.append('<div class="header-rule"></div>')
            body_parts.append('</div>')

        elif s_type == 'kpi-row':
            label = s.get('label', '')
            kpis = s.get('kpis', [])
            if label:
                body_parts.append(f'<div class="kpi-section-label">{_esc(label)}</div>')
            kpi_items = []
            for k in kpis:
                kpi_label = k.get('label', '')
                cell_data = {
                    'sourceType': k.get('sourceType', 'tag'),
                    'tagName': k.get('tagName', ''),
                    'formula': k.get('formula', ''),
                    'unit': k.get('unit', ''),
                    'customUnit': k.get('customUnit', ''),
                    'decimals': k.get('decimals', 1),
                    'groupTags': k.get('groupTags', []),
                    'aggregation': k.get('aggregation', 'avg'),
                }
                val = _resolve_cell(cell_data, tag_data)
                kpi_items.append(
                    f'<td><span class="kpi-label">{_esc(kpi_label)}</span><br/>'
                    f'<span class="kpi-value">{_esc(val)}</span></td>'
                )
            if kpi_items:
                body_parts.append(f'<table class="kpi-row-table"><tr>{"".join(kpi_items)}</tr></table>')

        elif s_type == 'table':
            label = s.get('label', '')
            columns = s.get('columns', [])
            rows = s.get('rows', [])
            if label:
                body_parts.append(f'<div class="section-label">{_esc(label)}</div>')

            header_cells = ''.join(
                f'<th style="text-align:{_esc(c.get("align", "left"))}'
                f'{";width:" + _esc(c["width"]) if c.get("width") and c["width"] != "auto" else ""}">'
                f'{_esc(c.get("header", ""))}</th>'
                for c in columns
            )
            body_parts.append(f'<table class="data-table"><thead><tr>{header_cells}</tr></thead><tbody>')

            visible_row_idx = 0
            for row in rows:
                if _is_row_hidden(row, tag_data):
                    continue
                cells = row.get('cells', [])
                stripe = ' class="alt-row"' if visible_row_idx % 2 == 1 else ''
                td_parts = []
                for i, cell in enumerate(cells):
                    align = columns[i].get('align', 'left') if i < len(columns) else 'left'
                    val = _resolve_cell(cell, tag_data)
                    td_parts.append(f'<td style="text-align:{_esc(align)}">{_esc(val)}</td>')
                body_parts.append(f'<tr{stripe}>{"".join(td_parts)}</tr>')
                visible_row_idx += 1

            # Summary row (per-column or legacy)
            has_summary = s.get('showSummaryRow') or any(
                c.get('summary', {}).get('enabled') or (c.get('summary', {}).get('type') and c.get('summary', {}).get('type') != 'none')
                for c in columns
            )
            if has_summary:
                has_per_col = any(
                    c.get('summary', {}).get('type') and c['summary']['type'] != 'none'
                    for c in columns
                )
                summary_cells = []
                for ci, col in enumerate(columns):
                    sm = col.get('summary', {})
                    sm_type = sm.get('type', 'none')

                    if sm_type == 'label':
                        summary_cells.append(
                            f'<td class="summary-row" style="text-align:{_esc(col.get("align", "left"))}">'
                            f'{_esc(sm.get("label", s.get("summaryLabel", "Total")))}</td>'
                        )
                    elif sm_type == 'formula':
                        result = _evaluate_formula(sm.get('formula', ''), tag_data)
                        unit = sm.get('unit', '')
                        val_str = f"{result:,.1f}" if isinstance(result, (int, float)) and result is not None else '—'
                        if unit and val_str != '—':
                            val_str = f"{val_str} {unit}"
                        summary_cells.append(
                            f'<td class="summary-row" style="text-align:{_esc(col.get("align", "right"))}">{_esc(val_str)}</td>'
                        )
                    elif sm_type in ('sum', 'avg', 'min', 'max', 'count'):
                        # Aggregate from visible row values in this column
                        col_vals = []
                        for row in rows:
                            if _is_row_hidden(row, tag_data):
                                continue
                            cell = row.get('cells', [None] * (ci + 1))[ci] if ci < len(row.get('cells', [])) else None
                            if cell:
                                rv = _resolve_cell(cell, tag_data)
                                cleaned = re.sub(r'[^0-9.\-]', '', str(rv))
                                if cleaned:
                                    try:
                                        col_vals.append(float(cleaned))
                                    except (TypeError, ValueError):
                                        pass
                        if col_vals:
                            if sm_type == 'sum':
                                agg = sum(col_vals)
                            elif sm_type == 'avg':
                                agg = sum(col_vals) / len(col_vals)
                            elif sm_type == 'min':
                                agg = min(col_vals)
                            elif sm_type == 'max':
                                agg = max(col_vals)
                            elif sm_type == 'count':
                                agg = len(col_vals)
                            else:
                                agg = None
                            val_str = f"{agg:,.1f}" if agg is not None else '—'
                            sm_unit = sm.get('unit', '')
                            if sm_unit and val_str != '—':
                                val_str = f"{val_str} {sm_unit}"
                            agg_label = f"{sm.get('label', '')}: " if sm.get('label') else ''
                            summary_cells.append(
                                f'<td class="summary-row" style="text-align:{_esc(col.get("align", "right"))}">{_esc(agg_label)}{_esc(val_str)}</td>'
                            )
                        else:
                            summary_cells.append(f'<td class="summary-row">—</td>')
                    elif not has_per_col:
                        # Legacy mode
                        if ci == 0:
                            colspan = max(1, len(columns) - 1)
                            summary_cells.append(
                                f'<td class="summary-row" style="text-align:right" colspan="{colspan}">'
                                f'{_esc(s.get("summaryLabel", "Total"))}</td>'
                            )
                        elif ci == len(columns) - 1 and s.get('summaryFormula'):
                            result = _evaluate_formula(s['summaryFormula'], tag_data)
                            su = s.get('summaryUnit', '')
                            val_str = f"{result:,.1f}" if isinstance(result, (int, float)) and result is not None else '—'
                            if su and val_str != '—':
                                val_str = f"{val_str} {su}"
                            summary_cells.append(
                                f'<td class="summary-row" style="text-align:right">{_esc(val_str)}</td>'
                            )
                        # else: skip (covered by colspan)
                    else:
                        # Per-column mode but this column has no summary
                        if ci == 0:
                            summary_cells.append(
                                f'<td class="summary-row" style="text-align:left">'
                                f'{_esc(s.get("summaryLabel", "Total"))}</td>'
                            )
                        else:
                            summary_cells.append(f'<td class="summary-row"></td>')

                body_parts.append(f'<tr class="summary-row">{"".join(summary_cells)}</tr>')

            body_parts.append('</tbody></table>')

        elif s_type == 'text-block':
            content = s.get('content', '')
            fs = s.get('fontSize', '14px')
            fw = s.get('fontWeight', '600')
            align = s.get('align', 'left')
            color = s.get('color', '#0f172a')
            body_parts.append(
                f'<div class="text-block" style="font-size:{_esc(fs)};font-weight:{_esc(fw)};'
                f'text-align:{_esc(align)};color:{_esc(color)}">{_esc(content)}</div>'
            )

        elif s_type == 'spacer':
            h = s.get('height', 16)
            body_parts.append(f'<div style="height:{h}px"></div>')

        elif s_type == 'signature-block':
            fields = s.get('fields', [])
            if fields:
                body_parts.append('<div class="sig-block"><table><tr>')
                for f in fields:
                    body_parts.append(
                        f'<td><div class="sig-label">{_esc(f.get("label", ""))}</div>'
                        f'<div class="sig-line">{_esc(f.get("value", ""))}&nbsp;</div>'
                        f'<div class="sig-date">Date: _______________</div></td>'
                    )
                body_parts.append('</tr></table></div>')

    content_html = '\n'.join(body_parts)

    footer_records = f'Records: {total_rows}' if total_rows > 0 else ''
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>{_SHARED_CSS}</style></head>
<body style="padding: 4mm 10mm 8mm 10mm; width: 190mm;">
{content_html}
<div class="gen-footer" style="display:flex;justify-content:space-between">
<span>{_esc(footer_records)}</span>
<span>Generated by Hercules Reporting Module on {datetime.now().strftime('%d/%m/%Y, %H:%M:%S')}</span>
</div>
</body></html>"""


def _generate_report_html(report_name, layout_config, tag_data, from_dt, to_dt):
    """Route to the correct renderer based on report type."""
    report_type = layout_config.get('reportType', 'dashboard')
    paginated_sections = layout_config.get('paginatedSections', [])

    if report_type == 'paginated' and paginated_sections:
        return _generate_paginated_html(report_name, paginated_sections, tag_data, from_dt, to_dt)
    else:
        widgets = layout_config.get('widgets', [])
        return _generate_dashboard_html(report_name, widgets, tag_data, from_dt, to_dt)


# ── PDF conversion ───────────────────────────────────────────────────────────

def _html_to_pdf(html_content):
    """Convert HTML string to PDF bytes using xhtml2pdf."""
    from xhtml2pdf import pisa
    from io import BytesIO
    buf = BytesIO()
    result = pisa.CreatePDF(html_content, dest=buf)
    if result.err:
        raise RuntimeError(f"PDF generation failed with {result.err} error(s)")
    return buf.getvalue()


# ── Public API for report export ──────────────────────────────────────────────

def generate_report_xlsx(report_name, layout_config, from_dt, to_dt):
    """Public wrapper: generate an Excel report from a template config and date range.
    Returns: bytes (xlsx file content)
    """
    tag_names = extract_all_tags(layout_config)
    tag_data = _fetch_tag_data_multi_agg(layout_config, tag_names, from_dt, to_dt)
    return _generate_xlsx(report_name, layout_config, tag_data, from_dt, to_dt)


# ── Excel (XLSX) generation ──────────────────────────────────────────────────

def _generate_xlsx(report_name, layout_config, tag_data, from_dt, to_dt):
    """Generate an Excel workbook from a report template and tag data.
    Returns: bytes (xlsx file content)
    """
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    from io import BytesIO

    wb = Workbook()
    wb.properties.title = report_name
    wb.properties.creator = "Hercules Reporting Module"

    # Shared styles
    header_font = Font(name='Calibri', bold=True, color='FFFFFF', size=10)
    header_fill = PatternFill(start_color='1A2233', end_color='1A2233', fill_type='solid')
    alt_fill = PatternFill(start_color='F5F8FB', end_color='F5F8FB', fill_type='solid')
    summary_fill = PatternFill(start_color='DBEAFE', end_color='DBEAFE', fill_type='solid')
    summary_font = Font(name='Calibri', bold=True, size=10)
    title_font = Font(name='Calibri', bold=True, size=14)
    subtitle_font = Font(name='Calibri', size=11, color='666666')
    kpi_label_font = Font(name='Calibri', size=9, color='888888')
    kpi_value_font = Font(name='Calibri', bold=True, size=12)
    thin_border = Border(
        bottom=Side(style='thin', color='E3E9F0')
    )
    header_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
    num_align = Alignment(horizontal='right', vertical='center')
    text_align = Alignment(horizontal='left', vertical='center')

    report_type = layout_config.get('reportType', 'paginated')

    try:
        if report_type == 'paginated':
            _xlsx_paginated(wb, layout_config, tag_data, from_dt, to_dt, report_name,
                            header_font, header_fill, alt_fill, summary_fill, summary_font,
                            title_font, subtitle_font, kpi_label_font, kpi_value_font,
                            thin_border, header_align, num_align, text_align)
        else:
            _xlsx_dashboard(wb, layout_config, tag_data, from_dt, to_dt, report_name,
                            header_font, header_fill, alt_fill, title_font, subtitle_font,
                            kpi_label_font, kpi_value_font, thin_border, num_align, text_align)
    except Exception as e:
        logger.error(f"Excel generation failed for '{report_name}': {e}", exc_info=True)
        raise RuntimeError(f"Excel generation failed: {e}")

    # Auto-fit column widths on all sheets
    for ws in wb.worksheets:
        for col_cells in ws.columns:
            max_len = 0
            col_letter = get_column_letter(col_cells[0].column)
            for cell in col_cells:
                try:
                    cell_len = len(str(cell.value)) if cell.value is not None else 0
                    max_len = max(max_len, cell_len)
                except:
                    pass
            ws.column_dimensions[col_letter].width = min(max_len + 3, 40)

    buf = BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _xlsx_paginated(wb, layout_config, tag_data, from_dt, to_dt, report_name,
                    header_font, header_fill, alt_fill, summary_fill, summary_font,
                    title_font, subtitle_font, kpi_label_font, kpi_value_font,
                    thin_border, header_align, num_align, text_align):
    """Render paginated (table) report sections to Excel sheets."""
    from openpyxl.utils import get_column_letter
    from openpyxl.styles import Font

    ws = wb.active
    ws.title = report_name[:31]  # Excel sheet name limit
    row_idx = 1

    sections = layout_config.get('paginatedSections', []) or layout_config.get('sections', [])
    period = f"{from_dt.strftime('%Y-%m-%d %H:%M')} — {to_dt.strftime('%Y-%m-%d %H:%M')}" if from_dt and to_dt else ''

    for section in sections:
        stype = section.get('type', '')

        # ── Header section ──
        if stype == 'header':
            title = section.get('title', report_name)
            ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=6)
            ws.cell(row=row_idx, column=1, value=title).font = title_font
            row_idx += 1

            subtitle = section.get('subtitle', '')
            if subtitle:
                ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=6)
                ws.cell(row=row_idx, column=1, value=subtitle).font = subtitle_font
                row_idx += 1

            if period and section.get('showDateRange', True):
                ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=6)
                ws.cell(row=row_idx, column=1, value=period).font = subtitle_font
                row_idx += 1

            # Status value if configured
            status_src = section.get('statusSourceType')
            if status_src:
                status_cell = {
                    'sourceType': status_src,
                    'tagName': section.get('statusTagName', ''),
                    'formula': section.get('statusFormula', ''),
                    'groupTags': section.get('statusGroupTags', []),
                    'aggregation': section.get('statusAggregation', 'avg'),
                    'value': section.get('statusValue', ''),
                    'decimals': 1, 'unit': '',
                }
                val, _, _ = _resolve_cell_raw(status_cell, tag_data)
                label = section.get('statusLabel', 'Status')
                ws.cell(row=row_idx, column=1, value=label).font = kpi_label_font
                c = ws.cell(row=row_idx, column=2, value=val)
                if isinstance(val, (int, float)):
                    c.alignment = num_align
                row_idx += 1

            row_idx += 1  # Blank row after header

        # ── KPI row section ──
        elif stype == 'kpi-row':
            kpis = section.get('kpis', [])
            for col_i, kpi in enumerate(kpis):
                col = col_i * 2 + 1
                ws.cell(row=row_idx, column=col, value=kpi.get('label', '')).font = kpi_label_font
                val, unit, dec = _resolve_cell_raw(kpi, tag_data)
                c = ws.cell(row=row_idx, column=col + 1, value=val)
                if isinstance(val, (int, float)):
                    c.number_format = f'#,##0.{"0" * dec}'
                    c.alignment = num_align
                c.font = kpi_value_font
            row_idx += 2  # Blank row after KPIs

        # ── Table section ──
        elif stype == 'table':
            label = section.get('label', '')
            if label:
                ws.merge_cells(start_row=row_idx, start_column=1, end_row=row_idx, end_column=max(len(section.get('columns', [])), 1))
                ws.cell(row=row_idx, column=1, value=label).font = Font(name='Calibri', bold=True, size=11)
                row_idx += 1

            columns = section.get('columns', [])
            rows = section.get('rows', [])
            num_cols = len(columns)

            if num_cols == 0:
                continue

            # Column headers
            header_row = row_idx
            for ci, col in enumerate(columns):
                hdr_text = col.get('header', f'Col {ci+1}')
                # Append unit to header if commonly used
                c = ws.cell(row=row_idx, column=ci + 1, value=hdr_text)
                c.font = header_font
                c.fill = header_fill
                c.alignment = header_align
                c.border = thin_border
            row_idx += 1

            # Freeze header row
            ws.freeze_panes = ws.cell(row=row_idx, column=1)

            # Data rows
            data_start_row = row_idx
            visible_row_count = 0
            for row in rows:
                if _is_row_hidden(row, tag_data):
                    continue
                cells = row.get('cells', [])
                for ci in range(num_cols):
                    cell_def = cells[ci] if ci < len(cells) else None
                    val, unit, dec = _resolve_cell_raw(cell_def, tag_data)
                    c = ws.cell(row=row_idx, column=ci + 1, value=val)
                    if isinstance(val, (int, float)):
                        c.number_format = f'#,##0.{"0" * dec}'
                        c.alignment = num_align
                    else:
                        c.alignment = text_align
                    c.border = thin_border
                    # Alternating row color
                    if visible_row_count % 2 == 1:
                        c.fill = alt_fill
                visible_row_count += 1
                row_idx += 1
            data_end_row = row_idx - 1

            # Summary row with native Excel formulas
            if section.get('showSummaryRow') and visible_row_count > 0:
                for ci, col in enumerate(columns):
                    sm = col.get('summary', {})
                    sm_type = sm.get('type', 'none') if sm else 'none'
                    col_letter = get_column_letter(ci + 1)
                    c = ws.cell(row=row_idx, column=ci + 1)
                    c.font = summary_font
                    c.fill = summary_fill
                    c.border = thin_border

                    if sm_type == 'label':
                        c.value = sm.get('label', '')
                        c.alignment = text_align
                    elif sm_type == 'sum':
                        c.value = f'=SUM({col_letter}{data_start_row}:{col_letter}{data_end_row})'
                        c.alignment = num_align
                    elif sm_type == 'avg':
                        c.value = f'=AVERAGE({col_letter}{data_start_row}:{col_letter}{data_end_row})'
                        c.alignment = num_align
                    elif sm_type == 'min':
                        c.value = f'=MIN({col_letter}{data_start_row}:{col_letter}{data_end_row})'
                        c.alignment = num_align
                    elif sm_type == 'max':
                        c.value = f'=MAX({col_letter}{data_start_row}:{col_letter}{data_end_row})'
                        c.alignment = num_align
                    elif sm_type == 'count':
                        c.value = f'=COUNTA({col_letter}{data_start_row}:{col_letter}{data_end_row})'
                        c.alignment = num_align
                    elif sm_type == 'formula':
                        # Can't express as Excel formula — pre-compute
                        formula_str = sm.get('formula', '')
                        result = _evaluate_formula(formula_str, tag_data)
                        c.value = result
                        c.alignment = num_align
                    # else: leave empty

                row_idx += 1

            # Auto-filter on data columns
            if visible_row_count > 0:
                ws.auto_filter.ref = f"A{header_row}:{get_column_letter(num_cols)}{data_end_row}"

            row_idx += 1  # Blank row between tables

        # Skip signature, text, spacer sections
        elif stype in ('signature', 'text', 'spacer'):
            continue


def _xlsx_dashboard(wb, layout_config, tag_data, from_dt, to_dt, report_name,
                    header_font, header_fill, alt_fill, title_font, subtitle_font,
                    kpi_label_font, kpi_value_font, thin_border, num_align, text_align):
    """Render dashboard report widgets to an Excel sheet."""
    ws = wb.active
    ws.title = "Dashboard Summary"
    row_idx = 1

    period = f"{from_dt.strftime('%Y-%m-%d %H:%M')} — {to_dt.strftime('%Y-%m-%d %H:%M')}" if from_dt and to_dt else ''

    # Title
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=4)
    ws.cell(row=1, column=1, value=report_name).font = title_font
    row_idx = 2
    if period:
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=4)
        ws.cell(row=2, column=1, value=period).font = subtitle_font
        row_idx = 3
    row_idx += 1  # Blank row

    widgets = layout_config.get('widgets', [])

    for widget in widgets:
        wtype = widget.get('type', '')
        config = widget.get('config', {})
        label = config.get('title', '') or config.get('label', '') or widget.get('name', '')

        if wtype in ('kpi', 'gauge', 'stat'):
            tag_name = (config.get('dataSource') or {}).get('tagName', '')
            raw = tag_data.get(tag_name)
            ws.cell(row=row_idx, column=1, value=label).font = kpi_label_font
            c = ws.cell(row=row_idx, column=2)
            try:
                c.value = float(raw) if raw is not None else None
                c.number_format = '#,##0.00'
                c.alignment = num_align
            except (TypeError, ValueError):
                c.value = str(raw) if raw else '—'
            c.font = kpi_value_font
            unit = config.get('unit', '')
            if unit:
                ws.cell(row=row_idx, column=3, value=unit).font = kpi_label_font
            row_idx += 1

        elif wtype == 'silo':
            ws.cell(row=row_idx, column=1, value=label).font = Font(name='Calibri', bold=True, size=10)
            row_idx += 1
            for sub_label, sub_key in [('Level', 'tagName'), ('Capacity', 'capacityTag'), ('Tons', 'tonsTag')]:
                tag_name = (config.get('dataSource') or {}).get(sub_key, '') if sub_key == 'tagName' else config.get(sub_key, '')
                raw = tag_data.get(tag_name)
                ws.cell(row=row_idx, column=1, value=f'  {sub_label}').font = kpi_label_font
                c = ws.cell(row=row_idx, column=2)
                try:
                    c.value = float(raw) if raw is not None else None
                    c.number_format = '#,##0.0'
                    c.alignment = num_align
                except (TypeError, ValueError):
                    c.value = str(raw) if raw else '—'
                row_idx += 1
            row_idx += 1

        elif wtype in ('chart', 'barchart'):
            ws.cell(row=row_idx, column=1, value=label).font = Font(name='Calibri', bold=True, size=10)
            row_idx += 1
            for series in config.get('series', []):
                s_label = series.get('label', '')
                tag_name = (series.get('dataSource') or {}).get('tagName', '')
                raw = tag_data.get(tag_name)
                ws.cell(row=row_idx, column=1, value=f'  {s_label}').font = kpi_label_font
                c = ws.cell(row=row_idx, column=2)
                try:
                    c.value = float(raw) if raw is not None else None
                    c.number_format = '#,##0.00'
                    c.alignment = num_align
                except (TypeError, ValueError):
                    c.value = str(raw) if raw else '—'
                row_idx += 1
            row_idx += 1

        elif wtype == 'table':
            ws.cell(row=row_idx, column=1, value=label).font = Font(name='Calibri', bold=True, size=10)
            row_idx += 1
            table_cols = config.get('columns', [])
            # Headers
            for ci, col in enumerate(table_cols):
                c = ws.cell(row=row_idx, column=ci + 1, value=col.get('label', ''))
                c.font = header_font
                c.fill = header_fill
                c.border = thin_border
            row_idx += 1
            # Single row of values
            for ci, col in enumerate(table_cols):
                src = col.get('sourceType', 'tag')
                cell_def = {'sourceType': src, 'tagName': col.get('tagName', ''),
                            'formula': col.get('formula', ''), 'groupTags': col.get('groupTags', []),
                            'aggregation': col.get('aggregation', 'avg'), 'decimals': 2, 'unit': ''}
                val, unit, dec = _resolve_cell_raw(cell_def, tag_data)
                c = ws.cell(row=row_idx, column=ci + 1, value=val)
                if isinstance(val, (int, float)):
                    c.number_format = f'#,##0.{"0" * dec}'
                    c.alignment = num_align
                c.border = thin_border
            row_idx += 2

        # Skip text, header, image, spacer, divider widgets
        elif wtype in ('text', 'header', 'image', 'spacer', 'divider'):
            continue


# ── Email delivery ───────────────────────────────────────────────────────────

def _build_email_html(report_name, from_dt, to_dt, filename):
    """Build a professionally formatted HTML email body with logos and report info."""
    hercules_uri, asm_uri, client_logo_uri = _get_logo_data_uris()
    period = f"{from_dt.strftime('%d/%m/%Y, %H:%M')} — {to_dt.strftime('%d/%m/%Y, %H:%M')}"
    generated = datetime.now().strftime('%d/%m/%Y, %H:%M')

    # Logo images for the header (explicit width+height for Outlook compatibility)
    hercules_img = f'<img src="{hercules_uri}" alt="Hercules" width="auto" height="36" style="height:36px;width:auto;display:block" />' if hercules_uri else ''
    asm_img = f'<img src="{asm_uri}" alt="ASM" width="auto" height="32" style="height:32px;width:auto;display:inline-block;vertical-align:middle" />' if asm_uri else ''
    client_img = f'<img src="{client_logo_uri}" alt="" width="auto" height="32" style="height:32px;width:auto;max-width:100px;display:inline-block;vertical-align:middle" />' if client_logo_uri else ''
    right_logos = ''
    if client_img or asm_img:
        spacer = '&nbsp;&nbsp;' if client_img and asm_img else ''
        right_logos = f'{client_img}{spacer}{asm_img}'

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,system-ui,-apple-system,sans-serif;color:#1a1a2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">

  <!-- Logo header bar -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f1b2d 0%,#1a3a5c 100%);padding:16px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:left">{hercules_img}</td>
          <td style="text-align:right">{right_logos}</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Report title & period -->
  <tr>
    <td style="padding:28px 32px 0 32px;text-align:center">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#94a3b8;margin-bottom:6px">Scheduled Report</div>
      <div style="font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;margin-bottom:4px">{_esc(report_name)}</div>
      <div style="height:2px;width:60px;background:linear-gradient(90deg,#0f3460,#1a5276);margin:8px auto 12px auto;border-radius:1px"></div>
    </td>
  </tr>

  <!-- Details card -->
  <tr>
    <td style="padding:0 32px 24px 32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;margin-bottom:2px">Report Period</div>
            <div style="font-size:14px;font-weight:600;color:#334155">{_esc(period)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid #e2e8f0">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;margin-bottom:2px">Generated</div>
            <div style="font-size:14px;font-weight:600;color:#334155">{_esc(generated)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px">
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;margin-bottom:2px">Attachment</div>
            <div style="font-size:14px;font-weight:600;color:#334155">{_esc(filename)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Message -->
  <tr>
    <td style="padding:0 32px 28px 32px">
      <p style="font-size:13px;color:#475569;line-height:1.6;margin:0">
        Please find the scheduled report <strong>{_esc(report_name)}</strong> attached to this email.
        The report covers the period shown above. If you have questions about this report, please
        contact your system administrator.
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 32px;text-align:center">
      <div style="font-size:11px;color:#94a3b8;line-height:1.5">
        This is an automated email from the <strong style="color:#64748b">Hercules Reporting Module</strong>.
      </div>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body></html>"""


def _send_email(recipients, subject, body_html, attachments=None):
    """Send HTML email with optional attachments using configured method (Resend or SMTP).

    Args:
        attachments: list of (filename, bytes) tuples, or None
    """
    from smtp_config import get_smtp_config, send_email_resend
    cfg = get_smtp_config()

    # ── Resend (default) ──
    if cfg.get('send_method', 'resend') == 'resend':
        return send_email_resend(recipients, subject, body_html, attachments=attachments)

    # ── SMTP fallback ──
    if not cfg.get('smtp_server'):
        return {'success': False, 'error': 'No SMTP server configured'}

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = cfg.get('from_address') or cfg.get('username', '')
    msg['To'] = ', '.join(recipients)

    # Plain-text fallback
    plain_text = "Please find the attached report(s).\n"
    msg.set_content(plain_text)
    msg.add_alternative(body_html, subtype='html')

    if attachments:
        import mimetypes
        for filename, content_bytes in attachments:
            mime_type, _ = mimetypes.guess_type(filename)
            if mime_type:
                maintype, subtype = mime_type.split('/', 1)
            else:
                maintype, subtype = 'application', 'octet-stream'
            msg.add_attachment(
                content_bytes,
                maintype=maintype,
                subtype=subtype,
                filename=filename,
            )

    port = cfg.get('smtp_port', 465)
    try:
        if port == 465:
            with smtplib.SMTP_SSL(cfg['smtp_server'], port, timeout=30) as server:
                server.login(cfg['username'], cfg['password'])
                server.send_message(msg)
        else:
            with smtplib.SMTP(cfg['smtp_server'], port, timeout=30) as server:
                server.starttls()
                server.login(cfg['username'], cfg['password'])
                server.send_message(msg)
        return {'success': True}
    except Exception as e:
        return {'success': False, 'error': str(e)}


# ── Disk delivery ────────────────────────────────────────────────────────────

def _save_to_disk(save_path, filename, content_bytes):
    """Save report file to disk at the user-specified path."""
    if not save_path or not save_path.strip():
        save_path = DEFAULT_SAVE_DIR
    resolved = os.path.realpath(os.path.join(save_path, filename))
    os.makedirs(os.path.dirname(resolved), exist_ok=True)
    with open(resolved, 'wb') as f:
        f.write(content_bytes)
    return resolved


# ── Main execution ───────────────────────────────────────────────────────────

def execute_distribution_rule(rule_id):
    """
    Execute a single distribution rule: load report, fetch data, generate
    PDF/HTML, deliver via email/disk, and update run status in DB.
    """
    get_conn = _get_db_connection()

    # 1. Load rule from DB
    with closing(get_conn()) as conn:
        actual_conn = conn._conn if hasattr(conn, '_conn') else conn
        cur = actual_conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT * FROM distribution_rules WHERE id = %s", (rule_id,))
        rule = cur.fetchone()

    if not rule:
        return {'success': False, 'error': f'Rule {rule_id} not found'}

    rule = dict(rule)

    # Support multi-report: report_ids array, fallback to [report_id]
    report_ids = rule.get('report_ids')
    if isinstance(report_ids, str):
        report_ids = json.loads(report_ids)
    if not report_ids or report_ids == []:
        rid = rule.get('report_id')
        report_ids = [rid] if rid and rid > 0 else []

    if not report_ids:
        return {'success': False, 'error': 'No reports configured for this rule'}

    try:
        # 2. Determine time range (shared across all reports)
        from_dt, to_dt = _time_range_for_schedule(rule['schedule_type'])
        fmt = rule.get('format', 'pdf')
        ext = {'pdf': 'pdf', 'html': 'html', 'xlsx': 'xlsx'}.get(fmt, 'pdf')
        timestamp_str = datetime.now().strftime('%Y%m%d_%H%M')

        # 3. Generate each report
        attachments = []  # list of (filename, content_bytes)
        report_names = []
        skipped = []

        for rid in report_ids:
            with closing(get_conn()) as conn:
                actual_conn = conn._conn if hasattr(conn, '_conn') else conn
                cur = actual_conn.cursor(cursor_factory=RealDictCursor)
                cur.execute(
                    "SELECT id, name, layout_config FROM report_builder_templates WHERE id = %s",
                    (rid,)
                )
                template = cur.fetchone()

            if not template:
                skipped.append(f"Report {rid} not found (deleted?)")
                logger.warning(f"Distribution rule {rule_id}: report {rid} not found, skipping")
                continue

            template = dict(template)
            report_name = template['name']
            report_names.append(report_name)
            layout_config = template['layout_config']
            if isinstance(layout_config, str):
                layout_config = json.loads(layout_config)

            tag_names = extract_all_tags(layout_config)
            tag_data = _fetch_tag_data_multi_agg(layout_config, tag_names, from_dt, to_dt)
            if fmt == 'xlsx':
                content_bytes = _generate_xlsx(report_name, layout_config, tag_data, from_dt, to_dt)
            else:
                html_content = _generate_report_html(report_name, layout_config, tag_data, from_dt, to_dt)
                if fmt == 'pdf':
                    content_bytes = _html_to_pdf(html_content)
                else:
                    content_bytes = html_content.encode('utf-8')

            safe_name = re.sub(r'[^\w\-]', '_', report_name)
            filename = f"{safe_name}_{timestamp_str}.{ext}"
            attachments.append((filename, content_bytes))

        if not attachments:
            raise ValueError(f"All reports missing: {'; '.join(skipped)}")

        # 4. Deliver
        delivery = rule['delivery_method']
        recipients = rule.get('recipients', [])
        if isinstance(recipients, str):
            recipients = json.loads(recipients)

        errors = list(skipped)  # include skipped reports as warnings

        if delivery in ('email', 'both') and recipients:
            names_str = ', '.join(report_names)
            subject = f"Hercules Report: {names_str} — {datetime.now().strftime('%Y-%m-%d')}"
            email_html = _build_email_html(names_str, from_dt, to_dt,
                                           ', '.join(fn for fn, _ in attachments))
            email_result = _send_email(recipients, subject, email_html, attachments=attachments)
            if not email_result['success']:
                errors.append(f"Email: {email_result['error']}")

        if delivery in ('disk', 'both') and rule.get('save_path'):
            for filename, content_bytes in attachments:
                try:
                    saved_path = _save_to_disk(rule['save_path'], filename, content_bytes)
                    logger.info(f"Report saved to {saved_path}")
                except Exception as e:
                    errors.append(f"Disk ({filename}): {str(e)}")

        # 5. Update run status
        real_errors = [e for e in errors if not e.startswith('Report ') or 'not found' not in e]
        success = len(real_errors) == 0
        status = 'success' if success else 'failed'
        error_msg = '; '.join(errors) if errors else None

        file_names_list = [fn for fn, _ in attachments] if attachments else []

        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual_conn.cursor()
            # Log execution to audit trail
            try:
                cur.execute("""
                    INSERT INTO report_execution_log
                        (rule_id, report_ids, executed_at, time_range_from, time_range_to,
                         format, delivery_method, recipients, status, error_message, file_names)
                    VALUES (%s, %s::jsonb, NOW(), %s, %s, %s, %s, %s::jsonb, %s, %s, %s::jsonb)
                """, (
                    rule_id, json.dumps(rule.get('report_ids', [])),
                    from_dt, to_dt, fmt, delivery,
                    json.dumps(rule.get('recipients', [])),
                    status, error_msg, json.dumps(file_names_list),
                ))
            except Exception as log_err:
                logger.warning(f"Failed to log execution: {log_err}")
            cur.execute("""
                UPDATE distribution_rules
                SET last_run_at = NOW(), last_run_status = %s, last_run_error = %s
                WHERE id = %s
            """, (status, error_msg, rule_id))
            actual_conn.commit()

        if success:
            return {'success': True, 'message': f'{len(attachments)} report(s) delivered via {delivery}'}
        else:
            return {'success': False, 'error': '; '.join(errors)}

    except Exception as e:
        logger.error(f"Distribution rule {rule_id} failed: {e}", exc_info=True)
        # Update status to failed + log failure
        try:
            with closing(get_conn()) as conn:
                actual_conn = conn._conn if hasattr(conn, '_conn') else conn
                cur = actual_conn.cursor()
                try:
                    cur.execute("""
                        INSERT INTO report_execution_log
                            (rule_id, executed_at, status, error_message)
                        VALUES (%s, NOW(), 'failed', %s)
                    """, (rule_id, str(e)))
                except Exception:
                    pass
                cur.execute("""
                    UPDATE distribution_rules
                    SET last_run_at = NOW(), last_run_status = 'failed', last_run_error = %s
                    WHERE id = %s
                """, (str(e), rule_id))
                actual_conn.commit()
        except Exception:
            pass
        return {'success': False, 'error': str(e)}
