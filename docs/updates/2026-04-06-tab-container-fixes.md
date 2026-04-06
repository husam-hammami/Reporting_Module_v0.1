# Tab Container Widget Fixes & Data Panel Enhancements

**Date:** 2026-04-06
**Branch:** Salalah_Mill_B
**Commits:** 1fbbb44 → cb60c43

---

## Summary

Fixed multiple issues with the Tab Container widget where sub-widget layout changes (width, height, position) were not being saved. Also enhanced the Data Panel widget with snap-to-grid, aggregation support, and a visual formula builder.

---

## Files Changed (5)

| File | Changes |
|------|---------|
| `Frontend/src/Hooks/useReportBuilder.js` | Ref-based save, Data Panel tag collection |
| `Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx` | Async save handler |
| `Frontend/src/Pages/ReportBuilder/panels/PropertiesPanel.jsx` | Layout constraints |
| `Frontend/src/Pages/ReportBuilder/widgets/TabContainerWidget.jsx` | configRef fix, 12-col grid, drag support |
| `Frontend/src/Pages/ReportBuilder/widgets/DataPanelWidget.jsx` | Snap grid, aggregation, formula editor |
| `Frontend/src/Pages/ReportBuilder/widgets/WidgetRenderer.jsx` | Preview mode fix for sub-widgets |

---

## Bug Fixes

### 1. Tab Container sub-widget layout not saving

**Problem:** When resizing or repositioning widgets inside a Tab Container (e.g., Data Panel width), clicking Save and navigating to Preview would show the old layout. Height changes saved correctly but width and position changes were lost.

**Root Cause:** Multiple stale closure and async ref issues:

- `configRef` in `TabContainerWidget.jsx` was updated via async `useEffect` instead of synchronously during render. Any `updateConfig` call between render and effect would use stale data, overwriting layout changes.
- `performSave()` in `useReportBuilder.js` received `widgets` through closure-captured parameters from `saveLayout`, which could be stale by the time the save executed.
- `templateRef`, `tabsRef` were also updated via async `useEffect`, creating the same stale window.
- `saveLayout` was not `async` — it called `performSave()` without `await`, so `setSaving(false)` ran immediately before the API call completed.

**Fixes applied:**

- **`TabContainerWidget.jsx`** — Changed `configRef` from async `useEffect(() => { configRef.current = safeConfig })` to synchronous `configRef.current = safeConfig` during render (matches `DataPanelWidget` pattern).
- **`TabContainerWidget.jsx`** — Added eager `configRef` patch in `handleSubInteractionEnd`: after a drag/resize, the new positions are immediately written into `configRef.current` before the parent re-renders.
- **`useReportBuilder.js`** — Converted all save-critical refs (`templateRef`, `tabsRef`, `widgetsRef`, `parametersRef`, `computedSignalsRef`) from async `useEffect` to synchronous assignment during render.
- **`useReportBuilder.js`** — Rewrote `performSave()` to take no parameters — it reads directly from synchronous refs (`widgetsRef.current`, etc.) instead of closure-captured state. This eliminates all stale closure issues.
- **`useReportBuilder.js`** — Made `saveLayout` properly `async` with `await performSave()` wrapped in `try/finally`.
- **`ReportBuilderCanvas.jsx`** — Made `handleSave` async: `await saveLayout()` so the success indicator shows only after save completes.

### 2. Tab Container internal grid too restrictive (6 columns)

**Problem:** The Tab Container's internal grid had only 6 columns (`TC_GRID_COLS = 6`) while the parent canvas uses 12. This meant sub-widgets could only be positioned in 6 increments, and the Properties Panel showed misleading values (e.g., `W=12` was clamped to 6).

**Fix:** Changed `TC_GRID_COLS` from `6` to `12` in `TabContainerWidget.jsx`. Sub-widgets now have the same column granularity as the parent canvas. New sub-widgets default to full width (`w=12`).

### 3. Sub-widget drag not working inside Tab Container

**Problem:** Dragging sub-widgets inside the Tab Container moved the Tab Container itself instead of the sub-widget. The `mousedown` event bubbled up from the inner grid to the parent canvas grid.

**Fix:** Added `onMouseDown={(e) => e.stopPropagation()}` and `onTouchStart={(e) => e.stopPropagation()}` on the Tab Container's content area div. This prevents the parent grid from capturing drag events that originate inside the container.

### 4. Sub-widget body blocked all dragging

**Problem:** The sub-widget body div inside the Tab Container had `className="no-drag"` which, combined with `draggableCancel=".no-drag"` on the GridLayout, prevented dragging from anywhere on the widget.

**Fix:** Removed `no-drag` from the sub-widget body div. Now dragging works from anywhere on the sub-widget (same behavior as widgets outside the container). Only the delete button retains `no-drag`.

### 5. Preview mode incorrect for tab container sub-widgets

**Problem:** In `WidgetRenderer.jsx`, the `renderWidget` callback for tab container sub-widgets had `isPreview={false}` hardcoded. Sub-widgets inside the tab container never rendered in preview mode — they always showed editor-mode content.

**Fix:** Changed to `isPreview={isPreview}` (pass-through from parent) and `isReportBuilderWorkspace={!isPreview}`.

---

## New Features

### 6. Data Panel — Snap-to-Grid

**What:** Added visible grid lines and snap behavior to the Data Panel widget's freeform field positioning.

**Details:**
- Fields snap to 5% grid increments when dragging (move) or resizing
- Light grid lines are visible in editor mode showing snap points
- New fields start at snapped positions
- Constant `SNAP_STEP = 5` controls the grid granularity

**File:** `DataPanelWidget.jsx` — `snapPct()` function, updated `handleMove`/`handleResize` logic, grid line rendering in canvas area.

### 7. Data Panel — Aggregation Dropdown

**What:** Added an Aggregation dropdown to the Data Panel's "Edit input" modal for PLC Tag and Formula value types.

**Options:** Last, First (Start), Delta (End-Start), Average, Sum, Min, Max, Count — matching the Paginated Report's aggregation options.

**Details:**
- Appears in the FieldEditor modal between the tag/formula selector and the Display section
- Stored as `aggregation` field in each Data Panel field config (default: `'last'`)
- `collectWidgetTagNames` in `useReportBuilder.js` now collects tag names from Data Panel fields
- `collectWidgetTagAggregations` in `useReportBuilder.js` now includes each field's aggregation so the backend fetches data with the correct aggregation

**File:** `DataPanelWidget.jsx` (FieldEditor modal), `useReportBuilder.js` (tag collection functions).

### 8. Data Panel — Visual Formula Builder

**What:** Replaced the plain text input for formulas with the existing visual `FormulaEditor` component.

**Provides:**
- Tag dropdown with search — click "+ Tag" to pick from available tags
- Operator buttons — +, -, *, / and parentheses
- Number input for constants
- Function picker — AVG, SUM, MIN, MAX, etc.
- Visual mode with colored tag chips
- Advanced mode for raw text editing
- Live validation and result preview

**File:** `DataPanelWidget.jsx` — imported `FormulaEditor` from `../formulas/FormulaEditor`, replaced plain `<input>` in FieldEditor's formula section.

---

## Properties Panel Fix

### 9. Layout constraints for sub-widgets

**What:** The Properties Panel LAYOUT section (X, Y, W, H inputs) used hardcoded 12-column constraints for all widgets. Since the Tab Container now also uses 12 columns, both parent and sub-widget constraints are unified at 12.

**File:** `PropertiesPanel.jsx` — layout constraint grid uses `gridCols = 12` consistently.
