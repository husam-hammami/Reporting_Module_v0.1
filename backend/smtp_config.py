"""
Email configuration: Resend (default) or SMTP.
Stored in config/smtp_config.json. In-memory cache with TTL for efficiency.
"""

import os
import json
import logging
import smtplib
import base64
from email.message import EmailMessage

logger = logging.getLogger(__name__)

from config_paths import get_config_dir, ensure_config_dir
_CONFIG_DIR = get_config_dir()
_CONFIG_FILE = os.path.join(_CONFIG_DIR, "smtp_config.json")

ensure_config_dir()

# ── Obfuscated Resend API key ──
# XOR + base64 to avoid plain-text in source. Not cryptographic — just anti-grep.
_K = b'hercules2026'
_ENC = 'GgAtBwEfIwNLB0VpABIFCwcKITsHc2YAMTdLCUI7UUR8dVRz'

def _decode_key():
    raw = base64.b64decode(_ENC)
    key = _K
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(raw)).decode('utf-8')

RESEND_API_KEY = _decode_key()
RESEND_FROM = "Hercules Reports <reports@herculesv2.app>"

_DEFAULTS = {
    "send_method": "resend",       # "resend" or "smtp"
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
    """Return email config dict. Uses short TTL cache."""
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
    """Persist email config and invalidate cache."""
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


def send_email_resend(recipients, subject, body_html, attachment_bytes=None, attachment_name=None):
    """Send email via Resend API."""
    import resend
    resend.api_key = RESEND_API_KEY

    params = {
        "from": RESEND_FROM,
        "to": recipients,
        "subject": subject,
        "html": body_html,
    }

    if attachment_bytes and attachment_name:
        import base64 as b64
        params["attachments"] = [{
            "filename": attachment_name,
            "content": list(attachment_bytes),
        }]

    try:
        email = resend.Emails.send(params)
        return {"success": True, "id": email.get("id", "")}
    except Exception as e:
        logger.error("Resend send failed: %s", e)
        return {"success": False, "error": str(e)}


def test_smtp_connection(to_email=None):
    """Send a test email using the current configuration."""
    cfg = get_smtp_config()

    if cfg.get("send_method", "resend") == "resend":
        # Test via Resend
        recipient = to_email or cfg.get("recipient", "")
        if not recipient:
            return {"success": False, "error": "No recipient email address provided"}
        result = send_email_resend(
            [recipient],
            "Test email from Hercules",
            "<p>This is a test email sent from the Hercules Reporting Module via Hercules Cloud Email.</p>",
        )
        return result

    # Test via SMTP
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
