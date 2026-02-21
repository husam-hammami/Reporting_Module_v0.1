# Execution Prompt — Hercules UI Overhaul

> Paste this prompt into a new Claude Code session to execute the full UI overhaul plan.

---

## Prompt

You are implementing a 7-phase professional UI overhaul for the Hercules Reporting Module.

### Step 0 — Read the plan first

Read `plans/UI_changes/Report_Builder_UI_Overhaul.md` completely before writing any code. It is your single source of truth — every CSS value, class name, structural change, gotcha, and verification item is specified there. Do not improvise or deviate. When the plan gives exact CSS, use it exactly. When it names specific lines or components, verify them by reading the actual files first.

Also read the full contents of these files before starting each phase — you need to understand the current state before modifying:
- `Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx` (620 lines — canvas, widget rendering, drag-drop, keyboard shortcuts, layout)
- `Frontend/src/Pages/ReportBuilder/reportBuilderTheme.css` (282 lines — all CSS variables and component classes)
- `Frontend/src/Hooks/useReportBuilder.js` (the `useReportCanvas` hook — undo/redo system, widget CRUD, layout change handling)

### Critical rules — never violate these

1. **Cross-browser**: No CSS `zoom` property anywhere. Use `transform: scale()` for zoom with `transform-origin: top center`. Divide all drop coordinates by the zoom factor. Include `-webkit-backdrop-filter` alongside `backdrop-filter`. All features must work in Chrome, Firefox, Safari, and Edge.

2. **Don't rebuild existing systems**: Undo/redo already exists in `useReportCanvas` hook (`pastRef`/`futureRef`, 50 entries, `undo`/`redo`/`canUndo`/`canRedo`). Duplicate already exists as `Ctrl+D`. Delete already exists as `Delete` key handler. Wire buttons to these existing functions — do not create new implementations.

3. **Schema safety**: The `widget.locked` property needs no migration — `undefined` is falsy, so existing widgets behave as unlocked. Don't touch `templateSchema.js` migration logic.

4. **CSS variable discipline**: All new colors, shadows, and sizes must use existing `--rb-*` CSS variables from `reportBuilderTheme.css`. New variables only if absolutely necessary. All new CSS classes go in `reportBuilderTheme.css`, never inline styles for design tokens.

5. **Dark mode**: Every visual change must work in both light and dark mode. The dark mode overrides are in `.dark .report-builder { ... }` block. If you add a new light-mode style that uses hardcoded colors, add a dark-mode override too.

6. **Build verification**: Run `npx vite build` after each phase completes. Zero errors before moving to the next phase. If a build fails, fix it before proceeding.

7. **Read before edit**: Always read a file completely before editing it. Never edit based on assumptions about line numbers — the plan's line references are approximate and may have shifted.

### Execution order

Execute phases 1 through 7 in strict order. Each phase's exact changes, CSS classes, gotchas, and files are fully specified in the plan document. Here's what each phase does at a high level — refer to the plan for all specifics:

**Phase 1 — Canvas Page Boundary + Visual Foundation**
Wrap the canvas GridLayout in a centered page container. Remove dot grid background. Remove duplicate canvas caption. Darken canvas background for contrast. Add directional shadows on side panels. Replace the 3D gaming hover effect with subtle professional lift. Add min-height to widget cards. Style RGL resize handles. *See plan: Phase 1 for exact CSS values and DOM structure.*

**Phase 2 — Floating Canvas Toolbar**
Add frosted-glass pill toolbar at bottom-center of canvas with zoom controls, fit-to-page, grid snap toggle, undo/redo buttons. Implement zoom via `transform: scale()` with coordinate compensation in `handleCanvasDrop`. Remove undo/redo from the top header bar. Add zoom keyboard shortcuts. *See plan: Phase 2 for toolbar layout, CSS, and zoom math.*

**Phase 3 — Widget Selection + Interaction Polish**
Add 4 corner selection handles and floating mini-toolbar (Duplicate/Delete/Lock) on selected widgets. Add accent tint background + focus ring on selected state. Change hover to subtle dashed border. Replace heavy dark drag handle with light panel-colored style. Implement `handleDuplicate` and `handleToggleLock` callbacks. Add `locked` property to widgets mapping to RGL `static: true`. *See plan: Phase 3 for handle positioning, mini-toolbar CSS, and lock behavior.*

**Phase 4 — Components Panel Redesign**
Rewrite `WidgetToolbox.jsx`: add search input, collapsible accordion sections with accent left bar, 4-col grid with micro-labels, new Layers section listing canvas widgets. Reduce toolbox width from 300px to 260px. Add tinted header background. *See plan: Phase 4 for grid sizing, section structure, and layer list behavior.*

**Phase 5 — Properties Panel Polish**
Replace plain text Data/Format tabs with segmented control. Move "Show card" toggle into Format tab. Add section dividers with accent-colored icons. Group color pickers compactly when multiple. Add aggregation micro-descriptions. Restyle threshold rules with colored left borders. *See plan: Phase 5 for segmented control CSS, color group layout, aggregation descriptions map, and threshold card styling.*

**Phase 6 — Formula Editor & Selection Polish**
Replace native `<select>` for saved formulas with rich custom dropdown (name + expression preview + unit badge). Group operator buttons with visual separators. Replace bare red validation text with structured blocks. Render `{TagName}` as accent-colored chips in formula display on Engineering page. *See plan: Phase 6 for dropdown structure, operator grouping, validation CSS, and tag chip regex.*

**Phase 7 — Engineering Pages & Global Polish**
Add filled status badges and two-tone mapping chips in MappingManager. Improve Engineering tab bar hover/active states. Add content max-width constraint. Add breadcrumb and source-type icons in column editor. Add sidebar category headers (BUILD/VIEW/CONFIGURE). Add 3px LIVE/DEMO indicator bar at viewport top. *See plan: Phase 7 for badge CSS, chip structure, tab styling, sidebar header behavior, and indicator bar positioning.*

### After all phases complete

1. Run `npx vite build` one final time — zero errors and zero warnings.
2. Walk through all 29 verification items in the plan's "Verification" section. Confirm each passes. Report any that need attention.
3. Do NOT commit — leave changes for the user to review.

### Key file paths (all relative to Frontend/src/)

```
Pages/ReportBuilder/ReportBuilderCanvas.jsx     — main canvas (620 lines)
Pages/ReportBuilder/reportBuilderTheme.css       — design system CSS (282 lines)
Pages/ReportBuilder/panels/WidgetToolbox.jsx     — component toolbox (142 lines)
Pages/ReportBuilder/panels/PropertiesPanel.jsx   — properties editor (~960 lines)
Pages/ReportBuilder/panels/TagPicker.jsx         — tag selection dropdown
Pages/ReportBuilder/widgets/widgetDefaults.js    — widget catalog & factory
Pages/ReportBuilder/state/templateSchema.js      — schema & persistence (DO NOT modify migration logic)
Components/Shared/FormulaEditor.jsx              — formula input component
Components/Common/SideNav.jsx                    — left navigation drawer
Components/Navbar/Navbar.jsx                     — top navigation bar
Pages/Settings/Formulas/FormulaManager.jsx       — formula management page
Pages/Settings/Mappings/MappingManager.jsx       — mapping management page
Hooks/useReportBuilder.js                        — canvas state hook (undo/redo, widget CRUD)
```

### Architectural knowledge

- **Stack**: React 18, Vite, TailwindCSS 3, react-grid-layout, Framer Motion, lucide-react, MUI Tooltip
- **Grid**: 12 columns, 40px row height, `[8,8]` margin, `compactType={null}`, `allowOverlap={true}`
- **Drag-drop**: Toolbox sets `application/report-widget-type` MIME type → canvas reads in `handleCanvasDrop` → converts client coords to grid position via `getBoundingClientRect()`
- **ResizeObserver**: `containerRef` measures grid container width for RGL `width` prop. Under `transform: scale()`, it reports unscaled layout width — this is correct and should not be "fixed"
- **Widget state**: `{ id, type, x, y, w, h, config: { title, dataSource, unit, decimals, thresholds, showCard, ... } }`. No `locked` property exists yet — Phase 3 adds it
- **Undo/redo**: `useReportCanvas` hook → `pastRef.current` (max 50), `futureRef.current`. `pushToHistory(prevWidgets)` before mutations. Debounced 400ms for layout changes. Exposes `undo`, `redo`, `canUndo`, `canRedo`
- **Dark mode**: `.dark` class on root. CSS overrides in `.dark .report-builder { ... }`. All `--rb-*` variables have dark variants
- **Persistence**: Auto-save to API with localStorage fallback. Schema version 2. JSON stringify/parse. 2s debounce
- **Side panels**: Toolbox (left, 300px→260px after Phase 4) and Properties (right, 324px), both collapsible via Framer Motion `AnimatePresence`
- **Design language**: Flat, industrial, professional. No gradients on surfaces (except toolbox icon containers). No glossy effects. No playful animations. Shadows are subtle and functional.
