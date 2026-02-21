#!/usr/bin/env python3
"""
Phase 2 — Historian validation script (Single Historian Migration).

Compares per-layout archive table (tag_values JSONB) vs tag_history_archive
(same layout_id, archive_hour, tag). Logs mismatches; exit code 1 if any mismatch
so it can be used in cron/alerting.

Usage:
  cd backend && python validate_historian_phase2.py

Uses same env as app: POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, DB_HOST, DB_PORT.
Optional: VALIDATE_HISTORIAN_HOURS=24 (number of recent archive hours to check; default 24).
"""

import json
import logging
import os
import re
import sys
from contextlib import closing

import psycopg2
from psycopg2.extras import RealDictCursor

# Tolerance for float comparison (same tag, same hour)
VALUE_TOLERANCE = 1e-6

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "database": os.getenv("POSTGRES_DB", "dynamic_db_hercules"),
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", "Hercules"),
    "port": int(os.getenv("DB_PORT", "5432")),
}

# How many recent archive hours to validate per layout (default 24)
MAX_ARCHIVE_HOURS = int(os.getenv("VALIDATE_HISTORIAN_HOURS", "24"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def get_conn():
    return psycopg2.connect(**DB_CONFIG)


def get_active_monitors(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT layout_id, layout_name, archive_table_name
            FROM dynamic_monitor_registry
            WHERE is_active = TRUE
        """)
        return [dict(row) for row in cur.fetchall()]


def get_tag_id_to_name(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT id, tag_name FROM tags WHERE is_active = TRUE")
        return {row["id"]: row["tag_name"] for row in cur.fetchall()}


def _parse_tag_values(tag_values):
    if tag_values is None:
        return {}
    if isinstance(tag_values, dict):
        return tag_values
    if isinstance(tag_values, str):
        try:
            return json.loads(tag_values)
        except json.JSONDecodeError:
            return {}
    return {}


def compare_values(layout_val, historian_val, tag_name, archive_hour, layout_name):
    """Return True if values match within tolerance."""
    try:
        lf = float(layout_val)
        hf = float(historian_val)
        return abs(lf - hf) <= VALUE_TOLERANCE
    except (TypeError, ValueError):
        return layout_val == historian_val


def _safe_table_name(name):
    """Allow only valid PostgreSQL identifier (no SQL injection)."""
    return name is not None and bool(re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", name))


def validate_layout(conn, monitor, tag_id_to_name):
    layout_id = monitor["layout_id"]
    layout_name = monitor["layout_name"]
    archive_table = monitor["archive_table_name"]
    if not archive_table or not _safe_table_name(archive_table):
        logger.warning(f"[{layout_name}] No or invalid archive_table_name; skip.")
        return 0

    mismatches = 0
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        # Recent archive hours from layout archive
        cur.execute(
            f"""
            SELECT DISTINCT archive_hour
            FROM {archive_table}
            WHERE layout_id = %s
            ORDER BY archive_hour DESC
            LIMIT %s
        """,
            (layout_id, MAX_ARCHIVE_HOURS),
        )
        hours = [row["archive_hour"] for row in cur.fetchall()]

    for archive_hour in hours:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                f"""
                SELECT archive_hour, tag_values
                FROM {archive_table}
                WHERE layout_id = %s AND archive_hour = %s
            """,
                (layout_id, archive_hour),
            )
            layout_row = cur.fetchone()
        if not layout_row:
            continue

        layout_tag_values = _parse_tag_values(layout_row["tag_values"])

        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT tag_id, value
                FROM tag_history_archive
                WHERE layout_id = %s AND archive_hour = %s
            """,
                (layout_id, archive_hour),
            )
            historian_rows = cur.fetchall()

        historian_by_name = {}
        for r in historian_rows:
            tag_name = tag_id_to_name.get(r["tag_id"])
            if tag_name is not None:
                historian_by_name[tag_name] = r["value"]

        all_tags = set(layout_tag_values) | set(historian_by_name)
        for tag_name in sorted(all_tags):
            lv = layout_tag_values.get(tag_name)
            hv = historian_by_name.get(tag_name)
            if lv is None:
                logger.debug(
                    f"[{layout_name}] {archive_hour} tag '{tag_name}' only in historian (value={hv})"
                )
                continue
            if hv is None:
                logger.warning(
                    f"[MISMATCH] {layout_name} | {archive_hour} | tag '{tag_name}' "
                    f"only in layout archive (value={lv}); missing in tag_history_archive"
                )
                mismatches += 1
                continue
            if not compare_values(lv, hv, tag_name, archive_hour, layout_name):
                logger.warning(
                    f"[MISMATCH] {layout_name} | {archive_hour} | tag '{tag_name}' "
                    f"layout={lv} vs historian={hv}"
                )
                mismatches += 1

    return mismatches


def main():
    logger.info(
        f"Phase 2 validation: comparing layout archive vs tag_history_archive (max {MAX_ARCHIVE_HOURS} hours per layout)"
    )
    total_mismatches = 0
    try:
        with closing(get_conn()) as conn:
            monitors = get_active_monitors(conn)
            if not monitors:
                logger.info("No active monitors; nothing to validate.")
                return 0

            tag_id_to_name = get_tag_id_to_name(conn)
            logger.info(f"Active monitors: {len(monitors)}; tags: {len(tag_id_to_name)}")

            for monitor in monitors:
                n = validate_layout(conn, monitor, tag_id_to_name)
                total_mismatches += n

        if total_mismatches == 0:
            logger.info("Validation passed: no mismatches.")
            return 0
        logger.warning(f"Validation found {total_mismatches} mismatch(es).")
        return 1
    except Exception as e:
        logger.exception(f"Validation failed: {e}")
        return 2


if __name__ == "__main__":
    sys.exit(main())
