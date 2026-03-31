# Hercules AI — Complete Implementation Plan (All Phases)

## Vision

Hercules AI turns raw PLC data into actionable plant intelligence. It auto-learns from report templates, classifies tags, and delivers value through three phases:

1. **Phase 1 — Smart Summaries**: AI-generated report summaries in distribution emails
2. **Phase 2 — Downtime Detection & Alerts**: Automatic downtime detection, anomaly alerts, push notifications
3. **Phase 3 — Production Analytics Dashboard**: Trends, period comparison, line balancing, efficiency tracking

Each phase builds on the previous. Phase 1 creates the foundation (tag profiles, LLM integration). Phase 2 adds the analysis worker. Phase 3 adds the visual dashboard.

---

## Phase 1 — Setup + Email Summaries

**User journey:** Admin scans reports → reviews tags → marks complete → next distribution email includes an AI summary.

### Scope

1. AI Setup page — scan, classify, review, confirm tags
2. Email summary generation — AI paragraph at top of distribution emails
3. Toggle on Distribution Rules — "Include AI Summary: On/Off"
4. Post-setup confirmation — show what Hercules AI learned
5. New-report notification — sidebar badge when unscanned reports exist

### UX Decisions

#### User-Friendly Type Labels (no jargon)

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

#### Page Subtitle
"Hercules AI learns your plant from your reports. Review its understanding so it can summarize reports, detect downtime, and track performance."

#### Post-Setup Confirmation Card
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

#### New-Report Badge
- Backend: `GET /hercules-ai/status` returns `unseen_reports_count` by comparing `report_builder_templates.updated_at` against `last_scan_at`
- Frontend: sidebar nav item shows a small number badge when `unseen_reports_count > 0`
- Setup page top bar shows: "2 new reports since last scan. [Scan Now]"

#### Preview Summary (before any distribution runs)
After setup complete, a "Preview Summary" button appears. Calls a new endpoint that:
1. Picks the most recent report template with tracked tags
2. Fetches last 24h of historian data for those tags
3. Generates a sample AI summary
4. Displays it in a card on the setup page

This proves the system works without waiting for the next scheduled distribution.

---

### Backend — Phase 1

#### 1. Migration: `backend/migrations/create_hercules_ai_tables.sql`

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

#### 2. Migration: `backend/migrations/add_ai_summary_to_distribution.sql`

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

#### 3. Blueprint: `backend/hercules_ai_bp.py`

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

#### 4. Scanner Logic (`POST /hercules-ai/scan`)

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

#### 5. Preview Summary Endpoint (`POST /hercules-ai/preview-summary`)

1. Check `setup_completed` and `llm_api_key` exist
2. Pick first report template that has tracked tags
3. Fetch last 24h of historian data for those tags via existing `/historian/by-tags` query logic
4. Build context: tag labels, types, values, line names from `hercules_ai_tag_profiles`
5. Call Claude API with the prompt (see section 7)
6. Return `{"summary": "...", "report_name": "...", "tags_used": 12}`

#### 6. Email Summary Integration (`backend/distribution_engine.py`)

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

#### 7. LLM Prompt & Configuration

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

#### 8. Register in `backend/app.py`

- Import (line ~41): `from hercules_ai_bp import hercules_ai_bp`
- Register (line ~265): `app.register_blueprint(hercules_ai_bp, url_prefix='/api')`
- Add to `backend/hercules.spec` hiddenimports: `'hercules_ai_bp'`
- Add `'anthropic'` to hiddenimports (graceful — won't fail if missing)

---

### Frontend — Phase 1

#### 9. API Layer: `Frontend/src/API/herculesAIApi.js`

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

#### 10. Setup Page: `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx`

Settings page (not wizard). Adapts based on state:

**State A: First Visit (no scan done)**
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

**State B: Scan Done, Reviewing**

Zone 1 — Top Bar:
- Status: "146 tags · 128 confirmed · 12 pending · 6 excluded"
- Progress bar (green/amber/gray)
- "Scan Reports" button + last scanned timestamp
- If unseen reports: "2 new reports since last scan. [Scan Now]"

Zone 2 — Filter/Action Bar:
- Pill tabs: All | Pending | Confirmed | Excluded (with counts)
- Line dropdown + search
- Bulk bar (when checkboxes selected): [Confirm] [Exclude] [Set Type ▾]

Zone 3 — Tag List (grouped by line):
- Collapsible cards per line. Pending groups expanded, confirmed collapsed.
- Search auto-expands matching groups.
- "Other Tags — Not in Reports" at bottom, collapsed.

Tag row:
```
☑ | mil_b_b1_totalizer | B1 Totalizer | [Production Total] | ●●● | ✓ | kg | MIL-B
```

Expanded row:
- "Hercules AI classified this as: Production Total. Reason: counter flag set, unit=kg"
- Type pill buttons: Production Total | Flow Rate | Measurement | On/Off | Percentage | Setting | Selector | Unclassified
- Label input + notes input
- [Confirm] [Exclude] [Cancel]

Bottom:
- API Key input field (masked, with show/hide toggle): "Claude API Key (required for AI summaries)"
- [Mark Setup Complete] button
- "You can return anytime to update."

**State C: Setup Complete**
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

#### 11. Distribution Rule Toggle

**`Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx`:**
- Add toggle: "Include AI Summary" (maps to `include_ai_summary`)
- Place after format selector
- If Hercules AI setup not complete: toggle disabled, tooltip: "Complete Hercules AI setup first"
- Default: off
- Add `include_ai_summary: false` to `EMPTY_RULE` constant

#### 12. Sidebar Badge

**`Frontend/src/Components/Common/SideNav.jsx`:**
- For the Hercules AI nav item, fetch `GET /hercules-ai/status` on mount
- If `unseen_reports_count > 0`, show a small number badge on the nav item
- Refresh on navigation (not polling)

#### 13. Navigation: `Frontend/src/Data/Navbar.js`

```js
{ name: t('nav.herculesAI'), icon: Sparkles, link: '/hercules-ai', roles: [Roles.Admin] }
```

After Distribution in nav order.

#### 14. Route: `Frontend/src/Routes/AppRoutes.jsx`

```jsx
<Route path="hercules-ai" element={
  <ProtectedRoute roles={[Roles.Admin]}><HerculesAISetup /></ProtectedRoute>
} />
```

#### 15. i18n — All 4 Locale Files

~45 keys per file (nav, setup page, status, filters, types, badges, config, preview, distribution toggle).

### Phase 1 — Files

**Create:**
- `backend/migrations/create_hercules_ai_tables.sql`
- `backend/migrations/add_ai_summary_to_distribution.sql`
- `backend/hercules_ai_bp.py`
- `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx`
- `Frontend/src/API/herculesAIApi.js`

**Modify:**
- `backend/init_db.py` — add both migrations to MIGRATION_ORDER
- `backend/app.py` — import + register hercules_ai_bp
- `backend/hercules.spec` — add `'hercules_ai_bp'`, `'anthropic'` to hiddenimports
- `backend/distribution_engine.py` — add `_generate_ai_summary()` + call in `execute_rule()`
- `backend/requirements.txt` — add `anthropic`
- `Frontend/src/Routes/AppRoutes.jsx` — add /hercules-ai route
- `Frontend/src/Data/Navbar.js` — add nav item
- `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx` — add AI summary toggle + EMPTY_RULE update
- `Frontend/src/Components/Common/SideNav.jsx` — add badge for unseen reports
- `Frontend/src/i18n/en.json`, `ar.json`, `hi.json`, `ur.json` — add ~45 keys each

### Phase 1 — Implementation Order

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

### Phase 1 — Verification

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

---

## Phase 2 — Downtime Detection & Smart Alerts

**Depends on:** Phase 1 complete (tag profiles classified, LLM integration working)

**User journey:** Hercules AI continuously monitors tracked tags in the background. When it detects downtime, anomalies, or data quality issues, it sends alert emails and shows notifications in-app. Plant managers get proactive notifications without checking dashboards.

### Scope

1. Analysis worker — background thread that runs every hour, analyzes tag data
2. Alert rules — configurable thresholds per line or tag type
3. Alert history — log of all detected events with timestamps
4. Email alerts — immediate notification emails when critical events detected
5. In-app notification bell — alert count badge in header bar
6. Alert settings — admin configures which alerts are active, recipients, thresholds

### How Downtime Detection Works

**Data source:** `tag_history_archive` table — hourly aggregated data already computed by `dynamic_archive_worker`

**Detection logic for production counters (`is_counter=true`):**
```sql
-- Find hours where ALL production counters on a line had zero delta
SELECT p.line_name, a.archive_hour,
       COUNT(*) AS counter_tags,
       COUNT(*) FILTER (WHERE COALESCE(a.value_delta, 0) = 0) AS zero_tags
FROM hercules_ai_tag_profiles p
JOIN tags t ON t.tag_name = p.tag_name
JOIN tag_history_archive a ON a.tag_id = t.id
WHERE p.tag_type = 'counter' AND p.is_tracked = true
  AND a.archive_hour >= NOW() - INTERVAL '24 hours'
GROUP BY p.line_name, a.archive_hour
HAVING COUNT(*) FILTER (WHERE COALESCE(a.value_delta, 0) = 0) = COUNT(*)
ORDER BY p.line_name, a.archive_hour
```

**Consecutive zero hours = downtime window:**
- 1 hour zero delta → not reported (could be break/changeover)
- 2+ consecutive hours zero delta on same line → downtime event
- Configurable minimum: `min_downtime_hours` (default: 2)

**Downtime event structure:**
```json
{
  "type": "downtime",
  "line_name": "Mill B",
  "started_at": "2026-03-31T02:00:00",
  "ended_at": "2026-03-31T06:00:00",
  "duration_hours": 4,
  "affected_tags": ["mil_b_b1_totalizer", "mil_b_b2_totalizer"],
  "severity": "warning"
}
```

### Anomaly Detection

**Type 1 — Stale data (no readings):**
- Tag has `data_status='active'` but no new rows in `tag_history_archive` for 2+ hours
- Indicates PLC communication loss or sensor failure
- Severity: `critical`

**Type 2 — Value out of range:**
- For `analog` and `rate` tags: compute rolling 7-day mean and standard deviation from archive
- Value > mean + 3σ or < mean - 3σ → anomaly
- Only for tags with 100+ hourly readings (enough data for statistics)
- Severity: `warning`

**Type 3 — Counter reset spike:**
- Counter tag `value_delta` in a single hour > 10x the 7-day hourly average
- Could indicate meter malfunction or unexpected restart
- Severity: `info`

**Type 4 — Quality degradation:**
- Count of `quality_code != 'GOOD'` readings in `tag_history` exceeds 10% of hour
- Indicates unstable PLC communication
- Severity: `warning`

### Backend — Phase 2

#### Migration: `backend/migrations/create_hercules_ai_alerts.sql`

```sql
CREATE TABLE IF NOT EXISTS hercules_ai_alerts (
    id SERIAL PRIMARY KEY,
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',
    line_name VARCHAR(100) DEFAULT '',
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    details JSONB DEFAULT '{}',
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    duration_minutes INTEGER,
    is_read BOOLEAN DEFAULT false,
    is_dismissed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hercules_ai_alert_rules (
    id SERIAL PRIMARY KEY,
    rule_type VARCHAR(50) NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}',
    recipients JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hai_alerts_type ON hercules_ai_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_hai_alerts_created ON hercules_ai_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hai_alerts_read ON hercules_ai_alerts(is_read) WHERE is_read = false;
```

**Default alert rules (seeded on first load):**
```json
[
  {
    "rule_type": "downtime",
    "is_enabled": true,
    "config": {"min_downtime_hours": 2, "check_interval_minutes": 60},
    "recipients": []
  },
  {
    "rule_type": "stale_data",
    "is_enabled": true,
    "config": {"max_gap_hours": 2},
    "recipients": []
  },
  {
    "rule_type": "anomaly",
    "is_enabled": false,
    "config": {"sigma_threshold": 3, "min_readings": 100},
    "recipients": []
  },
  {
    "rule_type": "quality",
    "is_enabled": false,
    "config": {"error_percent_threshold": 10},
    "recipients": []
  }
]
```

#### Worker: `backend/workers/hercules_ai_worker.py`

Background eventlet greenlet, similar pattern to `dynamic_archive_worker.py`.

**Main loop:**
1. Sleep for `check_interval_minutes` (default 60 min)
2. Check if `setup_completed` is true → skip if not
3. Load enabled alert rules from `hercules_ai_alert_rules`
4. For each enabled rule type, run detection query
5. Deduplicate: don't create alert if identical event already exists within last 4 hours
6. Insert new alerts into `hercules_ai_alerts`
7. For alerts with recipients: send email notification via existing `_send_email()` from distribution_engine
8. Use advisory lock (0x68616900/'hai\0') to prevent duplicate workers

**LLM-enhanced alert descriptions:**
- When creating a downtime alert, call Claude with context:
```
Line "{line_name}" had zero production for {duration} hours ({start} to {end}).
Tags affected: {tag_list_with_labels}
Last known values before downtime: {values}

Write 1-2 sentences describing this event for a plant manager.
Use simple language. State the facts only.
```
- 5-second timeout. On failure, use template: "{line_name} was down for {duration} hours."

#### New Blueprint Routes (added to `hercules_ai_bp.py`)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/hercules-ai/alerts` | List alerts, filterable by type/severity/line/read status, paginated |
| PUT | `/hercules-ai/alerts/<int:id>/read` | Mark alert as read |
| PUT | `/hercules-ai/alerts/read-all` | Mark all alerts as read |
| PUT | `/hercules-ai/alerts/<int:id>/dismiss` | Dismiss alert (hide from list) |
| GET | `/hercules-ai/alerts/unread-count` | Return count of unread alerts (for badge) |
| GET | `/hercules-ai/alert-rules` | List all alert rules |
| PUT | `/hercules-ai/alert-rules/<int:id>` | Update alert rule (enable/disable, config, recipients) |

#### Worker Registration in `app.py`

```python
# After existing worker starts (line ~1130)
from workers.hercules_ai_worker import hercules_ai_worker
eventlet.spawn(hercules_ai_worker)
```

### Frontend — Phase 2

#### Alert Bell (Header/TopBar)
- Notification bell icon in top bar (next to user menu)
- Shows unread count badge (red dot with number)
- Click opens dropdown panel with recent alerts
- Each alert: icon (color by severity) + title + time ago + line name
- "View All" link → opens `/hercules-ai/alerts`
- Mark as read on click

#### Alerts Page: `Frontend/src/Pages/HerculesAI/HerculesAIAlerts.jsx`
- List view of all alerts with filters: All | Downtime | Anomaly | Quality | Stale Data
- Filter by line, severity, date range
- Each alert card:
  ```
  ⚠ Mill B — Down for 4 hours                           Mar 31, 02:00–06:00
  Mill B had zero production output from 2am to 6am. B1 and B2 totalizers
  both showed no movement during this period.
                                                    [Mark Read] [Dismiss]
  ```
- Color coding: critical=red, warning=amber, info=blue

#### Alert Settings: section in `HerculesAISetup.jsx`
- Added below the tag review section (State C)
- Card per alert type with:
  - Enable/disable toggle
  - Threshold inputs (e.g., "Minimum downtime hours: [2]")
  - Recipients list (email addresses, reuse pattern from DistributionRuleEditor)
- Save button per card

#### Navigation Update
- Add `/hercules-ai/alerts` route
- Hercules AI nav item becomes a group with sub-items: Setup | Alerts
- Or: single nav item → setup page with tabs (Setup | Alerts | Analytics)

### Phase 2 — Files

**Create:**
- `backend/migrations/create_hercules_ai_alerts.sql`
- `backend/workers/hercules_ai_worker.py`
- `Frontend/src/Pages/HerculesAI/HerculesAIAlerts.jsx`

**Modify:**
- `backend/init_db.py` — add alerts migration
- `backend/hercules_ai_bp.py` — add alert routes + alert rule routes
- `backend/app.py` — spawn hercules_ai_worker
- `backend/hercules.spec` — add `'workers.hercules_ai_worker'` to hiddenimports
- `Frontend/src/API/herculesAIApi.js` — add alert endpoints
- `Frontend/src/Components/Common/TopBar.jsx` (or equivalent) — add alert bell
- `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx` — add alert settings section
- `Frontend/src/Routes/AppRoutes.jsx` — add /hercules-ai/alerts route
- `Frontend/src/i18n/*.json` — add ~30 alert-related keys each

### Phase 2 — Implementation Order

1. Migration (alerts + alert rules tables)
2. Worker — detection logic for all 4 alert types
3. Blueprint routes — alerts CRUD + alert rules
4. Worker registration in app.py + hercules.spec
5. Frontend API layer (alert endpoints)
6. Alert bell component in header
7. Alerts list page
8. Alert settings in setup page
9. Routes + nav updates
10. i18n (all 4 files)

### Phase 2 — Verification

1. Worker starts without errors, runs on schedule
2. Simulate downtime: stop PLC for 2+ hours → alert created
3. Alert email sent to configured recipients
4. Alert bell shows unread count
5. Click bell → see recent alerts in dropdown
6. Alerts page → filter by type/line works
7. Mark read / dismiss works
8. Alert rules: disable downtime → no more downtime alerts
9. Change threshold → new threshold respected
10. Worker respects advisory lock (no duplicates)
11. LLM description generated; fallback works if API fails

---

## Phase 3 — Production Analytics Dashboard

**Depends on:** Phase 1 (tag profiles) + Phase 2 (alert history for downtime data)

**User journey:** Plant manager opens the Hercules AI dashboard and sees production trends, line comparisons, efficiency metrics, and AI-generated insights — all without building custom reports. The dashboard auto-configures from tag profiles.

### Scope

1. Analytics dashboard page — auto-generated from tag profiles
2. Production overview — total output per line, today vs yesterday vs last week
3. Line comparison — side-by-side production across all lines
4. Trend charts — 7-day / 30-day production trends per line
5. Downtime summary — hours lost per line (from Phase 2 alerts)
6. Efficiency metrics — uptime %, production rate per hour
7. AI daily digest — LLM-generated daily summary of plant performance
8. Period comparison — this week vs last week, this month vs last month

### How Analytics Work

**All data comes from existing tables — no new data collection:**

| Metric | Source | Query |
|--------|--------|-------|
| Total production | `tag_history_archive` | `SUM(value_delta)` for counter tags per line per period |
| Production rate | `tag_history_archive` | `AVG(value)` for rate tags per line per hour |
| Uptime hours | `hercules_ai_alerts` | Total hours minus downtime hours from alerts |
| Uptime % | Computed | `(total_hours - downtime_hours) / total_hours * 100` |
| Period delta | Computed | `(this_period_total - last_period_total) / last_period_total * 100` |
| Trend direction | Computed | Linear regression slope over 7-day daily totals |

**Tag profiles drive everything:**
- Only `is_tracked=true` tags appear
- `tag_type='counter'` → production totals and efficiency
- `tag_type='rate'` → throughput charts
- `tag_type='boolean'` → running/stopped status
- `line_name` → grouping

### Backend — Phase 3

#### New Blueprint Routes (added to `hercules_ai_bp.py`)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/hercules-ai/analytics/overview` | Production totals per line for today, yesterday, this week, last week |
| GET | `/hercules-ai/analytics/trends` | Time-series data for production counters, grouped by line, bucketed by day |
| GET | `/hercules-ai/analytics/comparison` | Side-by-side line comparison for a given period |
| GET | `/hercules-ai/analytics/efficiency` | Uptime %, production per hour, downtime hours per line |
| GET | `/hercules-ai/analytics/digest` | AI-generated daily/weekly summary |
| GET | `/hercules-ai/analytics/period-compare` | Two periods compared: totals, deltas, % change per line |

#### Analytics Query: Overview (`GET /hercules-ai/analytics/overview`)

```python
def _get_production_overview():
    """Total production per line for multiple periods."""
    periods = {
        'today': (today_start, now),
        'yesterday': (yesterday_start, today_start),
        'this_week': (week_start, now),
        'last_week': (last_week_start, week_start),
        'this_month': (month_start, now),
        'last_month': (last_month_start, month_start),
    }

    # Get all tracked counter tags grouped by line
    counter_tags = _get_tracked_tags_by_line('counter')

    results = {}
    for period_name, (from_dt, to_dt) in periods.items():
        # SUM(value_delta) per line from tag_history_archive
        sql = """
            SELECT p.line_name, SUM(a.value_delta) as total
            FROM hercules_ai_tag_profiles p
            JOIN tags t ON t.tag_name = p.tag_name
            JOIN tag_history_archive a ON a.tag_id = t.id
            WHERE p.tag_type = 'counter' AND p.is_tracked = true
              AND a.archive_hour >= %s AND a.archive_hour < %s
              AND a.layout_id IS NULL
            GROUP BY p.line_name
        """
        results[period_name] = dict(cursor.fetchall())

    return results
```

**Response:**
```json
{
  "lines": ["Mill A", "Mill B", "FCL", "Pasta"],
  "periods": {
    "today": {"Mill A": 12500, "Mill B": 24300, "FCL": 8200, "Pasta": 5100},
    "yesterday": {"Mill A": 13100, "Mill B": 25000, "FCL": 7900, "Pasta": 4800},
    "this_week": {"Mill A": 85000, "Mill B": 168000, "FCL": 55000, "Pasta": 34000},
    "last_week": {"Mill A": 82000, "Mill B": 171000, "FCL": 53000, "Pasta": 35500}
  },
  "deltas": {
    "today_vs_yesterday": {"Mill A": -4.6, "Mill B": -2.8, "FCL": 3.8, "Pasta": 6.3},
    "this_week_vs_last": {"Mill A": 3.7, "Mill B": -1.8, "FCL": 3.8, "Pasta": -4.2}
  },
  "units": {"Mill A": "kg", "Mill B": "kg", "FCL": "kg", "Pasta": "kg"}
}
```

#### Analytics Query: Trends (`GET /hercules-ai/analytics/trends`)

```sql
-- Daily production totals per line for last 30 days
SELECT p.line_name, DATE_TRUNC('day', a.archive_hour) as day,
       SUM(a.value_delta) as daily_total
FROM hercules_ai_tag_profiles p
JOIN tags t ON t.tag_name = p.tag_name
JOIN tag_history_archive a ON a.tag_id = t.id
WHERE p.tag_type = 'counter' AND p.is_tracked = true
  AND a.archive_hour >= NOW() - INTERVAL '30 days'
  AND a.layout_id IS NULL
GROUP BY p.line_name, DATE_TRUNC('day', a.archive_hour)
ORDER BY p.line_name, day
```

**Response:** Time-series arrays per line, ready for Chart.js:
```json
{
  "Mill A": [{"date": "2026-03-01", "total": 13200}, {"date": "2026-03-02", "total": 12800}, ...],
  "Mill B": [...]
}
```

#### Analytics Query: Efficiency (`GET /hercules-ai/analytics/efficiency`)

```python
def _get_efficiency(from_dt, to_dt):
    total_hours = (to_dt - from_dt).total_seconds() / 3600

    # Get downtime hours per line from alerts
    downtime_sql = """
        SELECT line_name, SUM(duration_minutes) / 60.0 as downtime_hours
        FROM hercules_ai_alerts
        WHERE alert_type = 'downtime'
          AND started_at >= %s AND started_at < %s
        GROUP BY line_name
    """

    # Get production totals per line
    production = _get_production_for_period(from_dt, to_dt)

    results = {}
    for line in lines:
        downtime = downtime_hours.get(line, 0)
        uptime = total_hours - downtime
        results[line] = {
            'total_hours': total_hours,
            'uptime_hours': round(uptime, 1),
            'downtime_hours': round(downtime, 1),
            'uptime_percent': round(uptime / total_hours * 100, 1),
            'total_production': production.get(line, 0),
            'production_per_hour': round(production.get(line, 0) / max(uptime, 1), 1),
        }
    return results
```

#### Analytics Query: AI Digest (`GET /hercules-ai/analytics/digest`)

Generates a natural-language summary of the last 24h (or custom period). Uses Claude with a richer prompt:

```
You are a production analyst for a manufacturing plant.

Here is the plant's performance data for {period_label} ({from} to {to}):

PRODUCTION TOTALS (per line):
{line_totals_table}

COMPARISON TO PREVIOUS PERIOD:
{delta_table}

DOWNTIME EVENTS:
{downtime_list or "None detected"}

EFFICIENCY:
{efficiency_table}

Write a 3-5 sentence executive summary for the plant manager.

Rules:
- Lead with overall plant output and whether it's up or down vs. previous period.
- Mention the best and worst performing lines.
- Note any downtime events and their impact.
- If all lines are performing normally, say so briefly.
- Use simple language. No technical jargon.
- ONLY reference numbers from the data above.
- Maximum 150 words.
- Plain text only, no markdown.
```

**Cost:** One digest per day = ~$0.37/year with Haiku. Negligible.

### Frontend — Phase 3

#### Dashboard Page: `Frontend/src/Pages/HerculesAI/HerculesAIDashboard.jsx`

Uses existing chart components (`react-chartjs-2`, `chart.js`). Dark mode via `useTheme()` pattern from DistributionPage.

**Layout:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  Plant Performance                        [Today ▾] [This Week ▾]  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ AI Summary ────────────────────────────────────────────────────┐ │
│  │ "The plant produced 50,100 kg today, down 3% from yesterday.  │ │
│  │  Mill B led with 24,300 kg. FCL showed a 3.8% increase.       │ │
│  │  No downtime detected across any line."                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Mill A ──────┐  ┌─ Mill B ──────┐  ┌─ FCL ─────────┐  ┌─ Pasta │
│  │  12,500 kg    │  │  24,300 kg    │  │  8,200 kg     │  │  5,100 │
│  │  ▼ 4.6%       │  │  ▼ 2.8%       │  │  ▲ 3.8%       │  │  ▲ 6.3 │
│  │  vs yesterday │  │  vs yesterday │  │  vs yesterday │  │  vs ye │
│  └───────────────┘  └───────────────┘  └───────────────┘  └────────┘
│                                                                      │
│  ┌─ Production Trend (30 days) ────────────────────────────────────┐ │
│  │  [Line chart: daily totals per line, color-coded]               │ │
│  │  ████████████████████████████████████████████████████████████    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Line Comparison ──────────┐  ┌─ Efficiency ──────────────────┐ │
│  │  [Horizontal bar chart]     │  │  Mill A: 96.2% uptime         │ │
│  │  Mill B  ████████████ 48%   │  │  Mill B: 83.3% uptime (4h ↓) │ │
│  │  Mill A  ██████ 25%         │  │  FCL:    100% uptime          │ │
│  │  FCL     ████ 16%           │  │  Pasta:  100% uptime          │ │
│  │  Pasta   ███ 10%            │  │                                │ │
│  └─────────────────────────────┘  └────────────────────────────────┘ │
│                                                                      │
│  ┌─ Recent Alerts ────────────────────────────────────────────────┐ │
│  │  ⚠ Mill B down 4h (02:00–06:00)                    [View All] │ │
│  │  ✓ No other issues                                             │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

#### Dashboard Components

| Component | Chart type | Data source |
|-----------|-----------|-------------|
| AI Summary card | Text | `/hercules-ai/analytics/digest` |
| Line KPI cards | Numbers + delta % | `/hercules-ai/analytics/overview` |
| Production Trend | Line chart (Chart.js) | `/hercules-ai/analytics/trends` |
| Line Comparison | Horizontal bar | `/hercules-ai/analytics/overview` (this_week) |
| Efficiency table | Progress bars + text | `/hercules-ai/analytics/efficiency` |
| Recent Alerts | List (last 5) | `/hercules-ai/alerts?limit=5` |

#### Period Selector
- Dropdown in top-right: Today, Yesterday, This Week, Last Week, This Month, Last Month, Custom Range
- Changes all dashboard cards simultaneously
- Custom range: date picker (reuse from distribution rule editor)

#### Auto-Refresh
- Dashboard refreshes every 5 minutes (configurable)
- Small "Last updated: 2 min ago" indicator in header
- Manual refresh button

#### Navigation Update
- Hercules AI nav becomes expandable group:
  - Dashboard (`/hercules-ai` — default landing)
  - Alerts (`/hercules-ai/alerts`)
  - Setup (`/hercules-ai/setup`)
- Or: tab-based single page (simpler, fewer routes)

### Phase 3 — Files

**Create:**
- `Frontend/src/Pages/HerculesAI/HerculesAIDashboard.jsx`
- `Frontend/src/Pages/HerculesAI/components/ProductionCards.jsx`
- `Frontend/src/Pages/HerculesAI/components/TrendChart.jsx`
- `Frontend/src/Pages/HerculesAI/components/LineComparison.jsx`
- `Frontend/src/Pages/HerculesAI/components/EfficiencyTable.jsx`
- `Frontend/src/Pages/HerculesAI/components/AISummaryCard.jsx`
- `Frontend/src/Pages/HerculesAI/components/RecentAlerts.jsx`

**Modify:**
- `backend/hercules_ai_bp.py` — add 6 analytics routes
- `Frontend/src/API/herculesAIApi.js` — add analytics endpoints
- `Frontend/src/Routes/AppRoutes.jsx` — add /hercules-ai/dashboard, update /hercules-ai routing
- `Frontend/src/Data/Navbar.js` — update nav structure (sub-items or tabs)
- `Frontend/src/i18n/*.json` — add ~40 analytics keys each

### Phase 3 — Implementation Order

1. Backend analytics routes (overview, trends, comparison, efficiency, digest, period-compare)
2. Frontend API layer (analytics endpoints)
3. Dashboard page shell + period selector
4. KPI cards component (production totals + deltas)
5. AI Summary card component
6. Trend chart component (30-day line chart)
7. Line comparison component (bar chart)
8. Efficiency table component
9. Recent alerts component (reuses Phase 2 alert data)
10. Routes + nav restructure
11. i18n (all 4 files)

### Phase 3 — Verification

1. `/api/hercules-ai/analytics/overview` returns correct totals per line per period
2. Period deltas match manual calculation
3. Trends chart shows 30 days of daily data per line
4. Line comparison bar chart renders correctly
5. Efficiency shows correct uptime % (cross-check with Phase 2 alerts)
6. AI digest generates coherent summary referencing actual data
7. Period selector changes all cards
8. Dashboard renders correctly in dark mode
9. Auto-refresh updates data without page reload
10. Empty state: no data yet → helpful message, not errors
11. Single line plant → no comparison chart, just overview

---

## Phase Summary & Dependencies

```
Phase 1: Setup + Email Summaries
  ├── Tag profiles (foundation for everything)
  ├── LLM integration (reused in Phase 2 + 3)
  ├── Scanner (reused on re-scans)
  └── Distribution engine integration

Phase 2: Downtime Detection + Alerts (requires Phase 1)
  ├── Analysis worker (uses tag profiles from Phase 1)
  ├── Alert rules + history
  ├── Email alerts (uses LLM from Phase 1)
  └── In-app notifications

Phase 3: Analytics Dashboard (requires Phase 1 + 2)
  ├── Analytics queries (uses tag profiles from Phase 1)
  ├── Efficiency metrics (uses downtime data from Phase 2)
  ├── AI digest (uses LLM from Phase 1)
  └── Dashboard UI (uses chart components already in project)
```

## Key Patterns to Reuse (All Phases)

- `report_builder_bp.py` → `_get_db_connection()` (checks 'app' + '__main__')
- `distribution_bp.py` → `_ensure_table()` guard pattern
- `distribution_engine.py` → `extract_all_tags()` (DO NOT reimplement)
- `distribution_engine.py` → `_send_email()` for alert emails
- `dynamic_archive_worker.py` → worker pattern with advisory lock + eventlet sleep loop
- `smtp_config.py` → pattern for obfuscated/stored API keys
- `ShiftsSettings.jsx` / `SystemSettings.jsx` → card container, form patterns
- `DistributionPage.jsx` → dark mode theme, search/filter tabs, `useTheme()` hook
- `DistributionRuleEditor.jsx` → toggle switch pattern, EMPTY_RULE constant
- `DynamicLineChart.jsx` / `DynamicBarChart.jsx` → chart rendering (react-chartjs-2)
- `DynamicKPICards.jsx` → KPI card pattern with live values
