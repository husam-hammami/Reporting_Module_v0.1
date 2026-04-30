# Design System Master File — Hercules ROI Genius

> **LOGIC:** When building a specific page, first check `design-system/hercules-roi-genius/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Hercules ROI Genius (plant-ops AI surface, Salalah Mill B + future sites)
**Generated:** 2026-04-30 (auto-generated, then manually upgraded — see "Provenance" at end)
**Category:** Industrial CFO Dashboard (financial dashboard × industrial monitoring)
**Plan reference:** `docs/plans/AI Features/05_ROI_Genius_Layer_Plan_30_04.md`

---

## 1. Style direction (locked)

**Primary style:** **Glassmorphism on Dark Mode (OLED)**, with one premium 3D moment.
**Supporting style:** **Dimensional Layering** (z-index scale 10/20/30/50, four elevation shadows).
**Pattern:** **Bento Grid Showcase** — modular, Apple-style, scannable, mobile-stackable.

**Why this stack:** glassmorphism alone risks reading as decoration; layered with deliberate dimensional elevation it becomes a CFO-grade information surface. Dark Mode (OLED) lets gold money figures feel premium without competing for attention. Bento Grid is the only pattern that lets us pack six asset cards plus a hero ribbon plus a Top-3 panel without feeling crowded.

**Anti-patterns (forbidden):**
- ❌ Cyberpunk neon (Matrix green, glitch effects) — wrong tone for financial trust.
- ❌ HUD/Sci-Fi FUI (1px lines, Iron Man brackets) — too gamified.
- ❌ Vaporwave / synthwave gradients — not money-serious.
- ❌ Light mode default.
- ❌ Emojis as icons.
- ❌ Decorative animation (anything that moves without a data reason).
- ❌ Glass-on-glass-on-glass (we use exactly two glass layers).
- ❌ Drop-shadow on text. Ever.
- ❌ Scifi fonts. Ever.

---

## 2. Color palette (locked)

Built on the **Banking/Traditional Finance** palette (authority navy + premium gold) layered with restrained semantic colors. Every gold surface is reserved for OMR figures.

| Role | Hex | CSS Variable | Use |
|------|-----|--------------|-----|
| Primary surface | `#0F172A` | `--hai-bg` | Page background base |
| Deep base | `#020617` | `--hai-bg-deep` | Gradient bottom of page |
| Glass layer 1 | `rgba(255,255,255,0.04)` | `--hai-glass-1` | Cards |
| Glass layer 2 | `rgba(255,255,255,0.07)` | `--hai-glass-2` | Hovered cards / drawers |
| Border | `rgba(255,255,255,0.10)` | `--hai-border` | 1px card outline |
| Highlight | `rgba(255,255,255,0.18)` | `--hai-highlight` | 1px inset on top edge of glass |
| Text | `#F8FAFC` | `--hai-text` | Body |
| Text muted | `#94A3B8` | `--hai-text-muted` | Labels, captions |
| **Money (gold)** | `#CA8A04` | `--hai-money` | OMR figures only |
| Money glow | `rgba(202,138,4,0.22)` | `--hai-money-glow` | Subtle pulse on hover |
| Sub-action / chip | `#8B5CF6` | `--hai-future` | Sub-actions, links, evidence chips, forecasts (one token, two roles) |
| Good | `#22C55E` | `--hai-good` | Status OK, on-track pace |
| Warn | `#FBBF24` | `--hai-warn` | At-risk pace, amber forecasts |
| Crit | `#EF4444` | `--hai-crit` | Will-miss, anomaly active |

**Contrast verification:**
- Body text `#F8FAFC` on `#0F172A` → 17.4:1 (AAA).
- Gold `#CA8A04` on `#0F172A` → 5.6:1 (AA-large for hero numbers; we use display sizes ≥ 56 px).
- Muted `#94A3B8` on glass-1 over `#0F172A` → 6.8:1 (AAA).

**Light mode (provided but secondary):** invert `--hai-bg` to `#F8FAFC`, glass-1 to `rgba(15,23,42,0.04)`, `--hai-money` darkened to `#854D0E` for AA. Light mode is supported but the brand register is dark-first.

---

## 3. Typography (locked — post-review)

**Two fonts, two jobs.** Reconciled with Plan 1 §3.1 — Inter Tight is already shipping in `Frontend/src/Pages/HerculesAI/tokens.css` and proven at wallboard distance. Plan 5 originally introduced Satoshi + IBM Plex but the design review correctly flagged the typographic conflict. **Inter Tight wins** on the "one font file in production" argument. JetBrains Mono retained for raw aligned values.

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| Display + Body | **Inter Tight** (Google) | 300, 400, 500, 600, 700 | Hero OMR numbers, asset titles, lever cards, all running text |
| Mono | **JetBrains Mono** (Google) | 400, 500 | Raw kWh values in tables, log lines, audit panels |

Inter Tight at weight 300 (hairline at display size) reads as premium for hero numbers; weight 500 holds for body. The variable-axis weight savings are the single largest bundle reduction in the design.

**Type scale:**
| Token | Size | Use |
|-------|------|-----|
| `--hai-display` | `clamp(56px, 6vw, 80px)` | Savings ribbon hero, asset hero number |
| `--hai-display-sm` | `clamp(40px, 4vw, 56px)` | Card hero numbers (SEC, PF) |
| `--hai-title` | `24px` / 1.2 | Asset card titles |
| `--hai-subtitle` | `16px` / 1.4 | Lever headlines |
| `--hai-body` | `13px` / 1.55 | Default running text |
| `--hai-label` | `11px` / 1.2, `letter-spacing: 0.08em`, `text-transform: uppercase` | Card labels, section dividers |
| `--hai-mono-md` | `13px` / 1.4 | Raw values |

**Numeric tabular figures:** `font-variant-numeric: tabular-nums lining-nums` on every container that displays numbers. Eliminates digit jitter on count-up tweens. Inter Tight supports `ss02` for slashed zero — apply via `font-feature-settings: "ss02"` on mono-adjacent contexts.

**Imports** (already present in `tokens.css` from Plan 1; only JetBrains Mono is new):
```css
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
```

`font-display: swap` is implicit in Google Fonts URLs. No FOIT.

---

## 4. Spacing & shadow scale

| Token | Value | Use |
|-------|-------|-----|
| `--space-xs` | `4px` | Tight gaps |
| `--space-sm` | `8px` | Icon gaps |
| `--space-md` | `16px` | Standard padding |
| `--space-lg` | `24px` | Card padding |
| `--space-xl` | `32px` | Section padding |
| `--space-2xl` | `48px` | Section margins |
| `--space-3xl` | `64px` | Page-edge padding |

| Token | Value | Use |
|-------|-------|-----|
| `--hai-shadow-rest` | `0 8px 16px -8px rgba(0,0,0,0.40)` | Card at rest |
| `--hai-shadow-deep` | `0 24px 48px -12px rgba(0,0,0,0.55)` | Card hovered, drawer open |
| `--hai-shadow-elev-3` | `0 10px 20px rgba(0,0,0,0.10)` | Modal |
| `--hai-shadow-elev-4` | `0 20px 40px rgba(0,0,0,0.15)` | Hero motif container |
| `inset 0 1px 0 var(--hai-highlight)` | (combined with above) | Top-edge inset on every glass card |

**Z-index scale (locked):** `10` overlay base · `20` sticky bars · `30` drawer · `40` modal · `50` toast/snackbar. Never use `9999`.

---

## 5. Motion language

Three universal rules:
1. **Animate only when data changes** — count-up tweens fire on value change, not on render. Card entrance is a one-time stagger.
2. **Causal motion only** — `transform` + `opacity` only (per UX rule "Transform Performance"). Never animate width/height/top/left.
3. **Maximum two animated elements per view** — per UX rule "Excessive Motion". The savings hero motif and one ring; nothing else moves at idle.

| Token | Value | Curve | Where |
|-------|-------|-------|-------|
| `--hai-dur-fast` | `180ms` | `--hai-ease-out` | Hover-elevate, drawer-out |
| `--hai-dur-base` | `420ms` | `--hai-ease-out` | Card mount, drawer-in |
| `--hai-dur-slow` | `820ms` | `--hai-ease-out` | Ring fill, count-up tween (non-savings) |
| `--hai-dur-tween` | `1200ms` | `--hai-ease-out` | Savings ribbon count-up only |
| `--hai-ease-out` | `cubic-bezier(.22,1,.36,1)` | (easeOutQuart) | Default for entering motion |
| `--hai-ease-in` | `cubic-bezier(.55,0,.67,0)` | (easeInQuart) | Exiting motion (drawer-out) |
| `--hai-ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | (small overshoot) | Lever pulse only |

**Reduced motion:** `@media (prefers-reduced-motion: reduce)` → all entrance animations switch to instant; savings count-up degrades to a 280 ms cross-fade between values; hero motif autoplay turns off, static frame remains. This is non-negotiable per UX rule "Reduced Motion" (severity HIGH).

**Easing rule:** ease-out for entering, ease-in for exiting. Never `linear` for UI.

---

## 6. Component patterns

### 6.1 Glass card (the universal primitive)

```css
.hai-card {
  background: var(--hai-glass-1);
  border: 1px solid var(--hai-border);
  border-radius: 18px;
  box-shadow:
    var(--hai-shadow-rest),
    inset 0 1px 0 var(--hai-highlight);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  cursor: pointer;
  transition:
    transform var(--hai-dur-base) var(--hai-ease-out),
    box-shadow var(--hai-dur-base) var(--hai-ease-out),
    background var(--hai-dur-fast) var(--hai-ease-out);
}
.hai-card:hover {
  background: var(--hai-glass-2);
  box-shadow:
    var(--hai-shadow-deep),
    inset 0 1px 0 var(--hai-highlight);
  transform: translateY(-2px);
}
.hai-card:focus-visible {
  /* Post-review: gold focus invisible on cards containing OMR. White wins. */
  outline: 2px solid rgba(255, 255, 255, 0.6);
  outline-offset: 4px;
}
```

`backdrop-filter` saturation 160% is the VisionOS pattern (per Spatial UI guidance) — it preserves chromatic vibrancy through blur, which prevents the gold money figures behind glass from going muddy.

### 6.2 Hero number (the OMR money figure)

```html
<span class="hai-money-figure" aria-label="Two thousand one hundred forty Omani Rial">
  <span class="value">2,140</span>
  <span class="unit">OMR</span>
</span>
```

```css
.hai-money-figure {
  font-family: 'Satoshi', 'DM Sans', sans-serif;
  font-weight: 300;
  font-size: var(--hai-display);
  line-height: 1;
  color: var(--hai-money);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.hai-money-figure .unit {
  font-size: 0.5em;
  font-weight: 500;
  margin-left: 0.4em;
  color: var(--hai-text-muted);
  letter-spacing: 0;
}
```

**Count-up:** implemented in `useCountUp` hook (framer-motion `useMotionValue` + `animate`); fires only when `Math.abs(next - prev) >= 1`. No fractional flicker.

### 6.3 Bento grid container

```css
.hai-bento {
  display: grid;
  gap: var(--space-lg);
  grid-template-columns: repeat(12, 1fr);
}
/* Asset cards span 4/12 on desktop, 6/12 on tablet, 12/12 on mobile */
.hai-bento > .asset { grid-column: span 4; }
@media (max-width: 1024px) { .hai-bento > .asset { grid-column: span 6; } }
@media (max-width:  640px) { .hai-bento > .asset { grid-column: span 12; } }
```

### 6.4 Conic-gradient pacing ring

```css
.hai-ring {
  width: 220px;
  height: 220px;
  background: conic-gradient(
    from -90deg,
    var(--hai-money) 0% var(--pct, 0%),
    rgba(255,255,255,0.06) var(--pct, 0%) 100%
  );
  border-radius: 50%;
  filter: drop-shadow(0 8px 24px rgba(202,138,4,0.18));
  mask: radial-gradient(circle 96px, transparent 95px, black 96px);
  -webkit-mask: radial-gradient(circle 96px, transparent 95px, black 96px);
  transition: --pct var(--hai-dur-slow) var(--hai-ease-out);
}
@property --pct { syntax: '<percentage>'; inherits: false; initial-value: 0%; }
```

`@property --pct` lets CSS interpolate the conic-gradient stop, replacing JS-driven SVG `stroke-dashoffset` with a pure-CSS draw-in. Falls back to a static fill on browsers without registered properties.

### 6.5 Forecast band — "Line with Confidence Band" (chart type)

This is the canonical chart type per the chart-domain search for time-series-forecast:
- **Actual:** solid line `#0F172A` on glass, but for our dark theme: `var(--hai-future)` solid line.
- **Forecast:** dashed line of same color.
- **Band (p10–p90):** filled area with 18% opacity of `--hai-future`.

Used in: `BillProjectionCard`, `ShiftPaceProjector` (mini view), and any drilldown showing a forecast.

```jsx
<AreaChart data={series}>
  <defs>
    <linearGradient id="forecastBand" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="var(--hai-future)" stopOpacity="0.30" />
      <stop offset="100%" stopColor="var(--hai-future)" stopOpacity="0.04" />
    </linearGradient>
  </defs>
  <Area dataKey="band" fill="url(#forecastBand)" stroke="none" isAnimationActive={false} />
  <Line dataKey="actual"   stroke="var(--hai-future)" strokeWidth={1.5} dot={false} />
  <Line dataKey="forecast" stroke="var(--hai-future)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
</AreaChart>
```

`isAnimationActive={false}` on the band — animating filled areas is expensive and not causal. The line draws in over `--hai-dur-slow`.

### 6.6 Pulse (lever attention) — POST-REVIEW: rank-1 only

```css
@keyframes hai-pulse {
  0%, 100% { box-shadow: 0 0 0 0 var(--hai-money-glow); }
  50%      { box-shadow: 0 0 0 12px transparent; }
}
/* Pulse only the rank-1 lever. L2/L3 are static at idle. */
.hai-lever[data-rank="1"]:not(:hover) .hai-money-figure {
  animation: hai-pulse 1.4s var(--hai-ease-out) infinite;
}
@media (prefers-reduced-motion: reduce) {
  .hai-lever .hai-money-figure { animation: none; }
}
```

Pulse uses `box-shadow` opacity, not transform — does not move siblings (per UX rule "Stable Hover States"). Three cards pulsing simultaneously was 4 simultaneous animations, over the §5 budget of 2. Rank-1 pulses; rank-2/3 attract on hover only.

### 6.7 Hover elevation — POST-REVIEW: parallax tilt removed

The original spec called for `rotateX(2deg) rotateY(±2deg)` parallax tied to mouse position. Both reviews flagged it as a third depth language fighting glass elevation + the 3D motif. Locked: hover is `translateY(-2px) + shadow swap` only, on every card including levers.

```css
.hai-lever:hover {
  transform: translateY(-2px);                   /* same as .hai-card:hover */
  box-shadow: var(--hai-shadow-deep), inset 0 1px 0 var(--hai-highlight);
}
```

---

## 7. Performance contract

- **Initial bundle (AI tab):** ≤ 220 KB gzipped. Three.js hero motif lazy-loaded via dynamic import; framer-motion already in bundle.
- **Time-to-meaningful-paint:** ≤ 1.0 s on Salalah office laptop (i5-8th, 8 GB).
- **Animation frame budget:** 60 fps sustained. Hero motif paused off-screen via IntersectionObserver. Pacing rings use CSS transforms (no JS layout reads).
- **React rendering:** Wrap only the high-frequency cost-chip components in `React.memo` (per react stack rule "Use React.memo wisely" — memo expensive lists, not simple buttons). The asset cards re-render on tag-poll; their child `MetricCard` is memoised, the parent is not.
- **Lazy-load below the fold:** `Top3LeversPanel` and `LeverDetailDrawer` chunk-split; loaded on scroll-near or click.
- **Font loading:** `font-display: swap` always; never invisible text.
- **Lighthouse gate in CI:** performance ≥ 90 on `/hercules-ai`.

---

## 8. Accessibility contract

- **Color contrast:** body 4.5:1 minimum, hero numbers AAA (verified above).
- **Focus states:** `outline: 2px solid var(--hai-money); outline-offset: 4px;` on every focusable card. Visible on dark background.
- **Keyboard nav:** every card focusable in DOM order matching visual order. Drawer reachable via Enter/Space; Escape closes.
- **Screen readers:** `aria-label` on icon-only buttons; hero numbers wrapped in `aria-label="full word form"` so SR doesn't read digits one at a time.
- **`prefers-reduced-motion`:** mandatory honor.
- **RTL (Arabic, Urdu):** asset grid mirrors via `dir="rtl"`; the hero motif stays on the visual leading edge regardless. Tested via existing `useRtl.ts`.
- **Touch targets:** 44×44 px minimum on every interactive surface (UX rule).

---

## 9. The "anti-PhD" enforceable rules

These are the design contract — violation gates a PR:

1. **Plant manager forms a verdict in ≤ 5 seconds.** Validated in user-test by counting from page-load to first verbal pass/fail judgement.
2. **Every number on screen has all four parts** (value, unit, delta, baseline). Lint rule in PR review checklist.
3. **Money is the single visual headline** — gold is reserved exclusively for OMR figures. Any other use of `--hai-money` is a bug.
4. **No technical vocabulary on screen** — banned words: EWMA, Holt-Winters, p10, p90, MAPE, RMSE, z-score, IsolationForest. Their plain-English replacements: "range", "accuracy", "accuracy badge", etc.
5. **Maximum two glass layers visible at any moment.** A modal opening over a card replaces, never stacks.
6. **Maximum 6 KPI cards visible at one viewport scroll.** Overflow → horizontal snap-scroll, not a longer page.
7. **Top-3 panel renders exactly three cards, always.** Missing slots fill with the "well-tuned" honest empty state.
8. **One verdict per page.** SavingsRibbon is THE verdict; StatusHero collapses into the ribbon as a 16 px sub-line. Two heroes is a bug.
9. **Maximum one chart per band.** Sparklines (≤ 32 px tall) don't count. Bill projection lives in its own band; lever drawer chart lives in the drawer; that's it.
10. **Maximum two animated elements at idle.** The Lottie motif counts as one. The rank-1 lever pulse counts as one. Anything else moving at idle is a bug.

---

## 10. Provenance — what was searched and why

This Master file replaces the auto-generated baseline with stronger picks discovered via supplementary searches:

| Decision | Auto-generated default | Locked choice | Why |
|---|---|---|---|
| CTA color | `#22C55E` (green) | `#CA8A04` (gold) | Money is the headline; gold reads as financial premium per Banking/Traditional Finance palette. Green stays semantic ("good" status only). |
| Heading + body font | Fira Code + Fira Sans | **Inter Tight** (post-review reconciliation) | Plan 1 already shipped Inter Tight; "one font file" beats Satoshi+IBM Plex on bundle and consistency. |
| Mono font | (none) | JetBrains Mono | Developer Mono pairing for raw kWh/OMR values that must align in tables. |
| Pattern | Horizontal Scroll Journey | Bento Grid Showcase | Bento beats horizontal scroll for high-density, scannable, mobile-stackable dashboards. |
| Style stack | Dark Mode (OLED) only | Glassmorphism + Dimensional Layering, on Dark Mode (OLED) | Glass + layering provides the depth the brief asked for; dark mode alone reads flat. |
| Forecast chart type | (unspecified) | Line with Confidence Band | Canonical chart for time-series-forecast per chart-domain search; matches plan §14.5 BillProjectionCard. |
| 3D moment (Phase A) | Three.js crystal/coin | **Lottie animated coin-stack, ≥ 160×160** | Both reviews: 80×80 Three.js indistinguishable from Lottie; bundle savings ~80 KB. Three.js deferred to Phase C with ship-or-cut decision. |
| Sub-action / chip color | `#1E3A8A` navy (`--hai-trust`) | **`#8B5CF6`** (`--hai-future`) | Navy invisible on `#0F172A` page bg per design review. Single token now serves chips + forecasts. |
| Card focus ring | gold `--hai-money` | white `rgba(255,255,255,0.6)` | Gold focus ring invisible on cards containing gold OMR figures. White wins; gold reserved exclusively for money. |
| Lever pulse | all 3 cards staggered | **rank-1 only** | Three pulses + ring fill + count-up + motif = 4+ animated elements at idle. Budget is 2. Rank-1 pulses; 2/3 quiet. |
| Hover effect on levers | parallax tilt + lift | **lift only** | Parallax tilt was a third depth language fighting glass + 3D motif. Both reviews flagged it. |

The auto-baseline was right about the foundation (Dark, Banking-adjacent palette, Inter-class type) but defaulted to a generic dashboard register. This file picks the financial-trust-and-premium register the brief asked for.

---

## 11. Pre-delivery checklist

Before merging any UI work to `Salalah_Mill_B`:

- [ ] Uses `tokens.css` from this design system; no inline hex codes.
- [ ] All clickable elements: `cursor: pointer`, focus-visible outline, 44×44 px touch target.
- [ ] All numbers: tabular-nums, four-part composition (value, unit, delta, baseline).
- [ ] All gold surfaces: only OMR money figures.
- [ ] All animations: transform/opacity only; honored `prefers-reduced-motion`.
- [ ] Maximum 2 animated elements per view at idle.
- [ ] No emojis as icons (Lucide React already in repo).
- [ ] Light/dark mode both tested.
- [ ] RTL tested (`dir="rtl"`).
- [ ] Lighthouse performance ≥ 90.
- [ ] Body contrast ≥ 4.5:1; hero numbers ≥ 7:1.
- [ ] No technical vocabulary on visible surfaces.
- [ ] No more than 6 KPI cards per viewport scroll.
- [ ] No `z-index` outside the 10/20/30/40/50 scale.

---
