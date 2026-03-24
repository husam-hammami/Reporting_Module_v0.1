"""
Config path resolution for desktop vs web mode.

Desktop mode (HERCULES_DESKTOP=1 env var):
  Configs stored in %APPDATA%/Hercules/config/

Web mode (default):
  Configs stored in backend/config/ (relative to this file)
"""

import os
import sys

_BASE_DIR = os.path.abspath(os.path.dirname(__file__))


def _is_desktop_mode():
    return os.environ.get('HERCULES_DESKTOP', '') == '1'


def _is_frozen():
    return getattr(sys, 'frozen', False)


def get_config_dir():
    """Return the config directory path based on the current mode."""
    if _is_desktop_mode():
        appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
        config_dir = os.path.join(appdata, 'Hercules', 'config')
    elif _is_frozen():
        # PyInstaller frozen but not desktop mode — use exe directory
        config_dir = os.path.join(os.path.dirname(sys.executable), 'config')
    else:
        config_dir = os.path.join(_BASE_DIR, 'config')
    os.makedirs(config_dir, exist_ok=True)
    return config_dir


def get_data_dir():
    """Return the data directory for desktop mode (logs, license cache, etc.)."""
    if _is_desktop_mode():
        appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
        data_dir = os.path.join(appdata, 'Hercules')
    else:
        data_dir = _BASE_DIR
    os.makedirs(data_dir, exist_ok=True)
    return data_dir


def get_log_dir():
    """Return log directory for desktop mode."""
    log_dir = os.path.join(get_data_dir(), 'logs')
    os.makedirs(log_dir, exist_ok=True)
    return log_dir


def get_bundle_dir():
    """Return the bundled data directory (where PyInstaller extracts data files)."""
    if _is_frozen():
        return sys._MEIPASS
    return _BASE_DIR
