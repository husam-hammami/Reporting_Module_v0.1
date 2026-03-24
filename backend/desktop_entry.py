"""
Desktop entry point for PyInstaller-frozen Hercules backend.

This is the file PyInstaller freezes. It handles:
1. Setting HERCULES_DESKTOP=1
2. Frozen path resolution (sys._MEIPASS)
3. Copying default configs on first run
4. File-based logging (stdout is invisible in desktop mode)
5. Adding GET /health endpoint
6. Defense-in-depth license check
7. Starting the Flask app with socketio
"""

import os
import sys
import shutil
import logging
from logging.handlers import RotatingFileHandler

# ── 1. Set desktop mode ──────────────────────────────────────────────────────
os.environ['HERCULES_DESKTOP'] = '1'

# ── 2. Frozen path resolution ────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS
    INSTALL_DIR = os.path.dirname(sys.executable)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    INSTALL_DIR = BUNDLE_DIR

# Add bundle dir to sys.path so imports work
if BUNDLE_DIR not in sys.path:
    sys.path.insert(0, BUNDLE_DIR)

# ── 3. Config directory setup ────────────────────────────────────────────────
APPDATA = os.environ.get('APPDATA', os.path.expanduser('~'))
HERCULES_DIR = os.path.join(APPDATA, 'Hercules')
CONFIG_DIR = os.path.join(HERCULES_DIR, 'config')
LOG_DIR = os.path.join(HERCULES_DIR, 'logs')

os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

# Copy default config files on first run
_default_configs_src = os.path.join(BUNDLE_DIR, 'config')
if os.path.isdir(_default_configs_src):
    for fname in os.listdir(_default_configs_src):
        src = os.path.join(_default_configs_src, fname)
        dst = os.path.join(CONFIG_DIR, fname)
        if not os.path.exists(dst) and os.path.isfile(src):
            shutil.copy2(src, dst)

# ── 4. File-based logging ────────────────────────────────────────────────────
log_handler = RotatingFileHandler(
    os.path.join(LOG_DIR, 'hercules.log'),
    maxBytes=10_000_000,  # 10 MB
    backupCount=5
)
log_handler.setFormatter(logging.Formatter('%(asctime)s %(levelname)s: %(message)s'))
root_logger = logging.getLogger()
root_logger.addHandler(log_handler)
root_logger.setLevel(logging.INFO)

logger = logging.getLogger('desktop_entry')
logger.info("=== Hercules Desktop Starting ===")
logger.info("Bundle dir: %s", BUNDLE_DIR)
logger.info("Install dir: %s", INSTALL_DIR)
logger.info("Config dir: %s", CONFIG_DIR)

# ── 5. Import the Flask app ──────────────────────────────────────────────────
# eventlet.monkey_patch() already called by pyinstaller_runtime_hook.py
# or at top of app.py — the runtime hook ensures it runs first in frozen mode.

from app import app, socketio, get_db_connection  # noqa: E402
from scheduler import start_scheduler  # noqa: E402

# Override static folder for frozen mode
if getattr(sys, 'frozen', False):
    frozen_static = os.path.join(BUNDLE_DIR, 'frontend', 'dist')
    if os.path.isdir(frozen_static):
        app.static_folder = frozen_static
        logger.info("Static folder set to: %s", frozen_static)

# ── 6. Health endpoint ───────────────────────────────────────────────────────
@app.route('/health', methods=['GET'])
def health_check():
    from flask import jsonify
    return jsonify({'status': 'ok'}), 200

# ── 7. Defense-in-depth license check ────────────────────────────────────────
def _check_license():
    """Secondary license check (Electron does primary). Logs warning but does not block."""
    try:
        import requests
        from machine_id import get_machine_id
        machine_id = get_machine_id()
        resp = requests.post(
            'https://api.herculesv2.app/api/license/register',
            json={'machine_id': machine_id, 'hostname': os.environ.get('COMPUTERNAME', '')},
            timeout=10
        )
        data = resp.json()
        status = data.get('status', 'unknown')
        logger.info("License check: status=%s", status)
        if status == 'denied':
            logger.error("LICENSE DENIED — application may be terminated by Electron layer")
    except Exception as e:
        logger.warning("License check failed (will rely on cached/Electron check): %s", e)


# ── 8. Main ──────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    logger.info("Starting scheduler...")
    start_scheduler()

    logger.info("Running defense-in-depth license check...")
    _check_license()

    port = int(os.environ.get('FLASK_PORT', 5001))
    logger.info("Starting Flask-SocketIO on 127.0.0.1:%d", port)
    socketio.run(app, debug=False, host='127.0.0.1', port=port, use_reloader=False)
