# Hercules AI — Full Phase 1 Implementation Plan

## Context

Hercules needs an AI layer ("Hercules AI") that generates smart report summaries, detects downtime, benchmarks production rates, and balances line output. This plan covers the complete Phase 1: setup page + email summaries + distribution toggle — shipped together so users get immediate value.

**User journey:** Admin scans reports -> reviews tags -> marks complete -> next distribution email includes an AI summary. Complete cycle, immediate ROI.

---

## Scope — Phase 1 (shipped together)

1. AI Setup page — scan, classify, review, confirm tags
2. Email summary generation — AI paragraph at top of distribution emails
3. Toggle on Distribution Rules — "Include AI Summary: On/Off"
4. Post-setup confirmation — show what Hercules AI learned
5. New-report notification — sidebar badge when unscanned reports exist
6. **Dual AI provider support — Cloud (Claude API) or Local (LM Studio)**

---

## AI Provider Architecture

### Dual Provider Design

Hercules AI supports two AI backends. The admin chooses one during setup. Both use the same prompt templates and the same abstraction layer — only the HTTP call differs.

| | Cloud (Claude API) | Local (LM Studio) |
|---|---|---|
| **Default model** | `claude-opus-4-6` | Qwen2.5 32B Q4_K_M |
| **Fallback models** | Sonnet 4.6, Haiku 4.5 | Llama 3.1 32B, any 32B+ |
| **Speed** | ~1-3 sec per call | ~10-20 sec per call (CPU) |
| **Cost** | ~$109/year (Opus, 10 calls/day) | $0 (electricity only) |
| **Data privacy** | Data leaves local network | 100% on-premises |
| **Quality** | Best (frontier model) | Good (adequate for summaries) |
| **Requirements** | API key + internet | LM Studio running + 24GB free RAM |

### Cost Breakdown — Cloud Models

Per call (~1K input tokens, ~200 output tokens):

| Model | Per Call | 10 calls/day | Per Year |
|---|---|---|---|
| Claude Opus 4.6 | ~$0.030 | $0.30 | **$109** |
| Claude Sonnet 4.6 | ~$0.006 | $0.06 | **$22** |
| Claude Haiku 4.5 | ~$0.002 | $0.02 | **$7** |

### Local Model Requirements

**Minimum server specs for 32B Q4:**
- RAM: 24 GB free (model) + existing workload
- CPU: 16+ cores recommended (32-core EPYC ideal)
- Disk: ~20 GB for model file
- Software: LM Studio with local server enabled (port 1234)

**Why 32B and not 8B:**
- Setup page feeds 100-200+ tags with labels, types, values, line assignments
- Model must understand tag relationships and provide intelligent classification feedback
- 8B models lose coherence with large structured inputs
- 32B is the sweet spot: fits in RAM, adequate reasoning, acceptable speed on CPU

**Expected local performance (32-core AMD EPYC 9374F, 128GB RAM, CPU-only):**
- Email summary (120 words): ~10-20 seconds
- Tag scan analysis (128 tags): ~30-60 seconds
- Preview summary: ~10-20 seconds
- All calls are async/background — user sees a spinner, never blocks UI

### Provider Abstraction Layer (`backend/ai_provider.py`)

Single module that wraps both providers behind one interface:

```python
"""
AI Provider abstraction — routes LLM calls to Cloud (Claude API) or Local (LM Studio).
Provider is selected via hercules_ai_config.ai_provider ('cloud' or 'local').
"""

import logging
import requests

logger = logging.getLogger(__name__)

try:
    import anthropic
    _HAS_ANTHROPIC = True
except ImportError:
    _HAS_ANTHROPIC = False

try:
    import openai
    _HAS_OPENAI = True
except ImportError:
    _HAS_OPENAI = False


def generate(prompt, config, timeout=30):
    provider = config.get('ai_provider', 'cloud')
    if provider == 'local':
        return _generate_local(prompt, config, timeout)
    else:
        return _generate_cloud(prompt, config, timeout)


def _generate_cloud(prompt, config, timeout):
    if not _HAS_ANTHROPIC:
        logger.error("anthropic package not installed")
        return None
    api_key = config.get('llm_api_key', '')
    if not api_key:
        logger.warning("No Claude API key configured")
        return None
    model = config.get('llm_model', 'claude-opus-4-6')
    try:
        client = anthropic.Anthropic(api_key=api_key, timeout=timeout)
        response = client.messages.create(
            model=model, max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )
        return response.content[0].text
    except Exception as e:
        logger.warning("Claude API call failed: %s", e)
        return None


def _generate_local(prompt, config, timeout):
    base_url = config.get('local_server_url', 'http://localhost:1234/v1')
    model = config.get('local_model', '')
    if _HAS_OPENAI:
        try:
            client = openai.OpenAI(base_url=base_url, api_key="not-needed", timeout=timeout)
            response = client.chat.completions.create(
                model=model or "local-model",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=500
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.warning("Local LM Studio call failed: %s", e)
            return None
    try:
        resp = requests.post(
            f"{base_url}/chat/completions",
            json={"model": model or "local-model",
                  "messages": [{"role": "user", "content": prompt}],
                  "max_tokens": 500},
            timeout=timeout
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning("Local LM Studio call failed: %s", e)
        return None


def test_connection(config):
    provider = config.get('ai_provider', 'cloud')
    if provider == 'local':
        base_url = config.get('local_server_url', 'http://localhost:1234/v1')
        try:
            resp = requests.get(f"{base_url}/models", timeout=5)
            resp.raise_for_status()
            models = resp.json().get("data", [])
            if models:
                return {"ok": True, "message": "Connected to LM Studio", "model": models[0].get("id", "unknown")}
            return {"ok": True, "message": "Connected but no model loaded", "model": None}
        except requests.ConnectionError:
            return {"ok": False, "message": "Cannot reach LM Studio. Is it running?", "model": None}
        except Exception as e:
            return {"ok": False, "message": str(e), "model": None}
    else:
        api_key = config.get('llm_api_key', '')
        if not api_key:
            return {"ok": False, "message": "No API key configured", "model": None}
        if not _HAS_ANTHROPIC:
            return {"ok": False, "message": "anthropic package not installed", "model": None}
        try:
            client = anthropic.Anthropic(api_key=api_key, timeout=10)
            client.messages.create(
                model=config.get('llm_model', 'claude-opus-4-6'),
                max_tokens=10,
                messages=[{"role": "user", "content": "Say OK"}]
            )
            return {"ok": True, "message": "Connected to Claude API", "model": config.get('llm_model', 'claude-opus-4-6')}
        except Exception as e:
            return {"ok": False, "message": str(e), "model": None}
```

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
After "Mark Setup Complete", Zone 1 transforms into a summary showing provider, model, and tag counts per line.

### New-Report Badge
- Backend: `GET /hercules-ai/status` returns `unseen_reports_count` by comparing `report_builder_templates.updated_at` against `last_scan_at`
- Frontend: sidebar nav item shows a small number badge when `unseen_reports_count > 0`

### Preview Summary
After setup complete, a "Preview Summary" button calls an endpoint that picks the most recent report template, fetches last 24h of historian data, generates a sample AI summary, and displays it in a card.

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
- `setup_completed` -> `{"value": false}`
- `last_scan_at` -> `{"value": null}`
- `production_value_per_ton` -> `{"value": 0, "currency": "USD"}`
- `ai_provider` -> `{"value": "cloud"}`
- `llm_api_key` -> `{"value": ""}`
- `llm_model` -> `{"value": "claude-opus-4-6"}`
- `local_server_url` -> `{"value": "http://localhost:1234/v1"}`
- `local_model` -> `{"value": ""}`

### 3. Blueprint: `backend/hercules_ai_bp.py`

Uses `_get_db_connection()` pattern. All routes with `@login_required`. Scan protected with `_scan_in_progress` flag.

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/hercules-ai/scan` | Auto-scan: extract tags from templates + classify + check data |
| GET | `/hercules-ai/profiles` | List all profiles grouped by line_name with counts |
| PUT | `/hercules-ai/profiles/bulk` | Bulk update — transaction, all-or-nothing |
| PUT | `/hercules-ai/profiles/<int:id>` | Update single profile by ID |
| GET | `/hercules-ai/config` | Get global config (flattened) |
| PUT | `/hercules-ai/config` | Update config entries |
| GET | `/hercules-ai/status` | Status: setup_completed, counts, last_scan_at, unseen_reports_count |
| POST | `/hercules-ai/preview-summary` | Generate sample AI summary from most recent report data |
| POST | `/hercules-ai/test-connection` | Test AI provider connectivity + return detected model |

### 4. Scanner Logic (`POST /hercules-ai/scan`)

1. Extract tags via `extract_all_tags` from `distribution_engine.py` (DO NOT reimplement)
2. Extract labels/context: walk paginatedSections, KPI rows, headers, widgets
3. Load tag metadata from `tags` table
4. Classify (rule-based): counter/rate/boolean/percentage/analog/setpoint/id_selector/unknown
5. Check data availability via JOIN on tag_history_archive (last 30 days)
6. Handle multi-report tags: store all in `evidence.reports[]`
7. Mark orphaned profiles: `data_status='deleted'`, `is_tracked=false`
8. UPSERT with user-correction protection (`WHERE source = 'auto'`)
9. Error handling per template
10. Update `last_scan_at`

### 5. Preview Summary (`POST /hercules-ai/preview-summary`)

1. Check setup_completed + provider configured
2. Pick first template with tracked tags
3. Fetch last 24h historian data
4. Build context from hercules_ai_tag_profiles
5. Call `ai_provider.generate()`
6. Return summary + report_name + tags_used count

### 6. Email Summary Integration (`backend/distribution_engine.py`)

In `execute_rule()`, after report data computed, call `_generate_ai_summary()` which uses `ai_provider.generate()`. Timeout: 10s cloud, 30s local. On any failure -> skip silently, send email without summary.

### 7. LLM Configuration

**Packages:** `anthropic` + `openai` in requirements.txt (both graceful imports).

**Default cloud model:** `claude-opus-4-6`

**Cloud model options:** Opus ($109/yr), Sonnet ($22/yr), Haiku ($7/yr)

**Recommended local model:** Qwen2.5 32B Q4_K_M

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

### 8. Register in `backend/app.py`

- Import + register `hercules_ai_bp`
- Add to hercules.spec hiddenimports: `hercules_ai_bp`, `ai_provider`, `anthropic`, `openai`

---

## Frontend

### 9. API Layer: `Frontend/src/API/herculesAIApi.js`

Standard axios wrapper with: scan, getProfiles, bulkUpdate, updateProfile, getConfig, updateConfig, getStatus, previewSummary, testConnection.

### 10. Setup Page: `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx`

Three states:

**State A — First Visit:** Title, subtitle, "Scan My Reports" button.

**State B — Reviewing:** Top bar (counts + progress), filter bar (pill tabs + search + bulk actions), tag list (grouped by line, collapsible), AI Provider config section at bottom.

**AI Provider Config Section:**
- Radio: Cloud (Claude API) / Local (LM Studio)
- Cloud: API key input (masked) + model dropdown (Opus/Sonnet/Haiku with costs)
- Local: server URL input + auto-detected model name + status indicator
- Test Connection button
- Mark Setup Complete button

**State C — Complete:** Confirmation card with provider + model + tag counts, Preview Summary button, read-only tag list, Edit Setup button.

### 11. Distribution Rule Toggle

Add "Include AI Summary" toggle to `DistributionRuleEditor.jsx`. Disabled if setup not complete. Add to `EMPTY_RULE`.

### 12. Sidebar Badge

Fetch unseen_reports_count on mount, show badge on Hercules AI nav item.

### 13-14. Navigation + Route

Nav item with Sparkles icon after Distribution. Protected route for Admin role.

### 15. i18n — ~60 keys across all 4 locale files

Provider-related keys: title, cloud, local, descriptions, settings labels, connection status messages, model descriptions with costs, LM Studio hints.

---

## Files to Create
- `backend/migrations/create_hercules_ai_tables.sql`
- `backend/migrations/add_ai_summary_to_distribution.sql`
- `backend/hercules_ai_bp.py`
- `backend/ai_provider.py`
- `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx`
- `Frontend/src/API/herculesAIApi.js`

## Files to Modify
- `backend/init_db.py` — add migrations to MIGRATION_ORDER
- `backend/app.py` — register hercules_ai_bp
- `backend/hercules.spec` — add hiddenimports
- `backend/distribution_engine.py` — add AI summary generation
- `backend/requirements.txt` — add anthropic, openai
- `Frontend/src/Routes/AppRoutes.jsx` — add route
- `Frontend/src/Data/Navbar.js` — add nav item
- `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx` — add toggle
- `Frontend/src/Components/Common/SideNav.jsx` — add badge
- `Frontend/src/i18n/en.json`, `ar.json`, `hi.json`, `ur.json` — add ~60 keys each

## Implementation Order
1. `ai_provider.py` (everything depends on it)
2. Migration SQL + init_db.py
3. Backend blueprint (all endpoints)
4. Register in app.py + hercules.spec
5. requirements.txt
6. Distribution engine integration
7. Frontend API layer
8. Setup page (all 3 states + provider config)
9. Distribution rule toggle
10. Sidebar badge
11. Route + nav
12. i18n (all 4 files)

## Verification
1. `python app.py` — tables created, imports clean
2. Scan populates profiles from templates
3. Profiles grouped by line with correct labels/types
4. Status endpoint returns correct counts
5. First-visit state renders correctly
6. Scan -> tags appear grouped -> expand -> edit -> confirm -> persists
7. Bulk operations work
8. Re-scan preserves user corrections
9. Cloud: API key -> Test Connection -> "Connected (Claude Opus 4.6)"
10. Local: URL -> Test Connection -> "Connected (Qwen2.5-32B-Q4_K_M)"
11. Provider switch persists on reload
12. Setup complete shows provider + model in confirmation
13. Preview Summary works with selected provider
14. Distribution toggle visible, disabled if setup incomplete
15. Email includes AI summary when toggle on
16. Cloud timeout (10s) / Local timeout (30s) -> email sends without summary
17. New report -> sidebar badge -> re-scan picks up new tags
18. Provider swap -> next distribution uses new provider
