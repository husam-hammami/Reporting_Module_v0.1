# 15 — Multi-Site Setup

## Overview

The Reporting Module supports monitoring multiple production lines, mills, or even separate plant sites from a single deployment. Each plant area is represented as a **Report Type** (a published layout in Live Monitor) with its own tags, layouts, and data.

For example, a grain terminal might have:

- **Grain Terminal — Ship Unloading** (one report type)
- **Grain Terminal — Silo Storage** (another report type)
- **Milling Line A** (a third report type)

Each report type operates independently with its own tag configuration, data collection, and dashboard layout, while sharing a common set of users, authentication, and system settings.

---

## Current Architecture

```
┌──────────────────────────────────────────────────┐
│              Single PostgreSQL Database            │
│              (dynamic_db_hercules)                 │
│                                                    │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Report     │  │ Report     │  │ Report     │  │
│  │ Type A     │  │ Type B     │  │ Type C     │  │
│  │            │  │            │  │            │  │
│  │ - Tags     │  │ - Tags     │  │ - Tags     │  │
│  │ - Groups   │  │ - Groups   │  │ - Groups   │  │
│  │ - Mappings │  │ - Mappings │  │ - Mappings │  │
│  │ - Layout   │  │ - Layout   │  │ - Layout   │  │
│  │ - History  │  │ - History  │  │ - History  │  │
│  └────────────┘  └────────────┘  └────────────┘  │
│                                                    │
│  Shared: Users, Roles, System Settings, Shifts     │
└──────────────────────────────────────────────────┘
```

Key points:

- **Single PostgreSQL database** — all report types coexist in `dynamic_db_hercules`.
- **Each report type has its own:** tags, tag groups, tag group members, bin mappings, report layouts (via `live_monitor_layouts`), and KPI configurations.
- **Shared across all report types:** users, roles, system settings, shift schedules, and SMTP configuration.
- **Data isolation is tag-based** — historical data is stored per-tag in `tag_history` and `tag_history_archive`. Since each report type uses different tags, their data is naturally isolated.

---

## Adding a New Plant / Production Line

Follow these steps to add a new production line to an existing deployment.

### Step 1: Create Report Type (Layout)

In the frontend, navigate to **Report Builder** and create a new layout:

1. Click **New Report** or **New Layout**.
2. Name it descriptively (e.g., "Milling Line B" or "Ship Unloader 2").
3. Save the empty layout. This becomes the new report type that will hold its own tags and configuration.

### Step 2: Configure PLC Connection

Determine whether the new production line uses the same PLC or a different one:

- **Same PLC, different addresses:** No PLC configuration changes needed. The new tags will simply reference different DB numbers, byte offsets, or bit positions on the existing PLC.
- **Different PLC:** Add the new PLC's connection settings through **Engineering > System**. Update `backend/config/plc_config.json` or configure through the UI:

```json
{
  "ip": "192.168.23.12",
  "rack": 0,
  "slot": 3
}
```

> **Note:** If the system needs to connect to multiple PLCs simultaneously, each tag can reference which PLC it belongs to. The backend's `tag_reader` reads from the configured PLC. For multiple PLCs, see the [Multiple PLCs](#multiple-plcs) section below.

### Step 3: Create Tags

Navigate to **Engineering > Tags** and add all tags for the new production line:

1. Click **Add Tag** for each measurement point.
2. Configure each tag with:
   - **Name:** Descriptive name (e.g., "Mill_B_Motor_Speed")
   - **PLC Address:** DB number, byte offset, data type
   - **Unit:** Engineering unit (RPM, tonnes/hr, etc.)
   - **Is Counter:** Whether this tag tracks a cumulative value
   - **Value Formula:** Optional calculation formula (e.g., `x * 0.1` for scaling)
3. Alternatively, import tags from a CSV/Excel file via **Engineering > Tags > Import**.

### Step 4: Create Tag Groups

Navigate to **Engineering > Tag Groups** and organize the new tags:

1. Create groups for logical categories:
   - **Sources** — input hoppers, feeders, conveyors
   - **Receivers** — output bins, silos, destinations
   - **Process** — motor speeds, pressures, temperatures
   - **Energy** — power consumption, current draw
2. Assign tags to their respective groups.
3. Tag groups are used by the Report Builder to organize widgets on the dashboard.

### Step 5: Set Up Bin Mappings

If the new line has bins or silos that need material tracking:

1. Navigate to **Engineering > Mappings**.
2. Create material definitions if new materials are involved.
3. Assign bins to materials for the new production line.
4. Configure bin activation tags if the new line has automated bin selection.

### Step 6: Build Report Layout

Navigate to **Report Builder** and design the dashboard for the new line:

1. Open the layout created in Step 1.
2. Add widgets: KPI cards, tables, silo visualizations, charts.
3. Assign tags from Step 3 to each widget.
4. Configure sections and columns for the desired layout.
5. Preview with live data to verify correctness.
6. **Publish** the layout to enable data collection by the dynamic monitor worker.

### Step 7: Configure Shifts (if Different)

If the new production line operates on a different shift schedule:

1. Navigate to **Engineering > Shifts**.
2. The current system uses a global shift schedule shared across all lines.
3. If the new line's shifts differ, coordinate with existing lines or plan for per-site shift configuration (see [Future: True Multi-Tenant](#future-true-multi-tenant)).

### Step 8: Test

1. **Demo mode:** If the new line's PLC is not yet connected, use demo mode. The emulator generates realistic simulated values for all configured tags.
2. **Verify data flow:** Open the new layout in **Reporting** view. Confirm tags are updating.
3. **Check historian:** After a few minutes, verify historical data is being recorded:

```bash
psql -U postgres -h 127.0.0.1 -d dynamic_db_hercules \
  -c "SELECT tag_name, COUNT(*) FROM tag_history WHERE tag_name LIKE 'Mill_B_%' GROUP BY tag_name;"
```

4. **WebSocket:** Confirm the LiveDataIndicator (pulsing green dot) appears in the Report Builder Preview.

---

## Data Isolation

Tags are the fundamental unit of data isolation between production lines:

| Data Type | Isolation Mechanism |
|-----------|-------------------|
| **Live values** | Each tag has a unique name and PLC address. The tag reader returns values per-tag. |
| **Tag history** | `tag_history` stores rows with `tag_name` and `tag_id`. Each line's tags produce their own history rows. |
| **Archived data** | `tag_history_archive` aggregates per-tag hourly. No cross-contamination between lines. |
| **Report views** | Layouts reference specific tags. A "Milling Line B" layout only shows Milling Line B tags. |
| **KPIs** | KPI configurations are tied to specific tags and layouts. |
| **Orders** | Orders are tracked per published layout via `dynamic_orders` and `dynamic_order_counters`. |

There is no risk of data cross-contamination between production lines because every data record references a specific tag, and tags are assigned to specific layouts/report types.

---

## Shared vs Per-Plant Configuration

| Configuration | Scope | Notes |
|--------------|-------|-------|
| **Users & Roles** | Global (shared) | All users can access all report types. Role-based access (admin, manager, operator) applies globally. |
| **PLC Connections** | Per-PLC | A single PLC can serve multiple lines. Multiple PLCs can coexist. |
| **Tags** | Per-Report-Type | Each tag belongs to a specific production line. Tag names should include a line prefix for clarity. |
| **Tag Groups** | Per-Report-Type | Groups organize tags within a single line. |
| **Bin Mappings** | Per-Report-Type or Global | Materials are global; bin-to-material assignments can be per-line. |
| **Report Layouts** | Per-Report-Type | Each layout is an independent dashboard. |
| **KPI Definitions** | Per-Report-Type | KPIs reference specific tags from a specific line. |
| **Shifts** | Global | Currently shared across all lines. Per-site shifts planned for a future release. |
| **SMTP / Email** | Global | One email configuration for the entire system. |
| **System Settings** | Global | Demo mode, PLC config apply system-wide. |

---

## Multiple PLCs

The system supports connecting to multiple Siemens PLCs:

### Configuration

Each PLC has its own IP address, rack number, and slot number:

```
PLC 1: 192.168.23.11, rack 0, slot 3  (Grain Terminal)
PLC 2: 192.168.23.12, rack 0, slot 3  (Milling Line A)
PLC 3: 192.168.24.10, rack 0, slot 2  (Milling Line B — different subnet)
```

### Tag-to-PLC Mapping

Tags reference which PLC they read from. When configuring tags in Engineering, specify the correct PLC address (DB number, byte offset) for the tag's PLC. The backend's `tag_reader` utility handles reading values from the configured PLC connection.

### Network Requirements

The backend server must have network access to **all** PLCs:

- Same subnet or routable network path to each PLC.
- TCP port 102 must be open (snap7/ISO-on-TCP).
- If PLCs are on different subnets (e.g., 192.168.23.x and 192.168.24.x), the server needs routes or multiple network interfaces.

### Polling Architecture

```
Backend Server
  └── tag_reader.py
       ├── PLC 1 (192.168.23.11) ── tags for Grain Terminal
       ├── PLC 2 (192.168.23.12) ── tags for Milling Line A
       └── PLC 3 (192.168.24.10) ── tags for Milling Line B
```

The system polls all configured PLCs on every cycle (approximately 1 second). Each additional PLC adds to the total poll time. Monitor the cycle time in the backend logs to ensure it stays under 1 second.

---

## Scaling Considerations

### Small Deployment (2-5 Production Lines)

- **Architecture:** Single database, single backend server.
- **Performance:** No issues expected. Even with 5 lines at 100 tags each (500 total tags), the historian writes approximately 500 rows/second -- well within PostgreSQL's capacity.
- **Recommended server:** 4 CPU cores, 8 GB RAM, SSD storage.

### Medium Deployment (5-20 Production Lines)

- **Architecture:** Single database, single backend server with optimization.
- **Performance considerations:**
  - Add indexes on `tag_history` for faster queries:

    ```sql
    CREATE INDEX idx_tag_history_tag_recorded ON tag_history(tag_id, recorded_at);
    CREATE INDEX idx_tag_history_layout_recorded ON tag_history(layout_id, recorded_at);
    ```

  - Configure data retention: archive old data more aggressively.
  - Monitor disk usage: 1000 tags at 1-second intervals generates approximately 86 million rows/day in `tag_history`.
  - Set up partitioning on `tag_history` by date for faster deletes and queries.
- **Recommended server:** 8 CPU cores, 16 GB RAM, fast SSD, dedicated PostgreSQL tuning.

### Large Deployment (20+ Lines or Multiple Remote Sites)

- **Architecture:** Consider separate database instances per site, with a shared frontend or centralized management dashboard.
- **Options:**
  1. **Separate backend + database per site** — each site runs its own independent instance. Simplest to manage but no cross-site view.
  2. **Shared frontend, per-site backends** — a central Nginx routes to different backends based on URL path or subdomain.
  3. **Database-per-site with federation** — each site has its own PostgreSQL, with a central aggregation layer for cross-site reporting.
- **Recommended:** Start with option 1 (independent instances per site) and add cross-site reporting as needed.

### Performance Guidelines

| Metric | Target | Action if Exceeded |
|--------|--------|--------------------|
| Monitor worker cycle time | < 1 second | Reduce tag count or optimize PLC reads |
| `tag_history` table size | < 100 million rows | Enable retention policy, increase archive frequency |
| Database disk usage | < 80% capacity | Add storage, clean old data |
| Backend memory | < 2 GB | Check for connection pool leaks, restart if needed |
| API response time | < 500ms | Add database indexes, check query plans |

---

## Future: True Multi-Tenant

The current architecture uses **report-type-based isolation** within a single database. This works well for small-to-medium deployments (up to approximately 20 production lines). Future enhancements are planned for larger or more complex deployments:

| Feature | Current State | Planned |
|---------|--------------|---------|
| **Data isolation** | Tag-based within single database | Database-per-site for complete isolation |
| **User access** | All users see all report types | Per-site user permissions (user can only see their assigned sites) |
| **Shift schedules** | Global (one schedule for all) | Per-site shift configuration |
| **PLC management** | Single system-wide PLC config | Per-site PLC connection management in UI |
| **Cross-site dashboard** | Not available | Central management dashboard showing KPIs from all sites |
| **Deployment** | Single server | Distributed deployment with per-site backend instances |

### Migration Path

When upgrading from single-database to database-per-site:

1. Export each report type's tags, groups, and mappings.
2. Create a new database instance for each site.
3. Import the site-specific data into its dedicated database.
4. Point each site's backend instance at its own database.
5. Historical data can be migrated by filtering `tag_history` on `tag_id`.

---

Previous: [14-DEPLOYMENT](14-DEPLOYMENT.md)
