"""
PLC Utilities — Shared persistent PLC connection for the dynamic system.

Provides:
  - SharedPLCConnection: thread-safe persistent connection via driver abstraction
  - connect_to_plc_fast(): get shared driver (or emulator in demo mode)
  - reconnect_shared_plc(): reconfigure connection when PLC settings change
  - get_shared_driver(): get the active PLCDriver instance

Supports: Siemens S7 (Snap7), Modbus TCP (pymodbus), OPC UA (python-opcua)
"""

import logging
import threading
import time as _time

from drivers import PLCDriver, get_driver_class

logger = logging.getLogger(__name__)

# ── Connection Timeouts ──────────────────────────────────────────────────────
_PLC_RECONNECT_COOLDOWN = 10  # seconds to wait before retrying after failure


class SharedPLCConnection:
    """Shared persistent PLC connection with reconnection logic and cooldown.

    Protocol-agnostic: instantiates the correct driver based on config['protocol_type'].
    Falls back to S7 if no protocol_type specified (backward compatible).
    """

    def __init__(self, config=None):
        if config is None:
            from plc_config import get_plc_config
            config = get_plc_config()

        self.config = config
        protocol = config.get('protocol_type', 'S7')

        DriverClass = get_driver_class(protocol)
        if DriverClass is None:
            logger.error(f"No driver available for protocol '{protocol}', falling back to S7")
            DriverClass = get_driver_class('S7')

        self.driver = DriverClass() if DriverClass else None
        self.connected = False
        self._lock = threading.Lock()
        self._last_fail_time = 0

    def mark_disconnected(self):
        """Mark connection as lost. Called externally when a read fails."""
        with self._lock:
            self.connected = False
            logger.warning("PLC connection marked as disconnected")

    def get_driver(self) -> PLCDriver:
        """Get connected PLC driver, reconnecting if needed.
        Uses a cooldown period after failures to avoid blocking eventlet.
        """
        with self._lock:
            if self.driver and self.connected:
                return self.driver

            now = _time.time()
            if now - self._last_fail_time < _PLC_RECONNECT_COOLDOWN:
                raise ConnectionError(
                    f"PLC unreachable (cooldown {_PLC_RECONNECT_COOLDOWN}s, "
                    f"retry in {int(_PLC_RECONNECT_COOLDOWN - (now - self._last_fail_time))}s)"
                )

            if not self.driver:
                raise ConnectionError("No PLC driver available")

            try:
                self.driver.close()
                self.driver.connect(self.config)
                self.connected = True
                self._last_fail_time = 0
                logger.info(f"PLC connected ({self.driver.protocol_name}): {self.config.get('ip', 'unknown')}")
                return self.driver
            except Exception as e:
                logger.error(f"PLC connection failed: {e}")
                self.connected = False
                self._last_fail_time = now
                raise

    # ── Backward compatibility: get_client() returns the raw snap7 client ─
    def get_client(self):
        """DEPRECATED: Use get_driver() instead.
        Returns the raw snap7 client for legacy code that hasn't migrated yet.
        """
        driver = self.get_driver()
        # If it's a Snap7Driver, return the raw client for backward compat
        if hasattr(driver, 'get_raw_client'):
            return driver.get_raw_client()
        return driver


# ── Shared Instance ──────────────────────────────────────────────────────────
shared_plc = SharedPLCConnection()


def reconnect_shared_plc(config_or_ip=None, rack=None, slot=None):
    """Reconnect the shared PLC connection with new config.

    Accepts either:
      - config_or_ip: dict with full config (new style)
      - config_or_ip: str IP + rack + slot (legacy, backward compatible)
    """
    global shared_plc
    try:
        if shared_plc.driver:
            try:
                shared_plc.driver.close()
            except Exception:
                pass

        if isinstance(config_or_ip, dict):
            config = config_or_ip
        else:
            # Legacy: positional args (ip, rack, slot)
            config = {
                'protocol_type': 'S7',
                'ip': config_or_ip or '192.168.23.11',
                'rack': rack if rack is not None else 0,
                'slot': slot if slot is not None else 3,
            }

        shared_plc = SharedPLCConnection(config)
        logger.info(f"SharedPLCConnection reconfigured: {config.get('protocol_type', 'S7')} @ {config.get('ip', 'unknown')}")
    except Exception as e:
        logger.error(f"Failed to reconfigure SharedPLCConnection: {e}")


def connect_to_plc_fast():
    """Get persistent PLC connection (fast, no reconnect overhead).
    In demo mode returns emulator client (same interface)."""
    from demo_mode import get_demo_mode
    if get_demo_mode():
        from plc_data_source import get_emulator_client
        return get_emulator_client()
    return shared_plc.get_driver()


def get_shared_driver() -> PLCDriver:
    """Get the shared PLC driver instance. Alias for connect_to_plc_fast()."""
    return connect_to_plc_fast()
