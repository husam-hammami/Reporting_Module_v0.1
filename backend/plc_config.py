"""
PLC connection configuration: IP address, rack, and slot.
Stored in config/plc_config.json. In-memory cache with TTL for efficiency.
"""

import os
import re
import json
import logging

logger = logging.getLogger(__name__)

_BASE_DIR = os.path.abspath(os.path.dirname(__file__))
_CONFIG_DIR = os.path.join(_BASE_DIR, "config")
_CONFIG_FILE = os.path.join(_CONFIG_DIR, "plc_config.json")

_DEFAULTS = {"ip": "192.168.23.11", "rack": 0, "slot": 3}

# In-memory cache: (value_dict, timestamp)
_cache = None
_CACHE_TTL_SEC = 5


def get_plc_config():
    """Return PLC config dict {"ip", "rack", "slot"}. Uses short TTL cache."""
    global _cache
    now = __import__("time").time()
    if _cache is not None:
        val, ts = _cache
        if now - ts < _CACHE_TTL_SEC:
            return val
    try:
        if not os.path.isfile(_CONFIG_FILE):
            _cache = (dict(_DEFAULTS), now)
            return dict(_DEFAULTS)
        with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        cfg = {
            "ip": str(data.get("ip", _DEFAULTS["ip"])),
            "rack": int(data.get("rack", _DEFAULTS["rack"])),
            "slot": int(data.get("slot", _DEFAULTS["slot"])),
        }
        _cache = (cfg, now)
        return cfg
    except Exception as e:
        logger.warning("plc_config: read failed, using defaults: %s", e)
        _cache = (dict(_DEFAULTS), now)
        return dict(_DEFAULTS)


def set_plc_config(ip, rack, slot):
    """Persist PLC config and invalidate cache. Returns True on success."""
    global _cache
    _cache = None
    # Basic validation
    ip = str(ip).strip()
    if not re.match(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$", ip):
        logger.error("plc_config: invalid IP format: %s", ip)
        return False
    try:
        rack = int(rack)
        slot = int(slot)
    except (TypeError, ValueError):
        logger.error("plc_config: rack/slot must be integers")
        return False
    try:
        os.makedirs(_CONFIG_DIR, exist_ok=True)
        with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump({"ip": ip, "rack": rack, "slot": slot}, f, indent=2)
        logger.info("plc_config: set to %s rack=%d slot=%d", ip, rack, slot)
        return True
    except Exception as e:
        logger.error("plc_config: write failed: %s", e)
        return False
