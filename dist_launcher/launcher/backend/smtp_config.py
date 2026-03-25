"""
SMTP email configuration: server, port, credentials, TLS.
Stored in config/smtp_config.json. In-memory cache with TTL for efficiency.
"""

import os
import json
import logging
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)

from config_paths import get_config_dir, ensure_config_dir
_CONFIG_DIR = get_config_dir()
_CONFIG_FILE = os.path.join(_CONFIG_DIR, "smtp_config.json")

ensure_config_dir()

_DEFAULTS = {
    "smtp_server": "",
    "smtp_port": 465,
    "username": "",
    "password": "",
    "tls": True,
    "from_address": "",
    "recipient": "",
}

_cache = None
_CACHE_TTL_SEC = 5


def get_smtp_config():
    """Return SMTP config dict. Uses short TTL cache."""
    global _cache
    now = __import__("time").time()
    if _cache is not None:
        val, ts = _cache
        if now - ts < _CACHE_TTL_SEC:
            return dict(val)
    try:
        if not os.path.isfile(_CONFIG_FILE):
            _cache = (dict(_DEFAULTS), now)
            return dict(_DEFAULTS)
        with open(_CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        cfg = {k: data.get(k, _DEFAULTS[k]) for k in _DEFAULTS}
        _cache = (cfg, now)
        return dict(cfg)
    except Exception as e:
        logger.warning("smtp_config: read failed, using defaults: %s", e)
        _cache = (dict(_DEFAULTS), now)
        return dict(_DEFAULTS)


def set_smtp_config(data):
    """Persist SMTP config and invalidate cache."""
    global _cache
    _cache = None
    cfg = {k: data.get(k, _DEFAULTS[k]) for k in _DEFAULTS}
    try:
        os.makedirs(_CONFIG_DIR, exist_ok=True)
        with open(_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        logger.info("smtp_config: saved successfully")
        return True
    except Exception as e:
        logger.error("smtp_config: write failed: %s", e)
        return False


def test_smtp_connection(to_email=None):
    """Send a test email using the current SMTP configuration."""
    cfg = get_smtp_config()
    recipient = to_email or cfg.get("recipient", "")
    if not recipient:
        return {"success": False, "error": "No recipient email address configured"}
    if not cfg.get("smtp_server"):
        return {"success": False, "error": "No SMTP server configured"}

    try:
        msg = EmailMessage()
        msg["Subject"] = "Test email from Hercules"
        msg["From"] = cfg.get("from_address") or cfg.get("username", "")
        msg["To"] = recipient
        msg.set_content("This is a test email sent from the Hercules Reporting Module.")

        port = cfg.get("smtp_port", 465)
        if port == 465:
            with smtplib.SMTP_SSL(cfg["smtp_server"], port, timeout=30) as server:
                server.login(cfg["username"], cfg["password"])
                server.send_message(msg)
        else:
            with smtplib.SMTP(cfg["smtp_server"], port, timeout=30) as server:
                server.starttls()
                server.login(cfg["username"], cfg["password"])
                server.send_message(msg)

        return {"success": True}
    except Exception as e:
        logger.error("smtp_config: test connection failed: %s", e)
        return {"success": False, "error": str(e)}
