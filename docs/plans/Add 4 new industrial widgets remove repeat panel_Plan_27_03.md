# Add 4 New Industrial Widgets + Remove Repeat Panel

**Date:** 27/03/2026

## Context
The Report Builder has 11 working widgets + 1 dead placeholder (Repeat Panel). For cement/flour/feed mill operators, we need dedicated industrial widgets. Adding: Status Indicator, Sparkline Row, Progress Bar, and Hopper (rectangular bin/tank). Removing the unimplemented Repeat Panel.

## Pre-step: Pull latest
```bash
git checkout main && git pull origin main
git checkout Salalah_Mill_B && git pull origin Salalah_Mill_B
```

---

## Widget 1: Status Indicator (`status`)

**Purpose:** On/off/alarm traffic light for motors, conveyors, equipment.

**Visual:** Circle + label. Color determined by value against thresholds.
- Value = 0 → Gray circle, "STOPPED"
- Value = 1 → Green circle + pulse animation, "RUNNING"
- Value > threshold → Red circle + pulse, "ALARM"
- Customizable via zones

**Config:**
```javascript
{
  type: 'status',
  category: 'values',
  label: 'Status Indicator',
  lucideIcon: 'CircleDot',
  description: 'On/off/alarm status for equipment',
  defaultW: 2, defaultH: 1,
  defaultConfig: {
    title: 'Motor Status',
    dataSource: { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'last' },
    zones: [
      { from: 0, to: 0, color: '#6b7280', status: 'STOPPED' },
      { from: 1, to: 1, color: '#10b981', status: 'RUNNING' },
      { from: 2, to: 999, color: '#ef4444', status: 'ALARM' },
    ],
    showTitle: true, titleFontSize: 'md', showCard: true,
  },
}
```

**File:** `Frontend/src/Pages/ReportBuilder/widgets/StatusWidget.jsx`
- Use `resolveValue()` for data
- Match value against `config.zones` to get color + status label
- Render: colored circle (SVG, 24px) + status text + optional title
- Pulse animation on "RUNNING" state (CSS `animate-pulse` or keyframe)
- ~80 lines

---

## Widget 2: Sparkline Row (`sparkline`)

**Purpose:** Compact mini-chart + current value in one row. Stack multiple to see trends at a glance.

**Visual:** `[Title] ───────── [value unit]` with a tiny SVG sparkline between title and value.

**Config:**
```javascript
{
  type: 'sparkline',
  category: 'trends',
  label: 'Sparkline',
  lucideIcon: 'Activity',
  description: 'Compact trend line with current value',
  defaultW: 3, defaultH: 1,
  defaultConfig: {
    title: 'Sparkline',
    dataSource: { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'last' },
    unit: '', decimals: 1,
    color: '#3b82f6',
    showTitle: true, titleFontSize: 'sm', showCard: true,
  },
}
```

**File:** `Frontend/src/Pages/ReportBuilder/widgets/SparklineWidget.jsx`
- Use `resolveValue()` for current value
- Build sparkline from recent tag history (reuse KPIWidget's `buildSparklinePoints` pattern)
- SVG polyline path, ~40px tall, fills available width between title and value
- Gradient fill under the line (subtle)
- Use `useAnimatedNumber()` for the value display
- ~120 lines

---

## Widget 3: Progress Bar (`progress`)

**Purpose:** Horizontal bar showing percentage. Batch completion, bin fill, line utilization.

**Visual:** Horizontal rounded bar with fill percentage. Zone-colored. Value label inside or beside.

**Config:**
```javascript
{
  type: 'progress',
  category: 'values',
  label: 'Progress Bar',
  lucideIcon: 'BarChart3',
  description: 'Horizontal progress indicator with zones',
  defaultW: 3, defaultH: 1,
  defaultConfig: {
    title: 'Progress',
    dataSource: { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'last' },
    min: 0, max: 100,
    unit: '%', decimals: 1,
    zones: [
      { from: 0, to: 70, color: '#10b981' },
      { from: 70, to: 90, color: '#f59e0b' },
      { from: 90, to: 100, color: '#ef4444' },
    ],
    showTitle: true, titleFontSize: 'md', showCard: true,
    showValue: true,
  },
}
```

**File:** `Frontend/src/Pages/ReportBuilder/widgets/ProgressWidget.jsx`
- Use `resolveValue()`, clamp between min/max
- Calculate percent: `(value - min) / (max - min) * 100`
- Get zone color using SiloWidget's `getZoneColor()` pattern
- Render: title row + bar container (rounded, gray bg) + filled bar (transition width)
- Value displayed right-aligned or inside bar if wide enough
- CSS transition on width for smooth animation
- ~90 lines

---

## Widget 4: Hopper (`hopper`)

**Purpose:** Rectangular bin/tank/hopper fill visualization. Feed mills and flour mills have rectangular vessels.

**Visual:** SVG trapezoid shape (wide top, narrow bottom) with fill level. Simpler than Silo's 3D.

**Config:**
```javascript
{
  type: 'hopper',
  category: 'values',
  label: 'Hopper',
  lucideIcon: 'Container',
  description: 'Rectangular bin/tank fill level',
  defaultW: 2, defaultH: 2,
  defaultConfig: {
    title: 'Hopper',
    dataSource: { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'last' },
    capacityTag: '',
    unit: '%', decimals: 1,
    zones: [
      { from: 0, to: 70, color: '#10b981' },
      { from: 70, to: 90, color: '#f59e0b' },
      { from: 90, to: 100, color: '#ef4444' },
    ],
    showTitle: true, titleFontSize: 'md', showCard: true,
    showCapacity: false,
  },
}
```

**File:** `Frontend/src/Pages/ReportBuilder/widgets/HopperWidget.jsx`
- Use `resolveValue()` for fill percentage
- SVG trapezoid shape: wider at top, narrower at bottom (hopper shape)
- Fill level rises from bottom using clipPath or rect height
- Zone-colored fill using `getZoneColor()` pattern
- Optional capacity display (like SiloWidget's capacityTag)
- Percentage label centered on the vessel
- ~150 lines

---

## Registration Changes

### Remove Repeat Panel

**File:** `Frontend/src/Pages/ReportBuilder/widgets/widgetDefaults.js`
- Remove the `{ type: 'repeat', ... }` entry from WIDGET_CATALOG

**File:** `Frontend/src/Pages/ReportBuilder/panels/WidgetToolbox.jsx`
- Remove `repeat: 'Repeat'` from TYPE_LABELS (line 72)
- Remove `{ section: 'Layout', type: 'repeat', label: 'Repeat Panel' }` from TOOLBOX_ITEMS (line 69)

### Add New Widgets

**File:** `Frontend/src/Pages/ReportBuilder/widgets/widgetDefaults.js`
- Add 4 new entries to WIDGET_CATALOG (status, sparkline, progress, hopper)

**File:** `Frontend/src/Pages/ReportBuilder/widgets/WidgetRenderer.jsx`
- Import all 4 new widget components
- Add to RENDERERS map: `status: StatusWidget, sparkline: SparklineWidget, progress: ProgressWidget, hopper: HopperWidget`

**File:** `Frontend/src/Pages/ReportBuilder/panels/WidgetToolbox.jsx`
- Add to TOOLBOX_ITEMS:
  - `{ section: 'Values', type: 'status', label: 'Status Indicator' }`
  - `{ section: 'Trends', type: 'sparkline', label: 'Sparkline' }`
  - `{ section: 'Values', type: 'progress', label: 'Progress Bar' }`
  - `{ section: 'Values', type: 'hopper', label: 'Hopper' }`
- Add to TYPE_LABELS: `status: 'Status', sparkline: 'Spark', progress: 'Progress', hopper: 'Hopper'`

**File:** `Frontend/src/Pages/ReportBuilder/panels/PropertiesPanel.jsx`
- Add `'status'`, `'progress'`, `'hopper'`, `'sparkline'` to `HAS_DATA_SOURCE` set
- Add `'status'`, `'progress'`, `'hopper'` to `HAS_THRESHOLDS` set (for zones editing)
- Add widget-specific property conditions:
  - `progress`: min/max fields (like gauge)
  - `hopper`: capacityTag picker + showCapacity toggle (like silo)
  - `status`: uses zones only (no extra fields)
  - `sparkline`: color picker, unit, decimals

---

## Files Summary

| File | Change |
|------|--------|
| `widgets/StatusWidget.jsx` | **NEW** ~80 lines |
| `widgets/SparklineWidget.jsx` | **NEW** ~120 lines |
| `widgets/ProgressWidget.jsx` | **NEW** ~90 lines |
| `widgets/HopperWidget.jsx` | **NEW** ~150 lines |
| `widgets/widgetDefaults.js` | Remove repeat, add 4 new catalog entries |
| `widgets/WidgetRenderer.jsx` | Import + register 4 new widgets |
| `panels/WidgetToolbox.jsx` | Remove repeat from toolbox, add 4 new items + labels |
| `panels/PropertiesPanel.jsx` | Add to HAS_DATA_SOURCE/HAS_THRESHOLDS, add widget-specific props |

---

## Verification

1. Open Report Builder → see 4 new widgets in toolbox (Status, Sparkline, Progress, Hopper)
2. Repeat Panel no longer appears in toolbox
3. Drag Status Indicator → configure with BOOL tag → shows green/gray based on 1/0
4. Drag Progress Bar → set min/max → shows colored horizontal bar
5. Drag Sparkline → shows mini trend line + current value
6. Drag Hopper → shows rectangular vessel with fill level
7. All 4 widgets work with: single tag, formula, group aggregate
8. All 4 widgets have proper properties in right panel
9. Zone/threshold editing works for Status, Progress, Hopper
10. Existing 11 widgets still work (no regression)
11. Tag drag-drop onto new widgets works (from previous fix)
