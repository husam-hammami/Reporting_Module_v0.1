"""
Tests for batched PLC reads — _extract_value_from_buffer, _compute_tag_byte_size,
_read_tags_batched, and _get_cached_tag_configs.

Uses a mock PLC client to avoid real hardware dependencies.
"""

import struct
import time
import pytest

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.tag_reader import (
    _compute_tag_byte_size,
    _extract_value_from_buffer,
    _read_tags_batched,
    _get_cached_tag_configs,
    _tag_config_cache,
    invalidate_tag_config_cache,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_tag(tag_name, db_number, offset, data_type, **kwargs):
    """Create a minimal tag config dict."""
    tag = {
        'id': 1,
        'tag_name': tag_name,
        'display_name': tag_name,
        'source_type': 'PLC',
        'db_number': db_number,
        'offset': offset,
        'data_type': data_type,
        'bit_position': kwargs.get('bit_position', 0),
        'string_length': kwargs.get('string_length', 40),
        'byte_swap': kwargs.get('byte_swap', False),
        'unit': kwargs.get('unit', ''),
        'scaling': kwargs.get('scaling', 1.0),
        'decimal_places': kwargs.get('decimal_places', 2),
        'description': '',
        'is_active': True,
        'value_formula': kwargs.get('value_formula', None),
    }
    return tag


class MockPLC:
    """Mock PLC client that returns pre-defined DB blocks."""

    def __init__(self, db_data=None):
        """
        Args:
            db_data: dict {db_number: bytes} — full content of each DB.
        """
        self._db_data = db_data or {}
        self.read_count = 0

    def db_read(self, db_number, start, size):
        self.read_count += 1
        full_block = self._db_data.get(db_number, b'')
        if start + size > len(full_block):
            # Pad with zeros if block is shorter
            full_block = full_block + b'\x00' * (start + size - len(full_block))
        return bytearray(full_block[start:start + size])


# ── _compute_tag_byte_size ────────────────────────────────────────────────────

class TestComputeTagByteSize:

    def test_bool_is_1(self):
        assert _compute_tag_byte_size({'data_type': 'BOOL'}) == 1

    def test_int_is_2(self):
        assert _compute_tag_byte_size({'data_type': 'INT'}) == 2

    def test_dint_is_4(self):
        assert _compute_tag_byte_size({'data_type': 'DINT'}) == 4

    def test_real_is_4(self):
        assert _compute_tag_byte_size({'data_type': 'REAL'}) == 4

    def test_string_includes_header(self):
        assert _compute_tag_byte_size({'data_type': 'STRING', 'string_length': 20}) == 22

    def test_string_default_length(self):
        assert _compute_tag_byte_size({'data_type': 'STRING'}) == 42  # 40 + 2

    def test_wstring_includes_header_and_utf16(self):
        assert _compute_tag_byte_size({'data_type': 'WSTRING', 'string_length': 5}) == 14  # 4 + 5*2

    def test_unknown_type_defaults_to_4(self):
        assert _compute_tag_byte_size({'data_type': 'UNKNOWN'}) == 4


# ── _extract_value_from_buffer ────────────────────────────────────────────────

class TestExtractValueFromBuffer:

    def test_bool_bit0(self):
        buf = bytearray([0b00000101])  # bits 0 and 2 set
        tag = _make_tag('B', 1, 0, 'BOOL', bit_position=0)
        assert _extract_value_from_buffer(buf, 0, tag) is True

    def test_bool_bit1(self):
        buf = bytearray([0b00000101])
        tag = _make_tag('B', 1, 0, 'BOOL', bit_position=1)
        assert _extract_value_from_buffer(buf, 0, tag) is False

    def test_bool_bit2(self):
        buf = bytearray([0b00000101])
        tag = _make_tag('B', 1, 0, 'BOOL', bit_position=2)
        assert _extract_value_from_buffer(buf, 0, tag) is True

    def test_int_big_endian(self):
        buf = struct.pack('>h', 1234)
        tag = _make_tag('I', 1, 0, 'INT')
        assert _extract_value_from_buffer(buf, 0, tag) == 1234

    def test_int_negative(self):
        buf = struct.pack('>h', -500)
        tag = _make_tag('I', 1, 0, 'INT')
        assert _extract_value_from_buffer(buf, 0, tag) == -500

    def test_dint(self):
        buf = struct.pack('>i', 100000)
        tag = _make_tag('D', 1, 0, 'DINT')
        assert _extract_value_from_buffer(buf, 0, tag) == 100000

    def test_real_big_endian(self):
        buf = struct.pack('>f', 3.14)
        tag = _make_tag('R', 1, 0, 'REAL', byte_swap=False, decimal_places=2)
        result = _extract_value_from_buffer(buf, 0, tag)
        assert abs(result - 3.14) < 0.01

    def test_real_byte_swap(self):
        # Byte-swapped: bytes are reversed for little-endian interpretation
        value = 42.5
        big_endian = struct.pack('>f', value)
        # The buffer stores big-endian bytes, but byte_swap reverses them
        tag = _make_tag('R', 1, 0, 'REAL', byte_swap=True, decimal_places=1)
        # For byte_swap, the buffer should contain the original big-endian bytes
        # which get reversed to little-endian inside the extractor
        le_bytes = struct.pack('<f', value)
        reversed_le = le_bytes[::-1]  # This is what big-endian would look like
        result = _extract_value_from_buffer(bytearray(reversed_le), 0, tag)
        assert abs(result - value) < 0.1

    def test_string(self):
        # S7 STRING: byte[0] = max_len, byte[1] = actual_len, rest = chars
        text = b'HELLO'
        buf = bytearray([40, len(text)] + list(text) + [0] * 35)
        tag = _make_tag('S', 1, 0, 'STRING', string_length=40)
        assert _extract_value_from_buffer(buf, 0, tag) == 'HELLO'

    def test_wstring_utf16be(self):
        max_c = 10
        s = 'AB'
        payload = s.encode('utf-16-be')
        buf = bytearray(struct.pack('>H', max_c) + struct.pack('>H', len(s)) + payload)
        buf.extend(b'\x00' * (4 + max_c * 2 - len(buf)))
        tag = _make_tag('W', 1, 0, 'WSTRING', string_length=max_c)
        assert _extract_value_from_buffer(buf, 0, tag) == 'AB'

    def test_offset_within_buffer(self):
        """Tag at offset 10, buffer starts at offset 8."""
        # Pad 2 bytes before the INT value
        buf = bytearray(4)
        struct.pack_into('>h', buf, 2, 9999)
        tag = _make_tag('I', 1, 10, 'INT')
        result = _extract_value_from_buffer(buf, 8, tag)
        assert result == 9999

    def test_offset_out_of_range_returns_none(self):
        buf = bytearray(2)
        tag = _make_tag('I', 1, 100, 'INT')
        assert _extract_value_from_buffer(buf, 0, tag) is None


# ── _read_tags_batched ────────────────────────────────────────────────────────

class TestReadTagsBatched:

    def test_groups_by_db_number(self):
        """Tags in the same DB should be read in a single PLC call."""
        # Build DB100 with two REAL values at offsets 0 and 4
        db100 = struct.pack('>f', 10.0) + struct.pack('>f', 20.0)
        plc = MockPLC(db_data={100: db100})

        tags = [
            _make_tag('Tag_A', 100, 0, 'REAL'),
            _make_tag('Tag_B', 100, 4, 'REAL'),
        ]

        result = _read_tags_batched(plc, tags)
        assert abs(result['Tag_A'] - 10.0) < 0.01
        assert abs(result['Tag_B'] - 20.0) < 0.01
        # Only 1 PLC read for the entire DB block
        assert plc.read_count == 1

    def test_separate_dbs_separate_reads(self):
        """Tags in different DBs should each trigger a separate read."""
        db100 = struct.pack('>f', 5.0)
        db200 = struct.pack('>f', 15.0)
        plc = MockPLC(db_data={100: db100, 200: db200})

        tags = [
            _make_tag('Tag_A', 100, 0, 'REAL'),
            _make_tag('Tag_B', 200, 0, 'REAL'),
        ]

        result = _read_tags_batched(plc, tags)
        assert abs(result['Tag_A'] - 5.0) < 0.01
        assert abs(result['Tag_B'] - 15.0) < 0.01
        assert plc.read_count == 2

    def test_mixed_data_types_in_same_db(self):
        """INT and REAL in the same DB should both be extracted correctly."""
        # offset 0: INT (2 bytes), offset 2: padding (2 bytes), offset 4: REAL (4 bytes)
        db_data = struct.pack('>h', 42) + b'\x00\x00' + struct.pack('>f', 3.14)
        plc = MockPLC(db_data={50: db_data})

        tags = [
            _make_tag('IntTag', 50, 0, 'INT'),
            _make_tag('RealTag', 50, 4, 'REAL', decimal_places=2),
        ]

        result = _read_tags_batched(plc, tags)
        assert result['IntTag'] == 42
        assert abs(result['RealTag'] - 3.14) < 0.01
        assert plc.read_count == 1

    def test_fallback_on_batch_read_failure(self):
        """If batch read fails, individual reads should be attempted."""

        class FailFirstPLC:
            """Fails the first (batch) call, succeeds on individual reads."""
            def __init__(self):
                self.call_count = 0

            def db_read(self, db_number, start, size):
                self.call_count += 1
                if self.call_count == 1:
                    raise Exception("Simulated batch read failure")
                # Individual fallback: return appropriate data
                return bytearray(struct.pack('>f', 99.0))

        plc = FailFirstPLC()
        tags = [_make_tag('Tag_A', 100, 0, 'REAL')]

        result = _read_tags_batched(plc, tags)
        # Should have fallen back to individual read
        assert plc.call_count == 2
        assert result['Tag_A'] is not None

    def test_tags_with_no_db_number_skipped(self):
        """Tags without db_number should be silently skipped."""
        plc = MockPLC()
        tags = [{'tag_name': 'NoDb', 'db_number': None, 'offset': 0, 'data_type': 'REAL'}]
        result = _read_tags_batched(plc, tags)
        assert result == {}
        assert plc.read_count == 0


# ── Tag config cache ──────────────────────────────────────────────────────────

class TestTagConfigCache:

    def test_invalidate_clears_cache(self):
        """invalidate_tag_config_cache should clear the module-level cache."""
        import utils.tag_reader as tr
        # Manually set cache to simulate a filled cache
        tr._tag_config_cache = [{"tag_name": "cached_tag"}]
        tr._tag_config_cache_ts = time.time()
        invalidate_tag_config_cache()
        assert tr._tag_config_cache is None
        assert tr._tag_config_cache_ts == 0
