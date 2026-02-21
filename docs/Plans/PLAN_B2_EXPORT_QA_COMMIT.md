# Plan B-2 — Export, Documentation, Full QA & Commit

> **Purpose:** PDF/PNG export feature, documentation update, comprehensive QA for all plans (A + B-1 + B-2), and gated commit/push.
>
> **Date:** 2026-02-19
> **Branch:** `demo-pipeline-wiring`
> **Project root:** `C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config`
> **Prerequisite:** BOTH Plan A AND Plan B-1 completed — backend settings APIs working, frontend settings pages exist, typography updated, tooltips added, LiveDataIndicator created, Silo SVG upgraded.
> **Followed by:** Nothing (this is the final plan).

---

## Wait for Signal Files (Run This FIRST)

Before executing any agent, poll for both completion signals from Plan A and Plan B-1:

```bash
echo "Waiting for Plan A and Plan B-1 to complete..."

# Poll every 30 seconds until both signal files exist
while true; do
  PLAN_A_DONE=false
  PLAN_B1_DONE=false

  if [ -f "C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\.plan_a_done" ]; then
    PLAN_A_DONE=true
  fi

  if [ -f "C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\.plan_b1_done" ]; then
    PLAN_B1_DONE=true
  fi

  if [ "$PLAN_A_DONE" = true ] && [ "$PLAN_B1_DONE" = true ]; then
    echo "Both Plan A and Plan B-1 are complete. Starting Plan B-2..."
    break
  fi

  if [ "$PLAN_A_DONE" = true ]; then
    echo "Plan A done. Waiting for Plan B-1..."
  elif [ "$PLAN_B1_DONE" = true ]; then
    echo "Plan B-1 done. Waiting for Plan A..."
  else
    echo "Waiting for both Plan A and Plan B-1..."
  fi

  sleep 30
done
```

**Only proceed to Agent 1 after BOTH signals are detected.**

If you are on Windows and the bash poll doesn't work, use this PowerShell alternative:

```powershell
Write-Host "Waiting for Plan A and Plan B-1 to complete..."
$root = "C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config"
while ($true) {
    $a = Test-Path "$root\.plan_a_done"
    $b = Test-Path "$root\.plan_b1_done"
    if ($a -and $b) { Write-Host "Both complete. Starting Plan B-2..."; break }
    elseif ($a) { Write-Host "Plan A done. Waiting for Plan B-1..." }
    elseif ($b) { Write-Host "Plan B-1 done. Waiting for Plan A..." }
    else { Write-Host "Waiting for both..." }
    Start-Sleep -Seconds 30
}
```

---

## Confirmed Architecture (Post-Plan A + Post-Plan B-1 — Do Not Change)

| Item | Confirmed Value |
|------|----------------|
| Flask port | `5001` |
| axios baseURL (dev) | `http://localhost:5001` |
| DB defaults | `postgres:Hercules@127.0.0.1:5432/dynamic_db_hercules` |
| Auth system | Flask-Login + Bearer tokens, 3 roles: admin/manager/operator |
| Settings tabs (post-Plan A) | 9 tabs in `SettingsHome.jsx` NAV_ITEMS |
| Settings routes (post-Plan A) | `email`, `shifts`, `users` routes in `AppRoutes.jsx` |
| SMTP config API (Plan A) | GET/POST `/api/settings/smtp-config`, POST `/api/settings/smtp-test` |
| Shifts config API (Plan A) | GET/POST `/api/settings/shifts` |
| User management API (Plan A) | PUT `/update-user/<id>`, POST `/change-password/<id>`, POST `/change-own-password` |
| Font (post-Plan B-1) | Inter + JetBrains Mono (Google Fonts CDN in `index.html`) |
| Light mode `:root` (post-Plan B-1) | Cool blue-gray hues (214) — warm grays removed |
| ColumnEditor (post-Plan B-1) | CSS variables replacing hardcoded hex in `TableWidget.jsx` |
| Tooltips (post-Plan B-1) | MUI Tooltips on Navbar, DarkMode, Canvas, Preview, WidgetToolbox |
| LiveDataIndicator (Plan B-1) | `Components/Common/LiveDataIndicator.jsx` — integrated in Preview toolbar |
| SiloWidget (post-Plan B-1) | 3D cylindrical SVG with metallic gradient, wave, glow effects |
| ReportBuilderPreview.jsx state | Modified by Plan B-1 Agents 2, 3 — has tooltips + LiveDataIndicator |
| ReportViewer.jsx state | Modified by Plan A Agent 3 — has shifts dropdown |
| html2canvas | v1.4.1 already installed |
| jspdf | NOT installed — Agent 1 will install |
| Print target | `#report-print-section` element, `@media print` CSS in `index.css` lines 234-252 |
| Report Builder CSS vars | `reportBuilderTheme.css` — `var(--rb-border)`, `var(--rb-panel)`, `var(--rb-surface)`, `var(--rb-text)`, `var(--rb-text-muted)`, `var(--rb-accent)` |

**Data flow:** Browser → axios → Flask (5001) → PostgreSQL (5432 local)

---

## Agent 1 — "Export PDF / PNG" (~15 min)

**Scope:** Frontend only. Add export utility + buttons in Preview and ReportViewer.
**Run:** New Claude Code session. Context: "Plan A and Plan B-1 completed. ReportBuilderPreview.jsx has tooltips + LiveDataIndicator. ReportViewer.jsx has shifts dropdown."
**Dependencies:** Plan A completed (ReportViewer has shifts), Plan B-1 completed (Preview has tooltips + indicator).

### Tasks

**1. Install jspdf:**

```bash
cd C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend
npm install jspdf
```

**2. Create export utility:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend\src\utils\exportReport.js

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export async function exportAsPNG(element, filename = 'report') {
  const originalBg = element.style.backgroundColor;
  element.style.backgroundColor = '#ffffff';

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  element.style.backgroundColor = originalBg;

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

export async function exportAsPDF(element, filename = 'report') {
  const originalBg = element.style.backgroundColor;
  element.style.backgroundColor = '#ffffff';

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  element.style.backgroundColor = originalBg;

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('landscape', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = canvas.width;
  const imgHeight = canvas.height;
  const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
  const x = (pdfWidth - imgWidth * ratio) / 2;
  const y = 0;

  pdf.addImage(imgData, 'PNG', x, y, imgWidth * ratio, imgHeight * ratio);
  pdf.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
}
```

**3. Add export to ReportBuilderPreview.jsx:**

```
Read the file first — Plan B-1 Agents 2-3 modified it (tooltips + LiveDataIndicator).

Import:
  import { exportAsPNG, exportAsPDF } from '../../utils/exportReport';

Add state:
  const [exporting, setExporting] = useState(false);

Add handlers:
  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const el = document.getElementById('report-print-section');
      await exportAsPDF(el, template?.name || 'report');
    } finally { setExporting(false); }
  };
  const handleExportPNG = async () => {
    setExporting(true);
    try {
      const el = document.getElementById('report-print-section');
      await exportAsPNG(el, template?.name || 'report');
    } finally { setExporting(false); }
  };

Find the existing Print button (search for "handlePrint" or "Print" in the toolbar area).
Replace it with an export dropdown:
  <div className="relative group">
    <Tooltip title="Export options" placement="bottom" arrow disableInteractive>
      <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-cyan-600 hover:bg-cyan-700 transition-colors">
        <FaPrint className="text-[10px]" />
        {exporting ? 'Exporting...' : 'Export'}
      </button>
    </Tooltip>
    <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
      <button onClick={handlePrint} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg">Print</button>
      <button onClick={handleExportPDF} disabled={exporting} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700">Export PDF</button>
      <button onClick={handleExportPNG} disabled={exporting} className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg">Export PNG</button>
    </div>
  </div>

NOTE: Keep the Tooltip from Plan B-1 Agent 2 — it wraps the trigger button.
```

**4. Add export to ReportViewer.jsx:**

```
File: Frontend/src/Pages/Reports/ReportViewer.jsx

Read the file first — Plan A's Agent 3 added shifts dropdown.

Import:
  import { exportAsPNG, exportAsPDF } from '../../utils/exportReport';

Add state: const [exporting, setExporting] = useState(false);

Find the existing Print button (search for "Print" or "print" in the toolbar/header area).
Add the same export dropdown pattern next to it, targeting the report content element.
Identify the report content element ID (search for "report-print-section" or add an id if none exists).
Do NOT disturb the shifts dropdown from Plan A.
```

### Verify

- Preview: hover "Export" button → dropdown: Print / Export PDF / Export PNG
- Click "Export PDF" → downloads clean A4 landscape PDF (no toolbar, white bg)
- Click "Export PNG" → downloads high-res PNG screenshot
- ReportViewer: same export options work
- Dark mode: exported files always have white background
- Silo widgets, charts render correctly in exports

### Failure Handling

| Problem | Fix |
|---------|-----|
| `jspdf` import error | Run `npm install jspdf` in Frontend directory |
| `jspdf` install fails (version conflict) | Try `npm install jspdf@latest --legacy-peer-deps` |
| `html2canvas` black output | Check `backgroundColor: '#ffffff'` in options, verify element.style.backgroundColor is set |
| PDF wrong size | Adjust ratio calculation — `Math.min(pdfWidth/imgWidth, pdfHeight/imgHeight)` should fit within A4 |
| Export captures toolbar | Target `#report-print-section` element, not the whole page |
| Dropdown not showing on hover | Check `group-hover:visible` CSS — might need `z-50` for layering above other elements |
| SVG not rendering in canvas | `html2canvas` handles inline SVG — ensure no external `<use>` references in SVGs |

### Success Criteria

- [ ] `jspdf` added to `package.json`
- [ ] `exportReport.js` utility created in `Frontend/src/utils/`
- [ ] Preview page: Export dropdown with Print/PDF/PNG options
- [ ] PDF exports clean A4 landscape (white background)
- [ ] PNG exports high-res screenshot (white background)
- [ ] ReportViewer has same export options
- [ ] Exports always white background regardless of dark mode
- [ ] Loading indicator ("Exporting...") during export

---

## Agent 2 — "Documentation Update" (~10 min)

**Scope:** Documentation only. Update LOCAL_DEV_SETUP.md with all changes from Plan A, Plan B-1, AND Plan B-2.
**Run:** New Claude Code session. Context: "Plan A, Plan B-1, and Agent 1 (Export) completed."
**Dependencies:** After Agent 1.

### Tasks

**1. Update `docs/LOCAL_DEV_SETUP.md`:**

```
Read the existing file first. Append a new section after the existing content:

## UI/UX Improvements (Plan A + Plan B-1 + Plan B-2)

### New API Routes (Plan A)

| Endpoint | Method | Auth Required | Description |
|----------|--------|--------------|-------------|
| `/api/settings/smtp-config` | GET | @login_required | Returns SMTP config (password masked) |
| `/api/settings/smtp-config` | POST | @login_required | Save SMTP configuration |
| `/api/settings/smtp-test` | POST | @login_required | Send test email |
| `/api/settings/shifts` | GET | @login_required | Returns shift schedule |
| `/api/settings/shifts` | POST | @login_required | Save shift schedule |
| `/update-user/<id>` | PUT | admin only | Update user's username/role |
| `/change-password/<id>` | POST | admin only | Reset any user's password |
| `/change-own-password` | POST | @login_required | Change own password |

### Updated Auth Guards (Plan A)

- `/add-user` now requires **admin** role (was unprotected)
- `/delete-user/<id>` now requires **admin** role (was @login_required only)

### New Config Files (Plan A — File-Based, Auto-Created)

| File | Purpose | Default Location |
|------|---------|-----------------|
| `backend/config/smtp_config.json` | SMTP email settings | Auto-created with empty defaults |
| `backend/config/shifts_config.json` | Shift schedule | Auto-created with 3 default shifts |

### New Frontend Pages (Plan A)

| Route | Component | Access |
|-------|-----------|--------|
| `/settings/users` | UserManagement.jsx | Admin + Manager |
| `/settings/email` | EmailSettings.jsx | All authenticated |
| `/settings/shifts` | ShiftsSettings.jsx | All authenticated |

### New Frontend Dependencies (Plan B-2)

| Package | Version | Purpose |
|---------|---------|---------|
| `jspdf` | latest | PDF export from Report Builder Preview and Report Viewer |

### Typography Changes (Plan B-1)

- **Body font**: Arial → Inter (Google Fonts CDN)
- **Mono font**: system default → JetBrains Mono (Google Fonts CDN)
- Light mode `:root` CSS variables shifted from warm hues (20/25/60) to cool blue-gray (214)
- Dark mode: **unchanged**

### UI Improvements (Plan B-1)

- **ColumnEditor**: dark mode fixed — hardcoded hex colors replaced with CSS variables
- **MUI Tooltips**: added to all toolbar buttons in Report Builder Canvas, Preview, Navbar, DarkModeButton, WidgetToolbox
- **LiveDataIndicator**: pulsing green dot with seconds counter in Report Builder Preview
- **Silo Widget**: upgraded from flat 2D rectangle to 3D cylindrical vessel with metallic gradient, wave animation, and zone glow effects

### Export Features (Plan B-2)

- **PDF Export**: A4 landscape PDF download from Report Builder Preview and Report Viewer
- **PNG Export**: High-res screenshot download from Report Builder Preview and Report Viewer
- Export dropdown replaces standalone Print button — includes Print / PDF / PNG options
- Exports always use white background regardless of dark mode setting

### Migration Notes

- **No DB schema changes** — users table unchanged
- **SMTP must be configured** via Settings > Email/SMTP before email delivery works
- `report_mailer.py` no longer has hardcoded credentials — configure via UI
- Google Fonts (Inter, JetBrains Mono) loaded via CDN — requires internet on first load, cached after
- Silo widget SVG rewritten — existing silo widgets auto-upgrade, no config changes needed
- `/user` route redirects to `/settings/users` — update bookmarks
- "User" nav item removed from sidebar — user management is in Settings > Users
- Login page no longer has "Create account" — accounts managed by admins via Settings
- Light mode color scheme shifted from warm gray to cool blue-gray
```

### Verify

```bash
grep "UI/UX Improvements" docs/LOCAL_DEV_SETUP.md
grep "smtp-config" docs/LOCAL_DEV_SETUP.md
grep "jspdf" docs/LOCAL_DEV_SETUP.md
grep "Inter" docs/LOCAL_DEV_SETUP.md
```

### Failure Handling

| Problem | Fix |
|---------|-----|
| File doesn't exist | Create it with full content from scratch |
| Content conflicts with existing | Append as new section — do not modify existing content |
| Feature not implemented by earlier agent | Mark it as "Pending" in docs; flag in QA results |
| Markdown formatting broken | Use a markdown linter or preview to verify tables render correctly |

### Success Criteria

- [ ] `docs/LOCAL_DEV_SETUP.md` has all new API routes documented
- [ ] Auth guard changes documented
- [ ] New config files documented
- [ ] New dependencies (`jspdf`) documented
- [ ] Typography changes documented (Plan B-1)
- [ ] UI improvements documented (Plan B-1)
- [ ] Export features documented (Plan B-2)
- [ ] Migration notes comprehensive

---

## Agent 3 — "Full QA & Debug Pipeline" (~30 min)

**Scope:** Full Plan A + Plan B-1 + Plan B-2 validation. Test everything, fix bugs, verify dark/light mode.
**Run:** New Claude Code session. Context: "All implementation agents across Plan A, Plan B-1, and Plan B-2 completed. Run full QA."
**Dependencies:** After Agent 2.

### Tasks

**1. Backend API Tests (Flask must be running on port 5001):**

```bash
# SMTP Config (Plan A)
curl http://localhost:5001/api/settings/smtp-config
# Expected: JSON with empty defaults or saved config

curl -X POST http://localhost:5001/api/settings/smtp-config -H "Content-Type: application/json" -d "{\"smtp_server\":\"smtp.gmail.com\",\"smtp_port\":465,\"username\":\"test@gmail.com\",\"password\":\"testpass\",\"tls\":true,\"from_address\":\"test@gmail.com\",\"recipient\":\"dest@gmail.com\"}"
# Expected: {"status": "saved"}

curl http://localhost:5001/api/settings/smtp-config
# Expected: password shows "********"

# Shifts Config (Plan A)
curl http://localhost:5001/api/settings/shifts
# Expected: default or saved shifts

# User Endpoints (Plan A)
curl http://localhost:5001/users
# Expected: array of users

# Regression: Existing endpoints still work
curl http://localhost:5001/api/tags?is_active=true
curl http://localhost:5001/api/settings/plc-config
curl http://localhost:5001/api/report-builder/templates
```

**2. Browser UI QA — Test each page in BOTH light and dark mode:**

```
Settings Pages (Plan A):
  □ /settings/email — form loads, save works, dark mode correct
  □ /settings/shifts — 3 default shifts, count selector, save, dark mode correct
  □ /settings/users — user list, add user (admin), edit, delete, dark mode correct
  □ /settings/system — regression check (unchanged)
  □ Tab strip shows 9 tabs correctly

Login Page (Plan A):
  □ No "Create account" button or modal
  □ Login still works correctly

Navigation (Plan A):
  □ /user redirects to /settings/users
  □ Sidebar has no "User" link

Typography (Plan B-1):
  □ Hard refresh → Network tab shows Inter font loading
  □ Light mode: cool blue-gray backgrounds (not warm/yellow)
  □ Dark mode: completely unchanged from before

Tooltips (Plan B-1):
  □ Navbar icon buttons — MUI tooltip with arrow on hover
  □ DarkModeButton — contextual tooltip text
  □ ReportBuilderCanvas toolbar — all buttons have MUI tooltips
  □ ReportBuilderPreview toolbar — all buttons have MUI tooltips
  □ WidgetToolbox — widget type buttons have MUI tooltips

ColumnEditor (Plan B-1):
  □ Open Report Builder → add Table widget → open ColumnEditor
  □ Dark mode: backgrounds dark, text readable, borders visible

LiveDataIndicator (Plan B-1):
  □ Preview toolbar shows pulsing green dot + "Xs ago" counter
  □ Counter increments every second
  □ Counter resets when new data arrives

Silo Widget (Plan B-1):
  □ Add Silo widget → 3D cylindrical vessel renders (not flat rectangle)
  □ Fill animation smooth (0.3s transition)
  □ Zone colors: green < 70, amber 70-90, red > 90
  □ Glow: red pulse < 20%, green glow > 80%
  □ Percentage text overlaid

Export (Plan B-2):
  □ Preview: Export dropdown with Print / PDF / PNG options
  □ Export PDF → downloads clean A4 landscape PDF (white bg)
  □ Export PNG → downloads high-res screenshot (white bg)
  □ ReportViewer: same export options work
  □ "Exporting..." loading state visible during export

Report Viewer:
  □ Time preset "Shift" → dropdown with configured shifts
  □ Selecting shift sets correct time range
  □ Export options work alongside shifts dropdown
```

**3. Dark/Light Mode Sweep:**

```
Toggle dark mode on EVERY changed page:
  □ /settings/email
  □ /settings/shifts
  □ /settings/users
  □ Report Builder (Canvas + Preview)
  □ Report Viewer
  □ Login page
  □ Settings tab strip

All pages must look correct in both modes.
```

**4. Bug Fix Cycle:**

```
For each bug found:
1. Log the bug (page, description, expected vs actual)
2. Identify root cause (browser console, Network tab, Flask logs)
3. Fix the code
4. Re-test the fix
5. Regression check: verify fix didn't break anything else
```

**5. Final Smoke Test:**

```
1. Hard refresh (Ctrl+Shift+R) — zero console errors
2. Navigate all 9 settings tabs in sequence
3. Report Builder → add Silo widget → preview → 3D vessel renders
4. Report Builder Preview → LiveDataIndicator pulsing
5. Report Builder Preview → tooltips on all buttons
6. Export PDF + PNG from Preview
7. ReportViewer → all time presets including Shift
8. Export PDF + PNG from ReportViewer
9. Toggle dark/light on every page
10. Log out → log back in → auth works
11. All API endpoints respond correctly
```

**6. Write QA results to `docs/QA_DEBUG_LOG.md` (append to existing or create):**

```markdown
## Full QA Results (Plan A + Plan B-1 + Plan B-2)

- **Date:** <actual date>
- **Plan A — Settings pages:** <pass/fail>
- **Plan A — Login cleanup:** <pass/fail>
- **Plan A — Navigation:** <pass/fail>
- **Plan A — Backend APIs:** <pass/fail>
- **Plan B-1 — Typography:** <pass/fail>
- **Plan B-1 — Light mode color fix:** <pass/fail>
- **Plan B-1 — Tooltips:** <pass/fail>
- **Plan B-1 — ColumnEditor dark mode:** <pass/fail>
- **Plan B-1 — LiveDataIndicator:** <pass/fail>
- **Plan B-1 — Silo Widget SVG:** <pass/fail>
- **Plan B-2 — Export PDF/PNG:** <pass/fail>
- **Dark/Light mode sweep:** <pass/fail>
- **Existing features regression:** <pass/fail>
- **Bugs found and fixed:** <list>
- **Console errors:** <count>
- **Status:** ALL PASS / NEEDS FIXES
```

### Failure Handling

| Problem | Fix |
|---------|-----|
| Settings page not rendering | Check `AppRoutes.jsx` — route must be inside `<Route path="settings">` parent |
| Dark mode colors wrong on new pages | Compare against SystemSettings.jsx classes: `dark:bg-[#0d1825]`, `dark:border-[#1e2d40]`, `dark:text-[#e1e8f0]` |
| Tooltip flicker or z-index issue | Add `z-50` to tooltip parent; check `disableInteractive` prop is set |
| Export captures toolbar | Target `#report-print-section` element, not the whole page |
| Font not loading | Check `index.html` `<head>` — `<link>` tags must be present and accessible |
| Console errors on page load | Check browser console for missing imports, undefined state, or 404 API calls |
| Silo widget not rendering | Check SiloWidget.jsx — viewBox must be `"0 0 100 118"`, function signature unchanged |

### Success Criteria (ALL must pass before proceeding to Agent 4)

- [ ] All 9 settings pages render correctly in both light and dark mode
- [ ] User management CRUD works for admin
- [ ] Login page clean (no create account)
- [ ] Inter font loading, cool blue-gray light mode
- [ ] All toolbar buttons have MUI tooltips (Canvas, Preview, Navbar, DarkMode)
- [ ] ColumnEditor readable in dark mode
- [ ] LiveDataIndicator pulsing in Preview toolbar
- [ ] Silo Widget renders 3D with glow effects and wave animation
- [ ] PDF + PNG export works from both Preview and ReportViewer
- [ ] Shift preset works in ReportViewer
- [ ] Zero console errors on any page
- [ ] All existing API endpoints still respond correctly
- [ ] Dark/Light mode sweep passes on all pages

---

## Agent 4 — "Commit & Push" (ONLY After Agent 3 QA Passes 100%)

**Scope:** Git commit and push. This agent MUST NOT run until Agent 3 reports ALL success criteria passed.
**GATE:** If ANY Agent 3 test fails, go back to the failing agent (in Plan A, Plan B-1, or Plan B-2), fix the issue, re-run Agent 3 QA, then return here.
**Run:** New Claude Code session. Context: "All plans completed. All QA tests passed 100%."

### Tasks

**1. Verify git status:**

```bash
cd C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config
git status
```

Expected modified/new files from ALL plans:

**From Plan A:**
* `backend/smtp_config.py` (new)
* `backend/shifts_config.py` (new)
* `backend/app.py` (modified — 5 settings routes + 3 user endpoints + auth guards)
* `backend/report_mailer.py` (modified — wired SMTP config)
* `Frontend/src/Pages/Settings/EmailSettings.jsx` (new)
* `Frontend/src/Pages/Settings/ShiftsSettings.jsx` (new)
* `Frontend/src/Pages/Settings/UserManagement.jsx` (new)
* `Frontend/src/Pages/Settings/SettingsHome.jsx` (modified — 9 tabs)
* `Frontend/src/Routes/AppRoutes.jsx` (modified — new settings routes)
* `Frontend/src/api/endpoints.js` (modified — user endpoints)
* `Frontend/src/Pages/Login/Login.jsx` (modified — removed create account)
* `Frontend/src/Components/Navbar/Navbar.js` (modified — removed User nav item)
* `Frontend/src/Pages/Reports/ReportViewer.jsx` (modified — shifts dropdown + export)

**From Plan B-1:**
* `Frontend/index.html` (modified — Google Fonts links)
* `Frontend/tailwind.config.js` (modified — font families)
* `Frontend/src/index.css` (modified — font + :root color fix)
* `Frontend/src/Pages/ReportBuilder/widgets/TableWidget.jsx` (modified — ColumnEditor dark mode)
* `Frontend/src/Components/Navbar/Navbar.jsx` (modified — MUI tooltips)
* `Frontend/src/Components/Common/DarkModeButton.jsx` (modified — MUI tooltip)
* `Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx` (modified — MUI tooltips)
* `Frontend/src/Pages/ReportBuilder/ReportBuilderPreview.jsx` (modified — tooltips + LiveDataIndicator + export)
* `Frontend/src/Pages/ReportBuilder/panels/WidgetToolbox.jsx` (modified — MUI tooltips)
* `Frontend/src/Components/Common/LiveDataIndicator.jsx` (new)
* `Frontend/src/Pages/ReportBuilder/widgets/SiloWidget.jsx` (modified — 3D SVG)

**From Plan B-2:**
* `Frontend/src/utils/exportReport.js` (new)
* `Frontend/package.json` (modified — jspdf added)
* `Frontend/package-lock.json` (modified — jspdf added)
* `docs/LOCAL_DEV_SETUP.md` (modified — documentation updated)
* `docs/QA_DEBUG_LOG.md` (modified/new — QA results)

**Do NOT commit:** `backend/.env`, `backend/config/*.json`, `node_modules/`, `.plan_a_done`, `.plan_b1_done`

**2. Verify `.gitignore`:**

```bash
grep ".env" .gitignore
grep "node_modules" .gitignore
```

**3. Stage files — Plan A:**

```bash
git add backend/smtp_config.py
git add backend/shifts_config.py
git add backend/app.py
git add backend/report_mailer.py
git add "Frontend/src/Pages/Settings/EmailSettings.jsx"
git add "Frontend/src/Pages/Settings/ShiftsSettings.jsx"
git add "Frontend/src/Pages/Settings/UserManagement.jsx"
git add "Frontend/src/Pages/Settings/SettingsHome.jsx"
git add "Frontend/src/Routes/AppRoutes.jsx"
git add "Frontend/src/api/endpoints.js"
git add "Frontend/src/Pages/Login/Login.jsx"
git add "Frontend/src/Components/Navbar/Navbar.js"
```

**4. Stage files — Plan B-1:**

```bash
git add Frontend/index.html
git add Frontend/tailwind.config.js
git add Frontend/src/index.css
git add "Frontend/src/Pages/ReportBuilder/widgets/TableWidget.jsx"
git add "Frontend/src/Components/Navbar/Navbar.jsx"
git add "Frontend/src/Components/Common/DarkModeButton.jsx"
git add "Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx"
git add "Frontend/src/Pages/ReportBuilder/ReportBuilderPreview.jsx"
git add "Frontend/src/Pages/ReportBuilder/panels/WidgetToolbox.jsx"
git add "Frontend/src/Components/Common/LiveDataIndicator.jsx"
git add "Frontend/src/Pages/ReportBuilder/widgets/SiloWidget.jsx"
```

**5. Stage files — Plan B-2:**

```bash
git add "Frontend/src/utils/exportReport.js"
git add "Frontend/src/Pages/Reports/ReportViewer.jsx"
git add Frontend/package.json Frontend/package-lock.json
git add docs/LOCAL_DEV_SETUP.md
git add docs/QA_DEBUG_LOG.md
```

**6. Commit:**

```bash
git commit -m "$(cat <<'EOF'
UI/UX improvements pipeline: settings infra, polish, and export

Plan A — Backend + Settings Infrastructure:
- Add SMTP config module (smtp_config.py) with TTL cache
- Add Shifts config module (shifts_config.py) with TTL cache
- Add 5 new settings API routes (SMTP GET/POST/test, Shifts GET/POST)
- Add 3 new user management endpoints (update, change-password, change-own-password)
- Add @require_role decorator for admin-only routes
- Add @login_required to all new settings routes
- Create Email, Shifts, and User Management settings pages
- Wire shifts into ReportViewer time presets
- Remove create-account from Login page
- Retire standalone /user page (redirect to /settings/users)

Plan B-1 — UI/UX Polish:
- Replace Arial with Inter + JetBrains Mono (Google Fonts CDN)
- Fix light mode :root CSS from warm gray to cool blue-gray (hue 214)
- Fix ColumnEditor dark mode (replace hardcoded hex with CSS variables)
- Add MUI Tooltips to all toolbar buttons (Canvas, Preview, Navbar, DarkMode, WidgetToolbox)
- Add LiveDataIndicator component (pulsing green dot with seconds counter)
- Upgrade Silo Widget SVG to 3D cylindrical vessel with metallic gradient, wave, and glow

Plan B-2 — Export & QA:
- Add PDF/PNG export to Report Builder Preview and Report Viewer
- Install jspdf dependency
- Update LOCAL_DEV_SETUP.md with all changes documentation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**7. Push:**

```bash
git push -u origin demo-pipeline-wiring
```

**8. Clean up signal files:**

```bash
rm -f "C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\.plan_a_done"
rm -f "C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\.plan_b1_done"
```

These were temporary coordination files and should not remain in the project.

**9. Verify:**

```bash
git log --oneline -2
# Must show the combined commit

git status
# Must show clean working tree

git show HEAD --name-only | head -40
# Verify no .env or config/*.json files
```

### Failure Handling

| Problem | Fix |
|---------|-----|
| `backend/.env` accidentally staged | `git reset HEAD backend/.env` |
| `node_modules/` staged | `git reset HEAD node_modules/` — verify `.gitignore` covers it |
| Push rejected (remote has new commits) | `git pull origin demo-pipeline-wiring --rebase` then push again |
| Merge conflict during push | Resolve conflicts, re-stage, create new commit, push |
| `.gitignore` missing entries | Add `.env`, `node_modules/`, `backend/config/*.json` before committing |
| Stale lock file | Delete `.git/index.lock` if no other git process is running |

### Success Criteria

- [ ] `git log --oneline -1` shows the combined commit
- [ ] `git status` shows clean working tree
- [ ] No secrets or runtime files in commit (`backend/.env`, `backend/config/*.json`)
- [ ] Push succeeded to `origin/demo-pipeline-wiring`
- [ ] Commit message lists all Plan A + Plan B-1 + Plan B-2 changes
- [ ] Signal files `.plan_a_done` and `.plan_b1_done` deleted from project root

---

## Full Execution Sequence

```
[PREREQUISITE: Plan A completed + Plan B-1 completed]
                    |
Agent 1 (Export PDF/PNG)        ← Utility + UI, ~15 min
  |
  +-- Agent 2 (Documentation)  ← Docs update, ~10 min
        |
        +-- Agent 3 (Full QA)  ← ALL plans testing, ~30 min
              |
              +-- Agent 4 (Commit & Push) ← ONLY if QA 100%, ~5 min
```

**Total estimated time:** ~60 minutes
**Hard gate:** Agent 4 (Commit & Push) is blocked until Agent 3 reports 100% pass on ALL success criteria across Plan A, Plan B-1, and Plan B-2.

---

## Per-Agent Prompt Template

```
You are executing Agent N — "<Name>" from Plan B-2: Export, QA & Commit.

Project root: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config
Active branch: demo-pipeline-wiring

Read the execution plan at: docs/Plans/PLAN_B2_EXPORT_QA_COMMIT.md

Context: Plan A and Plan B-1 are fully completed. [paste additional context here]

Your ONLY job is to execute the tasks in the "Agent N" section of the plan.
Read ALL referenced files BEFORE modifying them.
Follow every step exactly as documented.
Follow every failure handling instruction if you encounter issues.
Verify success criteria before reporting done.
Do NOT modify any files outside your agent's scope.
Report the exact verification output for each success criterion.
```

---

## Execution Results

_(To be filled after pipeline execution)_

- **Date:**
- **Branch:** demo-pipeline-wiring
- **Agents completed:** /4
- **Export utility created:**
- **Documentation updated:**
- **QA pass rate:**
- **Bugs found and fixed:**
- **Commit hash:**
- **Status:**
