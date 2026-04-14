# 2026-04-06 — Nested Tab Container selection, Data Panel clone, Report Viewer loading

**Date:** 2026-04-06  
**Related:** See also [`2026-04-06-tab-container-fixes.md`](./2026-04-06-tab-container-fixes.md) for Tab Container save/grid fixes, Data Panel snap/aggregation/formula/time-scope, and preview tab switching from the same day.

---

## Summary

| Area | What changed |
|------|----------------|
| **Report Builder — nested Tab Container** | Selecting a sub-widget inside an inner Tab Container (e.g. Data Panel) now opens the correct widget in the Properties panel; updates and sub-grid layout apply at the correct depth. |
| **Data Panel** | Each input can be **duplicated** from the canvas or from the Edit input modal, with a new id and a slight position offset. |
| **Report Viewer** | **Historical loading** state no longer gets stuck `true`, which previously set `pointer-events: none` on the report body and blocked clicks (including table row → tab switching), especially noticeable in the desktop app. |

---

## 1. Nested Tab Container — properties and layout at depth

### Problem

With an **outer** Tab Container selected on the canvas, clicking a widget **inside** a **nested** Tab Container did not update the right-hand Properties panel: it kept showing the outer container. Sub-widget updates and inner grid layout changes could also target the wrong level.

### Root cause

- Recursive `WidgetRenderer` inside Tab Containers did not pass `onSubWidgetSelect`, `selectedSubWidgetId`, or `onSubLayoutChange`, so inner Tab Containers never notified the canvas.
- `editingSubWidget` and `updateSubWidgetViaCanvas` only looked at **direct** children of the outer container’s **active** tab, not nested `tabcontainer` → tab → `widgets` trees.
- `handleSubLayoutChangeViaCanvas` only patched a Tab Container found as a **top-level** grid widget, so nested Tab Container layout callbacks could not persist.

### Solution

**New utility module** — `Frontend/src/Pages/ReportBuilder/utils/nestedTabWidgets.js`

- `findWidgetDeepInTabContainer(tabContainerWidget, targetId)` — depth-first search across all `config.tabs[].widgets[]`, recursing into nested `tabcontainer` nodes.
- `updateNestedWidgetDeep(widgetNode, targetId, updates)` — applies a widget patch at the matching id anywhere in that tree.
- `patchTabContainerSubLayout(widgetNode, targetTabContainerId, layout)` — applies react-grid-layout positions to the **active** tab of the tab container with the given id, at any depth under a top-level widget.

**`ReportBuilderCanvas.jsx`**

- `editingSubWidget` resolves via `findWidgetDeepInTabContainer(parent, subWidgetInfo.subWidget.id)` instead of a flat active-tab lookup.
- `updateSubWidgetViaCanvas` maps every tab’s root `widgets` with `updateNestedWidgetDeep` for the target id.
- `handleSubLayoutChangeViaCanvas` maps each top-level widget with `patchTabContainerSubLayout(w, parentWidgetId, newLayout)` so nested tab container ids are handled.

**`WidgetRenderer.jsx`**

- The recursive `WidgetRenderer` used in Tab Container `renderWidget` now receives `onSubWidgetSelect`, `selectedSubWidgetId`, and `onSubLayoutChange` (same pass-through as the canvas-level instance).

### Files touched

| File | Role |
|------|------|
| `Frontend/src/Pages/ReportBuilder/utils/nestedTabWidgets.js` | **New** — deep find / update / layout helpers |
| `Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx` | Deep resolve, deep update, deep layout patch |
| `Frontend/src/Pages/ReportBuilder/widgets/WidgetRenderer.jsx` | Pass-through callbacks and selection id into nested renderers |

---

## 2. Data Panel — duplicate (clone) inputs

### Feature

Users can **clone** an existing input field quickly:

- **On canvas** (Data Panel selected): each field shows a **copy** control next to **remove** in the top-right. Tooltip: *Duplicate input*.
- **In the “Edit input” modal**: **Duplicate input** saves the current row (including unsaved draft edits), inserts a copy **after** it with a **new** `id`, offsets position so it does not sit exactly on top of the source, selects the copy, and keeps the editor open on the new field for quick edits.

### Implementation notes

- `offsetDuplicatePosition(base)` — moves the copy one snap step down, or to the right if that would overflow the panel bottom; clamps within the panel.
- Field action buttons use `data-dp-field-actions` so clicks do not start a drag.
- Reuses existing `fieldId()` for new ids.

### Files touched

| File | Role |
|------|------|
| `Frontend/src/Pages/ReportBuilder/widgets/DataPanelWidget.jsx` | `duplicateField`, `duplicateFromEditor`, UI buttons, `Copy` icon import |

---

## 3. Report Viewer — `historicalLoading` and blocked clicks

### Problem

While historical tag data is loading, the viewer sets `pointerEvents: 'none'` on the main report scroll container. If `historicalLoading` never returned to `false` (e.g. effect cleanup before the success path ran, or early return without clearing loading when switching to Live / empty tags), **all** clicks in the report body failed — including **table row → tab** linking (`ReportTableTabLinkContext`).

This could show up more often in **Electron** (effect churn, strict mode) than in a simple browser session.

### Fix

**`Frontend/src/Pages/Reports/ReportViewer.jsx`** — historian `useEffect`:

1. Early returns (`Live` mode, no tags, no date range) call `setHistoricalLoading(false)` before returning.
2. Success path only updates tag values when `!cancelled`; **`finally`** calls `setHistoricalLoading(false)` when `!cancelled`.
3. Effect **cleanup** sets `cancelled = true` and **`setHistoricalLoading(false)`** so superseded or unmounted fetches cannot leave the UI stuck.

---

## Verification checklist

- [ ] Outer Tab Container selected → inner Tab Container → click Data Panel → Properties shows Data Panel; edits persist; nested grid drag/resize saves.
- [ ] Data Panel: duplicate from field chrome and from modal; cloned field has new id and visible offset.
- [ ] Report Viewer: historical time range → wait for load → table rows clickable; switch to Live → report body remains clickable; table row → tab still works when linking is configured.

---

## Build

After pulling these changes, rebuild the frontend and refresh the backend’s bundled `dist` if you ship the desktop app:

```bash
cd Frontend && npm run build
```

Then copy `Frontend/dist` into the backend static folder used by Flask / the packaged `hercules-backend` bundle, and rebuild the desktop installer if applicable.
