# Hercules Reporting Module — Design System & Redesign Specification

## Context

The Hercules Reporting Module is functionally powerful but visually amateur. The current UI uses sci-fi/SCADA aesthetics (cyan glow, dashed borders, glass morphism, background video) that look unfinished. This specification defines a **complete professional design system** derived from the WaterFall Sales dashboard's exact visual language, then applies it to every page and component in both light and dark modes.

Hercules has two report modes requiring different spacing:
- **Dashboard mode** — Live/streaming reports viewed on screen → WaterFall's generous spacing
- **A4/Paginated mode** — Reports designed for print → tighter spacing to maximize page density

---

# I. DESIGN TOKENS

## 1. Color Tokens

### Light Mode (from WaterFall)
| Token | Value | Usage |
|-------|-------|-------|
| `--brand` | `#2563eb` | Primary accent — buttons, active states, links |
| `--brand-hover` | `#1d4ed8` | Hover state for primary accent |
| `--brand-subtle` | `rgba(37, 99, 235, 0.06)` | Active backgrounds, selected states |
| `--background` | `#f8fafc` | Page background |
| `--surface` | `#ffffff` | Cards, panels, elevated areas |
| `--surface-sunken` | `#f9fafb` | Inset areas, alternating table rows |
| `--text-primary` | `#111827` | Headings, values, critical data |
| `--text-secondary` | `#374151` | Body text, descriptions |
| `--text-muted` | `#6b7280` | Labels, placeholders, hints |
| `--text-faint` | `#9ca3af` | Disabled text, timestamps |
| `--border` | `#e5e7eb` | Default borders |
| `--border-strong` | `#d1d5db` | Active/focus borders |
| `--border-faint` | `#f3f4f6` | Table row separators |
| `--header-bg` | `#0f172a` | Table headers, dark accent areas |
| `--header-text` | `#ffffff` | Text on dark headers |

### Dark Mode (from WaterFall)
| Token | Value | Usage |
|-------|-------|-------|
| `--brand` | `#22d3ee` | Primary accent (cyan — WaterFall dark chart lead) |
| `--brand-hover` | `#67e8f9` | Hover state |
| `--brand-subtle` | `rgba(34, 211, 238, 0.08)` | Active backgrounds |
| `--background` | `#0a0f1a` | Page background |
| `--surface` | `#111827` | Cards, panels |
| `--surface-sunken` | `#0d1320` | Inset areas, alternating rows |
| `--text-primary` | `#f1f5f9` | Headings, values |
| `--text-secondary` | `#94a3b8` | Body text |
| `--text-muted` | `#64748b` | Labels, hints |
| `--text-faint` | `#475569` | Disabled text |
| `--border` | `#1e293b` | Default borders |
| `--border-strong` | `#2a3347` | Active/focus borders |
| `--border-faint` | `#1e293b` | Table row separators |
| `--header-bg` | `#0f172a` | Table headers |
| `--header-text` | `#f1f5f9` | Text on headers |

### Semantic Colors (both modes)
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--success` | `#059669` | `#34d399` | Positive trends, published status |
| `--warning` | `#d97706` | `#fbbf24` | Caution states, amber zones |
| `--danger` | `#dc2626` | `#f87171` | Errors, critical zones, delete |
| `--info` | `#2563eb` | `#60a5fa` | Informational states |

### Chart Palette
| Mode | Colors (in order) |
|------|-------------------|
| **Light** | `#2563eb, #7c3aed, #0891b2, #059669, #d97706, #dc2626, #ec4899, #8b5cf6, #06b6d4, #10b981` |
| **Dark** | `#22d3ee, #34d399, #60a5fa, #a78bfa, #fbbf24, #f87171, #f472b6, #2dd4bf, #4ade80, #c084fc` |

---

## 2. Typography Scale

**Font stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (WaterFall's exact stack)
**Monospace:** `'SF Mono', 'Fira Code', ui-monospace, monospace` (formulas, tag names, values)

| Token | Size | Weight | Line Height | Letter Spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| `display` | 18px | 700 | 1.2 | 0 | Page titles ("Report Builder", "Engineering") |
| `heading` | 15px | 700 | 1.3 | 0 | Section headings, card titles |
| `subheading` | 14px | 650 | 1.3 | 0 | Widget titles, panel headers |
| `body` | 13px | 400 | 1.5 | 0 | Body text, descriptions |
| `body-sm` | 12px | 400 | 1.5 | 0 | Secondary body text |
| `label` | 11px | 600 | 1.2 | 0.5px | Section labels (uppercase), category tags |
| `caption` | 10px | 500 | 1.2 | 0.3px | Small labels, axis ticks, badges |
| `mono-value` | 26px | 700 | 1.2 | 0 | KPI large values (monospace) |
| `mono-sm` | 12px | 500 | 1.4 | 0 | Formula expressions, tag names (monospace) |

---

## 3. Spacing Scale

### Dashboard Mode (WaterFall spacing — for live/streaming reports + Report Viewer)
| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Icon gaps, badge padding |
| `--space-sm` | 8px | Tight component gaps |
| `--space-md` | 12px | Component internal gaps |
| `--space-lg` | 16px | Section gaps, grid gaps between widgets |
| `--space-xl` | 20px | Card padding, panel padding |
| `--space-2xl` | 24px | Container padding, major section gaps |
| `--space-3xl` | 32px | Page horizontal padding |
| Grid margin | `[12, 12]` | Between widgets |
| Grid container padding | `[16, 16]` | Canvas outer padding |
| Card padding | `18px 20px` | Report listing cards, standalone cards |
| Widget card padding | `16px` | Widget cards inside grid |

### A4/Paginated Mode (tighter — for print-optimized reports)
| Token | Value | Usage |
|-------|-------|-------|
| Grid margin | `[8, 8]` | Between widgets (denser) |
| Grid container padding | `[12, 12]` | Canvas outer padding |
| Widget card padding | `14px` | Widget cards (compact) |
| Table cell padding | `8px 12px` | Tighter table cells |

---

## 4. Shadow System (Light mode only — dark mode uses border hierarchy)

| Level | Value | Usage |
|-------|-------|-------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` | Default card rest state |
| `shadow-md` | `0 1px 3px rgba(0,0,0,0.06)` | Standalone cards (report listing) |
| `shadow-lg` | `0 4px 16px rgba(0,0,0,0.07)` | Hover elevation |
| `shadow-xl` | `0 8px 30px rgba(0,0,0,0.1)` | Expanded/modal state |

**Dark mode:** No box-shadow. Elevation via border lightness:
- Level 0: `--border` (`#1e293b`)
- Level 1: `--border-strong` (`#2a3347`)
- Level 2: `#374151`

---

## 5. Border System

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Badges, pills, small inputs |
| `--radius-md` | 6px | Buttons, inputs |
| `--radius-lg` | 8px | Cards, panels |
| `--radius-xl` | 12px | Large cards, chart containers |
| `--radius-full` | 9999px | Circular elements, toolbar pills |
| `border-width` | 1px | Default border width |
| `border-accent-width` | 3px | Top accent border on status cards |
| `border-active-width` | 2px | Selected/active element borders |

---

## 6. Transition System

| Token | Value | Usage |
|-------|-------|-------|
| `--transition-fast` | `all 0.15s ease` | Buttons, toggles, interactive elements |
| `--transition-normal` | `all 0.25s ease` | Cards (hover elevation), panels |
| `--transition-slow` | `all 0.3s ease` | Theme switch, page transitions |
| `--transition-icon` | `transform 0.2s ease` | Chevron rotation, icon animation |

---

# II. COMPONENT PATTERNS

## 7. Cards

### Standard Card (report listing, formula cards, settings cards)
```
background: var(--surface)
border: 1px solid var(--border)
border-radius: var(--radius-lg)          /* 8px */
padding: 18px 20px                       /* generous */
box-shadow: var(--shadow-md)             /* light mode only */
transition: var(--transition-normal)

/* Hover — WaterFall lift pattern */
&:hover {
  box-shadow: var(--shadow-lg)           /* 0 4px 16px */
}
```

### Status Card (report listing cards with top accent — WaterFall pattern)
```
/* Same as Standard Card plus: */
border-top: 3px solid {statusColor}
/* Status colors: draft=#6b7280, validated=#2563eb, published=#059669 */
```

### Widget Card (inside report grid — constrained)
```
background: var(--surface)
border: 1px solid var(--border)
border-radius: var(--radius-lg)          /* 8px */
padding: 16px (dashboard) / 14px (A4)
box-shadow: var(--shadow-sm)             /* light mode only */
transition: var(--transition-normal)

/* Selection (edit mode) */
&:hover    { border-color: var(--brand) }
&:selected { border: 2px solid var(--brand) }

/* NO glow, NO dashed borders, NO textShadow */
```

---

## 8. Buttons

### Primary Button
```
background: var(--brand)
color: white
border: none
border-radius: var(--radius-md)          /* 6px */
padding: 8px 16px
font-size: 13px, weight: 600
transition: var(--transition-fast)

&:hover { background: var(--brand-hover) }
```

### Secondary Button
```
background: transparent
color: var(--text-secondary)
border: 1px solid var(--border)
/* Same radius, padding, font, transition as Primary */

&:hover { background: var(--surface-sunken), border-color: var(--border-strong) }
```

### Danger Button
```
background: var(--danger)
color: white
/* Same structure as Primary */
```

---

## 9. Tabs

### Underline Tabs (Settings/Engineering pages — WaterFall pattern)
```
border-bottom: 2px solid transparent
padding: 10px 20px
font-size: 12px, weight: 500
color: var(--text-muted)
transition: var(--transition-fast)

&:hover   { color: var(--text-primary), border-color: var(--border) }
&:active  { color: var(--brand), border-color: var(--brand), background: var(--brand-subtle) }
```

### Segmented Control (Properties Panel Data/Format toggle)
```
container: background: var(--surface-sunken), border: 1px solid var(--border), border-radius: var(--radius-md)

tab:        color: var(--text-muted), padding: 6px 12px
tab:active: background: var(--brand), color: white, border-radius: var(--radius-sm)
```

### Filter Pills (Report listing All/Draft/Validated/Published, Report Viewer Live/Today/etc.)
```
padding: 6px 14px
border-radius: var(--radius-md)
border: 1.5px solid var(--border)
font-size: 12px, weight: 600
color: var(--text-secondary)
transition: var(--transition-fast)

&:active { background: var(--brand-subtle), color: var(--brand), border-color: var(--brand) }
```

---

## 10. Tables (WaterFall pattern)

### Header
```
background: var(--header-bg)             /* #0f172a — dark navy even in light mode */
color: var(--header-text)                /* white */
padding: 10px 14px
font-size: 12px, weight: 600
letter-spacing: 0.3px
```

### Body Rows
```
padding: 10px 14px
border-bottom: 1px solid var(--border-faint)
font-size: 12px

/* Alternating */
&:nth-child(even) { background: var(--surface-sunken) }
```

---

## 11. Inputs

```
background: var(--surface)
border: 1px solid var(--border)
border-radius: var(--radius-md)
padding: 8px 12px
font-size: 12px
color: var(--text-primary)
transition: var(--transition-fast)

&:focus { border-color: var(--brand), outline: none }
/* NO glow ring, NO box-shadow on focus */
```

---

## 12. Badges / Status Pills

### Status Badge
```
font-size: 10px, weight: 600
padding: 2px 8px
border-radius: var(--radius-sm)
text-transform: uppercase
letter-spacing: 0.5px

/* Variants */
draft:     background: #f3f4f6, color: #6b7280  (light) / background: rgba(100,116,139,0.15), color: #94a3b8 (dark)
validated: background: var(--brand-subtle), color: var(--brand)
published: background: rgba(5,150,105,0.08), color: var(--success)
```

### Widget Type Pill
```
font-size: 10px, weight: 600
padding: 2px 8px
border-radius: var(--radius-sm)
text-transform: uppercase
letter-spacing: 0.5px
background: var(--surface-sunken)
color: var(--text-muted)
```

---

## 13. Chart Styling

### Grid & Axes
```
grid-color: var(--border-faint)          /* #f3f4f6 light / #1e293b dark */
grid-dash: [3, 3]
axis-tick-font: 11px, color: var(--text-muted)
axis-line: none (hidden)
```

### Bar Charts
```
border-radius: 6px (top corners)
fill: createLinearGradient — color at 30% opacity → 2% opacity
animation: duration 800ms, easing easeOutQuart
```

### Line/Area Charts (uPlot)
```
stroke-width: 2
fill: color at 10% opacity (area under curve)
spline curves (smooth)
point-radius: 0 (no dots — clean signal)
```

### Tooltip (WaterFall pattern)
```
background: var(--surface)
border: 1px solid var(--border)
border-radius: 8px
padding: 10px 14px
box-shadow: 0 4px 12px rgba(0,0,0,0.1)

title: 13px, weight 600, color: var(--text-primary)
body:  12px, weight 500, color: var(--text-secondary)
series-dot: 8px circle in series color before each value
```

---

## 14. Sidebar Navigation

```
width: 220px (open) / 60px (collapsed)
background: var(--surface)               /* white light / #111827 dark */
border-right: 1px solid var(--border)

/* Section labels (BUILD/VIEW/CONFIGURE) */
font-size: 10px, weight: 600
text-transform: uppercase
letter-spacing: 0.18em
color: var(--text-faint)
accent-bar: 2px wide, var(--brand) color, rounded

/* Menu items */
font-size: 13px, weight: 500
color: var(--text-secondary)
padding: 10px 16px

&:hover  { background: var(--surface-sunken) }
&:active {
  background: var(--brand-subtle)
  color: var(--brand)
  border-left: 2px solid var(--brand)
}

/* NO blur, NO glow, NO cyan border on sidebar container */
```

---

## 15. Top Navbar

```
height: 64px (or current)
background: var(--surface)
border-bottom: 1px solid var(--border)   /* NOT gradient line */
/* NO backdrop-filter blur */
```

---

# III. PAGE-BY-PAGE APPLICATION

## 16. Report Builder Manager (Report Listing Page)

**File:** `Pages/ReportBuilder/ReportBuilderManager.jsx`

| Element | Current | New |
|---------|---------|-----|
| Subtitle | "MISSION CONTROL • TEMPLATE MANAGER" | "Template Manager" |
| Filter tabs | Pill buttons with glow | Filter Pills pattern (§9) |
| Report cards | `rb-holo-card` with dashed gradient borders, colored progress bars, glow hover | Status Card pattern (§7) — solid border, 3px top accent by status, hover elevation |
| Widget type indicators | Full-width colored bars | Widget Type Pill badges (§12) |
| Status badge | Glowing badge | Status Badge pattern (§12) |
| Card grid | `gap-6`, no max-width | `gap-5`, `max-w-7xl mx-auto px-6` to reduce empty side margins |
| Background | Video/aurora visible | Flat `var(--background)` |

**CSS:** Remove all `.rb-holo-card` glow/gradient rules from `reportBuilderTheme.css`.

---

## 17. Report Builder Canvas (Edit Mode)

**File:** `Pages/ReportBuilder/ReportBuilderCanvas.jsx`

| Element | Current | New |
|---------|---------|-----|
| Grid margin (Dashboard) | `[6, 6]` | `[12, 12]` |
| Grid margin (A4) | `[6, 6]` | `[8, 8]` |
| Grid container padding | `[0, 0]` | `[16, 16]` (Dashboard) / `[12, 12]` (A4) |
| Widget selection hover | Dashed cyan border + glow | `1px solid var(--brand)`, no glow |
| Widget selection active | Heavy dashed border + glow shadow | `2px solid var(--brand)`, no glow |
| Canvas surface | Dots + decoration | Flat `var(--background)` with subtle dot grid (`var(--border-faint)` dots) |
| Mini-toolbar | Glow effects | Solid `var(--surface)` bg, `var(--border)` border, `var(--shadow-md)` |

**Widget cards:** Use Widget Card pattern (§7) with spacing per report mode (Dashboard=16px / A4=14px padding).

---

## 18. Component Panel (Left Toolbox) — Full Spec

**File:** `Pages/ReportBuilder/panels/WidgetToolbox.jsx`

### Panel Container
```
width: 300px (or current — controlled by parent)
background: var(--surface)
border-right: 1px solid var(--border)
height: 100% (fills available space)
overflow-y: auto

/* Panel separator — clean line, no shadow or gradient */
/* Remove any box-shadow or glow on the panel edge */
```

### Panel Header ("COMPONENTS")
```
padding: 14px 16px 12px
background: var(--surface)
border-bottom: 1px solid var(--border)

/* Accent bar */
width: 3px, height: 16px, border-radius: 2px
background: var(--brand)

/* Title text */
font-size: 10px, weight: 700
letter-spacing: 0.1em
text-transform: uppercase
color: var(--text-muted)                /* was var(--rb-accent) = orange/red */
```

### Search Input
```
margin: 0 16px 12px
padding: 8px 12px 8px 32px              /* left padding for search icon */
background: var(--surface-sunken)
border: 1px solid var(--border)
border-radius: var(--radius-md)
font-size: 11px
color: var(--text-primary)
transition: var(--transition-fast)

&:focus { border-color: var(--brand) }
/* NO glow, NO box-shadow on focus */

/* Search icon */
color: var(--text-faint)
```

### Section Headers (VISUALIZATIONS / STRUCTURE / TAG GROUPS / WIDGETS)
```
padding: 10px 16px
font-size: 9px, weight: 700
text-transform: uppercase
letter-spacing: 0.05em
color: var(--text-muted)
cursor: pointer
transition: var(--transition-fast)

/* Chevron */
color: var(--text-muted)
transition: var(--transition-icon)       /* 0.2s rotation */

&:hover { color: var(--text-secondary) }
/* NO colored accent bars on section headers */
```

### Visualization Icon Grid (KPI, TABLE, LINE, BAR, GAUGE, SILO, STAT)
```
display: grid
grid-template-columns: repeat(4, 1fr)
gap: 8px
padding: 4px 16px 12px

/* Each icon tile */
display: flex, flex-direction: column
align-items: center, justify-content: center
gap: 4px
padding: 8px 4px
border-radius: var(--radius-md)
background: var(--surface-sunken)
border: 1px solid transparent
cursor: grab
transition: var(--transition-fast)

/* Icon */
width: 28px, height: 28px
color: var(--text-muted)

/* Label */
font-size: 9px, weight: 600
letter-spacing: 0.04em
text-transform: uppercase
color: var(--text-muted)

/* Active / dragging state */
&:active {
  background: var(--brand-subtle)
  border: 1px solid var(--brand)
  /* Icon + label color: var(--brand) */
}

/* Hover */
&:hover {
  background: var(--surface)
  border-color: var(--border)
}

/* NO glow, NO box-shadow on any state */
```

### Structure Items (Text, Image, Repeat Panel)
```
padding: 8px 16px
display: flex, align-items: center, gap: 10px
border-radius: var(--radius-md)
cursor: grab
transition: var(--transition-fast)

/* Icon */
width: 20px, height: 20px
color: var(--text-muted)

/* Title */
font-size: 12px, weight: 500
color: var(--text-secondary)

/* Description */
font-size: 10px, weight: 400
color: var(--text-faint)

&:hover { background: var(--surface-sunken) }
```

### TAG GROUPS Accordion Content
```
padding: 4px 12px 8px

/* Tag group row */
padding: 6px 8px
border-radius: var(--radius-sm)
display: flex, align-items: center, gap: 8px
cursor: pointer
transition: var(--transition-fast)

/* Tag count dot */
width: 6px, height: 6px, border-radius: 50%
background: var(--brand), opacity: 0.5

/* Tag name */
font-size: 11px, weight: 500
color: var(--text-secondary)

/* Unit badge */
font-size: 8px, weight: 600
padding: 1px 4px
border-radius: var(--radius-sm)
background: var(--brand-subtle)
color: var(--brand)

&:hover { background: var(--surface-sunken) }
```

### WIDGETS Accordion Content (saved widget list)
```
padding: 4px 12px 8px

/* Widget row */
padding: 8px 10px
border-radius: var(--radius-md)
border-left: 2px solid transparent
display: flex, align-items: center, gap: 8px
cursor: pointer
transition: var(--transition-fast)

/* Widget name */
font-size: 11px, weight: 500
color: var(--text-secondary)

/* Data source indicator */
font-size: 9px, weight: 600
/* Tags: color var(--success), Formulas: color var(--warning) with "fx" text */

/* Selected state */
&:selected {
  background: var(--brand-subtle)
  border-left: 2px solid var(--brand)
  color: var(--brand)
}

/* Hover */
&:hover { background: var(--surface-sunken) }

/* REMOVE: boxShadow: '0 0 8px var(--rb-accent-glow)' */
```

### Overall Panel Spacing
```
/* Breathing room between sections */
section-gap: 4px (between accordion sections)

/* Scroll area */
scrollbar-width: thin
scrollbar-color: var(--border) transparent

/* Panel bottom padding */
padding-bottom: 16px
```

---

## 19. Properties Panel (Right Side) — Full Spec

**File:** `Pages/ReportBuilder/panels/PropertiesPanel.jsx`

### Panel Container
```
width: 320px (or current — controlled by parent)
background: var(--surface)
border-left: 1px solid var(--border)
height: 100% (fills available space)
overflow-y: auto

/* Clean separator — no shadow, no gradient */
```

### Panel Header (Widget Title Bar)
```
padding: 12px 16px
background: var(--surface)
border-bottom: 1px solid var(--border)
display: flex, align-items: center, justify-content: space-between

/* Widget type icon */
width: 16px, height: 16px
color: var(--brand)

/* Widget name */
font-size: 14px, weight: 650
color: var(--text-primary)

/* Close (X) button */
width: 24px, height: 24px
border-radius: var(--radius-sm)
color: var(--text-muted)
transition: var(--transition-fast)
&:hover { background: var(--surface-sunken), color: var(--text-primary) }
```

### Data/Format Segmented Control
```
margin: 12px 16px
padding: 3px
background: var(--surface-sunken)
border: 1px solid var(--border)
border-radius: var(--radius-md)
display: flex

/* Each tab */
flex: 1
padding: 6px 12px
border-radius: var(--radius-sm)
font-size: 12px, weight: 600
display: flex, align-items: center, justify-content: center, gap: 6px
transition: var(--transition-fast)
color: var(--text-muted)

/* Active tab */
&:active {
  background: var(--brand)
  color: white
  box-shadow: 0 1px 2px rgba(0,0,0,0.1)
}

/* REMOVE: red/coral active state */
```

### Section Headers (LAYOUT, TABLE COLUMNS, DATA SERIES, DISPLAY, etc.)
```
padding: 10px 20px 6px
font-size: 9px, weight: 700
text-transform: uppercase
letter-spacing: 0.08em
color: var(--text-muted)                /* NOT accent color */
display: flex, align-items: center, gap: 6px
border-bottom: 1px solid var(--border)

/* Section icon */
width: 11px, height: 11px
color: var(--text-faint)
```

### LAYOUT Grid (X, Y, W, H inputs)
```
padding: 10px 20px 14px
display: grid
grid-template-columns: repeat(4, 1fr)
gap: 6px

/* Each input */
text-align: center
font-family: monospace
font-size: 11px, weight: 700
padding: 4px 2px
background: var(--surface-sunken)
border: 1px solid var(--border)
border-radius: var(--radius-sm)
color: var(--text-primary)
transition: var(--transition-fast)

&:focus { border-color: var(--brand) }

/* Label above input */
font-size: 8px, weight: 700
text-transform: uppercase
letter-spacing: 0.1em
color: var(--text-faint)
text-align: center
margin-bottom: 2px
```

### Data Series / Column Cards
```
padding: 8px 20px

/* Each column card */
margin-bottom: 6px
padding: 10px 12px
background: var(--surface-sunken)
border: 1px solid var(--border)
border-radius: var(--radius-md)
transition: var(--transition-fast)

/* Source type color dot (left side) */
width: 8px, height: 8px, border-radius: 50%
/* Colors by type: */
tag:     var(--brand)        /* blue */
formula: #7c3aed             /* violet */
group:   #d97706             /* amber */
mapping: #0891b2             /* teal */
static:  var(--text-faint)   /* gray */

/* Column name */
font-size: 12px, weight: 600
color: var(--text-primary)

/* Source type badge */
font-size: 9px, weight: 600
padding: 1px 6px
border-radius: var(--radius-sm)
/* Tag: background rgba(37,99,235,0.08), color var(--brand) */
/* Formula: background rgba(124,58,237,0.08), color #7c3aed */

/* Column description / formula preview */
font-size: 10px, weight: 400
color: var(--text-muted)
font-family: monospace
overflow: hidden, text-overflow: ellipsis

/* Drag handle */
color: var(--text-faint)
cursor: grab

/* Delete (X) button */
color: var(--text-faint)
&:hover { color: var(--danger) }

/* Card hover */
&:hover {
  border-color: var(--border-strong)
  background: var(--surface)
}
```

### Add Column Button Row (+ Tag / + Formula / + Group / + Mapping / + Static)
```
padding: 8px 20px 16px
display: flex, flex-wrap: wrap, gap: 6px

/* Each button */
padding: 4px 10px
border-radius: var(--radius-sm)
font-size: 10px, weight: 600
display: flex, align-items: center, gap: 4px
cursor: pointer
transition: var(--transition-fast)
border: none

/* Color variants (subtle background + text): */
+ Tag:     background: rgba(37,99,235,0.08), color: var(--brand)
+ Formula: background: rgba(124,58,237,0.08), color: #7c3aed
+ Group:   background: rgba(217,119,6,0.08),  color: #d97706
+ Mapping: background: rgba(8,145,178,0.08),  color: #0891b2
+ Static:  background: var(--surface-sunken),  color: var(--text-muted)

/* Hover — slightly stronger background */
&:hover { opacity: 0.85 or background intensity increases slightly }

/* "+" icon */
font-size: 10px, weight: 700
```

### Color Input (with presets)
```
padding: 8px 20px
display: flex, flex-direction: column, gap: 8px

/* Preset swatch row */
display: flex, gap: 4px

/* Each swatch */
width: 20px, height: 20px
border-radius: 50%
border: 1.5px solid transparent
cursor: pointer
transition: var(--transition-fast)

&:hover { border-color: var(--border-strong) }
&:selected { box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--brand) }

Presets: [#2563eb, #7c3aed, #0891b2, #059669, #d97706, #dc2626, #111827, #6b7280]

/* Native color picker + hex input row */
display: flex, align-items: center, gap: 8px

/* Color swatch preview */
width: 32px, height: 32px
border-radius: var(--radius-md)
border: 1px solid var(--border)
/* REMOVE: hover:shadow-[0_0_6px_var(--rb-accent-glow)] */
&:hover { border-color: var(--brand) }

/* Hex text input */
font-family: monospace
font-size: 11px
padding: 6px 8px
flex: 1
```

### Data Series Expanded State (inside column/series card)
```
/* When a series card is expanded, it reveals: */
padding: 12px
background: var(--surface-sunken)
border: 1px solid var(--border)
border-radius: var(--radius-md)

/* Field labels (LABEL, SOURCE TYPE, SAVED FORMULAS, FORMULA) */
font-size: 9px, weight: 700
text-transform: uppercase
letter-spacing: 0.06em
color: var(--text-muted)
margin-bottom: 4px

/* Text inputs (Label, formula textarea) */
background: var(--surface)
border: 1px solid var(--border)
border-radius: var(--radius-md)
padding: 8px 12px
font-size: 12px
color: var(--text-primary)
transition: var(--transition-fast)
&:focus { border-color: var(--brand) }

/* Select dropdowns (Source Type, Saved Formulas) */
background: var(--surface)
border: 1px solid var(--border)
border-radius: var(--radius-md)
padding: 8px 12px
font-size: 12px
color: var(--text-primary)
/* Chevron icon: var(--text-muted) */

/* Visual/Advanced segmented control (formula mode) */
/* Same Segmented Control pattern as Data/Format (§9) */
margin: 8px 0
padding: 3px
background: var(--surface)
border: 1px solid var(--border)
border-radius: var(--radius-md)
tab:active { background: var(--brand), color: white }

/* Formula textarea */
background: var(--surface)
border: 1px solid var(--border)
border-radius: var(--radius-md)
padding: 10px 12px
font-family: monospace
font-size: 11px
color: var(--text-primary)
min-height: 60px
resize: vertical
&::placeholder { color: var(--text-faint), font-style: italic }
&:focus { border-color: var(--brand) }

/* Operator buttons row (+TAG, +, -, *, /, (, ), #123, Fn) */
display: flex, flex-wrap: wrap, gap: 4px
margin-top: 8px

/* Each operator button */
padding: 4px 10px
border-radius: var(--radius-sm)
font-size: 11px, weight: 600
cursor: pointer
transition: var(--transition-fast)
border: 1px solid var(--border)
background: var(--surface)
color: var(--text-secondary)

/* +TAG button (special — uses brand color) */
background: var(--brand-subtle)
color: var(--brand)
border-color: transparent

/* Hover for all operator buttons */
&:hover { border-color: var(--brand), color: var(--brand) }

/* Validation message ("Formula is empty", errors) */
margin-top: 6px
display: flex, align-items: center, gap: 6px
font-size: 11px, weight: 500

/* Error state */
color: var(--danger)
/* Info icon: var(--danger) */

/* Success state */
color: var(--success)

/* "Add data series" link */
font-size: 11px, weight: 500
color: var(--brand)
cursor: pointer
padding: 8px 0
&:hover { opacity: 0.8 }
```

### Display/Format Controls (Font size, alignment, show title, etc.)
```
padding: 8px 20px
space-y: 12px

/* Label + control pairs */
display: flex, justify-content: space-between, align-items: center

/* Label */
font-size: 11px, weight: 500
color: var(--text-secondary)

/* Select dropdown */
Input pattern (§11), font-size: 11px
padding: 4px 8px
min-width: 80px

/* Toggle switch */
accent-color: var(--brand)
```

### "Remove Widget" Link (bottom)
```
padding: 12px 20px
text-align: right

font-size: 11px, weight: 500
color: var(--danger)
cursor: pointer
transition: var(--transition-fast)

&:hover { opacity: 0.8 }
/* Simple text link, no icon needed */
```

### Chart Palette Presets (dropdown in chart series config)
```
Professional: ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#dc2626"]
Warm:         ["#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d", "#059669"]
Cool:         ["#0891b2", "#0284c7", "#2563eb", "#4f46e5", "#7c3aed", "#9333ea"]
```

### Overall Panel Spacing
```
/* Section vertical rhythm */
section-padding: 10px 20px              /* consistent horizontal padding */
section-gap: 0                          /* sections separated by border-bottom, not margin */

/* Scroll area */
scrollbar-width: thin
scrollbar-color: var(--border) transparent

/* Empty state ("Select a widget to edit its properties") */
padding: 40px 20px
text-align: center
font-size: 13px, weight: 400
color: var(--text-faint)
/* Cursor icon above text, color: var(--text-faint) */
```

---

## 20. Report Viewer (Dashboard Mode)

**File:** `Pages/Reports/ReportViewer.jsx`

| Element | Current | New |
|---------|---------|-----|
| Time filter buttons | Cyan borders `dark:border-[#22d3ee]/10` | Filter Pills pattern (§9) — `var(--brand)` accent |
| Grid/Tabular toggle | `bg-brand text-white` active | Same pattern — consistent with brand token |
| Widget cards | Dashed borders | Widget Card pattern (§7) — solid borders |
| Grid margins | `[4, 4]` | `[12, 12]` (Dashboard mode — generous WaterFall spacing) |
| Background | Video/aurora | Flat `var(--background)` |

---

## 21. Report Builder Preview & Paginated Viewer

**Files:** `ReportBuilderPreview.jsx`, `PaginatedReportViewer.jsx`

- Grid margins: `[8, 8]` (A4 mode — tighter)
- Widget card padding: `14px` (A4 mode)
- Same card styling (§7), just with A4 spacing tokens

---

## 22. Engineering / Settings Pages

**File:** `Pages/Settings/SettingsHome.jsx`

| Element | Current | New |
|---------|---------|-----|
| Tab navigation | `--brand` underline (ok conceptually) | Underline Tabs pattern (§9) — ensure `--brand` uses correct token |
| Tab active bg | `var(--brand-subtle)` | Same — this is correct |
| Formula cards | Alternating zebra striping | Standard Card pattern (§7) — consistent bg, no striping |
| Unit badges | Colored backgrounds | Badge pattern (§12) — `var(--brand-subtle)` bg, `var(--brand)` text |
| Formula chips | `var(--rb-accent-subtle)` | `var(--surface-sunken)` bg, `var(--text-secondary)` text, mono font |
| "+ New Formula" | Current styling | Primary Button pattern (§8) |
| Page background | Wave/aurora | Flat `var(--background)` |

---

## 23. Widget-Specific Changes

### KPIWidget.jsx
- **Remove:** `textShadow: \`0 0 20px ${activeColor}33\`` — no glow
- Label: `label` typography (§2) — 11px, 600, uppercase, 0.5px tracking, `var(--text-muted)`
- Value: `mono-value` typography — 26px, 700, `var(--text-primary)`, monospace
- Subtitle: `caption` typography — 10px, `var(--text-faint)`, marginTop 4px
- Trend: `body-sm` — 12px, 600, semantic color (`--success` or `--danger`)
- Padding: 16px (dashboard) / 14px (A4) — inherited from widget card

### StatWidget.jsx
- **Remove:** `textShadow` glow
- Left border accent: `var(--brand)` (not hardcoded cyan)
- Same typography hierarchy as KPI

### GaugeWidget.jsx
- **Remove:** glow filter on arc and endpoint SVG
- Keep zone colors (semantic: red/amber/green)
- Clean arc rendering, no `drop-shadow` filter

### ChartWidget.jsx (Bar charts)
- Apply Chart Styling patterns (§13)
- `borderRadius: 6` on bars
- Gradient fill (30% → 2% opacity)
- Animation: 800ms easeOutQuart
- Custom tooltip (§13)

### UPlotChart.jsx
- `DEFAULT_COLORS`: use Chart Palette from §1 (mode-aware)
- Grid/axis styling from §13
- Keep spline curves and area fill

### TableWidget.jsx
- Apply Table pattern (§10)
- Dark navy header (`--header-bg`) with white text — even in light mode
- Subtle alternating rows

### widgetDefaults.js
- Default `color`: `#2563eb`
- Chart `DEFAULT_COLORS`: light palette from §1

---

# IV. GLOBAL CLEANUP

## 24. Remove All Glow Effects

Search and remove across ALL files:
- `textShadow` with color opacity (e.g., `0 0 20px ${color}33`)
- `boxShadow` with `var(--rb-accent-glow)` or colored glow (`0 0 Xpx cyan`)
- `filter: drop-shadow()` on decorative elements (keep on functional elements like modals)
- `.scada-panel-glow` class and references
- `backdrop-filter: blur()` on sidebar and navbar
- CSS classes: `.rb-holo-card`, any glow-related utility classes

## 25. Remove Background Decoration

**File:** `index.css` (lines ~134-165)
- Remove or hide `#bg-video` element styles
- Remove `#bg-video-overlay` gradient overlay
- Set clean: `body { background: var(--background); }`

## 26. Set `--rb-accent-glow` to `transparent`

In `reportBuilderTheme.css`, for both light and dark modes:
```css
--rb-accent-glow: transparent;
```
This kills all remaining glow references without hunting every usage.

---

# V. CSS VARIABLE MAPPING

The app has TWO variable systems that need alignment:
1. **Global** (`index.css`): `--brand`, `--background`, `--surface-*`, `--text-*`, `--border-*`
2. **Report Builder** (`reportBuilderTheme.css`): `--rb-accent`, `--rb-bg`, `--rb-surface`, `--rb-text`, `--rb-border`

Both must use the same underlying values from §1 tokens. The `--rb-*` vars should reference or mirror the global vars.

### reportBuilderTheme.css — Light Mode
```css
--rb-accent: #2563eb;
--rb-accent-bright: #3b82f6;
--rb-accent-subtle: rgba(37, 99, 235, 0.06);
--rb-accent-glow: transparent;
--rb-bg: #f8fafc;
--rb-surface: #ffffff;
--rb-panel: #ffffff;
--rb-canvas: #f8fafc;
--rb-text: #111827;
--rb-text-secondary: #374151;
--rb-text-muted: #6b7280;
--rb-border: #e5e7eb;
--rb-card-bg: #ffffff;
--rb-card-border: #e5e7eb;
```

### reportBuilderTheme.css — Dark Mode
```css
--rb-accent: #22d3ee;
--rb-accent-bright: #67e8f9;
--rb-accent-subtle: rgba(34, 211, 238, 0.08);
--rb-accent-glow: transparent;
--rb-bg: #0a0f1a;
--rb-surface: #111827;
--rb-panel: #111827;
--rb-canvas: #0a0f1a;
--rb-text: #f1f5f9;
--rb-text-secondary: #94a3b8;
--rb-text-muted: #64748b;
--rb-border: #1e293b;
--rb-card-bg: #111827;
--rb-card-border: #1e293b;
```

---

# VI. FILES TO MODIFY

| # | File (relative to `Frontend/src/`) | Scope |
|---|---|---|
| 1 | `index.css` | Global CSS vars (§1), remove bg video/aurora (§25), body background |
| 2 | `App.css` | Align theme vars to design system |
| 3 | `Pages/ReportBuilder/reportBuilderTheme.css` | `--rb-*` vars (§V), remove glow/holo classes (§24), widget card (§7), segmented control (§9), selection borders, table styles (§10), transition utilities (§6) |
| 4 | `Components/Common/SideNav.jsx` | Sidebar pattern (§14) |
| 5 | `Components/Navbar/Navbar.jsx` | Navbar pattern (§15) |
| 6 | `Pages/ReportBuilder/ReportBuilderManager.jsx` | Report listing (§16) |
| 7 | `Pages/ReportBuilder/ReportBuilderCanvas.jsx` | Canvas (§17) — grid margins, selection, spacing |
| 8 | `Pages/ReportBuilder/panels/WidgetToolbox.jsx` | Component panel (§18) |
| 9 | `Pages/ReportBuilder/panels/PropertiesPanel.jsx` | Properties panel (§19) — tab colors, presets |
| 10 | `Pages/ReportBuilder/widgets/KPIWidget.jsx` | Remove glow, typography (§23) |
| 11 | `Pages/ReportBuilder/widgets/StatWidget.jsx` | Remove glow, accent color (§23) |
| 12 | `Pages/ReportBuilder/widgets/GaugeWidget.jsx` | Remove glow filter (§23) |
| 13 | `Pages/ReportBuilder/widgets/ChartWidget.jsx` | Chart styling (§13, §23) |
| 14 | `Pages/ReportBuilder/widgets/UPlotChart.jsx` | Chart palette, grid (§13, §23) |
| 15 | `Pages/ReportBuilder/widgets/TableWidget.jsx` | Table pattern (§10, §23) |
| 16 | `Pages/ReportBuilder/widgets/widgetDefaults.js` | Default colors (§23) |
| 17 | `Pages/ReportBuilder/ReportBuilderPreview.jsx` | A4 grid margins (§21) |
| 18 | `Pages/ReportBuilder/PaginatedReportViewer.jsx` | A4 grid margins (§21) |
| 19 | `Pages/Reports/ReportViewer.jsx` | Dashboard mode (§20) |
| 20 | `Pages/Settings/SettingsHome.jsx` | Engineering tabs (§22) |

---

# VII. IMPLEMENTATION ORDER

| Phase | Files | Description |
|-------|-------|-------------|
| **1. Design tokens** | `index.css`, `App.css`, `reportBuilderTheme.css` | All CSS vars, remove bg video, remove glow classes, transition utilities |
| **2. Shell** | `SideNav.jsx`, `Navbar.jsx` | Sidebar + navbar — instantly transforms the app feel |
| **3. Report listing** | `ReportBuilderManager.jsx` | Status cards with top accent, filter pills, layout fix |
| **4. Canvas + grid** | `ReportBuilderCanvas.jsx`, `ReportBuilderPreview.jsx`, `PaginatedReportViewer.jsx` | Grid margins (dashboard vs A4), selection borders, canvas surface |
| **5. Panels** | `WidgetToolbox.jsx`, `PropertiesPanel.jsx` | Component panel + properties panel + color presets |
| **6. Widgets** | `KPIWidget, StatWidget, GaugeWidget, ChartWidget, UPlotChart, TableWidget, widgetDefaults` | Typography, glow removal, chart styling, table headers |
| **7. Settings** | `SettingsHome.jsx` | Tab colors, formula cards |
| **8. Viewer** | `ReportViewer.jsx` | Dashboard-mode spacing, filter pills |

---

# VIII. WHAT NOT TO CHANGE

- Chart libraries (keep Chart.js + uPlot)
- Widget config API/props (additive only — presets are new)
- Drag-and-drop system, formulas, real-time features
- react-grid-layout library
- Silo 3D widget rendering
- Functional behavior of any component

---

# IX. VERIFICATION

1. `cd Frontend && npm run dev`
2. **Light mode full sweep:**
   - Sidebar: white bg, blue accent, no glow → ✓
   - Report listing: cards with top accent border, hover elevation, no dashed borders → ✓
   - Canvas: solid selection borders, 12px/8px grid gaps (dashboard/A4) → ✓
   - Component panel: muted header (not orange), no glow → ✓
   - Properties panel: blue Data tab (not red), preset swatches → ✓
   - All widgets: no textShadow glow, professional typography → ✓
   - Table: dark navy header with white text → ✓
   - Charts: rounded bars, subtle gradient, dashed grid, custom tooltip → ✓
   - Engineering: blue underline tabs, clean formula cards → ✓
   - Background: flat white, no video/aurora → ✓
3. **Dark mode full sweep:**
   - Same checks with `#22d3ee` cyan accent, `#0a0f1a` backgrounds
   - No glow anywhere — elevation via border lightness only
   - Charts use dark-mode palette (cyan lead)
4. **Mode-specific spacing:**
   - Dashboard report in viewer: generous 12px grid gaps, 16px padding → ✓
   - A4 report in preview/paginated: tighter 8px gaps, 14px padding → ✓
5. **Transitions:** hover cards → smooth shadow lift (0.25s), click buttons → fast feedback (0.15s)
6. **Export:** PDF print → clean output, no decorations leak through
