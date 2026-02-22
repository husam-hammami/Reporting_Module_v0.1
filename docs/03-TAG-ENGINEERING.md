# 03 -- Tag Engineering

This document covers how to create, configure, import, and manage tags in the Reporting Module. Tags are the fundamental data elements that drive everything -- dashboards, reports, formulas, and alerts all operate on tags.

---

## 1. What is a Tag?

A **tag** is a named reference to a specific data point. Every piece of data the system reads, calculates, or displays is a tag. A tag has:

- A **unique name** (`tag_name`) used internally by the system (e.g., `Temperature_1`)
- A **display name** shown in the UI (e.g., "Temperature Sensor 1")
- A **source type** that determines where the value comes from
- A **current value** that is read or computed in real time

Think of a tag as a named channel: the name stays the same, but the value updates continuously as the system polls the PLC or recalculates formulas.

---

## 2. Tag Source Types

Every tag has a `source_type` that determines how its value is obtained.

### 2.1 PLC Tags

**Source type:** `PLC`

PLC tags read their value directly from a Siemens S7 PLC at a specific memory address. You must configure the DB number, byte offset, data type, and optionally the bit offset (for BOOL tags). This is the most common tag type -- it represents a physical sensor, actuator status, or process measurement.

**Example:** A temperature sensor at DB2099 byte offset 0 with data type REAL.

### 2.2 Formula Tags

**Source type:** `Formula`

Formula tags compute their value from other tags using mathematical expressions. The formula references other tags by name using curly-brace syntax: `{tag_name}`. At read time, the system resolves all referenced tag values and evaluates the expression.

**Example:** Milling loss calculated as `100 - {Flour_Extraction} - {Bran_Extraction}`.

Formula tags support standard arithmetic operators (`+`, `-`, `*`, `/`) and math functions (`abs`, `round`, `sqrt`, `sin`, `cos`, `log`, `pow`, etc.).

### 2.3 Mapping Tags

**Source type:** `Mapping`

Mapping tags derive a value by looking up another tag's value in a defined mapping table. This is commonly used to convert numeric codes into meaningful names -- for example, converting a bin ID number read from the PLC into the material name stored in that bin.

**Example:** A PLC tag reads bin code `21`, and the mapping resolves it to "Wheat Flour Type 55."

### 2.4 Manual Tags

**Source type:** `Manual`

Manual tags hold a value entered by a user through the UI. They are useful for data points that are not available from the PLC -- such as lab test results, manual quality readings, or operator notes. In demo mode, the system generates simulated values for Manual tags so that dashboards and reports display realistic data without user intervention.

---

## 3. Creating a PLC Tag

### 3.1 Step-by-Step

1. Navigate to **Engineering --> Tags** in the web interface.
2. Click the **"Add Tag"** button.
3. Fill in the tag configuration fields (see section 3.2).
4. Click **Save**.
5. Use the **"Read Test"** button to verify that the tag reads the correct value from the PLC.

### 3.2 Field Reference

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| **tag_name** | Yes | Unique identifier. No spaces; use underscores. This is the internal key used in formulas, reports, and the API. | `Temperature_1` |
| **display_name** | No | Human-readable label shown in dashboards and reports. Defaults to `tag_name` if not set. | `Temperature Sensor 1` |
| **source_type** | Yes | How the value is obtained. Select `PLC` for a hardware tag. | `PLC` |
| **plc_address** | Yes (PLC) | The PLC memory address in `DB<number>.<offset>` format, or `DB<number>.<offset>.<bit>` for BOOL. | `DB2099.0` |
| **data_type** | Yes | The PLC data type. Must be one of: `BOOL`, `INT`, `DINT`, `REAL`, `STRING`. | `REAL` |
| **bit_position** | BOOL only | For BOOL tags, which bit (0-7) within the byte. Ignored for other types. | `0` |
| **unit** | No | Engineering unit displayed alongside the value. | `degC`, `bar`, `t/h`, `%`, `kW`, `RPM` |
| **scaling** | No | Multiplier applied to the raw PLC value. Default `1.0`. Use this for simple linear conversions (e.g., `0.001` to convert grams to kilograms). | `1.0` |
| **value_formula** | No | Advanced transformation formula using the variable `value` for the raw reading. Overrides `scaling` when set. | `value * 0.277778` |
| **decimal_places** | No | Number of decimal places for rounding the displayed value. Default `2`. | `1` |
| **byte_swap** | REAL only | Whether to reverse the byte order before parsing. Default `false` (big-endian, standard for Siemens). Set to `true` only if REAL values appear as garbage. | `false` |
| **string_length** | STRING only | Maximum character length for STRING tags. Default `40`. | `40` |
| **description** | No | Free-text description of what this tag measures. | `Main process temperature` |
| **is_active** | No | Whether the tag is enabled. Default `true`. Inactive tags are not read from the PLC. | `true` |
| **is_bin_tag** | No | Whether this tag represents a bin identifier (used for material mapping). | `false` |
| **activation_tag_name** | No | For bin tags: the name of another tag that controls whether this bin is active. | `Bin1_Active` |
| **activation_condition** | No | The condition to evaluate against the activation tag. Options: `equals`, `not_equals`, `true`, `false`, `greater_than`, `less_than`. | `equals` |
| **activation_value** | No | The expected value for the activation condition. | `1` |

### 3.3 Finding the Correct PLC Address

The PLC address must match exactly what is defined in the TIA Portal project. To find the right address:

1. **Ask the PLC programmer** for the DB number and variable offset for the signal you need.
2. **Use a TIA Portal export** -- see [TIA_TAGS_IMPORT.md](TIA_TAGS_IMPORT.md) for how to export the symbol table and import tags in bulk.
3. **Check the PLC documentation** or commissioning sheets, which typically list DB numbers and their contents.

The address format used in the Reporting Module is simplified compared to TIA Portal notation:

| What you need | TIA Portal shows | You enter |
|---------------|------------------|-----------|
| REAL at DB199, offset 20 | `DB199.DBD20` | `DB199.20` |
| INT at DB199, offset 20 | `DB199.DBW20` | `DB199.20` |
| BOOL at DB104, byte 552, bit 0 | `DB104.DBX552.0` | `DB104.552.0` |

The data type is specified separately in the `data_type` field, so the address itself only needs the DB number, byte offset, and (for BOOL) bit offset.

### 3.4 Testing a Tag

After creating a tag, use the **Read Test** feature to verify it:

1. Find the tag in the tag list.
2. Click the **"Test"** button (or navigate to the tag's test endpoint).
3. The system will attempt a live read from the PLC and display:
   - **raw_value**: The value read directly from the PLC memory
   - **value**: The final value after applying scaling or value_formula
   - **unit**: The configured engineering unit
   - **plc_address**: The address that was read

If the test returns an error, check the troubleshooting section below.

---

## 4. Common Address Mistakes

These are the most frequent configuration errors when setting up PLC tags. If a tag is not reading correctly, check this list first.

### 4.1 Wrong Byte Offset

**Symptom:** The tag reads a value, but it is wrong or makes no physical sense.

**Cause:** The byte offset is incorrect -- perhaps off by 1, or you used a bit number where a byte number was expected. Remember that offsets are always in **bytes**, not bits.

**Fix:** Double-check the offset in the TIA Portal project. Make sure you are reading the variable definition, not an adjacent one.

### 4.2 Forgetting Bit Offset for BOOL Tags

**Symptom:** A BOOL tag always reads `false` (or reads the wrong bit).

**Cause:** BOOL tags require both a byte offset and a bit offset (0-7). If the bit offset is missing, the system defaults to bit 0, which may not be the correct bit.

**Fix:** Add the bit offset to the PLC address: `DB100.22.3` for bit 3 of byte 22. Or set the `bit_position` field explicitly when creating the tag.

### 4.3 Wrong Data Type

**Symptom:** The value is wildly incorrect (e.g., reading 1,092,616,192 instead of 45.5).

**Cause:** The data type does not match what the PLC stores. Reading 4 bytes as INT (which only uses 2 bytes) or reading a REAL as DINT will produce nonsensical numbers.

**Fix:** Verify the data type in TIA Portal. Common confusions:
- **INT vs DINT**: INT is 2 bytes, DINT is 4 bytes. Using the wrong one shifts the byte boundaries.
- **INT vs REAL**: Both can occupy similar offset ranges, but REAL is floating-point while INT is integer.
- **REAL vs DINT**: Both are 4 bytes, but REAL is IEEE 754 float and DINT is signed integer. A float value read as DINT (or vice versa) will be garbage.

### 4.4 REAL Values Showing Garbage

**Symptom:** A REAL tag displays an impossibly large or small number, `NaN`, or `Inf`.

**Cause:** Byte order mismatch. Siemens PLCs store REAL values in big-endian byte order by default, but some configurations or firmware versions may use reversed byte order.

**Fix:** Toggle the `byte_swap` setting for the tag:
- If `byte_swap` is `false` (default) and the value is garbage, try setting it to `true`.
- If `byte_swap` is `true` and the value is garbage, set it back to `false`.

### 4.5 Tag Reads Zero When PLC Value is Non-Zero

**Symptom:** The tag consistently reads `0` or `0.0` even though the PLC has a non-zero value.

**Cause:** Usually a wrong DB number. The system is reading from a different Data Block that happens to have zeros at that offset. Another possibility is that the DB exists but the PLC's access permissions are not configured to allow external reads.

**Fix:**
- Verify the DB number matches the TIA Portal project.
- In TIA Portal, ensure the Data Block has **"Optimized block access"** disabled (S7-1500) -- snap7 requires standard (non-optimized) access.
- Check that the PLC's **PUT/GET** communication is enabled in the CPU properties.

### 4.6 Connection Refused or Timeout

**Symptom:** All tags fail to read with a connection error.

**Cause:** The PLC is unreachable -- wrong IP address, network issue, or PLC is powered off.

**Fix:** Go to **Admin --> PLC Settings** and verify the IP address, rack, and slot. Use the **Test Connection** button. If the test fails, check network cabling and firewall rules between the Reporting Module server and the PLC.

---

## 5. Bulk Import and Export

### 5.1 Importing Tags (JSON)

The system supports bulk import of tags via JSON. This is useful when migrating tags from another system, seeding a new installation, or synchronizing with a TIA Portal export.

**Endpoint:** `POST /api/tags/bulk-import`

**Request body:**

```json
{
  "tags": [
    {
      "tag_name": "Temperature_1",
      "display_name": "Temperature Sensor 1",
      "source_type": "PLC",
      "plc_address": "DB2099.0",
      "data_type": "REAL",
      "unit": "degC",
      "scaling": 1.0,
      "decimal_places": 1,
      "description": "Main process temperature"
    },
    {
      "tag_name": "Motor_Running",
      "display_name": "Motor Status",
      "source_type": "PLC",
      "plc_address": "DB100.22.0",
      "data_type": "BOOL",
      "unit": "",
      "description": "Main motor running status"
    }
  ]
}
```

**Behavior:**
- If a `tag_name` already exists in the database, the import **updates** the existing tag with the new values.
- If the `tag_name` is new, a new tag is **inserted**.
- Tags with missing `tag_name` or invalid `plc_address` are skipped and reported in the error list.
- The response includes counts of successfully imported tags and a list of any errors.

**Response:**

```json
{
  "status": "success",
  "imported": 2,
  "errors": [],
  "message": "Imported 2 tags"
}
```

### 5.2 Exporting Tags (JSON)

All tags can be exported as JSON for backup, migration, or review.

**Endpoint:** `GET /api/tags/export`

The response includes all tag fields for every tag in the database, ordered by `tag_name`. PLC addresses are formatted as `DB<number>.<offset>` (with `.bit` appended for BOOL tags). The exported JSON can be directly re-imported using the bulk import endpoint.

### 5.3 TIA Portal Import

For importing tags directly from TIA Portal symbol table exports (CSV format), see [TIA_TAGS_IMPORT.md](TIA_TAGS_IMPORT.md). That workflow parses the TIA-native address format (e.g., `DB199.DBD20`) and maps TIA data type names to the system's data types automatically.

---

## 6. Tag Validation

The system validates tag data on every create and update operation. The following checks are enforced:

### 6.1 Required Fields

| Check | Rule |
|-------|------|
| `tag_name` | Must be present and non-empty after trimming whitespace |
| `plc_address` | Required when `source_type` is `PLC`; must parse successfully |
| `data_type` | Must be one of: `BOOL`, `INT`, `DINT`, `REAL`, `STRING` |

### 6.2 Uniqueness

- `tag_name` must be unique across all tags. Attempting to create a tag with a duplicate name returns a `400` error with the message "Tag name already exists."
- The uniqueness check is enforced both in application code (pre-check query) and at the database level (unique constraint).

### 6.3 Address Validation

The PLC address parser (`parse_plc_address`) enforces:

- Address must match the pattern `DB<number>.<offset>` or `DB<number>.<offset>.<bit>`
- DB number must be >= 1
- Offset must be >= 0
- Bit position (if provided) must be between 0 and 7

### 6.4 Data Type Rules

| Rule | Detail |
|------|--------|
| BOOL requires bit_position | If not provided, defaults to 0 |
| Non-BOOL types clear bit_position | `bit_position` is set to `NULL` for INT, DINT, REAL, STRING |
| BOOL bit_position range | Must be 0 through 7 |
| STRING has string_length | Defaults to 40 if not specified |
| REAL has byte_swap option | Defaults to `false` (big-endian) |

### 6.5 Numeric Field Defaults

| Field | Default |
|-------|---------|
| `scaling` | `1.0` |
| `decimal_places` | `2` |
| `is_active` | `true` |
| `is_bin_tag` | `false` |

---

## 7. For Developers

### 7.1 API Endpoints

All tag endpoints are registered under the `/api` prefix via the `tags_bp` Blueprint.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/tags` | List all active tags. Optional query params: `source_type` (filter by type), `is_active` (default `true`). Returns tags ordered by `tag_name`. |
| `POST` | `/api/tags` | Create a new tag. Request body is JSON with tag fields. Returns `201` with the new tag ID on success. |
| `GET` | `/api/tags/<tag_name>` | Get a single tag by name. Returns full tag details including computed `plc_address`. |
| `PUT` | `/api/tags/<tag_name>` | Update an existing tag. Partial updates supported -- only include fields you want to change. |
| `DELETE` | `/api/tags/<tag_name>` | Soft-delete a tag (sets `is_active = false`). The tag remains in the database but is excluded from reads. |
| `GET` | `/api/tags/<tag_name>/test` | Test-read a PLC tag. Returns `raw_value`, scaled `value`, `unit`, and `plc_address`. Only works for PLC-sourced tags. |
| `POST` | `/api/tags/get-values` | Read current values for multiple tags. Request body: `{"tag_names": ["Tag1", "Tag2"]}`. Includes bin activation filtering. |
| `POST` | `/api/tags/bulk-import` | Import tags from JSON array. Upserts by `tag_name`. |
| `GET` | `/api/tags/export` | Export all tags as JSON. |
| `POST` | `/api/tags/seed` | Seed the database with demo tags and groups for development/testing. |

### 7.2 Tag Reader Runtime Flow

When `read_all_tags()` is called (e.g., by the historian or live monitor):

1. **Connect:** Obtain the PLC client via `connect_to_plc_fast()`. In demo mode, this returns the emulator.
2. **Query:** Fetch all active PLC tags from the `tags` table (or a specific subset if `tag_names` is provided).
3. **Read:** For each tag, call `read_tag_value(plc, tag_config)`, which:
   - Calls `plc.db_read(db_number, offset, size)` with the appropriate byte count for the data type.
   - Unpacks the raw bytes using `struct.unpack()` with the correct format string and byte order.
   - Returns the typed value (bool, int, float, or str) or `None` on error.
4. **Transform:** Apply the `value_formula` (if set) or multiply by `scaling` factor.
5. **Enrich (demo mode):** If running in demo mode, also generate simulated values for Manual and Formula tags so the historian has complete data.
6. **Return:** A dictionary of `{tag_name: value}` for all successfully read tags.

### 7.3 Database Schema: Tags Table

The `tags` table stores all tag configurations. Key columns:

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL (PK) | Auto-incrementing primary key |
| `tag_name` | VARCHAR (UNIQUE) | Unique internal identifier |
| `display_name` | VARCHAR | Human-readable display label |
| `source_type` | VARCHAR | `PLC`, `Formula`, `Mapping`, or `Manual` |
| `db_number` | INTEGER | PLC Data Block number (PLC tags only) |
| `offset` | INTEGER | Byte offset within the DB (PLC tags only) |
| `data_type` | VARCHAR | `BOOL`, `INT`, `DINT`, `REAL`, or `STRING` |
| `bit_position` | INTEGER | Bit offset 0-7 (BOOL tags only) |
| `string_length` | INTEGER | Max string length (STRING tags only, default 40) |
| `byte_swap` | BOOLEAN | Reverse byte order for REAL (default false) |
| `unit` | VARCHAR | Engineering unit (e.g., degC, bar, t/h) |
| `scaling` | FLOAT | Linear scaling multiplier (default 1.0) |
| `decimal_places` | INTEGER | Decimal precision for display (default 2) |
| `formula` | TEXT | Formula expression for Formula tags |
| `mapping_name` | VARCHAR | Mapping table reference for Mapping tags |
| `value_formula` | TEXT | Advanced value transformation formula |
| `description` | TEXT | Free-text description |
| `is_active` | BOOLEAN | Whether the tag is enabled (default true) |
| `is_bin_tag` | BOOLEAN | Whether this tag represents a bin identifier |
| `activation_tag_name` | VARCHAR | Tag that controls bin activation |
| `activation_condition` | VARCHAR | Condition type for activation evaluation |
| `activation_value` | VARCHAR | Expected value for activation condition |
| `created_at` | TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | Last modification timestamp |

### 7.4 Soft Delete Behavior

The `DELETE /api/tags/<tag_name>` endpoint does **not** remove the row from the database. Instead, it sets `is_active = false`. This means:

- The tag stops appearing in active tag lists and is no longer read from the PLC.
- Historical data associated with the tag is preserved.
- The tag can be reactivated by updating `is_active` back to `true`.
- The `tag_name` remains reserved (you cannot create a new tag with the same name until the old one is fully removed).

### 7.5 Bin Activation Logic

For tags marked as `is_bin_tag = true` with an `activation_tag_name` configured, the system checks whether the bin is currently active before including its value in the response:

1. Read the activation tag's current value from the PLC.
2. Evaluate the `activation_condition` against the `activation_value`:
   - `equals` / `not_equals` -- string comparison
   - `true` / `false` -- boolean evaluation
   - `greater_than` / `less_than` -- numeric comparison
3. If the condition is **not met**, the tag's value is replaced with `0` (indicating inactive bin).
4. If the condition **is met**, the actual PLC value is returned.

This logic is implemented in `evaluate_activation_condition()` in `tags_bp.py` and is applied in the `POST /api/tags/get-values` endpoint.

### 7.6 Source Files

| File | Purpose |
|------|---------|
| `backend/tags_bp.py` | Flask Blueprint with all tag CRUD and bulk endpoints |
| `backend/utils/tag_reader.py` | PLC tag reading, value transformation, and demo simulation |
| `backend/utils/plc_parser.py` | PLC address string parsing and formatting |
| `backend/plc_utils.py` | Shared PLC connection management |

---

Previous: [02-PLC-CONNECTION](02-PLC-CONNECTION.md) | Next: [04-TAG-GROUPING](04-TAG-GROUPING.md)
