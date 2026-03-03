"""
PLC Utilities — Shared persistent PLC connection for the dynamic system.

Provides:
  - SharedPLCConnection: thread-safe persistent snap7 PLC client
  - connect_to_plc_fast(): get shared client (or emulator in demo mode)
  - reconnect_shared_plc(): reconfigure connection when PLC settings change
"""

import logging
import threading
import snap7
import snap7.types

logger = logging.getLogger(__name__)

# ── Connection Timeouts ──────────────────────────────────────────────────────
_PLC_CONNECT_TIMEOUT_MS = 2000   # snap7 connect timeout (2s instead of default ~20s)
_PLC_RECV_TIMEOUT_MS = 1500      # snap7 recv timeout
_PLC_SEND_TIMEOUT_MS = 1500      # snap7 send timeout
_PLC_RECONNECT_COOLDOWN = 10     # seconds to wait before retrying after a failed connection


class SharedPLCConnection:
    """Shared persistent PLC connection with reconnection logic and cooldown."""

    def __init__(self, ip=None, rack=None, slot=None):
        from plc_config import get_plc_config
        cfg = get_plc_config()
        self.ip = ip if ip is not None else cfg['ip']
        self.rack = rack if rack is not None else cfg['rack']
        self.slot = slot if slot is not None else cfg['slot']
        self.client = None
        self.connected = False
        self._lock = threading.Lock()
        self._last_fail_time = 0

    def mark_disconnected(self):
        """Mark connection as lost. Called externally when a db_read() fails."""
        with self._lock:
            self.connected = False
            logger.warning("PLC connection marked as disconnected")

    def get_client(self):
        """Get connected PLC client, reconnecting if needed.
        Uses a cooldown period after failures to avoid blocking eventlet.

        No health-check (get_cpu_state) on every call — we rely on actual
        db_read() failures to detect disconnection via mark_disconnected(),
        avoiding an extra TCP round-trip per access.
        """
        with self._lock:
            if self.client and self.connected:
                return self.client

            import time as _time
            now = _time.time()
            if now - self._last_fail_time < _PLC_RECONNECT_COOLDOWN:
                raise ConnectionError(
                    f"PLC unreachable (cooldown {_PLC_RECONNECT_COOLDOWN}s, "
                    f"retry in {int(_PLC_RECONNECT_COOLDOWN - (now - self._last_fail_time))}s)"
                )

            try:
                if self.client:
                    try:
                        self.client.disconnect()
                        self.client.destroy()
                    except Exception:
                        pass

                self.client = snap7.client.Client()
                try:
                    self.client.set_param(snap7.types.PingTimeout, _PLC_CONNECT_TIMEOUT_MS)
                    self.client.set_param(snap7.types.RecvTimeout, _PLC_RECV_TIMEOUT_MS)
                    self.client.set_param(snap7.types.SendTimeout, _PLC_SEND_TIMEOUT_MS)
                except Exception:
                    pass  # older snap7 versions may not support set_param
                self.client.connect(self.ip, self.rack, self.slot)
                self.connected = True
                self._last_fail_time = 0
                logger.info(f"PLC connected (persistent): {self.ip}")
                return self.client
            except Exception as e:
                logger.error(f"PLC connection failed: {e}")
                self.connected = False
                self._last_fail_time = now
                raise


# ── Shared Instance ──────────────────────────────────────────────────────────
shared_plc = SharedPLCConnection()


def reconnect_shared_plc(ip, rack, slot):
    """Reconnect the shared PLC connection with new config.
    Called when PLC settings change via the Settings API."""
    global shared_plc
    try:
        if shared_plc.client:
            try:
                shared_plc.client.disconnect()
                shared_plc.client.destroy()
            except Exception:
                pass
        shared_plc = SharedPLCConnection(ip=ip, rack=rack, slot=slot)
        logger.info(f"SharedPLCConnection reconfigured: {ip} rack={rack} slot={slot}")
    except Exception as e:
        logger.error(f"Failed to reconfigure SharedPLCConnection: {e}")


def connect_to_plc_fast():
    """Get persistent PLC connection (fast, no reconnect overhead).
    In demo mode returns emulator client (same offsets)."""
    from demo_mode import get_demo_mode
    if get_demo_mode():
        from plc_data_source import get_emulator_client
        return get_emulator_client()
    return shared_plc.get_client()
