# Modification log

This folder records notable modifications to the Reporting Module.

---

## 2026-03-09

### Report Builder: table cell tags now requested for live/preview (fix tag name showing as text)

- **Summary:** Table cells that use a Tag (e.g. `totalizer_kg`) were showing the tag name as text in Preview and Live instead of the actual PLC value.
- **Cause:** The function `collectWidgetTagNames(widgets)` in `Frontend/src/Hooks/useReportBuilder.js` is used to build the list of tag names requested from the API for live and preview. It only collected tags from column definitions (`tableColumns`), widget-level config (`dataSource`, `series`, etc.), and similar fields. It did **not** collect tag names from **table static data row cells** (`staticDataRows`). So tags used only inside a cell (e.g. the F2 cell with `totalizer_kg`) were never added to the request list → the API did not return them → `tagValues['totalizer_kg']` was missing → the table fell back to showing the hint (the tag name) instead of a value.
- **Fix:** In `Frontend/src/Hooks/useReportBuilder.js`, `collectWidgetTagNames` was extended to iterate over each widget’s `config.staticDataRows`. For each row and each cell that is an object:
  - If `sourceType === 'tag'` and `tagName` is set, that `tagName` is added to the set of requested tags.
  - If the cell has `groupTags`, those tag names are also added so group-type cells receive live values.
- **Result:** Tags like `totalizer_kg` used only in table cells are now included in the live/preview tag request. The API returns their values and the table displays the actual PLC values instead of the tag name.
- **File changed:** `Frontend/src/Hooks/useReportBuilder.js`

---

## 2025-02-25

### Tags page: load values for all tags (no 50-tag limit)

- **File:** `Frontend/src/Pages/Settings/Tags/TagManager.jsx`
- **Change:** Tag values are now requested in batches of 200 instead of a single request limited to 50 tags. All PLC, Manual, and Formula tags receive values; no tags are left in "Loading..." due to the previous limit.
- **Details:** `loadTagValues` splits `tagNames` into batches of 200, calls `/api/tags/get-values` for each batch with `Promise.all`, and merges all responses into one `tag_values` object.

### ID-like tags: random ID in range 21–61

- **Frontend (EmulatorContext.jsx):**
  - Tags whose names contain `bin_id` or `prd_code`, or end with `_id`, are treated as ID-like.
  - For these tags the client-side emulator shows a random integer in the range 21–61 (refreshed every 4 seconds) instead of the normal sine simulation.
- **Backend (plc_data_source.py):**
  - New simulation kind `id_range`: values are `random.randint(base, amplitude)` (e.g. 21–61).
  - DB199 FCL destination and source blocks: `bin_id` and `prd_code` offsets now use `id_range` 21–61 instead of fixed values (e.g. 29, 1).

### Historical data: no duplicate rows

- **Historian worker (`backend/workers/historian_worker.py`):**
  - Postgres advisory lock so only one writer inserts per second; prevents duplicate `tag_history` rows when the worker is effectively run twice.
  - Fixed `fetchone()` handling for both tuple and dict rows (avoids KeyError: 0).
- **App (`backend/app.py`):**
  - Guard so only one historian worker is spawned per process (`_historian_worker_started`).
- **Archive worker (`backend/workers/dynamic_archive_worker.py`):**
  - Advisory lock for the universal historian archive block.
  - INSERT changed to `ON CONFLICT (tag_id, archive_hour) WHERE layout_id IS NULL DO NOTHING` to avoid duplicate `tag_history_archive` rows.
- **Migration:** `backend/migrations/add_tag_history_archive_unique_universal.sql` adds a partial unique index on `(tag_id, archive_hour) WHERE layout_id IS NULL` for universal archive rows.

### Report Builder: Mapping column shows raw value when no match

- **File:** `Frontend/src/Pages/ReportBuilder/widgets/TableWidget.jsx`
- **Change:** For Mapping-tag columns, when the input tag has a value but no mapping lookup entry, the cell now shows the raw tag value (e.g. 52) instead of the mapping fallback (e.g. "Unknown"). Fallback is only used when the input tag has no value (null/undefined).
- **Details:** `resolveLookup` returns the mapped label when `mapping.lookup[key]` exists; otherwise it returns `inputValue` so the user sees the tag value until that value is added to the mapping.

### Report Builder: Data Table — static rows use per-cell config (Tag / Formula / Mapping / Static)

- **Files:** `Frontend/src/Pages/ReportBuilder/widgets/TableWidget.jsx`
- **Change:** Rows added via "+ New row" are no longer plain-text cells. Each cell is a full column config (Tag, Formula, Group, Mapping, or Static), same as the first data row. You can select a row and configure each cell’s value source.
- **Details:**
  - **Per-cell config:** Each cell in a static row is stored as a column config object (`sourceType`, `tagName`, `formula`, `groupTags`, `mappingName`, `staticValue`, `aggregation`, `format`, `decimals`, etc.). Legacy templates with string cells are normalized on read to `{ sourceType: 'static', staticValue: '...' }`.
  - **Resolve and display:** Static cells use `resolveColumnValue(cellConfig, tagValues)` and `formatCellDisplay(value, cellConfig)`. In preview you see the resolved value (tag, formula, mapping, or static); in edit you see the hint (e.g. tag name, "Map: …", "Double-click to set").
  - **Edit cell:** Double-click any static cell to open the ColumnEditor for that cell. The panel title is "Edit cell"; "Column Name" is hidden. You can set Tag, Formula, Group, Mapping, or Static per cell, with the same Source/Format tabs as column editing. Mapping type was added to the column/cell editor (type button + mapping dropdown).
  - **Persistence:** Config is saved as an array of rows of config objects. Old string rows are normalized only in memory when loading.
- **How to use:** Add a row with "+ New row", then double-click any cell to open the editor, choose Tag / Formula / Group / Mapping / Static, and configure like the first data row. In preview the cell shows the resolved value.

### Report Builder: Data Table — height auto-adjusts to row count

- **File:** `Frontend/src/Hooks/useReportBuilder.js`
- **Change:** Table widget grid height now follows the number of rows. When you add or remove static rows or summary rows (or change any table config), the widget’s height is recalculated so the table fits its content without unnecessary empty space or internal scroll.
- **Details:**
  - **Helper:** `getTableWidgetDesiredHeight(config)` computes the required grid rows from: 1 header + 1 live row + `staticDataRows.length` + `summaryRows.length` + 1 row for the “New row” / “Add totals row” controls, plus 2 reserved rows for title and padding. Returns `Math.max(2, reservedGridRows + contentRows)`.
  - **updateWidget:** When `updateWidget(widgetId, updates)` is called for a table and `updates.config` is set, the merged config is used to set the widget’s `h` to `getTableWidgetDesiredHeight(next.config)`, so the table height always matches the current row count.
- **Result:** Less empty space with few rows, less scroll with many rows; manual resize via drag is still applied by `updateLayout`, but the next table config change will recalculate `h` from row count again.
