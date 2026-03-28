"""
Snap7 Driver — Siemens S7 PLC Communication
=============================================
Implements the PLCDriver interface for Siemens S7-300/400/1200/1500 PLCs
via the python-snap7 library.

Address format: {'db': int, 'offset': float}
Connection config: {'ip': str, 'rack': int, 'slot': int}
"""

import struct
import logging
import time

import snap7
from snap7 import types as snap7_types
from snap7.util import get_bool

from drivers import PLCDriver

logger = logging.getLogger(__name__)

# ── Connection Timeouts ──────────────────────────────────────────────────────
_CONNECT_TIMEOUT_MS = 2000
_RECV_TIMEOUT_MS = 1500
_SEND_TIMEOUT_MS = 1500


class Snap7Driver(PLCDriver):
    """Siemens S7 PLC driver using python-snap7."""

    def __init__(self):
        self._client = None
        self._connected = False
        self._ip = ''
        self._rack = 0
        self._slot = 3

    # ── Connection ────────────────────────────────────────────────────────

    def connect(self, config: dict) -> None:
        self._ip = config.get('ip', '192.168.23.11')
        self._rack = config.get('rack', 0)
        self._slot = config.get('slot', 3)

        if self._client:
            try:
                self._client.disconnect()
                self._client.destroy()
            except Exception:
                pass

        self._client = snap7.client.Client()
        try:
            self._client.set_param(snap7_types.PingTimeout, _CONNECT_TIMEOUT_MS)
            self._client.set_param(snap7_types.RecvTimeout, _RECV_TIMEOUT_MS)
            self._client.set_param(snap7_types.SendTimeout, _SEND_TIMEOUT_MS)
        except Exception:
            pass  # older snap7 versions may not support set_param

        self._client.connect(self._ip, self._rack, self._slot)
        self._connected = True
        logger.info(f"[Snap7] Connected to {self._ip} rack={self._rack} slot={self._slot}")

    def disconnect(self) -> None:
        if self._client:
            try:
                self._client.disconnect()
            except Exception:
                pass
        self._connected = False

    def close(self) -> None:
        if self._client:
            try:
                self._client.disconnect()
            except Exception:
                pass
            try:
                self._client.destroy()
            except Exception:
                pass
            self._client = None
        self._connected = False

    def is_connected(self) -> bool:
        return self._connected and self._client is not None

    @property
    def protocol_name(self) -> str:
        return 'S7'

    # ── Raw client access (for backward compat during migration) ─────────

    def get_raw_client(self):
        """Return the underlying snap7.client.Client for legacy code paths."""
        return self._client

    # ── Single Tag Read ──────────────────────────────────────────────────

    def read_tag(self, address: dict, data_type: str, **kwargs) -> any:
        """Read a single S7 tag.

        address: {'db': int, 'offset': float}
        kwargs: bit_position=int, byte_swap=bool, string_length=int
        """
        if not self._client:
            raise ConnectionError("Not connected")

        db_number = address.get('db', 0)
        offset = int(address.get('offset', 0))
        data_type = (data_type or '').strip().upper()

        try:
            if data_type == 'BOOL':
                bit_pos = kwargs.get('bit_position', 0) or 0
                data = self._client.db_read(db_number, offset, 1)
                return get_bool(data, 0, bit_pos)

            elif data_type == 'INT':
                data = self._client.db_read(db_number, offset, 2)
                return struct.unpack('>h', data)[0]

            elif data_type in ('DINT', 'DWORD'):
                data = self._client.db_read(db_number, offset, 4)
                return struct.unpack('>i', data)[0]

            elif data_type == 'REAL':
                data = self._client.db_read(db_number, offset, 4)
                byte_swap = kwargs.get('byte_swap', False)
                if byte_swap:
                    data = data[::-1]
                    return struct.unpack('<f', data)[0]
                else:
                    return struct.unpack('>f', data)[0]

            elif data_type == 'STRING':
                max_len = kwargs.get('string_length', 40)
                data = self._client.db_read(db_number, offset, max_len + 2)
                actual_len = min(data[1], max_len)
                return data[2:2 + actual_len].decode('ascii', errors='ignore')

            else:
                # Default: try as REAL
                data = self._client.db_read(db_number, offset, 4)
                return struct.unpack('>f', data)[0]

        except Exception as e:
            error_msg = str(e)
            if "Address out of range" in error_msg or "ISO" in error_msg:
                logger.warning(f"[Snap7] Read error DB{db_number}.{offset}: {error_msg}")
            else:
                logger.error(f"[Snap7] Read error DB{db_number}.{offset}: {error_msg}", exc_info=True)
            self._connected = False
            return None

    # ── Batch Read (optimized: group by DB number) ───────────────────────

    def read_batch(self, tags: list) -> dict:
        """Read multiple S7 tags, grouped by DB number for efficiency.

        tags: [{'tag_name': str, 'address': {'db': int, 'offset': float},
                'data_type': str, 'bit_position': int, 'byte_swap': bool, ...}, ...]
        """
        if not self._client:
            raise ConnectionError("Not connected")

        results = {}

        # Group tags by DB number
        db_groups = {}
        for tag in tags:
            db_num = tag.get('address', {}).get('db', 0)
            db_groups.setdefault(db_num, []).append(tag)

        for db_num, group_tags in db_groups.items():
            try:
                # Calculate byte range for this DB
                ranges = []
                for tag in group_tags:
                    offset = int(tag.get('address', {}).get('offset', 0))
                    dt = (tag.get('data_type', '') or '').strip().upper()
                    if dt == 'BOOL':
                        size = 1
                    elif dt == 'INT':
                        size = 2
                    elif dt in ('DINT', 'DWORD', 'REAL'):
                        size = 4
                    elif dt == 'STRING':
                        size = (tag.get('string_length', 40) or 40) + 2
                    else:
                        size = 4
                    ranges.append((offset, offset + size))

                min_offset = min(r[0] for r in ranges)
                max_end = max(r[1] for r in ranges)
                total_size = max_end - min_offset

                # Single PLC read for entire block
                buf = self._client.db_read(db_num, min_offset, total_size)

                # Extract individual values from buffer
                for tag in group_tags:
                    try:
                        tag_name = tag.get('tag_name', '')
                        offset = int(tag.get('address', {}).get('offset', 0)) - min_offset
                        dt = (tag.get('data_type', '') or '').strip().upper()

                        if dt == 'BOOL':
                            bit_pos = tag.get('bit_position', 0) or 0
                            byte_val = buf[offset]
                            results[tag_name] = bool(byte_val & (1 << bit_pos))
                        elif dt == 'INT':
                            results[tag_name] = struct.unpack('>h', buf[offset:offset + 2])[0]
                        elif dt in ('DINT', 'DWORD'):
                            results[tag_name] = struct.unpack('>i', buf[offset:offset + 4])[0]
                        elif dt == 'REAL':
                            raw = buf[offset:offset + 4]
                            if tag.get('byte_swap', False):
                                raw = raw[::-1]
                                results[tag_name] = struct.unpack('<f', raw)[0]
                            else:
                                results[tag_name] = struct.unpack('>f', raw)[0]
                        elif dt == 'STRING':
                            max_len = tag.get('string_length', 40) or 40
                            actual_len = min(buf[offset + 1], max_len)
                            results[tag_name] = buf[offset + 2:offset + 2 + actual_len].decode('ascii', errors='ignore')
                        else:
                            results[tag_name] = struct.unpack('>f', buf[offset:offset + 4])[0]
                    except Exception as e:
                        logger.warning(f"[Snap7] Extract error for '{tag.get('tag_name', '')}': {e}")
                        results[tag.get('tag_name', '')] = None

            except Exception as e:
                logger.warning(f"[Snap7] Batch read failed for DB{db_num}: {e}")
                self._connected = False
                # Fallback: set None for all tags in this group
                for tag in group_tags:
                    results[tag.get('tag_name', '')] = None

        return results
