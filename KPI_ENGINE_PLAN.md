# KPI Calculation Engine Plan — Historian-Based Dynamic KPIs

**Goal:** Calculate KPIs dynamically from historian data with user-defined formulas (tag names → tag_id mapping, safe evaluation, aggregation). This is the next MES layer after the Single Historian migration.

**Principle:** Reuse historian (`tag_history` / `tag_history_archive`), add KPI config + tag mapping + safe formula engine + optional KPI history; support both real-time (latest snapshot) and historical (aggregated) KPI.

---

## Implementation Order (Priority)

| Phase | What | When |
|-------|------|------|
| **1 — UI first** | Build KPI builder UI with **mock values** (layouts, tags, KPI list, formula, alias mapping). No backend dependency. | Do first. |
| **2 — Backend** | Migration (tables), safe formula parser, KPI engine service, API (kpi_config CRUD + kpi values). | After UI is done. |
| **3 — Integration** | Replace mock data in UI with real API calls; test end-to-end; update this MD with "done" notes. | After backend is done. |

**Rationale:** UI first lets you validate UX and data shape with mock data; backend then implements to match. Integration phase wires UI to API and removes mocks.

---

## Current State (What We Have)

| Component | Status | Location |
|-----------|--------|----------|
| Historian storage | Done | `tag_history`, `tag_history_archive` (value, value_delta, is_counter, layout_id, tag_id, timestamp/archive_hour) |
| Historian API | Done | `historian_bp.py`: `/api/historian/history`, `/api/historian/archive` |
| Dynamic Report + View | Done | `DynamicReport.jsx`: Live / Hourly / Daily / Weekly from historian |
| Section KPI cards | Exists | `live_monitor_kpi_config`: section_id, card_label, source_type ('Tag'/'Formula'), tag_name, formula. Per-section, live tag_values only. |
| Recipe/order KPIs | Exists | `kpi_definitions`: job_type_id, kpi_name, db_offset (PLC). Not historian-based. |
| Formula evaluation | Partial | `tag_reader.evaluate_value_formula`: safe math only. `section_data_resolver.evaluate_formula`: tag name substitution + **eval** (unsafe). |
| value_delta / is_counter | Schema only | Present in `tag_history` / `tag_history_archive`; not used for aggregation yet. |

**Gap:** No plant/layout-level KPI config, no formula variable → tag_id mapping, no historian-backed calculation engine, no safe formula parser, no KPI history table or dedicated KPI builder UI.

---

## Target Architecture

```
Historian (tag_history / tag_history_archive)
    → Load data for layout + time range
    → Aggregate by tag (SUM(delta) for counters, AVG(value) otherwise)
    → Map tag_id → alias_name (from kpi_tag_mapping)
    → Safe formula evaluation (alias_name → value)
    → KPI result → optional kpi_history
    → Dashboard / Reports
```

---

## Step 1 — New Tables

### 1.1 `kpi_config`

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | |
| kpi_name | VARCHAR(255) NOT NULL | Display name |
| layout_id | INTEGER NULL REFERENCES live_monitor_layouts(id) | NULL = plant-wide |
| formula_expression | TEXT NOT NULL | e.g. `(flour_1 / receiver_2) * 100` |
| aggregation_type | VARCHAR(50) | 'instant' \| 'sum' \| 'avg' \| 'ratio' |
| unit | VARCHAR(20) | |
| is_active | BOOLEAN DEFAULT TRUE | |
| created_at, updated_at | TIMESTAMP | |
| created_by | INTEGER NULL | Optional user reference |

### 1.2 `kpi_tag_mapping`

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PRIMARY KEY | |
| kpi_id | INTEGER NOT NULL REFERENCES kpi_config(id) ON DELETE CASCADE | |
| tag_id | INTEGER NOT NULL REFERENCES tags(id) | |
| alias_name | VARCHAR(255) NOT NULL | Variable name used in formula (e.g. flour_1, receiver_2) |

Unique (kpi_id, alias_name).

### 1.3 `kpi_history` (optional, for caching/trends)

| Column | Type | Description |
|--------|------|-------------|
| id | BIGSERIAL PRIMARY KEY | |
| kpi_id | INTEGER NOT NULL REFERENCES kpi_config(id) | |
| layout_id | INTEGER NOT NULL | |
| value | DOUBLE PRECISION NOT NULL | Calculated KPI value |
| timestamp | TIMESTAMP NOT NULL | Or period_end for aggregated |
| period_type | VARCHAR(20) NULL | 'instant' \| 'hour' \| 'shift' \| 'day' |

---

## Step 2 — Map Formula Variables to Tags

- User defines formula with **alias names** (e.g. flour_1, receiver_2).
- `kpi_tag_mapping` stores (kpi_id, tag_id, alias_name).
- Engine loads historian by tag_id, aggregates, then builds dict `{ alias_name: value }` for formula evaluation.

---

## Step 3 — Safe Formula Evaluation

- **Do not** use raw `eval(expression, {"__builtins__": {}}, {})` for user-defined formulas (security risk).
- Use a restricted parser, e.g.:
  - **asteval** (Python): safe subset of Python expressions.
  - **sympy**: symbolic math, can evaluate to float.
  - **numexpr**: numeric expressions only.
- Replace current unsafe `evaluate_formula` in `section_data_resolver.py` with the same safe engine where formulas are user-defined.

---

## Step 4 — KPI Calculation Engine (Backend)

1. Load KPI config (and kpi_tag_mapping) for layout (or all if plant-wide).
2. For each KPI, get required tag_ids from mapping.
3. Fetch historian data: `tag_history` or `tag_history_archive` for layout_id and time range.
4. **Aggregation:**
   - If tag is_counter: use SUM(value_delta) for the range (or from archive: one row per hour → sum deltas or use value as pre-aggregated).
   - Else: use AVG(value) (or from archive: value is already hourly avg).
5. Build dict `{ alias_name: aggregated_value }`.
6. Evaluate formula_expression with safe parser.
7. Return KPI value; optionally write to `kpi_history`.

---

## Step 5 — When to Calculate (Real-Time vs Historical)

| Mode | Data source | Use case |
|------|-------------|----------|
| Real-time | Latest snapshot from tag_history (or tag_latest_values if added) | Live dashboard, operator view |
| Historical | tag_history_archive (or tag_history over range + aggregate) | Reports, shift summary, trends |

Support both: one endpoint for "current KPI values" (latest snapshot), one for "KPI over range" (aggregated).

---

## Step 6 — Frontend KPI Builder (Phase 1 — UI First)

**Build UI first with mock data; integrate with backend in Phase 3.**

### UI screens / flows

1. **KPI list page** — List all KPIs (name, layout, formula preview, unit, aggregation type). Actions: Add, Edit, Delete. **Mock:** e.g. 2–3 rows (Flour Extraction, Bran Extraction, Water Ratio).
2. **KPI create/edit form**
   - KPI name (text).
   - Layout (dropdown: "Plant-wide" + list of layouts). **Mock:** use static list e.g. `[{ id: null, layout_name: 'Plant-wide' }, { id: 1, layout_name: 'Mil-A' }]`.
   - Aggregation type (dropdown: instant, sum, avg, ratio).
   - Unit (text, optional).
   - Formula expression (text), e.g. `(flour_1 / receiver_2) * 100`.
   - **Tag mapping (alias → tag):** For each variable in the formula, one row: alias name (e.g. flour_1), tag selector (dropdown or search). **Mock:** tag list e.g. `[{ id: 1, tag_name: 'Sender1Weight' }, { id: 2, tag_name: 'Receiver2Weight' }]`; allow adding/removing mapping rows.
3. **Validation (frontend only in Phase 1):** Check formula is non-empty; check every alias in formula has a mapping. Optional: simple syntax check (matching parentheses). Backend safe-parser validation comes in Phase 2/3.
4. **Save / Cancel** — In Phase 1, "Save" can store in localStorage or just show success and keep mock list; in Phase 3, call POST/PUT API.

### Mock data examples (Phase 1)

```js
// Mock layouts for dropdown
const MOCK_LAYOUTS = [
  { id: null, layout_name: 'Plant-wide' },
  { id: 1, layout_name: 'Mil-A' }
];

// Mock tags for alias → tag picker
const MOCK_TAGS = [
  { id: 1, tag_name: 'Sender1Weight', unit: 't/h' },
  { id: 2, tag_name: 'Receiver2Weight', unit: 't/h' },
  { id: 3, tag_name: 'FlourFlow', unit: 't/h' }
];

// Mock KPI list for list page
const MOCK_KPI_LIST = [
  { id: 1, kpi_name: 'Flour Extraction', layout_id: 1, layout_name: 'Mil-A', formula_expression: '(flour_1 / receiver_2) * 100', aggregation_type: 'ratio', unit: '%', tag_mappings: [{ alias_name: 'flour_1', tag_id: 1, tag_name: 'Sender1Weight' }, { alias_name: 'receiver_2', tag_id: 2, tag_name: 'Receiver2Weight' }] },
  { id: 2, kpi_name: 'Bran Extraction', layout_id: 1, layout_name: 'Mil-A', formula_expression: '((bran_coarse + bran_fine) / receiver_2) * 100', aggregation_type: 'ratio', unit: '%', tag_mappings: [] }
];
```

### Where to add UI

- **Option A:** New route e.g. `/settings/kpi-builder` or `/admin/kpi-config` and a new page component (e.g. `Frontend/src/Pages/Settings/KpiBuilder.jsx` or `Frontend/src/Pages/Admin/KpiConfig.jsx`).
- **Option B:** Under Reports or Dynamic Report config as a new section/tab.

### Phase 3 (integration) checklist

- Replace `MOCK_LAYOUTS` with `GET /api/live-monitor/layouts`.
- Replace `MOCK_TAGS` with `GET /api/tags` (or existing tags API).
- Replace `MOCK_KPI_LIST` with `GET /api/kpi-config` (or similar).
- Save: call `POST /api/kpi-config` or `PUT /api/kpi-config/:id` with `kpi_name`, `layout_id`, `formula_expression`, `aggregation_type`, `unit`, and tag mappings (alias_name + tag_id).
- Add KPI values view/dashboard later: call `GET /api/kpi-config/:id/values` (current or historical) and display.

---

## Step 7 — Aggregation Types

| Type | Meaning |
|------|---------|
| instant | Latest value per tag → evaluate formula once |
| sum | SUM(value_delta) for counters, then formula |
| avg | AVG(value) per tag over range, then formula |
| ratio | e.g. SUM(output_tag_delta) / SUM(input_tag_delta) — extraction style |

Extraction KPIs: use deltas (or hourly totals) for numerator/denominator, not averages of ratios.

---

## Step 8 — Historian Data Preparation

- Use existing schema:
  - `tag_history`: value, value_delta, is_counter.
  - For a time range: if is_counter then SUM(value_delta), else AVG(value).
- `tag_history_archive`: value is already hourly aggregate; for "hour" period use as-is; for longer range aggregate (e.g. SUM or AVG) depending on KPI type.

---

## Implementation Checklist (Phased)

### Phase 1 — UI first (priority)

| # | Task | Notes |
|---|------|-------|
| 1.1 | New page: KPI list | Route e.g. `/admin/kpi-config` or `/settings/kpi-builder`; table/cards with mock KPI list. |
| 1.2 | New page: KPI create/edit form | KPI name, layout dropdown, aggregation type, unit, formula expression, tag mapping (alias → tag) with add/remove rows. Use mock layouts and mock tags. |
| 1.3 | Mock data | MOCK_LAYOUTS, MOCK_TAGS, MOCK_KPI_LIST as in Step 6 above. Save can persist to localStorage or no-op until Phase 3. |
| 1.4 | Nav link | Add "KPI Config" or "KPI Builder" to sidebar (e.g. under Settings or Admin). |

### Phase 2 — Backend (after UI is done)

| # | Task | Notes |
|---|------|-------|
| 2.1 | Migration: create `kpi_config`, `kpi_tag_mapping`, `kpi_history` | New SQL migration file |
| 2.2 | Safe formula parser | Add asteval (or sympy/numexpr), wrap in utils |
| 2.3 | KPI engine service | Load config + mapping, fetch historian, aggregate, evaluate, return (and optionally store in kpi_history) |
| 2.4 | API: GET/POST/PUT/DELETE kpi_config, GET kpi values (current + historical) | New blueprint or extend existing |
| 2.5 | Use value_delta / is_counter in aggregation | In historian fetch for KPI, aggregate by tag accordingly |
| 2.6 | Optional: kpi_history write on schedule or on-demand | For trends and report performance |

### Phase 3 — Integration (after backend is done)

| # | Task | Notes |
|---|------|-------|
| 3.1 | Replace mock layouts with `GET /api/live-monitor/layouts` | In KPI form layout dropdown |
| 3.2 | Replace mock tags with tags API | In KPI form tag mapping picker |
| 3.3 | Replace mock KPI list with `GET /api/kpi-config` | On list page load |
| 3.4 | Save: call POST/PUT kpi-config API with formula + tag mappings | On form submit |
| 3.5 | Delete: call DELETE kpi-config API | On delete action |
| 3.6 | Update this MD | Mark Phase 1/2/3 items done; add "Integration done" section if needed |

---

## References in Codebase

- Section KPI config: `backend/migrations/create_tags_tables.sql` (live_monitor_kpi_config), `backend/live_monitor_bp.py` (KPI sections, create_kpi_card).
- Formula evaluation: `backend/utils/section_data_resolver.py` (evaluate_formula), `backend/utils/tag_reader.py` (evaluate_value_formula).
- Historian: `backend/historian_bp.py`, `backend/migrations/create_tag_history_tables.sql`.
- Migration plan: `SINGLE_HISTORIAN_MIGRATION_PLAN.md` (Optional Enhancements, derived KPI).
