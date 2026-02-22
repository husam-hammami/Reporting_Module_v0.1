# 05 -- Tag Mapping

Previous: [04-TAG-GROUPING](04-TAG-GROUPING.md) | Next: [06-FORMULAS-AND-CALCULATIONS](06-FORMULAS-AND-CALCULATIONS.md)

---

## What is Tag Mapping?

Tag mapping connects raw PLC values to human-readable information. PLCs communicate in numbers -- integers, floats, and bit flags. A PLC does not send "Wheat Flour Grade A"; it sends the number `29`. The mapping system translates that number into the material name that operators and reports need to display.

The most common use case is **bin-to-material mapping**: the PLC writes a bin number (e.g., `29`) into a source tag, and the mapping table tells the system that Bin 29 currently contains "SEMI-115" or "Wheat Flour Grade A". Without mapping, reports and live monitors would show meaningless numbers.

Mapping also handles special encoding conventions. The Salalah plant's PLCs use a scheme where bin code `211` maps to bin `21A`, `212` maps to `21B`, and `213` maps to `21C`. The mapping layer absorbs this complexity so the rest of the system works with clean, readable names.

---

## Bin-to-Material Mapping

### The data model

Two database tables drive bin-to-material mapping:

**`materials`** -- The master list of materials handled by the plant.

```
id             SERIAL PRIMARY KEY
material_name  VARCHAR(100) NOT NULL    -- e.g., "Wheat Flour Grade A"
material_code  VARCHAR(50) NOT NULL     -- e.g., "115"
category       VARCHAR(50) NOT NULL     -- "IN", "OUT", or "IN,OUT"
is_released    BOOLEAN DEFAULT TRUE
```

**`bins`** -- Physical storage bins, each linked to the material they currently hold.

```
id             SERIAL PRIMARY KEY
bin_name       VARCHAR(50) NOT NULL     -- e.g., "Bin 29"
bin_code       VARCHAR(50) NOT NULL     -- e.g., "29", "21A"
material_id    INTEGER REFERENCES materials(id)
```

The `bins.material_id` foreign key is the mapping itself. When Bin 29 is loaded with material ID 5 ("Wheat Flour Grade A"), any tag that reads a bin ID of `29` can be resolved to that material name through a simple join.

### Setting up mappings

1. Navigate to **Admin --> Materials** and ensure all materials are defined with their names, codes, and categories (IN for raw materials, OUT for finished products, or both).
2. Navigate to **Admin --> Bins** (the Bin Master page).
3. Each row represents a physical bin. Set the **Material** column to the material currently stored in that bin.
4. When bin assignments change on the plant floor (e.g., Bin 29 is emptied and refilled with a different material), update the mapping here. The system also supports updating mappings via PLC writes through the `/assign-bin` endpoint.

### Bin code formatting

The system handles several bin code formats:

| Raw Code | Formatted Code | PLC Offset Key |
|----------|---------------|----------------|
| `21` | `Bin_0021` | 400 |
| `21A` | `Bin_021A` | 22 |
| `21B` | `Bin_021B` | 148 |
| `21C` | `Bin_021C` | 274 |
| `29` | `Bin_0029` | 1408 |
| `81` | `Bin_0081` | 3928 |

Numeric codes are zero-padded to 4 digits. Codes ending with a letter use 3-digit padding plus the letter suffix.

---

## How Mapping Works at Runtime

### The data flow

Here is the complete path from PLC read to displayed material name:

1. **PLC tag read.** The tag reader (`tag_reader.py`) reads a bin ID tag from the PLC. For example, `FCL_source_1_bin_id` returns the integer value `29`.

2. **PLC-to-database code conversion.** Some PLC bin IDs use a numeric encoding for lettered bins. The `convert_plc_bin_to_db_code()` function handles this:
   - `211` converts to `21A`
   - `212` converts to `21B`
   - `213` converts to `21C`
   - All other values pass through unchanged.

3. **Database lookup.** The system queries the `bins` table joined with `materials`:
   ```sql
   SELECT b.id, b.bin_name, b.bin_code, b.material_id,
          m.material_name, m.material_code
   FROM bins b
   LEFT JOIN materials m ON b.material_id = m.id
   ```
   A lookup map is built keyed by both integer ID and string bin code, so lookups work regardless of whether the caller uses `29`, `"29"`, or `"21A"`.

4. **Material name injection.** Once the material is found, the system generates a new virtual tag name by replacing `BinId` or `bin_id` in the original tag name with `MaterialName` or `material_name`. For example:
   - `FCL_source_1_bin_id` generates `FCL_source_1_material_name`
   - `Sender1BinId` generates `Sender1MaterialName`

   Both the material name and material code are injected into the tag values dictionary, making them available to any downstream consumer (live monitor, report, formula).

5. **Display.** The live monitor or report table shows "Wheat Flour Grade A" instead of `29`.

### The enrichment function

The `enrich_bin_tags_with_materials()` function in `tag_reader.py` implements steps 2-4. It:

- Scans all tag values for tags whose names contain `binid`, `bin_id`, `bin_code`, or `bincode` (case-insensitive).
- Also identifies potential bin ID tags by value heuristics: numeric, greater than 0, less than 10000, and equal to its integer form.
- Builds the bin lookup map from the database.
- For each identified bin tag, looks up the material and injects `MaterialName` and `MaterialName_Code` virtual tags.

This function was part of the main `read_all_tags()` pipeline but is currently noted as legacy (`bin enrichment removed` comment). The dynamic section data resolver (`section_data_resolver.py`) handles material name resolution directly for live monitor sections.

---

## Active Source Detection

Active source detection answers the question: "Which bins are currently feeding material into the production line?"

### How it works

There are two patterns used in the system:

**Pattern 1: Multiple source tags with bin IDs (current system)**

Each source slot on the production line has its own PLC tag that holds the bin ID of the bin currently feeding that slot. A tag group called "FCL Sources" contains these tags:

- `FCL_source_1_bin_id`
- `FCL_source_2_bin_id`
- `FCL_source_3_bin_id`
- `FCL_source_4_bin_id`
- `FCL_source_5_bin_id`

At any moment, some of these tags hold non-zero values (meaning a bin is actively feeding) and others hold zero (slot is inactive). The section data resolver in `section_data_resolver.py` iterates over the tag group members, reads each value, and builds a row only for tags with non-zero bin IDs:

```python
for tag_name in tag_group_members:
    if tag_name in tag_values:
        bin_id = tag_values[tag_name]
        if bin_id and bin_id != 0:
            bin_ids_map[bin_id] = tag_name
```

Multiple sources can be active simultaneously. A typical FCL (First Cleaning Line) run might have 2-4 source bins feeding material at the same time, each contributing a percentage of the total flow.

**Pattern 2: Boolean activation tags (extended system)**

The `tags` table includes optional activation fields added by the `add_bin_activation_fields` migration:

- `is_bin_tag` (BOOLEAN) -- Marks a tag as representing a bin ID.
- `activation_tag_name` (VARCHAR) -- The name of a separate boolean tag to check (e.g., `flap_1_selected`).
- `activation_condition` (VARCHAR) -- How to evaluate: `equals`, `not_equals`, `true`, `false`, `greater_than`, `less_than`.
- `activation_value` (VARCHAR) -- The value to compare against.

This pattern supports cases where a bin's active state is controlled by a separate boolean tag (e.g., a flap selector) rather than being implied by a non-zero bin ID.

### Active source data in storage

When the historian records data, active sources are stored as a JSONB column (`active_sources`) in the dynamic live and archive tables. Each entry in the array contains:

- `source_index` -- Slot number (1-5)
- `is_active` -- Boolean from PLC bit flag
- `bin_id` -- Raw bin ID from PLC
- `qty_percent` -- Percentage contribution of this source
- `produced_qty` -- Cumulative quantity produced from this source
- `prd_code` -- Product/material code
- `weight` -- Flow rate reading (t/h)

This structure allows historical reports to reconstruct which bins were feeding at any point in time.

---

## Report-Type-Specific vs Global Mappings

### Global mappings

By default, bin-to-material mappings in the `bins` and `materials` tables are global. Bin 29 maps to the same material regardless of which report type or production line is viewing it. This is the correct approach when all lines share the same physical bins.

### Per-report-type behavior

Different production lines (FCL, SCL, MILA) may read from different sets of bins or interpret bin IDs differently. The system handles this not through separate mapping tables, but through:

1. **Separate tag groups per line.** The FCL Sources group contains `FCL_source_1_bin_id` through `FCL_source_5_bin_id`. The SCL Sources group contains `SCL_source_1_bin_id` through `SCL_source_3_bin_id`. Each group references only the bins relevant to that line.

2. **Line-specific flow rate tag patterns.** The weight/flow data for FCL uses patterns like `FCL_Source_bin_29` while SCL uses patterns like `027_2_786WE`. The section data resolver's `resolve_weight_value()` function tries multiple naming patterns to find the correct weight tag for a given bin ID.

3. **PLC-specific bin code conventions.** The `convert_plc_bin_to_db_code()` function handles the FCL's `211/212/213 --> 21A/21B/21C` encoding. Other lines may use different conventions, and the conversion logic can be extended per report type.

### Configuring per-line behavior

To set up a new production line's bin mapping:

1. Create the line's source tags in Tag Engineering (e.g., `NEWLINE_source_1_bin_id`).
2. Create a tag group for those source tags (e.g., "NEWLINE Sources").
3. Ensure the physical bins used by this line exist in the Bins table with correct material assignments.
4. Link the tag group to the line's live monitor table section via `live_monitor_table_config.tag_group_id`.

The bins and materials themselves remain global -- only the grouping and tag naming differ per line.

---

## For Developers

### Key Functions in tag_reader.py

**`enrich_bin_tags_with_materials(tag_values, db_connection_func)`**

The main enrichment function. Takes a dictionary of tag values, identifies bin ID tags by name pattern or value heuristics, looks up materials from the database, and returns an enriched copy with `MaterialName` and `MaterialName_Code` virtual tags added.

Key implementation details:
- Builds a `bin_lookup` map keyed by both integer ID and string bin code.
- Uses `convert_plc_bin_to_db_code()` for the `211-->21A` encoding.
- Generates material tag names by string replacement: `bin_id` becomes `material_name`, `BinId` becomes `MaterialName`.
- Falls back gracefully if the `bins` or `materials` tables do not exist (logs a warning once, returns original values).

**`convert_plc_bin_to_db_code(plc_bin_id)`**

Converts PLC numeric bin IDs to database bin code format:
- Input `211` returns `"21A"` (210-219 range: last digit 1=A, 2=B, 3=C)
- Input `29` returns `29` unchanged

### Key Functions in section_data_resolver.py

**`resolve_material_name(source_tag_name, bin_id, tag_values)`**

Given a source tag name like `FCL_source_1_bin_id` and a bin ID, searches the `tag_values` dictionary for matching material name tags. Tries multiple naming patterns:
- `FCL_source_1_material_name`
- `FCL_source_1_MaterialName`
- `FCL_SOURCE_1_MATERIAL_NAME`
- Variants with `_Code` suffix

Returns `"N/A"` if no material name is found.

**`resolve_weight_value(source_tag_name, bin_id, tag_values)`**

Resolves the weight/flow rate for a bin. Tries bin-based patterns first (`FCL_Source_bin_29`), then source-number-based patterns (`FCL_source_1_weight`). Handles the special `21A/21B/21C` bin codes. Returns the weight as a float or `None`.

**`resolve_column_value(column, tag_values, bin_id, tag_group_members)`**

General-purpose column resolver that handles all source types:
- `tag` -- Direct tag lookup with support for `{tag_name}` and `{bin_id}` placeholder patterns.
- `formula` -- Evaluates a formula expression against tag values.
- `mapping` -- Returns the mapping name (future enhancement point).
- `text` -- Returns a static text value.
- `bin_id` -- Returns the bin ID directly.

### Database Tables

**`bins`** -- Physical bin definitions.

```sql
CREATE TABLE bins (
    id           SERIAL PRIMARY KEY,
    bin_name     VARCHAR(50) NOT NULL,
    bin_code     VARCHAR(50) NOT NULL,
    material_id  INTEGER REFERENCES materials(id)
);
CREATE INDEX idx_bins_material_id ON bins(material_id);
CREATE INDEX idx_bins_bin_code ON bins(bin_code);
```

**`materials`** -- Material definitions.

```sql
CREATE TABLE materials (
    id             SERIAL PRIMARY KEY,
    material_name  VARCHAR(100) NOT NULL,
    material_code  VARCHAR(50) NOT NULL,
    category       VARCHAR(50) NOT NULL,
    is_released    BOOLEAN DEFAULT TRUE
);
```

**`tags` activation columns** (added by migration `add_bin_activation_fields.sql`):

```sql
ALTER TABLE tags ADD COLUMN is_bin_tag BOOLEAN DEFAULT FALSE;
ALTER TABLE tags ADD COLUMN activation_tag_name VARCHAR(255);
ALTER TABLE tags ADD COLUMN activation_condition VARCHAR(50);
ALTER TABLE tags ADD COLUMN activation_value VARCHAR(255);
```

### API Endpoints for Bins and Materials

These endpoints are defined in the legacy application layer (`app_legacy.py`) and the main `app.py`:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/materials` | List all materials with id, name, code, category, and release status. |
| `GET` | `/material/<id>` | Get a single material by ID. |
| `POST` | `/add-material` | Create a new material. Body: `{ "materialName", "materialCode", "categoryIN", "categoryOUT", "isReleased" }`. |
| `POST` | `/update-material` | Update an existing material. Body includes `materialId`. |
| `DELETE` | `/delete-material/<id>` | Delete a material by ID. |
| `GET` | `/bins` | List all bins with their assigned material names and codes (joins bins with materials). Ordered by `bin_code`. |
| `POST` | `/assign-bin` | Assign materials to bins and write the assignment to the PLC. Body: `{ "assignments": [{ "bin_id": 1, "material_id": 5 }] }`. Updates both the database and the PLC data block. |

### Dynamic Archive Tables

The dynamic live and archive tables (created by `utils/dynamic_tables.py`) include an `active_sources` JSONB column that stores the complete active source state at each recording interval:

```sql
CREATE TABLE <report_type>_live (
    id SERIAL PRIMARY KEY,
    layout_id INTEGER NOT NULL,
    order_name TEXT,
    tag_values JSONB NOT NULL DEFAULT '{}',
    computed_values JSONB DEFAULT '{}',
    active_sources JSONB DEFAULT '{}',
    line_running BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

The archive table adds `per_bin_weights` (JSONB) and `archive_hour` (TIMESTAMP) for hourly aggregation.

---

Previous: [04-TAG-GROUPING](04-TAG-GROUPING.md) | Next: [06-FORMULAS-AND-CALCULATIONS](06-FORMULAS-AND-CALCULATIONS.md)
