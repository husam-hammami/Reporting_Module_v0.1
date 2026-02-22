# 04 -- Tag Grouping

Previous: [03-TAG-ENGINEERING](03-TAG-ENGINEERING.md) | Next: [05-TAG-MAPPING](05-TAG-MAPPING.md)

---

## What is Tag Grouping?

Individual tags are raw data points -- a temperature reading, a bin ID, or a flow rate. On their own, they have no organizational context. Tag grouping solves this by bundling related tags into named collections that carry semantic meaning.

A group called "FCL Sources" contains all the source bin tags for the First Cleaning Line. A group called "Energy" holds every power and energy consumption tag. Instead of working with hundreds of individual tags, engineers and the system itself work with these meaningful groups.

Groups are the building blocks of the entire reporting and monitoring system. When you add a table widget to a live monitor layout, you point it at a tag group. When the system needs to resolve dynamic rows for active source bins, it queries a tag group. Groups turn a flat list of tags into a structured, manageable system.

---

## Why Group Tags?

**Report sections are driven by groups.** When you add a Table widget in the Report Builder or Live Monitor designer, you select a tag group as its data source. The table columns are generated from the tags in that group. No group, no table.

**Live monitor sections map to groups.** The `live_monitor_table_config` table has a `tag_group_id` column that links each table section to its backing tag group. The section data resolver queries this group to know which tags to read and display.

**Dynamic rows depend on groups.** When a table is configured in `dynamic` row mode, the system iterates over the tag group members to discover active bins. Each member tag (e.g., `FCL_source_1_bin_id`) is checked for a non-zero value, and the system builds one row per active bin.

**Calculations can reference all tags in a group.** Formula tags and computed columns can operate across an entire group rather than being hard-coded to individual tags.

**Manageability at scale.** A typical plant installation has hundreds of PLC tags. Without grouping, configuring a report would mean selecting tags one by one from a massive flat list. Groups reduce this to selecting a single group name.

---

## Group Types

Groups are general-purpose containers -- the system does not enforce a fixed set of types. However, the following categories cover most real-world use cases:

### Sources

Tags that represent source bins feeding material into a process line. These are typically bin ID tags that the PLC writes when a feeder is active.

Example tags: `FCL_source_1_bin_id`, `FCL_source_2_bin_id`, `FCL_source_3_bin_id`, `FCL_source_4_bin_id`, `FCL_source_5_bin_id`

When a table section is set to `dynamic` row mode and linked to a Sources group, the section data resolver reads each member tag, checks for a non-zero bin ID value, and creates a row for each active source. The resolver then looks up material names and weights using the bin ID.

### Receivers

Tags that represent destination or output points where material arrives. These are the receiving end of a process flow.

Example tags: `Packing_Line_1_Weight`, `Packing_Line_2_Weight`, `Output_Bin_081`

### Setpoints

Target values used for process control. Operators configure these in the PLC, and the reporting system reads them for display alongside actual readings.

Example tags: `Moisture_Setpoint`, `Temperature_Setpoint`, `Target_Flow_Rate`

### Process Parameters

Live process readings that reflect the current state of the production line.

Example tags: `Flow_Rate`, `Temperature`, `Pressure`, `Moisture_Offset`, `Scale_Weight`

### Quality

Tags related to quality measurements taken during or after production.

Example tags: `Moisture_Content`, `Protein_Level`, `Ash_Content`, `Particle_Size`

### Energy

Power and energy consumption tags, often used for KPI calculations like specific energy consumption (kWh/t).

Example tags: `Active_Power_kW`, `Total_Energy_kWh`, `Reactive_Power_kVAr`

### Custom

Any grouping that does not fit the categories above. The system places no restrictions on how groups are organized -- engineers can create groups that match their plant's specific terminology and structure.

---

## Creating a Group

### Step-by-step

1. Navigate to **Engineering --> Tag Groups** in the application.
2. Click **Create Group**.
3. Fill in the group details:
   - **Group Name** -- A unique, descriptive name (e.g., "FCL Sources", "Mill Energy"). The name must be unique across the system.
   - **Description** -- Optional text explaining the group's purpose.
   - **Display Order** -- Integer controlling where this group appears in lists. Lower numbers appear first.
4. Add tags to the group by searching for and selecting existing tags. Tags must already exist in the system before they can be added to a group.
5. Arrange the display order of tags within the group. This order determines the column order when the group is used as a table data source.
6. Save the group.

### Important notes

- A tag can belong to multiple groups. The `tag_group_members` junction table allows many-to-many relationships.
- The `display_order` field on the membership record (not the tag itself) controls the tag's position within that specific group.
- Deleting a group is a soft delete -- it sets `is_active = false` rather than removing the record. This preserves referential integrity with historical data.

---

## How Groups Connect to Reports

This is the critical link between tag configuration and what users see on screen.

### The data flow

1. In the Live Monitor or Report Builder, an engineer adds a **Table** section to a layout.
2. The table section is linked to a tag group via the `live_monitor_table_config.tag_group_id` foreign key.
3. The table's **row mode** is set to either `Static` or `Dynamic`:
   - **Static**: The table has a fixed set of rows. Each column resolves its value by direct tag lookup.
   - **Dynamic**: The system queries the tag group members, reads each tag's current PLC value, and creates one row per active (non-zero) tag. This is how active source bin tables work.
4. The table's columns are defined in `live_monitor_columns`. Each column specifies a `source_type` (`Tag`, `Formula`, `Mapping`, or `Text`) and a `tag_name` pattern.
5. At runtime, the section data resolver reads the tag values and populates each cell.

### Column order follows group order

The `display_order` field on `tag_group_members` determines the sequence of tags within the group. When a table widget uses this group, the columns inherit this ordering. If an engineer reorders tags in the group, every table that references that group reflects the new order automatically.

### Changing a group updates all widgets

Because widgets reference groups by ID rather than embedding tag lists, adding or removing a tag from a group immediately affects every layout section that uses that group. This is a deliberate design choice -- it means one change propagates everywhere, which is efficient but requires care.

---

## For Developers

### API Endpoints

All endpoints are defined in `backend/tag_groups_bp.py` and registered on the Flask application.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/tag-groups` | List all tag groups. Accepts `?is_active=true\|false` query parameter. Returns groups with their member tags, ordered by `display_order` then `group_name`. |
| `POST` | `/tag-groups` | Create a new tag group. Body: `{ "group_name": "...", "description": "...", "display_order": 0, "is_active": true, "tag_names": ["tag1", "tag2"] }`. Tag names are resolved to IDs and inserted into `tag_group_members` with sequential display order. Returns `201` with the new `group_id`. |
| `GET` | `/tag-groups/<group_id>` | Get a single group with its member tags. Returns `404` if group not found. |
| `PUT` | `/tag-groups/<group_id>` | Update group metadata (name, description, display order, active status). Does not modify tag membership. |
| `DELETE` | `/tag-groups/<group_id>` | Soft-delete: sets `is_active = false`. |
| `POST` | `/tag-groups/<group_id>/tags` | Add tags to a group. Body: `{ "tag_names": ["tag1", "tag2"] }`. Uses `ON CONFLICT ... DO UPDATE SET display_order` to handle duplicates gracefully. |
| `DELETE` | `/tag-groups/<group_id>/tags/<tag_id>` | Remove a single tag from a group (hard delete of the membership row). |

### Database Tables

**`tag_groups`** -- Group definitions.

```
id             SERIAL PRIMARY KEY
group_name     VARCHAR(255) UNIQUE NOT NULL
description    TEXT
display_order  INTEGER DEFAULT 0
is_active      BOOLEAN DEFAULT true
created_at     TIMESTAMP DEFAULT NOW()
updated_at     TIMESTAMP DEFAULT NOW()
```

**`tag_group_members`** -- Junction table linking tags to groups.

```
id             SERIAL PRIMARY KEY
tag_id         INTEGER NOT NULL  --> REFERENCES tags(id) ON DELETE CASCADE
group_id       INTEGER NOT NULL  --> REFERENCES tag_groups(id) ON DELETE CASCADE
display_order  INTEGER DEFAULT 0
created_at     TIMESTAMP DEFAULT NOW()

UNIQUE(tag_id, group_id)
```

The `UNIQUE(tag_id, group_id)` constraint prevents the same tag from being added to the same group twice. The `ON DELETE CASCADE` on both foreign keys ensures that deleting a tag or group automatically cleans up the membership rows.

### Join Query Pattern

When the system needs to resolve a group into its tags, it runs this join (from `tag_groups_bp.py` and `section_data_resolver.py`):

```sql
SELECT t.id, t.tag_name, t.display_name, t.source_type,
       t.data_type, t.unit, t.is_active, tgm.display_order
FROM tags t
JOIN tag_group_members tgm ON t.id = tgm.tag_id
WHERE tgm.group_id = %s
ORDER BY tgm.display_order, t.tag_name
```

This pattern appears in multiple places across the codebase:
- `tag_groups_bp.py` -- API responses
- `section_data_resolver.py` -- Runtime data resolution for live monitor sections
- `layout_tag_extractor.py` -- Pre-extracting the set of tags a layout needs to read from the PLC

### How section_data_resolver.py Uses Groups

The `resolve_section_data()` function in `section_data_resolver.py` is the core of group-to-data resolution:

1. It reads the `live_monitor_table_config` for the section to get the `tag_group_id` and `row_mode`.
2. If `row_mode` is `dynamic`, it queries `tag_group_members` joined with `tags` to get all member tag names.
3. It iterates over the member tags, looks up each tag's current value in the `tag_values` dictionary, and filters for non-zero bin IDs.
4. For each active bin ID, it builds a row by resolving columns through `resolve_column_value()`, which handles pattern-based tag names (e.g., `{bin_id}` placeholders), direct lookups, material name resolution, and weight resolution.
5. The resulting array of row objects is returned under a `_dynamic_rows` key, which `get_layout_sections_data()` converts into the final section data structure.

For static row mode, the resolver simply iterates over the columns and resolves each one by direct tag name lookup against the `tag_values` dictionary.

---

Previous: [03-TAG-ENGINEERING](03-TAG-ENGINEERING.md) | Next: [05-TAG-MAPPING](05-TAG-MAPPING.md)
