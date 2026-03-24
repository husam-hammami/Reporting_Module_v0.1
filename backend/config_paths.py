"""
Centralized config directory resolver.

Desktop mode (HERCULES_DESKTOP=1):  %APPDATA%/Hercules/config/
Web/dev mode:                       backend/config/  (relative to this file)
"""
import os
import sys


def _backend_dir():
    """Return the backend directory, handling both frozen and normal execution."""
    if getattr(sys, 'frozen', False):
        return sys._MEIPASS
    return os.path.abspath(os.path.dirname(__file__))


def get_config_dir():
    """Return the config directory path (created lazily by callers that write)."""
    if os.environ.get('HERCULES_DESKTOP') == '1':
        base = os.environ.get('APPDATA', os.path.expanduser('~'))
        return os.path.join(base, 'Hercules', 'config')
    return os.path.join(_backend_dir(), 'config')


def ensure_config_dir():
    """Create config directory if it doesn't exist. Returns the path."""
    d = get_config_dir()
    os.makedirs(d, exist_ok=True)
    return d


def get_data_dir():
    """Return the data directory for logs, cache, license etc."""
    if os.environ.get('HERCULES_DESKTOP') == '1':
        base = os.environ.get('APPDATA', os.path.expanduser('~'))
        return os.path.join(base, 'Hercules')
    return _backend_dir()
