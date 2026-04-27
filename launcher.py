"""
Hercules Reporting Module — Standalone launcher.
Starts portable PostgreSQL, runs DB setup on first run, then starts the Flask backend.
Designed to be compiled to launcher.exe (e.g. PyInstaller) for the installer bundle.
"""
import ctypes
import ctypes.wintypes
import hashlib
import json
import logging
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


def _hide_launcher_console():
    """Hide the launcher's own console window immediately.

    We build with console=True (PyInstaller) so PostgreSQL child processes inherit
    a real console and don't crash with 0xC0000005.  This function hides the window
    before the user can see it.
    """
    try:
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 0)  # SW_HIDE
    except Exception:
        pass

_hide_launcher_console()


def _hidden_si():
    """Return a STARTUPINFO that hides the console window without breaking child processes."""
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow = 0  # SW_HIDE
    return si


def _is_pid_alive(pid):
    """Check whether a Windows process with the given PID is still running."""
    try:
        kernel32 = ctypes.windll.kernel32
        SYNCHRONIZE = 0x00100000
        handle = kernel32.OpenProcess(SYNCHRONIZE, False, int(pid))
        if not handle:
            return False
        kernel32.CloseHandle(handle)
        return True
    except Exception:
        return False


def _setup_logging():
    if getattr(sys, "frozen", False):
        log_dir = os.path.dirname(sys.executable)
    else:
        log_dir = os.path.dirname(os.path.abspath(__file__))
    log_file = os.path.join(log_dir, "launcher.log")
    logging.basicConfig(
        filename=log_file,
        level=logging.INFO,
        format="%(asctime)s  %(levelname)s  %(message)s",
    )

_setup_logging()
log = logging.getLogger("launcher")


def _show_error(message, title="Hercules"):
    """Show a native Windows error dialog."""
    log.error(message)
    MB_OK = 0x00000000
    MB_ICONERROR = 0x00000010
    ctypes.windll.user32.MessageBoxW(0, message, title, MB_OK | MB_ICONERROR)


def _fatal(message, title="Hercules"):
    """Show error dialog and exit."""
    _show_error(message, title)
    sys.exit(1)


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
        log.warning("License server error: %s", e)
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
PSQL_EXE = os.path.join(PG_BIN, "psql.exe")

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
    _fatal(
        "No Python found.\n\n"
        f"For installed app: expected bundled Python at:\n{PYTHON_EMBED_EXE}\n\n"
        f"For development: expected venv at:\n{venv_python}"
    )


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


def _hidden_kwargs():
    """Return kwargs that hide child process windows.

    With console=True in the spec, children inherit the launcher's (hidden) console.
    SW_HIDE ensures no new visible windows appear.
    """
    return dict(startupinfo=_hidden_si())


def _pg_kwargs():
    """Return kwargs for PostgreSQL commands (initdb, pg_ctl).

    PostgreSQL needs CREATE_NEW_CONSOLE so its child process postgres --boot
    gets a real console for Windows signal handling.  Without it, postgres
    crashes with 0xC0000005 on some machines.

    IMPORTANT: Do NOT add startupinfo/SW_HIDE here — combining
    STARTF_USESHOWWINDOW with CREATE_NEW_CONSOLE breaks postgres --boot
    on some Windows machines.  The console window flashes briefly (only
    during first-run initdb) but this is the only reliable approach.
    """
    return dict(creationflags=subprocess.CREATE_NEW_CONSOLE)


def run(cmd, env=None, cwd=None, hide=True):
    """Run command, return CompletedProcess with stdout/stderr bytes."""
    kwargs = dict(
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env or os.environ,
        cwd=cwd or BASE_DIR,
        shell=False,
    )
    if hide:
        kwargs.update(_hidden_kwargs())
    return subprocess.run(cmd, **kwargs)


def run_checked(cmd, label="Command", env=None, cwd=None, hide=True):
    """Run a command, capture output, and show a message box on failure."""
    kwargs = dict(
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env or os.environ,
        cwd=cwd or BASE_DIR,
    )
    if hide:
        kwargs.update(_hidden_kwargs())
    result = subprocess.run(cmd, **kwargs)
    if result.returncode != 0:
        output = (result.stdout or b"").decode("utf-8", errors="replace").strip()
        log.error("%s failed (exit %d):\n%s", label, result.returncode, output)
        _fatal(f"{label} failed (exit code {result.returncode}):\n\n{output}")
    return result


def init_db_if_needed():
    """Initialize PostgreSQL cluster in data/ if not already present."""
    pg_version = os.path.join(DATA_DIR, "PG_VERSION")
    if os.path.exists(pg_version):
        return
    if os.path.exists(DATA_DIR):
        log.info("Removing incomplete data directory from a previous failed init...")
        shutil.rmtree(DATA_DIR, ignore_errors=True)
    log.info("Initializing PostgreSQL cluster...")
    kwargs = dict(
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=BASE_DIR,
        **_pg_kwargs(),
    )
    result = subprocess.run(
        [INITDB, "-D", DATA_DIR, "-U", "postgres"],
        **kwargs,
    )
    if result.returncode != 0:
        output = (result.stdout or b"").decode("utf-8", errors="replace").strip()
        log.error("PostgreSQL initdb failed (exit %d):\n%s", result.returncode, output)
        _fatal(f"PostgreSQL initdb failed (exit code {result.returncode}):\n\n{output}")


def _clean_stale_postmaster_pid():
    """Remove stale postmaster.pid left by an unclean PostgreSQL shutdown."""
    pid_file = os.path.join(DATA_DIR, "postmaster.pid")
    if not os.path.exists(pid_file):
        return
    try:
        with open(pid_file, encoding="utf-8") as f:
            first_line = f.readline().strip()
        pid = int(first_line)
        if _is_pid_alive(pid):
            log.info("postmaster.pid (pid %d) is still alive — skipping removal.", pid)
            return
        log.info("Removing stale postmaster.pid (pid %d is dead).", pid)
        os.remove(pid_file)
    except (ValueError, OSError) as e:
        log.warning("Could not clean postmaster.pid: %s — removing it.", e)
        try:
            os.remove(pid_file)
        except OSError:
            pass


def start_postgres():
    """Start portable PostgreSQL on PORT."""
    log.info("Starting PostgreSQL...")
    subprocess.Popen(
        [PG_CTL, "-D", DATA_DIR, "-o", f"-p {PORT}", "start"],
        cwd=BASE_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        **_pg_kwargs(),
    )


def wait_for_db(timeout_sec=60):
    """Wait until PostgreSQL is accepting connections."""
    log.info("Waiting for PostgreSQL...")
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        result = run([PG_ISREADY, "-h", "127.0.0.1", "-p", PORT, "-d", "postgres"])
        if result.returncode == 0 and (result.stdout or b"").strip().endswith(b"accepting connections"):
            return
        time.sleep(0.5)
    raise RuntimeError("PostgreSQL did not become ready in time.")


def run_setup():
    """Create DB, run SQL migrations, and ensure default admin user — using psql directly.

    This mirrors the Electron desktop app's runInitDb() approach so that the launcher
    works with the frozen hercules-backend.exe bundle (which does NOT include
    setup_local_db.py but DOES ship _internal/migrations/*.sql).
    Falls back to the old python setup_local_db.py path for local development.
    """
    if os.path.exists(SETUP_SCRIPT) and not os.path.exists(BACKEND_EXE):
        log.info("Dev mode: running setup_local_db.py...")
        env = get_venv_env()
        env["DB_HOST"] = "127.0.0.1"
        env["DB_PORT"] = PORT
        env["POSTGRES_DB"] = "dynamic_db_hercules"
        env["POSTGRES_USER"] = "postgres"
        env["POSTGRES_PASSWORD"] = ""
        python = get_python()
        run_checked(
            [python, SETUP_SCRIPT, "--no-seed"],
            label="DB setup",
            env=env,
        )
        return

    log.info("Running DB setup via psql (frozen backend mode)...")
    env = os.environ.copy()
    env["DB_HOST"] = "127.0.0.1"
    env["DB_PORT"] = PORT
    env["POSTGRES_DB"] = "dynamic_db_hercules"
    env["POSTGRES_USER"] = "postgres"
    env["POSTGRES_PASSWORD"] = ""

    db_name = "dynamic_db_hercules"

    # Step 1: Create database if it doesn't exist
    result = subprocess.run(
        [PSQL_EXE, "-h", "127.0.0.1", "-p", PORT, "-U", "postgres", "-d", "postgres",
         "-tAc", f"SELECT 1 FROM pg_database WHERE datname = '{db_name}'"],
        capture_output=True, text=True, env=env, startupinfo=_hidden_si(),
    )
    if result.stdout.strip() != "1":
        run_checked(
            [PSQL_EXE, "-h", "127.0.0.1", "-p", PORT, "-U", "postgres", "-d", "postgres",
             "-c", f"CREATE DATABASE {db_name}"],
            label="Create database", env=env,
        )
        log.info("Created database: %s", db_name)
    else:
        log.info("Database already exists: %s", db_name)

    # Step 2: Run SQL migration files (same order as desktop/main.js runInitDb)
    migrations_dir = os.path.join(BACKEND_DIR, "_internal", "migrations")
    if not os.path.isdir(migrations_dir):
        migrations_dir = os.path.join(BACKEND_DIR, "migrations")

    migration_order = [
        "create_tags_tables.sql",
        "create_users_table.sql",
        "create_bins_and_materials_tables.sql",
        "create_report_builder_tables.sql",
        "create_tag_history_tables.sql",
        "create_kpi_engine_tables.sql",
        "add_is_counter_to_tags.sql",
        "add_bin_activation_fields.sql",
        "add_value_formula_field.sql",
        "add_layout_config_field.sql",
        "add_line_running_tag_fields.sql",
        "add_dynamic_monitoring_tables.sql",
        "alter_tag_history_nullable_layout.sql",
        "create_licenses_table.sql",
        "create_mappings_table.sql",
        "add_tag_history_archive_unique_universal.sql",
        "add_license_machine_info.sql",
        "add_site_and_license_name.sql",
        "create_distribution_rules_table.sql",
        "add_archive_granularity.sql",
        "create_report_execution_log.sql",
        "add_must_change_password.sql",
        "create_hercules_ai_tables.sql",
        "add_ai_summary_to_distribution.sql",
        "add_value_text_to_tag_history.sql",
    ]

    for sql_file in migration_order:
        file_path = os.path.join(migrations_dir, sql_file)
        if not os.path.exists(file_path):
            log.info("SKIP migration: %s (not found)", sql_file)
            continue
        result = subprocess.run(
            [PSQL_EXE, "-h", "127.0.0.1", "-p", PORT, "-U", "postgres",
             "-d", db_name, "-f", file_path],
            capture_output=True, text=True, env=env, startupinfo=_hidden_si(),
        )
        if result.returncode == 0:
            log.info("OK migration: %s", sql_file)
        else:
            log.info("SKIP migration: %s (%s)", sql_file,
                     (result.stderr or "").split("\n")[0])

    # Step 3: Create default admin user if it doesn't exist
    result = subprocess.run(
        [PSQL_EXE, "-h", "127.0.0.1", "-p", PORT, "-U", "postgres", "-d", db_name,
         "-tAc", "SELECT 1 FROM users WHERE username = 'admin'"],
        capture_output=True, text=True, env=env, startupinfo=_hidden_si(),
    )
    if result.stdout.strip() != "1":
        admin_sql = os.path.join(BASE_DIR, "_admin_init.sql")
        with open(admin_sql, "w", encoding="utf-8") as f:
            f.write(
                "INSERT INTO users (username, password_hash, role) VALUES "
                "('admin', '$2b$12$LJ3m4ys3Lk0TSwMBQWJxaeflIOwnGGkahJCsOvn/F9JDOaFf1liGu', 'admin');\n"
            )
        subprocess.run(
            [PSQL_EXE, "-h", "127.0.0.1", "-p", PORT, "-U", "postgres",
             "-d", db_name, "-f", admin_sql],
            capture_output=True, text=True, env=env, startupinfo=_hidden_si(),
        )
        try:
            os.remove(admin_sql)
        except OSError:
            pass
        log.info("Created default admin user (admin/admin)")
    else:
        log.info("Admin user already exists")


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
        startupinfo=_hidden_si(),
    )
    if check.returncode == 0:
        return
    log.info("Installing setuptools (required by python-snap7)...")
    run_checked(
        [python, "-m", "pip", "install", "setuptools>=59.0,<66"],
        label="pip install setuptools",
        env=env,
    )


def start_backend():
    """Start Flask backend. Uses frozen exe if available, otherwise falls back to python app.py.
    Returns the Popen handle for lifecycle management."""
    log.info("Starting backend...")
    env = get_venv_env()
    env["DB_HOST"] = "127.0.0.1"
    env["DB_PORT"] = PORT
    env["POSTGRES_DB"] = "dynamic_db_hercules"
    env["POSTGRES_USER"] = "postgres"
    env["POSTGRES_PASSWORD"] = ""
    env["FLASK_PORT"] = BACKEND_PORT

    backend_log = os.path.join(BASE_DIR, "backend.log")
    log.info("Backend output -> %s", backend_log)
    fh = open(backend_log, "w", encoding="utf-8")

    if os.path.exists(BACKEND_EXE):
        log.info("Using frozen backend: %s", BACKEND_EXE)
        proc = subprocess.Popen(
            [BACKEND_EXE],
            cwd=BACKEND_DIR,
            env=env,
            stdout=fh,
            stderr=fh,
            startupinfo=_hidden_si(),
        )
    else:
        ensure_pkg_resources()
        python = get_python()
        proc = subprocess.Popen(
            [python, APP_MAIN],
            cwd=BACKEND_DIR,
            env=env,
            stdout=fh,
            stderr=fh,
            startupinfo=_hidden_si(),
        )
    return proc


def kill_previous_instances():
    """Kill leftover Hercules processes from a previous run (stale backend, postgres)."""
    import socket

    def _port_in_use(port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(("127.0.0.1", port)) == 0

    if _port_in_use(int(BACKEND_PORT)):
        log.info("Port %s in use — killing previous backend...", BACKEND_PORT)
        subprocess.run(
            ["taskkill", "/F", "/FI", "IMAGENAME eq hercules-backend.exe"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            startupinfo=_hidden_si(),
        )
        subprocess.run(
            ["taskkill", "/F", "/FI", "IMAGENAME eq python.exe"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            startupinfo=_hidden_si(),
        )
        time.sleep(1)

    result = run([PG_ISREADY, "-h", "127.0.0.1", "-p", PORT, "-d", "postgres"])
    if result.returncode == 0:
        log.info("PostgreSQL already running on port %s — stopping it...", PORT)
        try:
            subprocess.run(
                [PG_CTL, "-D", DATA_DIR, "stop", "-m", "fast"],
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                timeout=15, **_pg_kwargs(),
            )
        except Exception:
            subprocess.run(
                ["taskkill", "/F", "/IM", "postgres.exe"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                startupinfo=_hidden_si(),
            )
        time.sleep(1)


def _backend_already_running():
    """Return True if the backend is already responding on its port."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", int(BACKEND_PORT))) == 0


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


def _show_info(message, title="Hercules"):
    """Show a native Windows info dialog (non-blocking would need threading, but OK for brief messages)."""
    log.info(message)
    MB_OK = 0x00000000
    MB_ICONINFORMATION = 0x00000040
    ctypes.windll.user32.MessageBoxW(0, message, title, MB_OK | MB_ICONINFORMATION)


def _kill_running_backend():
    """Stop the currently running backend process so a new version can start."""
    log.info("Stopping old backend for update...")
    subprocess.run(
        ["taskkill", "/F", "/FI", f"IMAGENAME eq python.exe"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        startupinfo=_hidden_si(),
    )
    subprocess.run(
        ["taskkill", "/F", "/FI", f"IMAGENAME eq hercules-backend.exe"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        startupinfo=_hidden_si(),
    )
    time.sleep(2)


def check_and_apply_update():
    """Check GitHub for updates, download and apply if available.

    Returns the new version string if an update was applied, or None.
    """
    local_ver = _get_local_version()
    branch = _get_release_branch()
    slug = _branch_slug(branch)
    prefix = f"{slug}-v"
    log.info("Current version: %s (branch: %s)", local_ver, branch)

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
        log.warning("Update check skipped (GitHub unreachable): %s", e)
        return None

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
        log.info("No releases found for branch '%s'.", branch)
        return None

    remote_ver = best_release["tag_name"][len(prefix):]
    if _version_tuple(remote_ver) <= _version_tuple(local_ver):
        log.info("Already up to date (v%s).", local_ver)
        return None

    assets = best_release.get("assets", [])
    zip_asset = None
    for a in assets:
        if a.get("name", "").endswith(".zip"):
            zip_asset = a
            break
    if not zip_asset:
        log.info("No zip asset in release — skipping update.")
        return None

    download_url = zip_asset["browser_download_url"]
    log.info("Update available: v%s -> v%s", local_ver, remote_ver)

    tmp = os.path.join(tempfile.gettempdir(), zip_asset["name"])
    try:
        log.info("Downloading update...")
        req = urllib.request.Request(download_url, headers={"User-Agent": "HerculesLauncher/1.0"})
        with urllib.request.urlopen(req, timeout=120, context=ctx) as resp:
            with open(tmp, "wb") as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
    except Exception as e:
        log.error("Download failed: %s", e)
        return None

    if _backend_already_running():
        _kill_running_backend()

    backup = BACKEND_DIR + "_backup"
    try:
        log.info("Applying update...")
        if os.path.exists(backup):
            shutil.rmtree(backup)
        os.rename(BACKEND_DIR, backup)

        with zipfile.ZipFile(tmp, "r") as zf:
            zf.extractall(BASE_DIR)

        shutil.rmtree(backup, ignore_errors=True)
        os.remove(tmp)

        with open(VERSION_FILE, "w", encoding="utf-8") as f:
            f.write(remote_ver)
        log.info("Updated to v%s.", remote_ver)
        return remote_ver

    except Exception as e:
        log.error("Update failed: %s", e)
        if os.path.exists(backup) and not os.path.exists(BACKEND_DIR):
            os.rename(backup, BACKEND_DIR)
        log.info("Rolled back to previous version.")
        return None


def ensure_firewall_rule():
    """Add Windows Firewall inbound rule for Hercules (idempotent — skips if exists)."""
    if platform.system() != "Windows":
        return
    rule_name = "Hercules Web Access"
    check = subprocess.run(
        ["netsh", "advfirewall", "firewall", "show", "rule", f"name={rule_name}"],
        capture_output=True, text=True, startupinfo=_hidden_si(),
    )
    if check.returncode == 0 and rule_name in check.stdout:
        log.info("Firewall rule '%s' already exists.", rule_name)
        return
    log.info("Adding firewall rule '%s' for port %s...", rule_name, BACKEND_PORT)
    result = subprocess.run(
        ["netsh", "advfirewall", "firewall", "add", "rule",
         f"name={rule_name}", "dir=in", "action=allow",
         "protocol=TCP", f"localport={BACKEND_PORT}"],
        capture_output=True, text=True, startupinfo=_hidden_si(),
    )
    if result.returncode == 0:
        log.info("Firewall rule added successfully.")
    else:
        log.warning("Could not add firewall rule: %s", result.stderr)


def main():
    log.info("Launcher started (pid %d).", os.getpid())

    machine_id = _machine_id_fallback()
    license_path = os.path.join(BASE_DIR, "license.json")

    log.info("Checking license...")
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
                log.info("License valid until %s", expiry_str)
            else:
                _fatal(
                    f"License expired on {expiry_str}.\n"
                    f"Contact administrator to extend.\n\n"
                    f"Machine ID: {machine_id}"
                )

        elif status == "pending":
            _fatal(
                "Registration received. Waiting for administrator approval.\n\n"
                f"Machine ID: {machine_id}"
            )

        elif status == "denied":
            _fatal(
                "Access denied by administrator.\n\n"
                f"Machine ID: {machine_id}"
            )

        else:
            _fatal(
                f"Unexpected license status: {status}\n\n"
                f"Machine ID: {machine_id}"
            )
    else:
        if _verify_license_inline(license_path):
            try:
                with open(license_path, encoding="utf-8") as f:
                    cached = json.load(f)
                log.info("Offline mode — cached license valid until %s", cached.get("expiry", "?"))
            except Exception:
                log.info("Offline mode — using cached license.")
        else:
            _fatal(
                "Cannot reach license server and no valid cached license.\n\n"
                f"Machine ID: {machine_id}\n\n"
                "Please check your internet connection and try again."
            )

    updated_ver = check_and_apply_update()

    url = f"http://localhost:{BACKEND_PORT}"

    if updated_ver:
        _show_info(
            f"Hercules updated to v{updated_ver}.\n"
            "Restarting services with the new version..."
        )

    if _backend_already_running() and not updated_ver:
        log.info("Backend already running on port %s — opening browser only.", BACKEND_PORT)
        webbrowser.open(url)
        log.info("Launcher exiting (services already running in background).")
        return

    if not os.path.exists(PG_CTL):
        _fatal(
            f"PostgreSQL binaries not found at:\n{PG_BIN}\n\n"
            "Expected folder: psql/bin/ with pg_ctl.exe, initdb.exe, pg_isready.exe"
        )

    if not updated_ver:
        kill_previous_instances()
    _clean_stale_postmaster_pid()
    init_db_if_needed()

    result = run([PG_ISREADY, "-h", "127.0.0.1", "-p", PORT, "-d", "postgres"])
    pg_running = result.returncode == 0 and (result.stdout or b"").strip().endswith(b"accepting connections")
    if not pg_running:
        start_postgres()
        wait_for_db()

    run_setup()
    ensure_firewall_rule()
    start_backend()

    log.info("System started. Opening %s", url)
    webbrowser.open(url)
    log.info("Launcher exiting — PostgreSQL and backend continue in background.")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        msg = traceback.format_exc()
        _fatal(f"Unexpected error:\n\n{msg}")
