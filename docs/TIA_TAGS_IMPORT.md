# TIA Portal Tags Import for Hercules

This document describes how to sync PLC tag names, addresses, and descriptions from Siemens TIA Portal into Hercules by exporting the symbol table to a known path and letting Hercules parse the default TIA export format. It includes the details needed to implement the feature.

---

## Overview

- **Engineer:** Exports the PLC symbol table from TIA Portal to a fixed path (e.g. `C:\Hercules\symbol_export.csv`).
- **Hercules:** Reads that file, parses TIA's default CSV format, and updates the `tags` table (tag name, DB/offset/bit, data type, description).

No TIA scripting or scheduler is required; the engineer exports manually whenever the project changes.

---

## Engineer Workflow (TIA Portal)

1. Open the TIA Portal project and the PLC whose tags you want in Hercules.
2. Open **PLC tags** (symbol table) for that PLC.
3. Export the symbol table to CSV:
   - Right-click the symbol table (or **PLC tags**) → **Export** (or **Export to CSV**),  
     **or** use **Project → Reports** and generate a report that includes PLC tags, then save as CSV.
4. Save the file to the **known path** Hercules is configured to use, e.g.:
   - **`C:\Hercules\symbol_export.csv`**
   - Create the folder `C:\Hercules` if it does not exist.
5. Repeat this export whenever you change symbols in the project.

**Note:** Use TIA's default export; no custom format or column order is required. Hercules is designed to parse the default TIA symbol export format.

---

## Hercules Configuration

| Setting | Description | Default |
|--------|--------------|---------|
| Symbol file path | Full path to the CSV file (local or network). | `C:\Hercules\symbol_export.csv` |

- **Environment variable:** `HERCULES_TAGS_IMPORT_PATH` (or `HERCULES_SYMBOL_FILE_PATH`). Read at runtime; no app restart needed if env is set before process start.
- **Fallback:** If unset, use default `C:\Hercules\symbol_export.csv`.
- **Network path:** If Hercules runs on a server and TIA on an engineering PC, use a path the server can read (e.g. `\\EngineeringPC\Hercules\symbol_export.csv`).

---

## TIA Export Format (Default)

Hercules expects a CSV with a header row. Column names may vary by TIA version and language; match **case-insensitively** and trim whitespace.

| Typical column (EN) | Alternatives to accept | Maps to |
|---------------------|-------------------------|--------|
| Symbol name / Name / Symbol | `"Name"`, `"Tag"`, `"Symbol name"`, `"Symbol"` | `tag_name` |
| Address | `"Address"`, `"Adresse"` | Parsed → `db_number`, `offset`, `bit_position` |
| Data type | `"Data type"`, `"DataType"`, `"Type"` | `data_type` (after mapping) |
| Comment | `"Comment"`, `"Comment text"`, `"Description"` | `description` |

**Required columns:** At least one column for symbol name and one for address. Data type and comment are optional (use defaults if missing).

---

## TIA Address Format (Siemens S7) — Parsing Rules

TIA exports addresses in S7 style. Parse them to `db_number`, `offset`, and optionally `bit_position`.

| TIA format | Meaning | Parsed result |
|------------|---------|----------------|
| `DB199.DBW20` | Word at byte 20 | db_number=199, offset=20, bit=None |
| `DB199.DBD20` | DWord at byte 20 | db_number=199, offset=20, bit=None |
| `DB199.DBB20` | Byte at 20 | db_number=199, offset=20, bit=None |
| `DB199.DBX20.0` | Bit 0 of byte 20 | db_number=199, offset=20, bit=0 |

**Implementation (regex):**

- Pattern for **DBX** (bit): `DB(\d+)\.DBX(\d+)\.(\d+)`  
  - Group 1 = db_number, Group 2 = offset, Group 3 = bit (0–7).
- Pattern for **DBB/DBW/DBD**: `DB(\d+)\.DB([BWD])(\d+)`  
  - Group 1 = db_number, Group 3 = offset; bit = None.

**Validation:** db_number ≥ 1, offset ≥ 0, bit in 0–7 if present. On parse failure, skip the row and log a warning; continue with the rest of the file.

**Existing code:** `utils/plc_parser.py` has `parse_plc_address()` for formats `DB<n>.<offset>` and `DB<n>.<offset>.<bit>`. Either add a new function `parse_tia_address(address_str)` that handles the DBW/DBD/DBB/DBX formats above and returns `{db_number, offset, bit}`, or extend `parse_plc_address()` to try TIA format first, then fall back to the current pattern.

---

## Data Type Mapping (TIA → Hercules)

Map TIA export strings to Hercules `tags.data_type` (allowed: `BOOL`, `INT`, `DINT`, `REAL`, `STRING`). Use case-insensitive match and strip whitespace.

| TIA (typical) | Hercules |
|---------------|----------|
| Bool, BOOL | BOOL |
| Int, INT, Integer, Word, WORD | INT |
| DInt, DINT, DWord, DWORD | DINT |
| Real, REAL, Float | REAL |
| String, String(n), S7String | STRING |

**Default:** If unknown or empty, use `REAL` (or `DINT`) and log a debug message. Optional: for `String(n)` capture `n` and set `tags.string_length` (default 40).

---

## Tags Table Columns to Set on Import

Use the existing `tags` table. On **insert** or **update** from TIA import, set:

| Column | Value |
|--------|--------|
| tag_name | From CSV symbol name (required; unique key for upsert). |
| display_name | Same as tag_name if not provided. |
| source_type | `'PLC'` |
| db_number | From parsed address. |
| offset | From parsed address. |
| bit_position | From parsed address (only for BOOL); NULL otherwise. |
| data_type | From data type mapping table above. |
| description | From CSV comment column (“what the tag is for”). |
| is_active | `true` |
| string_length | 40 (or from String(n) if parsed). |
| byte_swap | false (Siemens default). |
| unit | Empty string (or leave unchanged on update). |
| scaling | 1.0 (or leave unchanged on update). |
| decimal_places | 2 (or leave unchanged on update). |

Do **not** overwrite `formula`, `mapping_name`, or other formula/mapping fields for PLC-sourced tags; leave them NULL or unchanged.

---

## Upsert Logic

- **Unique key:** `tag_name`.
- **If a row with that `tag_name` exists:** UPDATE the columns listed above (db_number, offset, bit_position, data_type, description, display_name, etc.).
- **If no row exists:** INSERT a new row with all required columns (see `tags` table schema in `migrations/create_tags_tables.sql`).
- **Optional (configurable):** Tags that were previously imported from this source and are **not** in the new CSV can be set to `is_active = false` so removals in TIA are reflected. To support this, you can mark imported tags (e.g. with a convention or an optional `import_source` column); then after a successful import, set `is_active = false` for tags with that source that are not in the current file. If you do not need this, skip it and only add/update.

---

## File Handling

- **Encoding:** Try UTF-8; if the first read fails (e.g. decode error), try UTF-8-sig (BOM) or a fallback (e.g. cp1252). Prefer UTF-8 for TIA exports.
- **Delimiter:** Comma `,`. If the header has no comma but has semicolon `;`, use semicolon (e.g. for some locale exports).
- **Missing file:** If the path does not exist or is not a file, log a warning and return without changing the database.
- **Locked file:** If the file is in use (e.g. Excel or TIA has it open), catch the error, optionally retry once after a short delay (e.g. 2 seconds), then log and return without applying partial changes.
- **Invalid rows:** Rows with missing symbol name or invalid address: log and skip; continue processing the rest. Return a summary (e.g. imported count, updated count, error count and first few error messages).

---

## API / Trigger

- **Option A — On-demand:** New endpoint, e.g. `POST /api/tags/import-from-tia-file` or `POST /api/tags/import-from-symbol-file`. No body required; backend reads the configured path, parses CSV, performs upsert, returns counts and any errors.
- **Option B — Periodic:** Background job (e.g. every 5–10 minutes) that reads the configured path and runs the same import logic. Optionally only run if file modification time changed.
- **Option C — Both:** On-demand endpoint plus optional periodic sync. Restrict import to authenticated users with appropriate role (e.g. Admin/Manager).

---

## Implementation Checklist

- [ ] Add config: read `HERCULES_TAGS_IMPORT_PATH` (or similar) with default `C:\Hercules\symbol_export.csv`.
- [ ] Add TIA address parser: `parse_tia_address(address_str)` (or extend `parse_plc_address`) for `DBx.DBW/DBD/DBB/DBX` formats; return `{db_number, offset, bit}`.
- [ ] Add CSV parser: open file with encoding/delimiter handling; detect header columns (symbol name, address, data type, comment) case-insensitively; iterate rows and validate.
- [ ] Add data type mapping: TIA string → Hercules `data_type` (and optional `string_length` for String(n)).
- [ ] Implement upsert: for each valid row, UPDATE or INSERT into `tags` by `tag_name` with the columns listed above.
- [ ] Add API endpoint (and/or background job) that calls the import function and returns result summary.
- [ ] (Optional) Deactivate tags no longer in the file if “reflect TIA deletions” is desired.
- [ ] Log and return clear errors for missing file, locked file, and per-row parse failures.

---

## File and Errors (User-Facing)

- **Missing file:** Import is skipped; no change to existing tags. User sees a message that the file was not found at the configured path.
- **Locked file:** Import is skipped; user is advised to close the file and try again (or wait for the next periodic run).
- **Invalid rows:** Listed in the response (e.g. symbol name and error); other rows are still imported.

---

## Summary

| Step | Responsibility |
|------|----------------|
| 1 | Engineer exports PLC symbol table from TIA to the configured path (e.g. `C:\Hercules\symbol_export.csv`). |
| 2 | Hercules reads that path and parses the default TIA CSV format (symbol name, address, data type, comment). |
| 3 | Hercules parses TIA/S7 addresses (DBW/DBD/DBB/DBX) to db_number, offset, bit and maps data types to `tags.data_type`. |
| 4 | Hercules upserts into `tags` by tag_name and sets description from comment so “what the tag is for” stays in sync with TIA. |

This gives a simple, robust way to keep Hercules tags aligned with TIA without custom export formats or TIA scripting. The sections above contain the details needed to implement the feature end-to-end.
