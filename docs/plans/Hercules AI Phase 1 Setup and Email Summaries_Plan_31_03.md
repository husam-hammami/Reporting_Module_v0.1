# Hercules AI — Full Phase 1 Implementation Plan

## Context

Hercules needs an AI layer ("Hercules AI") that generates smart report summaries, detects downtime, benchmarks production rates, and balances line output. This plan covers the complete Phase 1: setup page + email summaries + distribution toggle — shipped together so users get immediate value.

**User journey:** Admin scans reports → reviews tags → marks complete → next distribution email includes an AI summary. Complete cycle, immediate ROI.

---

## Scope — Phase 1 (shipped together)

1. AI Setup page — scan, classify, review, confirm tags
2. Email summary generation — AI paragraph at top of distribution emails
3. Toggle on Distribution Rules — "Include AI Summary: On/Off"
4. Post-setup confirmation — show what Hercules AI learned
5. New-report notification — sidebar badge when unscanned reports exist

---

## UX Decisions

### User-Friendly Type Labels (no jargon)

| Internal type | User-facing label | Badge color |
|---|---|---|
| `counter` | Production Total | Blue |
| `rate` | Flow Rate | Cyan |
| `boolean` | On/Off | Amber |
| `percentage` | Percentage | Green |
| `analog` | Measurement | Purple |
| `setpoint` | Setting | Gray |
| `id_selector` | Selector | Indigo |
| `unknown` | Unclassified | Muted gray |

### Page Subtitle
"Hercules AI learns your plant from your reports. Review its understanding so it can summarize reports, detect downtime, and track performance."

### Post-Setup Confirmation Card
After "Mark Setup Complete", Zone 1 transforms into a summary:
```
✓ Hercules AI is active
Tracking 128 tags across 4 lines:
  Mill A — 32 tags (24 production totals, 5 flow rates, 3 on/off)
  Mill B — 28 tags (18 production totals, 6 flow rates, 4 measurements)
  FCL — 18 tags (8 production totals, 4 flow rates, 6 measurements)
  Pasta — 12 tags (3 production totals, 3 flow rates, 6 selectors)

Enable "Include AI Summary" on your distribution rules to start receiving insights.
```

### New-Report Badge
- Backend: `GET /hercules-ai/status` returns `unseen_reports_count` by comparing `report_builder_templates.updated_at` against `last_scan_at`
- Frontend: sidebar nav item shows a small number badge when `unseen_reports_count > 0`
- Setup page top bar shows: "2 new reports since last scan. [Scan Now]"

### Preview Summary (before any distribution runs)
After setup complete, a "Preview Summary" button appears. Calls a new endpoint that:
1. Picks the most recent report template with tracked tags
2. Fetches last 24h of historian data for those tags
3. Generates a sample AI summary
4. Displays it in a card on the setup page

This proves the system works without waiting for the next scheduled distribution.

---

## Backend

### 1. Migration: `backend/migrations/create_hercules_ai_tables.sql`

```sql
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
);

CREATE TABLE IF NOT EXISTS hercules_ai_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hai_profiles_line ON hercules_ai_tag_profiles(line_name);
CREATE INDEX IF NOT EXISTS idx_hai_profiles_reviewed ON hercules_ai_tag_profiles(is_reviewed);
CREATE INDEX IF NOT EXISTS idx_hai_profiles_tracked ON hercules_ai_tag_profiles(is_tracked);

-- Reuse trigger from create_tags_tables.sql
CREATE TRIGGER update_hai_profiles_modtime
    BEFORE UPDATE ON hercules_ai_tag_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hai_config_modtime
    BEFORE UPDATE ON hercules_ai_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2. Migration: `backend/migrations/add_ai_summary_to_distribution.sql`

```sql
ALTER TABLE distribution_rules
    ADD COLUMN IF NOT EXISTS include_ai_summary BOOLEAN DEFAULT false;
```

Both added to `MIGRATION_ORDER` in `backend/init_db.py`.

Config keys (inserted on first load):
- `setup_completed` → `{"value": false}`
- `last_scan_at` → `{"value": null}`
- `production_value_per_ton` → `{"value": 0, "currency": "USD"}`
- `llm_api_key` → `{"value": ""}` (entered by admin on setup page)
- `llm_model` → `{"value": "claude-haiku-4-5-20251001"}`

GET `/hercules-ai/config` returns flattened: `{"setup_completed": false, "llm_api_key": "", ...}`
PUT `/hercules-ai/config` accepts: `{"llm_api_key": "sk-ant-..."}` — stored in DB, not in code.

### 3. Blueprint: `backend/hercules_ai_bp.py`

Uses `_get_db_connection()` from `report_builder_bp.py` pattern (checks both `'app'` and `'__main__'`).
All routes with `@login_required`.
Scan protected with `_scan_in_progress` flag + try/finally (409 if running).

**Routes:**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/hercules-ai/scan` | Auto-scan: extract tags from templates + classify + check data |
| GET | `/hercules-ai/profiles` | List all profiles grouped by line_name with counts |
| PUT | `/hercules-ai/profiles/bulk` | Bulk update — transaction, all-or-nothing |
| PUT | `/hercules-ai/profiles/<int:id>` | Update single profile by ID |
| GET | `/hercules-ai/config` | Get global config (flattened) |
| PUT | `/hercules-ai/config` | Update config entries |
| GET | `/hercules-ai/status` | Status: setup_completed, tags counts, last_scan_at, unseen_reports_count |
| POST | `/hercules-ai/preview-summary` | Generate a sample AI summary from most recent report data |

### 4. Scanner Logic (`POST /hercules-ai/scan`)

**Step 1 — Extract tags using existing code:**
- Import `extract_all_tags` from `distribution_engine.py` (DO NOT reimplement)
- Handles: tag cells, formula tags, group tags, mapping cells, silo widgets, series, summaries

**Step 2 — Extract labels/context (enrichment layer):**
- Walk `paginatedSections[]`: pair static ID cells with tag cells for label mapping
- Walk KPI rows: `kpi.label` → `kpi.tagName`
- Walk headers: `statusLabel` → `statusTagName`
- Walk widgets: `config.title` → `dataSource.tagName`
- Derive `line_name`: header `title` (priority) → template `name` (fallback)
- Derive `category`: section `label` field
- Store all report appearances in `evidence.reports[]`

**Step 3 — Load tag metadata:**
- Query `tags`: tag_name, display_name, unit, data_type, is_counter, is_active, source_type

**Step 4 — Classify (rule-based):**
- `is_counter=true` + unit in (kg, t, ton, lb) → `counter` 0.95
- `is_counter=true` → `counter` 0.85
- `data_type=BOOL` → `boolean` 0.90
- unit `%` → `percentage` 0.85
- unit in (t/h, kg/h, l/min, m3/h) → `rate` 0.90
- unit in (°C, °F, K) → `analog` 0.90
- unit in (bar, psi, kPa, mbar) → `analog` 0.90
- unit in (rpm, A, V, kW, kWh) → `analog` 0.80-0.85
- tag name contains "selected"/"running"/"emptying" + BOOL → `boolean` 0.80
- tag name contains "id"/"bin" at word boundary → `id_selector` 0.70
- Else → `unknown` 0.30

**Step 5 — Data availability (JOIN through tags):**
```sql
SELECT t.tag_name, COUNT(a.id) as reading_count
FROM tags t LEFT JOIN tag_history_archive a ON a.tag_id = t.id
  AND a.archive_hour > NOW() - INTERVAL '30 days'
WHERE t.is_active = true GROUP BY t.tag_name
```
- \>1000 → `active`, 1-1000 → `sparse`, 0 → `empty`

**Step 6 — Multi-report tags:** Store all in `evidence.reports[]`, use first header-bearing template for line_name.

**Step 7 — Orphaned profiles:** Tag deleted from `tags` → set `data_status='deleted'`, `is_tracked=false`.

**Step 8 — UPSERT (protect user corrections):**
```sql
INSERT INTO hercules_ai_tag_profiles (..., source) VALUES (..., 'auto')
ON CONFLICT (tag_name) DO UPDATE SET label=EXCLUDED.label, ...
WHERE hercules_ai_tag_profiles.source = 'auto';
```

**Step 9 — Error handling:** try/except per template, return scan results with errors.

**Step 10 — Update `last_scan_at` config.**

### 5. Preview Summary Endpoint (`POST /hercules-ai/preview-summary`)

1. Check `setup_completed` and `llm_api_key` exist
2. Pick first report template that has tracked tags
3. Fetch last 24h of historian data for those tags via existing `/historian/by-tags` query logic
4. Build context: tag labels, types, values, line names from `hercules_ai_tag_profiles`
5. Call Claude API with the prompt (see section 7)
6. Return `{"summary": "...", "report_name": "...", "tags_used": 12}`

### 6. Email Summary Integration (`backend/distribution_engine.py`)

In `execute_rule()`, after report data is computed:

```python
if rule.get('include_ai_summary'):
    try:
        summary = _generate_ai_summary(report_name, tag_data, time_range)
        if summary:
            body_html = _prepend_summary_to_email(summary, body_html)
    except Exception as e:
        logger.warning("AI summary generation failed, sending without: %s", e)
```

`_generate_ai_summary()`:
1. Load tracked profiles from `hercules_ai_tag_profiles` for tags in this report
2. Build structured context (label, type, value, line_name for each tag)
3. Load API key from `hercules_ai_config`
4. If no key → return None (skip silently)
5. Call Claude API with 10-second timeout
6. On timeout/error → return None (never block email delivery)
7. Generate ONE summary per distribution rule (not per report)

### 7. LLM Prompt & Configuration

**Package:** Add `anthropic` to `requirements.txt`. Graceful import:
```python
try:
    import anthropic
    _HAS_ANTHROPIC = True
except ImportError:
    _HAS_ANTHROPIC = False
```

**Model:** `claude-haiku-4-5-20251001` (cheapest, fastest). Configurable via `hercules_ai_config.llm_model`.

**Prompt template:**
```
You are a production report summarizer for a manufacturing plant.
Given the following data from the "{report_name}" report covering {time_from} to {time_to}:

{structured_data_table}

Each row shows: Tag Label | Type | Value | Unit | Line

Write a 2-4 sentence summary for plant managers.

Rules:
- ONLY reference numbers that appear in the data above. Never calculate or infer new numbers.
- Lead with the most important production metric (largest total, key output).
- Mention at most 2 anomalies (values that are zero when expected, unusually high or low).
- Use simple language. No technical jargon.
- If a "Production Total" shows zero during what should be a production period, mention it as possible downtime.
- Maximum 120 words.
- Do not use markdown formatting. Plain text only.
```

**Cost:** ~$0.001/call with Haiku. 10 daily rules = $3.65/year. Negligible.

**Timeout:** 10 seconds hard limit. On failure, email sends without summary.

### 8. Register in `backend/app.py`

- Import (line ~41): `from hercules_ai_bp import hercules_ai_bp`
- Register (line ~265): `app.register_blueprint(hercules_ai_bp, url_prefix='/api')`
- Add to `backend/hercules.spec` hiddenimports: `'hercules_ai_bp'`
- Add `'anthropic'` to hiddenimports (graceful — won't fail if missing)

---

## Frontend

### 9. API Layer: `Frontend/src/API/herculesAIApi.js`

```js
import axios from './axios';
const BASE = '/api/hercules-ai';
export const herculesAIApi = {
  scan:            ()          => axios.post(`${BASE}/scan`),
  getProfiles:     ()          => axios.get(`${BASE}/profiles`),
  bulkUpdate:      (profiles)  => axios.put(`${BASE}/profiles/bulk`, { profiles }),
  updateProfile:   (id, data)  => axios.put(`${BASE}/profiles/${id}`, data),
  getConfig:       ()          => axios.get(`${BASE}/config`),
  updateConfig:    (data)      => axios.put(`${BASE}/config`, data),
  getStatus:       ()          => axios.get(`${BASE}/status`),
  previewSummary:  ()          => axios.post(`${BASE}/preview-summary`),
};
```

### 10. Setup Page: `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx`

Settings page (not wizard). Adapts based on state:

#### State A: First Visit (no scan done)
```
┌──────────────────────────────────────────────────────────────┐
│  Hercules AI                                                 │
│  Learn your plant from your reports. Review its              │
│  understanding so it can summarize reports, detect           │
│  downtime, and track performance.                            │
│                                                              │
│        ┌─────────────────────┐                               │
│        │   Scan My Reports   │                               │
│        └─────────────────────┘                               │
│                                                              │
│  Hercules AI will read your report templates to              │
│  understand which tags matter and what they measure.         │
└──────────────────────────────────────────────────────────────┘
```

#### State B: Scan Done, Reviewing
Three zones as previously designed:

**Zone 1 — Top Bar**
- Status: "146 tags · 128 confirmed · 12 pending · 6 excluded"
- Progress bar (green/amber/gray)
- "Scan Reports" button + last scanned timestamp
- If unseen reports: "2 new reports since last scan. [Scan Now]"

**Zone 2 — Filter/Action Bar**
- Pill tabs: All | Pending | Confirmed | Excluded (with counts)
- Line dropdown + search
- Bulk bar (when checkboxes selected): [Confirm] [Exclude] [Set Type ▾]

**Zone 3 — Tag List (grouped by line)**
- Collapsible cards per line. Pending groups expanded, confirmed collapsed.
- Search auto-expands matching groups.
- "Other Tags — Not in Reports" at bottom, collapsed.

**Tag row:**
```
☑ | mil_b_b1_totalizer | B1 Totalizer | [Production Total] | ●●● | ✓ | kg | MIL-B
```

**Expanded row:**
- "Hercules AI classified this as: Production Total. Reason: counter flag set, unit=kg"
- Type pill buttons: Production Total | Flow Rate | Measurement | On/Off | Percentage | Setting | Selector | Unclassified
- Label input + notes input
- [Confirm] [Exclude] [Cancel]

**Bottom:**
- API Key input field (masked, with show/hide toggle): "Claude API Key (required for AI summaries)"
- [Mark Setup Complete] button
- "You can return anytime to update."

#### State C: Setup Complete
Zone 1 transforms into confirmation card:
```
┌──────────────────────────────────────────────────────────────┐
│  ✓ Hercules AI is active                      [Edit Setup]  │
│                                                              │
│  Tracking 128 tags across 4 lines:                           │
│  Mill A — 32 tags · Mill B — 28 tags                         │
│  FCL — 18 tags · Pasta — 12 tags                             │
│                                                              │
│  [Preview Summary]  Enable "Include AI Summary" on your      │
│                     distribution rules to receive insights.  │
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Preview: "Mill B produced 24,500 kg total. B1 Totalizer ││
│  │ contributed 12,300 kg (50%). No downtime detected.       ││
│  │ Data quality: 98%."                                      ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```
- "Edit Setup" returns to State B (review mode)
- "Preview Summary" calls the preview endpoint and shows result
- Below: tag list still visible but read-only unless "Edit Setup" clicked

### 11. Distribution Rule Toggle

**`Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx`:**
- Add toggle: "Include AI Summary" (maps to `include_ai_summary`)
- Place after format selector
- If Hercules AI setup not complete: toggle disabled, tooltip: "Complete Hercules AI setup first"
- Default: off
- Add `include_ai_summary: false` to `EMPTY_RULE` constant

### 12. Sidebar Badge

**`Frontend/src/Components/Common/SideNav.jsx`:**
- For the Hercules AI nav item, fetch `GET /hercules-ai/status` on mount
- If `unseen_reports_count > 0`, show a small number badge on the nav item
- Refresh on navigation (not polling)

### 13. Navigation: `Frontend/src/Data/Navbar.js`

```js
{ name: t('nav.herculesAI'), icon: Sparkles, link: '/hercules-ai', roles: [Roles.Admin] }
```

After Distribution in nav order.

### 14. Route: `Frontend/src/Routes/AppRoutes.jsx`

```jsx
<Route path="hercules-ai" element={
  <ProtectedRoute roles={[Roles.Admin]}><HerculesAISetup /></ProtectedRoute>
} />
```

### 15. i18n — All 4 Locale Files

~45 keys per file:
```
nav.herculesAI, nav.tooltip.herculesAI

herculesAI.title, herculesAI.subtitle
herculesAI.scanButton, herculesAI.scanMyReports, herculesAI.scanning, herculesAI.lastScanned
herculesAI.firstVisit.description, herculesAI.firstVisit.explanation

herculesAI.status.confirmed, .pending, .excluded, .tags, .active, .tracking
herculesAI.newReports (e.g. "{count} new reports since last scan")

herculesAI.filter.all, .pending, .confirmed, .excluded
herculesAI.allLines, herculesAI.search
herculesAI.selectAll, herculesAI.deselectAll, herculesAI.selected
herculesAI.bulk.confirm, .exclude, .setType

herculesAI.type.counter ("Production Total"), .rate ("Flow Rate"), .boolean ("On/Off"),
  .percentage ("Percentage"), .analog ("Measurement"), .setpoint ("Setting"),
  .id_selector ("Selector"), .unknown ("Unclassified")

herculesAI.confidence.high, .medium, .low
herculesAI.expand.classified, .reason
herculesAI.confirm, .exclude, .cancel
herculesAI.label, .tagName, .unit, .source, .notes
herculesAI.unassigned, .unassignedDesc

herculesAI.apiKey, herculesAI.apiKeyHint
herculesAI.markComplete, .editSetup, .saved
herculesAI.scanFirst, .noTemplates, .noTemplatesHint

herculesAI.dataStatus.active, .sparse, .empty, .deleted

herculesAI.preview, .previewButton, .previewLoading, .previewError, .previewNoData
herculesAI.complete.title, .complete.tracking, .complete.enableHint

distribution.includeAISummary, distribution.aiSummaryDisabledHint
```

---

## Files to Create
- `backend/migrations/create_hercules_ai_tables.sql`
- `backend/migrations/add_ai_summary_to_distribution.sql`
- `backend/hercules_ai_bp.py`
- `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx`
- `Frontend/src/API/herculesAIApi.js`

## Files to Modify
- `backend/init_db.py` — add both migrations to MIGRATION_ORDER
- `backend/app.py` — import + register hercules_ai_bp
- `backend/hercules.spec` — add `'hercules_ai_bp'`, `'anthropic'` to hiddenimports
- `backend/distribution_engine.py` — add `_generate_ai_summary()` + call in `execute_rule()`
- `backend/requirements.txt` — add `anthropic`
- `Frontend/src/Routes/AppRoutes.jsx` — add /hercules-ai route
- `Frontend/src/Data/Navbar.js` — add nav item
- `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx` — add AI summary toggle + EMPTY_RULE update
- `Frontend/src/Components/Common/SideNav.jsx` — add badge for unseen reports
- `Frontend/src/i18n/en.json` — add ~45 keys
- `Frontend/src/i18n/ar.json` — add ~45 keys
- `Frontend/src/i18n/hi.json` — add ~45 keys
- `Frontend/src/i18n/ur.json` — add ~45 keys

## Key Patterns to Reuse
- `report_builder_bp.py` → `_get_db_connection()` (checks 'app' + '__main__')
- `distribution_bp.py` → `_ensure_table()` guard pattern
- `distribution_engine.py` → `extract_all_tags()` (DO NOT reimplement)
- `smtp_config.py` → pattern for obfuscated/stored API keys
- `ShiftsSettings.jsx` / `SystemSettings.jsx` → card container, form patterns
- `DistributionPage.jsx` → dark mode theme, search/filter tabs
- `DistributionRuleEditor.jsx` → toggle switch pattern, EMPTY_RULE constant

## Implementation Order
1. Migration SQL (both files) + init_db.py
2. Backend blueprint — scan + CRUD + config + preview-summary endpoints
3. Register in app.py + hercules.spec
4. `anthropic` in requirements.txt
5. Distribution engine — `_generate_ai_summary()` + integration in `execute_rule()`
6. Frontend API layer
7. Setup page (all 3 states: first visit, reviewing, complete)
8. Distribution rule toggle + EMPTY_RULE
9. Sidebar badge
10. Route + nav
11. i18n (all 4 files)

## Verification
1. `python app.py` — both tables created, no import errors
2. `POST /api/hercules-ai/scan` — populates profiles from templates
3. `GET /api/hercules-ai/profiles` — tags grouped by line with labels + types
4. `GET /api/hercules-ai/status` — correct counts + unseen_reports_count
5. Open `/hercules-ai` — shows first-visit state
6. Click "Scan My Reports" → tags appear grouped by line
7. Expand tag → change type → Confirm → persists on reload
8. Bulk select → Confirm All → all updated
9. Re-scan → user corrections survive
10. Enter API key → Mark Setup Complete → confirmation card appears
11. Click "Preview Summary" → sample AI summary displayed
12. Open Distribution → edit rule → "Include AI Summary" toggle visible
13. If setup not complete → toggle disabled with hint
14. Run distribution rule with AI summary on → email has summary paragraph at top
15. API call fails/times out → email sends without summary (no error to user)
16. Add new report template → sidebar shows badge → re-scan picks up new tags
