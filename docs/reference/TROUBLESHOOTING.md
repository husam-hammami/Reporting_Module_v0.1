# Troubleshooting Guide

> Reporting Module v0.1 -- Common issues and solutions organized by category.

---

## 1. PLC Connection Issues

### Cannot connect to PLC at all

**Problem:** Flask logs show `snap7 connection error` or `Connection refused` on
startup, and no tag values are read.

**Likely Cause:** Wrong PLC IP, port, rack, or slot in the configuration; or the
PLC is powered off / not on the same network.

**Solution:**
1. Verify the PLC IP address in Settings > PLC Configuration (or `GET /api/settings/plc-config`).
2. Confirm rack and slot match the physical PLC. Siemens S7-1200 is typically
   rack 0, slot 1; S7-1500 is rack 0, slot 0; S7-300/400 is rack 0, slot 2.
3. Ping the PLC IP from the server machine to confirm network connectivity.
4. Ensure the PLC has "PUT/GET communication" enabled in TIA Portal
   (Properties > Protection & Security > Connection mechanisms).
5. Check that no firewall is blocking port 102 (ISO-on-TCP).

### Intermittent connection drops

**Problem:** Tags read correctly for a while, then quality_code switches to
`COMM_ERROR` and values go stale.

**Likely Cause:** Network instability, PLC CPU going to STOP mode, or the S7
connection timing out due to inactivity.

**Solution:**
1. Check the PLC CPU status (RUN/STOP) in TIA Portal or the PLC front panel.
2. Verify the Ethernet cable and switch connections.
3. The worker reconnects automatically on failure. Check Flask logs for
   `Reconnecting to PLC` messages. If reconnects fail repeatedly, restart the
   Flask process.
4. If using Wi-Fi or VPN, switch to a wired connection for reliable operation.

### Wrong rack/slot configuration

**Problem:** Connection succeeds (no error) but every tag returns 0 or garbage
values.

**Likely Cause:** The rack/slot combination is technically valid but points to the
wrong CPU module.

**Solution:**
1. Open TIA Portal, select the PLC in the hardware catalog, and note the rack
   number and slot number displayed on the rail.
2. Update Settings > PLC Configuration with the correct rack and slot.
3. Restart the Flask process after changing PLC settings.

---

## 2. Tag Reading Issues

### Wrong values (random large numbers or garbage)

**Problem:** A REAL tag displays values like `1.35e+20` or `-3.4e+38` instead of
a sensible engineering value.

**Likely Cause:** Byte-swap mismatch. Siemens PLCs use big-endian byte order by
default. If `byte_swap` is set to `true` on a tag that does not need it (or vice
versa), the 4-byte REAL is reassembled in the wrong order.

**Solution:**
1. Check the tag's `byte_swap` setting: `SELECT tag_name, byte_swap FROM tags WHERE tag_name = '...'`.
2. Standard Siemens S7 PLCs use big-endian (`byte_swap = false`). Only set
   `byte_swap = true` if the PLC or gateway uses little-endian byte order.
3. Update the tag: `UPDATE tags SET byte_swap = false WHERE tag_name = '...'`.
4. The fix takes effect on the next worker read cycle (no restart needed).

### BOOL tag always reads FALSE

**Problem:** A BOOL tag always shows 0 even when the PLC bit is clearly TRUE.

**Likely Cause:** Wrong `bit_position` or wrong `offset`. A BOOL is a single bit
within a byte; both the byte offset and the bit position (0-7) must be correct.

**Solution:**
1. Open the tag table in TIA Portal and note the exact address (e.g., `DB10.DBX4.3`
   means DB 10, byte offset 4, bit 3).
2. Verify in the database: `SELECT tag_name, db_number, "offset", bit_position FROM tags WHERE tag_name = '...'`.
3. Update if wrong: `UPDATE tags SET "offset" = 4, bit_position = 3 WHERE tag_name = '...'`.

### Wrong offset (reading adjacent tag's value)

**Problem:** A tag returns values that belong to a neighboring tag (e.g., you see
temperature where you expect pressure).

**Likely Cause:** Overlapping or incorrect byte offsets. REAL occupies 4 bytes,
INT occupies 2 bytes, DINT occupies 4 bytes. If offsets overlap, you read the
wrong memory region.

**Solution:**
1. List the tags for that DB sorted by offset:
   ```sql
   SELECT tag_name, "offset", data_type
   FROM tags
   WHERE db_number = <N>
   ORDER BY "offset";
   ```
2. Verify no two tags overlap (REAL at offset 0 uses bytes 0-3, so the next tag
   must start at offset 4 or higher).
3. Cross-reference with the TIA Portal symbol table for the correct offsets.

### Scaling produces wrong engineering value

**Problem:** The raw PLC value is correct but the displayed value is off by a
factor.

**Likely Cause:** Wrong `scaling` multiplier or `value_formula`.

**Solution:**
1. Check scaling: `SELECT tag_name, scaling, value_formula FROM tags WHERE tag_name = '...'`.
2. If `value_formula` is set, it overrides `scaling`. The formula uses `value`
   as the variable name (e.g., `value * 0.277778`).
3. To reset: `UPDATE tags SET value_formula = NULL, scaling = 1.0 WHERE tag_name = '...'`.

---

## 3. WebSocket / Live Data Issues

### Live monitor not updating (page shows stale values)

**Problem:** The live monitor page loads but values never change. No WebSocket
activity in browser DevTools Network tab.

**Likely Cause:** `LOCAL_TEST_MODE` is still set to `true` in the frontend, or
the WebSocket URL is wrong.

**Solution:**
1. Open `Frontend/src/Context/SocketContext.jsx` and verify
   `LOCAL_TEST_MODE = false`.
2. When `LOCAL_TEST_MODE = true`, the frontend generates fake data locally and
   never connects to the backend WebSocket.
3. After changing, rebuild the frontend: `npm run build`.

### WebSocket connects but disconnects immediately

**Problem:** Browser console shows `WebSocket connection established` followed
immediately by `WebSocket disconnected`.

**Likely Cause:** Nginx (or another reverse proxy) is not forwarding the
WebSocket upgrade headers.

**Solution:**
Add these directives to the Nginx location block that proxies the Flask app:
```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### WebSocket works in dev but not in production build

**Problem:** `npm run dev` shows live data, but `npm run build` + static serve
does not.

**Likely Cause:** The WebSocket URL is hardcoded to `localhost:5000` and does not
match the production host.

**Solution:**
1. Ensure the socket connection URL uses a relative path or is configured via
   environment variable.
2. Check `SocketContext.jsx` for the connection URL and update it to match the
   production server address.

---

## 4. Database Issues

### "relation does not exist" error

**Problem:** Flask returns 500 with `relation "users" does not exist` (or any
other table name).

**Likely Cause:** Migrations have not been run against the target database.

**Solution:**
1. Connect to the database: `psql -U postgres -d dynamic_db_hercules`.
2. Run the missing migration:
   ```bash
   psql -U postgres -d dynamic_db_hercules -f backend/migrations/create_users_table.sql
   ```
3. To run all migrations in order, use:
   ```bash
   python backend/tools/setup/setup_local_db.py
   ```

### Connection refused to PostgreSQL

**Problem:** Flask logs show `could not connect to server: Connection refused` on
startup.

**Likely Cause:** PostgreSQL service is not running, or the connection parameters
(host, port, database name) are wrong.

**Solution:**
1. Check the service status:
   - Windows: `Get-Service postgresql-x64-17` in PowerShell.
   - Linux: `systemctl status postgresql`.
2. Verify environment variables: `POSTGRES_HOST` (default `localhost`),
   `POSTGRES_PORT` (default `5432`), `POSTGRES_DB` (default
   `dynamic_db_hercules`), `POSTGRES_USER`, `POSTGRES_PASSWORD`.
3. Check `pg_hba.conf` allows the connection method (use `trust` or `md5` for
   local development).

### No historical data in tag_history

**Problem:** `SELECT COUNT(*) FROM tag_history` returns 0 even though the system
has been running.

**Likely Cause:** The dynamic monitor worker is not running, or no monitors are
active in `dynamic_monitor_registry`.

**Solution:**
1. Check Flask startup logs for `Starting dynamic tag realtime monitor` and
   `Found N active monitor(s)`.
2. Verify the registry: `SELECT * FROM dynamic_monitor_registry WHERE is_active = true`.
3. If no active monitors exist, publish a layout through the UI or API.
4. The universal historian writes ALL tags with `layout_id = NULL`. Verify:
   ```sql
   SELECT COUNT(*) FROM tag_history WHERE layout_id IS NULL;
   ```

### tag_history growing too large

**Problem:** The `tag_history` table has millions of rows and queries are slow.

**Likely Cause:** Expected behavior -- the historian writes every second per tag.
At 160 tags and 1 write/sec, that is ~14 million rows/day.

**Solution:**
1. Verify the archive worker is running (check logs for `Starting dynamic archive worker`).
   The archive worker aggregates raw data into `tag_history_archive` hourly.
2. Purge old raw data (keep archive):
   ```sql
   DELETE FROM tag_history WHERE "timestamp" < NOW() - INTERVAL '7 days';
   VACUUM ANALYZE tag_history;
   ```
3. Consider adding time-based partitioning for production deployments.

---

## 5. Report Issues

### Blank report (no data shown)

**Problem:** A report template opens in the viewer but all widgets show "No data"
or are empty.

**Likely Cause:** The report template's `layout_config` has no widgets, or the
tags referenced by the widgets have no historical data for the selected time
range.

**Solution:**
1. Check the template: `SELECT layout_config FROM report_builder_templates WHERE id = <N>`.
2. Verify the `widgets` array is not empty.
3. Check that the tag names in widget configs match actual tags:
   ```sql
   SELECT tag_name FROM tags WHERE tag_name IN ('Tag1', 'Tag2') AND is_active = true;
   ```
4. Verify historical data exists for the time range:
   ```sql
   SELECT COUNT(*) FROM tag_history
   WHERE tag_id = (SELECT id FROM tags WHERE tag_name = 'Tag1')
     AND "timestamp" BETWEEN '2026-02-18 06:00' AND '2026-02-18 14:00';
   ```

### Wrong values in report vs. live monitor

**Problem:** The report shows different values than the live monitor for the same
tag and time.

**Likely Cause:** The report uses the `by-tags` historian endpoint which returns
aggregated data (AVG by default), while the live monitor shows instantaneous
values.

**Solution:**
1. This is expected behavior. Live = instant snapshot; report = aggregated over
   the requested time range.
2. If a tag is a counter (e.g., total kWh), ensure `is_counter = true` in the
   tags table so the historian uses `SUM(value_delta)` instead of `AVG(value)`.

### Shift filter dropdown is empty

**Problem:** The shift dropdown in ReportViewer shows no options.

**Likely Cause:** Shifts have not been configured in Settings.

**Solution:**
1. Navigate to Settings > Shifts and define at least one shift (name, start
   time, end time).
2. Or configure via API: `POST /api/settings/shifts` with the shift definitions.
3. The default configuration provides 3 shifts (Morning, Evening, Night) but
   only if `shifts_config.py` has been initialized.

---

## 6. Formula Issues

### Formula returns NULL

**Problem:** A tag with `source_type = 'Formula'` or a KPI formula shows NULL
instead of a number.

**Likely Cause:** One or more input tags referenced in the formula have no value
(the tag is inactive, disconnected, or has no data).

**Solution:**
1. Identify the input tags: for KPI formulas, check `kpi_tag_mapping`:
   ```sql
   SELECT alias_name, t.tag_name
   FROM kpi_tag_mapping m JOIN tags t ON m.tag_id = t.id
   WHERE m.kpi_id = <N>;
   ```
2. Verify each referenced tag has a current value:
   ```sql
   SELECT tag_name, is_active FROM tags WHERE tag_name IN ('tag_a', 'tag_b');
   ```
3. Check that the formula syntax is valid Python/math expression.

### Division by zero in formula

**Problem:** Formula logs show `ZeroDivisionError` and the KPI value is NULL.

**Likely Cause:** The denominator tag's value is 0 (e.g., throughput = 0 when
the line is stopped).

**Solution:**
1. Add a guard in the formula expression:
   - Before: `energy / throughput`
   - After: `energy / throughput if throughput > 0 else 0`
2. Or use the `ratio` aggregation type in `kpi_config`, which handles zero
   denominators automatically.

### DELTA returning 0 for counter tag

**Problem:** A counter tag (e.g., total energy kWh) shows `value_delta = 0` in
`tag_history` even though the raw value is incrementing.

**Likely Cause:** The worker's `_last_tag_value` cache was not seeded, or
`is_counter` is not set on the tag.

**Solution:**
1. Verify the tag is marked as a counter:
   ```sql
   SELECT tag_name, is_counter FROM tags WHERE tag_name = '...';
   ```
2. If `is_counter = false`, update it:
   ```sql
   UPDATE tags SET is_counter = true WHERE tag_name = '...';
   ```
3. The worker seeds `_last_tag_value` from the database on first run. After
   marking `is_counter = true`, restart Flask so the worker picks up the change.
4. The first cycle after restart will have `value_delta = 0` (no previous value
   to diff against); subsequent cycles will compute the delta correctly.

---

## 7. Emulator Issues

### Emulator not generating values

**Problem:** `LOCAL_TEST_MODE = true` is set but the frontend shows all zeros or
"No data".

**Likely Cause:** The emulator context (`EmulatorContext.jsx`) is not mounted, or
the TAG_PROFILES do not include the tags used by the current layout.

**Solution:**
1. Verify the `EmulatorProvider` wraps the application component tree in
   `App.jsx` or the relevant route.
2. Check the browser console for emulator log messages (e.g.,
   `[Emulator] Generating values for N tags`).
3. If specific tags are missing, add them to the `TAG_PROFILES` object in
   `EmulatorContext.jsx`.

### Tags missing from emulator

**Problem:** Some tags work in the emulator but others show "N/A".

**Likely Cause:** The tag exists in the database but is not included in the
emulator's `TAG_PROFILES` configuration.

**Solution:**
1. Manual/emulator-only tags (`source_type = 'Manual'`) must be defined in the
   frontend `TAG_PROFILES` to generate values.
2. PLC tags (`source_type = 'PLC'`) are read by the backend worker, not the
   emulator. In emulator mode with `LOCAL_TEST_MODE = true`, PLC tags will not
   have values unless the EmulatorClient is running on the backend.
3. For a full demo without a PLC, ensure the backend's `EmulatorClient` is
   enabled (check Flask startup logs for `EmulatorClient initialized`).

---

## 8. Performance Issues

### Slow report rendering

**Problem:** Opening a report takes more than 5 seconds.

**Likely Cause:** The historian query is scanning a large `tag_history` table
without proper index usage, or too many tags are being fetched for a wide time
range.

**Solution:**
1. Check query performance:
   ```sql
   EXPLAIN ANALYZE
   SELECT * FROM tag_history
   WHERE tag_id = 5 AND "timestamp" BETWEEN '2026-02-18' AND '2026-02-19';
   ```
2. Verify the index `idx_tag_history_layout_tag_time` is being used (look for
   `Index Scan` in the output, not `Seq Scan`).
3. Narrow the time range or reduce the number of tags per report.
4. Run `VACUUM ANALYZE tag_history` to update statistics.

### Worker cycle time exceeding 1 second

**Problem:** Flask logs show the dynamic monitor worker cycle takes longer than
the 1-second target (e.g., `Cycle completed in 2.3s`).

**Likely Cause:** Too many tags being read in a single PLC request, or database
write latency.

**Solution:**
1. Check the number of active tags: `SELECT COUNT(*) FROM tags WHERE is_active = true`.
2. If the count exceeds 200, consider grouping reads or increasing the worker
   interval.
3. Check PostgreSQL performance: ensure `shared_buffers` and `work_mem` are
   appropriately sized for the workload.
4. The worker reads ALL active tags each cycle. Deactivate unused tags:
   ```sql
   UPDATE tags SET is_active = false WHERE tag_name LIKE 'old_%';
   ```

### Database disk usage growing rapidly

**Problem:** The PostgreSQL data directory is consuming excessive disk space.

**Likely Cause:** `tag_history` accumulates raw data every second per tag.

**Solution:**
1. Check table sizes:
   ```sql
   SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
   FROM pg_catalog.pg_statio_user_tables
   ORDER BY pg_total_relation_size(relid) DESC;
   ```
2. Purge old raw data (archive preserves hourly aggregates):
   ```sql
   DELETE FROM tag_history WHERE "timestamp" < NOW() - INTERVAL '7 days';
   VACUUM FULL tag_history;
   ```
3. Set up a scheduled purge job (cron / Windows Task Scheduler) to run the
   delete + vacuum weekly.
4. For production, implement PostgreSQL native partitioning on `tag_history`
   by month or week.

---

## 9. Diagnostic Commands

### Useful SQL Queries

**Count rows in historian tables:**
```sql
SELECT 'tag_history' AS tbl, COUNT(*) AS rows FROM tag_history
UNION ALL
SELECT 'tag_history_archive', COUNT(*) FROM tag_history_archive;
```

**Check latest write timestamp:**
```sql
SELECT MAX("timestamp") AS latest_write FROM tag_history;
```

**Count distinct tags being recorded:**
```sql
SELECT COUNT(DISTINCT tag_id) AS unique_tags FROM tag_history
WHERE "timestamp" > NOW() - INTERVAL '5 minutes';
```

**Check quality codes distribution:**
```sql
SELECT quality_code, COUNT(*) FROM tag_history
WHERE "timestamp" > NOW() - INTERVAL '1 hour'
GROUP BY quality_code;
```

**List active monitors:**
```sql
SELECT layout_name, live_table_name, is_active, last_archive_at
FROM dynamic_monitor_registry;
```

**Check running orders:**
```sql
SELECT layout_id, order_name, start_time, status
FROM dynamic_orders
WHERE status = 'running';
```

**Verify tag data types and offsets for a DB:**
```sql
SELECT tag_name, "offset", data_type, bit_position, byte_swap
FROM tags
WHERE db_number = 10 AND source_type = 'PLC'
ORDER BY "offset";
```

**Check KPI formula inputs:**
```sql
SELECT k.kpi_name, k.formula_expression, m.alias_name, t.tag_name
FROM kpi_config k
JOIN kpi_tag_mapping m ON k.id = m.kpi_id
JOIN tags t ON m.tag_id = t.id
WHERE k.is_active = true;
```

**Table sizes:**
```sql
SELECT relname AS table_name,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 10;
```

### UI Diagnostic Checks

1. **Live Monitor page:** Open browser DevTools > Network tab > filter by `ws`
   to confirm the WebSocket connection is established and receiving frames.
2. **Console errors:** Open DevTools > Console and look for red errors. Common
   ones include `Failed to fetch` (backend down) and `WebSocket connection
   failed` (proxy misconfiguration).
3. **Tag API quick check:** Navigate to
   `http://localhost:5000/api/live-monitor/tags?tags=FlowRate_2_521WE` in the
   browser. You should see a JSON response with `status: success` and a numeric
   value.
4. **Historian API quick check:** Navigate to
   `http://localhost:5000/api/historian/by-tags?tags=FlowRate_2_521WE&agg=last`
   to verify historical data is available.
5. **Emulator status:** In the frontend, look for the LiveDataIndicator
   (pulsing green dot = connected; amber = emulator off; red = error).
6. **Flask startup health:** After starting Flask, look for these four log
   lines confirming all workers are running:
   - `Starting dynamic tag realtime monitor`
   - `Starting dynamic monitor worker`
   - `Found N active monitor(s)`
   - `Starting dynamic archive worker`

---

See also: [API-ENDPOINTS](API-ENDPOINTS.md) | [DATABASE-SCHEMA](DATABASE-SCHEMA.md)
