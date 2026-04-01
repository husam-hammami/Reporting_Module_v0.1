# Hercules AI Phase 2 — Plan
**Date**: 2026-04-01
**Branch**: `Salalah_Mill_B` (then merge to `main`)

## Overview

Three features to enhance the Hercules AI system:

1. **AI-Only Insights Distribution** — Send emails with only AI analysis, no report attachments
2. **AI-Generated Charts** — AI analyzes data and produces chart visualizations in emails/reports
3. **Bug fixes** — Rate limiting persistence, prompt deduplication

---

## Feature 1: AI-Only Insights Distribution

### Problem
Currently, distribution rules always attach report PDFs/HTML. The AI summary is prepended to the email body but is optional. Users want the option to send **only** the AI analysis — a lightweight daily insight email without heavy PDF attachments.

### Solution
Add a new delivery content option to distribution rules: `content_mode` with three values:
- `report_only` (current default) — attach reports, no AI summary
- `report_with_ai` (current `include_ai_summary=true`) — attach reports + AI summary at top
- `ai_only` — AI summary only, no report attachment

### Backend Changes

**`backend/distribution_bp.py`:**
- Add `content_mode` to `_validate_rule()` with validation: `('report_only', 'report_with_ai', 'ai_only')`
- Add to INSERT and UPDATE SQL
- Keep `include_ai_summary` column for backward compatibility (derive from `content_mode`)

**`backend/migrations/add_distribution_content_mode.sql`:**
```sql
ALTER TABLE distribution_rules
    ADD COLUMN IF NOT EXISTS content_mode VARCHAR(20) DEFAULT 'report_only';

-- Backfill: existing rules with include_ai_summary=true become 'report_with_ai'
UPDATE distribution_rules SET content_mode = 'report_with_ai'
    WHERE include_ai_summary = true AND content_mode = 'report_only';
```

**`backend/distribution_engine.py`:**
- Modify `execute_distribution_rule()`:
  - If `content_mode == 'ai_only'`:
    - Skip report rendering (no PDF/HTML generation)
    - Generate AI summary as the main email body
    - Use a dedicated email template (clean, no "attached report" language)
    - Still respect `delivery_method` (email only — disk doesn't make sense for AI-only)
  - If `content_mode == 'report_with_ai'`:
    - Current behavior (report + AI prepended)
  - If `content_mode == 'report_only'`:
    - Current behavior without AI (default)

**`backend/hercules_ai_bp.py`:**
- No changes needed — the AI provider and summary generation are already reusable

### Frontend Changes

**`Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx`:**
- Replace the `include_ai_summary` toggle with a 3-option radio/select:
  - "Reports Only" (default)
  - "Reports + AI Summary"
  - "AI Insights Only"
- When "AI Insights Only" is selected:
  - Show info text: "Email will contain AI analysis only, no report attachments"
  - Disable format selector (pdf/html/xlsx — not applicable)
  - Disable disk delivery option (AI-only is email-only)

**i18n** (all 4 languages):
- `distribution.contentMode` — "Email Content"
- `distribution.reportOnly` — "Reports Only"
- `distribution.reportWithAi` — "Reports + AI Summary"
- `distribution.aiOnly` — "AI Insights Only"
- `distribution.aiOnlyHint` — "Email will contain AI analysis only, no report attachments"

### Migration Order
- Add `add_distribution_content_mode.sql` to `MIGRATION_ORDER` in `init_db.py`, `app.py`, and `desktop/main.js`

---

## Feature 2: AI-Generated Charts

### Problem
The AI summary is text-only. Plant managers want visual insights — charts showing trends, comparisons, anomalies. Currently, charts exist only in the report builder (manually configured). The AI should auto-generate relevant charts based on its analysis.

### Solution
AI analyzes the data, decides which charts are meaningful, and generates chart configurations. These are rendered as images (server-side using matplotlib or Chart.js via headless browser) and embedded in the email.

### Approach: Server-Side Chart Generation

**Why server-side**: Emails can't run JavaScript. Charts must be rendered as PNG images and embedded as inline attachments (CID) or base64 in the email HTML.

**Library**: `matplotlib` (already Python, no extra runtime needed, works in PyInstaller)

### Backend Changes

**`backend/ai_chart_generator.py`** (new file):
```python
def generate_ai_charts(tag_data, profiles, report_names, from_dt, to_dt):
    """
    Given tag data and AI profiles, generate chart images.
    Returns list of: { 'title': str, 'image_base64': str, 'description': str }
    """
```

**Chart types to auto-generate:**
1. **Production Bar Chart** — Total production per counter tag (bars, one per line)
2. **Equipment Status Timeline** — Boolean tags as colored bands (green=on, red=off)
3. **Rate Comparison** — Grouped bar chart comparing rates across lines
4. **Anomaly Highlight** — Any value >2 std dev from mean gets a red dot on a line chart

**Decision logic** (rule-based, not LLM):
- If there are counter tags → generate Production Bar Chart
- If there are boolean tags → generate Equipment Status Timeline
- If there are rate tags across multiple lines → generate Rate Comparison
- If any tag has anomalous values → generate Anomaly Highlight
- Maximum 3 charts per email (to keep email size reasonable)

**Why rule-based for chart selection**: LLM is slow and expensive for deciding chart types. The tag classification already tells us what type each tag is. Simple rules are faster and more reliable.

**Optional LLM enhancement**: After generating charts, ask LLM to write a one-line caption for each chart. This adds context without the cost of having LLM decide the chart type.

**`backend/distribution_engine.py`:**
- After `_generate_ai_summary()`, call `generate_ai_charts()` if `content_mode` is `'report_with_ai'` or `'ai_only'`
- Embed chart images in email HTML as base64 `<img>` tags
- Charts appear below the AI summary text, before the report attachment

**`backend/requirements.txt` + `requirements-railway.txt`:**
- Add `matplotlib` (already available in most Python installations)

**`backend/hercules.spec`:**
- Add `matplotlib` to `hiddenimports` if needed (PyInstaller usually auto-detects it)

### Frontend Changes

**`Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx`:**
- Add a "Charts" section to the preview:
  - "Preview Charts" button alongside "Preview Summary"
  - Shows generated chart images in a grid

**`backend/hercules_ai_bp.py`:**
- New endpoint: `POST /hercules-ai/preview-charts`
  - Same data flow as preview-summary
  - Returns `{ charts: [{ title, image_base64, description }] }`

### Email Layout (AI-Only mode with charts)
```
┌──────────────────────────────────────┐
│  Hercules AI Insights                │
│  Line A Daily Report — 2026-04-01    │
│                                      │
│  **Production**: 5,000 tons          │
│  **Status**: All equipment running   │
│  **Alerts**: None                    │
│                                      │
│  ┌────────────────────────────┐      │
│  │  [Production Bar Chart]    │      │
│  │  Total output per line     │      │
│  └────────────────────────────┘      │
│                                      │
│  ┌────────────────────────────┐      │
│  │  [Equipment Status]        │      │
│  │  All lines operational     │      │
│  └────────────────────────────┘      │
│                                      │
│  Generated by Hercules AI            │
└──────────────────────────────────────┘
```

---

## Feature 3: Bug Fixes & Improvements

### 3a. Persistent Rate Limiting
**Problem**: Rate limit counter is per-process (`_ai_call_count` in module scope). Resets on restart. Multiple workers track independently.

**Fix**:
- Store daily call count in `hercules_ai_config` table: key `daily_call_count`, value `{ "date": "2026-04-01", "count": 42 }`
- Check and increment atomically in `_generate_ai_summary()`
- Remove the in-process `_ai_call_count` / `_ai_call_date` variables

### 3b. DRY Prompt Template
**Problem**: AI summary prompt is duplicated in `hercules_ai_bp.py` (preview) and `distribution_engine.py` (actual send).

**Fix**:
- Create `backend/ai_prompts.py` with `build_summary_prompt(report_names, from_dt, to_dt, data_rows)` function
- Both `preview_summary()` and `_generate_ai_summary()` call this function
- Future prompt changes only need to be made in one place

### 3c. UTC Rate Limit Reset
**Problem**: Rate limit resets at midnight local time instead of UTC.

**Fix**: Use `datetime.utcnow().date()` instead of `datetime.now().date()`

---

## Implementation Order

| Phase | Task | Files | Effort |
|-------|------|-------|--------|
| 1 | Bug fixes (3a, 3b, 3c) | ai_prompts.py, distribution_engine.py, hercules_ai_bp.py | Small |
| 2 | AI-Only Distribution (Feature 1) | distribution_bp.py, distribution_engine.py, DistributionRuleEditor.jsx, migration, i18n | Medium |
| 3 | AI Charts (Feature 2) | ai_chart_generator.py, distribution_engine.py, hercules_ai_bp.py, HerculesAISetup.jsx | Large |

### Dependencies
- Feature 1 depends on the `include_ai_summary` fix (already done)
- Feature 2 depends on Feature 1 (needs `content_mode` to know when to generate charts)
- Bug fixes are independent and should be done first

---

## Testing Checklist

### Feature 1: AI-Only Insights
- [ ] Create rule with `content_mode = 'ai_only'` → email has AI summary, no attachment
- [ ] Create rule with `content_mode = 'report_with_ai'` → email has both
- [ ] Create rule with `content_mode = 'report_only'` → email has report only (no AI)
- [ ] Verify backward compatibility: existing rules with `include_ai_summary=true` become `report_with_ai`
- [ ] Verify `ai_only` disables disk delivery and format selection in UI
- [ ] Verify email HTML is clean and readable in Outlook, Gmail, Apple Mail

### Feature 2: AI Charts
- [ ] Production bar chart generates correctly for counter tags
- [ ] Equipment status timeline generates for boolean tags
- [ ] Charts render as base64 images in email
- [ ] Charts appear in preview on Hercules AI setup page
- [ ] Maximum 3 charts per email enforced
- [ ] Charts render correctly in email clients (Outlook, Gmail)
- [ ] matplotlib works in PyInstaller frozen build
- [ ] Chart generation doesn't block email if it fails (graceful degradation)

### Feature 3: Bug Fixes
- [ ] Rate limit persists across app restarts
- [ ] Rate limit shared across instances (if applicable)
- [ ] Prompt changes in ai_prompts.py reflect in both preview and distribution
- [ ] Rate limit resets at UTC midnight

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| matplotlib adds 50-80MB to PyInstaller bundle | Larger installer/OTA | Accept it — numpy likely already bundled; matplotlib is lightest server-side option |
| LLM generates bad chart captions | Misleading email content | Captions are optional — chart titles from rule-based logic are primary |
| AI-only emails with no data | Empty/useless email sent | Check for data before generating — skip if all tags are N/A |
| Gmail strips base64 images | Charts not visible | Use CID inline attachments (`<img src="cid:chart1">`) not base64. Add text description fallback |
| matplotlib + eventlet deadlock | Chart generation hangs silently | Use `matplotlib.use('Agg')` before import, run in `eventlet.tpool.execute()` for real OS threads |
| Rate limit DB query adds latency | Slower email distribution | Single query, cached for the day, negligible impact |
| Arabic/Urdu RTL in chart labels | matplotlib renders RTL text incorrectly | Use English-only labels in charts, or use display_name field which is typically English |

---

## Review Notes (from code review)

### Critical items to address during implementation:

1. **matplotlib + eventlet**: Must call `matplotlib.use('Agg')` before any matplotlib import. Chart generation must run in `eventlet.tpool.execute()` to avoid deadlocks with eventlet's monkey-patched threading.

2. **Email images**: Use CID inline attachments (`<img src="cid:chart1">`), NOT base64 `data:` URLs. Gmail strips base64 images completely. Attach chart PNGs as MIME parts with Content-ID headers.

3. **AI-only email template**: The existing `_build_email_html()` has hardcoded "attached report" language. Need a new `_build_ai_only_email_html()` function or a template parameter to skip attachment-related text.

4. **Migration lists**: `app.py` has `_run_startup_migrations` with its own migration list (not `MIGRATION_ORDER`). Update migration lists in THREE places: `init_db.py`, `app.py` `_run_startup_migrations`, and `desktop/main.js`.

5. **PyInstaller spec**: Add `ai_prompts`, `ai_chart_generator` to `hiddenimports`. Add `matplotlib.backends.backend_agg` explicitly. Verify matplotlib data files are bundled.

6. **`ai_only` + disk delivery**: UI disables disk delivery when `ai_only` selected. Backend validation rejects `delivery_method='disk'` when `content_mode='ai_only'`. Backend silently skips disk save if both somehow set.

7. **Chart dimensions**: Use 150 DPI at 600px wide for email compatibility. Set explicitly in matplotlib figure creation.

8. **Rate limit atomicity**: Use `SELECT ... FOR UPDATE` or `UPDATE ... RETURNING` pattern to prevent race conditions between concurrent distribution workers.

9. **UTC rate limit**: Use `datetime.now(timezone.utc).date()` (not deprecated `datetime.utcnow()`).

10. **Prompt function signature**: `build_summary_prompt()` should accept `report_names: list[str]` and handle both single and multiple report names (preview uses single, distribution uses list).
