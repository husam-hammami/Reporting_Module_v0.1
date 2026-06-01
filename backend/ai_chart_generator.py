"""AI-powered chart generation for Hercules distribution emails.

Generates matplotlib charts based on tag classification (counter, rate,
boolean, etc.) and returns PNG images as bytes for email embedding.

IMPORTANT: All chart generation must run inside eventlet.tpool.execute()
to avoid deadlocks with eventlet's monkey-patched threading.
"""

import io
import logging

logger = logging.getLogger(__name__)

# Force non-interactive backend BEFORE any other matplotlib import
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.patches import FancyBboxPatch

# Hercules color palette (matches email styling)
COLORS = {
    'blue':    '#0369a1',
    'cyan':    '#0891b2',
    'purple':  '#7c3aed',
    'teal':    '#0d9488',
    'orange':  '#d97706',
    'red':     '#dc2626',
    'green':   '#059669',
    'slate':   '#475569',
    'bg':      '#f8fafc',
    'border':  '#e2e8f0',
    'text':    '#0f172a',
    'muted':   '#94a3b8',
}

BAR_COLORS = ['#0369a1', '#0891b2', '#7c3aed', '#0d9488', '#d97706',
              '#059669', '#dc2626', '#6366f1', '#ea580c', '#0284c7']


def generate_charts(tag_data, prev_tag_data, profiles, report_names,
                    from_dt, to_dt):
    """Generate relevant charts based on tag data and classification.

    Args:
        tag_data: dict {tag_key: value} for current period
        prev_tag_data: dict {tag_key: value} for previous period
        profiles: dict {tag_name: {label, tag_type, line_name, ...}}
        report_names: list of report name strings
        from_dt, to_dt: datetime objects for the period

    Returns:
        list of dicts: [{'title': str, 'image_bytes': bytes, 'cid': str}]
        Maximum 3 charts.
    """
    charts = []

    # Classify tags by type
    counters = {}   # tag_name -> {label, value, prev_value, line, unit}
    booleans = {}   # tag_name -> {label, value, line}
    rates = {}      # tag_name -> {label, value, prev_value, line, unit}

    for key, val in tag_data.items():
        tag_name = key.split('::')[-1] if '::' in key else key
        agg = key.split('::')[0] if '::' in key else 'last'
        profile = profiles.get(tag_name, {})
        tag_type = profile.get('tag_type', 'unknown')
        label = profile.get('label') or _humanize_tag_name(tag_name)
        line = profile.get('line_name', '')

        prev_val = prev_tag_data.get(key, None)

        if tag_type == 'counter' and agg == 'delta':
            counters[tag_name] = {
                'label': label, 'value': _to_float(val),
                'prev_value': _to_float(prev_val), 'line': line,
            }
        elif tag_type == 'boolean':
            booleans[tag_name] = {
                'label': label, 'value': val, 'line': line,
            }
        elif tag_type == 'rate':
            rates[tag_name] = {
                'label': label, 'value': _to_float(val),
                'prev_value': _to_float(prev_val), 'line': line,
            }

    # Rule-based chart selection (max 3)
    if counters and len(charts) < 3:
        chart = _production_bar_chart(counters, from_dt, to_dt)
        if chart:
            charts.append(chart)

    if booleans and len(charts) < 3:
        chart = _equipment_status_chart(booleans)
        if chart:
            charts.append(chart)

    if rates and len(counters) > 0 and len(charts) < 3:
        chart = _rate_comparison_chart(rates, from_dt, to_dt)
        if chart:
            charts.append(chart)

    # Assign CID identifiers
    for i, chart in enumerate(charts):
        # cid reserved for future CID-based email embedding
        chart['cid'] = f'chart_{i}'

    return charts


def generate_charts_safe(tag_data, prev_tag_data, profiles, report_names,
                         from_dt, to_dt):
    """Wrapper that runs chart generation in a real OS thread via eventlet.tpool.

    matplotlib uses C extensions that deadlock with eventlet's monkey-patched
    threading. This wrapper ensures charts render in a native thread.
    Falls back gracefully — never blocks email delivery.
    """
    try:
        import eventlet
        return eventlet.tpool.execute(
            generate_charts, tag_data, prev_tag_data, profiles,
            report_names, from_dt, to_dt
        )
    except ImportError:
        # eventlet not available (e.g., testing) — run directly
        return generate_charts(tag_data, prev_tag_data, profiles,
                               report_names, from_dt, to_dt)
    except Exception as e:
        logger.warning("Chart generation failed (non-blocking): %s", e)
        return []


def _production_bar_chart(counters, from_dt, to_dt):
    """Grouped bar chart: current vs previous production per counter tag.

    Shows delta production values with previous period comparison.
    """
    if not counters:
        return None

    try:
        # Sort by value descending, take top 8
        sorted_tags = sorted(counters.items(),
                             key=lambda x: abs(x[1]['value'] or 0),
                             reverse=True)[:8]

        labels = [t[1]['label'] for t in sorted_tags]
        current = [t[1]['value'] or 0 for t in sorted_tags]
        previous = [t[1]['prev_value'] or 0 for t in sorted_tags]
        has_prev = any(v != 0 for v in previous)

        fig, ax = plt.subplots(figsize=(6, 3.5), dpi=150)
        fig.patch.set_facecolor(COLORS['bg'])
        ax.set_facecolor(COLORS['bg'])

        x = range(len(labels))
        width = 0.35 if has_prev else 0.5

        if has_prev:
            bars1 = ax.bar([i - width/2 for i in x], current, width,
                          color=COLORS['blue'], label='Current', zorder=3)
            bars2 = ax.bar([i + width/2 for i in x], previous, width,
                          color=COLORS['muted'], label='Previous', alpha=0.6, zorder=3)
            ax.legend(fontsize=8, frameon=False)
        else:
            bars1 = ax.bar(x, current, width, color=COLORS['blue'], zorder=3)

        # Formatting
        ax.set_xticks(list(x))
        ax.set_xticklabels(labels, fontsize=7, rotation=30, ha='right')
        ax.tick_params(axis='y', labelsize=7)
        from matplotlib.ticker import FuncFormatter
        ax.yaxis.set_major_formatter(FuncFormatter(lambda x, _: _fmt_number(x)))
        ax.set_title('Production Output', fontsize=10, fontweight='bold',
                     color=COLORS['text'], pad=10)
        ax.grid(axis='y', alpha=0.3, zorder=0)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color(COLORS['border'])
        ax.spines['bottom'].set_color(COLORS['border'])

        # Value labels on bars
        for bar in bars1:
            h = bar.get_height()
            if h > 0:
                ax.text(bar.get_x() + bar.get_width()/2, h,
                       _fmt_number(h), ha='center', va='bottom',
                       fontsize=6, color=COLORS['text'])

        plt.tight_layout()
        return {'title': 'Production Output', 'image_bytes': _fig_to_bytes(fig)}
    except Exception as e:
        logger.warning("Production chart failed: %s", e)
        return None
    finally:
        plt.close('all')


def _equipment_status_chart(booleans):
    """Horizontal status bar showing equipment ON/OFF state.

    Simple visual: green bars for ON, red for OFF.
    """
    if not booleans:
        return None

    try:
        sorted_tags = sorted(booleans.items(), key=lambda x: x[1]['label'])[:12]

        labels = [t[1]['label'] for t in sorted_tags]
        states = []
        for t in sorted_tags:
            v = t[1]['value']
            if isinstance(v, bool):
                states.append(v)
            elif isinstance(v, (int, float)):
                states.append(v > 0)
            else:
                states.append(str(v).lower() in ('true', '1', 'on', 'yes'))

        colors = [COLORS['green'] if s else COLORS['red'] for s in states]
        status_text = ['ON' if s else 'OFF' for s in states]

        fig, ax = plt.subplots(figsize=(5, max(2, len(labels) * 0.4)), dpi=150)
        fig.patch.set_facecolor(COLORS['bg'])
        ax.set_facecolor(COLORS['bg'])

        y = range(len(labels))
        ax.barh(list(y), [1] * len(labels), color=colors, height=0.6, zorder=3)

        for i, txt in enumerate(status_text):
            ax.text(0.5, i, txt, ha='center', va='center',
                   fontsize=8, fontweight='bold', color='white', zorder=4)

        ax.set_yticks(list(y))
        ax.set_yticklabels(labels, fontsize=7)
        ax.set_xlim(0, 1)
        ax.set_xticks([])
        ax.set_title('Equipment Status', fontsize=10, fontweight='bold',
                     color=COLORS['text'], pad=10)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['bottom'].set_visible(False)
        ax.spines['left'].set_color(COLORS['border'])
        ax.invert_yaxis()

        plt.tight_layout()
        return {'title': 'Equipment Status', 'image_bytes': _fig_to_bytes(fig)}
    except Exception as e:
        logger.warning("Equipment status chart failed: %s", e)
        return None
    finally:
        plt.close('all')


def _rate_comparison_chart(rates, from_dt, to_dt):
    """Bar chart comparing rate values (current vs previous).

    Shows flow rates, speed, throughput etc.
    """
    if not rates:
        return None

    try:
        sorted_tags = sorted(rates.items(),
                             key=lambda x: abs(x[1]['value'] or 0),
                             reverse=True)[:8]

        labels = [t[1]['label'] for t in sorted_tags]
        current = [t[1]['value'] or 0 for t in sorted_tags]
        previous = [t[1]['prev_value'] or 0 for t in sorted_tags]
        has_prev = any(v != 0 for v in previous)

        fig, ax = plt.subplots(figsize=(6, 3.5), dpi=150)
        fig.patch.set_facecolor(COLORS['bg'])
        ax.set_facecolor(COLORS['bg'])

        x = range(len(labels))
        width = 0.35 if has_prev else 0.5

        if has_prev:
            ax.bar([i - width/2 for i in x], current, width,
                  color=COLORS['cyan'], label='Current', zorder=3)
            ax.bar([i + width/2 for i in x], previous, width,
                  color=COLORS['muted'], label='Previous', alpha=0.6, zorder=3)
            ax.legend(fontsize=8, frameon=False)
        else:
            ax.bar(x, current, width, color=COLORS['cyan'], zorder=3)

        ax.set_xticks(list(x))
        ax.set_xticklabels(labels, fontsize=7, rotation=30, ha='right')
        ax.tick_params(axis='y', labelsize=7)
        from matplotlib.ticker import FuncFormatter
        ax.yaxis.set_major_formatter(FuncFormatter(lambda x, _: _fmt_number(x)))
        ax.set_title('Rate Comparison', fontsize=10, fontweight='bold',
                     color=COLORS['text'], pad=10)
        ax.grid(axis='y', alpha=0.3, zorder=0)
        ax.spines['top'].set_visible(False)
        ax.spines['right'].set_visible(False)
        ax.spines['left'].set_color(COLORS['border'])
        ax.spines['bottom'].set_color(COLORS['border'])

        plt.tight_layout()
        return {'title': 'Rate Comparison', 'image_bytes': _fig_to_bytes(fig)}
    except Exception as e:
        logger.warning("Rate comparison chart failed: %s", e)
        return None
    finally:
        plt.close('all')


def _fig_to_bytes(fig):
    """Render matplotlib figure to PNG bytes."""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight',
                facecolor=fig.get_facecolor(), edgecolor='none')
    buf.seek(0)
    return buf.read()


def _to_float(val):
    """Safely convert value to float, returning 0.0 on failure."""
    if val is None:
        return 0.0
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def _fmt_number(n):
    """Format number with thousand separators, no unnecessary decimals."""
    if n >= 1_000_000:
        return f'{n/1_000_000:,.1f}M'
    elif n >= 10_000:
        return f'{n/1_000:,.0f}K'
    elif n >= 100:
        return f'{n:,.0f}'
    else:
        return f'{n:,.1f}'


def _humanize_tag_name(tag_name):
    """Convert raw PLC tag name to readable label.

    MilB_C32_Total_Kwh → C32 Total Kwh
    B1_Deopt_Emptying → B1 Deopt Emptying
    """
    import re
    # Strip common prefixes (MilB_, Mil_B_, Mill_B_, etc.)
    name = re.sub(r'^(?:Mil(?:l)?[_ ]?[A-Z]?[_ ]?)', '', tag_name)
    # Replace underscores with spaces
    name = name.replace('_', ' ').strip()
    # Title case, but keep uppercase abbreviations (C32, B1, PF, etc.)
    parts = name.split()
    result = []
    for p in parts:
        if p.isupper() or re.match(r'^[A-Z]\d', p):
            result.append(p)  # keep as-is: C32, PF, KVA
        else:
            result.append(p.capitalize())

    return ' '.join(result) or tag_name
