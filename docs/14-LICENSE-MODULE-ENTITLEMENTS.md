# 14 — License module entitlements

## Purpose

Control **per machine** whether these modules are available:

| Module | Sidebar | Route | License flag |
|--------|---------|-------|----------------|
| Digital Twin | Digital Twin | `/digital-twin` | `enable_digital_twin` |
| Hercules AI | Hercules AI | `/atlas-ai` | `enable_atlas_ai` |
| Hercules AI setup | Engineering → AI | `/settings/ai` | `enable_atlas_ai` |

Flags are stored on the **cloud** `licenses` row (same database as `api.herculesv2.app`). The desktop app reads them at startup and on each logged-in session.

## Who controls access

1. **Primary:** Superadmin on **herculesv2.app** portal → Licenses page (cloud API).
2. **Secondary:** App Settings → Licenses on desktop (local DB only — use for dev or single-PC testing).

## Data model

```sql
ALTER TABLE licenses ADD COLUMN enable_digital_twin BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE licenses ADD COLUMN enable_atlas_ai BOOLEAN NOT NULL DEFAULT TRUE;
```

- Existing rows default to **enabled** after migration.
- **New** machine registrations start with both flags **false** until an admin approves and selects modules.

## API contract (cloud + desktop backend)

### `POST /api/license/register` (public)

Response includes `features` when a row exists:

```json
{
  "status": "approved",
  "expiry": "2026-12-31",
  "features": {
    "digital_twin": true,
    "atlas_ai": false
  }
}
```

If status is not `approved`, `features` are both `false`.

### `GET /api/license/status?machine_id=...` (public)

Same shape as register response.

### `PATCH /api/admin/licenses/:id` (superadmin)

```json
{
  "status": "approved",
  "expiry": "2026-06-01",
  "enable_digital_twin": true,
  "enable_atlas_ai": false
}
```

### `GET /api/license/entitlements` (logged-in user, local backend)

Used by the React app:

```json
{
  "features": {
    "digital_twin": true,
    "atlas_ai": false
  },
  "source": "cloud"
}
```

`source` may be: `dev`, `cache`, `cloud`, `local`, `default`.

## Client flow

1. **Electron** (`desktop/main.js`) — `POST` register on startup → saves `features` in `%APPDATA%/Hercules/license_cache.json`.
2. **React** — `GET /api/license/entitlements` after login → hides nav items and blocks routes.
3. **Backend** — `/api/hercules-ai/*` returns **403** if `atlas_ai` is disabled.
4. **Refresh** — entitlements reload on login and every 10 minutes (not on window focus — avoids PowerShell flash loop on Windows). Restart the app after portal changes for immediate effect.

## Deploy order

1. Run migration `add_license_module_flags.sql` on **cloud** PostgreSQL.
2. Deploy **api.herculesv2.app** with updated `license_bp.py` and `license_entitlements.py`.
3. Update **portal** (see `docs/Portal_License_Module_Changes.md`).
4. Ship **desktop** installer or OTA (Electron + frontend + backend).

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| Modules still visible | Portal flags true; restart app; delete stale `license_cache.json` |
| Modules hidden incorrectly | License `approved` and not expired; portal PATCH saved |
| Portal change has no effect | Portal must call **api.herculesv2.app**, not customer `localhost` |
| Desktop Licenses page differs from portal | Expected — desktop uses local DB; portal uses cloud |

## Files changed (main repo)

- `backend/migrations/add_license_module_flags.sql`
- `backend/license_bp.py`, `backend/license_entitlements.py`
- `backend/hercules_ai_bp.py` (403 guard)
- `desktop/main.js` (cache `features`)
- `Frontend/src/Context/FeatureContext.jsx`
- `Frontend/src/Routes/FeatureRoute.jsx`, `AppRoutes.jsx`, `SideNav.jsx`, `SettingsHome.jsx`
- `Frontend/src/Pages/Settings/LicenseActivations/LicenseActivations.jsx`
