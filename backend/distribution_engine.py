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
from datetime import datetime, timedelta
from email.message import EmailMessage
from html import escape as html_escape
from contextlib import closing

from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)

# Allowed base directory for disk saves (configurable via env)
ALLOWED_SAVE_ROOT = os.getenv(
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

def _evaluate_formula(formula, tag_data):
    """Evaluate a formula string like '{Tag1} + {Tag2} * 100'. Returns float or None."""
    if not formula or not formula.strip():
        return None
    try:
        expr = re.sub(r'\{([^}]+)\}', lambda m: str(float(tag_data.get(m.group(1), 0))), formula)

        for fn_name, py_fn in [('SUM', 'sum'), ('AVG', '_avg'), ('MIN', 'min'), ('MAX', 'max')]:
            expr = re.sub(
                rf'\b{fn_name}\s*\(([^)]*)\)', 
                lambda m, f=py_fn: str(eval(f'{f}([{m.group(1)}])')) if f != '_avg'
                    else str(sum(float(x) for x in m.group(1).split(',')) / max(len(m.group(1).split(',')), 1)),
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
        result = eval(sanitized)
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
        raw = tag_data.get(cell.get('tagName', ''))
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


# ── HTML report generation ───────────────────────────────────────────────────

def _generate_dashboard_html(report_name, widgets, tag_data, from_dt, to_dt):
    """Generate HTML report from dashboard widgets."""
    period = f"{from_dt.strftime('%Y-%m-%d %H:%M')} — {to_dt.strftime('%Y-%m-%d %H:%M')}"

    rows_html = ""
    for widget in widgets:
        w_type = widget.get('type', '')
        config = widget.get('config', {})
        label = config.get('label') or config.get('title') or widget.get('i', w_type)

        if w_type in ('kpi', 'gauge', 'stat'):
            ds = config.get('dataSource', {})
            tag = ds.get('tagName', '')
            val = tag_data.get(tag, 'N/A')
            if isinstance(val, float):
                val = f"{val:.2f}"
            unit = config.get('unit', '')
            rows_html += f"<tr><td>{_esc(label)}</td><td>{_esc(val)} {_esc(unit)}</td></tr>\n"

        elif w_type == 'silo':
            ds = config.get('dataSource', {})
            tag = ds.get('tagName', '')
            val = tag_data.get(tag, 'N/A')
            cap_tag = config.get('capacityTag', '')
            cap_val = tag_data.get(cap_tag, 'N/A')
            tons_tag = config.get('tonsTag', '')
            tons_val = tag_data.get(tons_tag, 'N/A')
            rows_html += f"<tr><td>{_esc(label)}</td><td>Level: {_esc(val)}%, Capacity: {_esc(cap_val)}, Tons: {_esc(tons_val)}</td></tr>\n"

        elif w_type == 'chart':
            for s in config.get('series', []):
                s_ds = s.get('dataSource', {})
                s_tag = s_ds.get('tagName', '')
                s_val = tag_data.get(s_tag, 'N/A')
                if isinstance(s_val, float):
                    s_val = f"{s_val:.2f}"
                s_label = s.get('label', s_tag)
                rows_html += f"<tr><td>{_esc(label)} — {_esc(s_label)}</td><td>{_esc(s_val)}</td></tr>\n"

        elif w_type == 'table':
            for col in config.get('tableColumns', []):
                col_label = col.get('label', '')
                col_type = col.get('sourceType', 'tag')
                if col_type == 'tag':
                    c_tag = col.get('tagName', '')
                    c_val = tag_data.get(c_tag, 'N/A')
                    if isinstance(c_val, float):
                        c_val = f"{c_val:.2f}"
                    rows_html += f"<tr><td>{_esc(col_label)}</td><td>{_esc(c_val)}</td></tr>\n"
                elif col_type == 'group':
                    vals = [str(tag_data.get(t, 'N/A')) for t in col.get('groupTags', [])]
                    rows_html += f"<tr><td>{_esc(col_label)}</td><td>{_esc(', '.join(vals))}</td></tr>\n"

        elif w_type in ('text', 'header', 'image', 'spacer', 'divider'):
            pass

        else:
            ds = config.get('dataSource', {})
            tag = ds.get('tagName', '')
            if tag:
                val = tag_data.get(tag, 'N/A')
                rows_html += f"<tr><td>{_esc(label)}</td><td>{_esc(val)}</td></tr>\n"

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body {{ font-family: Arial, sans-serif; font-size: 13px; padding: 20px; color: #222; }}
h1 {{ font-size: 20px; margin-bottom: 4px; }}
p.period {{ font-size: 12px; color: #666; margin-top: 0; }}
table {{ border-collapse: collapse; width: 100%; margin-top: 16px; }}
th, td {{ border: 1px solid #ccc; padding: 8px 12px; text-align: left; }}
th {{ background: #f0f4f8; font-weight: 600; }}
tr:nth-child(even) {{ background: #fafbfc; }}
</style></head><body>
<h1>{_esc(report_name)}</h1>
<p class="period">{_esc(period)}</p>
<table>
<tr><th>Metric</th><th>Value</th></tr>
{rows_html}
</table>
<p style="margin-top:24px;font-size:11px;color:#999;">
Generated by Hercules Reporting Module on {datetime.now().strftime('%Y-%m-%d %H:%M')}
</p>
</body></html>"""


def _generate_paginated_html(report_name, sections, tag_data, from_dt, to_dt):
    """Generate HTML report from paginated (Table Report) sections."""
    period = f"{from_dt.strftime('%Y-%m-%d %H:%M')} — {to_dt.strftime('%Y-%m-%d %H:%M')}"
    body_parts = []

    for s in (sections or []):
        s_type = s.get('type', '')

        if s_type == 'header':
            title = s.get('title', report_name) or report_name
            subtitle = s.get('subtitle', '')
            body_parts.append(f'<h1>{_esc(title)}</h1>')
            if subtitle:
                body_parts.append(f'<p class="subtitle">{_esc(subtitle)}</p>')
            if s.get('showDateRange', True):
                body_parts.append(f'<p class="period">{_esc(period)}</p>')

        elif s_type == 'kpi-row':
            label = s.get('label', '')
            kpis = s.get('kpis', [])
            if label:
                body_parts.append(f'<h3 class="section-label">{_esc(label)}</h3>')
            kpi_cells = []
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
                kpi_cells.append(f'<td class="kpi-cell"><div class="kpi-val">{_esc(val)}</div><div class="kpi-label">{_esc(kpi_label)}</div></td>')
            if kpi_cells:
                body_parts.append(f'<table class="kpi-table"><tr>{"".join(kpi_cells)}</tr></table>')

        elif s_type == 'table':
            label = s.get('label', '')
            columns = s.get('columns', [])
            rows = s.get('rows', [])
            if label:
                body_parts.append(f'<h3 class="section-label">{_esc(label)}</h3>')
            header_cells = ''.join(f'<th style="text-align:{_esc(c.get("align", "left"))}">{_esc(c.get("header", ""))}</th>' for c in columns)
            body_parts.append(f'<table class="data-table"><thead><tr>{header_cells}</tr></thead><tbody>')
            for row in rows:
                cells = row.get('cells', [])
                td_parts = []
                for i, cell in enumerate(cells):
                    align = columns[i].get('align', 'left') if i < len(columns) else 'left'
                    val = _resolve_cell(cell, tag_data)
                    td_parts.append(f'<td style="text-align:{_esc(align)}">{_esc(val)}</td>')
                body_parts.append(f'<tr>{"".join(td_parts)}</tr>')
            body_parts.append('</tbody></table>')

        elif s_type == 'text-block':
            content = s.get('content', '')
            fs = s.get('fontSize', '14px')
            fw = s.get('fontWeight', '400')
            align = s.get('align', 'left')
            body_parts.append(f'<p style="font-size:{_esc(fs)};font-weight:{_esc(fw)};text-align:{_esc(align)}">{_esc(content)}</p>')

        elif s_type == 'spacer':
            h = s.get('height', 24)
            body_parts.append(f'<div style="height:{h}px"></div>')

    content_html = '\n'.join(body_parts)

    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
body {{ font-family: Arial, sans-serif; font-size: 13px; padding: 24px 28px; color: #222; }}
h1 {{ font-size: 20px; margin-bottom: 2px; color: #1a1a1a; }}
h3.section-label {{ font-size: 13px; font-weight: 600; color: #444; margin: 18px 0 6px 0; text-transform: uppercase; letter-spacing: 0.5px; }}
p.subtitle {{ font-size: 13px; color: #555; margin: 0 0 2px 0; }}
p.period {{ font-size: 12px; color: #888; margin: 0 0 16px 0; }}
table.kpi-table {{ width: 100%; margin: 8px 0 16px 0; border-collapse: collapse; }}
table.kpi-table td.kpi-cell {{ text-align: center; padding: 10px 12px; border: 1px solid #ddd; background: #f8fafc; }}
.kpi-val {{ font-size: 18px; font-weight: 700; color: #0369a1; }}
.kpi-label {{ font-size: 10px; color: #888; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.3px; }}
table.data-table {{ width: 100%; border-collapse: collapse; margin: 6px 0 16px 0; }}
table.data-table th {{ background: #f0f4f8; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.3px; padding: 8px 10px; border: 1px solid #ccc; color: #444; }}
table.data-table td {{ padding: 7px 10px; border: 1px solid #ddd; font-size: 12px; }}
table.data-table tbody tr:nth-child(even) {{ background: #fafbfc; }}
</style></head><body>
{content_html}
<p style="margin-top:28px;font-size:10px;color:#aaa;border-top:1px solid #eee;padding-top:8px;">
Generated by Hercules Reporting Module on {datetime.now().strftime('%Y-%m-%d %H:%M')}
</p>
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


# ── Email delivery ───────────────────────────────────────────────────────────

def _send_email(recipients, subject, body_text, attachment_bytes=None, attachment_name=None):
    """Send email with optional PDF attachment using SMTP config."""
    from smtp_config import get_smtp_config
    cfg = get_smtp_config()

    if not cfg.get('smtp_server'):
        return {'success': False, 'error': 'No SMTP server configured'}

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = cfg.get('from_address') or cfg.get('username', '')
    msg['To'] = ', '.join(recipients)
    msg.set_content(body_text)

    if attachment_bytes and attachment_name:
        msg.add_attachment(
            attachment_bytes,
            maintype='application',
            subtype='pdf',
            filename=attachment_name,
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
    """Save report file to disk, validated against ALLOWED_SAVE_ROOT."""
    resolved = os.path.realpath(os.path.join(save_path, filename))
    root = os.path.realpath(ALLOWED_SAVE_ROOT)
    if not resolved.startswith(root + os.sep) and resolved != root:
        raise ValueError(f"save_path must be under {ALLOWED_SAVE_ROOT}")
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
    report_id = rule['report_id']

    try:
        # 2. Load report template
        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual_conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(
                "SELECT id, name, layout_config FROM report_builder_templates WHERE id = %s",
                (report_id,)
            )
            template = cur.fetchone()

        if not template:
            raise ValueError(f"Report template {report_id} not found (may have been deleted)")

        template = dict(template)
        report_name = template['name']
        layout_config = template['layout_config']
        if isinstance(layout_config, str):
            layout_config = json.loads(layout_config)

        # 3. Extract tag names from widgets
        tag_names = extract_all_tags(layout_config)

        # 4. Determine time range
        from_dt, to_dt = _time_range_for_schedule(rule['schedule_type'])

        # 5. Fetch tag data
        tag_data = _fetch_tag_data(tag_names, from_dt, to_dt)

        # 6. Generate HTML
        html_content = _generate_report_html(report_name, layout_config, tag_data, from_dt, to_dt)

        # 7. Generate PDF if needed
        fmt = rule.get('format', 'pdf')
        if fmt == 'pdf':
            content_bytes = _html_to_pdf(html_content)
            ext = 'pdf'
        else:
            content_bytes = html_content.encode('utf-8')
            ext = 'html'

        timestamp_str = datetime.now().strftime('%Y%m%d_%H%M')
        safe_name = re.sub(r'[^\w\-]', '_', report_name)
        filename = f"{safe_name}_{timestamp_str}.{ext}"

        # 8. Deliver
        delivery = rule['delivery_method']
        recipients = rule.get('recipients', [])
        if isinstance(recipients, str):
            recipients = json.loads(recipients)

        errors = []

        if delivery in ('email', 'both') and recipients:
            subject = f"Report: {report_name} — {datetime.now().strftime('%Y-%m-%d')}"
            body = f"Attached is the scheduled report '{report_name}'.\nPeriod: {from_dt.strftime('%Y-%m-%d %H:%M')} to {to_dt.strftime('%Y-%m-%d %H:%M')}"
            email_result = _send_email(recipients, subject, body, content_bytes, filename)
            if not email_result['success']:
                errors.append(f"Email: {email_result['error']}")

        if delivery in ('disk', 'both') and rule.get('save_path'):
            try:
                saved_path = _save_to_disk(rule['save_path'], filename, content_bytes)
                logger.info(f"Report saved to {saved_path}")
            except Exception as e:
                errors.append(f"Disk: {str(e)}")

        # 9. Update run status
        success = len(errors) == 0
        status = 'success' if success else 'failed'
        error_msg = '; '.join(errors) if errors else None

        with closing(get_conn()) as conn:
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual_conn.cursor()
            cur.execute("""
                UPDATE distribution_rules
                SET last_run_at = NOW(), last_run_status = %s, last_run_error = %s
                WHERE id = %s
            """, (status, error_msg, rule_id))
            actual_conn.commit()

        if success:
            return {'success': True, 'message': f'Report "{report_name}" delivered via {delivery}'}
        else:
            return {'success': False, 'error': '; '.join(errors)}

    except Exception as e:
        logger.error(f"Distribution rule {rule_id} failed: {e}", exc_info=True)
        # Update status to failed
        try:
            with closing(get_conn()) as conn:
                actual_conn = conn._conn if hasattr(conn, '_conn') else conn
                cur = actual_conn.cursor()
                cur.execute("""
                    UPDATE distribution_rules
                    SET last_run_at = NOW(), last_run_status = 'failed', last_run_error = %s
                    WHERE id = %s
                """, (str(e), rule_id))
                actual_conn.commit()
        except Exception:
            pass
        return {'success': False, 'error': str(e)}
