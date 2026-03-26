# Add Excel (XLSX) Export Format to Report Distribution

**Plan date:** 26/03/2026

## Context
Currently reports can only be distributed as PDF or HTML. Industrial/cement mill clients need Excel format to manipulate data, create their own charts, or feed into other systems. `openpyxl` is already in `requirements.txt` (v3.1.5) but unused. The report data pipeline already resolves all cell values before rendering — we just need a new output renderer.

## Scope
- Add `xlsx` as a third format option in distribution rules
- Support both **paginated (table) reports** and **dashboard reports**
- Paginated reports map naturally to Excel (sections → sheets, tables → row/columns)
- Dashboard reports export KPI values and widget data as a summary sheet
- **Raw numeric values** in cells (not formatted strings) so Excel formulas work
- **Native Excel summary formulas** (=SUM, =AVERAGE, etc.) instead of pre-computed values

---

## Step 1: Backend — Format Validation

**File:** `backend/distribution_bp.py` (line 163)

Change:
```python
if fmt not in ('pdf', 'html'):
```
To:
```python
if fmt not in ('pdf', 'html', 'xlsx'):
```

---

## Step 2: Backend — Raw Cell Resolution Function

**File:** `backend/distribution_engine.py`

**CRITICAL:** The existing `_resolve_cell()` returns formatted strings like `"1,234.5 t/h"`. For Excel we need raw numeric values so cells support formulas, sorting, and filtering.

Add `_resolve_cell_raw(cell, tag_data)` that returns a tuple:
```python
def _resolve_cell_raw(cell, tag_data):
    """Return (value, unit, decimals) where value is float/str/None."""
    # Same resolution logic as _resolve_cell but:
    # - Returns raw float for numeric values (no comma formatting)
    # - Returns unit separately (not appended)
    # - Returns decimals count for number_format
    # Returns: (value: float|str|None, unit: str, decimals: int)
```

This reuses the same tag/formula/group resolution logic from `_resolve_cell()` (lines 281-331) but skips the `f"{n:,.{decimals}f}"` formatting step.

---

## Step 3: Backend — Excel Renderer Function

**File:** `backend/distribution_engine.py`

Add `_generate_xlsx(report_name, layout_config, tag_data, from_dt, to_dt)` → `bytes`

**Internal dispatch** on `layout_config.get('reportType')`:
- `'paginated'` → `_xlsx_paginated(wb, ...)`
- else → `_xlsx_dashboard(wb, ...)`

### For Paginated (Table) Reports:
- Single sheet (or one sheet per table section if multiple)
- **Header sections** → merged cells at top with report name, subtitle, date range
- **KPI-row sections** → label/value pairs with styling
- **Table sections** → proper Excel table:
  - Column headers: bold, dark fill (#1a2233), white text, frozen row
  - Data rows: raw numeric values via `_resolve_cell_raw()`, alternating fill
  - **Hidden rows omitted entirely** (via `_is_row_hidden()`)
  - **Summary row with native Excel formulas:**
    - `sum` → `=SUM(C2:C50)`
    - `avg` → `=AVERAGE(C2:C50)`
    - `min` → `=MIN(C2:C50)`
    - `max` → `=MAX(C2:C50)`
    - `count` → `=COUNTA(C2:C50)`
    - `label` → static text
    - `formula` → pre-computed Python value (can't express in Excel)
  - Number format on cells: `#,##0.0` (based on decimals), unit in header not cell
  - Auto-filter on header row
  - **Column width calculation:** iterate all cells per column, set width to `max(len(str(value))) + 2`, capped at 40
- **Signature blocks / text blocks / spacers** → skip

### For Dashboard Reports:
- Single sheet "Dashboard Summary"
- Widget values as label/value rows (raw numeric)
- Table widgets rendered as proper ranges
- Charts/gauges → numeric values only

### Workbook metadata:
```python
wb.properties.title = report_name
wb.properties.creator = "Hercules Reporting Module"
```

### Return:
```python
buffer = BytesIO()
wb.save(buffer)
return buffer.getvalue()
```

### Error handling:
Wrap in try/except with clear error: `raise RuntimeError(f"Excel generation failed: {e}")`

---

## Step 4: Backend — Format Branching

**File:** `backend/distribution_engine.py` (lines 1149-1190)

Extension logic (line 1150):
```python
ext = {'pdf': 'pdf', 'html': 'html', 'xlsx': 'xlsx'}.get(fmt, 'pdf')
```

Add xlsx branch (skips HTML entirely — data → Excel directly):
```python
if fmt == 'xlsx':
    content_bytes = _generate_xlsx(report_name, layout_config, tag_data, from_dt, to_dt)
elif fmt == 'pdf':
    html_content = _generate_report_html(report_name, layout_config, tag_data, from_dt, to_dt)
    content_bytes = _html_to_pdf(html_content)
else:
    html_content = _generate_report_html(report_name, layout_config, tag_data, from_dt, to_dt)
    content_bytes = html_content.encode('utf-8')
```

---

## Step 5: Backend — Email MIME Type

**File:** `backend/distribution_engine.py` — `_send_email()` (line 1047)

Replace the generic MIME handling with proper extension lookup:
```python
import mimetypes
mime_type, _ = mimetypes.guess_type(filename)
if mime_type:
    maintype, subtype = mime_type.split('/', 1)
else:
    maintype, subtype = 'application', 'octet-stream'
msg.add_attachment(content, maintype=maintype, subtype=subtype, filename=filename)
```

Resend API: no change needed — infers MIME from filename.

---

## Step 6: Frontend — Format Toggle

**File:** `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx` (lines 324-335)

Keep all three formats to avoid breaking existing HTML rules:
```jsx
{[
  { value: 'pdf', label: 'PDF' },
  { value: 'xlsx', label: tr('distribution.excel') },
  { value: 'html', label: 'HTML' },
].map(f => (
  <button key={f.value} onClick={() => set('format', f.value)} ...>
    {f.label}
  </button>
))}
```

Widen the container from `w-28` to `w-40` to fit three buttons.

---

## Step 7: Translations

**Files:** `Frontend/src/i18n/en.json`, `Frontend/src/i18n/ar.json`

English:
```json
"distribution.excel": "Excel"
```

Arabic:
```json
"distribution.excel": "إكسل"
```

---

## Files to Modify

| File | Change |
|------|--------|
| `backend/distribution_bp.py` | Add `'xlsx'` to format validation (line 163) |
| `backend/distribution_engine.py` | `_resolve_cell_raw()`, `_generate_xlsx()`, format branching, MIME fix |
| `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx` | 3-option format toggle, widen container |
| `Frontend/src/i18n/en.json` | Translation key |
| `Frontend/src/i18n/ar.json` | Arabic translation |

**No new dependencies** — `openpyxl==3.1.5` already in `requirements.txt`.

## Verification

1. Create distribution rule with format = Excel, select a paginated report → verify .xlsx received
2. Open .xlsx → verify raw numbers (not text), column headers, alternating rows, frozen header
3. Check summary row → verify native Excel formulas (=SUM, =AVERAGE, etc.)
4. Sort/filter columns → verify they work (proves raw numbers, not formatted strings)
5. Dashboard report → verify summary sheet with widget values
6. Multi-report rule → verify multiple .xlsx attachments
7. Disk delivery → verify .xlsx saved correctly
8. Existing PDF/HTML rules → verify unchanged behavior
9. Edit existing HTML rule → verify HTML option still visible and works
