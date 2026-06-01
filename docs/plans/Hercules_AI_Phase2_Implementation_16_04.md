# Hercules AI Phase 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three enhancements to Hercules AI — DRY up duplicated prompts + fix rate limiting bugs, add AI-only email distribution mode, and generate server-side charts embedded in emails.

**Architecture:** Extract shared prompt logic into `ai_prompts.py`. Add `content_mode` column to `distribution_rules` for report-only/report+AI/AI-only modes. Generate matplotlib charts server-side as PNG images, attach via CID inline in emails.

**Tech Stack:** Python (Flask, matplotlib, psycopg2), React, PostgreSQL, Anthropic Claude API

---

## File Structure

### New Files
| File | Responsibility |
|------|----------------|
| `backend/ai_prompts.py` | Single source of truth for all AI prompt templates |
| `backend/ai_chart_generator.py` | Rule-based chart selection + matplotlib rendering |
| `backend/migrations/add_distribution_content_mode.sql` | Add `content_mode` column to `distribution_rules` |

### Modified Files
| File | Changes |
|------|---------|
| `backend/hercules_ai_bp.py` | Import prompts from `ai_prompts.py`, remove inline prompt, add `/preview-charts` endpoint |
| `backend/distribution_engine.py` | Import prompts from `ai_prompts.py`, remove inline prompt, persistent rate limiting, `content_mode` logic, chart embedding |
| `backend/ai_provider.py` | Increase `max_tokens` from 500 to 700 for richer insights |
| `backend/distribution_bp.py` | Validate `content_mode`, update INSERT/UPDATE SQL |
| `backend/init_db.py` | Add migration to `MIGRATION_ORDER` |
| `backend/app.py` | Add migration to `_run_startup_migrations` list |
| `backend/hercules.spec` | Add `ai_prompts`, `ai_chart_generator`, `matplotlib.backends.backend_agg` to hiddenimports |
| `backend/requirements.txt` | Add `matplotlib` |
| `backend/requirements-railway.txt` | Add `matplotlib` |
| `desktop/main.js` | Add migration to `migrationOrder` + add missing `add_order_tracking_to_report_templates.sql` |
| `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx` | Replace `include_ai_summary` toggle with 3-option `content_mode` selector |
| `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx` | Add chart preview section below insights cards |
| `Frontend/src/API/herculesAIApi.js` | Add `previewCharts()` function |
| `Frontend/src/i18n/en.json` | Add content mode keys |
| `Frontend/src/i18n/ar.json` | Add content mode keys (Arabic) |
| `Frontend/src/i18n/hi.json` | Add content mode keys (Hindi) |
| `Frontend/src/i18n/ur.json` | Add content mode keys (Urdu) |

---

## Phase 1: Bug Fixes (Tasks 1–3)

### Task 1: Extract shared prompt into `ai_prompts.py`

**Problem:** The AI prompt is duplicated in two files with different versions. The insights hub prompt (in `hercules_ai_bp.py:1082-1123`) is the better version — it has comparison periods, per-report sections, and stricter rules. The distribution engine prompt (in `distribution_engine.py:3145-3185`) is older and simpler. Both must use the same prompt.

**Files:**
- Create: `backend/ai_prompts.py`
- Modify: `backend/hercules_ai_bp.py:1082-1123` (remove inline prompt)
- Modify: `backend/distribution_engine.py:3132-3185` (remove inline prompt)

- [ ] **Step 1: Create `backend/ai_prompts.py`**

```python
"""Shared AI prompt templates for Hercules AI.

Single source of truth — used by both the insights hub endpoint
and the distribution engine's email summary generator.
"""

def build_insights_prompt(report_names, time_from, time_to,
                          cmp_label, prev_from_str, prev_to_str,
                          structured_data, report_context=''):
    """Build the full insights prompt with comparison period.

    Args:
        report_names: list of report name strings
        time_from: formatted start time string
        time_to: formatted end time string
        cmp_label: comparison label ('previous day', 'previous week', etc.)
        prev_from_str: formatted previous period start
        prev_to_str: formatted previous period end
        structured_data: formatted data table string
        report_context: optional report structure description
    Returns:
        Complete prompt string for the AI provider.
    """
    names_str = ', '.join(report_names)

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
DATA (Label | Type | Now | {cmp_label.title()} | Aggregation | Line):
{structured_data}

KEYS: delta=produced amount, first=start reading, last=end/current reading.

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
8. No paragraphs, no explanations, no recommendations, no greetings."""

    return prompt


def build_single_report_prompt(report_name, time_from, time_to,
                               structured_data, report_context=''):
    """Build prompt for single-report preview (no comparison period).

    Used by the preview-summary endpoint for quick previews with
    the most recent 24h of data.
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
TAG DATA (Label | Type | Value | Aggregation | Production Line):
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
```

- [ ] **Step 2: Update `hercules_ai_bp.py` to use shared prompt**

In `backend/hercules_ai_bp.py`, replace lines 1082–1123 (the inline prompt construction) with an import and call:

At the top of the file (after existing imports around line 10):
```python
import ai_prompts
```

Replace the prompt construction block (lines 1082–1123) with:
```python
    prompt = ai_prompts.build_insights_prompt(
        report_names=[t['name'] for t in templates],
        time_from=time_from,
        time_to=time_to,
        cmp_label=cmp_label,
        prev_from_str=prev_from_str,
        prev_to_str=prev_to_str,
        structured_data=structured_data,
        report_context=report_context,
    )
```

Also replace the preview-summary prompt (lines 859–895) with:
```python
    prompt = ai_prompts.build_single_report_prompt(
        report_name=chosen_template['name'],
        time_from=time_from,
        time_to=time_to,
        structured_data=structured_data,
        report_context=report_context,
    )
```

- [ ] **Step 3: Update `distribution_engine.py` to use shared prompt**

In `backend/distribution_engine.py`, the `_generate_ai_summary` function (lines 3025–3195) builds its own prompt at lines 3132–3185. This prompt lacks comparison periods.

**Upgrade strategy:** The distribution engine currently has no comparison data. We will add previous-period fetching here too, matching the insights hub behavior.

At the top of `distribution_engine.py` (with existing imports):
```python
import ai_prompts
```

Replace lines 3132–3185 (the inline prompt block) in `_generate_ai_summary`. The function signature stays the same but we add comparison data:

```python
def _generate_ai_summary(report_names, tag_data, from_dt, to_dt, layout_configs=None):
    """Generate AI summary for distribution emails.
    
    Now includes previous-period comparison, matching the insights hub behavior.
    """
    global _ai_call_count, _ai_call_date
    # ... (rate limiting + config loading stays the same, lines 3035-3130) ...

    # --- NEW: fetch previous period data ---
    period_duration = to_dt - from_dt
    prev_to = from_dt
    prev_from = prev_to - period_duration

    hours = period_duration.total_seconds() / 3600
    if hours <= 25:
        cmp_label = 'previous day'
    elif hours <= 170:
        cmp_label = 'previous week'
    elif hours <= 745:
        cmp_label = 'previous month'
    else:
        cmp_label = 'previous period'

    # Fetch previous period tag data using same tags
    prev_tag_data = {}
    try:
        for rname, lc in (layout_configs or {}).items():
            tags_in_report = extract_all_tags_from_layout(lc)
            if tags_in_report:
                prev_vals = _fetch_tag_data_multi_agg(lc, tags_in_report, prev_from, prev_to)
                prev_tag_data.update(prev_vals or {})
    except Exception as e:
        logger.warning("Could not fetch previous period data for AI: %s", e)

    # Build structured data with comparison columns
    time_from = from_dt.strftime('%Y-%m-%d %H:%M')
    time_to = to_dt.strftime('%Y-%m-%d %H:%M')
    prev_from_str = prev_from.strftime('%Y-%m-%d %H:%M')
    prev_to_str = prev_to.strftime('%Y-%m-%d %H:%M')

    rows = []
    for key, val in significant.items():
        tag_name = key.split('::')[-1] if '::' in key else key
        agg = key.split('::')[0] if '::' in key else 'last'
        profile = profile_map.get(tag_name, {})
        label = profile.get('label') or tag_name
        ttype = profile.get('tag_type', 'unknown')
        line = profile.get('line_name', '')
        prev_val = prev_tag_data.get(key, 'N/A')
        rows.append(f"{label} | {ttype} | {val} | {prev_val} | {agg} | {line}")

    structured_data = '\n'.join(rows)
    names_str = ', '.join(report_names) if isinstance(report_names, list) else report_names
    report_context = _extract_report_context(layout_configs) if layout_configs else ''

    prompt = ai_prompts.build_insights_prompt(
        report_names=report_names if isinstance(report_names, list) else [report_names],
        time_from=time_from,
        time_to=time_to,
        cmp_label=cmp_label,
        prev_from_str=prev_from_str,
        prev_to_str=prev_to_str,
        structured_data=structured_data,
        report_context=report_context,
    )

    try:
        import ai_provider
        result = ai_provider.generate(prompt, ai_config)
        if result:
            _ai_call_count += 1
        return result
    except Exception as e:
        logger.warning("AI summary API call failed: %s", e)
        return None
```

- [ ] **Step 4: Add `ai_prompts` to PyInstaller hiddenimports**

In `backend/hercules.spec`, add to the `hiddenimports` list (after `'ai_provider'` around line 110):
```python
    'ai_prompts',
```

- [ ] **Step 5: Commit**

```bash
git add backend/ai_prompts.py backend/hercules_ai_bp.py backend/distribution_engine.py backend/hercules.spec
git commit -m "refactor: extract shared AI prompts into ai_prompts.py (DRY)

Both insights hub and distribution engine now use identical prompts.
Distribution engine upgraded to include previous-period comparison."
```

---

### Task 2: Fix rate limiting — persistent DB storage + UTC reset

**Problem:** Rate limit counter (`_ai_call_count`) is in-memory — resets on restart, not shared across workers. Also uses `datetime.now().date()` (local time) instead of UTC.

**Files:**
- Modify: `backend/distribution_engine.py:2920-2922, 3035-3044, 3191`

- [ ] **Step 1: Replace in-memory rate limiting with DB-backed counter**

In `backend/distribution_engine.py`, remove the module-level variables (lines 2920–2922):
```python
# DELETE these three lines:
_ai_call_count = 0
_ai_call_date = None
_AI_DAILY_CAP = 200
```

Replace with a constant and DB helper functions:
```python
_AI_DAILY_CAP = 200


def _get_ai_call_count(conn):
    """Get today's AI call count from the database. Returns (count, date_str)."""
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT value FROM hercules_ai_config WHERE key = 'daily_call_count'"
            )
            row = cur.fetchone()
            if row:
                data = row[0] if isinstance(row[0], dict) else {}
                if data.get('date') == today:
                    return data.get('count', 0), today
            return 0, today
    except Exception:
        return 0, today


def _increment_ai_call_count(conn):
    """Atomically increment today's AI call count in the database."""
    from datetime import datetime, timezone
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO hercules_ai_config (key, value)
                VALUES ('daily_call_count', %s::jsonb)
                ON CONFLICT (key) DO UPDATE
                SET value = CASE
                    WHEN (hercules_ai_config.value->>'date') = %s
                    THEN jsonb_build_object('date', %s, 'count',
                         (COALESCE((hercules_ai_config.value->>'count')::int, 0) + 1))
                    ELSE jsonb_build_object('date', %s, 'count', 1)
                END,
                updated_at = NOW()
            """, [
                json.dumps({'date': today, 'count': 1}),
                today, today, today
            ])
            conn.commit()
    except Exception as e:
        logger.warning("Failed to increment AI call count: %s", e)
```

- [ ] **Step 2: Update `_generate_ai_summary` to use DB rate limiting**

In `_generate_ai_summary`, replace the rate limit check block (currently lines 3035–3044):

**Old code (delete):**
```python
    global _ai_call_count, _ai_call_date
    today = datetime.now().date()
    if _ai_call_date != today:
        _ai_call_count = 0
        _ai_call_date = today
    if _ai_call_count >= _AI_DAILY_CAP:
        logger.info("AI daily cap reached (%s), skipping", _AI_DAILY_CAP)
        return None
```

**New code (insert in same location, after getting `conn`):**
```python
    count, _ = _get_ai_call_count(conn)
    if count >= _AI_DAILY_CAP:
        logger.info("AI daily cap reached (%s/%s), skipping", count, _AI_DAILY_CAP)
        return None
```

And replace the increment (currently line 3191 `_ai_call_count += 1`) with:
```python
            _increment_ai_call_count(conn)
```

Note: `conn` is already available in `_generate_ai_summary` — it's obtained at line 3046 for loading config. Pass it to the helper functions.

- [ ] **Step 3: Commit**

```bash
git add backend/distribution_engine.py
git commit -m "fix: persistent AI rate limiting in DB + UTC date reset

Rate limit counter now stored in hercules_ai_config table.
Persists across restarts, shared across workers.
Uses UTC date for consistent daily reset."
```

---

### Task 3: Increase max_tokens for richer output

**Problem:** `max_tokens=500` is tight for multi-report insights with comparison data. The prompt now asks for an overview + per-report sections with comparisons, which can exceed 500 tokens.

**Files:**
- Modify: `backend/ai_provider.py:63, 85, 99`

- [ ] **Step 1: Increase max_tokens to 700**

In `backend/ai_provider.py`:

Line 63 — cloud provider:
```python
# Change:
            model=model, max_tokens=500,
# To:
            model=model, max_tokens=700,
```

Line 85 — local provider (openai path):
```python
# Change:
                max_tokens=500,
# To:
                max_tokens=700,
```

Line 99 — local provider (requests fallback path):
```python
# Change:
                'max_tokens': 500,
# To:
                'max_tokens': 700,
```

- [ ] **Step 2: Commit**

```bash
git add backend/ai_provider.py
git commit -m "fix: increase AI max_tokens from 500 to 700 for multi-report insights"
```

---

## Phase 2: AI-Only Insights Distribution (Tasks 4–7)

### Task 4: Database migration — add `content_mode` column

**Files:**
- Create: `backend/migrations/add_distribution_content_mode.sql`
- Modify: `backend/init_db.py:25-51` (add to MIGRATION_ORDER)
- Modify: `backend/app.py:771-797` (add to _run_startup_migrations list)
- Modify: `desktop/main.js:329-354` (add to migrationOrder)

- [ ] **Step 1: Create migration SQL**

Create `backend/migrations/add_distribution_content_mode.sql`:
```sql
-- Add content_mode to distribution_rules.
-- Replaces the boolean include_ai_summary with a 3-way option:
--   'report_only'    = report attachments, no AI (default)
--   'report_with_ai' = report attachments + AI summary
--   'ai_only'        = AI summary only, no attachments

ALTER TABLE distribution_rules
    ADD COLUMN IF NOT EXISTS content_mode VARCHAR(20) DEFAULT 'report_only';

-- Backfill: existing rules with include_ai_summary=true become 'report_with_ai'
UPDATE distribution_rules
SET content_mode = 'report_with_ai'
WHERE include_ai_summary = true AND content_mode = 'report_only';
```

- [ ] **Step 2: Add migration to all 3 migration lists**

In `backend/init_db.py`, append to `MIGRATION_ORDER` (after `'add_order_tracking_to_report_templates.sql'` at line 51):
```python
    'add_distribution_content_mode.sql',
```

In `backend/app.py`, append to the migrations list in `_run_startup_migrations` (after `'add_order_tracking_to_report_templates.sql'` around line 797):
```python
    'add_distribution_content_mode.sql',
```

In `desktop/main.js`, append to `migrationOrder` (after `'add_ai_summary_to_distribution.sql'` at line 354). Also add the missing migration:
```javascript
    'add_order_tracking_to_report_templates.sql',
    'add_distribution_content_mode.sql',
```

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/add_distribution_content_mode.sql backend/init_db.py backend/app.py desktop/main.js
git commit -m "feat: add content_mode column to distribution_rules

Three modes: report_only, report_with_ai, ai_only.
Backfills existing include_ai_summary=true rules to report_with_ai."
```

---

### Task 5: Backend — validate and store `content_mode`

**Files:**
- Modify: `backend/distribution_bp.py:91-189` (validation), `280-295` (INSERT), `323-341` (UPDATE)

- [ ] **Step 1: Update `_validate_rule` to accept `content_mode`**

In `backend/distribution_bp.py`, in the `_validate_rule` function (around line 187, where `include_ai_summary` is extracted):

Replace:
```python
        'include_ai_summary': bool(data.get('include_ai_summary', False)),
```

With:
```python
        'include_ai_summary': bool(data.get('include_ai_summary', False)),
        'content_mode': data.get('content_mode', 'report_only'),
```

Add validation after the format validation block (after the `format` check around line 185):
```python
    # Validate content_mode
    valid_modes = ('report_only', 'report_with_ai', 'ai_only')
    if cleaned['content_mode'] not in valid_modes:
        return None, f"content_mode must be one of: {', '.join(valid_modes)}"

    # Derive include_ai_summary from content_mode for backward compatibility
    cleaned['include_ai_summary'] = cleaned['content_mode'] in ('report_with_ai', 'ai_only')

    # ai_only mode is email-only — disk doesn't make sense
    if cleaned['content_mode'] == 'ai_only' and cleaned['delivery_method'] == 'disk':
        return None, "AI Insights Only mode requires email delivery"
```

- [ ] **Step 2: Update INSERT SQL**

In the POST handler (around line 280), add `content_mode` to the INSERT:

```sql
INSERT INTO distribution_rules
    (name, report_id, report_ids, delivery_method, recipients, save_path,
     format, schedule_type, schedule_time, schedule_day_of_week,
     schedule_day_of_month, enabled, include_ai_summary, content_mode)
VALUES (%s, %s, %s::jsonb, %s, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s)
RETURNING *
```

Add `cleaned['content_mode']` to the parameter tuple (after `cleaned['include_ai_summary']`).

- [ ] **Step 3: Update UPDATE SQL**

In the PUT handler (around line 330), add `content_mode` to the UPDATE:

```sql
UPDATE distribution_rules SET
    name = %s, report_id = %s, report_ids = %s::jsonb,
    delivery_method = %s,
    recipients = %s::jsonb, save_path = %s, format = %s,
    schedule_type = %s, schedule_time = %s,
    schedule_day_of_week = %s, schedule_day_of_month = %s,
    enabled = %s, include_ai_summary = %s, content_mode = %s, updated_at = NOW()
WHERE id = %s
RETURNING *
```

Add `cleaned['content_mode']` to the parameter tuple (after `cleaned['include_ai_summary']`, before `rule_id`).

- [ ] **Step 4: Commit**

```bash
git add backend/distribution_bp.py
git commit -m "feat: validate and store content_mode in distribution rules

Accepts report_only, report_with_ai, ai_only.
Derives include_ai_summary for backward compatibility.
Rejects ai_only + disk delivery."
```

---

### Task 6: Backend — AI-only email rendering in distribution engine

**Files:**
- Modify: `backend/distribution_engine.py:2682-2775` (execute flow), `2426-2520` (email template)

- [ ] **Step 1: Add AI-only email template function**

Add a new function near `_build_email_html` (after line 2520):

```python
def _build_ai_only_email_html(report_names, from_dt, to_dt, ai_summary_html):
    """Build email HTML for AI-only distribution (no report attachments).

    Uses the same professional styling as report emails but without
    attachment references.
    """
    names = ', '.join(report_names) if isinstance(report_names, list) else report_names
    period_from = from_dt.strftime('%d %b %Y, %I:%M %p')
    period_to = to_dt.strftime('%d %b %Y, %I:%M %p')

    # Load logos (same logic as _build_email_html)
    logo_html = _get_logo_html()  # reuse existing helper

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Logo bar -->
  <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:16px 24px;">
    {logo_html}
  </td></tr>

  <!-- Title -->
  <tr><td style="padding:24px 24px 8px;text-align:center;">
    <h1 style="margin:0;font-size:20px;color:#0f172a;">AI Insights</h1>
    <p style="margin:4px 0 0;font-size:13px;color:#64748b;">{_esc(names)}</p>
    <div style="margin:12px auto 0;width:60px;height:3px;background:linear-gradient(90deg,#0ea5e9,#6366f1);border-radius:2px;"></div>
  </td></tr>

  <!-- Period -->
  <tr><td style="padding:12px 24px;">
    <table width="100%" style="background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:10px 16px;font-size:12px;color:#64748b;">Period</td>
      <td style="padding:10px 16px;font-size:12px;color:#0f172a;text-align:right;">{period_from} — {period_to}</td>
    </tr>
    </table>
  </td></tr>

  <!-- AI Summary (main content) -->
  <tr><td style="padding:8px 24px 24px;">
    {ai_summary_html}
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
    <p style="margin:0;font-size:11px;color:#94a3b8;">
      Generated by Hercules AI &bull; Automated insights from your plant data
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>"""
```

**Note:** `_esc` and `_get_logo_html` are existing helper functions in `distribution_engine.py`. If `_get_logo_html` doesn't exist as a standalone function, extract the logo HTML block from `_build_email_html` (lines 2449-2459) into a shared helper.

- [ ] **Step 2: Update `execute_distribution_rule` for content_mode**

In `execute_distribution_rule` (around line 2684), replace the `include_ai_summary` check:

**Old (line 2684):**
```python
        if rule.get('include_ai_summary'):
```

**New:**
```python
        content_mode = rule.get('content_mode', 'report_only')
        # Backward compat: old rules without content_mode but with include_ai_summary
        if content_mode == 'report_only' and rule.get('include_ai_summary'):
            content_mode = 'report_with_ai'

        need_ai = content_mode in ('report_with_ai', 'ai_only')
        need_reports = content_mode in ('report_only', 'report_with_ai')

        ai_summary_text = None
        if need_ai:
```

Then update the report rendering section (around lines 2719-2758). Wrap it in `if need_reports:`:
```python
        if need_reports:
            # ... existing report rendering code (PDF/HTML/XLSX generation) ...
            # ... existing AI injection into reports ...
```

For the email sending section (around lines 2774-2775), add the AI-only branch:
```python
        if content_mode == 'ai_only':
            # AI-only email — no attachments
            ai_html = _format_summary_html(ai_summary_text) if ai_summary_text else '<p>No insights available for this period.</p>'
            email_html = _build_ai_only_email_html(
                report_names, from_dt, to_dt, ai_html
            )
            # Send email without attachments
            _send_email(
                recipients=rule.get('recipients', []),
                subject=f"AI Insights — {', '.join(report_names)}",
                html_body=email_html,
                attachments=[],  # no report files
            )
        else:
            # Existing logic: build email with report attachment
            # ... (existing email building + optional AI prepend) ...
```

- [ ] **Step 3: Commit**

```bash
git add backend/distribution_engine.py
git commit -m "feat: AI-only email distribution mode

content_mode='ai_only' sends clean AI insights email with no PDF/HTML
attachments. Uses professional email template with period info and
styled AI summary card."
```

---

### Task 7: Frontend — content mode selector + i18n

**Files:**
- Modify: `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx:392-410`
- Modify: `Frontend/src/i18n/en.json`, `ar.json`, `hi.json`, `ur.json`

- [ ] **Step 1: Replace toggle with 3-option select**

In `DistributionRuleEditor.jsx`, replace the AI Summary toggle (lines 392–410) with a select dropdown:

```jsx
{/* Content Mode */}
<div className="flex-1 min-w-[160px]">
  <label className="block text-[10px] text-zinc-400 mb-1">
    {t('distribution.contentMode', 'Email Content')}
  </label>
  <select
    className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-white"
    value={form.content_mode || 'report_only'}
    onChange={e => set('content_mode', e.target.value)}
    disabled={e.target?.value === 'ai_only' && !aiSetupComplete}
  >
    <option value="report_only">{t('distribution.reportOnly', 'Reports Only')}</option>
    <option value="report_with_ai">{t('distribution.reportWithAi', 'Reports + AI Summary')}</option>
    <option value="ai_only" disabled={!aiSetupComplete}>
      {t('distribution.aiOnly', 'AI Insights Only')}
    </option>
  </select>
  {form.content_mode === 'ai_only' && (
    <p className="text-[9px] text-cyan-400 mt-1">
      {t('distribution.aiOnlyHint', 'Email will contain AI analysis only, no report attachments')}
    </p>
  )}
</div>
```

Also update `EMPTY_RULE` (line 12–25) to include `content_mode`:
```javascript
const EMPTY_RULE = {
  // ... existing fields ...
  include_ai_summary: false,
  content_mode: 'report_only',
};
```

When `content_mode` is `'ai_only'`, disable the format selector (PDF/Excel/HTML is irrelevant):
```jsx
<select
  className="..."
  value={form.format}
  onChange={e => set('format', e.target.value)}
  disabled={form.content_mode === 'ai_only'}
>
```

And force email delivery when `ai_only` (disk makes no sense):
```jsx
// In the delivery method onChange:
onChange={e => {
  set('delivery_method', e.target.value);
  // ai_only forces email
  if (form.content_mode === 'ai_only' && e.target.value === 'disk') {
    set('delivery_method', 'email');
  }
}}
```

- [ ] **Step 2: Add i18n keys to all 4 language files**

`en.json`:
```json
"distribution.contentMode": "Email Content",
"distribution.reportOnly": "Reports Only",
"distribution.reportWithAi": "Reports + AI Summary",
"distribution.aiOnly": "AI Insights Only",
"distribution.aiOnlyHint": "Email will contain AI analysis only, no report attachments"
```

`ar.json`:
```json
"distribution.contentMode": "محتوى البريد الإلكتروني",
"distribution.reportOnly": "التقارير فقط",
"distribution.reportWithAi": "التقارير + ملخص AI",
"distribution.aiOnly": "تحليل AI فقط",
"distribution.aiOnlyHint": "سيحتوي البريد على تحليل AI فقط، بدون مرفقات التقارير"
```

`hi.json`:
```json
"distribution.contentMode": "ईमेल सामग्री",
"distribution.reportOnly": "केवल रिपोर्ट",
"distribution.reportWithAi": "रिपोर्ट + AI सारांश",
"distribution.aiOnly": "केवल AI विश्लेषण",
"distribution.aiOnlyHint": "ईमेल में केवल AI विश्लेषण होगा, कोई रिपोर्ट अटैचमेंट नहीं"
```

`ur.json`:
```json
"distribution.contentMode": "ای میل مواد",
"distribution.reportOnly": "صرف رپورٹس",
"distribution.reportWithAi": "رپورٹس + AI خلاصہ",
"distribution.aiOnly": "صرف AI تجزیہ",
"distribution.aiOnlyHint": "ای میل میں صرف AI تجزیہ ہوگا، کوئی رپورٹ اٹیچمنٹ نہیں"
```

- [ ] **Step 3: Commit**

```bash
git add Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx Frontend/src/i18n/en.json Frontend/src/i18n/ar.json Frontend/src/i18n/hi.json Frontend/src/i18n/ur.json
git commit -m "feat: content mode selector in distribution rule editor

Three options: Reports Only, Reports + AI Summary, AI Insights Only.
AI-only disables format selector and forces email delivery.
All 4 languages updated."
```

---

## Phase 3: AI-Generated Charts (Tasks 8–12)

### Task 8: Create `ai_chart_generator.py` — chart rendering engine

**Problem:** AI insights are text-only. Plant managers want visual charts showing production bars, equipment status, and rate comparisons. Charts must render as PNG images server-side (emails can't run JavaScript).

**Design decisions:**
- **matplotlib with Agg backend** — no GUI needed, works in PyInstaller, no extra runtime
- **`eventlet.tpool.execute()`** — matplotlib uses C extensions that deadlock with eventlet's monkey-patched threading. All chart generation MUST run in a real OS thread via tpool.
- **CID inline attachments** — Gmail strips base64 `data:` URLs completely. We use `<img src="cid:chart_0">` with MIME Content-ID headers.
- **Max 3 charts per email** — keep email size reasonable (~150KB per chart at 150 DPI)
- **150 DPI, 600px wide** — optimal for email clients (Outlook, Gmail, Apple Mail)
- **Rule-based selection** — tag classification already tells us what type each tag is. No LLM needed for chart decisions.

**Files:**
- Create: `backend/ai_chart_generator.py`

- [ ] **Step 1: Create the chart generator module**

```python
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
        label = profile.get('label') or tag_name
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/ai_chart_generator.py
git commit -m "feat: AI chart generator — production bars, equipment status, rate comparison

Rule-based chart selection using tag classification.
matplotlib with Agg backend, 150 DPI, email-optimized sizing.
eventlet.tpool wrapper to avoid C extension deadlocks."
```

---

### Task 9: Embed charts in distribution emails via CID

**Problem:** Charts must be embedded in emails as inline images. Gmail strips base64 `data:` URLs, so we use CID (Content-ID) inline attachments — `<img src="cid:chart_0">` with MIME parts.

**Files:**
- Modify: `backend/distribution_engine.py` (chart generation call + email embedding)

- [ ] **Step 1: Add chart HTML builder**

Add near the other formatting functions (after `_format_summary_html`):

```python
def _build_chart_html(charts):
    """Build email-safe HTML for chart images using CID references.

    Args:
        charts: list of {'title': str, 'cid': str} dicts
    Returns:
        HTML string with <img src="cid:..."> tags
    """
    if not charts:
        return ''

    parts = ['<table width="100%" cellpadding="0" cellspacing="0" '
             'style="margin:16px 0;">']
    for chart in charts:
        parts.append(f'''<tr><td style="padding:8px 0;text-align:center;">
  <p style="margin:0 0 4px;font-size:11px;font-weight:bold;color:#0f172a;">{_esc(chart['title'])}</p>
  <img src="cid:{chart['cid']}" alt="{_esc(chart['title'])}"
       style="max-width:100%;height:auto;border:1px solid #e2e8f0;border-radius:6px;" />
</td></tr>''')
    parts.append('</table>')
    return '\n'.join(parts)
```

- [ ] **Step 2: Add CID attachments to email sending**

The existing `_send_email` function (or `report_mailer.send_email`) needs to support MIME inline attachments. Add a helper:

```python
def _add_cid_images(msg, charts):
    """Attach chart PNG images as CID inline parts to a MIMEMultipart message.

    Args:
        msg: email.mime.multipart.MIMEMultipart object
        charts: list of {'cid': str, 'image_bytes': bytes} dicts
    """
    from email.mime.image import MIMEImage

    for chart in charts:
        img = MIMEImage(chart['image_bytes'], _subtype='png')
        img.add_header('Content-ID', f'<{chart["cid"]}>')
        img.add_header('Content-Disposition', 'inline',
                       filename=f'{chart["cid"]}.png')
        msg.attach(img)
```

- [ ] **Step 3: Call chart generator in `execute_distribution_rule`**

In `execute_distribution_rule`, after the AI summary is generated (after the `_generate_ai_summary` call), add chart generation:

```python
        # Generate charts (after AI summary, before email)
        ai_charts = []
        if need_ai and ai_summary_text:
            try:
                import ai_chart_generator
                ai_charts = ai_chart_generator.generate_charts_safe(
                    tag_data=all_tag_data,
                    prev_tag_data=prev_tag_data,  # need to collect this
                    profiles=profile_map,
                    report_names=report_names,
                    from_dt=from_dt,
                    to_dt=to_dt,
                )
            except Exception as e:
                logger.warning("Chart generation skipped: %s", e)
```

When building the email body, insert chart HTML after the AI summary:
```python
        if ai_charts:
            chart_html = _build_chart_html(ai_charts)
            # Insert charts after AI summary in email
            email_html = email_html.replace('</td></tr>\n<!-- Footer -->', 
                                            f'{chart_html}</td></tr>\n<!-- Footer -->')
```

When sending the email, pass charts for CID attachment:
```python
        # In the email sending section, after building the MIME message:
        if ai_charts:
            _add_cid_images(msg, ai_charts)
```

**Note:** The exact integration point depends on how `report_mailer.send_email` works. If it builds the MIME message internally, we need to either:
(a) Pass `charts` as a parameter and attach inside, or
(b) Build the MIME message in `execute_distribution_rule` and pass to a lower-level send function.

Review `report_mailer.py` during implementation to determine the cleanest approach.

- [ ] **Step 4: Collect previous-period data for charts**

In `execute_distribution_rule`, the chart generator needs `prev_tag_data`. This may already be collected if we upgraded `_generate_ai_summary` in Task 1. If not, add collection alongside the current tag data:

```python
        # Collect previous period data (for both AI summary and charts)
        prev_tag_data = {}
        if need_ai:
            period_duration = to_dt - from_dt
            prev_to = from_dt
            prev_from = prev_to - period_duration
            for rname, lc in all_layout_configs.items():
                tags = extract_all_tags_from_layout(lc)
                if tags:
                    prev_vals = _fetch_tag_data_multi_agg(lc, tags, prev_from, prev_to)
                    prev_tag_data.update(prev_vals or {})
```

- [ ] **Step 5: Commit**

```bash
git add backend/distribution_engine.py
git commit -m "feat: embed AI charts in distribution emails via CID inline images

Charts rendered as PNG, attached as MIME inline parts with Content-ID.
Gmail-compatible (no base64 data: URLs).
Graceful fallback — chart failure never blocks email delivery."
```

---

### Task 10: Add chart preview endpoint

**Files:**
- Modify: `backend/hercules_ai_bp.py` (new endpoint)
- Modify: `Frontend/src/API/herculesAIApi.js` (new function)

- [ ] **Step 1: Add `/hercules-ai/preview-charts` endpoint**

In `backend/hercules_ai_bp.py`, add after the insights endpoint (after line ~1164):

```python
@hercules_ai_bp.route('/hercules-ai/preview-charts', methods=['POST'])
@login_required
def preview_charts():
    """Generate chart previews for selected reports and time range.

    Body: { report_ids?: int[], from: ISO8601, to: ISO8601 }
    Returns: { charts: [{ title: str, image_base64: str }] }
    """
    import base64

    data = request.get_json(silent=True) or {}
    from_str = data.get('from')
    to_str = data.get('to')
    if not from_str or not to_str:
        return jsonify({'error': 'from and to are required'}), 400

    try:
        from_dt = datetime.fromisoformat(from_str.replace('Z', '+00:00'))
        to_dt = datetime.fromisoformat(to_str.replace('Z', '+00:00'))
    except (ValueError, TypeError) as e:
        return jsonify({'error': f'Invalid date format: {e}'}), 400

    # Load config
    conn = _get_conn()
    with closing(conn.cursor(cursor_factory=RealDictCursor)) as cur:
        cur.execute("SELECT key, value FROM hercules_ai_config")
        ai_config = {r['key']: r['value'] for r in cur.fetchall()}

    # Load templates (same logic as insights endpoint)
    report_ids = data.get('report_ids')
    # ... (same template loading as generate_insights, lines 957-963) ...

    # Extract tags, fetch data (same as insights endpoint)
    # ... (reuse the data collection logic) ...

    # Load tag profiles
    profiles = {}
    with closing(conn.cursor(cursor_factory=RealDictCursor)) as cur:
        cur.execute("SELECT tag_name, label, tag_type, line_name FROM hercules_ai_tag_profiles WHERE is_tracked = true")
        for row in cur.fetchall():
            profiles[row['tag_name']] = row

    # Generate charts
    try:
        import ai_chart_generator
        charts = ai_chart_generator.generate_charts_safe(
            tag_data=all_tag_data,
            prev_tag_data=prev_tag_data,
            profiles=profiles,
            report_names=[t['name'] for t in templates],
            from_dt=from_dt,
            to_dt=to_dt,
        )
    except Exception as e:
        return jsonify({'error': f'Chart generation failed: {e}'}), 500

    # Convert bytes to base64 for JSON response (browser can display base64)
    result = []
    for chart in charts:
        result.append({
            'title': chart['title'],
            'image_base64': base64.b64encode(chart['image_bytes']).decode('ascii'),
        })

    return jsonify({'charts': result})
```

**Implementation note:** The data collection logic (template loading, tag extraction, data fetching, profile loading) is duplicated from `generate_insights`. During implementation, extract shared data collection into a helper function `_collect_insights_data(data)` that both endpoints call. This avoids copy-paste.

- [ ] **Step 2: Add API function**

In `Frontend/src/API/herculesAIApi.js`, add:

```javascript
  previewCharts: (data) => api.post('/api/hercules-ai/preview-charts', data),
```

- [ ] **Step 3: Commit**

```bash
git add backend/hercules_ai_bp.py Frontend/src/API/herculesAIApi.js
git commit -m "feat: chart preview endpoint + API helper

POST /api/hercules-ai/preview-charts returns base64 chart images.
Browser display uses base64 (fine for previews, only emails need CID)."
```

---

### Task 11: Frontend — chart preview in Insights hub

**Files:**
- Modify: `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx`

- [ ] **Step 1: Add chart preview section below insights cards**

After the insights results display (around line 415), add a chart preview section:

```jsx
{/* Chart Preview Section */}
{insightsResult && (
  <div className="mt-6">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
        <span className="text-cyan-400">📊</span> Chart Preview
      </h3>
      <button
        onClick={loadCharts}
        disabled={loadingCharts}
        className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-white disabled:opacity-50"
      >
        {loadingCharts ? 'Generating...' : 'Generate Charts'}
      </button>
    </div>

    {chartError && (
      <p className="text-xs text-red-400 mb-2">{chartError}</p>
    )}

    {charts && charts.length > 0 && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {charts.map((chart, i) => (
          <div key={i} className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
            <p className="text-xs font-medium text-zinc-300 mb-2">{chart.title}</p>
            <img
              src={`data:image/png;base64,${chart.image_base64}`}
              alt={chart.title}
              className="w-full rounded border border-zinc-700"
            />
          </div>
        ))}
      </div>
    )}

    {charts && charts.length === 0 && (
      <p className="text-xs text-zinc-500">No charts to generate — need counter, boolean, or rate tags.</p>
    )}
  </div>
)}
```

Add state and handler:
```jsx
const [charts, setCharts] = useState(null);
const [loadingCharts, setLoadingCharts] = useState(false);
const [chartError, setChartError] = useState(null);

const loadCharts = async () => {
  setLoadingCharts(true);
  setChartError(null);
  try {
    const res = await herculesAIApi.previewCharts({
      report_ids: activeIds,
      from: dateRange.from,
      to: dateRange.to,
    });
    setCharts(res.data?.charts || []);
  } catch (err) {
    setChartError(err.response?.data?.error || 'Chart generation failed');
  } finally {
    setLoadingCharts(false);
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx
git commit -m "feat: chart preview in AI Insights hub

Generate Charts button produces production bars, equipment status,
and rate comparison charts. Displayed as base64 images in a grid."
```

---

### Task 12: PyInstaller + requirements updates

**Files:**
- Modify: `backend/hercules.spec`
- Modify: `backend/requirements.txt`
- Modify: `backend/requirements-railway.txt`

- [ ] **Step 1: Add matplotlib and ai_chart_generator to PyInstaller**

In `backend/hercules.spec`, add to `hiddenimports` (after `'ai_prompts'`):
```python
    'ai_chart_generator',
    'matplotlib',
    'matplotlib.backends.backend_agg',
```

Also verify that the existing `collect_all('matplotlib')` call in the spec handles matplotlib's data files. If not present, add it to the `datas` section.

- [ ] **Step 2: Add matplotlib to both requirements files**

In `backend/requirements.txt`, add:
```
matplotlib>=3.7
```

In `backend/requirements-railway.txt`, add:
```
matplotlib>=3.7
```

- [ ] **Step 3: Commit**

```bash
git add backend/hercules.spec backend/requirements.txt backend/requirements-railway.txt
git commit -m "build: add matplotlib to requirements and PyInstaller config

Required for server-side AI chart generation.
Added to both desktop and Railway requirements."
```

---

## Final: Push all changes

- [ ] **Push to both branches**

```bash
git push origin Salalah_Mill_B
git checkout main && git merge Salalah_Mill_B && git push origin main
git checkout Salalah_Mill_B
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| **1: Bug Fixes** | Tasks 1–3 | `ai_prompts.py` (DRY), DB rate limiting, max_tokens bump |
| **2: AI-Only Distribution** | Tasks 4–7 | `content_mode` column, AI-only email template, frontend selector, i18n |
| **3: AI Charts** | Tasks 8–12 | `ai_chart_generator.py`, CID email embedding, preview endpoint, frontend grid |

**Total new files:** 3 (`ai_prompts.py`, `ai_chart_generator.py`, migration SQL)
**Total modified files:** ~16 (backend, frontend, config, i18n)
