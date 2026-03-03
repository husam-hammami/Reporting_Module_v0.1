"""
Tests for TagValueCache — the read-once, share-many PLC tag value cache.

Tests cover:
  - Basic update/get cycle
  - Staleness detection (max_age)
  - Thread safety (concurrent reads/writes)
  - Properties (age, update_count, tag_count, is_fresh)
  - Empty cache behavior
"""

import threading
import time
import pytest

# Adjust path so we can import from backend/utils
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.tag_value_cache import TagValueCache


class TestTagValueCacheBasics:
    """Basic update/get behavior."""

    def test_empty_cache_returns_none(self):
        cache = TagValueCache(max_age=5.0)
        assert cache.get_values() is None

    def test_update_then_get(self):
        cache = TagValueCache(max_age=5.0)
        data = {"Temp_1": 42.5, "Pressure_1": 3.14}
        cache.update(data)
        result = cache.get_values()
        assert result == data

    def test_get_returns_copy(self):
        """Mutations to returned dict should not affect cache."""
        cache = TagValueCache(max_age=5.0)
        cache.update({"Tag_A": 1.0})
        result = cache.get_values()
        result["Tag_A"] = 999.0
        assert cache.get_values()["Tag_A"] == 1.0

    def test_update_stores_copy(self):
        """Mutations to input dict should not affect cache."""
        cache = TagValueCache(max_age=5.0)
        data = {"Tag_B": 2.0}
        cache.update(data)
        data["Tag_B"] = 999.0
        assert cache.get_values()["Tag_B"] == 2.0

    def test_update_overwrites_previous(self):
        cache = TagValueCache(max_age=5.0)
        cache.update({"A": 1})
        cache.update({"B": 2})
        result = cache.get_values()
        assert "A" not in result
        assert result["B"] == 2


class TestTagValueCacheStaleness:
    """Staleness detection via max_age."""

    def test_fresh_cache_is_not_stale(self):
        cache = TagValueCache(max_age=5.0)
        cache.update({"Tag": 1.0})
        assert cache.is_fresh() is True
        assert cache.get_values() is not None

    def test_stale_cache_returns_none(self):
        cache = TagValueCache(max_age=0.1)  # 100ms max age
        cache.update({"Tag": 1.0})
        time.sleep(0.15)  # Let it go stale
        assert cache.is_fresh() is False
        assert cache.get_values() is None

    def test_refresh_resets_staleness(self):
        cache = TagValueCache(max_age=0.2)
        cache.update({"Tag": 1.0})
        time.sleep(0.15)
        # Not stale yet
        assert cache.is_fresh() is True
        # Refresh
        cache.update({"Tag": 2.0})
        time.sleep(0.1)
        # Still fresh after refresh
        assert cache.is_fresh() is True
        assert cache.get_values()["Tag"] == 2.0


class TestTagValueCacheProperties:
    """Properties: age, update_count, tag_count."""

    def test_age_infinite_when_empty(self):
        cache = TagValueCache(max_age=5.0)
        assert cache.age == float('inf')

    def test_age_increases_over_time(self):
        cache = TagValueCache(max_age=5.0)
        cache.update({"X": 1})
        time.sleep(0.05)
        assert cache.age > 0
        assert cache.age < 1.0  # Should be well under 1 second

    def test_update_count(self):
        cache = TagValueCache(max_age=5.0)
        assert cache.update_count == 0
        cache.update({"A": 1})
        assert cache.update_count == 1
        cache.update({"B": 2})
        assert cache.update_count == 2
        cache.update({"C": 3})
        assert cache.update_count == 3

    def test_tag_count(self):
        cache = TagValueCache(max_age=5.0)
        assert cache.tag_count == 0
        cache.update({"A": 1, "B": 2, "C": 3})
        assert cache.tag_count == 3
        cache.update({"X": 99})
        assert cache.tag_count == 1  # Replaced, not appended


class TestTagValueCacheThreadSafety:
    """Concurrent read/write safety."""

    def test_concurrent_reads_and_writes(self):
        """Many threads reading and one writing should not crash or corrupt."""
        cache = TagValueCache(max_age=5.0)
        errors = []
        stop_event = threading.Event()

        def writer():
            i = 0
            while not stop_event.is_set():
                cache.update({f"Tag_{i}": float(i)})
                i += 1
                time.sleep(0.001)

        def reader():
            while not stop_event.is_set():
                try:
                    result = cache.get_values()
                    if result is not None:
                        # Should always be a dict
                        assert isinstance(result, dict)
                except Exception as e:
                    errors.append(str(e))
                time.sleep(0.001)

        # Start 1 writer and 5 readers
        writer_thread = threading.Thread(target=writer)
        reader_threads = [threading.Thread(target=reader) for _ in range(5)]

        writer_thread.start()
        for t in reader_threads:
            t.start()

        # Run for 200ms
        time.sleep(0.2)
        stop_event.set()

        writer_thread.join(timeout=2)
        for t in reader_threads:
            t.join(timeout=2)

        assert len(errors) == 0, f"Thread safety errors: {errors}"
        assert cache.update_count > 0
