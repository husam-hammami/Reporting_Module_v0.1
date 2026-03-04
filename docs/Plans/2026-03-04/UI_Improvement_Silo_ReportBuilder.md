# UI Improvement Plan — Silo Visualization & Report Builder Components

## Context

The Report Builder UI has visual issues identified from production screenshots:
1. Silo cylinders shrink and don't fill their widget cards when resized
2. The component palette (left sidebar) feels cramped with small icons
3. KPI/Stat cards have barely legible title fonts (9-10px)

---

## Problem Summary

1. **Silos shrink and don't fill their cards** — hard `max-h-[200px]` cap on both the SVG container and the SVG element prevents vertical scaling
2. **Report Builder widget palette** feels cramped — the 4-column icon grid is tight, labels are small
3. **KPI/Stat cards** have tiny title fonts (9-10px) and could have better visual hierarchy

---

## Changes

### 1. SiloWidget.jsx — Make silos fill their cards at any size

**Root cause:** Two `max-h-[200px]` constraints (line 59 on SVG, line 244 on container div) prevent the silo from growing beyond 200px regardless of card size.

**Fix:**
- **Remove `max-h-[200px]`** from both the SVG element (line 59) and its container div (line 244)
- Change container to `w-full flex-1 min-h-0 flex items-center justify-center` (no max-h cap)
- Change SVG to `w-full h-full` with `preserveAspectRatio="xMidYMid meet"` (center vertically instead of bottom-aligning)
- Reduce excessive outer padding from `clamp(8px, 1.2vw, 16px)` to `clamp(4px, 0.8vw, 10px)` so more space is used by the silo itself
- Make the percentage text inside the SVG scale better — use relative font size
- Increase stats text below silo from `text-lg` to responsive sizing

**Files:** `Frontend/src/Pages/ReportBuilder/widgets/SiloWidget.jsx`

### 2. widgetDefaults.js — Better default sizes

**Fix:**
- Change silo default from `2x4` to `3x5` (wider card = larger silo visual)
- Increase title font sizes from `{sm: 9px, md: 10px, lg: 12px}` to `{sm: 10px, md: 11px, lg: 13px}` — the current sizes are barely legible

**Files:** `Frontend/src/Pages/ReportBuilder/widgets/widgetDefaults.js`

### 3. WidgetToolbox.jsx — Polish the component palette

**Fix:**
- Increase icon grid from cramped 4-column to breathing 3-column layout for Visualizations (larger hit targets, easier to read labels)
- Increase icon size from `w-7 h-7` to `w-8 h-8`
- Add subtle descriptions below each icon label for the Visualizations section

**Files:** `Frontend/src/Pages/ReportBuilder/panels/WidgetToolbox.jsx`

### 4. KPIWidget.jsx & StatWidget.jsx — Improve visual hierarchy

**Fix:**
- Bump default title font by 1-2px for readability (uses shared `TITLE_FONT_SIZES`)
- Add subtle left color accent bar to KPI cards (2px solid border-left in activeColor) for visual punch — similar to industrial HMI dashboards

**Files:** `Frontend/src/Pages/ReportBuilder/widgets/KPIWidget.jsx`, `Frontend/src/Pages/ReportBuilder/widgets/StatWidget.jsx`

---

## Files Modified (5 total)

| File | Change |
|------|--------|
| `SiloWidget.jsx` | Remove max-h caps, reduce padding, center SVG, scale text |
| `widgetDefaults.js` | Silo default 3x5, bump title font sizes |
| `WidgetToolbox.jsx` | 3-col grid, larger icons |
| `KPIWidget.jsx` | Left accent bar |
| `StatWidget.jsx` | Left accent bar |

## Not Changed

- No theme/CSS token changes — all fixes are component-level
- No new dependencies
- No backend changes
- Existing widget configs remain backward-compatible (only defaults change for new widgets)

---

## Verification

- Start frontend dev server (`npm run dev` in Frontend/)
- Navigate to Report Builder > open Grain_Silos template
- Verify silos fill their cards at all sizes (resize a silo widget from 2x2 to 4x6)
- Verify component palette has 3-column icon grid with larger icons
- Verify KPI cards have readable titles and accent bars
- Check dark mode renders correctly
- Check print preview (Ctrl+P) doesn't break layouts
