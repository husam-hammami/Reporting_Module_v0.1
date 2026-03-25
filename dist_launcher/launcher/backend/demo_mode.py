"""
Demo mode storage: single source of truth for Production vs Demo (emulator).
Stored in config/demo_mode.json. Optional in-memory cache with TTL for efficiency.
"""

import os
import json
import logging

logger = logging.getLogger(__name__)

from config_paths import get_config_dir
_CONFIG_DIR = get_config_dir()
_CONFIG_FILE = os.path.join(_CONFIG_DIR, "demo_mode.json")

# In-memory cache: (value, timestamp)
_cache = None
_CACHE_TTL_SEC = 5


def get_demo_mode():
    """Return True if demo mode is enabled, False otherwise. Uses short TTL cache."""
    global _cache
    now = __import__("time").time()
    if _cache is not None:
        val, ts = _cache
        if now - ts < _CACHE_TTL_SEC:
            return val
    try:
        if not os.path.isfile(_CONFIG_FILE):
            _cache = (False, now)
            return False
        with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        enabled = bool(data.get("demo_mode", False))
        _cache = (enabled, now)
        return enabled
    except Exception as e:
        logger.warning("demo_mode: read failed, defaulting to False: %s", e)
        _cache = (False, now)
        return False


def set_demo_mode(enabled):
    """Persist demo mode on/off and invalidate cache."""
    global _cache
    _cache = None
    try:
        os.makedirs(_CONFIG_DIR, exist_ok=True)
        with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump({"demo_mode": bool(enabled)}, f, indent=2)
        logger.info("demo_mode: set to %s", enabled)
        return True
    except Exception as e:
        logger.error("demo_mode: write failed: %s", e)
        return False
