"""
Hercules Reporting Module — Standalone launcher.
Starts portable PostgreSQL, runs DB setup on first run, then starts the Flask backend.
Designed to be compiled to launcher.exe (e.g. PyInstaller) for the installer bundle.
"""
import hashlib
import json
import os
import platform
import shutil
import ssl
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
import urllib.error
import webbrowser
import zipfile
from datetime import datetime

try:
    import uuid
except ImportError:
    uuid = None

LICENSE_SERVER_URL = "https://api.herculesv2.app"


def pause_before_exit(msg="Press Enter to exit."):
    """Keep console open so the user can read the message (works when double-clicking EXE)."""
    try:
        input(msg)
    except EOFError:
        if os.name == "nt":
            os.system("pause")
        else:
            print("(Waiting 15 seconds...)")
            time.sleep(15)


def _machine_id_fallback():
    """Machine ID without depending on backend utils (e.g. when backend folder is missing)."""
    if uuid is None:
        return "(unavailable)"
    node = uuid.getnode()
    return ":".join(("{:02x}".format((node >> i) & 0xFF) for i in range(40, -1, -8)))


def _verify_license_inline(license_path):
    """
    Verify license.json without importing backend. Used so the EXE works even when
    the backend folder is missing or incomplete. Returns True if valid.
    """
    if not license_path or not os.path.exists(license_path):
        return False
    try:
        with open(license_path, encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return False
    if data.get("machine_id") != _machine_id_fallback():
        return False
    expiry_str = data.get("expiry")
    if not expiry_str:
        return False
    try:
        expiry = datetime.strptime(expiry_str, "%Y-%m-%d")
    except ValueError:
        return False
    if expiry.date() < datetime.now().date():
        return False
    return True


def _ssl_context():
    """Return an SSL context that works even when certifi/CA bundle is missing (embedded Python)."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        pass
    ctx = ssl.create_default_context()
    try:
        ctx.load_default_certs()
    except Exception:
        pass
    if not ctx.get_ca_certs():
        ctx = ssl._create_unverified_context()
    return ctx


def _check_license_online(machine_id):
    """POST machine_id to the license server. Returns parsed JSON or None on failure."""
    try:
        payload = json.dumps({
            "machine_id": machine_id,
            "user_id": os.environ.get("USERNAME", ""),
            "hostname": platform.node(),
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{LICENSE_SERVER_URL}/api/license/register",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "HerculesLauncher/1.0",
                "ngrok-skip-browser-warning": "true",
            },
            method="POST",
        )
        ctx = _ssl_context()
        with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"License server error: {e}")
        return None


# When packaged by PyInstaller, use EXE location so we find backend/, psql/, python_embed/, data/
if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

PG_BIN = os.path.join(BASE_DIR, "psql", "bin")
DATA_DIR = os.path.join(BASE_DIR, "data")
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
BACKEND_EXE = os.path.join(BACKEND_DIR, "hercules-backend.exe")
SETUP_SCRIPT = os.path.join(BACKEND_DIR, "tools", "setup", "setup_local_db.py")
APP_MAIN = os.path.join(BACKEND_DIR, "app.py")

GITHUB_REPO = "husam-hammami/Reporting_Module_v0.1"
GITHUB_RELEASES_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases"
VERSION_FILE = os.path.join(BASE_DIR, "version.txt")
BRANCH_FILE = os.path.join(BASE_DIR, "backend", "release_branch.txt")

PG_CTL = os.path.join(PG_BIN, "pg_ctl.exe")
INITDB = os.path.join(PG_BIN, "initdb.exe")
PG_ISREADY = os.path.join(PG_BIN, "pg_isready.exe")

PORT = "5434"
BACKEND_PORT = "5004"

# Bundled embedded Python (portable, no dependency on build machine). Prefer over venv.
PYTHON_EMBED_DIR = os.path.join(BASE_DIR, "python_embed")
PYTHON_EMBED_EXE = os.path.join(PYTHON_EMBED_DIR, "python.exe")

VENV_DIR = os.path.join(BASE_DIR, "venv")
VENV_SCRIPTS = os.path.join(VENV_DIR, "Scripts")


def get_python():
    """Use bundled embedded Python if present (portable); else fall back to venv for local dev."""
    if os.path.exists(PYTHON_EMBED_EXE):
        return PYTHON_EMBED_EXE
    venv_python = os.path.join(VENV_SCRIPTS, "python.exe")
    if os.path.exists(venv_python):
        return venv_python
    print("ERROR: No Python found.")
    print("For installed app: expected bundled Python at:", PYTHON_EMBED_EXE)
    print("For development: expected venv at:", venv_python)
    sys.exit(1)


def _using_embed():
    """True if we are using the bundled embedded Python (not venv)."""
    return os.path.exists(PYTHON_EMBED_EXE)


def get_venv_env():
    """Return env dict so subprocess finds the right Python and packages (embed or venv)."""
    env = os.environ.copy()
    python_exe = get_python()
    if _using_embed():
        # Embedded Python: prepend its directory so it finds its DLLs and site-packages
        embed_dir = os.path.dirname(python_exe)
        env["PATH"] = embed_dir + os.pathsep + env.get("PATH", "")
        # Scripts may exist if pip was added to the embed
        scripts = os.path.join(embed_dir, "Scripts")
        if os.path.isdir(scripts):
            env["PATH"] = scripts + os.pathsep + env["PATH"]
    else:
        env["VIRTUAL_ENV"] = VENV_DIR
        env["PATH"] = VENV_SCRIPTS + os.pathsep + env.get("PATH", "")
    return env


def run(cmd, env=None, cwd=None):
    """Run command, return CompletedProcess with stdout/stderr bytes."""
    return subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env or os.environ,
        cwd=cwd or BASE_DIR,
        shell=False,
    )


def init_db_if_needed():
    """Initialize PostgreSQL cluster in data/ if not already present."""
    pg_version = os.path.join(DATA_DIR, "PG_VERSION")
    if os.path.exists(pg_version):
        return
    print("Initializing PostgreSQL cluster...")
    os.makedirs(DATA_DIR, exist_ok=True)
    subprocess.check_call([INITDB, "-D", DATA_DIR, "-U", "postgres"], cwd=BASE_DIR)


def start_postgres():
    """Start portable PostgreSQL on PORT."""
    print("Starting PostgreSQL...")
    subprocess.Popen(
        [PG_CTL, "-D", DATA_DIR, "-o", f"-p {PORT}", "start"],
        cwd=BASE_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def wait_for_db(timeout_sec=60):
    """Wait until PostgreSQL is accepting connections."""
    print("Waiting for PostgreSQL...")
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        result = run([PG_ISREADY, "-h", "127.0.0.1", "-p", PORT, "-d", "postgres"])
        if result.returncode == 0 and (result.stdout or b"").strip().endswith(b"accepting connections"):
            return
        time.sleep(0.5)
    raise RuntimeError("PostgreSQL did not become ready in time.")


def run_setup():
    """Run setup_local_db.py (create DB, migrations, default user). Uses portable DB port."""
    print("Running DB setup...")
    env = get_venv_env()
    env["DB_HOST"] = "127.0.0.1"
    env["DB_PORT"] = PORT
    env["POSTGRES_DB"] = "dynamic_db_hercules"
    env["POSTGRES_USER"] = "postgres"
    env["POSTGRES_PASSWORD"] = ""
    python = get_python()
    subprocess.check_call(
        [python, SETUP_SCRIPT, "--no-seed"],
        cwd=BASE_DIR,
        env=env,
    )


def ensure_pkg_resources():
    """Ensure Python env has setuptools (pkg_resources) so python-snap7 can import it."""
    python = get_python()
    env = get_venv_env()
    check = subprocess.run(
        [python, "-c", "import pkg_resources"],
        env=env,
        cwd=BASE_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check.returncode == 0:
        return
    print("Installing setuptools (required by python-snap7)...")
    # Use python -m pip so it works for both embed and venv (embed may not have pip.exe in PATH yet)
    subprocess.check_call(
        [python, "-m", "pip", "install", "setuptools>=59.0,<66"],
        env=env,
        cwd=BASE_DIR,
    )


def start_backend():
    """Start Flask backend. Uses frozen exe if available, otherwise falls back to python app.py."""
    print("Starting backend...")
    env = get_venv_env()
    env["DB_HOST"] = "127.0.0.1"
    env["DB_PORT"] = PORT
    env["POSTGRES_DB"] = "dynamic_db_hercules"
    env["POSTGRES_USER"] = "postgres"
    env["POSTGRES_PASSWORD"] = ""
    env["FLASK_PORT"] = BACKEND_PORT

    if os.path.exists(BACKEND_EXE):
        # Frozen backend (from CI build)
        print(f"Using frozen backend: {BACKEND_EXE}")
        subprocess.Popen(
            [BACKEND_EXE],
            cwd=BACKEND_DIR,
            env=env,
        )
    else:
        # Source-based backend (local dev)
        ensure_pkg_resources()
        python = get_python()
        subprocess.Popen(
            [python, APP_MAIN],
            cwd=BACKEND_DIR,
            env=env,
        )


def _get_local_version():
    try:
        with open(VERSION_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "0.0.0"


def _version_tuple(v):
    """Parse version string like '1.0.42' into tuple. Strips any branch prefix safely."""
    import re
    # Strip everything up to and including the last 'v' before the version numbers
    # Handles: "1.0.42", "v1.0.42", "salalah_mill_b-v1.0.42", "main-v1.0.42"
    m = re.search(r'(\d+\.\d+\.\d+)', v)
    if m:
        return tuple(int(x) for x in m.group(1).split("."))
    # Fallback: try the old way
    return tuple(int(x) for x in v.replace("v", "").split("."))


def _get_release_branch():
    """Read branch name from release_branch.txt (written by CI), else env var or default."""
    try:
        with open(BRANCH_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        pass
    return os.environ.get("RELEASE_BRANCH", "Salalah_Mill_B")


def _branch_slug(branch):
    return branch.replace("/", "-").lower()


def check_and_apply_update():
    local_ver = _get_local_version()
    branch = _get_release_branch()
    slug = _branch_slug(branch)
    prefix = f"{slug}-v"
    print(f"Current version: {local_ver} (branch: {branch})")

    try:
        req = urllib.request.Request(
            GITHUB_RELEASES_URL + "?per_page=20",
            headers={
                "User-Agent": "HerculesLauncher/1.0",
                "Accept": "application/vnd.github+json",
            },
        )
        ctx = _ssl_context()
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            releases = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"Update check skipped (GitHub unreachable): {e}")
        return

    # Find the latest release matching this branch's tag prefix
    best_release = None
    best_ver = None
    for release in releases:
        tag = release.get("tag_name", "")
        if not tag.startswith(prefix):
            continue
        ver_str = tag[len(prefix):]
        try:
            ver = _version_tuple(ver_str)
        except (ValueError, AttributeError):
            continue
        if best_ver is None or ver > best_ver:
            best_ver = ver
            best_release = release

    if best_release is None:
        print(f"No releases found for branch '{branch}'.")
        return

    remote_ver = best_release["tag_name"][len(prefix):]
    if _version_tuple(remote_ver) <= _version_tuple(local_ver):
        print(f"Already up to date (v{local_ver}).")
        return

    assets = best_release.get("assets", [])
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


def ensure_firewall_rule():
    """Add Windows Firewall inbound rule for Hercules (idempotent — skips if exists)."""
    if platform.system() != "Windows":
        return
    rule_name = "Hercules Web Access"
    check = subprocess.run(
        ["netsh", "advfirewall", "firewall", "show", "rule", f"name={rule_name}"],
        capture_output=True, text=True
    )
    if check.returncode == 0 and rule_name in check.stdout:
        print(f"Firewall rule '{rule_name}' already exists.")
        return
    print(f"Adding firewall rule '{rule_name}' for port {BACKEND_PORT}...")
    result = subprocess.run(
        ["netsh", "advfirewall", "firewall", "add", "rule",
         f"name={rule_name}", "dir=in", "action=allow",
         "protocol=TCP", f"localport={BACKEND_PORT}"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        print("Firewall rule added successfully.")
    else:
        print(f"Warning: Could not add firewall rule: {result.stderr}")


def main():
    machine_id = _machine_id_fallback()
    license_path = os.path.join(BASE_DIR, "license.json")

    # --- Hybrid license check: online first, then offline cache ---
    print("Checking license...")
    response = _check_license_online(machine_id)

    if response is not None:
        status = response.get("status")
        expiry_str = response.get("expiry")

        if status == "approved" and expiry_str:
            try:
                expiry_date = datetime.strptime(expiry_str, "%Y-%m-%d").date()
            except ValueError:
                expiry_date = None

            if expiry_date and expiry_date >= datetime.now().date():
                with open(license_path, "w", encoding="utf-8") as f:
                    json.dump({"machine_id": machine_id, "expiry": expiry_str}, f, indent=4)
                print(f"License valid until {expiry_str}")
            else:
                print(f"License expired on {expiry_str}. Contact administrator to extend.")
                print("Machine ID:", machine_id)
                pause_before_exit()
                sys.exit(1)

        elif status == "pending":
            print("Registration received. Waiting for administrator approval.")
            print("Machine ID:", machine_id)
            pause_before_exit()
            sys.exit(1)

        elif status == "denied":
            print("Access denied by administrator.")
            print("Machine ID:", machine_id)
            pause_before_exit()
            sys.exit(1)

        else:
            print(f"Unexpected license status: {status}")
            print("Machine ID:", machine_id)
            pause_before_exit()
            sys.exit(1)
    else:
        # Offline: fall back to cached license.json
        if _verify_license_inline(license_path):
            try:
                with open(license_path, encoding="utf-8") as f:
                    cached = json.load(f)
                print(f"Offline mode — cached license valid until {cached.get('expiry', '?')}")
            except Exception:
                print("Offline mode — using cached license.")
        else:
            print("Cannot reach license server and no valid cached license.")
            print("Machine ID:", machine_id)
            print("Please check your internet connection and try again.")
            pause_before_exit()
            sys.exit(1)

    check_and_apply_update()

    if not os.path.exists(PG_CTL):
        print(f"Error: PostgreSQL binaries not found at {PG_BIN}")
        print("Expected folder: psql/bin/ with pg_ctl.exe, initdb.exe, pg_isready.exe")
        pause_before_exit()
        sys.exit(1)

    init_db_if_needed()
    start_postgres()
    wait_for_db()
    # Idempotent: creates DB/migrations/default user if missing; skips if already done
    run_setup()
    ensure_firewall_rule()
    start_backend()

    url = f"http://localhost:{BACKEND_PORT}"
    print("System started.")
    print(f"Open {url} in your browser.")
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        lan_ip = s.getsockname()[0]
        s.close()
        print(f"LAN access: http://{lan_ip}:{BACKEND_PORT}")
    except Exception:
        pass
    webbrowser.open(url)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        pause_before_exit()
        sys.exit(1)
