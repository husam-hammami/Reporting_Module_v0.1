# Plan A — Backend + Settings Infrastructure Execution Plan

> **Purpose:** Add SMTP/Shifts config backend modules, User Management role guards + new endpoints, Email/Shifts settings pages, User Management settings page, wire shifts into ReportViewer, clean up Login page, retire standalone `/user` page.
>
> **Date:** 2026-02-19
> **Branch:** `demo-pipeline-wiring`
> **Project root:** `C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config`
> **Prerequisite:** Demo Pipeline (Plan 0) completed — DB running, Flask working, tags seeded.
> **Followed by:** Plan B (UI/UX Polish, Export & QA)

---

## Confirmed Architecture (Codebase-Audited — Do Not Change)

| Item | Confirmed Value |
|------|----------------|
| Flask port | `5001` |
| axios baseURL (dev) | `http://localhost:5001` |
| DB defaults | `postgres:Hercules@127.0.0.1:5432/dynamic_db_hercules` |
| Auth system | Flask-Login + Bearer tokens (7-day `itsdangerous`), 3 roles: admin/manager/operator |
| DEV_MODE bypass | `DEV_MODE = true` in `app.py` bypasses auth for local testing |
| Config file pattern | `backend/config/*.json` with 5s TTL cache (see `plc_config.py`) |
| `plc_config.py` structure | `_CACHE_TTL_SEC = 5`, `_cache = {"data": None, "ts": 0}`, `CONFIG_DIR = os.path.join(...)`, `get_plc_config()`, `set_plc_config()` |
| PLC config routes end at | `app.py` line 227 (POST `/api/settings/plc-config` return statement) |
| `handle_db_errors` decorator | `app.py` line 315 |
| `/users` GET route | `app.py` line 538 — `@login_required` only |
| `/add-user` POST route | `app.py` line 548 — NO auth (security gap to fix) |
| `/delete-user/<id>` DELETE route | `app.py` line 575 — `@login_required` only (no role check) |
| `app.py` total lines | 2,990 |
| SMTP hardcoded in `report_mailer.py` | Lines 11-13: `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_RECIPIENT`; Line 163: `smtplib.SMTP_SSL("smtp.gmail.com", 465)` |
| Settings tab system | `NAV_ITEMS` array in `SettingsHome.jsx` (6 tabs) + nested `<Route>` in `AppRoutes.jsx` (last route: line 226 `path="system"`) |
| Settings styling reference | `SystemSettings.jsx` — Tailwind: `text-[12px]`, `rounded-lg`, `border-[#e3e9f0]`, `dark:border-[#1e2d40]`, `bg-[#f5f8fb]`, `dark:bg-[#0d1825]` |
| `endpoints.js` users section | Lines 10-14: `list: '/users'`, `create: '/add-user'`, `delete: id => '/delete-user/${id}'` |
| User nav item in `Navbar.js` | Lines 139-145: `{ name: 'User', link: '/user' }` |
| Login create account code | `Login.jsx` — schema (42-48), state (115-147), button (265-276), modal (279-350) |
| ReportViewer shift preset | `TIME_PRESETS` line 46: `{ id: 'shift', label: 'Shift' }`, placeholder at line 299-302 |

**Data flow:** Browser → axios → Flask (5001) → PostgreSQL (5432 local)

---

## Agent 1 — "SMTP + Shifts Backend" (~15 min)

**Scope:** Backend only. Create 2 config modules + 5 API routes + wire SMTP into report_mailer.
**Run:** Start a new Claude Code session and give it this agent's section.

### Tasks

**1. Read the reference config pattern:**

```
Read backend/plc_config.py — note the structure:
- _CACHE_TTL_SEC = 5
- _cache = {"data": None, "ts": 0}
- CONFIG_DIR = os.path.join(os.path.dirname(__file__), 'config')
- os.makedirs(CONFIG_DIR, exist_ok=True)
- get_*_config() reads JSON with TTL cache
- set_*_config(data) writes JSON and clears cache
```

**2. Create `backend/smtp_config.py`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\backend\smtp_config.py

Copy the plc_config.py cache/read/write pattern (TTL cache, CONFIG_DIR, os.makedirs, JSON read/write).
IMPORTANT: Unlike set_plc_config(ip, rack, slot) which takes separate keyword arguments,
set_smtp_config(data) takes a single dict argument. Do NOT copy the function signature — copy only the caching/file structure.

Functions:
- get_smtp_config() → returns dict
- set_smtp_config(data) → writes dict to config/smtp_config.json
- test_smtp_connection(to_email) → sends test email, returns success/error

Fields with defaults:
  smtp_server: ""
  smtp_port: 465
  username: ""
  password: ""
  tls: true
  from_address: ""
  recipient: ""

test_smtp_connection logic:
  - Read config via get_smtp_config()
  - If port 465: use smtplib.SMTP_SSL
  - If port 587 or other: use smtplib.SMTP + starttls()
  - Send a simple "Test email from Hercules" message
  - Return {"success": true} or {"success": false, "error": str(e)}
```

**3. Create `backend/shifts_config.py`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\backend\shifts_config.py

Same plc_config.py pattern. Functions:
- get_shifts_config() → returns dict
- set_shifts_config(data) → validates + writes to config/shifts_config.json

Fields with defaults:
  shift_count: 3
  shifts: [
    {name: "Morning", start: "06:00", end: "14:00"},
    {name: "Evening", start: "14:00", end: "22:00"},
    {name: "Night",   start: "22:00", end: "06:00"}
  ]

Validation in set_shifts_config:
  - shift_count must be 1-4
  - len(shifts) must match shift_count
  - Each shift must have name (non-empty), start (HH:MM), end (HH:MM)
  - Raise ValueError on validation failure
```

**4. Add 5 API routes to `backend/app.py`:**

```
Location: After line 227 (end of /api/settings/plc-config POST route)

SECURITY: All 5 routes MUST have @login_required decorator.
Decorator order: @app.route → @login_required → handler function.

Add these routes:

GET  /api/settings/smtp-config
  - @login_required
  - Call get_smtp_config()
  - Mask password: replace with "********" if non-empty
  - Return JSON

POST /api/settings/smtp-config
  - @login_required
  - Get JSON body
  - If password is "********", preserve existing password from get_smtp_config()
  - Call set_smtp_config(data)
  - Return {"status": "saved"}

POST /api/settings/smtp-test
  - @login_required
  - Get optional "to_email" from body (fallback to config's recipient)
  - Call test_smtp_connection(to_email)
  - Return result

GET  /api/settings/shifts
  - @login_required
  - Return get_shifts_config()

POST /api/settings/shifts
  - @login_required
  - Get JSON body
  - Call set_shifts_config(data) — let ValueError propagate as 400
  - Return {"status": "saved"}

Import at top of app.py:
  from smtp_config import get_smtp_config, set_smtp_config, test_smtp_connection
  from shifts_config import get_shifts_config, set_shifts_config
```

**5. Wire SMTP config into `backend/report_mailer.py`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\backend\report_mailer.py

Replace hardcoded constants (lines 11-13):
  EMAIL_USER = "imroz32492@gmail.com"
  EMAIL_PASS = "zsxb blon wooa dddh"
  EMAIL_RECIPIENT = "shaikhimroz350@gmail.com"

With:
  from smtp_config import get_smtp_config

Then in the send function (line ~163 where SMTP connection is made):
  cfg = get_smtp_config()
  EMAIL_USER = cfg.get('username', '')
  EMAIL_PASS = cfg.get('password', '')
  EMAIL_RECIPIENT = cfg.get('recipient', '')

  # Support both SSL (465) and STARTTLS (587)
  if cfg.get('smtp_port') == 465:
      server = smtplib.SMTP_SSL(cfg.get('smtp_server', 'smtp.gmail.com'), cfg['smtp_port'])
  else:
      server = smtplib.SMTP(cfg.get('smtp_server', 'smtp.gmail.com'), cfg.get('smtp_port', 587))
      server.starttls()
  server.login(EMAIL_USER, EMAIL_PASS)
```

### Verify

```bash
cd C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\backend
python -c "from smtp_config import get_smtp_config; print(get_smtp_config())"
python -c "from shifts_config import get_shifts_config; print(get_shifts_config())"
```

Then with Flask running:

```bash
curl http://localhost:5001/api/settings/smtp-config
curl http://localhost:5001/api/settings/shifts
curl -X POST http://localhost:5001/api/settings/shifts -H "Content-Type: application/json" -d "{\"shift_count\":2,\"shifts\":[{\"name\":\"Day\",\"start\":\"06:00\",\"end\":\"18:00\"},{\"name\":\"Night\",\"start\":\"18:00\",\"end\":\"06:00\"}]}"
curl http://localhost:5001/api/settings/shifts
```

### Failure Handling

| Problem | Fix |
|---------|-----|
| `ModuleNotFoundError: smtp_config` | Ensure file is in `backend/` directory, same level as `app.py` |
| Config dir doesn't exist | `os.makedirs(CONFIG_DIR, exist_ok=True)` must be in module-level code |
| `smtplib` import error | It's stdlib — no pip install needed |
| Password masking not working | Check the GET route replaces non-empty password with `"********"` |
| Shifts validation error on save | Ensure `shift_count` is int and `shifts` array length matches |
| `report_mailer.py` circular import | Import `smtp_config` at function level, not module level if needed |

### Success Criteria

- [ ] `backend/smtp_config.py` exists and `get_smtp_config()` returns defaults
- [ ] `backend/shifts_config.py` exists and `get_shifts_config()` returns 3 default shifts
- [ ] `GET /api/settings/smtp-config` returns JSON with masked password
- [ ] `POST /api/settings/smtp-config` saves and persists to `config/smtp_config.json`
- [ ] `GET /api/settings/shifts` returns default 3 shifts
- [ ] `POST /api/settings/shifts` validates and saves shifts
- [ ] `report_mailer.py` no longer has hardcoded email credentials

---

## Agent 2 — "User Role Guards + Endpoints" (After Agent 1 ✅)

**Scope:** Backend only. Add role-based access control + new user management endpoints to `app.py`.
**Run:** New Claude Code session. Context: "Agent 1 completed. SMTP + Shifts config modules and routes exist in app.py."

### Tasks

**1. Add `require_role` decorator to `backend/app.py`:**

```
Location: After the handle_db_errors decorator (around line 315)

from functools import wraps

def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'error': 'Not authenticated'}), 401
            if current_user.role not in roles:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator
```

**2. Lock down existing user endpoints:**

```
Find /add-user route (line ~548):
  - Add @login_required decorator
  - Add @require_role('admin') decorator AFTER @login_required

Find /delete-user/<id> route (line ~575):
  - Add @require_role('admin') decorator AFTER @login_required

Keep /users GET route (line ~538) as @login_required only (no role restriction)

Decorator order (top to bottom): @app.route → @login_required → @require_role
```

**3. Add 3 new user management endpoints:**

```
Add after the existing /delete-user route:

PUT /update-user/<int:user_id>
  - @login_required + @require_role('admin')
  - Get JSON body: {username, role}
  - Validate: role must be in ('admin', 'manager', 'operator')
  - Prevent last admin from being demoted:
    SELECT COUNT(*) FROM users WHERE role='admin' AND is_active=true
    If target user is admin AND new role != 'admin' AND admin_count <= 1, return 400
  - UPDATE users SET username=%s, role=%s WHERE id=%s
  - Return updated user data with 200

POST /change-password/<int:user_id>
  - @login_required + @require_role('admin')
  - Get JSON body: {new_password}
  - Validate: new_password length >= 2
  - Hash password with werkzeug.security.generate_password_hash
  - UPDATE users SET password_hash=%s WHERE id=%s
  - Return {"status": "password_changed"}

POST /change-own-password
  - @login_required (any role — no require_role needed)
  - Get JSON body: {current_password, new_password}
  - Verify current_password against current_user's password_hash using check_password_hash
  - If wrong: return 401 {"error": "Current password is incorrect"}
  - Validate: new_password length >= 2
  - Hash new_password, UPDATE users SET password_hash=%s WHERE id=%s (current_user.id)
  - Return {"status": "password_changed"}

Note: werkzeug.security is already imported in app.py (used by login route).
```

### Verify

```bash
# Check routes exist (Flask must be running)
curl -s -o /dev/null -w "%{http_code}" -X PUT http://localhost:5001/update-user/1 -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"role\":\"admin\"}"
# Expected: 200 (DEV_MODE) or 401 (auth required)

curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5001/change-password/1 -H "Content-Type: application/json" -d "{\"new_password\":\"newpass\"}"
# Expected: 200 or 401

curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5001/change-own-password -H "Content-Type: application/json" -d "{\"current_password\":\"old\",\"new_password\":\"new\"}"
# Expected: 200 or 401

# Verify add-user now has auth guard
grep -n "require_role" backend/app.py
# Should show require_role on add-user and delete-user routes
```

### Failure Handling

| Problem | Fix |
|---------|-----|
| `require_role` not found | Ensure it's defined BEFORE the route decorators that use it |
| Decorator order wrong | Must be: `@app.route(...)` → `@login_required` → `@require_role(...)` (top to bottom) |
| `werkzeug.security` not imported | Check: `from werkzeug.security import generate_password_hash, check_password_hash` — should already exist |
| `current_user` not available | `from flask_login import current_user` — already imported in app.py |
| Last admin check SQL error | Use: `SELECT COUNT(*) FROM users WHERE role='admin' AND is_active=true` |
| `is_active` column doesn't exist | Verify `create_users_table.sql` migration ran correctly — must include `is_active` column |
| DEV_MODE bypasses all auth | Expected for local dev — role guards work when DEV_MODE=false |

### Success Criteria

- [ ] `require_role` decorator exists in `app.py`
- [ ] `/add-user` has `@login_required` + `@require_role('admin')` decorators
- [ ] `/delete-user/<id>` has `@require_role('admin')` decorator
- [ ] `PUT /update-user/<id>` route exists, admin-only
- [ ] `POST /change-password/<id>` route exists, admin-only
- [ ] `POST /change-own-password` route exists, any authenticated user
- [ ] Cannot demote the last admin (returns 400)
- [ ] `/users` GET still works for any authenticated user

---

## Agent 3 — "Email + Shifts Settings Pages" (After Agent 1 ✅)

**Scope:** Frontend only. Create Email and Shifts settings pages, register in routes + tabs, wire shifts into ReportViewer.
**Run:** New Claude Code session. Context: "Agent 1 completed. Backend APIs exist: GET/POST `/api/settings/smtp-config`, POST `/api/settings/smtp-test`, GET/POST `/api/settings/shifts`."

### Tasks

**1. Read reference files FIRST:**

```
Read these files before writing any code:
- Frontend/src/Pages/Settings/System/SystemSettings.jsx  (layout + styling reference)
- Frontend/src/Pages/Settings/SettingsHome.jsx  (tab registration)
- Frontend/src/Routes/AppRoutes.jsx  (route registration)
- Frontend/src/Pages/Reports/ReportViewer.jsx  (shift integration)
```

**2. Create `Frontend/src/Pages/Settings/Email/EmailSettings.jsx`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend\src\Pages\Settings\Email\EmailSettings.jsx

Copy SystemSettings.jsx layout/styling pattern EXACTLY.

Component structure:
- useState for: smtpServer, smtpPort (465), username, password, tls (true), fromAddress, recipient
- useState for: showPassword, saving, testing, testResult
- useEffect on mount: axios.get('/api/settings/smtp-config') → populate form fields
- handleSave: axios.post('/api/settings/smtp-config', formData) → toast.success/error
- handleTest: axios.post('/api/settings/smtp-test') → show inline result (green check or red X)
- Password field: API returns "********" for existing password. If user doesn't change it, send "********" back (backend preserves old). If user clears and types new, send new value.

Use Tailwind inputs (NOT MUI TextField):
  <input className="w-full px-3 py-2 text-[13px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none" />

Fields layout (2-column grid on lg screens):
  Row 1: SMTP Server (text) | Port (number, default 465)
  Row 2: Username (text) | Password (password + eye toggle)
  Row 3: From Address (email) | Recipient (email)
  Row 4: TLS (toggle/checkbox)
  Actions row: [Save] button (bg-cyan-600) + [Send Test Email] button (outline) + test result inline

Section header pattern:
  <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7f94] dark:text-[#6b7f94] mb-3">Email / SMTP Configuration</h3>

Outer wrapper:
  <div className="p-6">
    <div className="max-w-3xl mx-auto space-y-6">
      ...sections...
    </div>
  </div>
```

**3. Create `Frontend/src/Pages/Settings/Shifts/ShiftsSettings.jsx`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend\src\Pages\Settings\Shifts\ShiftsSettings.jsx

Same styling as EmailSettings (copy from SystemSettings.jsx).

Component structure:
- useState: shiftCount (3), shifts ([{name, start, end}, ...]), saving, loaded
- useEffect on mount: axios.get('/api/settings/shifts') → populate
- handleShiftCountChange(newCount):
    If increasing: add empty shifts {name: '', start: '', end: ''}
    If decreasing: truncate array
    Update shiftCount state
- handleShiftChange(index, field, value): update specific shift field
- handleSave: axios.post('/api/settings/shifts', { shift_count: shiftCount, shifts }) → toast

Layout:
- Section header: "Shift Schedule Configuration"
- Shift count: row of 4 buttons (1-4), active one: bg-cyan-600 text-white, others: outline
- Dynamic shift rows (one per shiftCount):
  <div className="grid grid-cols-3 gap-4"> for each row
    <input label="Shift Name" />
    <input type="time" label="Start Time" />
    <input type="time" label="End Time" />
  </div>
- Save button at bottom
```

**4. Register new tabs in `Frontend/src/Pages/Settings/SettingsHome.jsx`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend\src\Pages\Settings\SettingsHome.jsx

Line 4 — update import:
  import { FaTags, FaLayerGroup, FaExchangeAlt, FaDownload, FaServer, FaSuperscript, FaEnvelope, FaClock } from 'react-icons/fa';

Lines 6-13 — insert 2 new entries BEFORE 'Export / Import' (which is currently the 5th item):
  { name: 'Tags', icon: FaTags, link: '/settings/tags', description: 'PLC tags & data sources' },
  { name: 'Tag Groups', icon: FaLayerGroup, link: '/settings/tag-groups', description: 'Organize tags for reports' },
  { name: 'Formulas', icon: FaSuperscript, link: '/settings/formulas', description: 'Reusable calculations' },
  { name: 'Mappings', icon: FaExchangeAlt, link: '/settings/mappings', description: 'Value mapping rules' },
  { name: 'Email / SMTP', icon: FaEnvelope, link: '/settings/email', description: 'Email delivery config' },     // NEW
  { name: 'Shifts', icon: FaClock, link: '/settings/shifts', description: 'Shift schedule config' },               // NEW
  { name: 'Export / Import', icon: FaDownload, link: '/settings/export-import', description: 'System configurations' },
  { name: 'System', icon: FaServer, link: '/settings/system', description: 'PLC, mode & emulator' },
```

**5. Add routes in `Frontend/src/Routes/AppRoutes.jsx`:**

```
Add imports near other Settings imports at top of file:
  import EmailSettings from '../Pages/Settings/Email/EmailSettings';
  import ShiftsSettings from '../Pages/Settings/Shifts/ShiftsSettings';

After line 226 (<Route path="system" element={<SystemSettings />} />), add:
  <Route path="email" element={<EmailSettings />} />
  <Route path="shifts" element={<ShiftsSettings />} />
```

**6. Wire shifts into `Frontend/src/Pages/Reports/ReportViewer.jsx`:**

```
Read the file first. Find:
- TIME_PRESETS array at line ~41 — already has { id: 'shift', label: 'Shift' } at line 46
- Shift placeholder at lines 299-302 with "Shift-based filtering — configure shifts in Engineering > Demo Mode"

Changes:

Add imports:
  import axios from '../../API/axios';  // may already be imported

Add state near other useState declarations:
  const [shiftsConfig, setShiftsConfig] = useState(null);
  const [selectedShift, setSelectedShift] = useState('');

Add useEffect to fetch shifts on mount:
  useEffect(() => {
    axios.get('/api/settings/shifts')
      .then(res => setShiftsConfig(res.data))
      .catch(() => {});
  }, []);

Replace the placeholder block at lines 299-302 with:
  {timePreset === 'shift' && (
    <div className="flex items-center gap-2">
      {shiftsConfig?.shifts?.length > 0 ? (
        <select
          value={selectedShift}
          onChange={(e) => {
            const idx = parseInt(e.target.value);
            setSelectedShift(e.target.value);
            if (idx >= 0 && shiftsConfig.shifts[idx]) {
              const shift = shiftsConfig.shifts[idx];
              const today = new Date();
              const [startH, startM] = shift.start.split(':').map(Number);
              const [endH, endM] = shift.end.split(':').map(Number);
              const from = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startH, startM, 0);
              const to = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endH, endM, 0);
              if (to <= from) to.setDate(to.getDate() + 1);
              // Set the from/to state — find the state setter names in the component
              // likely: setFromDate(from) and setToDate(to) or similar
            }
          }}
          className="px-3 py-1.5 text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0]"
        >
          <option value="">Select shift...</option>
          {shiftsConfig.shifts.map((s, i) => (
            <option key={i} value={i}>{s.name} ({s.start} - {s.end})</option>
          ))}
        </select>
      ) : (
        <span className="text-[10px] text-[#d97706]">No shifts configured — go to Engineering &gt; Shifts</span>
      )}
    </div>
  )}

IMPORTANT: Read the component to find the exact state setter names for from/to dates.
The shift selection should trigger the same data fetch as other time presets.
```

### Verify

Navigate to:
- `/settings/email` — form renders with empty defaults, Save button works, Test Email button works
- `/settings/shifts` — 3 default shifts visible, change count to 2, save, refresh → persists
- `/reporting` → select any published report → time preset "Shift" → dropdown shows configured shifts → selecting one loads correct time range
- Both settings pages look correct in light AND dark mode (match SystemSettings styling)

### Failure Handling

| Problem | Fix |
|---------|-----|
| Settings tab not visible | Check `NAV_ITEMS` in SettingsHome.jsx has the new entries with correct icon imports |
| Route 404 on `/settings/email` | Verify `<Route path="email" .../>` is inside the `<Route path="settings">` parent in AppRoutes.jsx |
| API call fails from frontend | Check axios baseURL, verify Flask is running on 5001, check browser console Network tab |
| Shift time calculation wrong for night shifts | If `end <= start`, add 1 day to the `to` date |
| Dark mode styling wrong | Copy exact Tailwind classes from SystemSettings.jsx — must have both light and dark: variants |
| Shift dropdown empty | Check `/api/settings/shifts` returns data — curl it to verify |
| ReportViewer state setter names don't match | Read the component carefully to find the from/to date state variables |
| SettingsHome.jsx already modified by Agent 4 | Read the file first — merge your Email/Shifts entries into existing NAV_ITEMS array; Agent 4 may have added Users tab |

### Success Criteria

- [ ] `EmailSettings.jsx` created, renders form, loads/saves config
- [ ] `ShiftsSettings.jsx` created, renders shifts, count selector works, loads/saves
- [ ] Both pages match SystemSettings.jsx styling in light AND dark mode
- [ ] Settings tab strip shows Email/SMTP and Shifts tabs (8 tabs total)
- [ ] ReportViewer "Shift" preset shows dropdown with configured shifts
- [ ] Selecting a shift calculates correct from/to time range (including night shifts)
- [ ] Routes registered in AppRoutes.jsx

---

## Agent 4 — "User Management Settings Page" (After Agent 2 ✅)

**Scope:** Frontend only. Create User Management page in Settings, clean up Login page, retire `/user` route.
**Run:** New Claude Code session. Context: "Agent 2 completed. Backend has: PUT `/update-user/<id>`, POST `/change-password/<id>`, POST `/change-own-password`. Also `/add-user` and `/delete-user` now require admin role."

### Tasks

**1. Read reference files FIRST:**

```
Read these files before writing any code:
- Frontend/src/Pages/Settings/System/SystemSettings.jsx  (styling reference)
- Frontend/src/Components/User/AddUser.jsx  (current add user pattern — will be replaced)
- Frontend/src/Pages/User.jsx  (current user page — will be retired)
- Frontend/src/Pages/Login.jsx  (create account code to remove)
- Frontend/src/Data/Navbar.js  (User nav item to remove)
- Frontend/src/Context/AuthProvider.jsx  (how to get current user role)
```

**2. Create `Frontend/src/Pages/Settings/Users/UserManagement.jsx`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend\src\Pages\Settings\Users\UserManagement.jsx

IMPORTANT: Use SystemSettings.jsx styling. Use Tailwind inputs, NOT MUI.

Component structure:
- Import AuthContext, get current user auth via useContext
- useState: users (array), loading, editingUser (null or user obj), newUser form, passwordForm, ownPasswordForm
- useEffect on mount: axios.get(endpoints.users.list) → setUsers
- Determine isAdmin = auth.role === 'admin'

Section 1: "User Accounts" (visible to admin + manager)
  Table with Tailwind styling:
  <table className="w-full text-[13px]">
    <thead>
      <tr className="border-b border-[#e3e9f0] dark:border-[#1e2d40]">
        <th className="text-left py-2 px-3 text-[11px] font-semibold uppercase text-[#6b7f94]">Username</th>
        <th className="...">Role</th>
        <th className="...">Actions</th>
      </tr>
    </thead>
    <tbody>
      {users.map(user => (
        <tr key={user.id} className="border-b border-[#e3e9f0] dark:border-[#1e2d40] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]">
          <td className="py-2.5 px-3 text-[#2a3545] dark:text-[#e1e8f0]">{user.username}</td>
          <td>
            <span className={role badge classes}>
              {/* admin=blue badge, manager=amber badge, operator=gray badge */}
            </span>
          </td>
          <td>
            {isAdmin && (
              <div className="flex gap-1">
                <button onClick={() => startEdit(user)}>Edit</button>
                <button onClick={() => openResetPassword(user)}>Reset Password</button>
                <button onClick={() => confirmDelete(user)}>Delete</button>
              </div>
            )}
          </td>
        </tr>
      ))}
    </tbody>
  </table>

  Role badge colors:
    admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
    manager: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
    operator: "bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400"

  Edit mode: inline editing — replace username/role cells with inputs
    axios.put(endpoints.users.update(user.id), {username, role})

  Reset password: small modal or inline — new_password field
    axios.post(endpoints.users.changePassword(user.id), {new_password})

  Delete: confirmation modal
    axios.delete(endpoints.users.delete(user.id))

Section 2: "Add New User" (admin only — hide entirely for non-admin)
  Inline form: Username | Password | Role (dropdown: admin/manager/operator) | [Add User] button
  axios.post(endpoints.users.create, {username, password, role})
  On success: refresh user list, clear form, toast

Section 3: "Change My Password" (all roles)
  Form: Current Password | New Password | Confirm Password | [Change Password] button
  Validation: new_password === confirmPassword, length >= 2
  axios.post(endpoints.users.changeOwnPassword, {current_password, new_password})
  On success: toast, clear form
```

**3. Register in `Frontend/src/Pages/Settings/SettingsHome.jsx`:**

```
Line 4 — add FaUsers to import (Agent 3 may have already modified this line):
  import { FaTags, FaLayerGroup, FaExchangeAlt, FaDownload, FaServer, FaSuperscript, FaEnvelope, FaClock, FaUsers } from 'react-icons/fa';

Add as FIRST item in NAV_ITEMS array:
  { name: 'Users', icon: FaUsers, link: '/settings/users', description: 'User accounts & roles' },

Also: Add role-based filtering:
  import { useContext } from 'react';
  import { AuthContext } from '../../Context/AuthProvider';

  Inside component:
    const { auth } = useContext(AuthContext);
    const filteredNavItems = NAV_ITEMS.filter(item => {
      if (item.link === '/settings/users') {
        return auth?.role === 'admin' || auth?.role === 'manager';
      }
      return true;
    });

  Use filteredNavItems instead of NAV_ITEMS in the tab strip map.
```

**4. Add route in `Frontend/src/Routes/AppRoutes.jsx`:**

```
Add import:
  import UserManagement from '../Pages/Settings/Users/UserManagement';

Add route inside Settings routes (before or after other routes):
  <Route path="users" element={<UserManagement />} />

Add redirect OUTSIDE the settings <Route> block (at the same level as other top-level routes):
  import { Navigate } from 'react-router-dom';  // may already be imported
  <Route path="/user" element={<Navigate to="/settings/users" replace />} />
```

**5. Update `Frontend/src/API/endpoints.js`:**

```
Lines 10-14 — update users object to add 3 new endpoints:

  users: {
    list: '/users',
    create: '/add-user',
    delete: id => `/delete-user/${id}`,
    update: id => `/update-user/${id}`,
    changePassword: id => `/change-password/${id}`,
    changeOwnPassword: '/change-own-password',
  },
```

**6. Clean up `Frontend/src/Pages/Login.jsx`:**

```
Read the file first. Remove these sections ONLY:

Lines 12-16 in MUI imports — remove: Modal, FormControl, InputLabel, Select, MenuItem
  Keep: Box, createTheme, styled, ThemeProvider, TextField, Button, Typography, Paper, InputAdornment, IconButton

Lines 42-48 — remove entire createAccountSchema const

Lines 115-116 — remove: const [createAccountOpen, setCreateAccountOpen] = useState(false);
                remove: const [createAccountLoading, setCreateAccountLoading] = useState(false);

Lines 122-147 — remove entire createAccountFormik useFormik block

Lines 265-276 — remove the "Create account" button Box:
  <Box textAlign="center" mt={2}>
    <Button type="button" variant="text" color="secondary" size="small" onClick={() => setCreateAccountOpen(true)}>
      Create account
    </Button>
  </Box>

Lines 279-350 — remove the entire <Modal> block (create account modal)

Do NOT remove: login form, password toggle, formik for login, loginUser function
```

**7. Remove User nav item from `Frontend/src/Data/Navbar.js`:**

```
Lines 139-145 — remove or comment out:
  {
    name: 'User',
    icon: FaUsers,
    tooltip: 'User Management',
    link: '/user',
    roles: [Roles.Admin, Roles.Manager],
  },

After removal, menuItems should have 3 active entries: Report Builder, Reporting, Engineering
```

### Verify

- `/settings/users` — tab visible for admin and manager users
- Admin user: sees user list + add user form + edit/delete/reset password buttons + change own password
- Manager user: sees user list + change own password only (no add/edit/delete buttons)
- Operator user: Users tab NOT visible in settings tab strip
- Login page (`/login`): NO "Create account" button or modal anywhere
- Navigate to `/user` → automatically redirects to `/settings/users`
- Sidebar navigation: NO "User" menu item
- All operations work: add user, edit user, reset password, delete user, change own password

### Failure Handling

| Problem | Fix |
|---------|-----|
| Users tab not visible for admin | Check filteredNavItems logic — verify auth.role value |
| AuthContext is undefined | Ensure `AuthProvider` wraps the Settings routes in the component tree |
| Cannot add user (403 error) | Backend requires admin role — ensure you're logged in as admin |
| Login page broken after cleanup | Read Login.jsx carefully — ensure ONLY create-account code removed, login form intact |
| `/user` still shows old page | Check redirect route `<Navigate to="/settings/users" />` is at the correct level in AppRoutes.jsx |
| `endpoints.js` changes not taking effect | Restart dev server (`npm run dev`) |
| Agent 3 already modified SettingsHome.jsx | Read the current file before editing — merge your Users entry into existing NAV_ITEMS; final count should be 9 tabs |
| Agent 3 already modified AppRoutes.jsx | Read the current file — add your `users` route alongside the existing `email` and `shifts` routes |

### Success Criteria

- [ ] `UserManagement.jsx` created with 3 sections (user list, add user, change password)
- [ ] Users tab visible for admin + manager, hidden for operator
- [ ] Admin can: add, edit, reset password, delete users
- [ ] Manager can: view users, change own password
- [ ] Login page has NO create account button or modal
- [ ] `/user` redirects to `/settings/users`
- [ ] Navbar sidebar has no "User" link (3 items remain)
- [ ] `endpoints.js` has `update`, `changePassword`, `changeOwnPassword`
- [ ] Styling matches SystemSettings.jsx in light AND dark mode

---

## Agent 5 — "QA & Integration Testing" (After Agents 3 + 4 ✅)

**Scope:** Full Plan A validation. Test all backend APIs, frontend pages, dark/light mode, regression.
**Run:** New Claude Code session. Context: "Agents 1-4 completed. All backend modules, API routes, and frontend pages exist."

### Tasks

**1. Backend API Tests (Flask must be running on port 5001):**

```bash
# SMTP Config
curl http://localhost:5001/api/settings/smtp-config
# Expected: JSON with empty defaults, password field empty or masked

curl -X POST http://localhost:5001/api/settings/smtp-config -H "Content-Type: application/json" -d "{\"smtp_server\":\"smtp.gmail.com\",\"smtp_port\":465,\"username\":\"test@gmail.com\",\"password\":\"testpass\",\"tls\":true,\"from_address\":\"test@gmail.com\",\"recipient\":\"dest@gmail.com\"}"
# Expected: {"status": "saved"}

curl http://localhost:5001/api/settings/smtp-config
# Expected: password shows "********"

# Shifts Config
curl http://localhost:5001/api/settings/shifts
# Expected: 3 default shifts

curl -X POST http://localhost:5001/api/settings/shifts -H "Content-Type: application/json" -d "{\"shift_count\":2,\"shifts\":[{\"name\":\"Day\",\"start\":\"06:00\",\"end\":\"18:00\"},{\"name\":\"Night\",\"start\":\"18:00\",\"end\":\"06:00\"}]}"
# Expected: {"status": "saved"}

curl http://localhost:5001/api/settings/shifts
# Expected: 2 shifts now

# Shifts Validation (should fail)
curl -X POST http://localhost:5001/api/settings/shifts -H "Content-Type: application/json" -d "{\"shift_count\":3,\"shifts\":[{\"name\":\"Day\",\"start\":\"06:00\",\"end\":\"18:00\"}]}"
# Expected: 400 error (count mismatch)

# User Endpoints
curl http://localhost:5001/users
# Expected: array of users

curl -s -o /dev/null -w "%{http_code}" -X PUT http://localhost:5001/update-user/1 -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"role\":\"admin\"}"
# Expected: 200 (DEV_MODE) or 401

curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5001/change-own-password -H "Content-Type: application/json" -d "{\"current_password\":\"old\",\"new_password\":\"new\"}"
# Expected: 200 or 401

# Regression: Existing endpoints still work
curl http://localhost:5001/api/tags?is_active=true
# Expected: array of tags

curl http://localhost:5001/api/settings/plc-config
# Expected: PLC config JSON

curl http://localhost:5001/api/report-builder/templates
# Expected: array (may be empty)
```

**2. Auth Guard Verification:**

```bash
# Verify require_role decorator exists
grep -n "def require_role" backend/app.py
# Expected: 1 match with line number

# Verify @login_required on settings routes
grep -B2 "smtp-config\|smtp-test\|/shifts" backend/app.py | grep "login_required"
# Expected: login_required appears before each settings route

# Verify @require_role on user mutation routes
grep -B3 "add-user\|delete-user" backend/app.py | grep "require_role"
# Expected: require_role('admin') on add-user and delete-user
```

**3. Frontend Smoke Tests (browser or MCP tools):**

```
Navigate and verify each page:

Settings Pages:
  □ /settings — tab strip renders with 9 tabs (Users, Tags, Tag Groups, Formulas, Mappings, Email/SMTP, Shifts, Export/Import, System)
  □ /settings/email — form loads with empty defaults, save works
  □ /settings/shifts — 3 default shifts visible, change count, save, refresh persists
  □ /settings/users — user list table renders, all 3 sections visible for admin
  □ /settings/system — regression check (unchanged, still works)

Login Page:
  □ /login — NO "Create account" button or modal
  □ Login form still works correctly

Navigation:
  □ /user redirects to /settings/users
  □ Sidebar has no "User" link (3 nav items: Report Builder, Reporting, Engineering)

ReportViewer:
  □ Time preset "Shift" → dropdown with configured shifts
  □ Selecting a shift sets correct time range
```

**4. Dark/Light Mode Sweep:**

```
Toggle dark mode on EVERY new/modified page:
  □ /settings/email — inputs readable, borders visible, background correct
  □ /settings/shifts — buttons, time inputs, shift rows all correct
  □ /settings/users — table, badges, forms all correct
  □ /login — still works in both modes
  □ Settings tab strip — all tab cards visible
```

**5. Bug Fix Cycle:**

```
For each bug found:
1. Log the bug (page, description, expected vs actual)
2. Identify root cause (check browser console, Network tab, Flask logs)
3. Fix the code
4. Re-test the fix
5. Regression check: verify fix didn't break anything else
```

**6. Write QA results to `docs/QA_DEBUG_LOG.md`:**

```markdown
## Plan A — QA Results

- **Date:** <actual date>
- **Settings pages (Email, Shifts, Users):** <pass/fail with notes>
- **Backend API tests:** <pass/fail>
- **Auth guards:** <pass/fail>
- **Login cleanup:** <pass/fail>
- **Navigation redirect:** <pass/fail>
- **Dark/Light mode sweep:** <pass/fail>
- **Regression (existing features):** <pass/fail>
- **Bugs found and fixed:** <list>
- **Status:** ALL PASS / NEEDS FIXES
```

### Failure Handling

| Problem | Fix |
|---------|-----|
| Settings page returns 404 | Check `AppRoutes.jsx` — route must be inside the `<Route path="settings">` parent |
| API returns 500 on settings routes | Check Flask logs — likely `ModuleNotFoundError` for smtp_config or shifts_config |
| Dark mode colors wrong on new pages | Compare against SystemSettings.jsx — must use `dark:bg-[#0d1825]`, `dark:border-[#1e2d40]`, `dark:text-[#e1e8f0]` |
| Login page broken | Agent 4 may have removed too much — check Login.jsx still has login form, password toggle, formik |
| `/user` not redirecting | Check `<Navigate>` route is OUTSIDE the settings nested routes in AppRoutes.jsx |
| `require_role` not working | Verify decorator order: `@app.route` → `@login_required` → `@require_role` (top to bottom) |
| Existing endpoints broken | Agent 1 or 2 may have broken `app.py` — check Flask startup logs for import errors |
| Settings tab count wrong | Should be 9 total: Users + Tags + Tag Groups + Formulas + Mappings + Email/SMTP + Shifts + Export/Import + System |

### Success Criteria (ALL must pass before proceeding to Agent 6)

- [ ] All 5 settings API routes respond correctly (SMTP GET/POST, SMTP-test, Shifts GET/POST)
- [ ] All 3 user management routes respond correctly (update-user, change-password, change-own-password)
- [ ] Existing API endpoints (`/api/tags`, `/api/settings/plc-config`, `/api/report-builder/templates`) still work
- [ ] `require_role` decorator exists and is applied to `/add-user` and `/delete-user`
- [ ] `@login_required` is on all 5 new settings routes
- [ ] Settings tab strip shows 9 tabs
- [ ] `/settings/email` form loads, saves, test button exists
- [ ] `/settings/shifts` loads defaults, count selector works, saves
- [ ] `/settings/users` renders user list, add form, change password form
- [ ] Login page has NO create account button or modal
- [ ] `/user` redirects to `/settings/users`
- [ ] Sidebar has no "User" link
- [ ] All new pages look correct in light AND dark mode
- [ ] Zero console errors on any tested page

---

## Agent 6 — "Commit & Push" (ONLY After Agent 5 QA Passes 100% ✅)

**Scope:** Git commit and push. This agent MUST NOT run until Agent 5 reports ALL success criteria passed.
**GATE:** If ANY Agent 5 test fails, go back to the failing agent, fix the issue, re-run the failing test, then return here.
**Run:** New Claude Code session. Context: "Agents 1-5 completed. All QA tests passed 100%."

### Tasks

**1. Verify git status:**

```bash
cd C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config
git status
```

Expected modified/new files:
* `backend/smtp_config.py` (new)
* `backend/shifts_config.py` (new)
* `backend/app.py` (modified — new routes, require_role, auth guards)
* `backend/report_mailer.py` (modified — SMTP config wired in)
* `Frontend/src/Pages/Settings/Email/EmailSettings.jsx` (new)
* `Frontend/src/Pages/Settings/Shifts/ShiftsSettings.jsx` (new)
* `Frontend/src/Pages/Settings/Users/UserManagement.jsx` (new)
* `Frontend/src/Pages/Settings/SettingsHome.jsx` (modified — new tabs + role filter)
* `Frontend/src/Routes/AppRoutes.jsx` (modified — new routes + redirect)
* `Frontend/src/API/endpoints.js` (modified — new user endpoints)
* `Frontend/src/Pages/Login.jsx` (modified — create account removed)
* `Frontend/src/Data/Navbar.js` (modified — User nav item removed)
* `Frontend/src/Pages/Reports/ReportViewer.jsx` (modified — shifts dropdown)
* `docs/QA_DEBUG_LOG.md` (new)
* `docs/Plans/PLAN_A_BACKEND_SETTINGS_INFRASTRUCTURE.md` (modified)

**Do NOT commit:** `backend/.env`, `backend/config/*.json` (runtime data), `node_modules/`

**2. Verify `.gitignore` covers secrets:**

```bash
grep ".env" .gitignore
grep "config/" backend/.gitignore 2>/dev/null || echo "No backend .gitignore"
```

If `.env` not in `.gitignore`, add it before committing.

**3. Stage files:**

```bash
git add backend/smtp_config.py backend/shifts_config.py
git add backend/app.py backend/report_mailer.py
git add "Frontend/src/Pages/Settings/Email/EmailSettings.jsx"
git add "Frontend/src/Pages/Settings/Shifts/ShiftsSettings.jsx"
git add "Frontend/src/Pages/Settings/Users/UserManagement.jsx"
git add "Frontend/src/Pages/Settings/SettingsHome.jsx"
git add "Frontend/src/Routes/AppRoutes.jsx"
git add "Frontend/src/API/endpoints.js"
git add "Frontend/src/Pages/Login.jsx"
git add "Frontend/src/Data/Navbar.js"
git add "Frontend/src/Pages/Reports/ReportViewer.jsx"
git add docs/QA_DEBUG_LOG.md
git add docs/Plans/PLAN_A_BACKEND_SETTINGS_INFRASTRUCTURE.md
```

**4. Commit:**

```bash
git commit -m "$(cat <<'EOF'
Plan A: Backend settings infrastructure + User management UI

- Add smtp_config.py and shifts_config.py (file-based config with TTL cache)
- Add 5 settings API routes (SMTP GET/POST/test, Shifts GET/POST) with @login_required
- Add require_role decorator and lock down /add-user, /delete-user (admin only)
- Add 3 user management endpoints (update-user, change-password, change-own-password)
- Wire SMTP config into report_mailer.py (remove hardcoded credentials)
- Create EmailSettings, ShiftsSettings, UserManagement settings pages
- Register 9 settings tabs with role-based Users tab visibility
- Wire shifts into ReportViewer time preset dropdown
- Clean up Login page (remove create account button/modal)
- Retire /user route (redirect to /settings/users)
- Remove User nav item from sidebar

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**5. Push:**

```bash
git push -u origin demo-pipeline-wiring
```

**6. Verify:**

```bash
git log --oneline -1
# Must show the commit message

git status
# Must show clean working tree

git show HEAD --name-only | head -20
# Verify backend/.env is NOT in the commit
```

### Failure Handling

| Problem | Fix |
|---------|-----|
| `backend/.env` accidentally staged | `git reset HEAD backend/.env` then add to `.gitignore`, re-commit |
| `backend/config/*.json` staged | `git reset HEAD backend/config/` — these are runtime config, not source |
| Push rejected (remote has new commits) | `git pull origin demo-pipeline-wiring --rebase` then push again |
| `.gitignore` missing `.env` | Add `backend/.env` and `.env` lines to `.gitignore`, commit `.gitignore` first |

**7. Write completion signal:**

```bash
# Signal that Plan A is complete — Plan B-2 waits for this file
echo PLAN_A_COMPLETE > "C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\.plan_a_done"
```

This file signals to Plan B-2 that Plan A has finished successfully. Do NOT write this file if any step above failed.

### Success Criteria

- [ ] `git log --oneline -1` shows the Plan A commit
- [ ] `git status` shows clean working tree
- [ ] `backend/.env` NOT in `git show HEAD --name-only`
- [ ] `backend/config/` NOT in `git show HEAD --name-only`
- [ ] Push succeeded to `origin/demo-pipeline-wiring`
- [ ] `.plan_a_done` signal file exists in project root

---

## Full Execution Sequence

```
Agent 1 (SMTP + Shifts backend)       ← Backend config modules, ~15 min
  |
  +-- Agent 2 (User role guards)       ← Backend auth endpoints, ~10 min
  |     |
  |     +-- Agent 4 (User Mgmt UI)     ← Frontend user settings, ~20 min
  |
  +-- Agent 3 (Email + Shifts UI)      ← Frontend settings + ReportViewer, ~20 min
        |
        +-- (wait for Agent 4 to also finish)
              |
              +-- Agent 5 (QA & Testing) ← Full validation, ~20 min
                    |
                    +-- Agent 6 (Commit & Push) ← ONLY if QA 100%, ~5 min
```

**Agents 3 and 4 can run in parallel** after their respective backend agents complete.
Both modify `SettingsHome.jsx` and `AppRoutes.jsx` — if running in parallel, the second agent must merge with the first agent's changes.

**Hard gate:** Agent 6 (Commit & Push) is blocked until Agent 5 reports 100% pass on ALL success criteria.

**Total estimated time:** ~60-75 minutes

---

## Per-Agent Prompt Template

```
You are executing Agent N — "<Name>" from Plan A: Backend + Settings Infrastructure.

Project root: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config
Active branch: demo-pipeline-wiring

Read the execution plan at: docs/Plans/PLAN_A_BACKEND_SETTINGS_INFRASTRUCTURE.md

Context: [paste relevant "After Agent X completed" context here]

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
- **Agents completed:** /6
- **Backend modules created:**
- **API routes added:**
- **Frontend pages created:**
- **QA pass rate:**
- **Bugs found and fixed:**
- **Commit hash:**
- **Status:**
