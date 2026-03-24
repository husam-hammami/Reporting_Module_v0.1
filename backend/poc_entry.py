"""
POC entry point — validates that Flask+eventlet+SocketIO freezes correctly with PyInstaller.

Usage (from backend/ directory):
    python -m PyInstaller --onedir poc_entry.py ^
        --runtime-hook=pyinstaller_runtime_hook.py ^
        --hidden-import=engineio.async_drivers.eventlet ^
        --hidden-import=eventlet.hubs.selects ^
        --hidden-import=psycopg2 ^
        --hidden-import=dns ^
        --hidden-import=dns.resolver

Then run: dist\\poc_entry\\poc_entry.exe
Set DB_PORT, POSTGRES_PASSWORD etc. in env before running.
"""
import os
import sys

if getattr(sys, 'frozen', False):
    BUNDLE_DIR = sys._MEIPASS
    INSTALL_DIR = os.path.dirname(sys.executable)
    os.chdir(BUNDLE_DIR)
    sys.path.insert(0, BUNDLE_DIR)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    INSTALL_DIR = BUNDLE_DIR

os.environ.setdefault('HERCULES_DESKTOP', '1')

from app import app, socketio
from scheduler import start_scheduler

@app.route('/health')
def health_check():
    return {'status': 'ok'}, 200

if __name__ == '__main__':
    start_scheduler()
    port = int(os.environ.get('FLASK_PORT', 5001))
    print(f"[POC] Starting on http://127.0.0.1:{port}")
    socketio.run(app, host='127.0.0.1', port=port, debug=False, use_reloader=False)
