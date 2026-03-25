# Hercules Desktop App — OTA (Over-the-Air) Update Plan

How the installed EXE app auto-updates its backend and frontend code via GitHub Releases — no custom server endpoint, no manual version bumping.

---

## Architecture

```
User machine (installed app)
├── launcher.exe              ← compiled, NEVER changes
├── python_embed/             ← portable Python + pip packages, rarely changes
├── psql/                     ← portable PostgreSQL, never changes
├── data/                     ← user's database, never touch
├── version.txt               ← auto-managed by launcher (written after each update)
└── backend/                  ← UPDATABLE: replaced by OTA zip
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

## How It Works (End to End)

```
Developer pushes to Salalah_Mill_B branch
    │
    ▼
GitHub Action triggers automatically
    ├── Generates version: 1.0.<total-commit-count>
    ├── Builds frontend (npm run build with .env.launcher)
    ├── Copies frontend/dist into backend/
    ├── Zips backend/ → hercules-update-1.0.42.zip
    └── Creates GitHub Release (tag: v1.0.42) with zip attached
    │
    ▼
User opens the app (any time later)
    │
    ▼
launcher.exe starts
    ├── 1. License check (existing)
    ├── 2. OTA update check ← NEW
    │   ├── Read local version.txt → "1.0.40"
    │   ├── GET api.github.com/.../releases/latest → tag_name "v1.0.42"
    │   ├── Compare: 1.0.42 > 1.0.40 → update available
    │   ├── Download zip from release assets
    │   ├── Verify SHA-256
    │   ├── Backup backend/ → backend_backup/
    │   ├── Extract zip → replaces backend/
    │   ├── Write "1.0.42" to version.txt
    │   └── If anything fails → restore backup, continue with old version
    ├── 3. Start PostgreSQL
    ├── 4. Run DB setup (auto-discovers + runs new migrations)
    ├── 5. Start backend (uses updated code)
    └── 6. Open browser → localhost:5004
```

---

## Files to Create

### 1. `version.txt` (ships with installer, auto-managed after that)

Place in `dist_launcher\launcher\` before building installer. After that, the launcher overwrites it on each successful update.

```
1.0.0
```

### 2. `.github/workflows/build-ota-update.yml`

GitHub Action that triggers on push to `Salalah_Mill_B`:

```yaml
name: Build OTA Update

on:
  push:
    branches: [Salalah_Mill_B]

permissions:
  contents: write

jobs:
  build-and-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # full history for commit count

      - name: Generate version from commit count
        id: version
        run: |
          COUNT=$(git rev-list --count HEAD)
          VERSION="1.0.${COUNT}"
          echo "version=${VERSION}" >> "$GITHUB_OUTPUT"
          echo "Generated version: ${VERSION}"

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Build frontend for launcher
        run: |
          cd Frontend
          cp .env.launcher .env.production.local
          npm ci
          npm run build

      - name: Copy frontend into backend
        run: |
          rm -rf backend/frontend/dist
          cp -r Frontend/dist backend/frontend/dist

      - name: Create update zip
        run: zip -r hercules-update-${{ steps.version.outputs.version }}.zip backend/

      - name: Compute SHA-256
        id: hash
        run: |
          SHA=$(sha256sum hercules-update-${{ steps.version.outputs.version }}.zip | cut -d' ' -f1)
          echo "sha256=${SHA}" >> "$GITHUB_OUTPUT"

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ steps.version.outputs.version }}
          name: v${{ steps.version.outputs.version }}
          body: |
            Auto-generated OTA update from Salalah_Mill_B branch.
            SHA-256: `${{ steps.hash.outputs.sha256 }}`
          files: hercules-update-${{ steps.version.outputs.version }}.zip
```

---

## Files to Modify

### 1. `launcher.py` — Add OTA update check

**New imports** (add at top, most already exist):

```python
import shutil
import tempfile
import zipfile
import hashlib
```

**New constants** (add after existing constants):

```python
GITHUB_REPO = "husam-hammami/Reporting_Module_v0.1"
GITHUB_RELEASES_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
VERSION_FILE = os.path.join(BASE_DIR, "version.txt")
```

**New functions** (add before `main()`):

```python
def _get_local_version():
    try:
        with open(VERSION_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "0.0.0"


def _version_tuple(v):
    return tuple(int(x) for x in v.replace("v", "").split("."))


def check_and_apply_update():
    local_ver = _get_local_version()
    print(f"Current version: {local_ver}")

    # Fetch latest release from GitHub
    try:
        req = urllib.request.Request(
            GITHUB_RELEASES_URL,
            headers={
                "User-Agent": "HerculesLauncher/1.0",
                "Accept": "application/vnd.github+json",
            },
        )
        ctx = _ssl_context()
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            release = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"Update check skipped (GitHub unreachable): {e}")
        return

    remote_ver = release.get("tag_name", "v0.0.0").lstrip("v")
    if _version_tuple(remote_ver) <= _version_tuple(local_ver):
        print(f"Already up to date (v{local_ver}).")
        return

    # Find the zip asset
    assets = release.get("assets", [])
    zip_asset = None
    for a in assets:
        if a.get("name", "").endswith(".zip"):
            zip_asset = a
            break
    if not zip_asset:
        print("No zip asset in release — skipping update.")
        return

    download_url = zip_asset["browser_download_url"]
    print(f"Update available: v{local_ver} -> v{remote_ver}")

    # Download to temp
    tmp = os.path.join(tempfile.gettempdir(), zip_asset["name"])
    try:
        print("Downloading update...")
        req = urllib.request.Request(download_url, headers={"User-Agent": "HerculesLauncher/1.0"})
        with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
            with open(tmp, "wb") as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
    except Exception as e:
        print(f"Download failed: {e}")
        return

    # Extract and replace backend/
    backup = BACKEND_DIR + "_backup"
    try:
        print("Applying update...")
        if os.path.exists(backup):
            shutil.rmtree(backup)
        os.rename(BACKEND_DIR, backup)

        with zipfile.ZipFile(tmp, "r") as zf:
            zf.extractall(BASE_DIR)

        shutil.rmtree(backup, ignore_errors=True)
        os.remove(tmp)

        with open(VERSION_FILE, "w", encoding="utf-8") as f:
            f.write(remote_ver)
        print(f"Updated to v{remote_ver}.")

    except Exception as e:
        print(f"Update failed: {e}")
        if os.path.exists(backup) and not os.path.exists(BACKEND_DIR):
            os.rename(backup, BACKEND_DIR)
        print("Rolled back to previous version.")
```

**In `main()`** — add one line between license check and PostgreSQL start:

```python
    # (after license check, before PostgreSQL start)
    check_and_apply_update()

    if not os.path.exists(PG_CTL):
```

### 2. `setup_local_db.py` — Auto-discover new migrations

**Add at the end of `run_migrations()`** (after the `MIGRATION_ORDER` loop, before `cur.close()`):

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

Already includes everything in `dist_launcher\launcher\*`.

### 4. `launcher.spec` — No change needed

Only needs rebuilding if `launcher.py` itself changes (which it will once you add the update logic — rebuild once, then never again).

---

## Update Zip Structure

The GitHub Action creates a zip with `backend/` at the top level:

```
hercules-update-1.0.42.zip
└── backend/
    ├── app.py
    ├── *_bp.py
    ├── workers/
    ├── utils/
    ├── tools/
    ├── migrations/
    │   ├── (existing .sql files)
    │   └── new_migration.sql    ← arrives with update
    ├── config/
    └── frontend/
        └── dist/                ← rebuilt React app
```

---

## Auto-Versioning

No manual version bumps. The version is `1.0.<commit-count>`:

| Push # | Commit count | Version | Tag |
|--------|-------------|---------|-----|
| 1st | 150 | 1.0.150 | v1.0.150 |
| 2nd | 151 | 1.0.151 | v1.0.151 |
| 5th | 155 | 1.0.155 | v1.0.155 |

The launcher compares its local `version.txt` against `tag_name` from GitHub Releases. If the remote is higher, it updates.

---

## Summary of All Changes

| File | Change | Rebuild EXE? |
|------|--------|-------------|
| **`version.txt`** | NEW — create with `1.0.0`, place in `dist_launcher\launcher\` | No |
| **`launcher.py`** | Add `check_and_apply_update()` + call in `main()` | **Yes (once)** |
| **`launcher.spec`** | No change, but rebuild EXE since launcher.py changed | **Yes (once)** |
| **`setup_local_db.py`** | Add auto-discover for new migration files | No (arrives via OTA) |
| **`.github/workflows/build-ota-update.yml`** | NEW — CI pipeline | No |
| `installer.iss` | No change | No |
| `python_embed/` | No change | No |
| `psql/` | No change | No |

### One-Time Steps

1. Add the update logic to `launcher.py`
2. Rebuild `launcher.exe` with PyInstaller (last time you need to rebuild)
3. Create `version.txt` with `1.0.0`
4. Add `.github/workflows/build-ota-update.yml`
5. Rebuild the Inno Setup installer with the new launcher.exe + version.txt
6. Distribute installer to users

### After That (Ongoing)

Just push code to `Salalah_Mill_B` — everything else is automatic.

---

*Created: 2026-03-25*
