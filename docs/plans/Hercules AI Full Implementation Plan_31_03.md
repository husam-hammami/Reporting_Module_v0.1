# Hercules AI — Complete Implementation Plan (All Phases)

## Vision

Hercules AI turns raw PLC data into actionable plant intelligence. It auto-learns from report templates, classifies tags, and delivers value through three phases:

1. **Phase 1 — Smart Summaries**: AI-generated report summaries in distribution emails
2. **Phase 2 — Downtime Detection & Alerts**: Automatic downtime detection, anomaly alerts, push notifications
3. **Phase 3 — Production Analytics Dashboard**: Trends, period comparison, line balancing, efficiency tracking

Each phase builds on the previous. Phase 1 creates the foundation (tag profiles, LLM integration). Phase 2 adds the analysis worker. Phase 3 adds the visual dashboard.

---

## Phase 1 — Setup + Email Summaries

**User journey:** Admin scans reports → reviews tags → corrects any mistakes → marks complete → next distribution email includes an AI summary.

### Scope

1. AI Setup page — scan, classify, review, correct, confirm tags
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
- Frontend: Navbar.js adds `badge` field to nav item data; SideNav reads it and renders count
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

-- Reuse trigger from create_tags_tables.sql (runs first in MIGRATION_ORDER)
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

**CRITICAL: Both migrations MUST be appended to the END of `MIGRATION_ORDER` in `backend/init_db.py`** — they depend on `update_updated_at_column()` defined in `create_tags_tables.sql` which is first in the list.

```python
MIGRATION_ORDER = [
    # ... existing 21 entries ...
    'add_must_change_password.sql',       # last existing
    'create_hercules_ai_tables.sql',      # NEW — must be after create_tags_tables.sql
    'add_ai_summary_to_distribution.sql', # NEW — must be after create_distribution_rules_table.sql
]
```

Config keys (inserted on first load by `_ensure_config_defaults()`):
- `setup_completed` → `{"value": false}`
- `last_scan_at` → `{"value": null}`
- `production_value_per_ton` → `{"value": 0, "currency": "USD"}`
- `llm_api_key` → `{"value": ""}` (entered by admin on setup page)
- `llm_model` → `{"value": "claude-haiku-4-5-20251001"}`

GET `/hercules-ai/config` returns flattened: `{"setup_completed": false, "llm_api_key_set": true, ...}`
**SECURITY: GET never returns the actual API key — only `llm_api_key_set: true/false` (whether key is non-empty). Only last 4 chars shown as `llm_api_key_hint: "...k2Xm"`.** Similar to how `smtp_config` redacts passwords.

PUT `/hercules-ai/config` accepts: `{"llm_api_key": "sk-ant-..."}` — stored in DB, not in code.

#### 3. Blueprint: `backend/hercules_ai_bp.py`

Uses `_get_db_connection()` from `report_builder_bp.py` pattern (checks both `'app'` and `'__main__'` in `sys.modules`):
```python
def _get_db_connection():
    import sys
    for mod_name in ('app', '__main__'):
        if mod_name in sys.modules:
            fn = getattr(sys.modules[mod_name], 'get_db_connection', None)
            if fn:
                return fn
    raise RuntimeError("Could not get database connection function")
```

All routes with `@login_required`.
Scan protected with `_scan_in_progress` flag + try/finally (409 if running).

**Routes:**

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/hercules-ai/scan` | Auto-scan: extract tags from templates + classify + check data |
| GET | `/hercules-ai/profiles` | List all profiles grouped by line_name with counts |
| PUT | `/hercules-ai/profiles/bulk` | Bulk update — transaction, all-or-nothing |
| PUT | `/hercules-ai/profiles/<int:id>` | Update single profile by ID |
| GET | `/hercules-ai/config` | Get global config (flattened, API key REDACTED) |
| PUT | `/hercules-ai/config` | Update config entries |
| GET | `/hercules-ai/status` | Status: setup_completed, tags counts, last_scan_at, unseen_reports_count |
| POST | `/hercules-ai/preview-summary` | Generate a sample AI summary from most recent report data |

**CRITICAL: PUT endpoints MUST set `source='user'` and `is_reviewed=true`:**
```python
@hercules_ai_bp.route('/hercules-ai/profiles/<int:profile_id>', methods=['PUT'])
@login_required
def update_profile(profile_id):
    data = request.get_json()
    # ALWAYS mark as user-edited so re-scans don't overwrite
    data['source'] = 'user'
    data['is_reviewed'] = True
    # ... UPDATE hercules_ai_tag_profiles SET ... WHERE id = %s
```

Same for bulk update — every profile in the batch gets `source='user'`, `is_reviewed=True`.

#### 4. Scanner Logic (`POST /hercules-ai/scan`)

**Step 1 — Extract tags using existing code:**
- Import `extract_all_tags` from `distribution_engine.py` (DO NOT reimplement)
- This returns a `set()` of tag name strings only — no context

**Step 2 — Extract labels/context (INDEPENDENT walk of layout_config):**
- `extract_all_tags()` gives us the complete tag set, but no labels or positions
- Must INDEPENDENTLY walk `layout_config` to extract label/context pairings:
  - Walk `paginatedSections[]`: pair static cells (sourceType='static') with adjacent tag cells for label mapping
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

**Step 7 — Orphaned profiles + revival:**
```python
# Tags removed from PLC
for profile in existing_profiles:
    if profile['tag_name'] not in current_tags:
        if profile['source'] == 'auto':
            # Auto-classified: mark deleted
            UPDATE SET data_status='deleted', is_tracked=false WHERE id = profile['id']
        else:
            # User-edited: just update data_status, keep their edits
            UPDATE SET data_status='deleted' WHERE id = profile['id']

# Tags re-added to PLC (revival case)
for profile in existing_profiles:
    if profile['data_status'] == 'deleted' and profile['tag_name'] in current_tags:
        UPDATE SET data_status='active' WHERE id = profile['id']
        # Note: does NOT overwrite type/label — preserves user edits
```

**Step 8 — UPSERT (protect user corrections):**
```sql
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
WHERE hercules_ai_tag_profiles.source = 'auto';
```
**Key guarantee:** Rows with `source='user'` are NEVER overwritten by re-scans.

**Step 9 — Error handling:** try/except per template, return scan results with errors.

**Step 10 — Update `last_scan_at` config.**

#### 5. Preview Summary Endpoint (`POST /hercules-ai/preview-summary`)

1. Check `setup_completed` is true — if not, return 400 "Complete setup first"
2. Load `llm_api_key` from config — if empty, return 400 "API key required"
3. Pick first report template that has tracked tags
4. Fetch last 24h of historian data for those tags via existing query logic
5. Build context: tag labels, types, values, line names from `hercules_ai_tag_profiles`
6. Call Claude API with the prompt (see section 7)
7. On success: return `{"summary": "...", "report_name": "...", "tags_used": 12}`
8. On API error: return `{"error": "Could not generate summary. Check your API key."}`
9. On timeout: return `{"error": "Summary generation timed out. Try again."}`

#### 6. Email Summary Integration (`backend/distribution_engine.py`)

**CRITICAL: Exact injection point — line 1752, AFTER `email_html = _build_email_html(...)` and BEFORE `email_result = _send_email(...)`.**

The integration must handle multi-report rules (multiple reports per rule). Collect ALL tag data across all reports, then generate ONE summary:

```python
# In execute_distribution_rule(), at line 1749, BEFORE the email send block:

        if delivery in ('email', 'both') and recipients:
            names_str = ', '.join(report_names)
            subject = f"Hercules Report: {names_str} — {datetime.now().strftime('%Y-%m-%d')}"
            email_html = _build_email_html(names_str, from_dt, to_dt,
                                           ', '.join(fn for fn, _ in attachments))

            # ── AI Summary injection (Phase 1) ──────────────────────────
            if rule.get('include_ai_summary'):
                try:
                    # Collect ALL tag data across all reports in this rule
                    all_tag_data = {}
                    for rid in report_ids:
                        with closing(get_conn()) as conn2:
                            actual2 = conn2._conn if hasattr(conn2, '_conn') else conn2
                            cur2 = actual2.cursor(cursor_factory=RealDictCursor)
                            cur2.execute("SELECT layout_config FROM report_builder_templates WHERE id = %s", (rid,))
                            tpl = cur2.fetchone()
                            if tpl:
                                lc = tpl['layout_config']
                                if isinstance(lc, str):
                                    lc = json.loads(lc)
                                tags = extract_all_tags(lc)
                                td = _fetch_tag_data_multi_agg(lc, tags, from_dt, to_dt)
                                all_tag_data.update(td)

                    summary = _generate_ai_summary(
                        report_names=report_names,  # list of all report names
                        tag_data=all_tag_data,       # combined tag data dict
                        from_dt=from_dt,
                        to_dt=to_dt
                    )
                    if summary:
                        email_html = _prepend_summary_to_email(summary, email_html)
                except Exception as e:
                    logger.warning("AI summary generation failed, sending without: %s", e)
            # ── End AI Summary ───────────────────────────────────────────

            email_result = _send_email(recipients, subject, email_html, attachments=attachments)
```

**`_generate_ai_summary()` signature:**
```python
def _generate_ai_summary(report_names, tag_data, from_dt, to_dt):
    """
    Generate AI summary for distribution email.
    Args:
        report_names: list of report name strings
        tag_data: dict {tag_name_or_namespaced: value} — combined from all reports
        from_dt, to_dt: datetime range
    Returns: summary text string or None
    """
```

Full implementation:
1. Rate limit check (200 calls/day safety cap, reset daily)
2. Load API key + model from `hercules_ai_config`
3. Load tracked profiles for tags in `tag_data` from `hercules_ai_tag_profiles`
4. Strip aggregation namespace prefixes (`'first::tagName'` → `'tagName'`)
5. Build structured data table for prompt
6. Call Claude API with 10-second timeout
7. On failure → return None (never block email delivery)

**`_prepend_summary_to_email()`** inserts a styled HTML block after `<body>`:
```html
<div style="background:#f0f9ff;border-left:4px solid #0284c7;padding:16px 20px;margin:0 0 24px;border-radius:6px;">
    <div style="font-size:13px;font-weight:600;color:#0369a1;margin-bottom:8px;">Hercules AI Summary</div>
    <div style="font-size:14px;color:#1e293b;line-height:1.6;">{summary_text}</div>
</div>
```

**Cost:** ~$0.001/call with Haiku. 10 daily rules = $3.65/year. Safety cap at 200 calls/day.

**Timeout:** 10 seconds hard limit. On failure, email sends without summary — never blocks delivery.

#### 7. LLM Package Configuration

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
Given the following data from the "{report_names}" report(s) covering {time_from} to {time_to}:

{structured_data_table}

Each row shows: Tag Label | Type | Value | Line

Write a 2-4 sentence summary for plant managers.

Rules:
- ONLY reference numbers that appear in the data above. Never calculate or infer new numbers.
- Lead with the most important production metric (largest total, key output).
- Mention at most 2 anomalies (values that are zero when expected, unusually high or low).
- Use simple language. No technical jargon.
- If a "counter" type shows zero during what should be a production period, mention it as possible downtime.
- Maximum 120 words.
- Do not use markdown formatting. Plain text only.
```

#### 8. Register in `backend/app.py`

```python
# Line ~41 (after existing blueprint imports):
from hercules_ai_bp import hercules_ai_bp

# Line ~265 (after existing registrations):
app.register_blueprint(hercules_ai_bp, url_prefix='/api')
```

Add to `backend/hercules.spec` hiddenimports:
```python
'hercules_ai_bp',
'anthropic',
```

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

**Empty state (scan found zero tags):**
```
┌──────────────────────────────────────────────────────────────┐
│  No tags found                                               │
│                                                              │
│  Hercules AI could not find any tags in your report          │
│  templates. Create a report in the Report Builder first,     │
│  then come back and scan again.                              │
│                                                              │
│  [Go to Report Builder]   [Scan Again]                       │
└──────────────────────────────────────────────────────────────┘
```

**State B: Scan Done, Reviewing**

Zone 1 — Top Bar:
- Status: "146 tags · 128 confirmed · 12 pending · 6 excluded"
- Progress bar (green/amber/gray)
- "Scan Reports" button + last scanned timestamp
- If unseen reports: "2 new reports since last scan. [Scan Now]"

**Filter state definitions (from database fields):**
- **Pending** = `is_reviewed = false AND is_tracked = true`
- **Confirmed** = `is_reviewed = true AND is_tracked = true`
- **Excluded** = `is_tracked = false`

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

**Expanded row (FULL user control):**
```
┌──────────────────────────────────────────────────────────────┐
│  Hercules AI classified this as: Production Total            │
│  Reason: counter flag set, unit=kg                           │
│                                                              │
│  Type:                                                       │
│  [Production Total] [Flow Rate] [Measurement] [On/Off]      │
│  [Percentage] [Setting] [Selector] [Unclassified]           │
│                                                              │
│  Label:     [B1 Totalizer_______________]                    │
│  Line:      [Mill B___________▾]  ← editable dropdown       │
│  Category:  [Order Info________▾]  ← editable dropdown      │
│  Notes:     [_____________________________]                  │
│                                                              │
│  [Confirm]  [Exclude]  [Cancel]                              │
└──────────────────────────────────────────────────────────────┘
```

**User-editable fields:**
- **Type** — pill buttons (changes `tag_type`)
- **Label** — text input (changes `label`)
- **Line** — dropdown populated from all known `line_name` values + custom input (changes `line_name`)
- **Category** — dropdown populated from all known `category` values + custom input (changes `category`)
- **Notes** — text input (changes `user_notes`)

**ALL edits set `source='user'` and `is_reviewed=true` on save.** This is the feedback loop — user corrections are permanently protected from re-scans.

Bottom:
- API Key input field (masked, with show/hide toggle): "Claude API Key (required for AI summaries)"
  - On save, PUT to `/hercules-ai/config` with `{"llm_api_key": "..."}`
  - Shows hint from GET: "Key ending in ...k2Xm" or "No key set"
  - Invalid key error shown after Preview fails: "Could not generate summary. Check your API key."
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

**Approach: Add `badge` field to nav item data model.**

`Frontend/src/Data/Navbar.js`:
```js
import { LayoutGrid, BarChart2, Settings, Table2, Send, Sparkles } from 'lucide-react';

export const getMenuItems = (t) => [
  // ... existing items ...
  {
    name: t('nav.herculesAI'),
    icon: Sparkles,
    tooltip: t('nav.tooltip.herculesAI'),
    link: '/hercules-ai',
    roles: [Roles.Admin],
    badgeEndpoint: '/api/hercules-ai/status',  // NEW field
    badgeKey: 'unseen_reports_count',           // NEW field
  },
];
```

`Frontend/src/Components/Common/SideNav.jsx` — add badge rendering logic:
```jsx
// Inside the nav item map, after the icon:
{item.badgeEndpoint && badgeCounts[item.link] > 0 && (
  <span className="absolute top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center
                    text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
    {badgeCounts[item.link]}
  </span>
)}
```

SideNav fetches badge data on mount + route change (NOT polling):
```jsx
useEffect(() => {
  const badgeItems = uniqueMenuItems.filter(i => i.badgeEndpoint);
  badgeItems.forEach(item => {
    axios.get(item.badgeEndpoint)
      .then(res => setBadgeCounts(prev => ({ ...prev, [item.link]: res.data[item.badgeKey] || 0 })))
      .catch(() => {});
  });
}, [location.pathname]);
```

#### 13. Navigation: After Distribution in nav order.

#### 14. Route: `Frontend/src/Routes/AppRoutes.jsx`

```jsx
<Route path="hercules-ai" element={
  <ProtectedRoute roles={[Roles.Admin]}><HerculesAISetup /></ProtectedRoute>
} />
```

#### 15. i18n — All 4 Locale Files

~50 keys per file. Key naming follows existing `section.camelCaseKey` pattern:
```
nav.herculesAI, nav.tooltip.herculesAI

herculesAI.title, herculesAI.subtitle
herculesAI.scanButton, herculesAI.scanMyReports, herculesAI.scanning, herculesAI.lastScanned
herculesAI.firstVisit.description, herculesAI.firstVisit.explanation

herculesAI.empty.title, herculesAI.empty.description, herculesAI.empty.goToBuilder

herculesAI.status.confirmed, .pending, .excluded, .tags, .active, .tracking
herculesAI.newReports (e.g. "{count} new reports since last scan")

herculesAI.filter.all, .pending, .confirmed, .excluded
herculesAI.allLines, herculesAI.search
herculesAI.selectAll, herculesAI.deselectAll, herculesAI.selected
herculesAI.bulk.confirm, .exclude, .setType

herculesAI.type.counter ("Production Total"), .rate ("Flow Rate"), .boolean ("On/Off"),
  .percentage ("Percentage"), .analog ("Measurement"), .setpoint ("Setting"),
  .id_selector ("Selector"), .unknown ("Unclassified")

herculesAI.field.label, .tagName, .unit, .line, .category, .notes, .source
herculesAI.confidence.high, .medium, .low
herculesAI.expand.classified, .reason
herculesAI.confirm, .exclude, .cancel

herculesAI.apiKey, herculesAI.apiKeyHint, herculesAI.apiKeyPlaceholder
herculesAI.markComplete, .editSetup, .saved
herculesAI.scanFirst, .noTemplates, .noTemplatesHint

herculesAI.dataStatus.active, .sparse, .empty, .deleted

herculesAI.preview, .previewButton, .previewLoading, .previewError, .previewNoData
herculesAI.complete.title, .complete.tracking, .complete.enableHint

distribution.includeAISummary, distribution.aiSummaryDisabledHint
```

### Phase 1 — Files

**Create:**
- `backend/migrations/create_hercules_ai_tables.sql`
- `backend/migrations/add_ai_summary_to_distribution.sql`
- `backend/hercules_ai_bp.py`
- `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx`
- `Frontend/src/API/herculesAIApi.js`

**Modify:**
- `backend/init_db.py` — append both migrations to END of MIGRATION_ORDER
- `backend/app.py` — import + register hercules_ai_bp
- `backend/hercules.spec` — add `'hercules_ai_bp'`, `'anthropic'` to hiddenimports
- `backend/distribution_engine.py` — add `_generate_ai_summary()`, `_prepend_summary_to_email()`, inject at line 1752
- `backend/requirements.txt` — add `anthropic`
- `Frontend/src/Routes/AppRoutes.jsx` — add /hercules-ai route
- `Frontend/src/Data/Navbar.js` — add nav item with `badgeEndpoint` + `Sparkles` import
- `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx` — add AI summary toggle + EMPTY_RULE update
- `Frontend/src/Components/Common/SideNav.jsx` — add badge rendering for items with `badgeEndpoint`
- `Frontend/src/i18n/en.json`, `ar.json`, `hi.json`, `ur.json` — add ~50 keys each

### Phase 1 — Implementation Order

1. Migration SQL (both files) + init_db.py (APPEND to END)
2. Backend blueprint — scan + CRUD + config + preview-summary endpoints
3. Register in app.py + hercules.spec
4. `anthropic` in requirements.txt
5. Distribution engine — `_generate_ai_summary()` + inject at line 1752 in `execute_distribution_rule()`
6. Frontend API layer
7. Setup page (all 3 states + empty state)
8. Distribution rule toggle + EMPTY_RULE
9. Sidebar badge (Navbar.js + SideNav.jsx)
10. Route + nav
11. i18n (all 4 files)

### Phase 1 — Verification

1. `python app.py` — both tables created, no import errors
2. `POST /api/hercules-ai/scan` — populates profiles from templates
3. `GET /api/hercules-ai/profiles` — tags grouped by line with labels + types
4. `GET /api/hercules-ai/status` — correct counts + unseen_reports_count
5. Open `/hercules-ai` — shows first-visit state
6. Click "Scan My Reports" → tags appear grouped by line
7. Expand tag → change type, label, line, category → Confirm → `source='user'` persists on reload
8. Bulk select → Confirm All → all updated with `source='user'`
9. Re-scan → user corrections survive (source='user' rows untouched)
10. Enter API key → Mark Setup Complete → confirmation card appears
11. Click "Preview Summary" → sample AI summary displayed
12. Bad API key → Preview fails with "Check your API key" message
13. Open Distribution → edit rule → "Include AI Summary" toggle visible
14. If setup not complete → toggle disabled with hint
15. Run distribution rule with AI summary on → email has summary paragraph at top
16. API call fails/times out → email sends without summary (no error to user)
17. Add new report template → sidebar shows badge → re-scan picks up new tags
18. Delete tag from PLC → re-scan marks `data_status='deleted'` (user edits preserved)
19. Re-add same tag → data_status reverts to 'active' (user edits still preserved)

---

## Phase 2 — Downtime Detection & Smart Alerts

**Depends on:** Phase 1 complete (tag profiles classified, LLM integration working)

**User journey:** Hercules AI runs a background worker every hour. When it detects downtime (zero production), anomalies, or data quality issues, it sends alert emails and shows in-app notifications. Plant managers get proactive notifications without checking dashboards.

### Scope

1. Analysis worker — background thread that runs hourly, analyzes tag data
2. Alert rules — configurable thresholds per alert type
3. Alert history — log of all detected events
4. Email alerts — notification emails when critical events detected
5. In-app notification bell — alert count in top navbar
6. Alert settings — configure which alerts are active, recipients, thresholds

### Detection Algorithms

#### Downtime Detection (production counters)

**Data source:** `tag_history_archive` — hourly aggregated data from `dynamic_archive_worker`. Uses `layout_id IS NULL` to query universal historian data (not per-layout data).

**Step 1 — Find hours with zero production per line:**
```sql
SELECT p.line_name, a.archive_hour,
       COUNT(*) AS counter_tags,
       COUNT(*) FILTER (WHERE COALESCE(a.value_delta, 0) = 0) AS zero_tags
FROM hercules_ai_tag_profiles p
JOIN tags t ON t.tag_name = p.tag_name
JOIN tag_history_archive a ON a.tag_id = t.id
WHERE p.tag_type = 'counter' AND p.is_tracked = true
  AND a.archive_hour >= NOW() - INTERVAL '24 hours'
  AND a.layout_id IS NULL
GROUP BY p.line_name, a.archive_hour
HAVING COUNT(*) FILTER (WHERE COALESCE(a.value_delta, 0) = 0) = COUNT(*)
ORDER BY p.line_name, a.archive_hour
```

**Step 2 — Group consecutive zero-hours into downtime windows (Python):**
```python
def _detect_downtime_windows(zero_hours_by_line, min_hours=2):
    """
    Group consecutive zero-production hours into downtime windows.
    Args:
        zero_hours_by_line: dict {line_name: [datetime, ...]} sorted ASC
        min_hours: minimum consecutive hours to count as downtime
    Returns:
        list of alert dicts
    """
    events = []
    for line, hours in zero_hours_by_line.items():
        if not hours:
            continue
        window_start = hours[0]
        window_end = hours[0]

        for i in range(1, len(hours)):
            gap = (hours[i] - hours[i-1]).total_seconds() / 3600
            if gap <= 1.0:
                window_end = hours[i]
            else:
                duration = (window_end - window_start).total_seconds() / 3600 + 1
                if duration >= min_hours:
                    events.append({
                        'type': 'downtime',
                        'line_name': line,
                        'started_at': window_start,
                        'ended_at': window_end + timedelta(hours=1),
                        'duration_hours': duration,
                        'duration_minutes': int(duration * 60),
                        'title': f'{line} — Down for {int(duration)} hours',
                        'severity': 'warning' if duration < 6 else 'critical',
                    })
                window_start = hours[i]
                window_end = hours[i]

        # Last window
        duration = (window_end - window_start).total_seconds() / 3600 + 1
        if duration >= min_hours:
            events.append({
                'type': 'downtime',
                'line_name': line,
                'started_at': window_start,
                'ended_at': window_end + timedelta(hours=1),
                'duration_hours': duration,
                'duration_minutes': int(duration * 60),
                'title': f'{line} — Down for {int(duration)} hours',
                'severity': 'warning' if duration < 6 else 'critical',
            })
    return events
```

#### Stale Data Detection

```sql
SELECT p.tag_name, p.label, p.line_name, p.tag_type,
       MAX(a.archive_hour) as last_reading
FROM hercules_ai_tag_profiles p
JOIN tags t ON t.tag_name = p.tag_name
LEFT JOIN tag_history_archive a ON a.tag_id = t.id
  AND a.archive_hour >= NOW() - INTERVAL '24 hours'
  AND a.layout_id IS NULL
WHERE p.is_tracked = true AND p.data_status = 'active'
GROUP BY p.tag_name, p.label, p.line_name, p.tag_type
HAVING MAX(a.archive_hour) IS NULL
   OR MAX(a.archive_hour) < NOW() - make_interval(hours => %s)
```
- Default `max_gap_hours`: 2
- Severity: `critical`
- Generates one alert per line (groups stale tags by line)

#### Value Anomaly Detection

```sql
-- 7-day stats for analog/rate tags
SELECT p.tag_name, p.label, p.line_name,
       AVG(a.value) as mean_val, STDDEV(a.value) as stddev_val, COUNT(*) as cnt
FROM hercules_ai_tag_profiles p
JOIN tags t ON t.tag_name = p.tag_name
JOIN tag_history_archive a ON a.tag_id = t.id
WHERE p.tag_type IN ('analog', 'rate') AND p.is_tracked = true
  AND a.archive_hour >= NOW() - INTERVAL '7 days'
  AND a.layout_id IS NULL AND a.value IS NOT NULL
GROUP BY p.tag_name, p.label, p.line_name
HAVING COUNT(*) >= %s AND STDDEV(a.value) > 0
```
Then compare latest hour value against mean ± Nσ. Default sigma_threshold: 3.

#### Quality Degradation Detection

```sql
SELECT t.tag_name, p.label, p.line_name,
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE h.quality_code NOT IN ('GOOD', '')) as bad
FROM hercules_ai_tag_profiles p
JOIN tags t ON t.tag_name = p.tag_name
JOIN tag_history h ON h.tag_id = t.id
WHERE p.is_tracked = true
  AND h.timestamp >= NOW() - INTERVAL '1 hour'
  AND h.layout_id IS NULL
GROUP BY t.tag_name, p.label, p.line_name
HAVING COUNT(*) > 0
  AND (COUNT(*) FILTER (WHERE h.quality_code NOT IN ('GOOD', '')))::float / COUNT(*) > %s
```
Default error_percent_threshold: 10%.

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
    rule_type VARCHAR(50) NOT NULL UNIQUE,
    is_enabled BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}',
    recipients JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hai_alerts_type ON hercules_ai_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_hai_alerts_created ON hercules_ai_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hai_alerts_unread ON hercules_ai_alerts(is_read) WHERE is_read = false;
```

Added to END of `MIGRATION_ORDER`.

Default alert rules seeded by `_ensure_alert_defaults()` on first load.

#### Worker: `backend/workers/hercules_ai_worker.py`

**Uses `from app import get_db_connection`** — same pattern as `historian_worker.py` and `dynamic_archive_worker.py`. NOT the blueprint `_get_db_connection()` pattern.

Main loop:
1. Check `setup_completed` FIRST (before lock, to avoid holding lock unnecessarily)
2. If not complete → sleep 5 min and retry
3. Acquire advisory lock `0x68616900`
4. Load enabled alert rules
5. Run each detection type (try/except per type)
6. Safety cap: max 50 alerts per run
7. Deduplicate: skip if identical alert (same type + line) exists within 4 hours
8. Insert new alerts
9. Send email notifications for alerts with recipients
10. Sleep for `check_interval_minutes` (default 60)

**Deduplication SQL:**
```sql
SELECT id FROM hercules_ai_alerts
WHERE alert_type = %s AND line_name = %s
  AND created_at >= NOW() - INTERVAL '4 hours'
  AND is_dismissed = false
LIMIT 1
```

**Alert email template:** Styled HTML with colored header bar (red=critical, amber=warning, blue=info), title, description, duration, and footer with "Manage in Hercules AI setup."

**LLM-enhanced descriptions:** Optional, with 5-second timeout. Fallback to template-based descriptions when API unavailable. Uses same daily rate limit as summaries (shared 200/day cap).

#### Blueprint Routes (added to `hercules_ai_bp.py`)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/hercules-ai/alerts` | List alerts. Params: `type`, `severity`, `line`, `is_read`, `limit`, `offset` |
| PUT | `/hercules-ai/alerts/<int:id>/read` | Mark alert as read |
| PUT | `/hercules-ai/alerts/read-all` | Mark all as read |
| PUT | `/hercules-ai/alerts/<int:id>/dismiss` | Dismiss (soft-hide) |
| GET | `/hercules-ai/alerts/unread-count` | `{"count": 5}` for bell badge |
| GET | `/hercules-ai/alert-rules` | List all 4 rules with config |
| PUT | `/hercules-ai/alert-rules/<int:id>` | Update: `{is_enabled, config, recipients}` |

#### Worker Registration in `app.py` (~line 1120)

```python
try:
    from workers.hercules_ai_worker import hercules_ai_worker
    eventlet.spawn(hercules_ai_worker)
    logger.info("Started Hercules AI analysis worker")
except Exception as e:
    logger.error("Could not start Hercules AI worker: %s", e, exc_info=True)
```

### Frontend — Phase 2

**Navigation: Tab-based within single `/hercules-ai` page** (no sub-routes). Tabs: **Setup | Alerts | Dashboard** (Dashboard added in Phase 3). This avoids SideNav refactoring.

#### Alert Bell in `Frontend/src/Components/Navbar/Navbar.jsx`

Bell icon between dark mode toggle and user menu:
```jsx
import { Bell } from 'lucide-react';
// Fetch unread count on route change
const [alertCount, setAlertCount] = useState(0);
useEffect(() => {
  axios.get('/api/hercules-ai/alerts/unread-count')
    .then(res => setAlertCount(res.data.count || 0)).catch(() => {});
}, [location.pathname]);

// Render bell with badge
<button onClick={() => navigate('/hercules-ai?tab=alerts')}>
  <Bell size={20} />
  {alertCount > 0 && <span className="badge">{alertCount > 99 ? '99+' : alertCount}</span>}
</button>
```

#### Alerts Tab: `Frontend/src/Pages/HerculesAI/HerculesAIAlerts.jsx`

Two sections: Alert List (top) + Alert Settings (bottom).

**Alert list:** Filterable by type/line/severity. Each card shows severity icon, title, description, timestamp, Mark Read / Dismiss buttons. Empty state: "No alerts yet."

**Alert settings:** Card per alert type with enable/disable toggle, threshold inputs, email recipients list, save button per card. Reuses toggle pattern from DistributionRuleEditor.

**State:** `alerts` from GET, `alertRules` from GET. Local filter state.

### Phase 2 — Files

**Create:**
- `backend/migrations/create_hercules_ai_alerts.sql`
- `backend/workers/hercules_ai_worker.py`
- `Frontend/src/Pages/HerculesAI/HerculesAIAlerts.jsx`

**Modify:**
- `backend/init_db.py` — append alerts migration
- `backend/hercules_ai_bp.py` — add 7 alert routes
- `backend/app.py` — spawn hercules_ai_worker
- `backend/hercules.spec` — add `'workers.hercules_ai_worker'`
- `Frontend/src/API/herculesAIApi.js` — add alert endpoints
- `Frontend/src/Components/Navbar/Navbar.jsx` — add alert bell
- `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx` — wrap with tab bar
- `Frontend/src/i18n/*.json` — add ~35 alert keys each

### Phase 2 — Implementation Order

1. Migration (alerts + alert rules tables)
2. Worker — all 4 detection algorithms + dedup + email
3. Blueprint routes — alerts CRUD + alert rules
4. Worker registration in app.py + hercules.spec
5. Frontend API layer
6. Tab bar wrapper for Hercules AI page
7. Alert bell in Navbar.jsx
8. Alerts tab content (list + settings)
9. i18n (all 4 files)

### Phase 2 — Verification

1. Worker starts, logs activity, sleeps on schedule
2. `setup_completed=false` → worker sleeps, rechecks every 5 min
3. Advisory lock → only one worker runs
4. Simulate downtime (2+ hours zero delta) → downtime alert created
5. Consecutive hours grouped correctly (3h gap → two separate events)
6. Dedup: same event within 4h → not duplicated
7. Safety cap: 50+ alerts → capped
8. Email sent to configured recipients
9. Bell shows unread count, click navigates to alerts tab
10. Filter by type/line works
11. Mark read / dismiss works
12. Settings: disable rule → detection stops
13. Change threshold → new threshold respected
14. LLM description works; fallback template works if API fails
15. Empty state shown when no alerts

---

## Phase 3 — Production Analytics Dashboard

**Depends on:** Phase 1 (tag profiles) + Phase 2 (alerts for downtime data)

**User journey:** Plant manager opens the Dashboard tab and sees production trends, line comparisons, efficiency metrics, and AI-generated insights — all auto-configured from tag profiles.

### Scope

1. Analytics dashboard tab — auto-generated from tag profiles
2. Production overview — total output per line with period comparison
3. Trend charts — 7/30-day production trends per line
4. Line comparison — side-by-side production
5. Efficiency metrics — uptime %, production/hour
6. AI daily digest — LLM summary of plant performance
7. Period comparison — this week vs last week

### Backend — Phase 3

#### Helper Functions (in `hercules_ai_bp.py`)

```python
def _get_tracked_tags_by_type(tag_type):
    """Return tracked tag profiles filtered by type, joined with tags table."""
    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT p.tag_name, p.label, p.line_name, p.category, t.id as tag_id, t.unit
            FROM hercules_ai_tag_profiles p
            JOIN tags t ON t.tag_name = p.tag_name
            WHERE p.tag_type = %s AND p.is_tracked = true AND p.data_status = 'active'
        """, (tag_type,))
        return cur.fetchall()

def _get_production_for_period(from_dt, to_dt):
    """SUM(value_delta) for tracked counter tags, grouped by line. Uses layout_id IS NULL for universal historian."""
    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT p.line_name, SUM(a.value_delta) as total, t.unit
            FROM hercules_ai_tag_profiles p
            JOIN tags t ON t.tag_name = p.tag_name
            JOIN tag_history_archive a ON a.tag_id = t.id
            WHERE p.tag_type = 'counter' AND p.is_tracked = true
              AND a.archive_hour >= %s AND a.archive_hour < %s
              AND a.layout_id IS NULL
            GROUP BY p.line_name, t.unit
        """, (from_dt, to_dt))
        return {r['line_name']: {'total': float(r['total'] or 0), 'unit': r['unit'] or ''} for r in cur.fetchall()}

def _get_downtime_hours(from_dt, to_dt):
    """Sum downtime from alerts table, grouped by line."""
    get_conn = _get_db_connection()
    with closing(get_conn()) as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT line_name, SUM(duration_minutes) / 60.0 as hours
            FROM hercules_ai_alerts WHERE alert_type = 'downtime'
              AND started_at >= %s AND started_at < %s
            GROUP BY line_name
        """, (from_dt, to_dt))
        return {r['line_name']: float(r['hours'] or 0) for r in cur.fetchall()}
```

#### Analytics Routes (all with `@login_required`)

| Method | Route | Params | Purpose |
|--------|-------|--------|---------|
| GET | `/hercules-ai/analytics/overview` | `period` (today/week/month) | KPI cards: per-line totals + delta % |
| GET | `/hercules-ai/analytics/trends` | `days` (7/30), `line` | Daily time-series per line |
| GET | `/hercules-ai/analytics/comparison` | `from`, `to` | Side-by-side bar data |
| GET | `/hercules-ai/analytics/efficiency` | `from`, `to` | Uptime %, prod/hour per line |
| GET | `/hercules-ai/analytics/digest` | `period` (today/week) | AI executive summary |
| GET | `/hercules-ai/analytics/period-compare` | `period` (week/month) | This vs last: totals + deltas |

**Overview implementation:** Computes `_get_production_for_period()` for current + previous period, calculates delta %.

**Trends implementation:**
```sql
SELECT p.line_name, DATE_TRUNC('day', a.archive_hour) as day,
       SUM(a.value_delta) as daily_total
FROM hercules_ai_tag_profiles p
JOIN tags t ON t.tag_name = p.tag_name
JOIN tag_history_archive a ON a.tag_id = t.id
WHERE p.tag_type = 'counter' AND p.is_tracked = true
  AND a.archive_hour >= %s AND a.layout_id IS NULL
GROUP BY p.line_name, DATE_TRUNC('day', a.archive_hour)
ORDER BY p.line_name, day
```
Returns `{series: {lineName: [{date, total}, ...]}}`.

**Efficiency implementation:** `total_hours - downtime_hours` = uptime. `production / uptime` = rate.

**Period Compare implementation:** Runs `_get_production_for_period()` + `_get_downtime_hours()` for both current and previous period.

**Digest implementation:** Builds prompt with production totals, deltas, downtime, efficiency. Calls Claude with 150-word max. Prompt:
```
You are a production analyst for a manufacturing plant.
[structured data: totals, deltas, downtime, efficiency per line]
Write 3-5 sentence executive summary. Simple language. Facts from data only. Max 150 words.
```
10-second timeout. On failure: return 500 with error message.

### Frontend — Phase 3

#### Dashboard Tab: `Frontend/src/Pages/HerculesAI/HerculesAIDashboard.jsx`

Uses `react-chartjs-2` (already in dependencies) and `@tanstack/react-query` (already in dependencies).

**Component tree:**
```
HerculesAIDashboard
  ├── PeriodSelector          (dropdown: Today / This Week / This Month)
  ├── AISummaryCard           (digest text, loading/error states)
  ├── ProductionCards         (KPI card per line: total + delta %)
  ├── TrendChart              (Line chart via react-chartjs-2)
  ├── LineComparisonChart     (Horizontal Bar via react-chartjs-2)
  ├── EfficiencyTable         (table with progress bars)
  ├── RecentAlerts            (last 5 alerts, "View All" → alerts tab)
  └── DashboardSkeleton       (loading placeholder)
```

**Data fetching (React Query with auto-refresh):**
```jsx
const overview = useQuery({
  queryKey: ['hai-overview', period],
  queryFn: () => herculesAIApi.getOverview(period),
  refetchInterval: 5 * 60 * 1000,  // 5 min
});
const trends = useQuery({ queryKey: ['hai-trends', days], queryFn: ..., refetchInterval: 5*60*1000 });
const efficiency = useQuery({ queryKey: ['hai-efficiency'], queryFn: ..., refetchInterval: 5*60*1000 });
const digest = useQuery({ queryKey: ['hai-digest', period], queryFn: ..., refetchInterval: 10*60*1000 });
const alerts = useQuery({ queryKey: ['hai-recent-alerts'], queryFn: () => herculesAIApi.getAlerts({limit:5}) });
```

**States:**
- **Loading:** `DashboardSkeleton` — gray pulsing rectangles matching layout
- **Error:** Red-bordered card: "Could not load analytics data. [Retry]"
- **Empty:** "No production data available yet. Data appears once historian collects readings."
- **Single line:** No comparison chart. Single KPI card. Single trend line.

**Component props:**
- `ProductionCards` — `cards: [{line_name, total, delta_percent, unit, label}]`
- `TrendChart` — `series: {lineName: [{date, total}]}`, `days: number`
- `LineComparisonChart` — `cards: same as ProductionCards`
- `EfficiencyTable` — `lines: [{line_name, uptime_percent, downtime_hours, production_per_hour, unit}]`
- `AISummaryCard` — `summary: string`, `isLoading: bool`, `error: string|null`
- `RecentAlerts` — `alerts: [{id, title, severity, line_name, created_at}]`, `onViewAll: () => void`

**Period selector** changes `period` state → all `useQuery` keys update → all components re-render.

**"Last updated"** timestamp from React Query's `dataUpdatedAt`.

#### API Methods (added to herculesAIApi.js)

```js
getOverview:      (period)     => axios.get(`${BASE}/analytics/overview`, { params: { period } }),
getTrends:        (days, line) => axios.get(`${BASE}/analytics/trends`, { params: { days, line } }),
getComparison:    (from, to)   => axios.get(`${BASE}/analytics/comparison`, { params: { from, to } }),
getEfficiency:    (from, to)   => axios.get(`${BASE}/analytics/efficiency`, { params: { from, to } }),
getDigest:        (period)     => axios.get(`${BASE}/analytics/digest`, { params: { period } }),
getPeriodCompare: (period)     => axios.get(`${BASE}/analytics/period-compare`, { params: { period } }),
```

### Phase 3 — Files

**Create:**
- `Frontend/src/Pages/HerculesAI/HerculesAIDashboard.jsx`
- `Frontend/src/Pages/HerculesAI/components/ProductionCards.jsx`
- `Frontend/src/Pages/HerculesAI/components/TrendChart.jsx`
- `Frontend/src/Pages/HerculesAI/components/LineComparisonChart.jsx`
- `Frontend/src/Pages/HerculesAI/components/EfficiencyTable.jsx`
- `Frontend/src/Pages/HerculesAI/components/AISummaryCard.jsx`
- `Frontend/src/Pages/HerculesAI/components/RecentAlerts.jsx`
- `Frontend/src/Pages/HerculesAI/components/PeriodSelector.jsx`
- `Frontend/src/Pages/HerculesAI/components/DashboardSkeleton.jsx`

**Modify:**
- `backend/hercules_ai_bp.py` — add 6 analytics routes + 3 helper functions
- `Frontend/src/API/herculesAIApi.js` — add 6 analytics endpoints
- `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx` — add Dashboard tab
- `Frontend/src/i18n/*.json` — add ~40 analytics keys each

### Phase 3 — Implementation Order

1. Backend helpers (`_get_tracked_tags_by_type`, `_get_production_for_period`, `_get_downtime_hours`)
2. Backend routes (overview, trends, efficiency, period-compare, digest, comparison)
3. Frontend API layer (6 endpoints)
4. Dashboard shell + period selector + tab integration
5. AI Summary card
6. KPI cards (production totals + deltas)
7. Trend chart (Line)
8. Line comparison (horizontal Bar)
9. Efficiency table (progress bars)
10. Recent alerts
11. Loading skeleton + error + empty states
12. i18n (all 4 files)

### Phase 3 — Verification

1. Overview returns correct totals per line per period
2. Deltas match manual calculation
3. Trends shows daily data, correct values
4. Comparison bar chart renders proportionally
5. Efficiency uptime % cross-checks with Phase 2 alerts
6. AI digest references actual data, coherent
7. Period selector changes all components
8. Auto-refresh every 5 min (React Query)
9. "Last updated" shown
10. Dark mode renders correctly
11. Empty state: no data → helpful message
12. Single line: no comparison, single card/line
13. Loading skeleton shown during fetch
14. Error: API failure → retry card
15. Recent alerts matches Phase 2 data

---

## Phase Summary & Dependencies

```
Phase 1: Setup + Email Summaries
  ├── Tag profiles DB + scanner (foundation for everything)
  ├── LLM integration + rate limiting (reused in Phase 2 + 3)
  ├── User correction feedback loop (source='user' + UPSERT protection)
  ├── Full edit control: type, label, LINE, CATEGORY, notes
  ├── Distribution engine integration (email summaries)
  └── Setup page with 3 states + empty state

Phase 2: Downtime Detection + Alerts (requires Phase 1)
  ├── Worker with advisory lock (uses `from app import get_db_connection`)
  ├── 4 detection algorithms with full SQL + Python implementations
  ├── Consecutive-hour gap grouping algorithm
  ├── Dedup + safety cap (50/run) + rate limit (200 LLM calls/day)
  ├── Alert email template (HTML, color-coded by severity)
  ├── Bell in Navbar.jsx (not SideNav)
  └── Tab-based navigation (Setup | Alerts)

Phase 3: Analytics Dashboard (requires Phase 1 + 2)
  ├── 3 helper functions with full SQL
  ├── 6 analytics endpoints with full implementations
  ├── 9 frontend components with props/state defined
  ├── React Query auto-refresh (5 min)
  ├── Loading skeleton + error + empty states
  ├── AI digest with structured prompt
  └── Tab-based navigation (Setup | Alerts | Dashboard)
```

## Key Patterns to Reuse (All Phases)

- `report_builder_bp.py` → `_get_db_connection()` checks both `'app'` and `'__main__'` — use in **blueprint**
- `historian_worker.py` → `from app import get_db_connection` — use in **workers**
- `distribution_bp.py` → `_ensure_table()` guard pattern
- `distribution_engine.py` → `extract_all_tags()` for tag extraction (DO NOT reimplement)
- `distribution_engine.py` → `_send_email()` for alert emails
- `dynamic_archive_worker.py` → worker pattern with advisory lock + eventlet sleep
- `DistributionPage.jsx` → dark mode `useTheme()` hook
- `DistributionRuleEditor.jsx` → toggle switch pattern, `EMPTY_RULE` constant
- `react-chartjs-2` → Line + Bar charts (already in package.json)
- `@tanstack/react-query` → data fetching + auto-refresh (already in package.json)
