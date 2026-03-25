"""
Shift schedule configuration: shift count and shift definitions.
Stored in config/shifts_config.json. In-memory cache with TTL for efficiency.
"""

import os
import re
import json
import logging

logger = logging.getLogger(__name__)

from config_paths import get_config_dir, ensure_config_dir
_CONFIG_DIR = get_config_dir()
_CONFIG_FILE = os.path.join(_CONFIG_DIR, "shifts_config.json")

ensure_config_dir()

_DEFAULTS = {
    "shift_count": 3,
    "shifts": [
        {"name": "Morning", "start": "06:00", "end": "14:00"},
        {"name": "Evening", "start": "14:00", "end": "22:00"},
        {"name": "Night", "start": "22:00", "end": "06:00"},
    ],
}

_cache = None
_CACHE_TTL_SEC = 5

_TIME_RE = re.compile(r"^\d{2}:\d{2}$")


def get_shifts_config():
    """Return shifts config dict. Uses short TTL cache."""
    global _cache
    now = __import__("time").time()
    if _cache is not None:
        val, ts = _cache
        if now - ts < _CACHE_TTL_SEC:
            return _deep_copy(val)
    try:
        if not os.path.isfile(_CONFIG_FILE):
            _cache = (_deep_copy(_DEFAULTS), now)
            return _deep_copy(_DEFAULTS)
        with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        cfg = {
            "shift_count": int(data.get("shift_count", _DEFAULTS["shift_count"])),
            "shifts": data.get("shifts", _DEFAULTS["shifts"]),
        }
        _cache = (cfg, now)
        return _deep_copy(cfg)
    except Exception as e:
        logger.warning("shifts_config: read failed, using defaults: %s", e)
        _cache = (_deep_copy(_DEFAULTS), now)
        return _deep_copy(_DEFAULTS)


def set_shifts_config(data):
    """Validate, persist shifts config and invalidate cache. Raises ValueError on bad input."""
    global _cache
    _cache = None

    shift_count = int(data.get("shift_count", 0))
    shifts = data.get("shifts", [])

    if not 1 <= shift_count <= 4:
        raise ValueError("shift_count must be between 1 and 4")
    if len(shifts) != shift_count:
        raise ValueError(f"shifts array length ({len(shifts)}) must match shift_count ({shift_count})")

    for i, s in enumerate(shifts):
        name = (s.get("name") or "").strip()
        start = (s.get("start") or "").strip()
        end = (s.get("end") or "").strip()
        if not name:
            raise ValueError(f"Shift {i+1}: name is required")
        if not _TIME_RE.match(start):
            raise ValueError(f"Shift {i+1}: start must be HH:MM format")
        if not _TIME_RE.match(end):
            raise ValueError(f"Shift {i+1}: end must be HH:MM format")

    cfg = {"shift_count": shift_count, "shifts": shifts}
    try:
        os.makedirs(_CONFIG_DIR, exist_ok=True)
        with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        logger.info("shifts_config: saved %d shifts", shift_count)
        return True
    except Exception as e:
        logger.error("shifts_config: write failed: %s", e)
        return False


def _deep_copy(obj):
    """Simple deep copy for JSON-serializable dicts."""
    return json.loads(json.dumps(obj))
