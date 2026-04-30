# Page Spec — Hercules AI / ROI Genius surface (`/hercules-ai`)

> Overrides `MASTER.md`. Reads only the deltas listed below; everything else inherits from Master.

**Plan reference:** `docs/plans/AI Features/05_ROI_Genius_Layer_Plan_30_04.md` §14
**Frontend route:** `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx` (current entry, replaced by new layout)
**Status:** spec — not yet built

---

## Page composition (the Bento) — POST-REVIEW

Five bands, top-down (StatusHero collapsed into SavingsRibbon, BillProjection consolidated plant-wide). Total scroll length on a 1080p display: ~1.3 viewports.

```
┌── Band 1 — SAVINGS RIBBON (the ONLY verdict) ─────────── 128 px ────┐
│ [Lottie motif 160×160]  Hercules saved you  [2,140 OMR] this month  │
│                          ↑ 31% vs last month                        │
│ ── 16 px sub-line ─────────────────────────────────────────────     │
│ Plant within targets · Mill B 91 t/h · 4 of 5 lines on              │
│ freshness 2 min ago · Trust 87/100                                  │
│ chips:  PF +480 · Yield +940 · Off-peak +720                        │
└─────────────────────────────────────────────────────────────────────┘

┌── Band 2 — ASSET BENTO (3 × N) ───────────────────────── scrolls ───┐
│ MILL B │ C32 MILL │ M30 MILL │ M31 MILL │ PASTA 1 │ PASTA E         │
│ each card: PacingRing · SECCard · PfPenaltyCard (3 metrics)         │
└─────────────────────────────────────────────────────────────────────┘

┌── Band 3 — TOP-3 ROI ACTIONS ──────────────────────────── 280 px ──┐
│ L1 Capacitor 142 OMR/mo │ L2 Yield 940 OMR/shift │ L3 Off-peak 72  │
│       (PULSING)                  (static)                (static)   │
└─────────────────────────────────────────────────────────────────────┘

┌── Band 4 — PLANT-WIDE BILL PROJECTION ─────────────────── 200 px ──┐
│ Today's bill so far  1,840 OMR        Projected  3,210 OMR          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━           │
│ Range 2,990–3,420  ·  Last Wed: 3,182 OMR                          │
└─────────────────────────────────────────────────────────────────────┘

┌── Band 5 — WATCH (forecasts + anomalies) ─────────────── 200 px ──┐
│ • C32 PF trending to 0.85 in 9 days  → estimate 220 OMR/mo at risk │
│ • Mill B yield drift -1.4% sustained 6h  → 940 OMR per shift       │
│ • (max 3 items; overflow opens AttentionCard list)                 │
└─────────────────────────────────────────────────────────────────────┘

┌── Footer ────────────────────────────────────────────── 48 px ───┐
│ Trust 87/100 · 142 tags analysed · Claude Sonnet 4.6 · v1.0.x     │
└─────────────────────────────────────────────────────────────────────┘
```

**Density caps (enforced in component code):**
- SavingsRibbon: max 3 sub-attribution chips visible. Overflow → "+N" chip → drawer.
- Sub-line in Ribbon: max 5 status atoms separated by middle-dots.
- Asset bento: max 6 cards. Overflow → horizontal snap-scroll. Each card now has 3 metrics (was 4 — Bill consolidated to Band 4).
- Top-3: literally 3. Never 4. Pulse only on rank-1.
- Plant-wide bill: ONE chart band. No per-asset bills.
- Watch: max 3 items. Overflow → opens existing AttentionCard list.

---

## Component overrides

### Band 1 — `SavingsRibbon.tsx` (the only verdict)

**Overrides Master:** absorbs StatusHero as a 16 px sub-line; uses Lottie hero motif (Phase A).

```css
.savings-ribbon {
  height: 128px;                                       /* +32 px to host sub-line */
  background:
    linear-gradient(90deg, rgba(202,138,4,0.06), rgba(202,138,4,0.02)),
    var(--hai-glass-1);
  border: 1px solid var(--hai-border);
  border-radius: 22px;
  padding: var(--space-md) var(--space-2xl);
  display: grid;
  grid-template-columns: 160px 1fr auto;
  align-items: center;
  gap: var(--space-lg);
  /* Post-review: NOT sticky. Sticky created two competing heroes. */
  z-index: 10;
}
.savings-ribbon__sub {
  font-size: 13px;                                     /* 16 px on desktop, 13 px on tablet */
  color: var(--hai-text-muted);
  display: flex;
  gap: var(--space-md);
  align-items: center;
  margin-top: 6px;
}
.savings-ribbon__sub .dot { color: var(--hai-border); margin: 0 4px; }
```

**Hero motif slot (160 × 160 — minimum viable size):** Lottie animated coin-stack. Causal motion: stack grows when savings increase. Lazy-loaded via dynamic import; static SVG frame shown until visible. Three.js deferred to Phase C with explicit ship-or-cut decision per plan §15.

**Money figure:** `--hai-display` size, `--hai-money` color, count-up tween 1.2 s on value-change only.

**Sub-line:** absorbs the original StatusHero verdict. Format: `<plant_status_verdict> · <primary_throughput> · <lines_on>/<lines_total> lines on · freshness <X> min ago · Trust <N>/100`. Capped at 5 atoms separated by middle-dot. Trust atom only appears as an atom when ≥ 70; below 70 it gets the large smoke-detector treatment and is removed from this row.

**Sub-attribution chips (right side of ribbon):** max 3, color-coded by source rule (PF, Yield, Off-peak). Overflow → "+N more" chip → opens audit drawer.

**Empty state:** Lottie idle frame; copy reads `Calibrating · keep using Hercules for 30 days`. Sub-line still shows live plant status (it's independent of savings calibration).

### Band 2 — Asset card (POST-REVIEW: 3 metrics, not 4)

```
┌─────────────── ASSET CARD (340 × 360) ───────────────┐
│  ╔══ MILL B ══╗     [● running]    ⋮ overflow menu  │  Title
│                                                      │
│       ▼ Pacing Ring (220×220)                        │  Pace
│    ┌─────────────┐                                   │
│    │  64 t / 96  │   ETA 21:14, +46 min margin       │
│    │   Δ −12%    │                                   │
│    └─────────────┘                                   │
│                                                      │
│  ◇ SEC      47.2 kWh/t   ↑10% vs baseline           │  SEC
│             Excess cost today: 87 OMR                │
│                                                      │
│  ◇ PF       0.74          ◐ PowerFactorGauge        │  PF
│             Penalty 142 OMR · Payback 7.7 mo →      │
└──────────────────────────────────────────────────────┘
```

**Bill projection removed from asset cards** (post-review): consolidated to plant-wide Band 4. Six per-asset bill charts violated the "max one chart per band" rule. One bill chart for the whole plant; per-asset breakdown lives in the drilldown drawer.

**PfPenaltyCard** reuses existing `PowerFactorGauge.tsx` (120° arc with target tick + zone bands). The mercury-gauge spec from the original §14.5 was retired to avoid two PF visualisations in two visual languages on the same page.

The "◇" rows use a tiny diamond as a section divider — pure CSS pseudo-element, no SVG icon. Each row is independently keyboard-focusable; clicking opens drilldown to the historian for that tag pair.

### Band 3 — `Top3LeversPanel.tsx` (POST-REVIEW)

```
┌── L1 ─────────┐  ┌── L2 ─────────┐  ┌── L3 ─────────┐
│ ⚡ C32        │  │ ⚖ Mill B      │  │ ⏱ Off-peak    │
│ Install       │  │ Investigate   │  │ Shift         │
│ capacitor     │  │ yield drift   │  │ dampening     │
│               │  │               │  │ to 22:00      │
│  [142 OMR/mo] │  │ [940 OMR/sh]  │  │  [72 OMR/mo]  │
│   ◉ pulsing   │  │   static      │  │   static      │
│  Pay 7.7 mo   │  │  Confidence   │  │  Easy fix     │
│  Conf 80%     │  │  85%          │  │  Conf 70%     │
│ ━━━━━━━━━━━━  │  │ ━━━━━━━━━━━━  │  │ ━━━━━━━━━━━━  │
│ See evidence →│  │ See evidence →│  │ See evidence →│
└───────────────┘  └───────────────┘  └───────────────┘
```

- Each card: `hai-card` + `hai-lever` modifier; `data-rank="1|2|3"` attribute drives the pulse rule in MASTER §6.6.
- **Pulse only on rank-1.** L2/L3 are static at idle (post-review: 3 simultaneous pulses violated motion budget).
- **No parallax tilt.** Hover is `translateY(-2px)` + shadow swap only — same as every other card. Lever cards do not need a unique depth language.
- Click: opens `LeverDetailDrawer` (Master z-index 30).
- "See evidence →" link: dotted underline, color `--hai-future`, opens drawer with chart pre-zoomed to relevant window.

### Band 4 — Plant-wide Bill Projection (NEW post-review)

```
┌────────────────────────────────────────────────────────────────────┐
│  Today's bill so far  1,840 OMR     Projected  3,210 OMR           │
│  ━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░             │
│       solid (consumed)         hatched (forecast) + halo (range)   │
│  Range 2,990–3,420  ·  Last Wed: 3,182 OMR                         │
└────────────────────────────────────────────────────────────────────┘
```

Single SVG band — no Recharts in critical path. Solid gold segment = consumed kWh × tariff. Hatched gold = projected remaining (median). Lighter halo around hatched = p10–p90 range, only shown when forecast accuracy badge is green or amber. When red/grey, halo hidden and copy reads "Forecast hidden — calibrating".

Tooltip on hover: hour-by-hour tariff breakdown (data already in `cost.py`). Click: opens drilldown drawer with full hourly chart (Recharts AreaChart, lazy-loaded only here).

### Footer — "Trust" chip + version

A tiny, persistent indicator. Shows `Trust 87/100` plus a 6-px-wide sparkline of last 30 days. Color: `--hai-good` ≥ 80, `--hai-warn` 70–79, `--hai-crit` < 70. Hover: tooltip explaining what feeds the score. Click: opens `/hercules-ai/model-health` (admin-only route — non-admins see a tooltip "ask admin to view model health"). When Trust < 70 AND user is admin, the score also surfaces large in the SavingsRibbon next to the money figure (smoke-detector pattern, anchored to ribbon not status — per plan §15).

---

## Empty / loading / error states

Per UX rule "Loading States" (severity HIGH): never blank, never frozen.

| State | Treatment |
|-------|-----------|
| First load | Skeleton screens for each card; `hai-card` shape with `animate-pulse` opacity 0.4↔0.7, no transforms. |
| Tag has no data | Card collapses to 64 px; copy: `<asset> calibrating — N more days of data needed.` Never zero-pretending. |
| Forecast disabled (MAPE > threshold) | Per Master + plan §13.3; card shows current accuracy + days-to-recover. Grey badge. |
| API error | Card shows red border-left, copy: `Couldn't load — retry` button. Auto-retry once at 5 s. |
| Slow API ( > 300 ms) | Spinner overlays skeleton. Per UX rule "Loading Indicators". |

---

## Responsive breakpoints

Override Master grid: 12-column desktop → 6-column tablet → 1-column mobile, with a horizontal-snap variant for the asset bento on mobile so users can swipe through assets.

```css
/* desktop ≥ 1280 */ .hai-bento > .asset { grid-column: span 4; }
/* laptop  1024-1280 */ @media (max-width:1280px) { .hai-bento > .asset { grid-column: span 6; } }
/* tablet   768-1024 */ @media (max-width:1024px) { .hai-bento { grid-template-columns: repeat(6, 1fr); } .hai-bento > .asset { grid-column: span 3; } }
/* mobile  ≤ 640 */
@media (max-width: 640px) {
  .hai-bento {
    grid-template-columns: none;
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    gap: var(--space-md);
  }
  .hai-bento > .asset { flex: 0 0 88vw; scroll-snap-align: center; }
}
```

Floating bands (SavingsRibbon, StatusHero) use `top: var(--space-md); left: var(--space-md); right: var(--space-md);` per UX rule "Floating navbar" — never `top:0 left:0 right:0`.

---

## Specific overrides for `BillProjectionCard.tsx`

The Master spec for "Line with Confidence Band" applies. Page-level addition: when MAPE accuracy badge is amber, the dashed forecast line widens to 2 px and the band darkens to 28% opacity (visual signal that the prediction is less confident, even before the user reads the badge). When red/grey, the forecast line and band are hidden — only the actual line remains, with copy "Forecast hidden — calibrating".

---

## Specific overrides for `PfPenaltyCard.tsx`

Master spec: vertical mercury gauge. Page-level addition: a `1px solid var(--hai-money)` horizontal tick-line at the `pf_target` value (set in §12 of plan). When current PF is below target, the gauge fill above the line shows a `mix-blend-mode: difference` glow against the gauge bg — a subtle "danger" register without resorting to red flooding.

Background tint: 4% opacity `--hai-crit` when below target, 0% when at-or-above. Tint is mood, not alarm.

---

## Specific overrides for `LeverDetailDrawer.tsx`

Drawer width 480 px, height 100vh, `right: 0`, `z-index: 30`. Slides in via `transform: translateX(100%) → 0` over `--hai-dur-base` `--hai-ease-out`. The single chart inside uses the **Line Chart** type (per chart-domain "Trend Over Time") — not Line+Band — because at this depth the user wants the actual signal, not the forecast.

Two action buttons at bottom: **Mark as Actioned** (primary, fills with `--hai-money`), **Dispute** (secondary, ghost border `--hai-text-muted`). No "Dismiss" — disputing without feedback is forbidden per plan §13.4.

---

## Per-page anti-patterns (extra strict here)

- ❌ Tables on the main view. Tables go in drilldowns only.
- ❌ More than three colors visible in any 200×200 px region (excluding the chart area).
- ❌ Donut/pie charts. Banned. Use bar / line / band only.
- ❌ Floating action buttons. The Top-3 panel is the action surface.
- ❌ "Tour the AI" tutorial overlays — replaced by the 60-second onboarding modal in plan §12.
