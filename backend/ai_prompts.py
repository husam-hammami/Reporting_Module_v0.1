"""
Shared AI Prompts
=================
Canonical prompt builders for Hercules AI summaries.
Used by both the Insights Hub (hercules_ai_bp) and Distribution Engine.
"""


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
                          report_context=''):
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
    """
    names_str = ', '.join(report_names) if isinstance(report_names, list) else str(report_names)

    prompt = f"""You write concise plant insights for mill managers. Numbers only — no filler.

REPORTS: {names_str}
PERIOD: {time_from} to {time_to}
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

OUTPUT FORMAT — two sections, be EXTREMELY concise:

SECTION 1 — OVERVIEW:
**Plant Overview** — {{8 words max verdict, e.g. "Mill B stopped, production down 41% vs {cmp_label}"}}

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
11. Use the Change% column directly — do not calculate percentages yourself."""

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
    prompt = f"""You analyze industrial production and energy data for mill/plant managers. Be direct, specific, and useful.

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
