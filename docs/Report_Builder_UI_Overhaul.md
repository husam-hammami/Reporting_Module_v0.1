# Plan: Hercules Reporting Module — Professional UI Overhaul

## Context

The Hercules Reporting Module is functional but lacks the visual polish of professional tools like Grafana, Power BI, or Figma. This plan addresses improvements across the entire application: the Report Builder canvas, Properties panel, Formula editor, Engineering settings pages, and global navigation. Organized into 7 phases — the first 4 are canvas-focused (original scope), phases 5–7 extend to the rest of the application.

**Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge). No CSS `zoom` property — all scaling via `transform: scale()` with proper coordinate compensation. `color-mix()` requires Chrome 111+, Firefox 113+, Safari 16.2+ (all current).

---

## Phase 1 — Canvas Page Boundary + Visual Foundation

**Goal:** Add a defined "report sheet" centered on a neutral canvas desk, establish proper elevation hierarchy, and fix canvas/widget contrast.

### What changes

**`ReportBuilderCanvas.jsx`** (lines ~495–592 — canvas section):
- Wrap the GridLayout in a new `.rb-page-container` — centered, `max-w-[1200px]`, white bg, subtle shadow
- Remove `rb-canvas-dots` from outer container (dot grid is gone — clean professional look)
- The outer canvas area becomes just `rb-canvas-surface` (neutral gray/dark desk)
- `containerRef` (for ResizeObserver width measurement) stays on the inner grid wrapper inside the page
- Remove the canvas caption ("Report Name — Report Layout") — the top header bar already shows the report name with a rename pencil icon, so duplicating it on canvas adds noise

```
Canvas scroll area (rb-canvas-surface, neutral gray)
└── Centering wrapper (flex justify-center, py-6 px-6)
    └── Page container (rb-page-container, max-w-[1200px], white bg, shadow)
        └── Grid wrapper (containerRef, px-6 pt-3 pb-6)
            └── <GridLayout />
```

**`reportBuilderTheme.css`** — changes:

**1. Canvas/widget contrast fix — darken canvas desk:**
```css
--rb-canvas: hsl(216, 18%, 88%);           /* was hsl(214, 22%, 93%) — 5% darker */
--rb-canvas-dark: hsl(220, 50%, 7%);       /* was hsl(218, 47%, 9%) — darker */
```

**2. Page container:**
```css
.rb-page-container {
  background: var(--rb-panel);
  border: 1px solid var(--rb-border);
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06);
  min-height: 60vh;
}
```

**3. Side panel directional shadows — elevation hierarchy:**
```css
/* Toolbox panel casts shadow rightward onto canvas */
.rb-panel-left-shadow {
  box-shadow: 4px 0 12px rgba(0,0,0,0.06);
}
/* Properties panel casts shadow leftward onto canvas */
.rb-panel-right-shadow {
  box-shadow: -4px 0 12px rgba(0,0,0,0.06);
}
.dark .rb-panel-left-shadow { box-shadow: 4px 0 12px rgba(0,0,0,0.2); }
.dark .rb-panel-right-shadow { box-shadow: -4px 0 12px rgba(0,0,0,0.2); }
```
Apply `.rb-panel-left-shadow` to the toolbox `motion.div` and `.rb-panel-right-shadow` to the properties `motion.div`.

**4. Widget hover — replace 3D gaming effect with professional subtle lift:**
```css
.report-builder .rb-widget-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px var(--rb-border);
  border-color: var(--rb-accent);
  /* Removed: translateY(-8px), scale(1.02), cyan holographic glow */
}
.dark .report-builder .rb-widget-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 0 1px var(--rb-border);
}
```

**5. Widget card minimum height — prevent tiny scattered cards:**
- Small widgets (Stat, Divider) render as tiny cards that look like scraps on the canvas
- Enforce a `min-height` on all widget wrappers to align to 2 grid rows:
```css
.report-builder .react-grid-item {
  min-height: 80px; /* 2 × 40px row height */
}
```
- This ensures even compact widgets have breathing room and the canvas reads as a cohesive layout rather than scattered Post-it notes

**6. Style RGL resize handles to match design system:**
```css
.report-builder .react-resizable-handle {
  background: none;
}
.report-builder .react-resizable-handle::after {
  border-color: var(--rb-accent) !important;
  width: 7px !important;
  height: 7px !important;
}
```

### Gotchas
- `handleCanvasDrop` calculates drop position via `getBoundingClientRect()` on the grid element — this already uses relative coordinates, so centering the page doesn't break it
- Empty state ("Start designing your report") renders inside the page container naturally
- Removing the canvas caption is safe — the header bar (`template?.name`) is the single source of truth for report name

---

## Phase 2 — Floating Canvas Toolbar

**Goal:** Small frosted-glass pill at the bottom-center of the canvas viewport with zoom, fit-to-page, grid snap, and undo/redo. Remove undo/redo from the top header bar to avoid duplication.

### What changes

**`ReportBuilderCanvas.jsx`**:
- Add new state: `const [zoom, setZoom] = useState(1)` and `const [gridSnap, setGridSnap] = useState(true)`
- Wrap the canvas scroll area in a `relative` container so the toolbar can position `absolute bottom-4 left-1/2`
- Add `FloatingCanvasToolbar` component (defined inline or extracted)
- Remove undo/redo icons from the top header bar — they now live exclusively in the floating toolbar
- Add keyboard shortcuts: `Ctrl+=/- ` for zoom, `Ctrl+0` to reset

**Zoom implementation — `transform: scale()` approach (cross-browser):**
- Apply `transform: scale(zoom)` + `transform-origin: top center` on the page container
- The page container must **not** shrink the parent — set `width: 1200px` explicitly and let the scroll area handle overflow
- All coordinate translations in `handleCanvasDrop` must divide client offsets by `zoom`:
  ```js
  const rect = gridElement.getBoundingClientRect();
  const x = (e.clientX - rect.left) / zoom;
  const y = (e.clientY - rect.top) / zoom;
  ```
- `getBoundingClientRect()` returns **scaled** dimensions when `transform: scale()` is applied, so the division naturally corrects both position and size
- `handleFitToPage`: calculates `zoom = canvasViewportWidth / 1200`, clamped to [0.5, 1.5]

**Undo/Redo — wire existing system:**
- `useReportCanvas` hook already provides `undo`, `redo`, `canUndo`, `canRedo` (via `pastRef`/`futureRef` with 50-entry history)
- The toolbar simply renders buttons that call these existing functions
- Disable buttons when `!canUndo` / `!canRedo`
- Keyboard shortcuts `Ctrl+Z` / `Ctrl+Y` are already wired in the canvas `keyDown` handler

**Toolbar contents** (left to right):
```
[ − ] 100% [ + ]  |  ⛶ Fit  ⊞ Snap  |  ↶ Undo  ↷ Redo
```

**`reportBuilderTheme.css`** — add frosted toolbar classes:
```css
.rb-floating-toolbar {
  position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%);
  z-index: 50; display: flex; align-items: center; gap: 2px;
  padding: 4px 8px; border-radius: 9999px;
  background: hsla(0,0%,100%,0.8); backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--rb-border); box-shadow: 0 2px 12px rgba(0,0,0,0.1);
}
.dark .rb-floating-toolbar {
  background: hsla(218, 47%, 9%, 0.85);
}
```

**New icons needed:** `Minus`, `Plus`, `Maximize`, `Grid3x3`, `Undo2`, `Redo2` (all from lucide-react, already installed)

### Gotchas
- Grid snap toggle: RGL is inherently grid-based, can't do pixel-free positioning. The toggle shows/hides a faint grid overlay as a visual aid
- `-webkit-backdrop-filter` required for Safari support
- `transform: scale()` on page container changes its visual size but **not** its layout size — parent scroll area must use `overflow: auto` to allow scrolling to scaled content. At `zoom > 1` the page overflows and becomes scrollable; at `zoom < 1` it shrinks visually with empty space around it
- When zoom changes, the ResizeObserver on `containerRef` still reports the **unscaled** width (layout width), which is correct for RGL column calculations

---

## Phase 3 — Widget Selection + Interaction Polish

**Goal:** When a widget is selected, show clear visual handles at corners + a floating mini-toolbar above the widget with Duplicate, Delete, and Lock actions. Improve hover, selected, and drag handle aesthetics.

### What changes

**`ReportBuilderCanvas.jsx`** (lines ~541–588, widget `.map()`):

**3a. Selection handles + mini-toolbar:**
- Change widget wrapper from `overflow-hidden` to `overflow-visible` (so toolbar can extend above)
- Move `overflow-hidden` to the inner widget body div
- When `selectedId === widget.id`, render:
  - 4 corner handle spans (small accent-colored squares, `pointer-events: none` to not block RGL resize handles)
  - Floating mini-toolbar positioned `bottom: calc(100% + 6px)`, centered via `left: 50%; transform: translateX(-50%)`
- Mini-toolbar buttons: **Duplicate** (Copy icon), **Delete** (Trash2 icon), **Lock/Unlock** (Lock/Unlock icon)
- Toolbar wrapped in `<AnimatePresence>` + `<motion.div>` for fade in/out

**3b. Improved selected widget state:**
- Add accent tint background + focus ring on selected widget:
  ```
  background: color-mix(in srgb, var(--rb-accent) 3%, var(--rb-panel));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rb-accent) 12%, transparent);
  ```

**3c. Subtle hover state (non-selected widgets):**
- Replace hard solid border jump with a subtle dashed border on hover:
  ```
  border: 1px dashed var(--rb-accent)/40  (on hover, non-selected only)
  ```

**3d. Lighter drag handle:**
- Replace the dark pill (`bg-[var(--rb-text)]/80 text-white`) with a lighter, more transparent handle:
  ```css
  background: var(--rb-panel);
  border: 1px solid var(--rb-border);
  color: var(--rb-text-muted);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  ```

**New callbacks:**
- `handleDuplicate(widgetId)` — clone widget, offset Y position by +2 rows, auto-select the clone, push to undo history
- `handleToggleLock(widgetId)` — toggle `widget.locked` boolean. When locked, add `static: true` to the layout entry so RGL prevents drag/resize

**Widget `locked` property — schema impact:**
- Add `locked: false` as default in widget creation (`addWidget` in `useReportCanvas`)
- The `locked` field serializes naturally with JSON — no schema migration needed since `undefined` is falsy (existing widgets without `locked` behave as unlocked)
- When `locked === true`, the RGL layout item gets `static: true`, which disables both drag and resize
- Visual indicator: locked widgets show a small lock icon badge in their top-right corner + reduced opacity on hover (no lift effect)

**`reportBuilderTheme.css`** — add:
```css
.rb-selection-handle {
  position: absolute; z-index: 20;
  width: 8px; height: 8px;
  background: var(--rb-accent); border: 1.5px solid var(--rb-panel);
  border-radius: 2px; pointer-events: none;
}
.rb-widget-minitoolbar {
  position: absolute; bottom: calc(100% + 6px);
  left: 50%; transform: translateX(-50%); z-index: 30;
  display: flex; align-items: center; gap: 2px;
  padding: 3px 6px; border-radius: 9999px;
  background: var(--rb-text);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.rb-widget-minitoolbar button {
  color: var(--rb-text-inverse);
  opacity: 0.85;
  transition: opacity 0.15s;
}
.rb-widget-minitoolbar button:hover {
  opacity: 1;
}

/* Drag handle — light style */
.rb-drag-handle {
  background: var(--rb-panel);
  border: 1px solid var(--rb-border);
  color: var(--rb-text-muted);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  border-radius: var(--rb-radius);
  font-size: var(--rb-font-xs);
}
```

**New icons needed:** `Copy`, `Trash2`, `Lock`, `Unlock` (lucide-react)

### Gotchas
- Corner handles MUST use `pointer-events: none` to not block RGL's resize handles
- Mini-toolbar clipping at page top edge: if widget is at `y=0`, toolbar goes above the page container — this is fine since the page has no `overflow: hidden`
- The `no-drag` class on mini-toolbar buttons prevents accidental widget dragging when clicking
- Duplicate already exists as `Ctrl+D` keyboard shortcut — this just adds a visual button for it
- `color-mix()` supported in all target browsers (Chrome 111+, Firefox 113+, Safari 16.2+)

---

## Phase 4 — Components Panel Redesign

**Goal:** Make the left sidebar denser, more organized, with collapsible sections, search filtering, a Layers panel, and improved visual treatment for tiles and headers.

### What changes

**`WidgetToolbox.jsx`** (panels/) — major rewrite:

**4a. Header with tinted background:**
- Keep "Components" title + add a search/filter input below it
- Tint the header area with `var(--rb-surface)` background (slightly different from panel white) to create visual separation from content

**4b. Section headers with accent bar:**
- Each section header gets a `2px` left border in `var(--rb-accent)` to give visual authority
- Collapsible accordion toggle (ChevronDown icon rotates)

**4c. Visualization tiles — 4-col with micro-labels:**
- Change from 3-col to **4-col grid** with smaller tiles (~48px)
- Keep a tiny truncated label (9px, max ~6 chars) below each icon — icons like Silo, Stat, and Repeat are custom SVGs that aren't universally recognizable, so pure icon-only would hurt discoverability
- Remove tile outer border, use subtle shadow instead for a more solid feel:
  ```css
  border: none;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  ```
- Icon container gets a more prominent gradient background:
  ```css
  background: linear-gradient(135deg, var(--rb-surface), var(--rb-canvas));
  ```

**4d. Structure section:**
- Collapsible accordion (same row layout, just add toggle)
- Truncate descriptions at 260px width

**4e. Layers section (new):**
- Collapsed by default
- Shows a sorted list of all widgets currently on canvas (sorted by Y position)
- Each item: type icon + widget name/label + type badge
- Click → selects widget on canvas + opens properties panel
- Widget count in section header: "LAYERS (5)"
- Click-to-select only (no drag-to-reorder z-index — deferred to future)

**`ReportBuilderCanvas.jsx`**:
- Reduce toolbox width from `300px` to `260px` (line ~485)
- Pass new props to WidgetToolbox: `widgets`, `selectedId`, `onSelectWidget`

**New state in WidgetToolbox:**
- `search` (string) — filters component tiles
- `openSections` (object) — `{ Visualizations: true, Structure: true, Layers: false }`

**`reportBuilderTheme.css`** — add:
```css
/* Toolbox header — tinted background */
.rb-toolbox-header {
  background: var(--rb-surface);
  border-bottom: 1px solid var(--rb-border);
}

/* Section accordion headers — with left accent bar */
.rb-toolbox-accordion-header {
  width: 100%; display: flex; align-items: center;
  justify-content: space-between;
  padding: 8px 12px; font-size: 10px; font-weight: 600;
  color: var(--rb-text-muted); letter-spacing: 0.05em;
  text-transform: uppercase; cursor: pointer;
  user-select: none;
  border-left: 2px solid var(--rb-accent);
}
.rb-toolbox-accordion-header:hover {
  color: var(--rb-text);
}
```

### Gotchas
- 7 visualization items in 4-col grid → 2 rows (last row has 3 items + 1 empty slot) — looks fine
- Micro-labels should truncate at tile width (~48px) — "Stat Pa..." becomes "Stat" with tooltip for full name
- Search clears on section collapse; sections with no matches auto-hide

---

## Phase 5 — Properties Panel Polish

**Goal:** Elevate the properties panel from functional to professionally polished with better tab controls, color picker layout, threshold styling, and aggregation hints.

### What changes

**`PropertiesPanel.jsx`** (panels/):

**5a. Segmented control tabs (replace plain text tabs):**
- Replace the "Data" | "Format" text tabs with a pill-shaped segmented control
- Active segment gets filled background with `var(--rb-accent-subtle)` + `var(--rb-accent)` text
- Inactive segment is transparent
```css
.rb-segmented-control {
  display: inline-flex; padding: 2px; border-radius: 8px;
  background: var(--rb-surface); border: 1px solid var(--rb-border);
}
.rb-segmented-control button {
  padding: 6px 16px; border-radius: 6px; font-size: var(--rb-font-sm);
  font-weight: 600; transition: all 0.15s;
}
.rb-segmented-control button.active {
  background: var(--rb-accent-subtle); color: var(--rb-accent);
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
}
```

**5b. Move "Show card (border & background)" toggle into Format tab:**
- Currently floats between tabs and content — belongs in Format tab as first item
- Group it under a "Card Appearance" sub-header

**5c. Section dividers with accent icons:**
- Add a thin `1px solid var(--rb-border)` top divider before each `Section` component (except the first)
- Section icon color → `var(--rb-accent)` instead of inheriting text color

**5d. Compact color picker groups:**
- When multiple color pickers appear together (table has 5: header bg, header text, row bg, striped, border), group them into compact rows:
```
Header   [ ■ bg ] [ ■ text ]
Rows     [ ■ bg ] [ ■ alt  ] [ ■ border ]
```
- Use 20px swatches in horizontal flow instead of full-width stacked rows
```css
.rb-color-group {
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
}
.rb-color-swatch {
  width: 20px; height: 20px; border-radius: 4px; cursor: pointer;
  border: 1.5px solid var(--rb-border);
  transition: border-color 0.15s, transform 0.15s;
}
.rb-color-swatch:hover {
  border-color: var(--rb-accent); transform: scale(1.15);
}
```

**5e. Aggregation dropdown with micro-description:**
- Add a dynamic hint below the aggregation select that explains the selected mode:
```
Aggregation: [Last ▼]
↳ "Uses the most recent value from the data source"
```
- Descriptions: Last = "Most recent value", Avg = "Average over time range", Sum = "Total accumulated", Min = "Lowest recorded", Max = "Highest recorded", Count = "Number of data points", Delta = "Change from first to last"

**5f. Threshold rules — colored-border cards:**
- Give each threshold rule a colored left border matching its assigned color + subtle card background:
```css
.rb-threshold-rule {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: var(--rb-radius);
  background: var(--rb-surface);
  border-left: 3px solid var(--threshold-color);
}
```

### Gotchas
- Segmented control must handle keyboard navigation (arrow keys to switch tabs)
- Compact color pickers need a popover for hex input on click — not inline
- Aggregation descriptions are static strings, no API calls needed

---

## Phase 6 — Formula Editor & Selection Polish

**Goal:** Upgrade the formula dropdown from native `<select>` to a rich custom dropdown, improve the formula editor operator grouping, and enhance formula display across the app.

### What changes

**6a. Rich formula dropdown** (`PropertiesPanel.jsx` — saved formulas select):
- Replace native `<select>` with a custom dropdown panel showing formula name + expression preview + unit badge:
```
┌─────────────────────────────────────┐
│ Milling Loss                     %  │
│ 100 - {Flour_Extraction} - ...      │
├─────────────────────────────────────┤
│ Specific Energy              kWh/t  │
│ {Power_Consumption} / {Mill_...     │
└─────────────────────────────────────┘
```
- Formula expression shown in monospace `var(--rb-font-xs)`, truncated with ellipsis
- Unit as a right-aligned badge (`.rb-badge`)
- Click-outside or Escape to close
- Search/filter at top if > 5 formulas

```css
.rb-formula-dropdown {
  position: absolute; z-index: 40; width: 100%;
  background: var(--rb-panel); border: 1px solid var(--rb-border);
  border-radius: var(--rb-radius-lg);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  max-height: 240px; overflow-y: auto;
}
.rb-formula-dropdown-item {
  padding: 10px 12px; cursor: pointer;
  border-bottom: 1px solid var(--rb-border);
  transition: background 0.1s;
}
.rb-formula-dropdown-item:hover {
  background: var(--rb-accent-subtle);
}
```

**6b. Grouped operator buttons** (`FormulaEditor.jsx`):
- Add visual separators (1px dividers or 12px gaps) between logical button groups:
```
[ + Tag ]  │  [ + ] [ - ] [ * ] [ / ]  │  [ ( ] [ ) ]  │  [ 123 ] [ Fn ]
─ insert ─   ──── arithmetic ─────────   ── group ──     ── values ──
```
- `+ Tag` button gets accent color (primary action)
- Arithmetic operators get monospace font

**6c. Proper validation message styling** (`FormulaEditor.jsx`):
- Replace bare red text with a structured inline validation block:
```css
.rb-formula-validation {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px; border-radius: var(--rb-radius);
  font-size: var(--rb-font-xs);
}
.rb-formula-validation.error {
  background: color-mix(in srgb, var(--rb-danger) 8%, transparent);
  color: var(--rb-danger);
}
.rb-formula-validation.success {
  background: color-mix(in srgb, var(--rb-success) 8%, transparent);
  color: var(--rb-success);
}
```
- Add `AlertCircle` icon before error messages, `CheckCircle` before success

**6d. Tag chips in formula display** (`FormulaManager.jsx` — engineering page):
- When displaying formula expressions on the Formulas settings page, render `{TagName}` references as inline colored chips:
```
100 - [Flour_Extraction] - [Bran_Extraction] = 8.30 %
        ↑ accent-colored pill     ↑ accent-colored pill
```
- Parse the formula string, replace `{...}` patterns with styled `<span>` elements
- Display-only enhancement — underlying string unchanged

```css
.rb-formula-tag-chip {
  display: inline-flex; padding: 1px 6px;
  border-radius: 4px; font-size: var(--rb-font-xs);
  font-family: monospace;
  background: var(--rb-accent-subtle);
  color: var(--rb-accent);
  border: 1px solid color-mix(in srgb, var(--rb-accent) 20%, transparent);
}
```

### Files modified
- `Frontend/src/Pages/ReportBuilder/panels/PropertiesPanel.jsx` — formula dropdown
- `Frontend/src/Components/Shared/FormulaEditor.jsx` — operator groups, validation
- `Frontend/src/Pages/Settings/Formulas/FormulaManager.jsx` — tag chips in display

### Gotchas
- Custom formula dropdown needs keyboard navigation (arrow keys, Enter to select)
- Tag chip parsing: use regex `/\{([^}]+)\}/g` — already used in formula evaluation
- Chips are display-only — clicking them in the formula display does nothing (not editable)

---

## Phase 7 — Engineering Pages & Global Polish

**Goal:** Bring the Engineering settings pages and global navigation up to the same professional standard as the Report Builder improvements.

### What changes

**7a. Mappings — improved chips and badges** (`MappingManager.jsx`):
- **Active/Off badge**: Replace text-only with filled pill badges:
```css
.rb-status-badge-active {
  background: color-mix(in srgb, var(--rb-success) 15%, transparent);
  color: var(--rb-success); font-weight: 600;
  padding: 2px 10px; border-radius: 9999px; font-size: var(--rb-font-xs);
}
.rb-status-badge-off {
  background: var(--rb-surface);
  color: var(--rb-text-muted); font-weight: 600;
  padding: 2px 10px; border-radius: 9999px; font-size: var(--rb-font-xs);
}
```

- **Two-tone mapping chips**: Show input value in bolder/mono styling, arrow as separator, output in regular text:
```css
.rb-mapping-chip {
  display: inline-flex; align-items: center; gap: 0;
  border-radius: 6px; overflow: hidden;
  font-size: var(--rb-font-xs); border: 1px solid var(--rb-border);
}
.rb-mapping-chip-input {
  padding: 3px 8px;
  background: var(--rb-surface);
  font-family: monospace; font-weight: 600;
  color: var(--rb-text);
}
.rb-mapping-chip-arrow {
  padding: 3px 4px; color: var(--rb-text-muted);
}
.rb-mapping-chip-output {
  padding: 3px 8px;
  background: var(--rb-panel);
  color: var(--rb-text);
}
```

**7b. Engineering tab bar — improved hover/active states** (`Settings page`):
- Increase active indicator from 2px to 3px bottom border
- Add hover state with subtle background pill:
```css
.rb-settings-tab {
  padding: 10px 16px; font-size: var(--rb-font-sm);
  font-weight: 500; color: var(--rb-text-muted);
  border-bottom: 3px solid transparent;
  transition: all 0.15s;
}
.rb-settings-tab:hover {
  color: var(--rb-text);
  background: var(--rb-accent-subtle);
  border-radius: 6px 6px 0 0;
}
.rb-settings-tab.active {
  color: var(--rb-accent);
  border-bottom-color: var(--rb-accent);
  font-weight: 600;
}
```

**7c. Content area max-width** (all Engineering pages):
- Add `max-width: 960px` + `margin: 0 auto` to the main content container
- Prevents the "New Formula" / "New Mapping" buttons from floating far right on wide screens
- Keeps content readable and compact

**7d. Table column editor breadcrumb** (`PropertiesPanel.jsx` — TableColumnsSection):
- Add a breadcrumb at the top of the column editor modal:
```
Data Table > Column 1
```
- Shows context of which widget is being edited

**7e. Column source type icons** (`PropertiesPanel.jsx` — ColumnEditor):
- Add tiny icons before each source type radio option:
```
🏷 Tag  │  ƒ Formula  │  ⊞ Group  │  Aa Static
```
- Use lucide icons: `Tag`, `Function`, `Grid3x3`, `Type`

**7f. Sidebar navigation category headers** (`SideNav.jsx`):
- Add subtle section headers above nav items:
```
BUILD
  Report Builder

VIEW
  Reporting

CONFIGURE
  Engineering
```
- Headers: `font-size: 9px`, uppercase, `var(--rb-text-muted)`, `letter-spacing: 0.1em`
- Only shown when sidebar is expanded (hidden in collapsed 48px state)

**7g. Prominent LIVE/DEMO indicator** (`Navbar.jsx`):
- Add a 3px colored bar at the very top of the viewport:
  - LIVE → `var(--rb-success)` green
  - DEMO → `var(--rb-warning)` amber
- Full width, persistent, above the navbar
- Adds clear operational context that's impossible to miss

### Files modified
- `Frontend/src/Pages/Settings/Mappings/MappingManager.jsx` — chip styling, badge styling
- `Frontend/src/Pages/Settings/Formulas/FormulaManager.jsx` — tag chips (from Phase 6d)
- Engineering page layout (tab bar container) — max-width + tab styles
- `Frontend/src/Pages/ReportBuilder/panels/PropertiesPanel.jsx` — breadcrumb, source type icons
- `Frontend/src/Components/Common/SideNav.jsx` — category headers
- `Frontend/src/Components/Navbar/Navbar.jsx` — LIVE/DEMO top bar
- `Frontend/src/Pages/ReportBuilder/reportBuilderTheme.css` — all new CSS classes

### Gotchas
- Sidebar category headers must hide gracefully in collapsed mode (48px width) — use `opacity: 0` + `height: 0` with transition
- Content max-width may need adjustment per page — Mappings with wide lookup tables might need `max-width: 1100px`
- LIVE/DEMO bar is 3px tall — minimal but highly visible. Must not push down fixed navbar — use `position: fixed; top: 0` and add 3px top padding to navbar

---

## Implementation Order

| Phase | Improvement | Why this order | Files |
|-------|-------------|----------------|-------|
| 1 | Canvas page boundary + visual foundation | Foundation — changes canvas layout, elevation, contrast | Canvas, CSS |
| 2 | Floating canvas toolbar | Introduces zoom state that the page boundary container uses | Canvas, CSS |
| 3 | Widget selection + interaction polish | Renders inside page container, hover/drag/select refinements | Canvas, CSS |
| 4 | Components panel redesign | Isolated to WidgetToolbox, no dependencies on other phases | Toolbox, Canvas, CSS |
| 5 | Properties panel polish | Isolated to PropertiesPanel, purely visual | Properties, CSS |
| 6 | Formula editor & selection polish | Touches FormulaEditor + Properties + FormulaManager | FormulaEditor, Properties, FormulaManager, CSS |
| 7 | Engineering pages & global polish | Fully isolated, no dependencies on phases 1–6 | Settings pages, SideNav, Navbar, CSS |

---

## Files Modified

| # | File | Phases | Scope |
|---|------|--------|-------|
| 1 | `ReportBuilder/ReportBuilderCanvas.jsx` | 1,2,3,4 | Canvas restructure, zoom/snap state, floating toolbar, selection handles, toolbox props |
| 2 | `ReportBuilder/reportBuilderTheme.css` | 1–7 | All new CSS classes, variable updates, component styles |
| 3 | `ReportBuilder/panels/WidgetToolbox.jsx` | 4 | Full rewrite — accordion, 4-col grid, search, layers |
| 4 | `ReportBuilder/panels/PropertiesPanel.jsx` | 5,6,7 | Segmented tabs, color groups, thresholds, formula dropdown, breadcrumb, source icons |
| 5 | `Components/Shared/FormulaEditor.jsx` | 6 | Operator groups, validation styling |
| 6 | `Settings/Formulas/FormulaManager.jsx` | 6 | Tag chips in formula display |
| 7 | `Settings/Mappings/MappingManager.jsx` | 7 | Two-tone chips, status badges |
| 8 | `Components/Common/SideNav.jsx` | 7 | Category headers |
| 9 | `Components/Navbar/Navbar.jsx` | 7 | LIVE/DEMO top bar |
| 10 | Engineering page layout/tabs | 7 | Tab bar styling, content max-width |

## New State Variables

| Variable | Location | Type | Default |
|----------|----------|------|---------|
| `zoom` | ReportBuilderCanvas | number | 1 |
| `gridSnap` | ReportBuilderCanvas | boolean | true |
| `widget.locked` | per widget (serialized) | boolean | false (undefined = unlocked) |
| `search` | WidgetToolbox | string | '' |
| `openSections` | WidgetToolbox | object | `{Visualizations:true, Structure:true, Layers:false}` |
| `formulaDropdownOpen` | PropertiesPanel | boolean | false |

## Existing Systems Reused (not rebuilt)

| System | Location | What we wire |
|--------|----------|-------------|
| Undo/Redo | `useReportCanvas` hook (`pastRef`/`futureRef`, 50 entries) | Toolbar buttons call existing `undo`/`redo` functions |
| Duplicate | `Ctrl+D` handler in canvas `keyDown` | Mini-toolbar button calls same handler |
| Delete | `Delete` key handler in canvas `keyDown` | Mini-toolbar button calls same `removeWidget` |
| Formula parsing | `evaluateFormula` regex `/\{([^}]+)\}/g` | Tag chip rendering in display mode |

---

## Cross-Browser Considerations

| Feature | Approach | Browser notes |
|---------|----------|---------------|
| Zoom | `transform: scale()` + `transform-origin: top center` | Works everywhere. No CSS `zoom` property. |
| Coordinate correction | Divide `clientX/Y` offsets by zoom factor | `getBoundingClientRect()` returns scaled dimensions under `transform`, so division corrects naturally |
| Frosted glass toolbar | `backdrop-filter: blur()` + `-webkit-backdrop-filter: blur()` | Safari needs `-webkit-` prefix. Firefox 103+ supports unprefixed. Graceful degradation: solid bg fallback. |
| `color-mix()` | Selected widget tint, validation backgrounds, threshold tints | Chrome 111+, Firefox 113+, Safari 16.2+ — all current versions. |
| Framer Motion animations | `<AnimatePresence>` + `<motion.div>` | Already used throughout the app, works everywhere |
| `pointer-events: none` | On selection handles | Universal support |
| `user-select: none` | On accordion headers | Universal support |

---

## Verification

### Phase 1–4 (Canvas)
1. `npx vite build` — 0 errors
2. **Canvas page boundary:** White page sheet centered on darker gray canvas, widgets render inside, empty state centered in page, no duplicate report name caption
3. **Elevation hierarchy:** Side panels cast directional shadows onto canvas, clear visual depth layers
4. **Widget hover:** Subtle 1px lift with accent border — no cyan glow, no 8px jump, no scale
5. **Resize handles:** Styled in accent color, consistent with design system
6. **Floating toolbar:** Frosted pill at bottom-center, zoom in/out works (50%–150%), fit-to-page calculates correct zoom, undo/redo wired to existing history stack, grid snap toggles dot overlay
7. **Widget selection:** Click widget → accent tint background + focus ring + 4 corner handles + mini-toolbar appears above. Duplicate creates clone below. Lock prevents drag/resize (via RGL `static`). Delete removes widget.
8. **Drag handle:** Light panel-colored pill, not dark/heavy
9. **Components panel:** Sections collapse/expand, 4-col grid with micro-labels + tooltips, search filters items, Layers section lists all canvas widgets, clicking a layer selects the widget, toolbox header has tinted bg, section headers have accent left bar
10. **Dark/light mode:** All improvements render correctly in both modes
11. **Drag-and-drop:** Dragging from toolbox to canvas still works with page boundary + zoom (coordinates divided by zoom factor)
12. **Cross-browser:** Test in Chrome, Firefox, Safari, Edge — zoom, backdrop-filter, transforms, color-mix all work correctly

### Phase 5 (Properties Panel)
13. **Segmented tabs:** Pill-shaped Data/Format control with filled active state + keyboard navigation
14. **Show card toggle:** Lives inside Format tab, not floating between tabs and content
15. **Color pickers:** Grouped compactly when multiple (table gets 2-row layout not 5 stacked rows)
16. **Aggregation hints:** Dynamic description appears below dropdown on selection
17. **Threshold rules:** Each rule has colored left border matching its color, card-style background

### Phase 6 (Formula)
18. **Formula dropdown:** Rich custom dropdown with name + expression preview + unit badge, replaces native `<select>`
19. **Operator buttons:** Grouped with visual separators (insert | arithmetic | grouping | values), `+ Tag` is accent-colored
20. **Validation messages:** Structured blocks with icon + tinted background, not bare red text
21. **Formula display:** Tag references render as accent-colored chips on Formulas settings page

### Phase 7 (Engineering & Global)
22. **Mapping chips:** Two-tone (bold mono input | regular output), not uniform
23. **Status badges:** Filled pill (green "Active", gray "Off"), not text-only
24. **Tab bar:** 3px active indicator, hover pill state, improved visual weight
25. **Content width:** Constrained to 960px, buttons aligned with content
26. **Column editor:** Shows breadcrumb "Data Table > Column 1"
27. **Source type radios:** Each has an icon (Tag, Function, Grid, Type)
28. **Sidebar:** Category headers (BUILD / VIEW / CONFIGURE) when expanded
29. **LIVE/DEMO bar:** 3px colored bar at very top of viewport, always visible
