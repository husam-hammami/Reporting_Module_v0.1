"""
PLC Driver Abstraction Layer
=============================
Abstract base class for all PLC communication protocols.
Each driver implements connect/disconnect/read operations
for a specific protocol (S7, Modbus TCP, OPC UA).

Usage:
    from drivers import get_driver_class
    DriverClass = get_driver_class('Modbus')
    driver = DriverClass()
    driver.connect({'ip': '192.168.1.10', 'port': 502, 'unit_id': 1})
    value = driver.read_tag({'register': 100, 'function': 'holding'}, 'REAL')
"""

import logging
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class PLCDriver(ABC):
    """Abstract base class for all PLC communication drivers.

    Each protocol driver must implement all abstract methods.
    Drivers are responsible for:
    - Connection management (connect, disconnect, reconnect)
    - Single tag reads (read_tag)
    - Optimized batch reads (read_batch)
    - Resource cleanup (close)

    Drivers are NOT responsible for:
    - Rounding/decimal formatting (done by tag_reader.py)
    - value_formula/scaling (done by tag_reader.py)
    - Caching (done by TagValueCache)
    """

    @abstractmethod
    def connect(self, config: dict) -> None:
        """Connect to the PLC/device.

        Args:
            config: Protocol-specific connection parameters.
                S7:     {'ip': str, 'rack': int, 'slot': int}
                Modbus: {'ip': str, 'port': int, 'unit_id': int}
                OPC_UA: {'endpoint': str, 'username': str, 'password': str}

        Raises:
            ConnectionError: If connection fails.
        """

    @abstractmethod
    def disconnect(self) -> None:
        """Gracefully disconnect from the device."""

    @abstractmethod
    def close(self) -> None:
        """Release all resources (disconnect + destroy handles).
        Must be safe to call multiple times.
        """

    @abstractmethod
    def is_connected(self) -> bool:
        """Return True if the connection is active and usable."""

    @abstractmethod
    def read_tag(self, address: dict, data_type: str, **kwargs) -> any:
        """Read a single typed value from the device.

        Args:
            address: Protocol-specific address.
                S7:     {'db': 2099, 'offset': 0}
                Modbus: {'register': 100, 'function': 'holding'}
                OPC_UA: {'node_id': 'ns=2;i=5'}
            data_type: 'BOOL', 'INT', 'DINT', 'REAL', 'STRING'
            **kwargs: Protocol-specific options.
                S7:     bit_position=int, byte_swap=bool, string_length=int
                Modbus: word_order='big'|'little'
                OPC_UA: (none needed — returns typed values)

        Returns:
            Python native type (bool, int, float, str) or None on error.
        """

    @abstractmethod
    def read_batch(self, tags: list) -> dict:
        """Read multiple tags in one optimized call.

        Each driver implements its own batching strategy:
        - S7:     Groups by DB number, single db_read per block
        - Modbus: Groups by function type, chunks of 125 registers
        - OPC_UA: Single ReadRequest with all node IDs

        Args:
            tags: List of dicts, each with:
                {'tag_name': str, 'address': dict, 'data_type': str, ...}

        Returns:
            {'tag_name': value, ...} — None values for failed reads.
        """

    @property
    @abstractmethod
    def protocol_name(self) -> str:
        """Return protocol identifier: 'S7', 'Modbus', 'OPC_UA'"""


# ── Driver Registry ──────────────────────────────────────────────────────────

_DRIVER_MAP = {}


def register_driver(protocol: str, driver_class: type):
    """Register a driver class for a protocol name."""
    _DRIVER_MAP[protocol] = driver_class
    logger.debug(f"Registered PLC driver: {protocol} -> {driver_class.__name__}")


def get_driver_class(protocol: str) -> type:
    """Get the driver class for a protocol name.

    Args:
        protocol: 'S7', 'Modbus', 'OPC_UA'

    Returns:
        PLCDriver subclass, or None if not registered.
    """
    return _DRIVER_MAP.get(protocol)


def get_available_protocols() -> list:
    """Return list of registered protocol names."""
    return list(_DRIVER_MAP.keys())


# ── Auto-register available drivers ──────────────────────────────────────────

def _auto_register():
    """Import and register all available drivers."""
    # Snap7 (Siemens S7)
    try:
        from drivers.snap7_driver import Snap7Driver
        register_driver('S7', Snap7Driver)
    except ImportError:
        logger.warning("snap7 library not available — S7 protocol disabled")

    # Modbus TCP
    try:
        from drivers.modbus_driver import ModbusDriver
        register_driver('Modbus', ModbusDriver)
    except ImportError:
        logger.info("pymodbus library not available — Modbus protocol disabled")

    # OPC UA
    try:
        from drivers.opcua_driver import OpcUaDriver
        register_driver('OPC_UA', OpcUaDriver)
    except ImportError:
        logger.info("opcua library not available — OPC UA protocol disabled")


_auto_register()
