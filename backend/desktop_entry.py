"""
Desktop entry point — frozen by PyInstaller as hercules-backend.exe.

Responsibilities:
  1. Set HERCULES_DESKTOP=1
  2. Resolve frozen paths (sys._MEIPASS)
  3. Copy default configs to %APPDATA%/Hercules/config/ on first run
  4. Configure file-based logging to %APPDATA%/Hercules/logs/
  5. Register /health endpoint for Electron to poll
  6. Run secondary license check (defense-in-depth)
  7. Start the distribution scheduler
  8. Run socketio.run() on 127.0.0.1:5001
"""
import os
import sys
import json
import shutil
import logging
from logging.handlers import RotatingFileHandler

# ── 1. Desktop mode flag ──────────────────────────────────────────────────
os.environ['HERCULES_DESKTOP'] = '1'
# Frozen exe often runs without a UTF-8 locale; libpq/psycopg2 may otherwise use cp1252
# and fail on Unicode in SQL parameters (e.g. mapping names with →). Set before importing app.
os.environ.setdefault('PGCLIENTENCODING', 'UTF8')

# ── 2. Frozen path resolution ─────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS
    INSTALL_DIR = os.path.dirname(sys.executable)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    INSTALL_DIR = BUNDLE_DIR

os.chdir(BUNDLE_DIR)
sys.path.insert(0, BUNDLE_DIR)

# ── 3. First-run config copy ──────────────────────────────────────────────
APPDATA_DIR = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'Hercules')
CONFIG_DIR = os.path.join(APPDATA_DIR, 'config')
LOG_DIR = os.path.join(APPDATA_DIR, 'logs')

os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

BUNDLED_CONFIG_DIR = os.path.join(BUNDLE_DIR, 'config')
if os.path.isdir(BUNDLED_CONFIG_DIR):
    for fname in os.listdir(BUNDLED_CONFIG_DIR):
        src = os.path.join(BUNDLED_CONFIG_DIR, fname)
        dst = os.path.join(CONFIG_DIR, fname)
        if not os.path.exists(dst) and os.path.isfile(src):
            shutil.copy2(src, dst)

# ── 4. File-based logging ─────────────────────────────────────────────────
log_handler = RotatingFileHandler(
    os.path.join(LOG_DIR, 'hercules.log'),
    maxBytes=10_000_000,
    backupCount=5,
    encoding='utf-8',
)
log_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s [%(name)s]: %(message)s'))

root_logger = logging.getLogger()
root_logger.addHandler(log_handler)
root_logger.setLevel(logging.INFO)

logger = logging.getLogger('desktop_entry')
logger.info("Hercules Desktop starting — BUNDLE_DIR=%s INSTALL_DIR=%s", BUNDLE_DIR, INSTALL_DIR)

# ── 5. Import the app (triggers eventlet monkey_patch at top of app.py) ───
from app import app, socketio
from scheduler import start_scheduler

# ── 6. Defense-in-depth license check ─────────────────────────────────────
def _secondary_license_check():
    """Optional server-side license validation. Logs warning on failure but does not block
    (primary enforcement is in Electron main.js)."""
    try:
        from machine_id import get_machine_id
        import urllib.request
        import ssl

        machine_id = get_machine_id()
        payload = json.dumps({'machine_id': machine_id}).encode('utf-8')

        ctx = ssl.create_default_context()
        req = urllib.request.Request(
            'https://api.herculesv2.app/api/license/register',
            data=payload,
            headers={'Content-Type': 'application/json', 'User-Agent': 'HerculesDesktop/1.0'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
            result = json.loads(resp.read().decode('utf-8'))

        status = result.get('status')
        if status not in ('approved',):
            logger.warning("License check returned status=%s (Electron gate is primary enforcer)", status)
        else:
            logger.info("License check passed: status=%s expiry=%s", status, result.get('expiry'))
    except Exception as e:
        logger.warning("Secondary license check failed (non-blocking): %s", e)


# ── 7. Main ───────────────────────────────────────────────────────────────
def main():
    _secondary_license_check()

    start_scheduler()
    logger.info("Distribution scheduler started")

    host = os.environ.get('FLASK_HOST', '0.0.0.0')
    port = int(os.environ.get('FLASK_PORT', 5001))
    logger.info("Starting Flask-SocketIO on %s:%d", host, port)
    socketio.run(app, host=host, port=port, debug=False, use_reloader=False)


if __name__ == '__main__':
    main()
