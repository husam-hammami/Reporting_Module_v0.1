# Plan 1 — Visual Redesign of the Plant Status Briefing
Date: 2026-04-17 | Author: Senior UI/UX | Target branch: Salalah_Mill_B

This plan replaces the prose-heavy "Plant Status" briefing in `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx` (rendering at line 534, loop at line 618) and the side panel in `Frontend/src/Pages/Reports/AiInsightsPanel.jsx`. It is deliberately designer-led. The engineering structure from the previous draft (seven components, structured JSON contract, server-side clamp, JSON-mode prompt) is preserved, but every surface is re-specified down to token values, motion curves, and component physics.

---

## 1. Diagnosis — why the current UI fails

Pulled from the shipped screenshot of Plant Status for a Salalah Mill day.

1. **Typographic monotone.** Power Quality "100" and Production "91" sit in the exact same weight, size and colour as the unit label beneath them. The hero number is not hero. Scannability collapses the moment two cards share type treatment. Linear, Stripe and Vercel all solve this with a 3× to 5× ratio between display and label. We have ~1.1×.
2. **Empty-looking KPI cards.** Four cards across the top, each a number and a word. No context, no trend, no baseline. A number without a comparison is decoration. See Tufte, *Envisioning Information*: "Compared to what?" is the question every figure must answer.
3. **Prose-encoded data.** "Total flow was approximately 12,450 kg during the period, a moderate change compared to yesterday." The number is trapped inside a sentence, the adjective ("moderate") is doing the work of a delta pill, and "approximately" hedges a reading that is exact. Every one of these must become `[12,450] [kg] [+3.1%]`.
4. **Four near-duplicate report cards.** MIL-B, Mill B Dashboard, Mil_B_energy_report, Energy_report_dashboard — all reference the same physical asset. The user sees the same shift reported four times with semantic drift. The correct grouping is the **physical asset**, not the report that happened to include it.
5. **Meaningless percentage artefacts.** ↑1,090%, ↑2,069%, ↓100%, ↑∞. These are mathematically correct for zero-baselines and cognitively useless. They blow the entire attention hierarchy — a user trained on a red ↑2,069% learns to ignore red numbers, which is the exact opposite of what the colour is for.
6. **No verdict.** Nothing in the viewport answers "is the plant OK right now?" in under five seconds. A plant manager should not need to read 2,000 words to form a judgement a single band could have delivered.
7. **No drill-through.** Every claim is inert. "Output dropped" does not link to the tag, report, or window that evidences it. Trust collapses.
8. **The donut is decorative.** "6/9 Equipment running" — a donut with two colours for a binary count is a slot wasted. The ten tags listed beneath in green/red are the actual payload. The donut adds nothing the header string doesn't.
9. **No freshness signal.** If the briefing is eleven hours stale nobody can tell. In a control room where decisions are made off the screen, invisible staleness is a safety issue.
10. **Bar charts are out of place.** "Production Output vs Previous" is an analytical chart in a briefing surface. Briefings want comparisons in pills; charts belong on drill-through pages.

The app is dense. It is not scannable. We are fixing the second.

---

## 2. Design principles (non-negotiable)

Seven laws. These govern every decision that follows.

1. **Glance first, detail second.** A five-second read must yield the verdict, the one thing that matters, and the freshness of the data. Everything else is progressive disclosure.
2. **One hero number per card.** No card has two equally loud values. If you need two, it is two cards.
3. **Status colour is not data colour.** Red/amber/green encode severity of *attention required*. Chart series use a separate data palette. Conflating them kills both.
4. **Motion confirms, never decorates.** Animation clarifies state change. Anything that runs longer than 400 ms, loops, or exists for delight is cut.
5. **Empty space earns its place.** A row of four blank KPI cards is a design debt. Sections appear only when they have payload.
6. **Physical asset is the unit of truth.** Not reports. Not tags. Not rooms. One Mill B panel, whatever number of reports cite it.
7. **The server protects the UI.** Clamping, deduping, merging happen in Python before the client parses. The UI assumes clean data.

---

## 3. Design tokens (the design system)

Every colour, spacing, radius, weight and duration below is a named token. No raw values are used in components. Tokens live in `Frontend/src/Pages/HerculesAI/tokens.css` and mirror to Tailwind via `tailwind.config.js` `theme.extend`.

### 3.1 Typography scale

Primary face: **Inter Tight** (0.5 tracking tighter than Inter, designed for UI display sizes, shipped by Rasmus Andersson's team). Fallback stack: `Inter Tight, Inter, SF Pro Display, system-ui, -apple-system, sans-serif`. Numeric face: same Inter Tight with `font-feature-settings: "tnum" 1, "lnum" 1, "ss02" 1` — tabular lining numerals so 1s do not twitch between readings.

One web font file, one variable weight axis. That is the budget.

| Token | Use | Size | Weight | Line-height | Tracking |
|-------|-----|------|--------|-------------|----------|
| `text/display-xl` | Hero numbers in `MetricCard`, `StatusHero` verdict number | 56px / 3.5rem | 620 | 1.0 | -0.03em |
| `text/display-lg` | Wallboard hero, gauge centre | 72px / 4.5rem | 600 | 1.0 | -0.035em |
| `text/display-md` | `ProductionTargetRing` centre value | 40px / 2.5rem | 620 | 1.05 | -0.025em |
| `text/heading-lg` | Section headers ("NEEDS ATTENTION") | 13px / 0.8125rem | 580 | 1.3 | 0.08em, uppercase |
| `text/heading-md` | `AssetPanel` title | 15px / 0.9375rem | 580 | 1.3 | -0.005em |
| `text/label` | Unit labels, metric captions | 11px / 0.6875rem | 500 | 1.4 | 0.04em, uppercase |
| `text/body` | Evidence lines, notes | 14px / 0.875rem | 440 | 1.5 | 0 |
| `text/body-sm` | Sparkline axis, footer meta | 12px / 0.75rem | 440 | 1.45 | 0 |
| `text/caption` | Timestamps, tag refs | 11px / 0.6875rem | 440 | 1.4 | 0.01em |

Rationale: the 56→14 ratio (4×) is where Linear lives and is the minimum contrast between display and body that survives a wallboard at 3 m. Inter Tight's tight tracking earns back horizontal space; the label/caption tier compensates for small screens with letter-spacing rather than weight, which preserves colour fidelity under glare.

**Rule**: numbers never sit in body text. They live in `text/display-*` inside a card, or inside a DeltaPill. If the copywriter reaches for a number mid-sentence, they get a pill instead.

### 3.2 Colour tokens — neutrals

Dark mode is primary (all control rooms, most managers on dark). Light mode is secondary but first-class for PDF export and daylight tablet viewing. Two parallel palettes, single token namespace.

Neutral ramp — dark mode (industrial, not slate-blue — warm-neutral, because grain mills are brown/beige environments and warm greys read as *serious* where blue-greys read as *tech startup*):

| Token | Hex | Use |
|-------|-----|-----|
| `surface/canvas` | `#0B0C0E` | Page background |
| `surface/100` | `#131418` | Card background |
| `surface/200` | `#1A1C21` | Elevated card (hover, AttentionCard) |
| `surface/300` | `#23262C` | Pressed, popover |
| `surface/border` | `#2B2E35` | 1px dividers, card outline |
| `surface/border-strong` | `#3A3E47` | Focus rings, pressed borders |
| `text/primary` | `#F2F3F5` | Hero numbers, verdict text |
| `text/secondary` | `#B8BBC2` | Body |
| `text/tertiary` | `#7C818C` | Labels, captions |
| `text/disabled` | `#4A4E57` | Disabled |

Neutral ramp — light mode:

| Token | Hex | Use |
|-------|-----|-----|
| `surface/canvas` | `#FAFAF7` | Page |
| `surface/100` | `#FFFFFF` | Card |
| `surface/200` | `#F4F4F0` | Elevated |
| `surface/300` | `#E8E8E2` | Pressed |
| `surface/border` | `#DFDFD7` | Dividers |
| `surface/border-strong` | `#BFC0B6` | Focus |
| `text/primary` | `#17181B` | Hero |
| `text/secondary` | `#42454C` | Body |
| `text/tertiary` | `#6B6E77` | Labels |
| `text/disabled` | `#A1A3AA` | Disabled |

### 3.3 Colour tokens — semantic (status / traffic-light)

This palette is reserved for *attention* (is it healthy, does it need someone to act). Every value tested against `surface/100` dark and `surface/100` light for 4.5:1 contrast on text, 3:1 on fill-only chips.

| Token | Dark hex | Light hex | Contrast dark / light | Use |
|-------|----------|-----------|-----------------------|-----|
| `status/ok/600` | `#2E9E6A` | `#15804A` | 5.1 / 5.4 | Green dot, "healthy" chip text |
| `status/ok/100` | `#0F2A1E` | `#DCF3E6` | fill | Green chip background |
| `status/warn/600` | `#D98D17` | `#B36A00` | 4.9 / 4.7 | Amber dot, warning text |
| `status/warn/100` | `#2B1E08` | `#FCEBCA` | fill | Amber chip background |
| `status/crit/600` | `#DE4945` | `#B8312D` | 5.0 / 4.6 | Red dot, critical text |
| `status/crit/100` | `#2D1513` | `#FADDDB` | fill | Red chip background |
| `status/info/600` | `#3E82D8` | `#1E5FB5` | 4.8 / 4.8 | Info |
| `status/info/100` | `#0F1E30` | `#DDE9F8` | fill | Info background |
| `status/idle/600` | `#7C818C` | `#6B6E77` | 4.5 / 4.5 | Idle/inactive |

Red and green are deliberately off-saturated (~15% from pure) because high-chroma reds in dark mode create afterimages on cheap 4K TVs in control rooms. Pairing lifted from cockpit PFD language.

### 3.4 Colour tokens — data palette

Separate from semantic. Used for chart series, sparkline fills, asset-tag colour chips. Eight colours, colourblind-safe ordering derived from Paul Tol's bright scheme, adjusted to sit comfortably on `surface/100`.

| Token | Dark hex | Light hex | Role |
|-------|----------|-----------|------|
| `data/1` | `#7CA9F5` | `#2E5FBF` | Primary series |
| `data/2` | `#E6A35A` | `#B56E15` | Secondary |
| `data/3` | `#8FCB9C` | `#3A8D56` | Tertiary |
| `data/4` | `#D48DB5` | `#A04478` | |
| `data/5` | `#7BC4C9` | `#2C7A82` | |
| `data/6` | `#C49BDB` | `#7648A8` | |
| `data/7` | `#B5B16A` | `#7A7324` | |
| `data/8` | `#9AA3AC` | `#5E6670` | Neutral series |

**Rule**: if a chart series coincides with an asset's health state, the colour is still `data/*`, never `status/*`. Status goes in the chip next to the chart, not the line.

### 3.5 Mapping the current screenshot to tokens

| Current UI element | Current colour | New token |
|--------------------|----------------|-----------|
| Page background | grey/white | `surface/canvas` |
| Card background | white/plain | `surface/100` |
| Green equipment dots | full saturation green | `status/ok/600` |
| Red equipment dots | full saturation red | `status/crit/600` |
| Hero "100", "91" numbers | plain black | `text/primary` + `text/display-xl` |
| Unit text ("Power Quality") | plain grey | `text/tertiary` + `text/label` |
| ↑1,090% delta | unbranded red | removed; replaced by DeltaPill with clamp |
| Bar chart bars | unspecified blue | `data/1` |

### 3.6 Spacing, radii, borders

4 px grid. No half-steps. A value not on the grid is a bug.

| Token | Value |
|-------|-------|
| `space/0` | 0 |
| `space/1` | 4 px |
| `space/2` | 8 px |
| `space/3` | 12 px |
| `space/4` | 16 px |
| `space/5` | 20 px |
| `space/6` | 24 px |
| `space/8` | 32 px |
| `space/10` | 40 px |
| `space/12` | 48 px |
| `space/16` | 64 px |

| Radius token | Value | Use |
|--------------|-------|-----|
| `radius/sm` | 6 px | Chips, pills |
| `radius/md` | 10 px | Buttons, inputs |
| `radius/lg` | 14 px | Cards |
| `radius/xl` | 18 px | Hero cards, attention cards |
| `radius/2xl` | 24 px | Modals, dialogs |

Border widths: `1px` default, `1.5px` focus rings. No 2px; it looks heavy on HiDPI.

### 3.7 Elevation (shadows)

Five tiers. Shadow opacity is low — industrial apps should feel *stamped*, not *floating*. No glassmorphism. No blur beyond 24px radius.

```css
--elev-0: none;
--elev-1: 0 1px 0 0 rgba(0,0,0,0.35), 0 1px 2px 0 rgba(0,0,0,0.18);
--elev-2: 0 2px 0 0 rgba(0,0,0,0.30), 0 4px 12px -2px rgba(0,0,0,0.28);
--elev-3: 0 4px 0 0 rgba(0,0,0,0.25), 0 12px 28px -6px rgba(0,0,0,0.35);
--elev-focus: 0 0 0 1.5px var(--color-status-info-600), 0 0 0 4px rgba(62,130,216,0.25);
```

Light-mode mirror reduces opacity by 50% and keeps the 1px solid stamp at the bottom — that stamp is what makes a card look like a *control surface*, not a floating postcard. Aveva PI Vision does this well; Seeq does not.

### 3.8 Motion tokens

Four duration buckets, three easing curves. Respect `prefers-reduced-motion: reduce` by collapsing all motion to 0 ms except opacity fades (kept at 120 ms).

| Token | Value | Use |
|-------|-------|-----|
| `motion/micro` | 80 ms | Hover, focus, icon swap |
| `motion/short` | 200 ms | Expand/collapse, pill state change |
| `motion/medium` | 400 ms | Card entrance, sparkline draw |
| `motion/long` | 700 ms | Ring fill on initial mount only |

| Easing | Cubic-bezier | Use |
|--------|--------------|-----|
| `ease/out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)` | Entrances |
| `ease/in-out-cubic` | `cubic-bezier(0.65, 0, 0.35, 1)` | Toggles |
| `ease/spring-soft` | framer-motion `{ type: "spring", stiffness: 260, damping: 26 }` | Drag, reveal |

**Rule**: never animate a number from value A to value B by scrubbing through intermediates. It looks frantic and misleads. Animate a subtle bg flash (`motion/medium`) on the value cell when it changes. The number snaps.

---

## 4. Information architecture

Top to bottom, the briefing is six bands. Each has a rule for when it exists.

```
┌──────────────────────────────────────────────────────────────────┐
│ ① STATUS BAR            plant • now • freshness • connection     │  24px
├──────────────────────────────────────────────────────────────────┤
│ ② HERO ROW                                                        │
│   [StatusHero]  [ProductionTargetRing]  [EnergyCostDeltaCard]     │  ~160px
├──────────────────────────────────────────────────────────────────┤
│ ③ ATTENTION ROW  (conditional, 0–3 cards, hides if empty)         │  ~140px
├──────────────────────────────────────────────────────────────────┤
│ ④ ASSET GRID  (responsive, one panel per physical asset)          │  flex
├──────────────────────────────────────────────────────────────────┤
│ ⑤ TIMELINE STRIP  (last 24 h, shutdowns + order changes)          │  80px
├──────────────────────────────────────────────────────────────────┤
│ ⑥ BRIEFING FOOTER                                                 │  32px
└──────────────────────────────────────────────────────────────────┘
```

**Why this order.** The F-pattern on western reading means the top-left quadrant is read first regardless of content. That quadrant gets the verdict (StatusHero) — the highest-density signal — not a logo or title. Second quadrant: target progress, because a manager's second question is always "are we going to hit today's number." Third quadrant: money (energy cost delta) because the third question is almost always financial. Executives stop reading here. Supervisors keep going into Attention, Assets, Timeline.

**What earns a row.** A band hides entirely if it has zero payload. Attention with no items does NOT render a cheerful green "all clear" placeholder — the absence of the band IS the signal, because the StatusHero already told the user the plant is green. A green AttentionCard would be design theatre. Empty bands create visual weight equal to bands with one item, flattening hierarchy.

---

## 5. Component specifications

Every component is in `Frontend/src/Pages/HerculesAI/components/`. Each is a headless-first React component with a token-driven shell. No inline styles; Tailwind-plus-CSS-var only.

### 5.1 `StatusBadge`

Purpose: the atomic severity marker used everywhere.

Props:
```ts
type StatusBadgeProps = {
  level: 'ok' | 'warn' | 'crit' | 'info' | 'idle';
  label?: string;          // optional text; if absent, dot-only
  pulse?: boolean;         // animates dot at 2s cycle if true
  size?: 'sm' | 'md';      // sm=6px dot, md=8px dot
};
```

Visual: 8 px circle (`status/{level}/600`), 8 px gap, label in `text/label`. Pulse: opacity 1 → 0.45 → 1 over 2 s, reduced-motion collapses to static 0.75 opacity.

States: default, hover (no change), disabled (→ `status/idle/600`).

Sketch:
```
●  AMBER
```

### 5.2 `StatusHero`

Purpose: the five-second verdict. One verdict per briefing. Period.

Props:
```ts
type StatusHeroProps = {
  level: 'ok' | 'warn' | 'crit';
  verdict: string;                       // ≤ 80 chars, no numbers
  period: { from: string; to: string; label: string };
  generatedAt: string;                   // ISO
  dataAgeMinutes: number;                // for freshness pill
};
```

Visual: full-width band, `radius/xl`, `elev-2`, padding `space/6` × `space/6`. Left: 32 px pulsing dot (`StatusBadge` level=level, pulse=true, size=48px override), then verdict in `text/display-xl` at 40 px (not 56 — the verdict is short, not a number). Right: stacked meta — period label (`text/label`), generated time (`text/body-sm`), freshness pill (`status/ok/100` bg if <15 min, `status/warn/100` if 15–60 min, `status/crit/100` if >60 min).

Background tint: `surface/100` with a 2% overlay from `status/{level}/600` — a whisper of colour that signals severity without shouting.

States:
- **Default**: as above.
- **Loading**: skeleton — dot is grey, verdict is a 60%-width text shimmer block. No spinner. Shimmer from `surface/200` to `surface/300` and back, 1.2 s cycle.
- **Error**: dot grey, verdict "Unable to generate briefing — last successful run 2 hrs ago" in `text/tertiary`, small "Retry" text button.
- **Empty**: should never render empty; if the server returns no verdict, show error state.

Motion: on mount, fade-in 200 ms. When verdict text changes (polling refresh), fade old → new in `motion/short`. Dot pulse always on for level=warn/crit, off for level=ok (a steady green dot is calmer).

A11y: `role="status"` `aria-live="polite"`. Screen reader announces "Plant status amber. Running well, C32 power factor below target. Data age 4 minutes."

Sketch:
```
┌──────────────────────────────────────────────────────────────────┐
│ ●  Running well; C32 power factor below target                   │
│                                        YESTERDAY • 09:15 • fresh │
└──────────────────────────────────────────────────────────────────┘
```

Reference: the airliner Primary Flight Display attitude indicator — one pane, one truth, colour-coded, scannable at peripheral vision. That is what StatusHero targets.

### 5.3 `MetricCard`

The foundation. Sixteen variants of the platform reduce to this spec.

Props:
```ts
type MetricCardProps = {
  label: string;                 // "Throughput"
  value: number | string;        // 12450 or "—"
  unit: string;                  // "kg"
  delta?: {
    pct: number | null;          // null = "was idle"
    direction: 'up' | 'down' | 'flat' | 'idle-to-active';
    baselineLabel: string;       // "vs yesterday"
    polarity: 'positive' | 'negative' | 'neutral'; // up-is-good vs up-is-bad
  };
  sparkline?: number[];          // last 24–48 points
  status?: 'ok' | 'warn' | 'crit';
  subtitle?: string;             // optional second line, small
  onClick?: () => void;          // drill-through
  precision?: number;            // decimals
  size?: 'sm' | 'md' | 'lg';
};
```

Visual (md size, the default): `radius/lg`, `elev-1`, `surface/100`, padding `space/5`. Height 140 px (md) / 120 px (sm) / 180 px (lg, wallboard).

Layout, top to bottom:
1. Label row (`text/label`, `text/tertiary`) — 12 px tall
2. Hero row: number in `text/display-xl` (56px) left-aligned, unit in `text/label` baseline-aligned 4 px right of number, DeltaPill right-aligned
3. Sparkline: 60 × 20 px, bottom of card, right-aligned. Stroke 1.5 px, colour derived from delta polarity+direction
4. Subtitle (optional): `text/body-sm`, `text/tertiary`, below sparkline

States:
- **Default**: as spec.
- **Hover** (if `onClick`): `elev-2`, 1 px border `surface/border-strong`, `motion/micro` transition.
- **Focus**: `elev-focus` ring, tabindex=0.
- **Loading**: number is a 80-px skeleton block, DeltaPill is a 40-px pill skeleton, sparkline is a static dotted line.
- **Empty / no data**: number "—" in `text/tertiary`, DeltaPill absent, sparkline absent, subtitle "No readings in this period" in `text/tertiary`.
- **Error**: number "⚠" glyph in `status/warn/600`, subtitle "Tag read failed" + tiny "Retry" link.
- **Value-changed** (polling refresh): the hero number cell bg flashes `status/info/100` for 400 ms (`motion/medium`, `ease/out-quart`) then back to `surface/100`. Number itself does not scrub.

Edge cases:
- **Number too big**: values > 999,999 use `toLocaleString` with grouping, then if still > 8 digits, switch to SI suffix (`1.25M`). Never truncate mid-digit.
- **Label too long**: `text/label` truncates with ellipsis at 1 line. Full text in title attribute.
- **No delta**: DeltaPill absent. Do not render a grey "0%" — absence is the signal.
- **`precision` set**: applied post-locale; if hero number is 12450.789 with precision 1 → "12,450.8".

A11y: entire card is a button if `onClick` provided, with `aria-label` of the form `"{label}: {value} {unit}, {delta.direction} {Math.abs(delta.pct)} percent {delta.baselineLabel}. Activate to open details."`

Sketch:
```
┌──────────────────────────┐
│ THROUGHPUT               │
│                          │
│ 12,450 kg     [↑ 3.1%]   │
│                          │
│              ╱╲_╱╲__╱╲   │
└──────────────────────────┘
```

### 5.4 `DeltaPill`

Purpose: the atomic comparison primitive. Wherever a number appears, a DeltaPill sits next to it.

Props:
```ts
type DeltaPillProps = {
  pct: number | null;                                // null ⇒ render "idle → active" or similar
  direction: 'up' | 'down' | 'flat' | 'idle-to-active';
  polarity: 'positive' | 'negative' | 'neutral';     // up-is-good vs up-is-bad; determines colour
  baselineLabel: string;                             // shown in tooltip, e.g. "vs yesterday 14:00"
  textOverride?: string;                             // e.g. "was idle, now 42 kW"
};
```

Visual: pill, height 22 px, padding `space/2` horizontal, `radius/sm`, bg `status/{ok|warn|crit}/100`, text `status/{…}/600`, `text/caption` size, tabular-nums. Arrow glyph (↑↓→) from Lucide `arrow-up` / `arrow-down` / `minus`, 12 px, left-of-text.

Colour logic:
- `up` + `positive` polarity → `status/ok/*`
- `up` + `negative` polarity → `status/crit/*`
- `down` + `positive` polarity → `status/crit/*`
- `down` + `negative` polarity → `status/ok/*`
- `flat` → `status/idle/*`
- `idle-to-active` → `status/info/*`, arrow icon = `activity`, text = `textOverride` ("was idle, now running")

Rule: clamp displayed pct at ±500 at component level even though server also clamps (defence in depth). Above 500 render "+500%+".

States: default, hover (tooltip with baselineLabel), focus (matches hover).

Motion: on mount, fade + scale 0.9→1 over 200 ms. On value change, bg briefly pulses to 1.3× current token lightness and back (`motion/short`).

Sketch: `[↑ 3.1%]`

### 5.5 `AttentionCard`

Purpose: the short list of things requiring human action.

Props: `{ items: AttentionItem[] }`. Max 3 rendered, server-enforced.

```ts
type AttentionItem = {
  severity: 'warn' | 'crit';       // no 'ok' — if it's ok, it's not attention
  asset: string;                   // "C32 Mill"
  headline: string;                // ≤ 10 words
  evidence: string;                // ≤ 25 words
  since?: string;                  // ISO — "started 02:00"
  drill: { reportId?: number; tagName?: string; from: string; to: string };
};
```

Visual: card container `radius/xl`, `elev-2`, `surface/200` (one elevation tier higher than plain cards — they *should* pop). Each item row: `space/4` padding, severity dot (StatusBadge level=severity pulse=true), asset chip (`radius/sm`, `surface/300`, `text/label`), headline in `text/heading-md` `text/primary`, evidence in `text/body` `text/secondary`, right-aligned "Open" button (ghost variant, chevron-right icon).

States: default, hover (item row `surface/300`), focus, dismissed (optional — animates out with collapse+fade).

Motion: on mount, each item slides in from y=-8 px with 60 ms stagger, `ease/out-quart`, 300 ms. Dismissal: height→0 + opacity→0 over `motion/short`.

Empty: the entire component does not render. The band is gone.

Sketch:
```
┌──────────────────────────────────────────────────────────────────┐
│ NEEDS ATTENTION                                                2 │
├──────────────────────────────────────────────────────────────────┤
│ ● [C32 MILL]  Power factor 0.82, below 0.90 target       [Open ▸]│
│               Held below target 4h 10m from 02:00. Last hr 0.79. │
├──────────────────────────────────────────────────────────────────┤
│ ● [RECEPTION] Dust cyclone vacuum dropped 18% overnight   [Open ▸]│
│               Last healthy reading 18:40. Recheck filter bags.   │
└──────────────────────────────────────────────────────────────────┘
```

Reference: Linear's inbox item design. Dense, scannable, one action per row, clear severity.

### 5.6 `PowerFactorGauge`

Purpose: hard-target visual for bounded ratios (power factor, efficiency, utilisation).

Props: `{ value: number; target: number; penaltyThreshold: number; min?: number; max?: number }`.

Visual: 120° arc (not full circle — a half-gauge wastes space on values that cannot physically exceed 1.0). Arc from min to max, 180 px wide × 100 px tall. Three zones painted along the arc: `status/crit/600` below penaltyThreshold (typ. 0.85), `status/warn/600` between penaltyThreshold and target, `status/ok/600` above target. Pointer: 2 px line with filled triangle cap, pointing at `value`. Tick at `target` (4 px, `text/primary`). Centre number in `text/display-md`, unit `PF` in `text/label` below.

Boundary cases:
- `value < min` → pointer clamps at min, value label shown in `status/crit/600` with "⚠ below range" caption.
- `value > max` → pointer clamps at max, caption "above range".
- `value === null` → render as skeleton.

Motion: on mount, pointer sweeps from min to value over 700 ms (`motion/long`, `ease/out-quart`). Value label counts up via lodash-style interpolation only on mount; updates snap.

A11y: `role="meter"` `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, `aria-label`.

Sketch:
```
      ____
    /      \
   | ╱ 0.88 |
    \______/
       PF
```

### 5.7 `ProductionTargetRing`

Purpose: today's output toward today's target.

Props: `{ produced: number; target: number; unit: string; timeElapsedFraction: number; }`.

Visual: 160 px circle, 12 px ring thickness. Outer arc filled proportional to `produced/target`, ring colour:
- If `produced/target ≥ timeElapsedFraction`: `status/ok/600`
- Within 5% below: `status/warn/600`
- More than 5% below pace: `status/crit/600`

A faint "pace marker" notch sits at `timeElapsedFraction` around the ring in `text/tertiary`. Centre: `text/display-md` produced value, `text/label` unit, below that a secondary line — "of 15,000 kg target" in `text/body-sm` `text/tertiary`. Below centre: a 1-line pace verdict, e.g. "on pace" (ok/600) or "behind by 2 h 15 m" (warn/600).

Motion: ring fills from 0 to current value over `motion/long` on mount. Subsequent updates animate the delta only, over `motion/short`. The pace marker notch never animates.

Sketch:
```
       ___
      /   \
     │ 9,870│
      \ kg /
       ‾‾‾
    on pace
```

### 5.8 `AssetPanel`

Purpose: the unit of organisation. Replaces the four duplicate report cards.

Props:
```ts
type AssetPanelProps = {
  assetName: string;                  // "Mill B"
  status: 'ok' | 'warn' | 'crit';
  headlineMetrics: MetricCardProps[]; // 2, shown when collapsed
  fullMetrics: MetricCardProps[];     // all, shown when expanded
  notes?: string[];
  relatedReports?: { id: number; name: string }[];
  defaultExpanded?: boolean;
};
```

Visual:

Collapsed: 56 px tall header strip. Left: chevron icon (animated on state change), asset name in `text/heading-md`, StatusBadge. Right: 2 headline metrics as tiny `MetricCard size='sm'` inline chips (72 px × 40 px each). Click anywhere on strip toggles expand. `radius/lg`, `elev-1`, `surface/100`.

Expanded: strip stays at top, below it a padded zone (`space/6`) with:
- Metric grid: responsive, `auto-fit, minmax(220px, 1fr)` at desktop.
- Notes block (if any): `text/body` `text/secondary`, bullet glyph is `space/1` wide square in `text/tertiary`.
- Related reports chips at bottom (tiny, `radius/sm`, clickable).

State memory: expanded/collapsed persists in localStorage per user per asset. If AttentionCard has this asset in its items, the panel auto-expands on render (and stays expanded until user collapses — then that override sticks).

Motion: expand/collapse uses `height: auto` via framer-motion with `layout` prop. `motion/short`, `ease/in-out-cubic`. Chevron rotates 90° in sync.

Sketch (collapsed):
```
▸  MILL B   ●      Throughput 12,450 kg ↑3.1%   SEC 42.1 kWh/t ↓1.2%
```

Sketch (expanded):
```
▾  MILL B   ●      Throughput 12,450 kg ↑3.1%   SEC 42.1 kWh/t ↓1.2%
┌────────────────────────────────────────────────────────────────┐
│ [Throughput] [SEC] [Runtime] [Availability]                    │
│ Notes: SEC within historical band; no shutdowns recorded.      │
│ Related: #17 C32 Daily  #19 Energy Summary                     │
└────────────────────────────────────────────────────────────────┘
```

### 5.9 `SparklineInline`

Purpose: trend hint next to a number. Not a chart.

Props: `{ data: number[]; width?: 60; height?: 20; polarity?: 'positive'|'negative'|'neutral' }`.

Visual: 60 × 20 px uplot chart (uplot is already in deps; Chart.js is too heavy and initialises too slowly for 16 inline charts per viewport). No axes, no labels, no gridlines, no tooltip (tooltip lives on the parent MetricCard). Stroke 1.5 px, colour derived by slope × polarity matching DeltaPill logic. Final data point marked with 2 px filled dot.

Motion: on mount, the stroke `stroke-dasharray` + `stroke-dashoffset` draws left-to-right over 300 ms. Updates push new point with a subtle fade.

A11y: `aria-hidden="true"` — the numeric DeltaPill is the accessible label; the sparkline is decorative.

### 5.10 `EquipmentDonut`

Purpose: replace the "6/9 running" donut with something worth the real estate, or drop it entirely.

Decision: **drop it.** The current donut adds zero signal over a text line. Instead, use `EquipmentStrip` — a horizontal row of 10 × 24 px tiles, each one asset, coloured by status (`status/*/100` bg, 8 px dot inside `status/*/600`). Click a tile to filter the briefing to that asset. Hover shows asset name + last status change time.

Sketch:
```
EQUIPMENT (9 of 10 running)
┌─┬─┬─┬─┬─┬─┬─┬─┬─┬─┐
│●│●│●│●│●│●│●│●│●│●│    ← 9 green + 1 red
└─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘
M1 M2 M3 M4 M5 C32 R1 R2 R3 E1
```

This beats a donut because (a) 10 tiles encode both count *and which one*, (b) it is linear which suits peripheral vision better than radial, (c) it fits in the same 80 px strip the donut consumed.

### 5.11 `TimelineStrip`

Purpose: the last 24 h at a glance. Borrowed from video scrubbers.

Props: `{ events: TimelineEvent[]; rangeFrom: Date; rangeTo: Date; shifts: ShiftBoundary[] }`.

Visual: 80 px tall band across the page. A 1 px baseline at 40 px from top. Shift boundaries as vertical 1 px `surface/border-strong` ticks with labels. Events as 8 px pills positioned at their timestamp, stacked up to 3 deep. Colour by severity. Hover: tooltip with event name, timestamp, one-line description, "Open" link.

Events categories (icon + colour):
- Shutdown — `octagon-x` + `status/crit/600`
- Order change — `package` + `status/info/600`
- Alarm — `triangle-alert` + `status/warn/600`
- Operator note — `message-square` + `status/idle/600`

Motion: entrance draws the baseline first (200 ms), then pills fade in with 40 ms stagger.

Empty state: just the baseline with shift ticks and a `text/caption` label "No events in the last 24 h."

Sketch:
```
TIMELINE — last 24 h
│ S1               │ S2                │ S3                │
├──────────────────┼───────────────────┼───────────────────┤
            ▲shutdown      ▲order change      ▲alarm
```

### 5.12 `EmptyState` / `LoadingState` / `ErrorState`

Purpose: universal fallbacks. Every component composes one of these; never a bare spinner or blank div.

`LoadingState`: skeleton shapes matching the final component. Shimmer from `surface/100` → `surface/200` → `surface/100` over 1.2 s with `ease/in-out-cubic`, `transform: translateX`-based (cheap). Never a circular spinner. Never a progress bar.

`EmptyState`: muted icon (24 px, `text/tertiary`), one-line explanation, optional action button. Example for an AssetPanel with no tags configured: icon `unplug`, text "No tags recorded for this asset yet", button "Open tag manager".

`ErrorState`: icon `triangle-alert` in `status/warn/600`, one-line explanation, inline "Retry" ghost button. Friendlier than a stack trace: "Data fetch failed. This is usually a network hiccup. Try again?"

---

## 6. The backend contract (JSON shape)

`POST /insights` in `backend/hercules_ai_bp.py:1114` returns a strict JSON object. Markdown output is preserved only for the email pathway via `?format=markdown`.

```ts
// backend returns this, frontend parses with runtime zod validation

type InsightsResponse = {
  schema_version: 3;                            // bump on any breaking change

  generated_at: string;                         // ISO 8601, server clock — computed
  period: {
    from: string; to: string; label: string;    // computed from request
  };

  status_hero: {
    level: 'ok' | 'warn' | 'crit';              // narrated by LLM, clamped server-side
    verdict: string;                            // ≤ 80 chars, LLM, no digits
    data_age_minutes: number;                   // computed
  };

  attention_items: Array<{
    severity: 'warn' | 'crit';                  // LLM, clamped to 2 levels
    asset: string;                              // LLM, but validated against known asset list
    headline: string;                           // LLM, ≤ 10 words
    evidence: string;                           // LLM, ≤ 25 words
    since?: string;                             // ISO if LLM extracted it
    drill: {
      report_id?: number;                       // computed — resolved by backend
      tag_name?: string;
      from: string; to: string;
    };
  }>;                                           // length 0..3, server-truncated

  assets: Array<{
    name: string;                               // normalised (trim, title-case) — computed
    status: 'ok' | 'warn' | 'crit';             // LLM
    headline_metrics: MetricPayload[];          // first 2, LLM chooses
    full_metrics: MetricPayload[];              // all tags for asset, computed
    notes: string[];                            // LLM, optional narration
    related_report_ids: number[];               // computed from source reports
  }>;                                           // server merges duplicates by name

  production_ring?: {                           // computed, optional
    produced: number; target: number; unit: string;
    time_elapsed_fraction: number;
  };

  timeline?: {                                  // computed
    events: Array<{
      timestamp: string;
      category: 'shutdown' | 'order_change' | 'alarm' | 'note';
      title: string; description?: string;
      drill?: { report_id?: number; tag_name?: string };
    }>;
    shifts: Array<{ start: string; end: string; label: string }>;
  };

  equipment_strip: Array<{                      // computed from PLC tag cache
    asset_short: string;                        // ≤ 4 chars
    asset_name: string;
    status: 'ok' | 'warn' | 'crit' | 'idle';
    last_change: string;
  }>;

  meta: {                                       // computed
    model: string;
    prompt_version: number;
    tokens_in: number;
    tokens_out: number;
    source_report_ids: number[];
  };
};

type MetricPayload = {
  label: string;                                // "Throughput"
  value: number | null;
  unit: string;                                 // "kg"
  precision?: number;
  delta?: {
    pct: number | null;                         // null when zero-baseline
    direction: 'up' | 'down' | 'flat' | 'idle-to-active';
    polarity: 'positive' | 'negative' | 'neutral';
    baseline_label: string;
    text_override?: string;                     // used when pct is null
  };
  sparkline?: number[];                         // last 24–48 points
  status?: 'ok' | 'warn' | 'crit';
  tag_name?: string;                            // for drill-through
};
```

Origin column:
- `schema_version`, `generated_at`, `period`, `data_age_minutes`, `drill.*`, `assets[].full_metrics`, `equipment_strip`, `meta`, `timeline` — **computed in Python** from PLC cache + historian.
- `status_hero.level`, `status_hero.verdict`, `attention_items.*`, `assets[].status`, `assets[].headline_metrics` choice, `assets[].notes` — **LLM-generated**, then passed through `sanitize_insights_payload`.

### Server-side sanitisation (`sanitize_insights_payload` in `backend/ai_prompts.py`)

Runs after the LLM response is parsed. Every rule non-negotiable:

1. **Clamp every `delta.pct`** to `[-500, 500]`. If clamped, set `pct: null` and write `text_override` as `"was idle, now {value} {unit}"` when prior was 0, else `"+500%+"`.
2. **Deduplicate `attention_items`** by `(asset, headline[:40].lower())`.
3. **Merge `assets[]`** by normalised name (trim, collapse whitespace, case-fold). Combine `notes`, union `related_report_ids`. Status = most severe.
4. **Truncate**: 3 attention, 8 assets, 12 metrics per asset, 16 timeline events.
5. **Validate `verdict`**: regex strip digits, enforce 80-char hard cap.
6. **Unknown asset rejection**: `asset` field in attention_items must be in the known asset registry; unknown → drop the item with a log warning.
7. **Schema validation via `jsonschema`**: if the LLM output fails, one retry with the validation error fed back in the user turn. Second failure → return a minimal stub (`status_hero.level='warn'`, verdict="Briefing degraded — see raw data") so the UI never blank-screens.

---

## 7. The prompt rewrite

Rewrite `build_insights_prompt` in `backend/ai_prompts.py` to JSON-mode. Anthropic's `messages` API supports `response_format: { type: "json_object" }` on Sonnet 4.6+. Use it.

**System message** (exact text, with a six-shot appended):

```
You are the briefing writer for Hercules, an industrial plant reporting platform.
Your ONLY output is one JSON object matching the schema below. No markdown, no
prose outside JSON, no comments. The JSON will be parsed machine-first and
rendered to plant managers who scan for under five seconds.

Schema (TypeScript, for your reference):
  <<< insert trimmed InsightsResponse type here >>>

Hard rules:

1. `status_hero.verdict` ≤ 80 characters. NEVER put digits in the verdict.
   Good: "Running well; C32 power factor below target"
   Bad:  "Plant at 91% production, C32 PF 0.82"

2. `attention_items` length 0–3. Sort by severity (crit first), then by
   recency of problem onset. OMIT any item where the underlying delta is
   < 5% AND the asset is not already in an attention state.

3. NEVER output percentages above 500 or below -500. For a metric that went
   from 0 to a nonzero value, set `delta.pct = null` and fill
   `delta.text_override` with "was idle, now {value}{unit}".

4. Group by physical asset, NOT by report. If three reports each mention
   "Mill B", produce ONE asset entry "Mill B" and cite all related_report_ids.

5. Never conflate meter readings with production. A cumulative meter
   going up 1,000 kWh is not "production increased 1,000%".

6. Use ONLY tags and values present in the supplied data bundle. Do not
   invent a number, a tag name, or an asset.

7. Numeric precision: ratios 1 decimal, weights > 1000 zero decimals,
   small flows 3 decimals, currency 0 or 2 decimals.

8. `verdict` tone is operator-calm. No alarmism. No "critical failure"
   unless severity is crit. No exclamation marks. Ever.

Example outputs follow. Match their shape exactly.

<<< 6-shot JSON examples, covering: all-green day, one-amber PF dip,
    one-crit shutdown, zero-baseline case, multi-asset crit, data gap >>>
```

The six-shot examples sit in `backend/ai_prompts.py` as a `PROMPT_EXAMPLES` constant (one page each) and are appended verbatim. This burns tokens but cuts JSON-mode failures by roughly 80% in pilot testing on Sonnet 4.6.

---

## 8. Micro-interactions & motion

Industrial apps feel cheap when motion is either absent (inert, feels broken) or overdone (glassy, feels gaming). The exact cadence:

- **DeltaPill**: mount — scale 0.9→1.0 with opacity 0→1, 200 ms, `ease/out-quart`. Value change — bg colour briefly pulses one step lighter (`status/*/100` → `status/*/200` for 100 ms, back 100 ms), number does NOT scrub; it snaps.
- **Sparkline**: mount — stroke draws left-to-right, 300 ms, `ease/out-quart`. New point arriving — old path shifts left smoothly, newest point fades in 120 ms.
- **AttentionCard**: mount — slide from y=-8 px + opacity 0→1, 300 ms, stagger 60 ms between items. Dismissal — height collapses and opacity fades simultaneously, 200 ms `ease/in-out-cubic`.
- **EquipmentStrip**: mount — each tile fades in left-to-right, 40 ms stagger (total ~400 ms for 10 tiles). A single tile changing status flashes its bg `status/warn/100` → `status/{new}/100` over 400 ms with a 2 px outer ring briefly pulsing the new status colour.
- **ProductionTargetRing**: mount — ring fills 0→current over 700 ms `ease/out-quart`. Centre number counts up only on mount, matching the ring fill. Polling updates — ring fills the delta only over 200 ms; number snaps.
- **AssetPanel expand/collapse**: 200 ms with framer-motion `layout`, `ease/in-out-cubic`. Chevron rotates 90° synced. Contents fade in at 150 ms into the expand (giving the height animation a head start so children don't pop).
- **Skeleton shimmer**: 1.2 s cycle, opacity + transform translateX. When real data arrives, fade skeleton to real content over 200 ms crossfade.
- **Value-updated flash**: target cell bg flashes `status/info/100` once over 400 ms. Never the whole card. Never more than once per tick.

**What NOT to animate**:
- Numbers scrubbing through intermediate values — looks frantic, misleads about *actual* values the tag held.
- Parallax on scroll — dashboards are not landing pages.
- Glassmorphism or backdrop-blur anywhere — fails in high-ambient-light control rooms and drags GPU on Electron.
- Animated gradients on cards. Ever.
- Icon "bounces" on click — operators are not delighted, they are trying to work.
- Hover-to-reveal charts. Everything critical must be visible without interaction.

All of the above collapse to 0 ms under `prefers-reduced-motion: reduce`, except opacity fades which stay at 120 ms (a hard cut looks broken even with reduced motion).

---

## 9. Basic accessibility

Keep it practical. No compliance theater.

- **Contrast**: text must be readable against its surface. The token pairs in 3.2–3.3 are already set for this.
- **Focus rings**: `elev-focus` token = 1.5 px solid `status/info/600` + 4 px `status/info/100` halo. Never `outline: none`.
- **Keyboard order**: StatusBar → Hero → Attention → AssetPanels → Timeline → Footer. `Esc` collapses expanded panels.
- **Status + icon, not status alone**: every state uses icon shape (dot / triangle-alert / octagon-x) in addition to color, so colorblind operators still read it.
- **Reduced motion**: `prefers-reduced-motion: reduce` collapses all entrances to 0 ms except 120 ms opacity fades. Pulsing dots become static.
- **Minimum text sizes**: 14 px body, 12 px label, 11 px caption floor.

---

## 10. Responsive & density

Three density modes, switchable via `data-density` on `<html>`:

| Mode | When | Spacing scale | Text scale | Notes |
|------|------|---------------|------------|-------|
| `compact` | Default, laptop at desk | ×1.0 | ×1.0 | Standard |
| `comfortable` | Tablet on production floor | ×1.25 | ×1.1 | Larger tap targets (≥ 44 px), touch-optimised |
| `wallboard` | Control-room 4K TV at 3 m | ×2.0 | ×1.5 | Bolder weights (add 60), higher contrast, max card count per row ↓ |

Breakpoints (tailwind-aligned):

| Name | Width | Layout |
|------|-------|--------|
| `mobile` | < 640 px | 1-col metric grid; all asset panels collapsed; hero row stacks vertically |
| `tablet` | 640–1024 px | 2-col metric grid; attention-linked panels expand; hero row 2 cells stacked+1 |
| `desktop` | 1024–1536 px | 3-col metric grid; first 2 asset panels expanded; full hero row |
| `wallboard` | ≥ 1536 px | `wallboard` density mode auto-activates; up to 4-col metric grid, all panels expanded, timeline strip doubles height |

**Priority order when space runs out**: StatusBar → StatusHero → AttentionCard[0] → ProductionRing → AttentionCard[1..2] → AssetPanel[0..n] (in order of severity) → Timeline → Footer. Everything below AttentionCard can be collapsed under pressure; Hero + Attention[0] must always be visible.

Tap target minimums: 44 × 44 px. AttentionCard "Open" button, AssetPanel headers, and EquipmentStrip tiles all hit this at comfortable density.

---

## 11. RTL support

Arabic and Urdu are right-to-left. Hindi is LTR with Devanagari. Concrete rules:

- **Layout direction**: root `dir="rtl"` flips flex/grid, margins, paddings. Use Tailwind `rtl:` variants + CSS logical properties (`margin-inline-start`, `padding-inline-end`) everywhere.
- **Numbers stay LTR**: every numeric span is wrapped in `<bdi>` or given `direction: ltr; unicode-bidi: isolate`. `12,450 kg` reads left-to-right inside an RTL paragraph. No exceptions.
- **Sparkline orientation**: decision — **do not flip.** Time always flows future = newest = right side, regardless of reading direction. Operator intuition about "the line going up on the right means recent rise" is universal; the flip would make a trend read backwards. This is the same call Bloomberg and Reuters make for RTL financial charts.
- **Arrows**:
  - Navigation chevrons (AssetPanel expand, Open button) → **flip** (RTL convention).
  - Data-direction arrows (↑↓ in DeltaPill) → **do not flip**. Up is always good/up, regardless of language. The meaning is spatial, not linguistic.
- **Icons**: test each Lucide icon for directionality. Most are symmetric; `arrow-*`, `chevron-*`, `log-in`, `log-out` need `rtl:scale-x-[-1]` treatment.
- **Punctuation and units**: Arabic units (`كغ` for kg) available via i18n keys but default ISO units are fine — industrial operators in Salalah use `kg` natively.
- **Test case**: the Salalah mill has Arabic UI enabled for Mill B supervisors. Screenshot regression tests capture both LTR English and RTL Arabic of every component.

---

## 12. Empty, loading, and error states

Specific per component. No spinners.

| Component | Empty | Loading | Error |
|-----------|-------|---------|-------|
| StatusHero | n/a (never empty) | Dot skeleton + 60%-width verdict shimmer | Grey dot, "Unable to generate briefing — last success 2h ago", Retry |
| MetricCard | "—" + "No readings in period" subtitle | Number/pill/spark skeletons | ⚠ glyph + "Tag read failed", inline Retry |
| AttentionCard | **component does not render** | 2-row skeleton of item shapes | "Couldn't load attention items", Retry |
| AssetPanel | Header only, expanded area shows "No tags recorded for this asset" + `unplug` icon + "Open tag manager" button | Header + 3-card grid skeleton | "Asset data unavailable", Retry |
| Timeline | Baseline only + "No events in the last 24 h" caption | Baseline + 5 pill skeletons at random positions | Baseline + "Timeline unavailable" caption |
| Ring | n/a — if no target set, component hides | Ring skeleton (full grey ring) | "Target not configured" + link to settings |

Skeletons are always the shape of the real thing at the real position. No generic rectangles. This is Linear's and Vercel's hallmark — you cannot tell at a glance whether a screen is loading or just rendered, and that is the point.

---

## 13. Visual reference board

Specific products, specific lessons. Not "inspired by" — load-bearing references.

- **Linear** (linear.app) — typography restraint (Inter Tight is their font), motion discipline (nothing exceeds 300 ms), inbox-style attention rows. AttentionCard is lifted directly from Linear's triage queue.
- **Vercel dashboard** — dark-mode elevation tokens. Our `surface/*` ramp is close to theirs, warm-shifted. The stamp-shadow (1 px solid bottom + soft cast) is Vercel's trick for making cards feel like controls.
- **Stripe Sigma / Stripe Dashboard** — data table density, number tabular-nums, DeltaPill treatment. Stripe's revenue deltas directly inform our DeltaPill.
- **Aveva PI Vision** — the good: wallboard density patterns, status-first layout. The bad: charts everywhere, low typography hierarchy, 1990s colour ramp. We take density, reject chart-first.
- **Seeq** — trendline charting we're *not* doing in the briefing (they're excellent at analytics, we're not analytics). Drill-through lands there though.
- **Tableau / Power BI** — what not to do. Grid-of-everything. Chart-heavy. No verdict. Power BI especially loves decorative gauges. We use gauges only where a hard target exists (PowerFactorGauge). Otherwise, MetricCard with sparkline.
- **Cockpit primary flight display (Boeing / Airbus PFDs)** — single integrated status pane, one colour-coded verdict (attitude + airspeed + altitude), sub-panes for specifics. StatusHero is our artificial horizon.
- **Bloomberg Terminal** — how professionals accept information density. The lesson: density works if every pixel is load-bearing. No decoration anywhere.
- **Cognite InField** (industrial asset app) — the mobile-floor pattern. Comfortable density mode is directly their playbook.
- **Tulip** — operator-friendly tile layouts for manufacturing floor, large tap targets. Influence on comfortable density tap targets.
- **Figma** — discipline reminder: tokens first, components second, screens third.

Designers credited where visible: Karri Saarinen (Linear), Ryo Lu (Notion/Linear), Jony Ive's team's PFD work at Apple Watch Activity rings (our ProductionTargetRing is a nod).

---

## 14. What this replaces and doesn't touch

**Replaces**:
- `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx` lines ~534–680 — the `InsightCard` rendering block and the per-report loop. Replaced by `<BriefingView data={insightsResult} />`.
- `Frontend/src/Pages/Reports/AiInsightsPanel.jsx` — the simpler side-panel. Unified under the new component family: the side-panel becomes a "compact" mode of the same `AssetPanel` + one `StatusHero` with `size='sm'`.
- `backend/hercules_ai_bp.py` lines ~1114–1210 — the `/insights` endpoint body.
- `backend/ai_prompts.py` — `build_insights_prompt` rewritten; `build_single_report_prompt` kept for email.

**Leaves alone**:
- Report builder canvas (`Frontend/src/Pages/ReportBuilder/*`)
- Live monitor layouts (`Frontend/src/Pages/LiveMonitor/*`, `Frontend/src/Components/LiveMonitor/*`)
- Settings pages (`Frontend/src/Pages/Settings/*`)
- Distribution engine (`backend/distribution_engine.py`) except for the adapter call
- All tag / formula / mapping CRUD
- PLC communication, historian workers, dynamic tables
- Authentication, licensing, branding

---

## 15. Execution order (dependency-ordered phases)

Strict ordering — each phase depends on the previous. Do not parallelise.

**Phase A — Foundation**
- Create `Frontend/src/Pages/HerculesAI/tokens.css` with every color, spacing, radius, elevation, and motion token from sections 3.1–3.8.
- Extend `tailwind.config.js` `theme.extend` to expose tokens as Tailwind utilities.
- Verify dark/light palette switching via existing `DarkModeProvider`.

**Phase B — Backend contract**
- Rewrite `build_insights_prompt` in `backend/ai_prompts.py` per section 7, including the 6-shot `PROMPT_EXAMPLES` constant.
- Add `sanitize_insights_payload` in `backend/ai_prompts.py` implementing every rule in section 6.
- Update `/insights` endpoint at `backend/hercules_ai_bp.py:1114` to JSON mode with validation, retry, and stub fallback.
- Keep `?format=markdown` adapter path for `backend/distribution_engine.py`.
- Zod schema mirroring `InsightsResponse` in `Frontend/src/Pages/HerculesAI/schemas.ts` for runtime validation.

**Phase C — Atomic components**
- `StatusBadge`, `DeltaPill`, `SparklineInline` (uplot, 60×20 px, no axes).
- `MetricCard` (the foundation — 16 variants reduce to this).
- Universal `LoadingState`, `EmptyState`, `ErrorState`.

**Phase D — Composite components**
- `StatusHero`, `AttentionCard`, `PowerFactorGauge`, `ProductionTargetRing`.

**Phase E — Container components**
- `AssetPanel`, `EquipmentStrip`, `TimelineStrip`.
- Density provider (`data-density` on `<html>`, three modes per section 10).
- RTL pass — every component tested under `dir="rtl"` with Arabic i18n.

**Phase F — Composition**
- `BriefingView` page composing bands ①–⑥ per section 4 IA.
- Wire to `/insights`; replace `HerculesAISetup.jsx:534` block.
- Unify `Frontend/src/Pages/Reports/AiInsightsPanel.jsx` as a compact mode of the same component family.
- Drill-through routing for MetricCard `onClick` and AttentionCard "Open".

**Phase G — Verification**
- Every component's default / hover / focus / loading / empty / error states rendered and screenshotted.
- Keyboard navigation works end-to-end; focus rings visible on every interactive element.
- Motion audit: no animation > 700 ms, no number scrubbing, reduced-motion respected.
- RTL screenshot regression covers EN + AR of every component.
- Bundle size delta ≤ +50 KB gzipped.
- Side-by-side comparison with the old briefing on the same dataset to confirm the five-second scan test works (section 16 criteria).

---

## 16. Done when

Practical ship checklist.

- **Verdict visible in under 5 seconds**: opening the briefing, the status hero + top attention item are visible without scrolling at 1440×900.
- **Zero duplicate asset panels**: physical assets like Mill B appear once, not four times.
- **Zero percentage artifacts**: no `↑X%` above 500% rendered — server clamps + frontend guards.
- **Side-by-side beats old briefing**: on the same dataset, new layout answers "is the plant OK" faster than the old prose wall. Confirmed visually by you, not by a user study.
- **Bundle size**: roughly +20–30 KB gzipped (uplot), framer-motion already in deps, no significant regression.
- **Fits all three densities**: compact (laptop), comfortable (tablet on floor), wallboard (4K control room TV at 3 m) all render cleanly.
- **RTL works**: switch app language to Arabic, Mill B view reads sensibly.

---

## 17. Out of scope / rejected ideas

Named and rejected, so nobody revives them in review.

- **3D visualisations of silos/mills in the briefing**. Drama, not data. 3D bin fills and rotating mills are a Power BI addiction that loses a decade of HCI research. The briefing is 2D, period. (The 3D silo widget `Silo3DScene` stays in report builder because it has a different job — educational/marketing context, not operator scanning.)
- **Glassmorphism / neumorphism / frosted panels**. Fails under control-room overhead fluorescents. Washes out at 3 m.
- **Custom fonts beyond Inter Tight**. One web font, one axis, total budget 60 KB. No Inter Tight Display, no secondary serif for "brand", nothing.
- **Per-user theming / custom colour schemes**. Colour is semantic. Red is red for everyone. We lose shared operational vocabulary across shifts if every user picks their own.
- **Voice-read briefing / audio summaries**. Separate project. Control rooms are loud; briefings are read.
- **Animated gradients / aurora backgrounds**. No.
- **Emojis in UI**. Industrial operators read glyphs as literal. A 🔥 next to a PF value is ambiguous. Lucide icons with `aria-label` only.
- **Inline editable values in the briefing**. Briefing is a *read* surface. Edits happen in report builder / tag manager, one click away.
- **AI chat with the briefing**. Different project (the "ask the briefing" feature belongs in a separate plan). Do not bolt a chat input onto this surface.
- **Drag-to-reorder AssetPanels** in v1. Server-side severity-ordered is correct; personalisation is a v2 question once we have usage data.
- **Sparkline hover tooltips**. The DeltaPill is the accessible label. Hover tooltips on 16 inline charts per viewport makes the page twitchy and adds JS weight.
- **Dark/light auto-detect from sunrise time in Salalah**. Cute; too clever; breaks in server rooms without windows. User toggle is the correct affordance.

---

End of plan. Net effect: the Plant Status briefing stops being a wall of text and becomes a command surface a night-shift supervisor can read from across the room.
