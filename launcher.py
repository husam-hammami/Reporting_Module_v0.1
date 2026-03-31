"""
Hercules Reporting Module — Standalone launcher.
Starts portable PostgreSQL, runs DB setup on first run, then starts the Flask backend.
Designed to be compiled to launcher.exe (e.g. PyInstaller) for the installer bundle.
"""
import atexit
import ctypes
import ctypes.wintypes
import hashlib
import json
import logging
import os
import platform
import signal
import shutil
import ssl
import subprocess
import sys
import tempfile
import threading
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


# ---------------------------------------------------------------------------
# Windows Job Object: ensures ALL child processes (postgres, backend, etc.)
# are killed automatically when the launcher exits — even on force-kill.
# ---------------------------------------------------------------------------
_job_handle = None


def _create_job_object():
    """Create a Job Object with KILL_ON_JOB_CLOSE so children die with the launcher."""
    global _job_handle
    kernel32 = ctypes.windll.kernel32

    job = kernel32.CreateJobObjectW(None, None)
    if not job:
        return

    class JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("PerProcessUserTimeLimit", ctypes.c_int64),
            ("PerJobUserTimeLimit", ctypes.c_int64),
            ("LimitFlags", ctypes.wintypes.DWORD),
            ("MinimumWorkingSetSize", ctypes.c_size_t),
            ("MaximumWorkingSetSize", ctypes.c_size_t),
            ("ActiveProcessLimit", ctypes.wintypes.DWORD),
            ("Affinity", ctypes.c_size_t),
            ("PriorityClass", ctypes.wintypes.DWORD),
            ("SchedulingClass", ctypes.wintypes.DWORD),
        ]

    class IO_COUNTERS(ctypes.Structure):
        _fields_ = [
            ("ReadOperationCount", ctypes.c_uint64),
            ("WriteOperationCount", ctypes.c_uint64),
            ("OtherOperationCount", ctypes.c_uint64),
            ("ReadTransferCount", ctypes.c_uint64),
            ("WriteTransferCount", ctypes.c_uint64),
            ("OtherTransferCount", ctypes.c_uint64),
        ]

    class JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
        _fields_ = [
            ("BasicLimitInformation", JOBOBJECT_BASIC_LIMIT_INFORMATION),
            ("IoInfo", IO_COUNTERS),
            ("ProcessMemoryLimit", ctypes.c_size_t),
            ("JobMemoryLimit", ctypes.c_size_t),
            ("PeakProcessMemoryUsed", ctypes.c_size_t),
            ("PeakJobMemoryUsed", ctypes.c_size_t),
        ]

    KILL_ON_CLOSE = 0x2000
    info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
    info.BasicLimitInformation.LimitFlags = KILL_ON_CLOSE

    kernel32.SetInformationJobObject(
        job, 9,  # JobObjectExtendedLimitInformation
        ctypes.byref(info), ctypes.sizeof(info),
    )
    _job_handle = job


def _assign_to_job(proc):
    """Add a subprocess.Popen process to the job object."""
    if not _job_handle or not proc:
        return
    kernel32 = ctypes.windll.kernel32
    PROCESS_ALL_ACCESS = 0x1F0FFF
    handle = kernel32.OpenProcess(PROCESS_ALL_ACCESS, False, proc.pid)
    if handle:
        kernel32.AssignProcessToJobObject(_job_handle, handle)
        kernel32.CloseHandle(handle)


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
    log.info("Initializing PostgreSQL cluster...")
    os.makedirs(DATA_DIR, exist_ok=True)
    run_checked(
        [INITDB, "-D", DATA_DIR, "-U", "postgres",
         "--encoding=UTF8", "--locale=C"],
        label="PostgreSQL initdb",
    )


def start_postgres():
    """Start portable PostgreSQL on PORT."""
    log.info("Starting PostgreSQL...")
    pg = subprocess.Popen(
        [PG_CTL, "-D", DATA_DIR, "-o", f"-p {PORT}", "start"],
        cwd=BASE_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        startupinfo=_hidden_si(),
    )
    _assign_to_job(pg)


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
    """Run setup_local_db.py (create DB, migrations, default user). Uses portable DB port."""
    log.info("Running DB setup...")
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
    _assign_to_job(proc)
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
            ["taskkill", "/F", "/FI", f"IMAGENAME eq python.exe"],
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
                timeout=15, **_hidden_kwargs(),
            )
        except Exception:
            subprocess.run(
                ["taskkill", "/F", "/IM", "postgres.exe"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                startupinfo=_hidden_si(),
            )
        time.sleep(1)


def stop_postgres():
    """Gracefully stop PostgreSQL."""
    log.info("Stopping PostgreSQL...")
    try:
        subprocess.run(
            [PG_CTL, "-D", DATA_DIR, "stop", "-m", "fast"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=30,
            **_hidden_kwargs(),
        )
        log.info("PostgreSQL stopped.")
    except Exception as e:
        log.warning("PostgreSQL stop failed: %s", e)


def shutdown(backend_proc=None):
    """Clean shutdown: stop backend, then PostgreSQL."""
    log.info("Shutting down...")
    if backend_proc and backend_proc.poll() is None:
        log.info("Terminating backend (pid %d)...", backend_proc.pid)
        backend_proc.terminate()
        try:
            backend_proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            backend_proc.kill()
        log.info("Backend stopped.")
    stop_postgres()
    log.info("Shutdown complete.")


def _get_local_version():
    try:
        with open(VERSION_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except FileNotFoundError:
        return "0.0.0"


def _version_tuple(v):
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
        log.info("No releases found for branch '%s'.", branch)
        return

    remote_ver = best_release["tag_name"][len(prefix):]
    if _version_tuple(remote_ver) <= _version_tuple(local_ver):
        log.info("Already up to date (v%s).", local_ver)
        return

    assets = best_release.get("assets", [])
    zip_asset = None
    for a in assets:
        if a.get("name", "").endswith(".zip"):
            zip_asset = a
            break
    if not zip_asset:
        log.info("No zip asset in release — skipping update.")
        return

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
        return

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

    except Exception as e:
        log.error("Update failed: %s", e)
        if os.path.exists(backup) and not os.path.exists(BACKEND_DIR):
            os.rename(backup, BACKEND_DIR)
        log.info("Rolled back to previous version.")


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
    _create_job_object()
    log.info("Job object created — child processes will die with launcher.")

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

    check_and_apply_update()

    if not os.path.exists(PG_CTL):
        _fatal(
            f"PostgreSQL binaries not found at:\n{PG_BIN}\n\n"
            "Expected folder: psql/bin/ with pg_ctl.exe, initdb.exe, pg_isready.exe"
        )

    kill_previous_instances()
    init_db_if_needed()
    start_postgres()
    wait_for_db()
    run_setup()
    ensure_firewall_rule()
    backend_proc = start_backend()

    atexit.register(shutdown, backend_proc)

    url = f"http://localhost:{BACKEND_PORT}"
    log.info("System started. Opening %s", url)
    webbrowser.open(url)

    stop_event = threading.Event()

    def _signal_handler(signum, frame):
        log.info("Received signal %s, initiating shutdown...", signum)
        stop_event.set()

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    log.info("Launcher staying alive (pid %d). Kill this process to stop Hercules.", os.getpid())
    while not stop_event.is_set():
        if backend_proc.poll() is not None:
            log.warning("Backend exited unexpectedly (code %d).", backend_proc.returncode)
            break
        stop_event.wait(5)


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        msg = traceback.format_exc()
        _fatal(f"Unexpected error:\n\n{msg}")
