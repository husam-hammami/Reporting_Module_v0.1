"""
Modbus TCP Driver — Generic Industrial Communication
=====================================================
Implements the PLCDriver interface for Modbus TCP devices
via the pymodbus library (v3.x).

Supports: ABB, Schneider, Danfoss, Siemens (via Modbus), generic devices.

Address format: {'register': int, 'function': str, 'word_order': str}
Connection config: {'ip': str, 'port': int, 'unit_id': int}

Function types:
  'holding'  — Holding Registers (function code 3)  — read/write, 16-bit
  'input'    — Input Registers (function code 4)    — read-only, 16-bit
  'coil'     — Coils (function code 1)              — read/write, 1-bit
  'discrete' — Discrete Inputs (function code 2)    — read-only, 1-bit

Data types mapping:
  BOOL  → 1 coil or 1 discrete input (single bit)
  INT   → 1 register (16-bit signed)
  DINT  → 2 registers (32-bit signed, word_order configurable)
  REAL  → 2 registers (32-bit IEEE 754 float, word_order configurable)
"""

import struct
import logging

from pymodbus.client import ModbusTcpClient
from pymodbus.exceptions import ModbusException

from drivers import PLCDriver

logger = logging.getLogger(__name__)

# Modbus limit: max registers per single read request
_MAX_REGISTERS_PER_READ = 125


class ModbusDriver(PLCDriver):
    """Modbus TCP driver using pymodbus v3.x."""

    def __init__(self):
        self._client = None
        self._connected = False
        self._unit_id = 1
        self._ip = ''
        self._port = 502

    # ── Connection ────────────────────────────────────────────────────────

    def connect(self, config: dict) -> None:
        self._ip = config.get('ip', '127.0.0.1')
        self._port = config.get('port', 502)
        self._unit_id = config.get('unit_id', 1)
        timeout = config.get('timeout', 3)

        if self._client:
            try:
                self._client.close()
            except Exception:
                pass

        self._client = ModbusTcpClient(
            host=self._ip,
            port=self._port,
            timeout=timeout,
        )

        if not self._client.connect():
            raise ConnectionError(
                f"Modbus TCP connection failed: {self._ip}:{self._port}"
            )

        self._connected = True
        logger.info(f"[Modbus] Connected to {self._ip}:{self._port} unit={self._unit_id}")

    def disconnect(self) -> None:
        if self._client:
            try:
                self._client.close()
            except Exception:
                pass
        self._connected = False

    def close(self) -> None:
        self.disconnect()
        self._client = None

    def is_connected(self) -> bool:
        return self._connected and self._client is not None

    @property
    def protocol_name(self) -> str:
        return 'Modbus'

    # ── Helpers ───────────────────────────────────────────────────────────

    def _decode_registers(self, registers, data_type, word_order='big'):
        """Decode 1 or 2 Modbus registers into a Python value."""
        data_type = (data_type or '').strip().upper()

        if data_type == 'INT':
            # Single register, 16-bit signed
            return struct.unpack('>h', struct.pack('>H', registers[0]))[0]

        elif data_type in ('DINT', 'DWORD'):
            # Two registers, 32-bit signed integer
            if word_order == 'little':
                raw = struct.pack('>HH', registers[1], registers[0])
            else:
                raw = struct.pack('>HH', registers[0], registers[1])
            return struct.unpack('>i', raw)[0]

        elif data_type == 'REAL':
            # Two registers, 32-bit IEEE 754 float
            if word_order == 'little':
                raw = struct.pack('>HH', registers[1], registers[0])
            else:
                raw = struct.pack('>HH', registers[0], registers[1])
            return struct.unpack('>f', raw)[0]

        else:
            # Default: treat as single register unsigned
            return registers[0]

    def _register_count(self, data_type):
        """Return number of Modbus registers needed for a data type."""
        dt = (data_type or '').strip().upper()
        if dt in ('DINT', 'DWORD', 'REAL'):
            return 2
        return 1  # INT, BOOL (register-based), default

    # ── Single Tag Read ──────────────────────────────────────────────────

    def read_tag(self, address: dict, data_type: str, **kwargs) -> any:
        """Read a single Modbus tag.

        address: {'register': int, 'function': str}
        kwargs: word_order='big'|'little'
        """
        if not self._client:
            raise ConnectionError("Not connected")

        register = address.get('register', 0)
        func = address.get('function', 'holding')
        word_order = kwargs.get('word_order', address.get('word_order', 'big'))
        data_type = (data_type or '').strip().upper()

        try:
            if data_type == 'BOOL':
                if func == 'coil':
                    result = self._client.read_coils(register, 1, slave=self._unit_id)
                elif func == 'discrete':
                    result = self._client.read_discrete_inputs(register, 1, slave=self._unit_id)
                else:
                    # Read from register and check bit 0
                    result = self._client.read_holding_registers(register, 1, slave=self._unit_id)
                    if result.isError():
                        raise ModbusException(str(result))
                    return bool(result.registers[0] & 1)

                if result.isError():
                    raise ModbusException(str(result))
                return bool(result.bits[0])

            else:
                count = self._register_count(data_type)
                if func == 'input':
                    result = self._client.read_input_registers(register, count, slave=self._unit_id)
                else:
                    result = self._client.read_holding_registers(register, count, slave=self._unit_id)

                if result.isError():
                    raise ModbusException(str(result))

                return self._decode_registers(result.registers, data_type, word_order)

        except Exception as e:
            logger.warning(f"[Modbus] Read error register={register} func={func}: {e}")
            self._connected = False
            return None

    # ── Batch Read ───────────────────────────────────────────────────────

    def read_batch(self, tags: list) -> dict:
        """Read multiple Modbus tags, grouped by function type.

        Optimizes by reading contiguous register blocks where possible.
        Chunks at 125 registers per read (Modbus limit).
        """
        if not self._client:
            raise ConnectionError("Not connected")

        results = {}

        # Group by function type
        func_groups = {}
        for tag in tags:
            func = tag.get('address', {}).get('function', 'holding')
            dt = (tag.get('data_type', '') or '').strip().upper()
            # Handle BOOL separately (coils/discrete)
            if dt == 'BOOL':
                func = tag.get('address', {}).get('function', 'coil')
            func_groups.setdefault(func, []).append(tag)

        for func, group_tags in func_groups.items():
            if func in ('coil', 'discrete'):
                # Read coils/discrete one by one (no batching benefit for single bits)
                for tag in group_tags:
                    results[tag['tag_name']] = self.read_tag(
                        tag.get('address', {}),
                        tag.get('data_type', 'BOOL'),
                        **{k: v for k, v in tag.items() if k not in ('tag_name', 'address', 'data_type')}
                    )
                continue

            # Sort by register for contiguous block detection
            sorted_tags = sorted(group_tags, key=lambda t: t.get('address', {}).get('register', 0))

            # Build contiguous blocks (up to 125 registers each)
            blocks = []
            current_block = []
            block_start = None
            block_end = None

            for tag in sorted_tags:
                reg = tag.get('address', {}).get('register', 0)
                count = self._register_count(tag.get('data_type', ''))

                if block_start is None:
                    block_start = reg
                    block_end = reg + count
                    current_block = [tag]
                elif reg <= block_end + 10 and (reg + count - block_start) <= _MAX_REGISTERS_PER_READ:
                    # Within gap tolerance and size limit — extend block
                    block_end = max(block_end, reg + count)
                    current_block.append(tag)
                else:
                    # Start new block
                    blocks.append((block_start, block_end, current_block))
                    block_start = reg
                    block_end = reg + count
                    current_block = [tag]

            if current_block:
                blocks.append((block_start, block_end, current_block))

            # Read each block
            for start, end, block_tags in blocks:
                total = end - start
                try:
                    if func == 'input':
                        result = self._client.read_input_registers(start, total, slave=self._unit_id)
                    else:
                        result = self._client.read_holding_registers(start, total, slave=self._unit_id)

                    if result.isError():
                        raise ModbusException(str(result))

                    # Extract individual values
                    for tag in block_tags:
                        try:
                            reg = tag.get('address', {}).get('register', 0) - start
                            count = self._register_count(tag.get('data_type', ''))
                            word_order = tag.get('address', {}).get('word_order', 'big')
                            regs = result.registers[reg:reg + count]
                            results[tag['tag_name']] = self._decode_registers(
                                regs, tag.get('data_type', ''), word_order
                            )
                        except Exception as e:
                            logger.warning(f"[Modbus] Extract error '{tag['tag_name']}': {e}")
                            results[tag['tag_name']] = None

                except Exception as e:
                    logger.warning(f"[Modbus] Batch read failed for block {start}-{end}: {e}")
                    self._connected = False
                    for tag in block_tags:
                        results[tag['tag_name']] = None

        return results
