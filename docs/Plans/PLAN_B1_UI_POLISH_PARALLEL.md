# Plan B-1 — UI/UX Polish (Parallel with Plan A)

> **Purpose:** Typography upgrade (Inter + JetBrains Mono), light mode color fix, ColumnEditor dark mode, MUI Tooltips on all toolbars, Live Data Indicator, Silo Widget SVG 3D upgrade.
>
> **Date:** 2026-02-19
> **Branch:** `demo-pipeline-wiring`
> **Project root:** `C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config`
> **Prerequisite:** None — runs in **parallel with Plan A**. Plan B-1 agents touch only frontend CSS, component files, and SVG widgets. No overlap with Plan A backend/settings files.
> **Followed by:** Plan B-2 (Export, Documentation, Full QA, Commit & Push) — runs after BOTH Plan A and Plan B-1 complete.

---

## Confirmed Architecture (Codebase-Audited — Do Not Change)

| Item | Confirmed Value |
|------|----------------|
| Flask port | `5001` |
| axios baseURL (dev) | `http://localhost:5001` |
| Current font (to replace) | `Arial, Helvetica, sans-serif !important` (`index.css` line 7) |
| Light mode `:root` | Lines 21-41 in `index.css` — warm gray hues (20/25/60) need shift to cool blue-gray (214) |
| Dark mode `.dark` | Lines 51-73 in `index.css` — **do NOT modify** |
| Report Builder CSS vars | `reportBuilderTheme.css` — `var(--rb-border)`, `var(--rb-panel)`, `var(--rb-surface)`, `var(--rb-text)`, `var(--rb-text-muted)`, `var(--rb-accent)` |
| ColumnEditor function | `TableWidget.jsx` lines 591-849 — hardcoded hex colors to replace with CSS vars |
| Tooltip pattern (existing) | `<Tooltip title={...} placement="top" arrow disableInteractive>` (in `BPActionButton.jsx`, `ActionButton.jsx`) |
| ReportBuilderCanvas toolbar | Lines 355-444 — search for `title=` attributes to replace with MUI Tooltip |
| ReportBuilderPreview toolbar | Lines 164-204 — search for `title=` or button elements in toolbar |
| SiloWidget SVG | `Silo2DSvg()` function lines 37-80 in `SiloWidget.jsx`, viewBox `0 0 100 118`, props: `fillPercent`, `fillColor` |
| html2canvas | v1.4.1 already installed |

**Data flow:** Browser → axios → Flask (5001) → PostgreSQL (5432 local)

---

## File Overlap Safety — Why This Runs Parallel with Plan A

| File | Plan A touches? | Plan B-1 touches? | Conflict? |
|------|----------------|-------------------|-----------|
| `index.html` | No | Agent 1 (fonts) | No |
| `tailwind.config.js` | No | Agent 1 (fonts) | No |
| `index.css` | No | Agent 1 (:root colors) | No |
| `TableWidget.jsx` | No | Agent 2 (ColumnEditor) | No |
| `Navbar.jsx` | No | Agent 2 (tooltips) | No |
| `DarkModeButton.jsx` | No | Agent 2 (tooltips) | No |
| `ReportBuilderCanvas.jsx` | No | Agent 2 (tooltips) | No |
| `ReportBuilderPreview.jsx` | No | Agents 2, 3 (tooltips, indicator) | No |
| `WidgetToolbox.jsx` | No | Agent 2 (tooltips) | No |
| `SiloWidget.jsx` | No | Agent 4 (SVG) | No |
| `LiveDataIndicator.jsx` | No | Agent 3 (new file) | No |
| `SettingsHome.jsx` | Agents 3, 4 | No | No |
| `AppRoutes.jsx` | Agents 3, 4 | No | No |
| `app.py` | Agents 1, 2 | No | No |
| `ReportViewer.jsx` | Agent 3 (shifts) | No | No — Plan B-2 Agent 1 adds export later |

**Conclusion:** Zero file conflicts between Plan A and Plan B-1. Safe to run in parallel.

---

## Agent 1 — "Typography + Light Mode Color Fix" (~10 min)

**Scope:** CSS + config only. Replace Arial with Inter + JetBrains Mono, fix warm gray hues in light mode.
**Run:** Start a new Claude Code session and give it this agent's section.
**Dependencies:** None — can run first.

### Tasks

**1. Add Google Fonts to `Frontend/index.html`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend\index.html

Read the file first. In <head>, before <title>, add:
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

**2. Add font families to `Frontend/tailwind.config.js`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend\tailwind.config.js

Read the file first. Inside theme.extend (after the existing borderRadius block, before the closing }), add:
  fontFamily: {
    sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
    mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
  },
```

**3. Update `Frontend/src/index.css`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend\src\index.css

Read the file first.

Line 7: Replace:
  font-family: Arial, Helvetica, sans-serif !important;
With:
  font-family: 'Inter', system-ui, -apple-system, sans-serif !important;

Lines 21-41 (:root block ONLY — do NOT touch .dark block lines 51-73):

Replace these warm gray values:
  --foreground: hsl(20, 14.3%, 4.1%)        →  --foreground: hsl(214, 14%, 4%)
  --muted: hsl(60, 4.8%, 95.9%)             →  --muted: hsl(214, 12%, 96%)
  --muted-foreground: hsl(25, 5.3%, 44.7%)  →  --muted-foreground: hsl(214, 8%, 45%)
  --popover-foreground: hsl(20, 14.3%, 4.1%) → --popover-foreground: hsl(214, 14%, 4%)
  --card-foreground: hsl(20, 14.3%, 4.1%)    → --card-foreground: hsl(214, 14%, 4%)
  --border: hsl(20, 5.9%, 90%)               → --border: hsl(214, 10%, 90%)
  --input: hsl(20, 5.9%, 90%)                → --input: hsl(214, 10%, 90%)
  --secondary: hsl(60, 4.8%, 95.9%)          → --secondary: hsl(214, 12%, 96%)
  --secondary-foreground: hsl(24, 9.8%, 10%) → --secondary-foreground: hsl(214, 10%, 10%)
  --accent: hsl(60, 4.8%, 95.9%)             → --accent: hsl(214, 12%, 96%)
  --accent-foreground: hsl(24, 9.8%, 10%)    → --accent-foreground: hsl(214, 10%, 10%)
  --destructive-foreground: hsl(60, 9.1%, 97.8%) → --destructive-foreground: hsl(0, 0%, 100%)
  --ring: hsl(20, 14.3%, 4.1%)               → --ring: hsl(214, 14%, 4%)

CRITICAL: Do NOT change --primary, --primary-foreground, --theme-* variables.
CRITICAL: Do NOT change ANYTHING in the .dark {} block (lines 51-73).
```

### Verify

```bash
# Check font reference
grep "Inter" Frontend/index.html
grep "Inter" Frontend/src/index.css
grep "Inter" Frontend/tailwind.config.js

# Check warm grays removed from :root
grep "hsl(20," Frontend/src/index.css
grep "hsl(60," Frontend/src/index.css
grep "hsl(25," Frontend/src/index.css
grep "hsl(24," Frontend/src/index.css
# All above should return 0 matches (only in :root, which we changed)
```

Browser check:
- Hard refresh (Ctrl+Shift+R) → Network tab shows Inter font loading from Google Fonts
- Light mode: backgrounds are cool blue-gray, not warm yellow/beige
- Dark mode: completely unchanged
- Existing `font-mono` elements render JetBrains Mono

### Failure Handling

| Problem | Fix |
|---------|-----|
| Font not loading | Check `index.html` — `<link>` tags must be inside `<head>`, before `</head>` |
| Tailwind not picking up fonts | Restart dev server (`npm run dev`) — Tailwind needs config reload |
| Dark mode changed | Verify `.dark {}` block (lines 51-73) is untouched — compare with git |
| `:root` variables broken | Compare before/after — only the hue should change (20→214, 60→214, 25→214, 24→214) |
| Some elements still Arial | The `!important` on line 7 overrides everything — verify the replacement |

### Success Criteria

- [ ] `index.html` has Google Fonts `<link>` tags for Inter and JetBrains Mono
- [ ] `tailwind.config.js` has `fontFamily.sans` and `fontFamily.mono`
- [ ] `index.css` line 7 uses Inter instead of Arial
- [ ] All `:root` warm grays shifted to cool blue-gray (hue 214)
- [ ] `.dark` block completely unchanged (verify with `git diff`)
- [ ] Light mode backgrounds are cool blue-gray, not warm/yellow
- [ ] Dark mode visually identical to before

---

## Agent 2 — "ColumnEditor Dark Mode + MUI Tooltips" (~15 min)

**Scope:** Frontend only. Fix ColumnEditor hardcoded colors + add MUI Tooltips to icon-only buttons.
**Run:** New Claude Code session. Context: "Agent 1 completed. Fonts and light mode colors updated."
**Dependencies:** After Agent 1 (fonts loaded for visual verification).

### Tasks

**1. Fix ColumnEditor dark mode in `Frontend/src/Pages/ReportBuilder/widgets/TableWidget.jsx`:**

```
Read the ENTIRE file first.
Read Frontend/src/Styles/reportBuilderTheme.css to see available CSS variables and their light/dark values.

Find the ColumnEditor function (search for "function ColumnEditor" — around lines 591-849).

Replace hardcoded hex colors WITH CSS variables ONLY within the ColumnEditor function:
  #e3e9f0  →  var(--rb-border)
  #6b7f94  →  var(--rb-text-muted)
  bg-white →  bg-[var(--rb-panel)]
  #2a3545  →  var(--rb-text)
  #f5f8fb  →  var(--rb-surface)
  #f9fafb  →  var(--rb-surface)
  #f0f5fa  →  var(--rb-surface)

IMPORTANT: Only replace within the ColumnEditor function (lines 591-849).
Do NOT change colors outside the ColumnEditor function — other components may use same hex values intentionally.
For each replacement, verify it makes semantic sense (border colors → rb-border, text → rb-text, etc.).
```

**2. Add MUI Tooltips to Navbar buttons:**

```
File: Frontend/src/Components/Navbar/Navbar.jsx

Read the file first. Find icon-only buttons:
  - Hamburger/menu toggle button
  - DEMO/LIVE mode badge
  - User avatar/icon button

Add import: import { Tooltip } from '@mui/material';

Wrap each with:
  <Tooltip title="Toggle menu" placement="bottom" arrow disableInteractive>
    <button ...existing...>
  </Tooltip>

  <Tooltip title="Demo mode active" placement="bottom" arrow disableInteractive>
    <span ...DEMO badge...>
  </Tooltip>

  <Tooltip title="User menu" placement="bottom" arrow disableInteractive>
    <button ...avatar...>
  </Tooltip>
```

**3. Add Tooltip to DarkModeButton:**

```
File: Frontend/src/Components/Common/DarkModeButton.jsx

Read the file. Add import: import { Tooltip } from '@mui/material';
Wrap the toggle button:
  <Tooltip title={isDark ? "Switch to light mode" : "Switch to dark mode"} placement="bottom" arrow disableInteractive>
    <button ...existing...>
  </Tooltip>

Check for isDark state variable name — it may be `darkMode`, `isDarkMode`, etc. Read the file first.
```

**4. Replace HTML `title=` with MUI Tooltip in ReportBuilderCanvas.jsx:**

```
File: Frontend/src/Pages/ReportBuilder/ReportBuilderCanvas.jsx

Read the toolbar section (search for the Back button and toolbar area).
Add import: import { Tooltip } from '@mui/material';

Replace EACH button's title= attribute with a wrapping <Tooltip>:
  Back button: title="Back" → <Tooltip title="Back to reports" placement="bottom" arrow disableInteractive>
  Components panel toggle → <Tooltip title="Components panel" ...>
  Properties panel toggle → <Tooltip title="Properties panel" ...>
  Undo → <Tooltip title="Undo (Ctrl+Z)" ...>
  Redo → <Tooltip title="Redo (Ctrl+Shift+Z)" ...>
  Preview → <Tooltip title="Preview report" ...>
  Save → <Tooltip title="Save layout" ...>
  Publish → <Tooltip title="Publish report" ...>

IMPORTANT: Remove the HTML title= attribute from each button after adding the MUI Tooltip wrapper.
```

**5. Replace HTML `title=` with MUI Tooltip in ReportBuilderPreview.jsx:**

```
File: Frontend/src/Pages/ReportBuilder/ReportBuilderPreview.jsx

NOTE: This file will also be modified by Agent 3 (LiveDataIndicator) and Plan B-2 Agent 1 (Export).
Only modify the tooltip portions here.

Read the toolbar section. Add import: import { Tooltip } from '@mui/material';

Replace HTML title= with MUI Tooltips:
  Back button → <Tooltip title="Back to editor" placement="bottom" arrow disableInteractive>
  Fullscreen → <Tooltip title="Toggle fullscreen" ...>
  Print button → <Tooltip title="Print report" ...>
```

**6. Replace HTML `title=` with MUI Tooltip in WidgetToolbox.jsx:**

```
File: Frontend/src/Pages/ReportBuilder/panels/WidgetToolbox.jsx

Read the file. Find widget type buttons (they likely have title= attributes).
Replace each with MUI Tooltip wrapper. Add import at top.
```

### Verify

- Dark mode: Open Report Builder → add Table widget → open ColumnEditor → backgrounds should be dark, text readable
- Hover any toolbar button → MUI tooltip with arrow appears (not browser native tooltip)
- All tooltips have: `arrow`, `disableInteractive`, appropriate `placement`
- No HTML `title=` attributes remain on modified toolbar buttons
- No double tooltips (MUI + browser native)

### Failure Handling

| Problem | Fix |
|---------|-----|
| Tooltip import error | `import { Tooltip } from '@mui/material'` — MUI is already installed in this project |
| Tooltip doesn't show on disabled button | Wrap in `<span>`: `<Tooltip ...><span><button disabled ...></span></Tooltip>` |
| ColumnEditor still light in dark mode | Verify CSS variable replacements — check `reportBuilderTheme.css` has both light and dark values for each var |
| Double tooltip (MUI + browser native) | Remove the HTML `title=` attribute when adding MUI `<Tooltip>` wrapper |
| Tooltip on wrong side | Use `placement="bottom"` for top-bar buttons, `placement="top"` for bottom elements |
| ColumnEditor hex replacement breaks other colors | Only replace within the ColumnEditor function scope; verify each replacement semantically (borders→rb-border, text→rb-text) |

### Success Criteria

- [ ] ColumnEditor modal has dark background/text/borders in dark mode
- [ ] All Navbar icon buttons have MUI tooltips
- [ ] DarkModeButton has contextual tooltip (changes text based on current mode)
- [ ] ReportBuilderCanvas: all toolbar buttons have MUI tooltips
- [ ] ReportBuilderPreview: all toolbar buttons have MUI tooltips
- [ ] WidgetToolbox: widget type buttons have MUI tooltips
- [ ] No HTML `title=` attributes remain on any modified buttons

---

## Agent 3 — "Live Data Refresh Indicator" (~10 min)

**Scope:** Frontend only. Create reusable indicator component + integrate into ReportBuilderPreview.
**Run:** New Claude Code session. Context: "Agent 2 completed. ReportBuilderPreview.jsx has MUI Tooltips on toolbar."
**Dependencies:** After Agent 2 (Agent 2 added tooltips to `ReportBuilderPreview.jsx`).

### Tasks

**1. Create `Frontend/src/Components/Common/LiveDataIndicator.jsx`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend\src\Components\Common\LiveDataIndicator.jsx

import React, { useState, useEffect, useRef } from 'react';

export default function LiveDataIndicator({ lastUpdated, className = '' }) {
  const [secondsAgo, setSecondsAgo] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsAgo(prev => prev + 1);
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    setSecondsAgo(0);
  }, [lastUpdated]);

  return (
    <div className={`inline-flex items-center gap-2 print:hidden ${className}`}>
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
      </span>
      <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
        {secondsAgo}s ago
      </span>
    </div>
  );
}
```

**2. Integrate into `Frontend/src/Pages/ReportBuilder/ReportBuilderPreview.jsx`:**

```
Read the file first — Agent 2 modified it for tooltips.

Add import:
  import LiveDataIndicator from '../../Components/Common/LiveDataIndicator';

Add state near other useState declarations:
  const [lastDataUpdate, setLastDataUpdate] = useState(Date.now());

Find where live tag values are updated (search for "setLiveTagValues", "setTagValues", or the WebSocket data callback).
After the data state is set, add: setLastDataUpdate(Date.now());

In the toolbar, find the "Preview Mode" badge or status area (search for "Preview" text in the toolbar).
Add next to it:
  <LiveDataIndicator lastUpdated={lastDataUpdate} />
```

### Verify

- Open Report Builder → Preview a report → green pulsing dot with "0s ago" appears in toolbar
- Counter increments every second
- When new data arrives (emulator sends update), counter resets to 0
- Print mode (Ctrl+P): indicator not visible (has `print:hidden`)

### Failure Handling

| Problem | Fix |
|---------|-----|
| Dot not pulsing | Tailwind `animate-ping` is built-in — verify Tailwind is processing the class |
| Counter not resetting | Check `useEffect` dependency on `lastUpdated` — must call `setSecondsAgo(0)` |
| Visible in print | The `print:hidden` class is in the component — verify it's not overridden |
| No data updates detected | Search for the WebSocket callback or data update function in ReportBuilderPreview; may be `onData`, `handleData`, or similar |
| Cannot find where live data is set | Search for `setLiveTagValues`, `tagValues`, `socketRef`, or `useEffect` with socket in the component |

### Success Criteria

- [ ] `LiveDataIndicator.jsx` component created at `Components/Common/LiveDataIndicator.jsx`
- [ ] Pulsing green dot visible in Preview toolbar
- [ ] Counter increments every second
- [ ] Counter resets when new data arrives from WebSocket
- [ ] Hidden in print mode (`print:hidden`)

---

## Agent 4 — "Silo Widget SVG Upgrade" (~15 min)

**Scope:** Frontend only. Rewrite `Silo2DSvg()` function for 3D cylindrical vessel.
**Run:** New Claude Code session. No dependencies on Agents 2-3 (different file).
**Dependencies:** Can run in **parallel with Agent 3** (different files).

### Tasks

**1. Read reference files FIRST:**

```
Read these files before modifying:
- Frontend/src/Pages/ReportBuilder/widgets/SiloWidget.jsx  (entire file)
- Frontend/src/Pages/ReportBuilder/widgets/widgetDefaults.js  (zone color definitions)
- Frontend/src/Styles/reportBuilderTheme.css  (CSS variables for dark mode)
```

**2. Rewrite `Silo2DSvg()` in `SiloWidget.jsx`:**

```
File: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\Frontend\src\Pages\ReportBuilder\widgets\SiloWidget.jsx

KEEP: Same props interface — function Silo2DSvg({ fillPercent, fillColor })
KEEP: Same viewBox "0 0 100 118"
KEEP: fillRatio calculation and fillColor usage
DO NOT change anything outside the Silo2DSvg function

Replace the current flat SVG (lines 37-80) with this 3D cylindrical vessel:

function Silo2DSvg({ fillPercent, fillColor }) {
  const fillRatio = Math.max(0, Math.min(1, fillPercent / 100));
  const bodyTop = 22;
  const bodyH = 78;
  const bodyBottom = bodyTop + bodyH;
  const bodyLeft = 15;
  const bodyRight = 85;
  const bodyW = bodyRight - bodyLeft;
  const cx = 50;
  const ry = 8;
  const fillH = bodyH * fillRatio;
  const fillY = bodyBottom - fillH;
  const showWave = fillRatio > 0.05 && fillRatio < 0.95;
  const showLowGlow = fillRatio > 0 && fillRatio < 0.2;
  const showHighGlow = fillRatio > 0.8;

  const uniqueId = React.useId ? React.useId() : `silo-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      viewBox="0 0 100 118"
      className="w-full h-full max-h-[200px]"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden
      role="img"
    >
      <defs>
        {/* Metallic body gradient */}
        <linearGradient id={`${uniqueId}-metal`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a0b0c0" />
          <stop offset="30%" stopColor="#c8d4e0" />
          <stop offset="50%" stopColor="#b8c8d8" />
          <stop offset="100%" stopColor="#788898" />
        </linearGradient>
        {/* Fill gradient using zone color */}
        <linearGradient id={`${uniqueId}-fill`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fillColor} stopOpacity="0.9" />
          <stop offset="50%" stopColor={fillColor} stopOpacity="1" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0.7" />
        </linearGradient>
        {/* Clip fill to body */}
        <clipPath id={`${uniqueId}-clip`}>
          <rect x={bodyLeft} y={bodyTop} width={bodyW} height={bodyH} rx={2} />
        </clipPath>
      </defs>

      {/* Body - rounded rectangle with metallic gradient */}
      <rect
        x={bodyLeft} y={bodyTop} width={bodyW} height={bodyH} rx={2}
        fill={`url(#${uniqueId}-metal)`}
        stroke="#556677" strokeWidth="0.8"
      />

      {/* Top dome - ellipse for 3D perspective */}
      <ellipse cx={cx} cy={bodyTop} rx={bodyW / 2} ry={ry}
        fill={`url(#${uniqueId}-metal)`}
        stroke="#556677" strokeWidth="0.8"
      />

      {/* Fill area (clipped to body) */}
      {fillH > 0 && (
        <g clipPath={`url(#${uniqueId}-clip)`}>
          <rect
            x={bodyLeft} y={fillY} width={bodyW} height={fillH + 2}
            fill={`url(#${uniqueId}-fill)`}
            style={{ transition: 'y 0.3s ease, height 0.3s ease' }}
          />
          {/* Wave on fill surface */}
          {showWave && (
            <g style={{ animation: 'silo-wave-slide 3s linear infinite' }}>
              <path
                d={`M ${bodyLeft - 10} ${fillY}
                    Q ${bodyLeft + bodyW * 0.15} ${fillY - 2.5},
                      ${bodyLeft + bodyW * 0.25} ${fillY}
                    Q ${bodyLeft + bodyW * 0.35} ${fillY + 2.5},
                      ${bodyLeft + bodyW * 0.5} ${fillY}
                    Q ${bodyLeft + bodyW * 0.65} ${fillY - 2.5},
                      ${bodyLeft + bodyW * 0.75} ${fillY}
                    Q ${bodyLeft + bodyW * 0.85} ${fillY + 2.5},
                      ${bodyRight + 10} ${fillY}
                    L ${bodyRight + 10} ${fillY + 6}
                    L ${bodyLeft - 10} ${fillY + 6} Z`}
                fill={fillColor}
                opacity="0.4"
                style={{ transition: 'all 0.3s ease' }}
              />
            </g>
          )}
          {/* Fill surface ellipse for 3D effect */}
          <ellipse cx={cx} cy={fillY} rx={bodyW / 2 - 1} ry={3}
            fill={fillColor} opacity="0.6"
            style={{ transition: 'cy 0.3s ease' }}
          />
        </g>
      )}

      {/* Bottom ellipse - 3D base */}
      <ellipse cx={cx} cy={bodyBottom} rx={bodyW / 2} ry={6}
        fill="#667788" stroke="#556677" strokeWidth="0.8"
      />

      {/* Highlight line on left edge */}
      <line x1={bodyLeft + 2} y1={bodyTop + 10} x2={bodyLeft + 2} y2={bodyBottom - 10}
        stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round"
      />

      {/* Percentage text overlay */}
      <text x={cx} y={bodyTop + bodyH / 2 + 4} textAnchor="middle"
        fontSize="18" fontWeight="600" fontFamily="monospace"
        fill="white" opacity="0.9"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
      >
        {Math.round(fillPercent)}%
      </text>

      {/* Zone glow effects */}
      {showHighGlow && (
        <rect x={bodyLeft} y={fillY} width={bodyW} height={fillH}
          fill="none"
          style={{
            filter: 'drop-shadow(0 0 6px #10b981)',
            transition: 'all 0.3s ease',
          }}
          clipPath={`url(#${uniqueId}-clip)`}
        />
      )}
      {showLowGlow && (
        <rect x={bodyLeft} y={fillY} width={bodyW} height={fillH}
          fill="none"
          className="silo-low-pulse"
          style={{
            filter: 'drop-shadow(0 0 8px #ef4444)',
            transition: 'all 0.3s ease',
          }}
          clipPath={`url(#${uniqueId}-clip)`}
        />
      )}

      {/* Inline styles for animations */}
      <style>{`
        @keyframes silo-wave-slide {
          0% { transform: translateX(0); }
          100% { transform: translateX(-15px); }
        }
        .silo-low-pulse {
          animation: silo-pulse 1.5s ease-in-out infinite;
        }
        @keyframes silo-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @media print {
          .silo-low-pulse { animation: none; }
        }
      `}</style>
    </svg>
  );
}
```

IMPORTANT: Ensure `React` is imported at the top of the file (it likely already is for JSX).
If `React.useId` is not available (React < 18), the fallback `Math.random()` handles it.

### Verify

- Report Builder → add Silo widget → renders 3D cylindrical vessel (not flat rectangle)
- Change fill value → smooth 0.3s transition
- Fill < 20% → red pulsing glow
- Fill > 80% → green glow
- Fill 20-80% → no glow, clean metallic look
- Zone colors: green (0-70), amber (70-90), red (90-100) — from widgetDefaults
- Dark mode: metallic gradient visible, glows more prominent
- Print: renders cleanly (no animations breaking)

### Failure Handling

| Problem | Fix |
|---------|-----|
| SVG doesn't render | Check viewBox is still `"0 0 100 118"`, check JSX syntax (self-closing tags) |
| Fill animation broke | Verify `style={{ transition: 'y 0.3s ease, height 0.3s ease' }}` on fill rect |
| Wave animation not smooth | Check `@keyframes silo-wave-slide` in inline `<style>` block |
| Glow not visible | `filter: drop-shadow(...)` — some SVG renderers need the element to have dimensions; add a small fill like `fill="transparent"` |
| Zone colors wrong | Do NOT change `fillColor` prop — it comes from parent via `getZoneColor()` |
| `React.useId` undefined | Fallback `Math.random()` handles React < 18 — ensure the ternary is correct |
| Print looks weird | Inline `@media print` in `<style>` block removes animations |
| Existing SiloWidget props interface broken | Do NOT change function signature — must remain `Silo2DSvg({ fillPercent, fillColor })` |

### Success Criteria

- [ ] Silo renders as 3D cylindrical vessel with dome top and elliptical base
- [ ] Metallic gradient visible on body (left highlight, right shadow)
- [ ] Fill animation transitions smoothly (0.3s)
- [ ] Wave animation on fill surface (when fill is 5-95%)
- [ ] Zone colors correct (green/amber/red from parent)
- [ ] Glow effects: red pulse < 20%, green glow > 80%
- [ ] Percentage text overlaid inside vessel
- [ ] Dark mode renders correctly
- [ ] Print renders cleanly (no broken animations)
- [ ] Function signature unchanged: `Silo2DSvg({ fillPercent, fillColor })`

---

## Full Execution Sequence

```
Agent 1 (Typography + Color)           ← CSS only, ~10 min
  |
  +-- Agent 2 (ColumnEditor + Tooltips) ← Frontend fixes, ~15 min
        |
        +-- Agent 3 (LiveDataIndicator) ← Small component, ~10 min
        |
        +-- Agent 4 (Silo Widget SVG)   ← PARALLEL with Agent 3, ~15 min
```

**Total estimated time:** ~35 minutes (critical path: 1→2→3 or 1→2→4)
**Parallel opportunity:** Agents 3 and 4 can run simultaneously (different files).
**No QA/Commit agent** — Plan B-2 handles full QA + commit for both Plan A and Plan B-1.

---

## Completion Signal

After ALL 4 agents pass their success criteria, write the completion signal:

```bash
# Signal that Plan B-1 is complete — Plan B-2 waits for this file
echo PLAN_B1_COMPLETE > "C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config\.plan_b1_done"
```

**Do NOT write this file if any agent failed.** Plan B-2 polls for both `.plan_a_done` and `.plan_b1_done` before starting.

---

## Per-Agent Prompt Template

```
You are executing Agent N — "<Name>" from Plan B-1: UI/UX Polish (Parallel).

Project root: C:\Users\husam\OneDrive\Documents\Hercules_Reporting_Module\Salalah_config
Active branch: demo-pipeline-wiring

Read the execution plan at: docs/Plans/PLAN_B1_UI_POLISH_PARALLEL.md

Context: [paste relevant "After Agent X completed" context here]

Your ONLY job is to execute the tasks in the "Agent N" section of the plan.
Read ALL referenced files BEFORE modifying them.
Follow every step exactly as documented.
Follow every failure handling instruction if you encounter issues.
Verify success criteria before reporting done.
Do NOT modify any files outside your agent's scope.
Report the exact verification output for each success criterion.
```

---

## Execution Results

_(To be filled after pipeline execution)_

- **Date:**
- **Branch:** demo-pipeline-wiring
- **Agents completed:** /4
- **Typography updated:**
- **Tooltips added:**
- **LiveDataIndicator created:**
- **Silo SVG upgraded:**
- **Status:**
