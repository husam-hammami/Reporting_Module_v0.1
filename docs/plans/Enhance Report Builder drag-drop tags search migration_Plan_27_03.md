# Enhance Report Builder: Draggable Tags, Drop Feedback, Search Fix, Remove Migration Badge

**Date:** 27/03/2026

## Context
The Report Builder's drag-and-drop UX is functionally solid but visually bare. Tags in the sidebar aren't draggable at all, the canvas gives zero feedback during drag, there's no drop indicator, and the search icon overlaps text. The "Migrated" badge confuses users. This plan addresses all of these.

**Current state:**
- Native HTML5 drag-drop (not @dnd-kit despite it being installed)
- `react-grid-layout` v2.2.2 for grid layout/repositioning
- Widget toolbox items are draggable via `application/report-widget-type` MIME
- Tag sidebar items are NOT draggable (display-only divs)
- NO visual feedback during toolbox→canvas drag (no ghost, no drop zone, no indicator)
- Search icon uses `left-2` + `pl-6` (overlap + breaks RTL)

## Pre-step: Pull latest
```bash
git checkout main && git pull origin main
git checkout Salalah_Mill_B && git pull origin Salalah_Mill_B
```

---

## Fix 1: Make Tags Draggable with Smart Drop

**File:** `Frontend/src/Pages/ReportBuilder/panels/WidgetToolbox.jsx`

**Tag items (lines 504-513)** — add `draggable` + `onDragStart`:
```jsx
<div
  key={tag.tag_name}
  draggable
  onDragStart={(e) => {
    e.dataTransfer.setData('application/report-tag-name', tag.tag_name);
    e.dataTransfer.setData('application/report-tag-unit', tag.unit || '');
    e.dataTransfer.effectAllowed = 'copy';
  }}
  className="flex items-center gap-1.5 px-1.5 py-[3px] rounded cursor-grab active:cursor-grabbing hover:bg-[var(--rb-accent-bg)]"
  ...
>
```

**File:** `Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx`

Update `handleCanvasDragOver` (line 214) to accept tags:
```javascript
const types = Array.from(e.dataTransfer?.types || []);
if (types.includes('application/report-widget-type') || types.includes('application/report-tag-name')) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
}
```

Update `handleCanvasDrop` (line 221) — add tag drop logic BEFORE the existing widget-type logic:
```javascript
const tagName = e.dataTransfer?.getData('application/report-tag-name');
if (tagName) {
  const tagUnit = e.dataTransfer?.getData('application/report-tag-unit') || '';
  if (selectedId) {
    // Smart add to selected widget based on type
    const widget = widgets.find(w => w.id === selectedId);
    if (widget?.type === 'table') {
      // Add new column
      const cols = [...(widget.config.columns || [])];
      cols.push({ label: tagName, sourceType: 'tag', tagName, unit: tagUnit });
      updateWidget(selectedId, { config: { ...widget.config, columns: cols } });
    } else if (['chart', 'barchart'].includes(widget?.type)) {
      // Add new series
      const series = [...(widget.config.series || [])];
      series.push({ label: tagName, dataSource: { tagName } });
      updateWidget(selectedId, { config: { ...widget.config, series } });
    } else {
      // KPI/gauge/stat — set data source
      updateWidget(selectedId, {
        config: { ...widget.config, dataSource: { tagName }, unit: tagUnit, title: tagName }
      });
    }
  } else {
    // No widget selected — create KPI at drop position
    const cat = WIDGET_CATALOG.find(c => c.type === 'kpi');
    const w = createWidget(cat, 0, 0);
    w.config = { ...w.config, dataSource: { tagName }, unit: tagUnit, title: tagName };
    // Calculate grid x,y from mouse position (reuse existing calculation)
    addWidgetAt(w, x, y);
    setSelectedId(w.id);
    setShowProperties(true);
  }
  return; // Don't fall through to widget-type logic
}
```

---

## Fix 2: Canvas Drop Zone Visual Feedback

**File:** `Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx`

Add state to track drag-over:
```javascript
const [isDragOver, setIsDragOver] = useState(false);
```

Update dragOver handler to set state:
```javascript
const handleCanvasDragOver = useCallback((e) => {
  const types = Array.from(e.dataTransfer?.types || []);
  if (types.includes('application/report-widget-type') || types.includes('application/report-tag-name')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }
}, []);
```

Add dragLeave + drop reset:
```javascript
const handleCanvasDragLeave = useCallback(() => setIsDragOver(false), []);
// In handleCanvasDrop, add at top: setIsDragOver(false);
```

Apply visual feedback to the canvas container:
```jsx
<div
  onDragOver={handleCanvasDragOver}
  onDragLeave={handleCanvasDragLeave}
  onDrop={handleCanvasDrop}
  className={`... ${isDragOver ? 'rb-canvas-drop-active' : ''}`}
>
```

**File:** `Frontend/src/Pages/ReportBuilder/reportBuilderTheme.css`

Add drop zone styles:
```css
.rb-canvas-drop-active {
  outline: 2px dashed var(--rb-accent);
  outline-offset: -4px;
  background: rgba(34, 211, 238, 0.03);
  transition: outline 0.15s ease, background 0.15s ease;
}

.rb-canvas-drop-active .react-grid-layout {
  opacity: 0.85;
}
```

---

## Fix 3: Search Icon Overlap + RTL Fix

**File:** `Frontend/src/Pages/ReportBuilder/panels/WidgetToolbox.jsx` (lines 455-467)

Change:
```jsx
<Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" ... />
<input ... className="rb-input-base w-full pl-6 py-1 text-[10px]" />
```
To:
```jsx
<Search size={12} className="absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" ... />
<input ... className="rb-input-base w-full ps-7 py-1 text-[10px]" />
```

- `left-2` → `start-2.5` (RTL-safe, more space)
- `pl-6` → `ps-7` (RTL-safe, prevents overlap)

---

## Fix 4: Remove "Migrated" Badge

**File:** `Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx`

Remove lines 381-385:
```jsx
{migrated && (
  <span className="text-xs text-[#fbbf24] ...">
    <AlertCircle size={12} /> Migrated
  </span>
)}
```

Remove `migrated` from destructured state at line 39. Keep the migration logic in `templateSchema.js` (still needed for old data), just stop displaying the badge.

---

## Files to Modify

| File | Change |
|------|--------|
| `Frontend/src/Pages/ReportBuilder/panels/WidgetToolbox.jsx` | Draggable tags + search icon fix |
| `Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx` | Tag drop handler, drop zone state, remove migrated badge |
| `Frontend/src/Pages/ReportBuilder/reportBuilderTheme.css` | Drop zone visual styles |

---

## Verification

1. **Drag tag → empty canvas** → creates KPI widget with tag pre-configured
2. **Select table widget, drag tag** → adds new column with that tag name
3. **Select chart widget, drag tag** → adds new series
4. **Select KPI widget, drag tag** → updates data source
5. **Drag widget from toolbox → canvas** → dashed outline appears on canvas during drag
6. **Drop widget** → outline disappears, widget appears at position
7. **Search tags** → icon doesn't overlap text, works in RTL mode
8. **Open migrated report** → no "Migrated" badge shown
9. **Existing widget drag/resize within grid** → still works (no regression)
10. **Tag drag cursor** → shows `grab` on hover, `grabbing` while dragging
