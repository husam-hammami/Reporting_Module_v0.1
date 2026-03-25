# Hercules Desktop App — OTA (Over-the-Air) Update Plan

How the installed EXE app can auto-update its backend and frontend code without rebuilding the installer.

---

## Architecture

```
User machine (installed app)
├── launcher.exe              ← compiled, NEVER changes (unless launcher.py logic changes)
├── python_embed/             ← portable Python + pip packages, rarely changes
├── psql/                     ← portable PostgreSQL, never changes
├── data/                     ← user's database, never touch
├── version.txt               ← NEW: current version string (e.g. "1.0.3")
└── backend/                  ← UPDATABLE: plain Python files + built frontend
    ├── app.py
    ├── *_bp.py
    ├── workers/
    ├── utils/
    ├── tools/setup/
    ├── migrations/*.sql      ← new migrations arrive with updates
    └── frontend/dist/        ← built React app
```

**What gets updated:** Only `backend/` (Python source + frontend build + migrations)
**What never changes:** `launcher.exe`, `python_embed/`, `psql/`, `data/`

---

## Files to Create

### 1. `version.txt` (project root, ships inside installer)

Simple text file with the current version. Ships with the installer and gets updated after each OTA update.

```
1.0.0
```

### 2. Server endpoint: `GET /api/updates/latest`

**Location:** Add to your license server (`api.herculesv2.app`) or create a new blueprint.

**Response:**
```json
{
  "version": "1.0.3",
  "url": "https://api.herculesv2.app/updates/hercules-update-1.0.3.zip",
  "sha256": "a1b2c3d4e5f6...",
  "changelog": "Fixed report export, added new tags"
}
```

**Implementation option A:** Static JSON file on your server, updated by CI/CD.
**Implementation option B:** New Flask blueprint `updates_bp.py` on the license server that reads from a DB or file.

### 3. Server storage for update zips

Store the zip files at a URL the launcher can download. Options:
- GitHub Releases (free, public or private)
- Your own server at `api.herculesv2.app/updates/`
- S3/Cloudflare R2 bucket

---

## Files to Modify

### 1. `launcher.py` — Add update check after license check

**Where:** In `main()`, between the license check (line 337) and PostgreSQL start (line 339).

**New function to add:**

```python
import shutil
import tempfile
import zipfile
import hashlib

UPDATE_CHECK_URL = f"{LICENSE_SERVER_URL}/api/updates/latest"
VERSION_FILE = os.path.join(BASE_DIR, "version.txt")

def _get_local_version():
    """Read local version.txt. Returns '0.0.0' if missing."""
    try:
        with open(VERSION_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "0.0.0"

def _version_tuple(v):
    """Convert '1.2.3' to (1, 2, 3) for comparison."""
    return tuple(int(x) for x in v.split("."))

def check_and_apply_update():
    """Check server for newer version; download and apply if available."""
    local_ver = _get_local_version()
    print(f"Current version: {local_ver}")

    try:
        req = urllib.request.Request(
            UPDATE_CHECK_URL,
            headers={"User-Agent": "HerculesLauncher/1.0",
                     "ngrok-skip-browser-warning": "true"},
        )
        ctx = _ssl_context()
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            info = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"Update check skipped (server unreachable): {e}")
        return

    remote_ver = info.get("version", "0.0.0")
    if _version_tuple(remote_ver) <= _version_tuple(local_ver):
        print(f"Already up to date (v{local_ver}).")
        return

    print(f"Update available: v{local_ver} → v{remote_ver}")
    download_url = info.get("url")
    expected_hash = info.get("sha256", "")
    if not download_url:
        print("No download URL in update response — skipping.")
        return

    # Download zip to temp file
    tmp = os.path.join(tempfile.gettempdir(), f"hercules-update-{remote_ver}.zip")
    try:
        print(f"Downloading update...")
        urllib.request.urlretrieve(download_url, tmp)
    except Exception as e:
        print(f"Download failed: {e}")
        return

    # Verify checksum (optional but recommended)
    if expected_hash:
        sha = hashlib.sha256()
        with open(tmp, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha.update(chunk)
        if sha.hexdigest() != expected_hash:
            print("Checksum mismatch — update rejected.")
            os.remove(tmp)
            return

    # Extract and replace backend/
    try:
        print("Applying update...")
        backup = BACKEND_DIR + "_backup"
        if os.path.exists(backup):
            shutil.rmtree(backup)
        os.rename(BACKEND_DIR, backup)

        with zipfile.ZipFile(tmp, "r") as zf:
            zf.extractall(BASE_DIR)

        # Success — remove backup and temp
        shutil.rmtree(backup, ignore_errors=True)
        os.remove(tmp)

        with open(VERSION_FILE, "w", encoding="utf-8") as f:
            f.write(remote_ver)
        print(f"Updated to v{remote_ver}.")

    except Exception as e:
        print(f"Update failed: {e}")
        # Restore backup
        if os.path.exists(backup) and not os.path.exists(BACKEND_DIR):
            os.rename(backup, BACKEND_DIR)
        print("Rolled back to previous version.")
```

**In `main()`, add this call:**

```python
def main():
    # ... license check (existing code) ...

    # NEW — check for OTA update
    check_and_apply_update()

    if not os.path.exists(PG_CTL):
    # ... rest of existing code ...
```

### 2. `setup_local_db.py` — Auto-discover new migrations

**Current problem:** `MIGRATION_ORDER` is a hardcoded list. New migrations won't run unless the list is updated.

**Change:** After running the ordered list, also scan `migrations/` for any `.sql` files NOT in the list and run them. This way, if an OTA update adds a new migration file, it gets picked up automatically.

**Add after the migration loop in `run_migrations()`:**

```python
# Auto-discover migrations not in MIGRATION_ORDER
all_sql = set(f for f in os.listdir(MIGRATIONS_DIR) if f.endswith('.sql'))
ordered = set(MIGRATION_ORDER)
extra = sorted(all_sql - ordered)
for filename in extra:
    path = os.path.join(MIGRATIONS_DIR, filename)
    with open(path, 'r', encoding='utf-8') as f:
        sql = f.read()
    try:
        cur.execute(sql)
        print(f'  OK    {filename}  (auto-discovered)')
    except Exception as e:
        conn.rollback()
        conn.autocommit = True
        msg = str(e).split('\n')[0]
        print(f'  SKIP  {filename}  ({msg})')
```

### 3. `installer.iss` — No change needed

Already includes everything in `dist_launcher\launcher\*`. Just place `version.txt` in `dist_launcher\launcher\` before building.

### 4. `launcher.spec` — No change needed

The launcher.exe doesn't bundle the backend. It stays as-is.

---

## Update Zip Structure

The zip file downloaded by the launcher must contain a `backend/` folder at the top level:

```
hercules-update-1.0.3.zip
└── backend/
    ├── app.py
    ├── tags_bp.py
    ├── report_builder_bp.py
    ├── ... (all .py files)
    ├── workers/
    ├── utils/
    ├── tools/
    ├── migrations/
    │   ├── (existing .sql files)
    │   └── new_migration.sql    ← new migrations included
    ├── config/
    └── frontend/
        └── dist/
            ├── index.html
            └── assets/
```

---

## Build & Publish Workflow

### Manual (PowerShell)

```powershell
# 1. Build frontend for launcher
cd Frontend
Copy-Item .env.launcher .env.production.local -Force
npm run build
cd ..

# 2. Copy frontend into backend
Remove-Item -Recurse -Force backend\frontend\dist
Copy-Item -Recurse Frontend\dist backend\frontend\dist

# 3. Create update zip (backend/ only)
Compress-Archive -Path backend -DestinationPath hercules-update-1.0.3.zip -Force

# 4. Get the SHA-256
(Get-FileHash hercules-update-1.0.3.zip -Algorithm SHA256).Hash

# 5. Upload zip to your server
# 6. Update /api/updates/latest with new version + URL + hash
```

### GitHub Actions (automated)

```yaml
name: Build OTA Update
on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  build-update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with: { node-version: 20 }

      - name: Build frontend
        run: |
          cd Frontend
          cp .env.launcher .env.production.local
          npm ci && npm run build
          cp -r dist ../backend/frontend/dist

      - name: Create update zip
        run: zip -r hercules-update-${{ github.ref_name }}.zip backend/

      - name: Upload to release
        uses: softprops/action-gh-release@v2
        if: startsWith(github.ref, 'refs/tags/')
        with:
          files: hercules-update-*.zip
```

---

## Startup Flow (After Implementation)

```
User double-clicks launcher.exe
    │
    ├── 1. License check (existing)
    │
    ├── 2. OTA update check ← NEW
    │   ├── Read version.txt → "1.0.1"
    │   ├── GET /api/updates/latest → {"version": "1.0.3", ...}
    │   ├── If same → skip
    │   ├── If newer → download zip → verify SHA-256 → replace backend/
    │   └── If server unreachable → skip, run existing version
    │
    ├── 3. Start PostgreSQL
    ├── 4. Run DB setup (runs new migrations automatically)
    ├── 5. Start backend (uses updated code)
    └── 6. Open browser → localhost:5004
```

---

## Summary of All Changes

| File | Change | Effort |
|------|--------|--------|
| **`version.txt`** | NEW — create with `1.0.0` | Trivial |
| **`launcher.py`** | Add `check_and_apply_update()` + call in `main()` | Medium |
| **`setup_local_db.py`** | Add auto-discover for new migration `.sql` files | Small |
| **Server** | Add `GET /api/updates/latest` endpoint + host zip files | Medium |
| **CI/CD** | GitHub Action to build + zip + publish on push | Optional |
| `installer.iss` | No change | None |
| `launcher.spec` | No change | None |

### Priority Order

1. **`version.txt`** + **`launcher.py`** update logic — core feature
2. **Server endpoint** — needed for launcher to check
3. **`setup_local_db.py`** migration auto-discover — DB schema stays in sync
4. **CI/CD** — automates the zip build + upload

---

*Created: 2026-03-25*
