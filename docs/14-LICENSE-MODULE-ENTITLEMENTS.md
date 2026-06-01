# License module entitlements

Superadmins can enable or disable **Digital Twin** and **Hercules AI** per machine when approving or editing licenses.

## Cloud database

```sql
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS enable_digital_twin BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS enable_atlas_ai BOOLEAN NOT NULL DEFAULT TRUE;
```

Deploy updated `license_bp` to `https://api.herculesv2.app`.

## API

| Action | Method | URL |
|--------|--------|-----|
| List licenses | GET | `/api/admin/licenses` |
| Update license | PATCH | `/api/admin/licenses/{id}` |
| Status (EXE) | GET | `/api/license/status?machine_id=...` |
| Entitlements (app UI) | GET | `/api/license/entitlements` |

### PATCH body (optional fields)

```json
{
  "status": "approved",
  "expiry": "2026-06-01",
  "enable_digital_twin": true,
  "enable_atlas_ai": false
}
```

### Approved status response

```json
{
  "status": "approved",
  "expiry": "2026-12-31",
  "features": {
    "digital_twin": true,
    "atlas_ai": true
  }
}
```

## Desktop enforcement

- `launcher.py` caches `features` in `license.json` on approve.
- React loads entitlements from `GET /api/license/entitlements` (refreshes every 10 minutes and on window focus).
- Hercules AI nav and `/hercules-ai` are hidden or redirected when `atlas_ai` is false.
- Digital Twin routes (when added) use `digital_twin`.

Customers must **restart the desktop app** (or wait ~10 minutes and refocus the window) after portal flag changes.

## Admin UI

- In-app: **App Settings → Licenses** (`LicenseActivations.jsx`)
- Separate Vercel portal: same PATCH fields against `api.herculesv2.app`

Do not store module flags only in portal localStorage or customer `localhost:5001`.
