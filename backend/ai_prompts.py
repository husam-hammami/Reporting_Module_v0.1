"""
Shared AI Prompts
=================
Canonical prompt builders for Hercules AI summaries.
Used by both the Insights Hub (hercules_ai_bp) and Distribution Engine.
"""

import json as _json
import logging as _logging
import re as _re

_logger = _logging.getLogger(__name__)

# Version bumps on every breaking change to the JSON contract
INSIGHTS_PROMPT_VERSION = 3


def resolve_comparison_label(period_duration):
    """Determine comparison period label based on duration.

    Args:
        period_duration: timedelta object
    Returns:
        One of: 'previous day', 'previous week', 'previous month', 'previous period'
    """
    hours = period_duration.total_seconds() / 3600
    if hours <= 25:
        return 'previous day'
    elif hours <= 170:
        return 'previous week'
    elif hours <= 745:
        return 'previous month'
    return 'previous period'


def build_insights_prompt(report_names, time_from, time_to, cmp_label,
                          prev_from_str, prev_to_str, structured_data,
                          report_context='', trend_summary=''):
    """Build the multi-report insights prompt WITH comparison period.

    This is the CANONICAL prompt used by the insights hub AND distribution engine.

    Args:
        report_names: list of report name strings
        time_from: formatted start time string (YYYY-MM-DD HH:MM)
        time_to: formatted end time string
        cmp_label: comparison label e.g. 'previous day', 'previous week'
        prev_from_str: formatted previous period start
        prev_to_str: formatted previous period end
        structured_data: newline-joined tag data rows
            (Label | Type | Now | Previous | Aggregation | Line)
        report_context: optional report structure context string
        trend_summary: optional multi-period trend lines for counter tags
    """
    names_str = ', '.join(report_names) if isinstance(report_names, list) else str(report_names)

    # Day of week for context (Oman weekend = Fri-Sat)
    day_line = ''
    try:
        from datetime import datetime as _dt
        _tf = time_from
        if 'T' in _tf:
            dt = _dt.fromisoformat(_tf.replace('Z', '+00:00'))
        else:
            dt = _dt.strptime(_tf, '%Y-%m-%d %H:%M')
        day_line = f"\nDAY: {dt.strftime('%A')}"
    except Exception:
        pass

    prompt = f"""You are a senior plant engineer writing a shift handover briefing. Be direct, technical, action-oriented. Use industrial language: "line stopped", "tripped", "running light", "at capacity", "below nameplate". Never say "I", "we", "the data shows", or "it appears". State facts as facts.

REPORTS: {names_str}
PERIOD: {time_from} to {time_to}{day_line}
COMPARED AGAINST: {cmp_label} ({prev_from_str} to {prev_to_str})
"""
    if report_context:
        prompt += f"""
STRUCTURE:
{report_context}
"""
    prompt += f"""
DATA (Label | Type | Unit | Now | {cmp_label.title()} | Change% | Aggregation | Line):
{structured_data}

KEYS: delta=produced amount, first=start reading, last=end/current reading.
Change% = pre-computed percentage change (use directly, do NOT calculate yourself).

INDUSTRIAL CONTEXT (use these thresholds for analysis):
- Power factor (PF/cos φ) below 0.85 = penalty risk; below 0.5 = capacitor bank failure likely
- Flow rate = 0 when previous > 0 means line stopped or sensor fault
- Production counter delta = 0 means zero output for entire period
- Temperature/pressure spikes beyond +20% of previous = investigate immediately
- Equipment ON but zero production = mechanical fault or upstream blockage
"""
    if trend_summary:
        prompt += f"""
PRODUCTION TRENDS (oldest -> newest, {cmp_label} periods):
{trend_summary}

If 3+ periods show consistent decline, mention in the Plant Status verdict or Alerts.
"""
    prompt += f"""
OUTPUT FORMAT — two sections, be EXTREMELY concise:

SECTION 1 — OVERVIEW:
**Plant Status** — {{8 words max verdict, e.g. "Mill B stopped, production down 41% vs {cmp_label}"}}

• **Production**: {{delta values with explicit comparison — e.g. "B1: 113,926 kg (↓43% vs {cmp_label})"}}
• **Status**: {{equipment changes — e.g. "Mill B stopped since {cmp_label}" — SKIP if unchanged}}
• **Energy**: {{power with comparison — e.g. "C32: 184 kVA, PF dropped 0.74→0.14 vs {cmp_label}" — SKIP if no energy tags}}
• **Alerts**: {{critical issues only — or "None"}}

SECTION 2 — PER REPORT (one per report):
---REPORT: ExactReportName---
**ExactReportName** — {{5 words max verdict}}
• {{key metric with "vs {cmp_label}" comparison, 20 words max}}
• {{second finding if notable, 20 words max}}

STRICT RULES:
1. EVERY percentage change MUST say "vs {cmp_label}" — never write bare "↓43%", always "↓43% vs {cmp_label}".
2. NEVER cite meter readings (first/last values). Only cite delta values as production.
3. Each bullet MAX 20 words. Verdict MAX 8 words.
4. SKIP any bullet with nothing useful. Do NOT write "No data available."
5. Format: 1,234,567 kg (not 1234567.0). Use ↑↓→ arrows.
6. Use tag labels, never raw tag_names.
7. Overview max 4 bullets. Per-report max 2 bullets.
8. No paragraphs, no explanations, no recommendations, no greetings.
9. NEVER use internal terms "delta", "first", "last", "aggregation" in output. Say "produced 113,926 kg" not "delta: 113926".
10. ALWAYS include units. Say "113,926 kg" not "113,926".
11. Use the Change% column directly — do not calculate percentages yourself.
12. CONTEXT: Oman weekend is Friday-Saturday. Reduced output or idle equipment on Fri/Sat is EXPECTED — do NOT flag as abnormal unless production was supposed to run (indicated by non-zero flow rates)."""

    return prompt


def build_single_report_prompt(report_name, time_from, time_to,
                               structured_data, report_context=''):
    """Build a simpler single-report prompt for preview-summary (no comparison period).

    Args:
        report_name: single report name string
        time_from: formatted start time string
        time_to: formatted end time string
        structured_data: newline-joined tag data rows
            (Label | Type | Value | Aggregation | Production Line)
        report_context: optional report structure context string
    """
    prompt = f"""You are a senior plant engineer writing a shift handover briefing. Be direct, technical, action-oriented. Use industrial language: "line stopped", "tripped", "running light", "at capacity", "below nameplate". Never say "I", "we", "the data shows", or "it appears". State facts as facts.

REPORT: {report_name}
PERIOD: {time_from} to {time_to}
"""
    if report_context:
        prompt += f"""
REPORT STRUCTURE:
{report_context}
"""
    prompt += f"""
TAG DATA (Label | Type | Unit | Value | Aggregation | Production Line):
{structured_data}

AGGREGATION KEY:
- delta = amount produced/consumed during the period (this IS the production figure)
- first = meter reading at start of period
- last = meter reading at end of period (or current value)
- avg/sum/min/max = statistical aggregation over the period

INDUSTRIAL CONTEXT (use these thresholds for analysis):
- Power factor (PF/cos φ) below 0.85 = penalty risk; below 0.5 = capacitor bank failure likely
- Flow rate = 0 when previous > 0 means line stopped or sensor fault
- Production counter delta = 0 means zero output for entire period
- Temperature/pressure spikes beyond +20% of previous = investigate immediately
- Equipment ON but zero production = mechanical fault or upstream blockage

Write a smart summary using EXACTLY this format:

**{report_name}** — {{one-line verdict: running normally / reduced output / line stopped / no data}}

• **Production**: {{cite delta values as production amounts with units — e.g. "Wheat Scale produced 125,294 kg"}}
• **Energy**: {{power consumption, energy totals, power factor — skip if no energy data}}
• **Status**: {{equipment on/off, only if notable — skip if all normal}}
• **Alerts**: {{zero production, zero flow rates, abnormal values — or "None"}}

Rules:
- Delta values ARE production amounts — present as "X produced Y kg".
- First/last are meter readings — do NOT cite as production.
- Use the Label column when referring to tags.
- Maximum 4 bullets. Each under 25 words.
- Format numbers with thousand separators.
- Skip bullets with nothing to report.
- No paragraphs. No filler. No recommendations."""

    return prompt


# =============================================================================
# JSON-mode insights prompt (Plan 1 — Phase B)
# =============================================================================

PROMPT_EXAMPLES = [
    # 1. All-green day: level ok, zero attention_items, 2 assets green
    {
        "status_hero": {"level": "ok", "verdict": "Plant running within targets across all lines"},
        "attention_items": [],
        "assets": [
            {
                "name": "Mill B",
                "status": "ok",
                "headline_metrics": [
                    {"label": "Throughput", "value": 12450, "unit": "kg",
                     "delta": {"pct": 3.1, "direction": "up", "polarity": "positive",
                               "baseline_label": "vs yesterday"}},
                    {"label": "SEC", "value": 42.1, "unit": "kWh/t",
                     "delta": {"pct": -1.2, "direction": "down", "polarity": "negative",
                               "baseline_label": "vs yesterday"}}
                ],
                "notes": ["SEC within historical band; no shutdowns recorded."]
            },
            {
                "name": "C32",
                "status": "ok",
                "headline_metrics": [
                    {"label": "Power Factor", "value": 0.94, "unit": "PF",
                     "delta": {"pct": 1.0, "direction": "up", "polarity": "positive",
                               "baseline_label": "vs yesterday"}}
                ],
                "notes": []
            }
        ]
    },
    # 2. One-amber PF dip: level warn, one attention_item, asset C32 Mill warn
    {
        "status_hero": {"level": "warn", "verdict": "Running well; C32 power factor below target"},
        "attention_items": [
            {
                "severity": "warn",
                "asset": "C32 Mill",
                "headline": "Power factor 0.82, below 0.90 target",
                "evidence": "Held below target 4h 10m from 02:00. Last hour 0.79.",
                "since": "2026-04-17T02:00:00"
            }
        ],
        "assets": [
            {
                "name": "C32 Mill",
                "status": "warn",
                "headline_metrics": [
                    {"label": "Power Factor", "value": 0.82, "unit": "PF",
                     "delta": {"pct": -8.9, "direction": "down", "polarity": "negative",
                               "baseline_label": "vs yesterday"},
                     "status": "warn"}
                ],
                "notes": ["PF trending low since 02:00; inspect capacitor bank."]
            }
        ]
    },
    # 3. One-crit shutdown: level crit, one attention, asset Pasta Line crit, zero throughput
    {
        "status_hero": {"level": "crit", "verdict": "Pasta line stopped"},
        "attention_items": [
            {
                "severity": "crit",
                "asset": "Pasta Line",
                "headline": "Pasta line stopped",
                "evidence": "Zero throughput since 03:40; upstream conveyor tripped.",
                "since": "2026-04-17T03:40:00"
            }
        ],
        "assets": [
            {
                "name": "Pasta Line",
                "status": "crit",
                "headline_metrics": [
                    {"label": "Throughput", "value": 0, "unit": "kg",
                     "delta": {"pct": -100.0, "direction": "down", "polarity": "negative",
                               "baseline_label": "vs yesterday"},
                     "status": "crit"}
                ],
                "notes": ["Line stopped at 03:40; operator to inspect conveyor trip."]
            }
        ]
    },
    # 4. Zero-baseline case: metric with pct=null + text_override
    {
        "status_hero": {"level": "ok", "verdict": "Packaging line resumed after idle overnight"},
        "attention_items": [],
        "assets": [
            {
                "name": "Packaging",
                "status": "ok",
                "headline_metrics": [
                    {"label": "Line Power", "value": 42, "unit": "kW",
                     "delta": {"pct": None, "direction": "idle-to-active", "polarity": "neutral",
                               "baseline_label": "vs yesterday",
                               "text_override": "was idle, now 42 kW"}}
                ],
                "notes": ["Packaging came online at 05:30 after overnight idle."]
            }
        ]
    },
    # 5. Multi-asset crit: two attention_items crit + warn, 3 assets
    {
        "status_hero": {"level": "crit", "verdict": "Mill B stopped; C32 power factor degraded"},
        "attention_items": [
            {
                "severity": "crit",
                "asset": "Mill B",
                "headline": "Mill B stopped mid-shift",
                "evidence": "Throughput zero since 14:20, no alarm logged upstream.",
                "since": "2026-04-17T14:20:00"
            },
            {
                "severity": "warn",
                "asset": "C32 Mill",
                "headline": "Power factor drift below 0.85",
                "evidence": "PF fell from 0.92 to 0.83 across the last two hours.",
                "since": "2026-04-17T13:00:00"
            }
        ],
        "assets": [
            {
                "name": "Mill B",
                "status": "crit",
                "headline_metrics": [
                    {"label": "Throughput", "value": 0, "unit": "kg",
                     "delta": {"pct": -100.0, "direction": "down", "polarity": "negative",
                               "baseline_label": "vs yesterday"},
                     "status": "crit"}
                ],
                "notes": ["Zero production since 14:20."]
            },
            {
                "name": "C32 Mill",
                "status": "warn",
                "headline_metrics": [
                    {"label": "Power Factor", "value": 0.83, "unit": "PF",
                     "delta": {"pct": -9.8, "direction": "down", "polarity": "negative",
                               "baseline_label": "vs yesterday"}, "status": "warn"}
                ],
                "notes": ["PF drifting; monitor capacitor bank."]
            },
            {
                "name": "Reception",
                "status": "ok",
                "headline_metrics": [
                    {"label": "Intake", "value": 28400, "unit": "kg",
                     "delta": {"pct": 1.4, "direction": "up", "polarity": "positive",
                               "baseline_label": "vs yesterday"}}
                ],
                "notes": []
            }
        ]
    },
    # 6. Data gap: verdict mentions incomplete data, minimal attention_items
    {
        "status_hero": {"level": "warn", "verdict": "Incomplete data; partial briefing only"},
        "attention_items": [
            {
                "severity": "warn",
                "asset": "Mill B",
                "headline": "Tag history gap detected",
                "evidence": "No readings recorded between 04:00 and 06:15; briefing partial.",
                "since": "2026-04-17T04:00:00"
            }
        ],
        "assets": [
            {
                "name": "Mill B",
                "status": "warn",
                "headline_metrics": [
                    {"label": "Throughput", "value": 8420, "unit": "kg",
                     "delta": {"pct": -32.4, "direction": "down", "polarity": "negative",
                               "baseline_label": "vs yesterday"}, "status": "warn"}
                ],
                "notes": ["Underlying data gap 04:00–06:15; totals may under-report."]
            }
        ]
    }
]


def _format_prompt_examples():
    """Render the PROMPT_EXAMPLES as a single valid JSON array string."""
    return _json.dumps(PROMPT_EXAMPLES, indent=2, ensure_ascii=False)


def build_insights_prompt_json(report_names, time_from, time_to, cmp_label,
                               prev_from_str, prev_to_str, structured_data,
                               known_assets, report_context='', trend_summary='',
                               validation_error=None):
    """Build the JSON-mode insights prompt (Plan 1, Phase B).

    Returns a dict with 'system' and 'user' keys, suitable for passing to
    Anthropic's messages API with JSON mode. Keep separate from
    build_insights_prompt — the old markdown prompt is still used by the
    email / distribution pathway and by ?format=markdown.
    """
    names_str = ', '.join(report_names) if isinstance(report_names, list) else str(report_names)
    known_assets_str = ', '.join(sorted(known_assets)) if known_assets else '(none — infer from data)'

    # -------------------------------------------------------------------
    # System message: role + schema + hard rules + 6-shot examples
    # -------------------------------------------------------------------
    schema_block = (
        "type InsightsLLMOutput = {\n"
        "  status_hero: {\n"
        "    level: 'ok' | 'warn' | 'crit';\n"
        "    verdict: string;   // <= 80 chars, NO digits\n"
        "  };\n"
        "  attention_items: Array<{\n"
        "    severity: 'warn' | 'crit';\n"
        "    asset: string;          // MUST be in the known asset registry\n"
        "    headline: string;       // <= 10 words\n"
        "    evidence: string;       // <= 25 words\n"
        "    since?: string;         // ISO 8601 if known\n"
        "  }>;                       // length 0..3\n"
        "  assets: Array<{\n"
        "    name: string;\n"
        "    status: 'ok' | 'warn' | 'crit';\n"
        "    headline_metrics: Array<{\n"
        "      label: string; value: number | null; unit: string;\n"
        "      delta?: {\n"
        "        pct: number | null;  // null when zero-baseline or clamped\n"
        "        direction: 'up' | 'down' | 'flat' | 'idle-to-active';\n"
        "        polarity: 'positive' | 'negative' | 'neutral';\n"
        "        baseline_label: string;\n"
        "        text_override?: string;\n"
        "      };\n"
        "      status?: 'ok' | 'warn' | 'crit';\n"
        "    }>;                     // choose top 2 for the asset\n"
        "    notes: string[];        // optional; short operator sentences\n"
        "  }>;\n"
        "};\n"
    )

    hard_rules = (
        "Hard rules:\n\n"
        "1. `status_hero.verdict` <= 80 characters. NEVER put digits in the verdict.\n"
        "   Good: \"Running well; C32 power factor below target\"\n"
        "   Bad:  \"Plant at 91% production, C32 PF 0.82\"\n\n"
        "2. `attention_items` length 0-3. Sort by severity (crit first), then by\n"
        "   recency of problem onset. OMIT any item where the underlying delta is\n"
        "   < 5% AND the asset is not already in an attention state.\n\n"
        "3. NEVER output percentages above 500 or below -500. For a metric that went\n"
        "   from 0 to a nonzero value, set `delta.pct = null` and fill\n"
        "   `delta.text_override` with \"was idle, now {value}{unit}\".\n\n"
        "4. Group by physical asset, NOT by report. If three reports each mention\n"
        "   \"Mill B\", produce ONE asset entry \"Mill B\".\n\n"
        "5. Never conflate meter readings with production. A cumulative meter\n"
        "   going up 1,000 kWh is not \"production increased 1,000%\".\n\n"
        "6. Use ONLY tags and values present in the supplied data bundle. Do not\n"
        "   invent a number, a tag name, or an asset.\n\n"
        "7. Numeric precision: ratios 1 decimal, weights > 1000 zero decimals,\n"
        "   small flows 3 decimals, currency 0 or 2 decimals.\n\n"
        "8. `verdict` tone is operator-calm. No alarmism. No \"critical failure\"\n"
        "   unless severity is crit. No exclamation marks. Ever.\n\n"
        "9. CONTEXT: Oman weekend is Friday-Saturday. Reduced output or idle equipment\n"
        "   on Fri/Sat is EXPECTED — do NOT flag as 'warn' or 'crit' unless\n"
        "   production was supposed to run (indicated by non-zero flow rates).\n"
    )

    system_msg = (
        "You are the briefing writer for Hercules, an industrial plant reporting platform.\n"
        "Your ONLY output is one JSON object matching the schema below. No markdown, no\n"
        "prose outside JSON, no comments. The JSON will be parsed machine-first and\n"
        "rendered to plant managers who scan for under five seconds.\n\n"
        "Schema (TypeScript, for your reference):\n"
        f"{schema_block}\n"
        f"{hard_rules}\n"
        "Example outputs follow. Match their shape exactly.\n\n"
        f"{_format_prompt_examples()}\n"
    )

    # -------------------------------------------------------------------
    # User message: the actual data bundle
    # -------------------------------------------------------------------
    # Day of week for context (Oman weekend = Fri-Sat)
    day_part = None
    try:
        from datetime import datetime as _dt
        _tf = time_from
        if 'T' in _tf:
            dt = _dt.fromisoformat(_tf.replace('Z', '+00:00'))
        else:
            dt = _dt.strptime(_tf, '%Y-%m-%d %H:%M')
        day_part = dt.strftime('%A')
    except Exception:
        pass

    user_parts = [
        f"REPORTS: {names_str}",
        f"PERIOD: {time_from} to {time_to}",
    ]
    if day_part:
        user_parts.append(f"DAY: {day_part}")
    user_parts.extend([
        f"COMPARED AGAINST: {cmp_label} ({prev_from_str} to {prev_to_str})",
        f"KNOWN ASSETS (attention_items.asset MUST be one of these): {known_assets_str}",
    ])
    if report_context:
        user_parts.append("")
        user_parts.append("STRUCTURE:")
        user_parts.append(report_context)

    user_parts.append("")
    user_parts.append(
        f"DATA (Label | Type | Unit | Now | {cmp_label.title()} | Change% | Aggregation | Line):"
    )
    user_parts.append(structured_data)
    user_parts.append("")
    user_parts.append(
        "KEYS: delta=produced amount, first=start reading, last=end/current reading."
    )
    user_parts.append(
        "Change% = pre-computed percentage change (use directly; do NOT recalc)."
    )

    if trend_summary:
        user_parts.append("")
        user_parts.append(f"PRODUCTION TRENDS (oldest -> newest, {cmp_label} periods):")
        user_parts.append(trend_summary)

    if validation_error:
        user_parts.append("")
        user_parts.append(
            "Your previous output failed validation with the following error. "
            "Emit a new JSON object that corrects the issue:"
        )
        user_parts.append(str(validation_error))

    user_parts.append("")
    user_parts.append(
        "Return ONE JSON object with keys: status_hero, attention_items, assets. "
        "No other text, no code fences."
    )

    user_msg = '\n'.join(user_parts)

    return {'system': system_msg, 'user': user_msg, 'version': INSIGHTS_PROMPT_VERSION}


# =============================================================================
# Sanitisation / validation (Plan 1 — section 6.7)
# =============================================================================

_VERDICT_DIGIT_RE = _re.compile(r"\d+")
_WHITESPACE_RE = _re.compile(r"\s+")

_ALLOWED_LEVELS = {'ok', 'warn', 'crit'}
_ATTENTION_SEVERITIES = {'warn', 'crit'}
_ALLOWED_DIRECTIONS = {'up', 'down', 'flat', 'idle-to-active'}
_ALLOWED_POLARITIES = {'positive', 'negative', 'neutral'}


def _severity_rank(level):
    """crit > warn > ok."""
    return {'crit': 3, 'warn': 2, 'ok': 1}.get(level, 0)


def _normalise_asset_name(name):
    """Trim, collapse whitespace, case-fold for dedupe."""
    if not name:
        return ''
    return _WHITESPACE_RE.sub(' ', str(name).strip()).casefold()


def _clamp_delta(delta, value=None, unit=''):
    """Clamp delta.pct to [-500, 500]. If clamped, set pct=null and build
    a text_override. Mutates and returns the delta dict."""
    if not isinstance(delta, dict):
        return delta
    pct = delta.get('pct')
    if pct is None:
        # Zero-baseline — ensure a helpful text_override exists
        if not delta.get('text_override'):
            if value is not None:
                try:
                    v_fmt = f"{float(value):g}"
                except (ValueError, TypeError):
                    v_fmt = str(value)
                unit_part = f" {unit}".rstrip() if unit else ''
                delta['text_override'] = f"was idle, now {v_fmt}{unit_part}".strip()
            else:
                delta['text_override'] = "was idle, now active"
        return delta
    try:
        p = float(pct)
    except (ValueError, TypeError):
        delta['pct'] = None
        return delta
    if p > 500:
        delta['pct'] = None
        delta['text_override'] = delta.get('text_override') or '+500%+'
    elif p < -500:
        delta['pct'] = None
        delta['text_override'] = delta.get('text_override') or '-500%+'
    else:
        delta['pct'] = round(p, 2)
    # Default missing fields to sane values
    delta.setdefault('direction', 'flat')
    delta.setdefault('polarity', 'neutral')
    delta.setdefault('baseline_label', 'vs previous')
    if delta['direction'] not in _ALLOWED_DIRECTIONS:
        delta['direction'] = 'flat'
    if delta['polarity'] not in _ALLOWED_POLARITIES:
        delta['polarity'] = 'neutral'
    return delta


def _sanitise_metric(m):
    """Normalise a single MetricPayload dict; return None if unrecoverable."""
    if not isinstance(m, dict):
        return None
    label = (m.get('label') or '').strip()
    unit = (m.get('unit') or '').strip()
    value = m.get('value', None)
    # Keep value as None or number
    if value is not None:
        try:
            value = float(value)
        except (ValueError, TypeError):
            value = None
    out = {
        'label': label or 'Metric',
        'value': value,
        'unit': unit,
    }
    if 'precision' in m and m['precision'] is not None:
        try:
            out['precision'] = int(m['precision'])
        except (ValueError, TypeError):
            pass
    if isinstance(m.get('delta'), dict):
        out['delta'] = _clamp_delta(dict(m['delta']), value=value, unit=unit)
    if isinstance(m.get('sparkline'), list):
        spark = []
        for p in m['sparkline']:
            try:
                spark.append(float(p))
            except (ValueError, TypeError):
                continue
        out['sparkline'] = spark
    if m.get('status') in _ALLOWED_LEVELS:
        out['status'] = m['status']
    if m.get('tag_name'):
        out['tag_name'] = str(m['tag_name'])
    return out


def _validate_schema(obj):
    """Minimal plain-Python validator for the LLM output shape.
    Returns list of error strings; empty list = valid."""
    errs = []
    if not isinstance(obj, dict):
        return ['Root value is not a JSON object.']

    # status_hero
    sh = obj.get('status_hero')
    if not isinstance(sh, dict):
        errs.append('status_hero missing or not an object.')
    else:
        if sh.get('level') not in _ALLOWED_LEVELS:
            errs.append("status_hero.level must be one of: ok, warn, crit.")
        verdict = sh.get('verdict')
        if not isinstance(verdict, str) or not verdict.strip():
            errs.append('status_hero.verdict must be a non-empty string.')

    # attention_items
    ai_items = obj.get('attention_items', [])
    if not isinstance(ai_items, list):
        errs.append('attention_items must be an array.')
    else:
        for i, it in enumerate(ai_items):
            if not isinstance(it, dict):
                errs.append(f'attention_items[{i}] is not an object.')
                continue
            if it.get('severity') not in _ATTENTION_SEVERITIES:
                errs.append(f"attention_items[{i}].severity must be warn or crit.")
            for field in ('asset', 'headline', 'evidence'):
                if not isinstance(it.get(field), str) or not it.get(field, '').strip():
                    errs.append(f'attention_items[{i}].{field} required.')

    # assets
    assets = obj.get('assets', [])
    if not isinstance(assets, list):
        errs.append('assets must be an array.')
    else:
        for i, a in enumerate(assets):
            if not isinstance(a, dict):
                errs.append(f'assets[{i}] is not an object.')
                continue
            if not isinstance(a.get('name'), str) or not a['name'].strip():
                errs.append(f'assets[{i}].name required.')
            if a.get('status') not in _ALLOWED_LEVELS:
                errs.append(f'assets[{i}].status must be ok/warn/crit.')
            if not isinstance(a.get('headline_metrics'), list):
                errs.append(f'assets[{i}].headline_metrics must be an array.')

    return errs


def minimal_insights_stub():
    """The graceful-failure LLM stub. Matches the section-6.7 minimal shape."""
    return {
        'status_hero': {
            'level': 'warn',
            'verdict': 'Briefing degraded — see raw data',
        },
        'attention_items': [],
        'assets': [],
    }


def sanitize_insights_payload(llm_json, known_assets, period_from, period_to):
    """Apply every rule from Plan section 6.7 to the raw LLM JSON.

    Args:
        llm_json: dict parsed from the LLM output. May be None/invalid.
        known_assets: iterable of asset-name strings (case-sensitive match
                      tolerated, we case-fold for comparison).
        period_from: ISO string of the briefing period start.
        period_to: ISO string of the briefing period end.

    Returns:
        A sanitised dict with keys: status_hero, attention_items, assets.
        Never raises — always returns a usable object (possibly the
        minimal_insights_stub on catastrophic failure).
    """
    try:
        if not isinstance(llm_json, dict):
            _logger.warning("sanitize_insights_payload: input is not a dict; using stub")
            return minimal_insights_stub()

        out = {}

        # ── status_hero ───────────────────────────────────────────────
        sh_in = llm_json.get('status_hero') or {}
        level = sh_in.get('level') if sh_in.get('level') in _ALLOWED_LEVELS else 'warn'
        verdict = (sh_in.get('verdict') or '').strip()
        # Rule 5: regex-strip digits, enforce 80-char hard cap
        verdict = _VERDICT_DIGIT_RE.sub('', verdict)
        verdict = _WHITESPACE_RE.sub(' ', verdict).strip()
        if len(verdict) > 80:
            verdict = verdict[:77].rstrip() + '...'
        if not verdict:
            verdict = 'Briefing ready'
        out['status_hero'] = {'level': level, 'verdict': verdict}

        # ── attention_items: dedupe + asset whitelist + truncate ──────
        known_folded = {_normalise_asset_name(n): n for n in (known_assets or [])}
        raw_attn = llm_json.get('attention_items') or []
        seen = set()
        cleaned_attn = []
        for item in raw_attn:
            if not isinstance(item, dict):
                continue
            severity = item.get('severity')
            if severity not in _ATTENTION_SEVERITIES:
                continue
            asset = (item.get('asset') or '').strip()
            headline = (item.get('headline') or '').strip()
            evidence = (item.get('evidence') or '').strip()
            if not (asset and headline and evidence):
                continue

            # Rule 6: asset must be in known_assets
            folded = _normalise_asset_name(asset)
            if known_folded and folded not in known_folded:
                _logger.warning(
                    "sanitize_insights_payload: dropping attention item — unknown asset %r (known=%s)",
                    asset, list(known_folded.values())[:10]
                )
                continue
            # Canonicalise to the known spelling
            canonical = known_folded.get(folded, asset)

            # Rule 2: dedupe by (asset, headline[:40].lower())
            key = (folded, headline[:40].lower())
            if key in seen:
                continue
            seen.add(key)

            entry = {
                'severity': severity,
                'asset': canonical,
                'headline': headline,
                'evidence': evidence,
            }
            if item.get('since'):
                entry['since'] = str(item['since'])
            entry['drill'] = {
                'from': period_from,
                'to': period_to,
            }
            cleaned_attn.append(entry)

        # Sort crit first, then warn
        cleaned_attn.sort(key=lambda x: 0 if x['severity'] == 'crit' else 1)
        # Rule 4: truncate to 3
        out['attention_items'] = cleaned_attn[:3]

        # ── assets: merge duplicates, truncate per-asset metrics ──────
        raw_assets = llm_json.get('assets') or []
        merged = {}  # folded-name -> asset dict
        for a in raw_assets:
            if not isinstance(a, dict):
                continue
            name = (a.get('name') or '').strip()
            if not name:
                continue
            folded = _normalise_asset_name(name)
            status = a.get('status') if a.get('status') in _ALLOWED_LEVELS else 'ok'
            notes_in = a.get('notes') or []
            if not isinstance(notes_in, list):
                notes_in = []
            notes_in = [str(n).strip() for n in notes_in if n]

            hmetrics_raw = a.get('headline_metrics') or []
            hmetrics = []
            for m in (hmetrics_raw if isinstance(hmetrics_raw, list) else []):
                sm = _sanitise_metric(m)
                if sm:
                    hmetrics.append(sm)
            # Rule 4: 12 metrics per asset
            hmetrics = hmetrics[:12]

            related = a.get('related_report_ids') or []
            if not isinstance(related, list):
                related = []
            related_ids = []
            for rid in related:
                try:
                    related_ids.append(int(rid))
                except (ValueError, TypeError):
                    continue

            if folded in merged:
                existing = merged[folded]
                # Most severe status
                if _severity_rank(status) > _severity_rank(existing['status']):
                    existing['status'] = status
                # Combine notes
                for n in notes_in:
                    if n and n not in existing['notes']:
                        existing['notes'].append(n)
                # Union related_report_ids
                for rid in related_ids:
                    if rid not in existing['related_report_ids']:
                        existing['related_report_ids'].append(rid)
                # Keep first-seen headline_metrics; append new ones up to 12
                for m in hmetrics:
                    if len(existing['headline_metrics']) >= 12:
                        break
                    existing['headline_metrics'].append(m)
            else:
                merged[folded] = {
                    'name': name,
                    'status': status,
                    'headline_metrics': hmetrics,
                    'notes': notes_in,
                    'related_report_ids': related_ids,
                }

        # Rule 4: 8 assets max, severity first
        assets_list = list(merged.values())
        assets_list.sort(key=lambda x: -_severity_rank(x['status']))
        out['assets'] = assets_list[:8]

        return out
    except Exception as e:
        _logger.warning("sanitize_insights_payload: unexpected error (%s); using stub", e)
        return minimal_insights_stub()


def validate_insights_schema(obj):
    """Public wrapper around _validate_schema — returns list[str] of errors."""
    return _validate_schema(obj)

