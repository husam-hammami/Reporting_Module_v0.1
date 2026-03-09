# DATA AGGREGATION AND RETENTION PLAN

**Date:** 2026-03-08
**Project:** Reporting Hercules
**Status:** Proposed
**Author:** Engineering Team

---

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Current State Analysis](#2-current-state-analysis)
3. [Proposed Multi-Tier Retention Architecture](#3-proposed-multi-tier-retention-architecture)
4. [Tier Specifications](#4-tier-specifications)
5. [Aggregation Rules Per Tag Type](#5-aggregation-rules-per-tag-type)
6. [Query Routing Strategy](#6-query-routing-strategy)
7. [Archiving Schedule and Worker Jobs](#7-archiving-schedule-and-worker-jobs)
8. [Database Schema Changes](#8-database-schema-changes)
9. [Dead-Band Filtering (Optional Optimization)](#9-dead-band-filtering-optional-optimization)
10. [Implementation Phases](#10-implementation-phases)
11. [Risks and Mitigations](#11-risks-and-mitigations)
12. [Storage Impact Projections](#12-storage-impact-projections)

---

## 1. Problem Statement

The Reporting Hercules system collects PLC data at 1-second intervals for every active tag. This data is stored indefinitely in the `tag_history` table with no automated cleanup or retention policy for the universal historian rows (where `layout_id IS NULL`).

### Current Growth Rate (50 active tags)

| Timeframe | Rows Generated       | Estimated Storage |
|-----------|----------------------|-------------------|
| Per day   | 4,320,000            | ~500 MB           |
| Per month | ~130,000,000         | ~15 GB            |
| Per year  | ~1,570,000,000       | ~180 GB           |
| 5 years   | ~7,850,000,000       | ~900 GB           |

### Consequences if Unaddressed

- PostgreSQL query performance degrades severely beyond ~500M rows without partitioning
- Report generation times increase from milliseconds to seconds/minutes
- Database backup and restore times grow linearly
- Storage costs escalate unnecessarily
- Index maintenance and VACUUM operations become resource-intensive

---

## 2. Current State Analysis

### What Exists Today

| Component                    | Location                                          | Behavior                                                  |
|------------------------------|---------------------------------------------------|-----------------------------------------------------------|
| Historian Worker             | `backend/workers/historian_worker.py`              | Writes 1 row per tag per second to `tag_history`           |
| Dynamic Monitor Worker       | `backend/workers/dynamic_monitor_worker.py`        | Writes per-layout JSONB logs every second                  |
| Dynamic Archive Worker       | `backend/workers/dynamic_archive_worker.py`        | Hourly: aggregates per-layout logs, deletes raw            |
| Universal Historian Archive  | Same archive worker                                | Hourly: aggregates `tag_history` to `tag_history_archive`  |
| Raw Data Cleanup             | **NONE**                                           | `tag_history` rows are NEVER deleted automatically         |

### What Works Well

- Hourly archiving with smart SUM/AVG rules (counters vs analog)
- Per-layout raw log cleanup (hourly delete after archive)
- Chart auto-downsampling at query time (max 500 points)
- WebSocket + REST polling for live data

### What Is Missing

- Automated raw data cleanup for `tag_history`
- Minute-level aggregation tier (gap between 1s and 1h is too large)
- Daily/monthly aggregation tiers for long-term queries
- Multi-field archive (current archive stores only single `value`, losing min/max/last)
- Smart query routing based on requested time range
- Dead-band filtering to reduce redundant writes

### Known Issues

1. **Double PLC reads**: Both historian and dynamic monitor workers call `read_all_tags()` independently every second (2x PLC communication load)
2. **No value deduplication**: Identical values are stored every second even when signals are stable
3. **Archive single-value limitation**: `tag_history_archive` stores only one aggregated value, so `last` aggregation queries on historical data return the hourly average instead of the actual last value
4. **Archive fallback discontinuity**: When raw data is partially cleaned and archive exists, reports spanning the boundary may show inconsistent granularity

---

## 3. Proposed Multi-Tier Retention Architecture

```
TIME ──────────────────────────────────────────────────────────►

│ TIER 0: RAW       │ TIER 1: MINUTE  │ TIER 2: HOURLY │ TIER 3: DAILY │ TIER 4: MONTHLY │
│ 1-second samples  │ 1-min aggregate │ 1-hr aggregate │ 1-day aggreg. │ 1-month aggreg. │
│                   │                 │                │               │                 │
│ Retention: 48h    │ Retention: 7d   │ Retention: 90d │ Retention: 2y │ Retention: ∞    │
│ Table:            │ Table:          │ Table:         │ Table:        │ Table:          │
│ tag_history       │ tag_history_    │ tag_history_   │ tag_history_  │ tag_history_    │
│ (existing)        │ minute (NEW)    │ archive        │ daily (NEW)   │ monthly (NEW)   │
│                   │                 │ (existing,     │               │                 │
│                   │                 │  enhanced)     │               │                 │
│                   │                 │                │               │                 │
│ 86,400 rows/tag/d │ 1,440 rows/tag/d│ 24 rows/tag/d │ 1 row/tag/d  │ 1 row/tag/month │
│ ~500 MB/day       │ ~8 MB/day       │ ~0.14 MB/day  │ ~6 KB/day    │ ~0.2 KB/day     │
└───────────────────┴─────────────────┴────────────────┴───────────────┴─────────────────┘

AGGREGATION FLOW:

  tag_history (1s) ──► tag_history_minute (1m) ──► tag_history_archive (1h)
                                                          │
                                                          ▼
                                                   tag_history_daily (1d)
                                                          │
                                                          ▼
                                                   tag_history_monthly (1mo)
```

---

## 4. Tier Specifications

### TIER 0 — Raw (`tag_history`, existing)

| Property       | Value                                                      |
|----------------|------------------------------------------------------------|
| Table          | `tag_history` (no schema change)                           |
| Granularity    | 1 second                                                   |
| Retention      | **48 hours**                                               |
| Cleanup method | Automated hourly DELETE of rows older than 48 hours        |
| Use cases      | Live reports, Today reports, Shift reports (current day)   |
| Why 48 hours   | Covers full "Today" report range + buffer for timezone edge cases and overnight shifts |

### TIER 1 — Minute (`tag_history_minute`, NEW)

| Property       | Value                                                      |
|----------------|------------------------------------------------------------|
| Table          | `tag_history_minute` (new table)                           |
| Granularity    | 1 minute (60 raw samples aggregated into 1 row)            |
| Retention      | **7 days**                                                 |
| Cleanup method | Daily DELETE of rows older than 7 days                     |
| Use cases      | Today reports (after 48h), This Week reports, Shift analysis across days |
| Fields stored  | avg, min, max, last, delta_sum, sample_count               |
| Why 1 minute   | Provides 1,440 data points per day per tag — sufficient detail for weekly charts while being 60x smaller than raw |

### TIER 2 — Hourly (`tag_history_archive`, existing, enhanced)

| Property       | Value                                                      |
|----------------|------------------------------------------------------------|
| Table          | `tag_history_archive` (enhanced schema)                    |
| Granularity    | 1 hour (60 minute-rows aggregated into 1 row)              |
| Retention      | **90 days**                                                |
| Cleanup method | Weekly DELETE of rows older than 90 days                   |
| Use cases      | This Week, This Month, Custom ranges up to 90 days         |
| Enhancement    | Add `value_min`, `value_max`, `value_last`, `delta_sum`, `sample_count` columns |
| Why enhance    | Current table stores only `value` (avg). Reports requesting `last` or `min`/`max` aggregation get incorrect results from archive |

### TIER 3 — Daily (`tag_history_daily`, NEW)

| Property       | Value                                                      |
|----------------|------------------------------------------------------------|
| Table          | `tag_history_daily` (new table)                            |
| Granularity    | 1 day (24 hourly rows aggregated into 1 row)               |
| Retention      | **2 years**                                                |
| Cleanup method | Monthly DELETE of rows older than 2 years                  |
| Use cases      | Quarterly trends, yearly comparisons, long custom ranges   |
| Fields stored  | avg, min, max, last, delta_sum, sample_count               |

### TIER 4 — Monthly (`tag_history_monthly`, NEW)

| Property       | Value                                                      |
|----------------|------------------------------------------------------------|
| Table          | `tag_history_monthly` (new table)                          |
| Granularity    | 1 month (~30 daily rows aggregated into 1 row)             |
| Retention      | **Indefinite**                                             |
| Cleanup method | None (tiny storage footprint)                              |
| Use cases      | Year-over-year trends, multi-year capacity planning, regulatory retention |
| Fields stored  | avg, min, max, last, delta_sum, sample_count               |

---

## 5. Aggregation Rules Per Tag Type

### Tag Classification

| Tag Type            | Detection Rule                                      | Primary Aggregation | Stores Delta Sum |
|---------------------|-----------------------------------------------------|---------------------|------------------|
| Counter / Totalizer | `is_counter = true`                                 | SUM (delta_sum)     | Yes              |
| Flow / Rate         | tag name contains `flow`, `rate`                    | SUM (delta_sum)     | Yes              |
| Weight / Produced   | tag name contains `weight`, `produced`              | SUM (delta_sum)     | Yes              |
| Temperature         | tag name contains `temp`                            | AVG                 | No               |
| Pressure            | tag name contains `press`, `pressure`               | AVG                 | No               |
| Status / Digital    | tag name contains `status`, `run`, `on`, `off`      | LAST                | No               |
| General Analog      | everything else                                     | AVG                 | No               |

### Aggregation Fields Stored Per Archive Row

| Field             | Formula                              | Purpose                              |
|-------------------|--------------------------------------|--------------------------------------|
| `value_avg`       | `AVG(value)` of child rows           | General-purpose aggregation          |
| `value_min`       | `MIN(value)` of child rows           | Minimum in period (alarms, reports)  |
| `value_max`       | `MAX(value)` of child rows           | Maximum in period (alarms, reports)  |
| `value_last`      | Last sample by timestamp             | Most recent value (gauges, status)   |
| `value_delta_sum` | `SUM(value_delta)` of child rows     | Accumulated change (counters, flows) |
| `sample_count`    | `COUNT(*)` of valid child rows       | Data quality indicator               |

### Which Aggregation Field Is Used by Default

When a report widget does not specify an explicit aggregation type, the system selects based on tag classification:

- **Counter/Flow/Weight/Produced** → `value_delta_sum`
- **Status/Digital** → `value_last`
- **Temperature/Pressure/General** → `value_avg`

---

## 6. Query Routing Strategy

The historian API endpoints should automatically select the best tier based on the requested time range. This is transparent to the frontend — reports and widgets do not need to know which tier is being queried.

### Routing Table

| Requested Time Range       | Tier Selected              | Max Data Points per Tag | Rationale                           |
|----------------------------|----------------------------|-------------------------|-------------------------------------|
| 0 – 2 hours               | TIER 0 (raw, 1 second)    | 7,200                   | Full granularity for short ranges   |
| 2 hours – 48 hours         | TIER 0 (raw) + downsampling | 500 (auto-downsample) | Already exists in time-series endpoint |
| 48 hours – 7 days          | TIER 1 (1 minute)          | 10,080                  | Minute-level detail for weekly      |
| 7 days – 90 days           | TIER 2 (hourly)            | 2,160                   | Hourly detail for monthly           |
| 90 days – 2 years          | TIER 3 (daily)             | 730                     | Daily detail for yearly             |
| Greater than 2 years       | TIER 4 (monthly)           | Unlimited               | Monthly for long-term               |

### Fallback Behavior

If the selected tier has no data for the requested range (e.g., system was recently deployed), fall back to the next lower tier that has data:

```
TIER 0 → TIER 1 → TIER 2 → TIER 3 → TIER 4 → "No data available"
```

### API Changes

The existing endpoints remain unchanged in their interface:

- `/api/historian/by-tags` — internally routes to the appropriate tier table
- `/api/historian/time-series` — internally routes to the appropriate tier table
- A new optional parameter `tier` can be added for advanced use cases (force a specific tier)

---

## 7. Archiving Schedule and Worker Jobs

### New Worker: `retention_worker.py`

A single new worker that runs on a schedule and handles all tier transitions and cleanup.

### Job Schedule

| Job                        | Trigger                          | Action                                                                                     |
|----------------------------|----------------------------------|--------------------------------------------------------------------------------------------|
| **Raw → Minute**           | Every 5 minutes                  | Aggregate complete 5-minute blocks of raw data into `tag_history_minute`                    |
| **Delete old raw**         | Every hour (after archive)       | `DELETE FROM tag_history WHERE layout_id IS NULL AND timestamp < NOW() - INTERVAL '48 hours'` |
| **Minute → Hourly**        | Every hour (existing, enhanced)  | Aggregate 60 minute-rows into `tag_history_archive` with all aggregation fields             |
| **Delete old minutes**     | Daily at 00:15                   | `DELETE FROM tag_history_minute WHERE bucket_time < NOW() - INTERVAL '7 days'`              |
| **Hourly → Daily**         | Daily at 00:30                   | Aggregate 24 hourly rows into `tag_history_daily`                                           |
| **Delete old hourly**      | Weekly on Sunday at 01:00        | `DELETE FROM tag_history_archive WHERE archive_hour < NOW() - INTERVAL '90 days'`           |
| **Daily → Monthly**        | 1st of each month at 02:00       | Aggregate previous month's daily rows into `tag_history_monthly`                            |
| **Delete old daily**       | 1st of each month at 03:00       | `DELETE FROM tag_history_daily WHERE bucket_date < NOW() - INTERVAL '2 years'`              |

### Job Execution Order (within each cycle)

```
1. Aggregate to higher tier FIRST  (data is preserved)
2. Verify aggregate row exists
3. THEN delete from lower tier     (safe to remove)
```

This ensures data is never lost — we always write before we delete.

### Concurrency and Locking

- All archive jobs use `SELECT ... FOR UPDATE SKIP LOCKED` to prevent conflicts
- Jobs run in the same worker process to ensure sequential execution within each cycle
- Existing `dynamic_archive_worker.py` is refactored to delegate to the new unified worker

---

## 8. Database Schema Changes

### New Table: `tag_history_minute`

```sql
CREATE TABLE tag_history_minute (
    id              BIGSERIAL PRIMARY KEY,
    tag_id          INTEGER NOT NULL REFERENCES tags(id),
    bucket_time     TIMESTAMP NOT NULL,          -- start of the minute
    value_avg       DOUBLE PRECISION,
    value_min       DOUBLE PRECISION,
    value_max       DOUBLE PRECISION,
    value_last      DOUBLE PRECISION,
    value_delta_sum DOUBLE PRECISION DEFAULT 0,
    sample_count    INTEGER DEFAULT 0,
    is_counter      BOOLEAN DEFAULT FALSE,
    quality_code    VARCHAR(20) DEFAULT 'GOOD',  -- worst quality in period
    UNIQUE (tag_id, bucket_time)
);

CREATE INDEX idx_thm_tag_bucket ON tag_history_minute (tag_id, bucket_time);
CREATE INDEX idx_thm_bucket     ON tag_history_minute (bucket_time);
```

### Enhanced Table: `tag_history_archive` (ALTER existing)

```sql
ALTER TABLE tag_history_archive
    ADD COLUMN IF NOT EXISTS value_min       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS value_max       DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS value_last      DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS value_delta_sum DOUBLE PRECISION DEFAULT 0,
    ADD COLUMN IF NOT EXISTS sample_count    INTEGER DEFAULT 0;

-- Rename 'value' to 'value_avg' for clarity (or keep as alias)
-- Note: existing code references 'value' column, so keep it and treat as avg
```

### New Table: `tag_history_daily`

```sql
CREATE TABLE tag_history_daily (
    id              BIGSERIAL PRIMARY KEY,
    tag_id          INTEGER NOT NULL REFERENCES tags(id),
    bucket_date     DATE NOT NULL,
    value_avg       DOUBLE PRECISION,
    value_min       DOUBLE PRECISION,
    value_max       DOUBLE PRECISION,
    value_last      DOUBLE PRECISION,
    value_delta_sum DOUBLE PRECISION DEFAULT 0,
    sample_count    INTEGER DEFAULT 0,
    is_counter      BOOLEAN DEFAULT FALSE,
    UNIQUE (tag_id, bucket_date)
);

CREATE INDEX idx_thd_tag_date ON tag_history_daily (tag_id, bucket_date);
CREATE INDEX idx_thd_date     ON tag_history_daily (bucket_date);
```

### New Table: `tag_history_monthly`

```sql
CREATE TABLE tag_history_monthly (
    id              BIGSERIAL PRIMARY KEY,
    tag_id          INTEGER NOT NULL REFERENCES tags(id),
    bucket_month    DATE NOT NULL,               -- 1st of the month
    value_avg       DOUBLE PRECISION,
    value_min       DOUBLE PRECISION,
    value_max       DOUBLE PRECISION,
    value_last      DOUBLE PRECISION,
    value_delta_sum DOUBLE PRECISION DEFAULT 0,
    sample_count    INTEGER DEFAULT 0,
    is_counter      BOOLEAN DEFAULT FALSE,
    UNIQUE (tag_id, bucket_month)
);

CREATE INDEX idx_thmo_tag_month ON tag_history_monthly (tag_id, bucket_month);
CREATE INDEX idx_thmo_month     ON tag_history_monthly (bucket_month);
```

### Migration File

Create: `backend/migrations/add_retention_tiers.sql`

Contains all the above CREATE TABLE and ALTER TABLE statements, wrapped in a transaction.

---

## 9. Dead-Band Filtering (Optional Optimization)

### Concept

Instead of storing every 1-second reading regardless of change, only store a new raw row when the value changes beyond a configurable threshold.

### Rules

```
Store a new raw row if ANY of the following is true:

1. |new_value - last_stored_value| > dead_band_threshold
2. time_since_last_stored > heartbeat_interval (60 seconds)
3. quality_code changed (e.g., GOOD → BAD)
4. Tag is a counter (always store — deltas must be continuous)
```

### Configuration

Add to tags table or tag configuration:

```
dead_band_percent:  0.5      -- 0.5% of tag's full range
dead_band_absolute: null     -- or fixed value (e.g., 0.1 degrees)
heartbeat_seconds:  60       -- force store every 60s even if no change
```

### Expected Impact

| Signal Type     | Typical Reduction | Example                              |
|-----------------|-------------------|--------------------------------------|
| Stable analog   | 70-90%            | Temperature holding at setpoint      |
| Slow-changing   | 40-60%            | Tank level filling gradually         |
| Fast-changing   | 10-20%            | Vibration, flow with turbulence      |
| Digital/Status  | 80-95%            | Motor run status (on/off)            |
| Counter         | 0% (always stored)| Production counter                   |

### Overall Estimate

With a typical industrial tag mix: **60-80% reduction** in Tier 0 row count.

### Implementation Notes

- Dead-band filtering is applied in the historian worker BEFORE the database write
- A per-tag in-memory cache tracks `last_stored_value` and `last_stored_time`
- If the worker restarts, the first reading always writes (no previous reference)
- Aggregation tiers are unaffected — they aggregate whatever is stored
- The `sample_count` field in archives indicates actual stored samples (useful for quality assessment)

---

## 10. Implementation Phases

---

### ESSENTIAL PHASES (Must Implement)

> **Phases 1 through 3 are essential.** They address the core problems: unbounded storage growth,
> inaccurate historical queries, and the missing mid-resolution tier. These three phases alone
> deliver **~95% of the storage savings** and fix all known data correctness issues. The system
> will be production-ready and sustainable long-term after completing just these three phases.

---

### Phase 1: ESSENTIAL — Raw Data Cleanup (Week 1-2)

**Goal**: Stop unbounded storage growth immediately. This is the single most impactful change.

| Task | File(s) Affected | Description |
|------|-------------------|-------------|
| 1.1 | `backend/workers/dynamic_archive_worker.py` | Add DELETE query for `tag_history WHERE layout_id IS NULL AND timestamp < NOW() - INTERVAL '48 hours'` after hourly archive completes |
| 1.2 | `backend/config/retention_config.json` (NEW) | Create configurable retention settings: `{"raw_retention_hours": 48, "minute_retention_days": 7, ...}` |
| 1.3 | Manual | Run one-time cleanup of existing accumulated raw data older than 48h |

**Risk**: Low. Only adds a DELETE to an existing worker. Archive already preserves hourly data.

**Why essential**: Without this, the database grows by ~500 MB/day and will eventually cause system failure. This single phase delivers **92% storage savings**.

### Phase 2: ESSENTIAL — Enhance Hourly Archive (Week 2-3)

**Goal**: Fix the archive to store min/max/last so historical queries return accurate results.

| Task | File(s) Affected | Description |
|------|-------------------|-------------|
| 2.1 | `backend/migrations/add_retention_tiers.sql` (NEW) | ALTER `tag_history_archive` to add `value_min`, `value_max`, `value_last`, `value_delta_sum`, `sample_count` |
| 2.2 | `backend/workers/dynamic_archive_worker.py` | Update archive INSERT to populate all new fields |
| 2.3 | `backend/historian_bp.py` | Update archive fallback queries to use correct field based on requested aggregation type |

**Risk**: Low-Medium. Schema migration on existing table; requires brief downtime or online ALTER.

**Why essential**: The current archive stores only a single averaged value. When a report requests `last`, `min`, or `max` over archived data, it gets the wrong answer. This is a data correctness bug, not an optimization.

### Phase 3: ESSENTIAL — Add Minute Tier (Week 3-4)

**Goal**: Bridge the gap between 1-second raw (48h retention) and 1-hour archive.

| Task | File(s) Affected | Description |
|------|-------------------|-------------|
| 3.1 | `backend/migrations/add_retention_tiers.sql` | Add `tag_history_minute` table creation |
| 3.2 | `backend/workers/retention_worker.py` (NEW) | Create worker that runs every 5 minutes to aggregate raw → minute |
| 3.3 | `backend/historian_bp.py` | Add query routing: 48h-7d ranges query `tag_history_minute` instead of `tag_history` |
| 3.4 | Cleanup logic | Add daily DELETE of minute rows older than 7 days |

**Risk**: Medium. New table and worker; requires testing with all report types.

**Why essential**: After Phase 1 deletes raw data older than 48h, "This Week" reports would jump from 1-second granularity (last 48h) directly to 1-hour granularity (older data). The minute tier preserves 1-minute resolution for the full 7-day window, giving weekly reports smooth and detailed charts instead of choppy hourly steps.

---

### OPTIONAL LUXURY FIXES (Nice to Have)

> **Phases 4 through 7 are optional luxury improvements.** They provide incremental gains on top
> of the essential phases but are NOT required for a healthy, sustainable system. Implement these
> only if/when the specific need arises (e.g., multi-year trend reports, PLC communication
> optimization). They can be deferred indefinitely without risk.

---

### Phase 4: OPTIONAL — Add Daily and Monthly Tiers (Future)

**Goal**: Enable efficient long-term trend queries beyond 90 days.

| Task | File(s) Affected | Description |
|------|-------------------|-------------|
| 4.1 | `backend/migrations/add_retention_tiers.sql` | Add `tag_history_daily` and `tag_history_monthly` table creation |
| 4.2 | `backend/workers/retention_worker.py` | Add daily aggregation job (hourly → daily) at midnight |
| 4.3 | `backend/workers/retention_worker.py` | Add monthly aggregation job (daily → monthly) on 1st of month |
| 4.4 | `backend/historian_bp.py` | Extend query routing for 90d-2y (daily) and 2y+ (monthly) ranges |
| 4.5 | Cleanup logic | Add weekly DELETE of hourly rows older than 90 days; monthly DELETE of daily rows older than 2 years |

**Risk**: Medium. Multiple new tables; low risk since it's additive.

**When to consider**: Only needed if users request quarterly/yearly trend reports or the system runs for 1+ years and hourly archive table becomes large.

### Phase 5: OPTIONAL — Smart Query Routing (Future)

**Goal**: Make tier selection transparent to the frontend.

| Task | File(s) Affected | Description |
|------|-------------------|-------------|
| 5.1 | `backend/historian_bp.py` | Implement `_select_tier(from_ts, to_ts)` function that returns the optimal table and granularity |
| 5.2 | `backend/historian_bp.py` | Refactor `get_by_tags()` and `get_time_series()` to use the routing function |
| 5.3 | `backend/historian_bp.py` | Add fallback chain: preferred tier → next lower tier → next → "no data" |
| 5.4 | Frontend | No changes needed — API interface remains the same |

**Risk**: Medium. Core query logic change; requires thorough testing of all report presets.

**When to consider**: Only needed if Phase 4 is implemented. With just 3 tiers (raw/minute/hourly), manual routing in Phase 3 is sufficient.

### Phase 6: OPTIONAL — Dead-Band Filtering (Future)

**Goal**: Reduce raw data volume by 60-80% by skipping unchanged values.

| Task | File(s) Affected | Description |
|------|-------------------|-------------|
| 6.1 | Database | Add `dead_band_percent`, `dead_band_absolute`, `heartbeat_seconds` columns to `tags` table |
| 6.2 | `backend/workers/historian_worker.py` | Add dead-band check before INSERT: compare against in-memory `_last_stored_value` per tag |
| 6.3 | Admin UI or config | Provide way to configure dead-band per tag or use defaults |
| 6.4 | Testing | Verify report accuracy is maintained with filtered data |

**Risk**: Medium-High. Changes the fundamental data collection behavior. Requires careful validation that reports remain accurate.

**When to consider**: Only if the system scales to 200+ tags and 48h of raw data at 1-second intervals is straining database write throughput or disk I/O.

### Phase 7: OPTIONAL — Shared PLC Read Cache (Future)

**Goal**: Eliminate duplicate PLC reads between historian and dynamic monitor workers.

| Task | File(s) Affected | Description |
|------|-------------------|-------------|
| 7.1 | `backend/utils/tag_reader.py` | Add thread-safe `_read_cache` with 1-second TTL |
| 7.2 | Both workers | No changes needed — they call the same `read_all_tags()` which now caches |

**Risk**: Low. Simple caching with short TTL.

**When to consider**: Only if PLC communication latency or load becomes a bottleneck, or when connecting to real PLCs over slow networks.

---

## 11. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Data loss during cleanup | Low | High | Always aggregate BEFORE delete; verify archive row exists before removing raw |
| Report inaccuracy after tier switch | Medium | Medium | Extensive testing of all report types across tier boundaries; fallback chain |
| Migration downtime | Low | Medium | Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (non-blocking in PostgreSQL); new tables have no downtime |
| Worker failure leaves gap | Medium | Medium | Idempotent archive jobs (UPSERT with `ON CONFLICT DO UPDATE`); job logging and alerting |
| Dead-band hides important transient | Low | Medium | Configurable per-tag; disabled for counters; heartbeat ensures regular samples |
| Performance during large DELETE | Medium | Low | Batch deletes (`DELETE ... LIMIT 10000` in loop); run during low-traffic hours |

---

## 12. Storage Impact Projections

### With 50 Active Tags

| Timeframe | Current (No Cleanup) | After Phase 1 (48h raw) | After All Phases |
|-----------|----------------------|-------------------------|------------------|
| 1 month   | 15 GB                | 1.5 GB                  | 1.2 GB           |
| 6 months  | 90 GB                | 5.5 GB                  | 3.0 GB           |
| 1 year    | 180 GB               | 9.0 GB                  | 3.5 GB           |
| 5 years   | 900 GB               | 30 GB                   | 8.0 GB           |

### With 200 Active Tags (Scaled Deployment)

| Timeframe | Current (No Cleanup) | After Phase 1 (48h raw) | After All Phases |
|-----------|----------------------|-------------------------|------------------|
| 1 month   | 60 GB                | 6 GB                    | 4.8 GB           |
| 1 year    | 720 GB               | 36 GB                   | 14 GB            |
| 5 years   | 3.6 TB               | 120 GB                  | 32 GB            |

### With Dead-Band Filtering Added (Phase 6)

Additional **60-80% reduction** on Tier 0 storage. Tiers 1-4 see proportional reduction in `sample_count` but similar aggregated values.

---

## Summary

### ESSENTIAL (Do These)

| Phase | Classification | Effort | Impact | Description |
|-------|---------------|--------|--------|-------------|
| **Phase 1** | **ESSENTIAL** | 1-2 weeks | **92% storage savings** | Automated raw data cleanup (48h retention) |
| **Phase 2** | **ESSENTIAL** | 1 week | Fixes data correctness bug | Enhance hourly archive with min/max/last fields |
| **Phase 3** | **ESSENTIAL** | 1-2 weeks | Smooth weekly report charts | Add minute-level aggregation tier |

**Essential phases effort**: 3-5 weeks total. Delivers a production-ready, self-sustaining system.

### OPTIONAL LUXURY (Defer Until Needed)

| Phase | Classification | Effort | Impact | Description |
|-------|---------------|--------|--------|-------------|
| Phase 4 | Optional luxury | 2 weeks | Enables yearly queries | Add daily and monthly tiers |
| Phase 5 | Optional luxury | 1 week | Auto-selects best tier | Smart query routing |
| Phase 6 | Optional luxury | 2 weeks | 60-80% less raw writes | Dead-band filtering |
| Phase 7 | Optional luxury | 0.5 weeks | Halves PLC comm load | Shared read cache |

**Optional phases**: Only implement when a specific need arises. The system is fully healthy with just the essential phases.

---

*End of Plan*
