# Active Bin Mapping — Implementation Plan

> **Purpose:** Enable mappings to resolve bin_id → weight **tag value** (not just display text), so a single mapping can link each bin to its correct weight tag. Combined with the existing "Hide inactive" feature, rows with bin_id = 0 are hidden automatically.
>
> **Date:** 2026-03-12
> **Branch:** TBD
> **Prerequisite:** Existing mappings system (table, form, API, and `resolveCellValue` in PaginatedReportBuilder) working.

---

## Problem Statement

In the old (legacy) system, when the PLC reports an active bin (e.g. bin_id = 55), the backend uses a hardcoded map (`FCL_FEEDER_FLOW_MAP`) to look up the correct DB2099 offset and read the weight for that bin. This is not configurable — adding a new bin requires a code change.

In the new dynamic/paginated report system:

- **Product column** already works: a mapping (e.g. "Mil-A_Bin_mapping") maps bin_id → material name text ("Flour"). This is `output_type = text`.
- **Weight column** has no equivalent: there is no way to say "bin_id 55 → read the value of tag `bin_55_weight`". Today mappings only output **display text**, not **another tag's live value**.
- **Active/inactive** already works via "Hide inactive" with the ID column as reference (row hidden when ID = 0).

**Goal:** Extend the mapping system so it can output a **tag's live value** (not just text). This lets users create one mapping "Bin → Weight" where 55 → `bin_55_weight`, 51 → `bin_51_weight`, etc. The Weight column in the table then shows the live PLC value of the mapped tag.

---

## Current Architecture (Codebase-Audited)

| Item | Location | Current Behavior |
|------|----------|-----------------|
| Mappings DB table | `backend/migrations/create_mappings_table.sql` | `id`, `name`, `input_tag`, `output_tag_name`, `lookup` (JSONB), `fallback`, `is_active`. No `output_type` field. |
| Mappings API | `backend/mappings_bp.py` | CRUD: GET/POST/PUT/DELETE `/api/mappings`. Stores `lookup` as JSONB `{"55": "Flour", "51": "Flour"}`. |
| Mapping form UI | `Frontend/src/Pages/Settings/Mappings/MappingForm.jsx` | One `input_tag` dropdown, one `output_tag_name` text field, lookup table with text input/output columns. No output type selector. |
| Mapping manager | `Frontend/src/Pages/Settings/Mappings/MappingManager.jsx` | List/create/edit/delete mappings. |
| Cell resolution | `PaginatedReportBuilder.jsx` → `resolveCellValue()` (line ~158) | For `sourceType === 'mapping'`: gets `tagValues[mapping.input_tag]`, calls `resolveLookup(mapping, raw)` → returns **text string**. |
| `resolveLookup()` | `PaginatedReportBuilder.jsx` (line ~150) | `mapping.lookup[key]` → returns the text value or fallback. |
| Tag collection | `collectPaginatedTagNames()` (line ~249) | For mapping cells: adds `mapping.input_tag` to requested tag names. Does NOT add lookup output values. |
| Hide inactive | `isRowHidden()` (line ~233) | If `row.hideWhenInactive` is true, resolves the cell at `row.hideReferenceCol` and hides the row when value = 0. |
| Table render | `PaginatedReportBuilder.jsx` (line ~972) | Filters rows by `isRowHidden`, renders each cell via `resolveCellValue(cell, tagValues)`. No row context passed. |
| Mappings cache | `Frontend/src/utils/mappingsCache.js` | `getCachedMappings()` returns array of mapping objects from `/api/mappings`. |

---

## Design

### New field: `output_type`

Add `output_type` to the mappings table:

| Value | Behavior |
|-------|----------|
| `'text'` (default) | Current behavior. Lookup value is displayed as-is (e.g. "Flour"). |
| `'tag_value'` | Lookup value is a **tag name**. The system reads that tag's live value from `tagValues` and displays it formatted. |

### Resolution flow for `output_type = 'tag_value'`

When a cell uses a mapping with `output_type = 'tag_value'` inside a table:

1. **Determine the bin_id for this row.** Resolve the cell at the row's reference column (same column used for "Hide inactive") → e.g. `55`.
2. **Look up in mapping.** `mapping.lookup["55"]` → `"bin_55_weight"` (a tag name).
3. **Get tag value.** `tagValues["bin_55_weight"]` → `12.5`.
4. **Format and display.** Apply decimals/unit → `"12.5 t/h"`.

For cells **outside** a table (e.g. KPI), use `tagValues[mapping.input_tag]` as the bin_id (same as today) and follow steps 2–4.

### Mapping form changes

For `output_type = 'tag_value'`, the lookup table's "Output" column becomes a **tag dropdown** instead of a text input, so users pick real tags (e.g. `bin_55_weight`).

---

## Implementation Steps

### Step 1 — Backend: Add `output_type` column

**File:** `backend/mappings_bp.py`

1. In `_ensure_table_exists()`, add:

```sql
ALTER TABLE mappings ADD COLUMN IF NOT EXISTS output_type VARCHAR(20) DEFAULT 'text';
```

2. In `create_mapping()` and `update_mapping()`, read `output_type` from request data (default `'text'`), include in INSERT/UPDATE.

3. In `get_mappings()` and `get_mapping()`, include `output_type` in the SELECT.

**File:** `backend/migrations/create_mappings_table.sql`

4. Add `output_type VARCHAR(20) DEFAULT 'text'` to the CREATE TABLE statement (for fresh installs).

**Validation:** `output_type` must be `'text'` or `'tag_value'`; reject others with 400.

---

### Step 2 — Mapping Form: Add Output Type selector and tag dropdown

**File:** `Frontend/src/Pages/Settings/Mappings/MappingForm.jsx`

1. Add state: `const [outputType, setOutputType] = useState(mapping?.output_type || 'text');`

2. Add an "Output Type" dropdown below the existing "Output Tag Name" field:

```jsx
<label>Output Type</label>
<select value={outputType} onChange={e => setOutputType(e.target.value)}>
  <option value="text">Display Text</option>
  <option value="tag_value">Tag Value (show mapped tag's live value)</option>
</select>
```

3. In the **Lookup Table** rows, when `outputType === 'tag_value'`, replace the text `<input>` for "Output" with a `<select>` dropdown of available tags (same `tags` array already loaded). The "When value =" column stays a text input (bin_id like "55").

4. In `handleSubmit`, include `output_type: outputType` in the object passed to `onSave`.

---

### Step 3 — Frontend resolution: Pass row context into `resolveCellValue`

**File:** `Frontend/src/Pages/ReportBuilder/PaginatedReportBuilder.jsx`

#### 3a. Extend `resolveCellValue` signature

```js
function resolveCellValue(cell, tagValues, rowContext = null) {
```

`rowContext` shape:

```js
{
  resolvedRefValue: <number|string|null>,  // resolved value of the row's reference column
  refCell: <cell config>,                  // the reference cell (for unit/decimals if needed)
}
```

#### 3b. Update the `sourceType === 'mapping'` branch

Current code (line ~199):

```js
if (cell.sourceType === 'mapping') {
  const mappings = getCachedMappings();
  const mapping = mappings?.find((m) => (m.name || m.id) === cell.mappingName);
  if (!mapping) return '—';
  const raw = tagValues?.[mapping.input_tag];
  return resolveLookup(mapping, raw);
}
```

New code:

```js
if (cell.sourceType === 'mapping') {
  const mappings = getCachedMappings();
  const mapping = mappings?.find((m) => (m.name || m.id) === cell.mappingName);
  if (!mapping) return '—';

  if (mapping.output_type === 'tag_value') {
    // Determine bin_id: prefer row context (table), fall back to input_tag (KPI)
    const rawId = rowContext?.resolvedRefValue ?? tagValues?.[mapping.input_tag];
    if (rawId == null) return '—';
    const key = String(Math.round(Number(rawId)));
    const weightTagName = mapping.lookup?.[key];
    if (!weightTagName) return mapping.fallback ?? '—';

    // Read the mapped tag's live value
    const weightRaw = tagValues?.[weightTagName];
    if (weightRaw == null) return '—';
    const n = Number(weightRaw);
    if (isNaN(n)) return weightRaw;
    const d = cell.decimals ?? 1;
    const formatted = n.toLocaleString(undefined, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
    const suffix = effectiveUnit(cell);
    return suffix ? `${formatted} ${suffix}` : formatted;
  }

  // Default: text output (current behavior)
  const raw = tagValues?.[mapping.input_tag];
  return resolveLookup(mapping, raw);
}
```

#### 3c. Build row context in table render

In the `<tbody>` render (line ~972), before rendering cells, compute the reference value:

```jsx
{(section.rows || [])
  .filter((row) => !isRowHidden(row, section, tagValues))
  .map((row, ri) => {
    // Build row context from the reference column (same as hideReferenceCol)
    const refColIdx = row.hideReferenceCol ?? 0;
    const refCell = row.cells?.[refColIdx];
    const resolvedRef = refCell ? resolveCellValue(refCell, tagValues) : null;
    // Extract numeric value from formatted string (e.g. "55.0" → 55)
    let resolvedRefValue = null;
    if (resolvedRef != null && resolvedRef !== '—') {
      const num = Number(String(resolvedRef).replace(/[^0-9.\-]/g, ''));
      if (!isNaN(num)) resolvedRefValue = num;
    }
    const rowContext = { resolvedRefValue, refCell };

    return (
      <tr key={row.id} className={ri % 2 === 1 ? 'bg-[#f8fafc]' : ''}>
        {(row.cells || []).map((cell, ci) => {
          const col = section.columns[ci];
          return (
            <td key={ci} className="px-2 py-0.5 border border-[#e2e8f0]"
              style={{ textAlign: col?.align || 'left' }}>
              {renderResolvedValue(resolveCellValue(cell, tagValues, rowContext))}
            </td>
          );
        })}
      </tr>
    );
  })}
```

---

### Step 4 — Collect tag names for `tag_value` mappings

**File:** `Frontend/src/Pages/ReportBuilder/PaginatedReportBuilder.jsx` → `collectPaginatedTagNames()`

When a cell uses a mapping, also check if that mapping has `output_type === 'tag_value'`. If so, add all **values** from `mapping.lookup` (the tag names) to the set.

```js
if (cell.sourceType === 'mapping' && cell.mappingName) {
  const m = mappings?.find((mx) => (mx.name || mx.id) === cell.mappingName);
  if (m?.input_tag) names.add(m.input_tag);
  // For tag_value mappings, also request all output tag names
  if (m?.output_type === 'tag_value' && m?.lookup) {
    Object.values(m.lookup).forEach((tagName) => {
      if (tagName && typeof tagName === 'string') names.add(tagName);
    });
  }
}
```

Apply the same logic in both the KPI and table cell collection loops.

---

### Step 5 — ReportViewer: same changes

**File:** `Frontend/src/Pages/Reports/PaginatedReportViewer.jsx`

The viewer uses the same `resolveCellValue` and `collectPaginatedTagNames` (imported from PaginatedReportBuilder). Verify that:

1. The viewer's table render also builds `rowContext` and passes it to `resolveCellValue`.
2. The viewer's tag collection also handles `tag_value` mappings.

If the viewer has its own copy of these functions, apply the same changes.

---

### Step 6 — Mapping form: unit and decimals for `tag_value` cells

When a cell uses `sourceType === 'mapping'` and the mapping is `output_type === 'tag_value'`, the cell should still allow unit and decimals configuration (to format the weight value).

**File:** `Frontend/src/Pages/ReportBuilder/PaginatedReportBuilder.jsx` → `CellEditor`

After the mapping dropdown (line ~432), add unit/decimals selectors when the selected mapping has `output_type === 'tag_value'`:

```jsx
{srcType === 'mapping' && (() => {
  const selMapping = (mappings || []).find(m => (m.name || m.id) === cell.mappingName);
  if (selMapping?.output_type === 'tag_value') {
    return <UnitSelector cell={cell} onChange={onChange} />;
  }
  return null;
})()}
```

---

## Database Migration

For existing installations, run:

```sql
ALTER TABLE mappings ADD COLUMN IF NOT EXISTS output_type VARCHAR(20) DEFAULT 'text';
```

Or add to `_ensure_table_exists()` in `mappings_bp.py` (already handles schema evolution).

---

## Example Usage

### Setup

1. **Tags exist:**
   - `receiver_bin_id_1` (DB499, offset 536, INT) — reads bin_id from PLC (e.g. 55)
   - `receiver_bin_id_2` (DB499, offset 544, INT) — reads bin_id from PLC (e.g. 51)
   - `bin_55_weight` (DB2099, offset 52, REAL) — weight for bin 55
   - `bin_51_weight` (DB2099, offset 64, REAL) — weight for bin 51

2. **Create mapping "Bin → Weight Tag":**
   - Output Type: **Tag Value**
   - Input Tag: `receiver_bin_id_1` (used as fallback for non-table contexts)
   - Lookup Table:

   | When value = | Output (Tag) |
   |-------------|--------------|
   | 55          | bin_55_weight |
   | 51          | bin_51_weight |
   | 53          | bin_53_weight |
   | 56          | bin_56_weight |

3. **Create mapping "Bin → Material" (already exists):**
   - Output Type: **Text** (default)
   - Lookup: 55 → "Flour", 51 → "Flour", 53 → "Semolina", etc.

4. **Paginated Report table "Receiver":**
   - Columns: ID, Product, Weight
   - Row 1:
     - ID: Single Tag → `receiver_bin_id_1` (shows 55)
     - Product: Mapping Tag → "Bin → Material" (55 → "Flour")
     - Weight: Mapping Tag → "Bin → Weight Tag" (55 → `bin_55_weight` → 12.5 t/h)
     - Hide inactive: checked, reference column: ID
   - Row 2:
     - ID: Single Tag → `receiver_bin_id_2` (shows 51)
     - Product: Mapping Tag → "Bin → Material" (51 → "Flour")
     - Weight: Mapping Tag → "Bin → Weight Tag" (51 → `bin_51_weight` → 0.0 t/h)
     - Hide inactive: checked, reference column: ID

### Result

| ID | Product | Weight |
|----|---------|--------|
| 55.0 | Flour | 12.5 t/h |
| 51.0 | Flour | 0.0 t/h |

If `receiver_bin_id_2` reads 0 from PLC → Row 2 is hidden (Hide inactive).

---

## Files Changed

| File | Change |
|------|--------|
| `backend/mappings_bp.py` | Add `output_type` column, include in CRUD |
| `backend/migrations/create_mappings_table.sql` | Add `output_type` to CREATE TABLE |
| `Frontend/src/Pages/Settings/Mappings/MappingForm.jsx` | Add Output Type dropdown; tag dropdown for lookup output when `tag_value` |
| `Frontend/src/Pages/ReportBuilder/PaginatedReportBuilder.jsx` | Extend `resolveCellValue` with `rowContext`; update table render to build/pass `rowContext`; update `collectPaginatedTagNames` for `tag_value` mappings; add unit selector for `tag_value` mapping cells |
| `Frontend/src/Pages/Reports/PaginatedReportViewer.jsx` | Same resolution and tag collection changes as builder (if separate copy) |

---

## Testing Checklist

- [ ] Create a mapping with `output_type = 'text'` — verify existing behavior unchanged
- [ ] Create a mapping with `output_type = 'tag_value'` — verify lookup table shows tag dropdown for output
- [ ] Use `tag_value` mapping in a table Weight column — verify it shows the live tag value (not the tag name string)
- [ ] Verify `rowContext` correctly reads the ID column value for each row
- [ ] Verify rows with bin_id = 0 are hidden when "Hide inactive" is enabled
- [ ] Verify `collectPaginatedTagNames` includes all output tag names from `tag_value` mappings
- [ ] Verify KPI cell with `tag_value` mapping works (uses `mapping.input_tag` as the bin_id source)
- [ ] Verify edit/update of a mapping preserves `output_type`
- [ ] Verify fresh install migration includes `output_type` column
- [ ] Verify existing mappings default to `output_type = 'text'` after migration

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Existing mappings break after migration | `output_type` defaults to `'text'`; all existing behavior unchanged. |
| Row context not available outside tables | Fall back to `tagValues[mapping.input_tag]` when `rowContext` is null. |
| Tag name in lookup is misspelled or deleted | Show fallback value ("—") when tag value is null; log a warning. |
| Large number of bins → many tags fetched | `collectPaginatedTagNames` only adds tags from mappings actually used in the report. Bounded by lookup table size. |
