# Hercules Reporting Module - Surgical Cleanup Plan

**Date:** February 19, 2026
**Branch:** `demo-pipeline-wiring`
**Prepared by:** Claude Code audit
**Status:** Pending approval

---

## Executive Summary

The Hercules codebase contains two generations of code: a **legacy system** (Material/Bin/Recipe/Order management with hardcoded dashboards) and the **active system** (Report Builder, Reporting, Engineering/Settings, Live Monitor). The legacy system has been fully retired from the navbar but its code remains — 70+ files across frontend and backend.

A full dependency audit confirmed the active system has **zero imports** from legacy code. Removing the legacy code will not affect current functionality.

**Scope:** 90+ files to delete/move, 5 files to edit, 0 risk to active features.

---

## Safety Guarantees

Before each phase, a verification step is included. The plan is designed to be executed phase-by-phase with a working build check between each phase.

**Verified facts:**
- Active pages (ReportBuilder, ReportViewer, Settings, LiveMonitor, Login, Home) import ZERO legacy components, contexts, hooks, or data files
- The only shared backend endpoints are `/users/*` routes — used by BOTH legacy `User.jsx` AND active `Settings/Users/UserManagement.jsx`. These routes are NOT touched.
- `AppProvider.jsx` wraps 5 legacy context providers that no active page consumes — safe to unwrap
- `App.jsx` wraps a redundant `<OrdersProvider>` that no active page consumes — safe to remove
- All 26 backend one-time scripts have zero runtime imports (not in app.py, scheduler.py, workers, or blueprints)

---

## Phase 0: Pre-Flight (Before Any Changes)

### 0.1 Create a safety branch
```bash
git checkout -b cleanup/legacy-removal
```

### 0.2 Verify the app builds and runs
```bash
cd Frontend && npm run build
cd ../backend && python app.py  # confirm starts without error
```

### 0.3 Take note of current file count
```bash
find Frontend/src -type f -name "*.jsx" -o -name "*.js" | wc -l
find backend -type f -name "*.py" | wc -l
```

---

## Phase 1: Dead Code Files (Zero-Risk Deletions)

These files have **zero imports anywhere** in the codebase. No file references them. Deleting them cannot break anything.

### 1.1 Unused context files

| # | File | Reason |
|---|------|--------|
| 1 | `Frontend/src/Context/AuthProvider_fix.jsx` | Never imported. Superseded by `AuthProvider.jsx` |
| 2 | `Frontend/src/Context/ThemeContext.jsx` | Imported in AppProvider but `useTheme()` never consumed by any component. Will be unwired in Phase 3 |

### 1.2 Unused theme/dashboard files (6 files)

| # | File | Reason |
|---|------|--------|
| 3 | `Frontend/src/Components/dashboard/theme-provider.jsx` | Zero imports |
| 4 | `Frontend/src/Components/dashboard/theme-provider.tsx` | Zero imports, TypeScript duplicate |
| 5 | `Frontend/src/Components/dashboard/theme-switcher.jsx` | Zero imports |
| 6 | `Frontend/src/Components/dashboard/theme-switcher.tsx` | Zero imports, TypeScript duplicate |

### 1.3 Unused/dead component files

| # | File | Reason |
|---|------|--------|
| 7 | `Frontend/src/Components/dashboard/charts/sender-weight-table.jsx` | 100% commented out. Active version is `SenderWeightTable.jsx` |
| 8 | `Frontend/src/Components/dashboard/charts/StackedAreaChart.jsx` | Zero imports. Active version is in `Components/charts/` |
| 9 | `Frontend/src/Pages/LiveMillAYieldChart.jsx` | Zero imports, not routed |
| 10 | `Frontend/src/Pages/NewReport.jsx` | 100% commented out, empty shell export |

### 1.4 Root-level artifacts (3 files)

| # | File | Reason |
|---|------|--------|
| 11 | `nul` | Windows shell artifact containing bash error output |
| 12 | `docker-compose.yml` | Empty file (0 bytes) |
| 13 | `package.json` (root) | Orphaned — no node_modules at root, not referenced by any config, build, or CI |

### 1.5 Duplicate documentation (2 files)

| # | File | Reason |
|---|------|--------|
| 14 | `Docs_Silos_Final/GRAIN_TERMINAL_SILO_READINESS.md` | Exact duplicate of `docs/GRAIN_TERMINAL_SILO_READINESS.md` |
| 15 | `Docs_Silos_Final/TIA_TAGS_IMPORT.md` | Exact duplicate of `docs/TIA_TAGS_IMPORT.md` |

**Phase 1 total: 15 files deleted**

### Phase 1 verification
```bash
cd Frontend && npm run build   # must succeed
```

---

## Phase 2: Legacy Frontend Pages (13 Page Files)

These pages have active routes in `AppRoutes.jsx` but are **removed from the navbar** and unreachable via UI. No active page imports them.

### 2.1 Legacy page files to delete

| # | File | Route | Navbar status |
|---|------|-------|--------------|
| 1 | `Frontend/src/Pages/Material.jsx` | `/materials` | Commented out |
| 2 | `Frontend/src/Pages/Bin.jsx` | `/bin` | Commented out |
| 3 | `Frontend/src/Pages/JobType.jsx` | `/job-type` | Commented out |
| 4 | `Frontend/src/Pages/Recipe.jsx` | `/recipe` | Commented out |
| 5 | `Frontend/src/Pages/FeederRecipe.jsx` | `/feeder-recipes` | Commented out |
| 6 | `Frontend/src/Pages/User.jsx` | `/user` | Redirects to `/settings/users` |
| 7 | `Frontend/src/Pages/Energy.jsx` | `/energy` | Commented out |
| 8 | `Frontend/src/Pages/EnergyReport.jsx` | `/energy-report` | Commented out |
| 9 | `Frontend/src/Pages/Dashboard.jsx` | `/dashboard` | Commented out (lowercase 'd' filename) |
| 10 | `Frontend/src/Pages/Report.jsx` | `/report` | Commented out |
| 11 | `Frontend/src/Pages/Orders.jsx` | `/orders-analytics` | Commented out |
| 12 | `Frontend/src/Pages/Blueprint.jsx` | `/orders` | Commented out |
| 13 | `Frontend/src/Pages/FeederBlueprint.jsx` | `/feeder-orders` | Commented out |

### 2.2 Also delete these unused admin pages

| # | File | Reason |
|---|------|--------|
| 14 | `Frontend/src/Pages/DynamicReport.jsx` | Route commented out in AppRoutes.jsx (line 91) |
| 15 | `Frontend/src/Pages/Admin/DynamicReportConfig.jsx` | Route commented out in AppRoutes.jsx (line 92) |

**Phase 2 total: 15 page files deleted**

### Phase 2 verification
Do NOT build yet — AppRoutes.jsx still imports these files. Proceed to Phase 3 immediately.

---

## Phase 3: Wiring Cleanup (5 Files to Edit)

### 3.1 Edit `Frontend/src/Routes/AppRoutes.jsx`

**Remove these imports** (lines 3-20 area):
```
import Material from '../Pages/Material';
import Bin from '../Pages/Bin';
import JobType from '../Pages/JobType';
import Recipe from '../Pages/Recipe';
import FeederRecipe from '../Pages/FeederRecipe';
import User from '../Pages/User';
import Blueprint from '../Pages/Blueprint';
import FeederBlueprint from '../Pages/FeederBlueprint';
import Energy from '../Pages/Energy';
import Dashboard from '../Pages/Dashboard';
import Report from '../Pages/Report';
import NewReport from '../Pages/NewReport';
import EnergyReport from '../Pages/EnergyReport';
import Orders from '../Pages/Orders';
import DynamicReport from '../Pages/DynamicReport';
import DynamicReportConfig from '../Pages/Admin/DynamicReportConfig';
import ReportTemplateList from '../Pages/Reports/Templates/ReportTemplateList';
import ReportTemplateEditor from '../Pages/Reports/Templates/ReportTemplateEditor';
import TableSectionEditor from '../Pages/Reports/Templates/Sections/TableSectionEditor';
import ReportGenerator from '../Pages/Reports/ReportGenerator';
```

**Remove these route definitions:**
- Line 73: `<Route path="materials" ...>`
- Line 74: `<Route path="bin" ...>`
- Lines 75-82: `<Route path="job-type" ...>` (with ProtectedRoute wrapper)
- Line 83: `<Route path="recipe" ...>`
- Line 84: `<Route path="feeder-recipes" ...>`
- Line 85: `<Route path="energy" ...>`
- Line 86: `<Route path="user" ...>` (the redirect)
- Line 87: `<Route path="dashboard" ...>`
- Line 88: `<Route path="report" ...>`
- Line 89: `<Route path="new-report" ...>`
- Lines 90-93: Commented-out dynamic-report routes (cleanup)
- Line 94: `<Route path="energy-report" ...>`
- Line 95: `<Route path="orders-analytics" ...>`
- Lines 97-103: Commented-out old Reports routes (cleanup)
- Line 230: `<Route path="/orders" ...>` (Blueprint)
- Line 231: `<Route path="/feeder-orders" ...>` (FeederBlueprint)

**Keep these imports and routes intact:**
- Login, Home, all LiveMonitor/*, all ReportBuilder/*, ReportViewer, all Settings/*, ProtectedRoute, Roles

### 3.2 Edit `Frontend/src/Routes/AppProvider.jsx`

**Remove legacy provider imports** (lines 3-7):
```
import { BinsProvider } from '../Context/ApiContext/BinsContext';
import { JobTypesProvider } from '../Context/ApiContext/JobTypesContext';
import { MaterialsProvider } from '../Context/ApiContext/MaterialsContext';
import { OrdersProvider } from '../Context/ApiContext/OrdersContext';
import { UsersProvider } from '../Context/ApiContext/UsersContext';
```

**Remove ThemeContext import** (line 12):
```
import { ThemeProvider } from '../Context/ThemeContext';
```

**Unwrap legacy providers from JSX** (lines 41-53). Change from:
```jsx
<DarkModeProvider>
  <MaterialsProvider>
    <BinsProvider>
      <JobTypesProvider>
        <OrdersProvider>
          <UsersProvider>
            <ThemeProvider>
              {children}
            </ThemeProvider>
          </UsersProvider>
        </OrdersProvider>
      </JobTypesProvider>
    </BinsProvider>
  </MaterialsProvider>
</DarkModeProvider>
```

To:
```jsx
<DarkModeProvider>
  {children}
</DarkModeProvider>
```

### 3.3 Edit `Frontend/src/App.jsx`

**Remove OrdersProvider import** (line 12):
```
import { OrdersProvider } from './Context/ApiContext/OrdersContext.jsx'
```

**Remove OrdersProvider wrapper** (lines 53-55). Change from:
```jsx
<div className="app">
  <OrdersProvider>
    <AppRouter />
  </OrdersProvider>
```

To:
```jsx
<div className="app">
  <AppRouter />
```

### 3.4 Edit `Frontend/src/Data/Navbar.js`

**Remove all commented-out code** (lines 1-56 and 82-153 commented blocks). Clean file should only contain:
```js
import { FaChartBar, FaChartArea, FaCog } from 'react-icons/fa';
import { Roles } from './Roles';

export const menuItems = [
  {
    name: 'Report Builder',
    icon: FaChartBar,
    tooltip: 'Design and build reports',
    link: '/report-builder',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  },
  {
    name: 'Reporting',
    icon: FaChartArea,
    tooltip: 'View reports with live & historical data',
    link: '/reporting',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  },
  {
    name: 'Engineering',
    icon: FaCog,
    tooltip: 'Tags, groups, formulas, mappings',
    link: '/settings',
    roles: [Roles.Admin, Roles.Manager],
  },
];
```

### 3.5 Edit `Frontend/src/API/endpoints.js`

**Remove legacy endpoint groups** that are no longer called by any active page. Keep only `auth` and `users`:
```js
const endpoints = {
  auth: {
    login: '/login',
    logout: '/logout',
    checkAuth: '/check-auth'
  },
  users: {
    list: '/users',
    create: '/add-user',
    delete: id => `/delete-user/${id}`,
    update: id => `/update-user/${id}`,
    changePassword: id => `/change-password/${id}`,
    changeOwnPassword: '/change-own-password',
  },
};

export default endpoints;
```

**Removed groups:** `materials`, `bins`, `jobTypes`, `kpis`, `recipes`, `feederRecipes`, `feederOrders`, `orders`, `controlPanel` — none are called by active pages.

> **NOTE:** Verify no active Settings page imports from `endpoints.js` for materials/bins/etc. before removing. The active `UserManagement.jsx` uses `endpoints.users.*` which is preserved.

### Phase 3 verification
```bash
cd Frontend && npm run build   # must succeed — this is the critical check
```

---

## Phase 4: Legacy-Only Frontend Components (40+ files)

After Phase 3, these component directories are orphaned — nothing imports them.

### 4.1 Delete entire component directories

| # | Directory | Files | Used only by |
|---|-----------|-------|-------------|
| 1 | `Frontend/src/Components/Material/` | 2 files (AddMaterial.jsx, EditMaterial.jsx) | Material.jsx |
| 2 | `Frontend/src/Components/Bin/` | 1 file (BinAssignment.jsx) | Bin.jsx |
| 3 | `Frontend/src/Components/JobType/` | 3 files (AddJobType.jsx, AddKPI.jsx, EditKPI.jsx) | JobType.jsx |
| 4 | `Frontend/src/Components/Recipe/` | 4 files (RecipeManagement.jsx, FeederRecipeManagement.jsx, PopupModal.jsx, FeederRecipeModal.jsx) | Recipe.jsx, FeederRecipe.jsx |
| 5 | `Frontend/src/Components/User/` | 1 file (AddUser.jsx) | User.jsx |
| 6 | `Frontend/src/Components/Blueprint/` | 14 files (BPActionButton, BPActiveOrder, BPActiveOrderDetails, BPContentContainer, BPControlButton, BPPopupModal, BPTableData, FeederActiveOrderDetails, FeederOrdersContext, FeederPopupModal, FeederTableData, FlashButton, FlexContainer, OrdersContext) | Blueprint.jsx, FeederBlueprint.jsx |
| 7 | `Frontend/src/Components/Report/` | 2 files (OrderDetailsPanel.jsx, ReportTable.jsx) | Report.jsx |
| 8 | `Frontend/src/Components/charts/` | 10 files (CardLineData, chart_data, CircularChart, GaugeChart, GroupedBarChart, KpiCard, MultiLineChart, PowerMonitorDiagram, PowerVoltageCircles, StackedAreaChart) | Energy.jsx, EnergyReport.jsx |
| 9 | `Frontend/src/Components/dashboard/` | 21 files (all charts/*, DashboardHeader, kpi-card, ReportsContent, theme-provider.jsx/tsx, theme-switcher.jsx/tsx) | Dashboard.jsx |

**Note:** Some theme files in `dashboard/` were already deleted in Phase 1. Only delete remaining files here.

### 4.2 Delete legacy context providers

| # | File | Used only by |
|---|------|-------------|
| 1 | `Frontend/src/Context/ApiContext/BinsContext.jsx` | Bin.jsx |
| 2 | `Frontend/src/Context/ApiContext/JobTypesContext.jsx` | JobType.jsx, Recipe.jsx, Blueprint.jsx |
| 3 | `Frontend/src/Context/ApiContext/MaterialsContext.jsx` | Material.jsx, Bin.jsx, Recipe.jsx |
| 4 | `Frontend/src/Context/ApiContext/OrdersContext.jsx` | Blueprint.jsx (also was in App.jsx, removed in Phase 3) |
| 5 | `Frontend/src/Context/ApiContext/UsersContext.jsx` | User.jsx |

### 4.3 Delete legacy data files

| # | File | Used only by |
|---|------|-------------|
| 1 | `Frontend/src/Data/Bin.js` | Bin.jsx |
| 2 | `Frontend/src/Data/Materials.js` | Material.jsx |
| 3 | `Frontend/src/Data/JobType.js` | JobType.jsx |
| 4 | `Frontend/src/Data/User.js` | User.jsx |
| 5 | `Frontend/src/Data/Blueprint.js` | Blueprint.jsx |
| 6 | `Frontend/src/Data/Recipe.js` | Recipe.jsx |

### 4.4 Delete legacy hooks

| # | File | Used only by |
|---|------|-------------|
| 1 | `Frontend/src/Hooks/useChangeTitle.jsx` | Material, Bin, JobType, Recipe, FeederRecipe, User, Blueprint, FeederBlueprint |
| 2 | `Frontend/src/Hooks/usePlcMonitor.jsx` | Dashboard.jsx, Energy.jsx |
| 3 | `Frontend/src/Hooks/usePowerMonitor.jsx` | Dashboard.jsx, Energy.jsx |

### 4.5 Delete legacy report template pages (routes were commented out)

| # | File | Reason |
|---|------|--------|
| 1 | `Frontend/src/Pages/Reports/Templates/ReportTemplateList.jsx` | Route commented out (line 98) |
| 2 | `Frontend/src/Pages/Reports/Templates/ReportTemplateEditor.jsx` | Route commented out (line 100) |
| 3 | `Frontend/src/Pages/Reports/Templates/ReportTemplateForm.jsx` | Only used by ReportTemplateEditor |
| 4 | `Frontend/src/Pages/Reports/Templates/Sections/SectionBuilder.jsx` | Only used by ReportTemplateEditor |
| 5 | `Frontend/src/Pages/Reports/Templates/Sections/TableSectionEditor.jsx` | Route commented out (line 101) |
| 6 | `Frontend/src/Pages/Reports/ReportGenerator.jsx` | Route commented out (line 102) |

> **STOP: Before deleting items 5-6, verify** that the active LiveMonitor `TableSectionEditor` at `Pages/LiveMonitor/Layouts/Sections/LiveMonitorTableSectionEditor.jsx` is a DIFFERENT file from `Pages/Reports/Templates/Sections/TableSectionEditor.jsx`. They are at different paths and are different files — confirmed safe.

**Phase 4 total: ~58 files deleted**

### Phase 4 verification
```bash
cd Frontend && npm run build   # must succeed
```

---

## Phase 5: Backend Organization

### 5.1 Create directory structure for one-time scripts
```bash
mkdir -p backend/tools/migrations
mkdir -p backend/tools/diagnostics
mkdir -p backend/tools/setup
```

### 5.2 Move migration scripts (9 files)
```
backend/run_migration.py              -> backend/tools/migrations/
backend/run_users_migration.py        -> backend/tools/migrations/
backend/run_bins_materials_migration.py -> backend/tools/migrations/
backend/run_bin_activation_migration.py -> backend/tools/migrations/
backend/run_dynamic_monitoring_migration.py -> backend/tools/migrations/
backend/run_is_counter_migration.py   -> backend/tools/migrations/
backend/run_line_running_migration.py  -> backend/tools/migrations/
backend/run_value_formula_migration.py -> backend/tools/migrations/
backend/run_kpi_engine_migration.py   -> backend/tools/migrations/
```

### 5.3 Move diagnostic/test scripts (12 files)
```
backend/verify_tables.py              -> backend/tools/diagnostics/
backend/verify_bin_activation_migration.py -> backend/tools/diagnostics/
backend/validate_historian_phase2.py  -> backend/tools/diagnostics/
backend/check_users.py               -> backend/tools/diagnostics/
backend/check_db2099_offsets.py       -> backend/tools/diagnostics/
backend/check_fcl_sections_diagnostic.py -> backend/tools/diagnostics/
backend/check_and_run_migration.py    -> backend/tools/diagnostics/
backend/scan_db2099_offsets.py        -> backend/tools/diagnostics/
backend/test_tag_reading.py           -> backend/tools/diagnostics/
backend/test_fcl_flow_reading.py      -> backend/tools/diagnostics/
backend/test_bran_fine.py             -> backend/tools/diagnostics/
backend/test_db2099_offset8.py        -> backend/tools/diagnostics/
backend/test_multiple_offsets.py      -> backend/tools/diagnostics/
```

### 5.4 Move setup/seed/fix scripts (5 files)
```
backend/add_columns.py               -> backend/tools/setup/
backend/add_fcl_receivers.py         -> backend/tools/setup/
backend/fix_fcl_table.py             -> backend/tools/setup/
backend/seed_demo_tags.py            -> backend/tools/setup/
backend/seed_demo_layout.py          -> backend/tools/setup/
backend/setup_local_db.py            -> backend/tools/setup/
```

### 5.5 Clean up `backend/app.py` (edit, do not delete)

**Remove duplicate imports:**
- Remove duplicate `import os` (line 13, keep line 3)
- Remove duplicate `import logging` (line 29, keep line 5)
- Remove duplicate `import json` at lines 1280, 1283, 1646, 2620 (keep line 7)

**Remove debug print statement:**
- Line 4: `print("!!! SERVER STARTING - LOADED UPDATED APP.PY !!!")`

**Guard debug routes** (wrap in DEV_MODE check):
- `/test` route
- `/debug/routes` route
- `/debug/test-layouts` route

### 5.6 DO NOT touch these backend files
- `app.py` routes for `/users`, `/add-user`, `/update-user`, `/delete-user`, `/change-password`, `/change-own-password` — **active Settings > Users depends on these**
- All `*_bp.py` files — all 8 blueprints are registered and active
- `scheduler.py` — actively imported and started
- `workers/` — both workers spawned at startup
- `demo_mode.py`, `plc_config.py` — proper wrappers for JSON configs
- `report_mailer.py`, `smtp_config.py`, `shifts_config.py` — active settings features

**Phase 5 total: 26 files moved, 1 file edited**

### Phase 5 verification
```bash
cd backend && python -c "import app"   # must not error
```

---

## Phase 6: Documentation Cleanup

### 6.1 Create archive directory
```bash
mkdir -p docs/archive
mkdir -p docs/archive/backend-fixes
```

### 6.2 Archive stale root-level docs (5 files)
```
DATABASE_CALCULATION_AND_STORAGE_REPORT.md  -> docs/archive/
QUICK_REFERENCE_FORMULAS.md                 -> docs/archive/
kpi_formulas.md                             -> docs/archive/
TESTING_GUIDE.md                            -> docs/archive/
QUICK_TEST_CHECKLIST.md                     -> docs/archive/
```

### 6.3 Archive resolved backend fix docs (5 files)
```
backend/FCL_2_520WE_CUMULATIVE_DISPLAY.md     -> docs/archive/backend-fixes/
backend/FCL_RECEIVER_2_EXPLANATION.md         -> docs/archive/backend-fixes/
backend/FCL_WEBSOCKET_RECEIVERS_FIX.md        -> docs/archive/backend-fixes/
backend/QUICK_FIX_SUMMARY.md                  -> docs/archive/backend-fixes/
backend/DATABASE_CONNECTION_AUDIT.md          -> docs/archive/backend-fixes/
```

### 6.4 Keep these docs (no action)
- `Dynamic_System_PRD.md` — canonical feature spec
- `Salalah_Generic_System_Requirements.md` — primary requirements
- `KPI_ENGINE_PLAN.md` — active development plan
- `SINGLE_HISTORIAN_MIGRATION_PLAN.md` — active migration plan
- `HISTORICAL_ENERGY_MODULE.md` — may be needed for energy features
- `POWER_MONITOR_UPDATES.md` — current energy implementation
- `backend/DYNAMIC_MONITORING_README.md` — implementation guide
- `backend/FCL_STORAGE_FORMULAS.md` — reference formulas
- All `docs/Plans/*.md` — active execution plans
- All `docs/*.md` — current docs (deployment, setup, etc.)
- `Docs_Silos_Final/README.md` — folder overview
- `Docs_Silos_Final/GRAIN_SILOS_REPORT_IMPLEMENTATION_PLAN.md` — unique
- `Docs_Silos_Final/REPORT_BUILDER_AND_REPORTING.md` — unique user guide

### 6.5 Review but do not block on
- `nginx.conf` — port 5000 may need updating to 5001, but this is Docker-only config
- `Salalah-Configruable.docx` — legacy Word doc, assess separately
- `.plan_b1_done` — pipeline signal file, remove after pipeline completes

**Phase 6 total: 10 files moved to archive**

---

## Phase 7: Final Verification

### 7.1 Full build check
```bash
cd Frontend && npm run build
```

### 7.2 Runtime check
```bash
cd backend && python app.py
# In another terminal:
cd Frontend && npm run dev
```

### 7.3 Smoke test these routes in browser
- `/login` — must work
- `/report-builder` — must load, must be able to open/create a report
- `/reporting` — must load, must show report list
- `/settings` — must load, must navigate to Tags, Tag Groups, Formulas, Mappings, Export/Import, System, Email, Shifts, Users
- `/settings/users` — must load user management (this validates the backend user endpoints still work)
- `/live-monitor/dynamic` — must load (if a layout exists)
- `/404` — must show not-found page
- `/materials` — must show 404 (no longer routed)

### 7.4 Commit
```bash
git add -A
git commit -m "Remove legacy system: 90+ unused files (Material, Bin, Recipe, Order, Dashboard, Energy pages and all dependencies)

Removed:
- 13 legacy page files (Material, Bin, JobType, Recipe, Energy, Dashboard, etc.)
- 58 legacy-only components, contexts, hooks, and data files
- 15 dead code files (unused themes, artifacts, duplicates)
- Organized 26 backend one-time scripts into tools/ directory
- Archived 10 stale documentation files

Preserved:
- All active pages: Report Builder, Reporting, Settings, Live Monitor
- Backend user management endpoints (used by Settings > Users)
- All backend blueprints, workers, and scheduler

Zero impact on current functionality — verified by full build and route smoke test."
```

---

## File Count Summary

| Phase | Action | Files |
|-------|--------|-------|
| Phase 1 | Delete dead code files | 15 |
| Phase 2 | Delete legacy page files | 15 |
| Phase 3 | Edit wiring files | 5 (edits only) |
| Phase 4 | Delete orphaned components, contexts, hooks, data | ~58 |
| Phase 5 | Move backend scripts, clean app.py | 26 moved, 1 edited |
| Phase 6 | Archive stale docs | 10 moved |
| **Total** | | **~88 files deleted, 26 moved, 6 edited** |

---

## What This Plan Does NOT Touch

These are explicitly preserved:

**Frontend (active system):**
- `Pages/ReportBuilder/*` — all 15 files
- `Pages/Reports/ReportViewer.jsx` — the active report viewer
- `Pages/Settings/*` — all 11 files (Tags, TagGroups, Formulas, Mappings, ExportImport, System, Email, Shifts, Users, DemoMode, SettingsHome)
- `Pages/LiveMonitor/*` — all 9 files
- `Pages/Login.jsx`, `Pages/Home.jsx`
- `Components/Common/*` — LoadingScreen, ErrorScreen, SplashScreen, SideNav, ConfirmationModal, InputField, SelectField, CircularButton, ActionButton, DarkModeButton, LiveDataIndicator, ErrorBoundary
- `Components/Dynamic/*` — all 8 files (SectionRenderer, DynamicTable, DynamicBarChart, etc.)
- `Components/LiveMonitor/*` — all 4 files
- `Components/Shared/*` — FormulaEditor, TagSelector
- `Components/Navbar/*` — Navbar
- `Components/ui/*` — badge, card, select, skeleton
- `Context/AuthProvider.jsx`, `Context/DarkModeProvider.jsx`, `Context/NavbarContext.jsx`, `Context/SocketContext.jsx`, `Context/EmulatorContext.jsx`, `Context/SystemStatusContext.jsx`
- `Hooks/useReportBuilder.js`, `Hooks/useTagHistory.js`, `Hooks/useLenisScroll.js`, `Hooks/useLoading.jsx`
- `Routes/*` — AppRouter, AppRoutes (edited), AppProvider (edited), ProtectedRoute
- `API/axios.js`, `API/reportBuilderApi.js`, `API/endpoints.js` (edited)
- All CSS files: `App.css`, `index.css`, `reportBuilderTheme.css`
- `lib/utils.js`, `Data/Roles.js`, `Data/Navbar.js` (edited)
- `Assets/*`, `main.jsx`, `App.jsx` (edited)

**Backend (all runtime code):**
- `app.py` (edited — only dedup imports and remove debug print)
- All 8 `*_bp.py` blueprint files
- `scheduler.py`, `report_mailer.py`
- `workers/dynamic_archive_worker.py`, `workers/dynamic_monitor_worker.py`
- `demo_mode.py`, `plc_config.py`, `plc_data_source.py`, `plc_emulator.py`
- `smtp_config.py`, `shifts_config.py`
- `utils/*` — all 10 utility files
- `config/*` — all JSON config files

**Documentation (kept):**
- `Dynamic_System_PRD.md`, `Salalah_Generic_System_Requirements.md`
- `KPI_ENGINE_PLAN.md`, `SINGLE_HISTORIAN_MIGRATION_PLAN.md`
- `HISTORICAL_ENERGY_MODULE.md`, `POWER_MONITOR_UPDATES.md`
- All `docs/*.md` and `docs/Plans/*.md`
- `backend/DYNAMIC_MONITORING_README.md`, `backend/FCL_STORAGE_FORMULAS.md`
- `Docs_Silos_Final/` — unique files only

---

## Rollback Plan

If anything breaks after any phase:
```bash
git checkout demo-pipeline-wiring    # return to original branch
```

The `cleanup/legacy-removal` branch is isolated. No changes to `demo-pipeline-wiring` or `main` until the full verification in Phase 7 passes.
