# 2026-04-08 — Tab Container isolation, dark-mode selection, preview lock-down

**Date:** 2026-04-08  
**Branch:** Salalah_Mill_B  
**Related:** [`2026-04-06-tab-container-fixes.md`](./2026-04-06-tab-container-fixes.md), [`2026-04-06-nested-tabs-datapanel-clone-viewer-loading.md`](./2026-04-06-nested-tabs-datapanel-clone-viewer-loading.md)

---

## Summary

| Area | What changed |
|------|--------------|
| **Tab Container — tab isolation** | Copied tabs (C32 → M30 → M31) no longer share widget IDs; editing one tab no longer affects the others. |
| **Tab Container — preview lock** | Inner widgets are fully frozen (`static`) in preview / viewer; drag-and-drop only works in the editor. |
| **Dark mode — selection chrome** | Softer selection borders/shadows via CSS variables instead of hard-coded accent outlines. |
| **Dark mode — Data Panel theme** | Saved light-mode hex colors fall back to theme tokens in dark mode. |

---

## Bug Fixes

### 1. "Copy from…" tab created duplicate widget IDs across tabs

**Problem:** When adding a new tab via "Copy from…" (e.g. copying C32 to create M30), the inner `JSON.parse` + `forEach(w => w.id = uid())` only re-assigned ids for **top-level** widgets in the copied tab. Nested widgets inside inner Tab Containers, Data Panels, or Table drill-down kept the **same** ids as the source tab. Any property edit via the Properties panel then updated **every** tab that contained a widget with that id.

**Root cause:** `addTab` in `TabContainerWidget.jsx` did a shallow id remap instead of using `cloneWidgetTreeWithNewIds`, which recursively assigns fresh ids for nested tab containers, their tabs, sub-widgets, and table drill-down detail widgets.

**Fix:**

| File | Change |
|------|--------|
| `TabContainerWidget.jsx` — `addTab` | Replaced `JSON.parse(JSON.stringify(…)) + forEach(w.id = uid())` with `(src.widgets \|\| []).map(w => cloneWidgetTreeWithNewIds(w))`. |

### 2. Properties panel showed wrong tab's widget (first match by id)

**Problem:** `findWidgetDeepInTabContainer` searched **all** tabs top-to-bottom and returned the **first** match. With duplicate ids from old copies, Properties always displayed C32's widget even when M30 or M31 was the active tab. Edits appeared to propagate across tabs because the display never switched.

**Fix:**

| File | Change |
|------|--------|
| `nestedTabWidgets.js` — `findWidgetDeepInTabContainer` | Added optional `preferActiveTabId` parameter. When provided, searches the active tab first; falls back to all tabs only if not found (unique-id case). |
| `ReportBuilderCanvas.jsx` — `editingSubWidget` memo | Passes the tab container's `config.activeTabId` to `findWidgetDeepInTabContainer` so Properties resolves the correct copy. |

### 3. `updateSubWidgetViaCanvas` updated every tab, not just the active one

**Problem:** When editing a sub-widget's properties from the Properties panel, `updateSubWidgetViaCanvas` ran `updateNestedWidgetDeep` across **all** tab rows. With duplicate ids, one edit changed all copies (C32 + M30 + M31).

**Fix:**

| File | Change |
|------|--------|
| `ReportBuilderCanvas.jsx` — `updateSubWidgetViaCanvas` | Resolves `activeTabId` from the tab container config and only patches widgets within that tab. Other tabs are returned unchanged. |

### 4. Inner widgets movable in preview / viewer

**Problem:** Widgets inside a Tab Container could still be dragged/repositioned in preview mode (`/report-builder/:id/preview`) and the Report Viewer. The outer grid used `static` to lock items, but the Tab Container's inner `GridLayout` only set `isDraggable={false}` / `isResizable={false}`, which doesn't fully prevent `react-grid-layout` from shifting items via compaction or pointer events.

**Fix:**

| File | Change |
|------|--------|
| `TabContainerWidget.jsx` — `propsLayout` | Each layout item gets `static: true` when `canEdit` is false (preview, viewer, or unselected tab container). |
| `TabContainerWidget.jsx` — `canEdit` | Now includes `!isPreview` in the guard: `Boolean(!isPreview && isSelected && onUpdate && widgetId)`. |
| `TabContainerWidget.jsx` — `renderWidget` | `onUpdateSubWidget` is only passed to nested widgets when `canEdit` is true, preventing nested containers from seeing a truthy `onUpdate` in read-only mode. |

---

## Dark Mode Improvements

### 5. Softer selection chrome (borders/shadows)

**Problem:** Selected widgets in dark mode used full `var(--rb-accent)` (`#5b9bd5`) for borders and box-shadows, producing a harsh bright-blue outline that clashed with the muted dark theme.

**Fix:**

| File | Change |
|------|--------|
| `reportBuilderTheme.css` | Added `--rb-selection-border`, `--rb-selection-shadow`, `--rb-selection-outline` tokens. Dark mode uses `color-mix()` for softer values. New `.rb-canvas-invisible-selected` class for outline-only selection on invisible widgets. |
| `ReportBuilderCanvas.jsx` | Removed inline `borderColor` / `boxShadow` on selected widgets; selection now driven by `.rb-widget-selected` CSS class using the new tokens. Invisible selected widgets use `.rb-canvas-invisible-selected`. |
| `TabContainerWidget.jsx` | Removed inline `style` with `borderColor` / `boxShadow` on selected sub-widgets; selection handled by `.rb-widget-card.rb-widget-selected` class only. |

### 6. Data Panel — saved light-mode colors fall back to theme tokens in dark mode

**Problem:** Data Panel borders, headers, and backgrounds could store hex values from light mode (e.g. `#e5e7eb`, `#e2e8f0`). These persisted in the report JSON and rendered unchanged in dark mode, producing washed-out or mismatched styling.

**Fix:**

| File | Change |
|------|--------|
| `utils/themeChrome.js` (new) | `resolveDataPanelBorderCss`, `resolveDataPanelFieldBorderCss`, `resolveDataPanelHeaderBgForDark`, `resolveDataPanelHeaderColorForDark`, `resolveDataPanelPanelBgForDark` — map known light hex sets to `var(--rb-border)` or `undefined` (CSS defaults) when dark mode is active. |
| `hooks/useReportBuilderDark.js` (new) | `useReportBuilderDark()` hook via `useSyncExternalStore` + `MutationObserver` on `<html class="dark">`. |
| `DataPanelWidget.jsx` | Uses the dark-mode hook and resolvers for `panelBorderCss`, header chrome, legend title color, panel background, and field border colors. |

---

## Files Changed (complete list)

| File | Summary |
|------|---------|
| `Frontend/src/Pages/ReportBuilder/widgets/TabContainerWidget.jsx` | `canEdit` guard adds `!isPreview`; `addTab` uses `cloneWidgetTreeWithNewIds`; `onUpdateSubWidget` conditional on `canEdit`; layout items get `static: true` in read-only; removed inline selection styles. |
| `Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx` | `editingSubWidget` passes `activeTabId` to scoped search; `updateSubWidgetViaCanvas` scoped to active tab; removed inline selection `borderColor`/`boxShadow`; invisible-selected uses `.rb-canvas-invisible-selected`. |
| `Frontend/src/Pages/ReportBuilder/utils/nestedTabWidgets.js` | `findWidgetDeepInTabContainer` accepts optional `preferActiveTabId` for scoped search. |
| `Frontend/src/Pages/ReportBuilder/widgets/widgetDefaults.js` | (unchanged — `cloneWidgetTreeWithNewIds` already existed) |
| `Frontend/src/Pages/ReportBuilder/reportBuilderTheme.css` | New selection tokens, dark-mode `color-mix` values, `.rb-canvas-invisible-selected`. |
| `Frontend/src/Pages/ReportBuilder/widgets/DataPanelWidget.jsx` | Dark-mode resolvers for borders/headers/backgrounds. |
| `Frontend/src/Pages/ReportBuilder/hooks/useReportBuilderDark.js` | New hook for dark-mode detection. |
| `Frontend/src/Pages/ReportBuilder/utils/themeChrome.js` | New utility for resolving light hex to dark tokens. |
