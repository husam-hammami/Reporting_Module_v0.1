# 16 — Report Distribution

> **Status:** Planned
> **Last updated:** 2026-03-24
> **Replaces:** Settings → Email/SMTP page (will be absorbed into this feature)

---

## Overview

Report Distribution is a **top-level sidebar page** (not nested under Settings) that lets users define automated rules for generating and delivering reports via email on a schedule.

**Why a separate page?** Distribution is a core workflow — users will manage and monitor rules regularly. SMTP config is infrastructure (stays under Settings); distribution rules are operational and deserve first-class visibility.

---

## Architecture

### Sidebar Navigation (updated)

| # | Name            | Icon       | Path              | Roles                     |
|---|-----------------|------------|-------------------|---------------------------|
| 1 | Builder         | LayoutGrid | `/report-builder` | Admin, Manager, Operator  |
| 2 | Dashboards      | BarChart2  | `/dashboards`     | Admin, Manager, Operator  |
| 3 | Table Reports   | Table2     | `/reports`        | Admin, Manager, Operator  |
| 4 | **Distribution**| **Send**   | `/distribution`   | **Admin, Manager**        |
| 5 | Engineering     | Settings   | `/settings`       | Admin, Manager            |

### Page Layout

The `/distribution` page has **two sections** via internal tabs:

1. **SMTP Config** — collapsible card at the top (migrated from Settings → Email)
2. **Distribution Rules** — the main content: a list/table of rules with CRUD

---

## Data Model

### `distribution_rules` table (SQLite)

```sql
CREATE TABLE IF NOT EXISTS distribution_rules (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    report_id     TEXT NOT NULL,          -- references a saved report template
    report_type   TEXT NOT NULL DEFAULT 'table',  -- 'table' | 'dashboard'
    format        TEXT NOT NULL DEFAULT 'pdf',     -- 'pdf' | 'csv' | 'excel'
    recipients    TEXT NOT NULL,          -- JSON array of email addresses
    schedule_type TEXT NOT NULL DEFAULT 'daily',   -- 'daily' | 'weekly' | 'monthly' | 'cron'
    schedule_value TEXT,                  -- cron expression or day-of-week/month
    schedule_time TEXT NOT NULL DEFAULT '08:00',   -- HH:MM in 24h format
    timezone      TEXT NOT NULL DEFAULT 'UTC',
    enabled       INTEGER NOT NULL DEFAULT 1,
    last_run_at   TEXT,                   -- ISO timestamp
    last_status   TEXT,                   -- 'success' | 'failed' | null
    last_error    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Backend

### New file: `backend/distribution.py`

Core module containing:
- `init_distribution_db()` — creates table on startup (called from `app.py`)
- `get_rules()` / `get_rule(id)` / `create_rule(data)` / `update_rule(id, data)` / `delete_rule(id)`
- `run_rule(rule_id)` — generates report + sends email:
  1. Fetch report data via internal API (same pattern as `report_mailer.py`)
  2. Render to PDF/CSV/Excel
  3. Send via SMTP using `smtp_config.get_smtp_config()`
  4. Update `last_run_at`, `last_status`, `last_error`

### New file: `backend/distribution_scheduler.py`

Scheduler integration:
- On app startup, load all enabled rules and register APScheduler jobs
- When a rule is created/updated/deleted, sync the scheduler
- Each job calls `run_rule(rule_id)`

### API Routes (added to `app.py`)

| Method | Endpoint                               | Description                  |
|--------|----------------------------------------|------------------------------|
| GET    | `/api/distribution/rules`              | List all rules               |
| POST   | `/api/distribution/rules`              | Create a rule                |
| GET    | `/api/distribution/rules/<id>`         | Get single rule              |
| PUT    | `/api/distribution/rules/<id>`         | Update a rule                |
| DELETE | `/api/distribution/rules/<id>`         | Delete a rule                |
| POST   | `/api/distribution/rules/<id>/run`     | Manual trigger (run now)     |
| GET    | `/api/distribution/rules/<id>/history` | Last N run results (future)  |

### SMTP changes

- **Remove** the global `recipient` field from `smtp_config.json` — recipients are now per-rule
- **Keep** `smtp_server`, `smtp_port`, `username`, `password`, `tls`, `from_address`
- Fix password handling: backend should never send `********` to frontend; use an empty string and a `password_is_set: true` flag instead
- Fix TLS logic: respect the `tls` field instead of only checking port number

---

## Frontend

### New files

| File | Purpose |
|------|---------|
| `Frontend/src/Pages/Distribution/DistributionPage.jsx` | Top-level page with SMTP card + rules list |
| `Frontend/src/Pages/Distribution/SmtpSection.jsx` | Collapsible SMTP config card (migrated from EmailSettings) |
| `Frontend/src/Pages/Distribution/RulesList.jsx` | Table of distribution rules with status badges |
| `Frontend/src/Pages/Distribution/RuleForm.jsx` | Create/edit rule modal or slide-over |
| `Frontend/src/Pages/Distribution/RecipientInput.jsx` | Tag-style multi-email input component |
| `Frontend/src/API/distributionApi.js` | Axios calls for distribution CRUD + trigger |

### Modified files

| File | Change |
|------|--------|
| `Frontend/src/Data/Navbar.js` | Add Distribution item (Send icon, `/distribution`, Admin+Manager) |
| `Frontend/src/Routes/AppRoutes.jsx` | Add `/distribution` route with ProtectedRoute |
| `Frontend/src/Pages/Settings/SettingsHome.jsx` | Remove "Email / SMTP" tab |

### Removed files

| File | Reason |
|------|--------|
| `Frontend/src/Pages/Settings/Email/EmailSettings.jsx` | Replaced by `SmtpSection.jsx` inside Distribution page |

### UI Details

**SMTP Section** (top of page, collapsible):
- Server, Port, Username, Password (with show/hide + `password_is_set` indicator), From Address
- TLS toggle wired to actual backend behavior (SSL vs STARTTLS)
- Save + Test buttons; test saves first then sends
- Collapsed by default if already configured (check `password_is_set`)

**Rules List** (main content):
- Columns: Name, Report, Recipients (truncated), Schedule, Format, Status, Last Run, Actions
- Status badges: Enabled (green) / Disabled (gray) / Failed (red)
- Actions: Edit, Toggle enable, Run now, Delete
- Empty state with "Create your first distribution rule" CTA
- Warning badge if linked report has been deleted

**Rule Form** (modal):
- Name (text)
- Report (dropdown — fetched from existing saved reports)
- Format (PDF / CSV / Excel radio)
- Recipients (tag input — type email, press Enter to add, click X to remove)
- Schedule type (Daily / Weekly / Monthly / Custom cron)
  - Daily: just time picker
  - Weekly: day-of-week selector + time
  - Monthly: day-of-month selector + time
  - Cron: raw cron expression input
- Timezone (dropdown, default UTC)
- Enabled toggle

---

## Implementation Order

### Phase 1 — Backend foundation
1. Create `distribution.py` with DB init + CRUD functions
2. Add API routes to `app.py`
3. Update `smtp_config.py` — remove `recipient` field, add `password_is_set` to GET response, fix TLS logic
4. Test CRUD via curl/Postman

### Phase 2 — Frontend page
5. Create `DistributionPage.jsx` with tab layout
6. Create `SmtpSection.jsx` (migrate + fix from EmailSettings)
7. Create `distributionApi.js`
8. Create `RulesList.jsx` with table and status badges
9. Create `RecipientInput.jsx` tag input
10. Create `RuleForm.jsx` modal
11. Update `Navbar.js`, `AppRoutes.jsx`, `SettingsHome.jsx`

### Phase 3 — Scheduler + execution
12. Create `distribution_scheduler.py` with APScheduler integration
13. Implement `run_rule()` — report generation + email sending
14. Wire scheduler to app startup
15. Add manual trigger endpoint

### Phase 4 — Polish
16. Run history / audit log (future enhancement)
17. Retry logic for failed sends
18. Notification when a linked report is deleted

---

## Bug Fixes (from previous review)

These are fixed as part of this work:

| Bug | Fix |
|-----|-----|
| Password shows as `********` in form | Use `password_is_set: true` flag, send empty string for display |
| TLS toggle does nothing | Backend reads `tls` field; if true and port != 465, use STARTTLS; if port == 465, always use SSL |
| Test email doesn't save first | Test button calls save then test in sequence |
| Single recipient only | Removed from SMTP config; recipients are per-rule with multi-email input |

---

## Verification Checklist

- [ ] Backend: `distribution_rules` table auto-created on startup
- [ ] API: CRUD operations work via curl
- [ ] Frontend: Distribution page appears in sidebar between Table Reports and Engineering
- [ ] SMTP section: save, test, password masking all work correctly
- [ ] Rules: create, edit, delete, toggle enable/disable
- [ ] Manual trigger: POST `/api/distribution/rules/<id>/run` generates and emails report
- [ ] Scheduler: enabled daily rule fires at configured time
- [ ] Edge case: deleted report shows warning badge on rule
- [ ] Role access: only Admin and Manager can see Distribution page
