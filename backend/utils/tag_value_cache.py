"""
Tag Value Cache — Read-once, share-many pattern for PLC tag values.

Instead of 3 workers each independently reading all tags from the PLC
(= 3N TCP round-trips per second), a single poller reads all tags once
per second and stores the result. All workers consume from this cache.

Performance improvement: 3N reads/sec → M reads/sec (M = number of unique DB numbers).
"""

import logging
import threading
import time

logger = logging.getLogger(__name__)


class TagValueCache:
    """Thread-safe cache for PLC tag values.

    One poller thread calls `update(values)` every second.
    Multiple worker threads call `get_values()` to read the latest snapshot.
    """

    def __init__(self, max_age: float = 3.0):
        """
        Args:
            max_age: Maximum age in seconds before values are considered stale.
                     Workers get None if cache is older than this.
        """
        self._lock = threading.Lock()
        self._values: dict = {}
        self._timestamp: float = 0.0
        self._max_age = max_age
        self._update_count: int = 0

    def update(self, values: dict) -> None:
        """Store a new snapshot of tag values. Called by the poller thread."""
        with self._lock:
            self._values = dict(values)  # Copy to prevent mutation
            self._timestamp = time.time()
            self._update_count += 1

    def get_values(self) -> dict | None:
        """Get the latest tag values snapshot.

        Returns:
            dict of {tag_name: value} or None if cache is stale/empty.
        """
        with self._lock:
            if not self._values:
                return None
            age = time.time() - self._timestamp
            if age > self._max_age:
                logger.warning(
                    "[TagValueCache] Cache stale (%.1fs old, max %.1fs). "
                    "Poller may have stopped.",
                    age, self._max_age
                )
                return None
            return dict(self._values)  # Return copy to prevent mutation

    @property
    def age(self) -> float:
        """Age of the current cache in seconds."""
        with self._lock:
            if self._timestamp == 0:
                return float('inf')
            return time.time() - self._timestamp

    @property
    def update_count(self) -> int:
        """Number of times the cache has been updated."""
        with self._lock:
            return self._update_count

    @property
    def tag_count(self) -> int:
        """Number of tags in the current cache."""
        with self._lock:
            return len(self._values)

    def is_fresh(self) -> bool:
        """Check if the cache has been updated within max_age."""
        return self.age <= self._max_age


# ── Global singleton ─────────────────────────────────────────────────────────
_cache = TagValueCache(max_age=3.0)


def get_tag_value_cache() -> TagValueCache:
    """Get the global TagValueCache singleton."""
    return _cache


def start_tag_poller(db_connection_func, interval: float = 1.0):
    """Start the background tag poller thread.

    Reads all PLC tags once per interval and updates the cache.
    This replaces the 3 independent read_all_tags() calls from workers.

    Args:
        db_connection_func: Function to get a database connection.
        interval: Polling interval in seconds (default 1.0).
    """
    import eventlet

    def _poller_loop():
        logger.info("[TagPoller] Starting tag value poller (interval=%.1fs)", interval)
        cache = get_tag_value_cache()
        consecutive_errors = 0

        while True:
            loop_start = time.time()
            try:
                from utils.tag_reader import read_all_tags_batched
                values = read_all_tags_batched(
                    tag_names=None,
                    db_connection_func=db_connection_func
                )
                if values:
                    cache.update(values)
                    consecutive_errors = 0
                    if cache.update_count % 30 == 0:
                        logger.info(
                            "[TagPoller] Cache updated: %d tags (cycle %d, %.0fms)",
                            len(values), cache.update_count,
                            (time.time() - loop_start) * 1000
                        )
                else:
                    logger.debug("[TagPoller] No tag values returned")

            except Exception as e:
                consecutive_errors += 1
                if consecutive_errors <= 3:
                    logger.error("[TagPoller] Error reading tags: %s", e)
                elif consecutive_errors % 30 == 0:
                    logger.error(
                        "[TagPoller] Persistent error (%d consecutive): %s",
                        consecutive_errors, e
                    )
                eventlet.sleep(min(5, interval * consecutive_errors))
                continue

            elapsed = time.time() - loop_start
            sleep_time = max(0, interval - elapsed)
            eventlet.sleep(sleep_time)

    eventlet.spawn(_poller_loop)
    logger.info("[TagPoller] Poller thread spawned")
