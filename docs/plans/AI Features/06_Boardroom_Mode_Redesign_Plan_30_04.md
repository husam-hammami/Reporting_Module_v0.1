# Plan 6 — Hercules AI: Boardroom Mode Redesign

Date: 2026-04-30
Author: Senior Plant-AI Architect
Target branch: `Salalah_Mill_B`
Builds on: Plan 5 (ROI Genius Layer, Phases A+B shipped). Replaces Plan 5 §14.4 page composition.
Locked by: design-agent creative review (preferred over engineer's "tabs" answer).

---

## 0. Thesis

The deployed Phase A+B surface fails because it stacks **two fully-formed verdicts** about the same plant: a forward-looking ROI strip (mostly "Calibrating / Learning" today) above a backward-looking Phase 1 dashboard (full of working facts). This plan replaces both with a single sticky **Boardroom Card** — one premium glass card that fuses today's facts and tomorrow's forecast into one verdict paragraph — plus a segmented control beneath that swaps between four focused stages (Attention, Machines, Time, Audit). Phase 1 isn't deleted; it lives behind the **Time** chip, so its working data is preserved without competing for attention. The card is engineered to never feel empty: the hero number is contextual and always real (Plant Score, today's OMR, or last completed day), and the calibrating-state weakness becomes a feature via an "aging verdict" mechanic.

---

## 1. Page composition — the Boardroom

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   [coin]   PLANT VERDICT  ·  Wed 30 Apr · 14:08      [trust 87/100] │  ← top strip
│                                                                     │
│            92/100  ·  Running within targets                        │  ← hero
│            1,564 OMR today  →  ~3,100 by close                      │  ← gold money
│            21.4 kWh/ton  ·  2,929 t produced                        │  ← inline KPIs
│                                                                     │
│   ─────────────────────────────────────────                         │
│   ▸ 2 things worth your attention                                   │  ← teaser sub
│   ▸ 7 machines watched                                              │
│   ▸ Hercules learning · 28 days left                                │  ← only when calibrating
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘    280px max

[ Attention ] [ Machines ] [ Time ] [ Audit ]                              ← segmented control

┌── chosen stage fills here ─────────────────────────────────────────┐
│                                                                    │
│  (Attention default — Top-3 Levers + Watch list)                   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Total page on a 1080p display = 1.0–1.2 viewports. **No scroll-to-find required.** Card is sticky to the top of the AI tab so the verdict stays visible even when stage content scrolls.

---

## 2. The Boardroom Card — specification

### 2.1 Container

```css
.hai-boardroom {
  background:
    linear-gradient(135deg, rgba(202,138,4,0.04), rgba(202,138,4,0.01)),
    var(--hai-glass-1);
  border: 1px solid var(--hai-glass-border);
  border-radius: 24px;
  padding: var(--hai-space-6) var(--hai-space-8);
  box-shadow:
    var(--hai-shadow-deep),
    inset 0 1px 0 var(--hai-glass-highlight);
  backdrop-filter: blur(18px) saturate(160%);
  position: sticky;
  top: var(--hai-space-md);
  z-index: 30;                      /* above stage content */
  min-height: 240px;
  max-height: 320px;
  display: grid;
  grid-template-columns: 80px 1fr auto;
  grid-template-rows: auto 1fr auto;
  gap: var(--hai-space-2) var(--hai-space-5);
}
```

`max-height: 320px` is the **anti-splash-screen guarantee** — the card cannot grow tall enough to feel like a hero banner. If content exceeds, the teaser sub-list collapses to a single line with "+N more" overflow.

### 2.2 Top strip — three slots

| Slot | Content | Notes |
|---|---|---|
| Coin (left) | 80×80 Three.js gilding coin (lazy) | See §4 |
| Title + timestamp (centre) | "PLANT VERDICT  ·  Wed 30 Apr · 14:08" | All caps, 11px tracked, muted |
| Trust badge (right) | "Trust 87/100" or hidden when calibrating | See §3.3 |

### 2.3 Hero block — middle row

Three lines, ruthless typography hierarchy.

**Line 1 — primary verdict (the hero).**
- Font: Inter Tight 300, `clamp(56px, 6vw, 80px)`, `letter-spacing: -0.02em`, `tabular-nums`.
- Format: `<primary> · <verdict_text>`
- Colour rules:
  - `<primary>` is gold (`var(--hai-money)`) when it's an OMR figure.
  - `<primary>` is `var(--hai-text-primary)` (white) when it's a Plant Score or other non-money number.
  - `<verdict_text>` always `var(--hai-text-secondary)` (muted), 36px, weight 400.

**Line 2 — money line (always shown when production exists).**
- Font: Inter Tight 400, 22px, gold.
- Format: `1,564 OMR today  →  ~3,100 by close`
- The arrow `→` is a CSS gradient with a soft 4px gold glow.
- The projection (`~3,100 by close`) is the **ghost number**:
  - Hidden until forecast confidence ≥ 60% (band width / projected ≤ 30%).
  - Crossfades in over 800ms `--hai-ease-out-quart` when threshold crosses.
  - Rendered with `opacity: 0.55`.
  - The `→` arrow only appears when ghost is visible.

**Line 3 — inline KPIs (Phase 1's working data).**
- Font: Inter Tight 500, 14px, `tabular-nums`.
- Color: `var(--hai-text-secondary)`.
- Format: `21.4 kWh/ton  ·  2,929 t produced  ·  4 of 5 lines on  ·  freshness 2 min ago`
- Maximum 4 atoms separated by middle dots.
- Atoms are dropped (not stacked) when they don't fit on one line — gracefully degrades on narrow screens.

### 2.4 Sub-list — bottom row (the "teaser")

Three bullets max, 13px, inline icons, no card backgrounds.

```
▸ 2 things worth your attention      ← Attention chip count (forecasts + anomalies)
▸ 7 machines watched                  ← Machines chip count (assets in assets_view)
▸ Hercules learning · 28 days left   ← only when calibrating; replaces 4th line otherwise
```

Each bullet links to its corresponding stage chip (clicking selects the chip and scrolls).

The calibrating bullet is the **only acknowledgement of empty state on the card**. Everything else above it is real data. This is the discipline that prevents splash-screen feel.

### 2.5 Status dot

A 10px coloured dot precedes the verdict text on Line 1:
- `var(--hai-status-ok-600)` when `plant_status_level === 'ok'`
- `var(--hai-status-warn-600)` when `'warn'`
- `var(--hai-status-crit-600)` when `'crit'`

Drives the user's 5-second judgement.

---

## 3. Hero number selection — contextual algorithm

The single most important rule: **the hero number is always a real number, never the word "Calibrating".** This is the splash-screen mitigation.

```typescript
function pickHero(now: Date, payload: RoiPayload): HeroBlock {
  const hour = now.getHours();
  const bill = payload.forecasts?.daily_bill;
  const score = payload.plant_score;             // NEW from Phase 1
  const sav  = payload.savings;

  // Material confidence check on forecast (band width)
  const confidentForecast = bill?.projected_omr && bill?.p10_omr && bill?.p90_omr
    ? (bill.p90_omr - bill.p10_omr) / bill.projected_omr <= 0.30
    : false;

  // 1. Mid-shift with confident forecast → today's OMR + ghost projection
  if (bill?.so_far_omr > 0 && confidentForecast) {
    return {
      kind: 'omr_with_projection',
      primary: bill.so_far_omr,
      ghost:   bill.projected_omr,
      verdict: payload.plant_status_verdict,
    };
  }

  // 2. Mid-shift but forecast not confident → today's OMR alone
  if (bill?.so_far_omr > 0) {
    return {
      kind: 'omr',
      primary: bill.so_far_omr,
      verdict: payload.plant_status_verdict,
    };
  }

  // 3. No production yet today → Plant Score is the hero (Phase 1 data)
  if (score?.value !== undefined) {
    return {
      kind: 'score',
      primary: `${score.value}/100`,
      verdict: payload.plant_status_verdict,
      subline: `Yesterday: ${score.previous_omr ?? '—'} OMR`,
    };
  }

  // 4. Cold start (no Phase 1 data either — extreme edge) → savings if any
  if (!sav?.calibrating && sav?.total_omr > 0) {
    return { kind: 'savings', primary: sav.total_omr, verdict: 'Hercules earned for you' };
  }

  // 5. Final fallback — show the date and "Standing by" verdict, never blank
  return { kind: 'standby', primary: dayName(now), verdict: 'Standing by' };
}
```

The function is total — there is no path that produces the word "Calibrating" as the hero. Calibration is acknowledged in the sub-list or as a small badge, never as the hero.

---

## 4. Creative moments — implementation

### 4.1 The Aging Verdict (PRIMARY moment)

The card visibly fills out as the day matures:

| Time | Hero Line | Money Line | Notes |
|---|---|---|---|
| 00:00–06:00 | Plant Score 92/100 | hidden | Yesterday's recap in subline |
| 06:00–10:00 | Plant Score 92/100 (production not yet meaningful) | "204 OMR today" appears once `so_far_omr > 50` | No ghost yet |
| 10:00–13:00 | "1,184 OMR today" promotes to hero | running total only | Forecast not yet confident |
| 13:00 onwards | "1,564 OMR today" | Ghost projection fades in: `→  ~3,100 by close` | Confidence threshold typically crossed mid-day |
| 18:00+ | "3,082 OMR today" | hidden (day mostly closed) | Status verdict updates to summary |
| Friday/Saturday | Plant Score from Phase 1 weekly avg | hidden | Weekend acknowledged in subline |

The user observing the card multiple times in a day sees a card that is *visibly working* — it's getting more confident, more material, more specific. **No two viewings are identical.**

### 4.2 Trust Gold Inset

The 1px gold inset highlight intensity is proportional to Trust Score:

```css
.hai-boardroom { box-shadow: var(--hai-shadow-deep), inset 0 1px 0 var(--hai-trust-glow); }
```

```typescript
function trustGlow(score: number | null): string {
  if (score === null)      return 'rgba(255, 255, 255, 0.18)';   // calibrating — default
  if (score >= 95)         return 'rgba(240, 181, 79, 0.30)';     // intense gold
  if (score >= 80)         return 'rgba(240, 181, 79, 0.18)';     // default gold
  if (score >= 70)         return 'rgba(240, 181, 79, 0.10)';     // muted gold
  return 'rgba(180, 180, 180, 0.10)';                              // silver — admin sees badge
}
```

Same component, no extra UI. The card *itself* shows you how much to believe it.

### 4.3 Gold Coin — the gilding moment

80×80 Three.js scene in the top-left slot. States:

| State | Trigger | Visual |
|---|---|---|
| Cold | First load, savings null OR `days_of_history < 30` | Matte-grey coin, static. Soft pulse on the date line. |
| Earning | First savings ledger entry recorded with confidence ≥ 50 | One-shot gilding animation: matte-grey → gold over 3s with subtle shimmer. After: permanent slow rotation (12s/revolution). |
| Active | Savings already > 0 | Gold coin, slow rotation. |
| Untrusted | `score < 70 AND user is admin` | Gold coin but rotation slows to half speed; small "trust below target" badge appears next to it. |
| Reduced motion | `prefers-reduced-motion: reduce` | Static gold coin (or matte-grey if cold). No animation ever. |

Implementation: `GoldCoin3D.tsx` lazy-loaded via `React.lazy` + Suspense; replaces a static SVG fallback once the chunk arrives. WebGL absent → static SVG remains. Three.js bundle deferred outside the critical path.

The first-saving gilding animation **fires once and is permanent**. It's the celebration moment and won't replay on subsequent loads.

---

## 5. The Segmented Stage — four chips

Below the boardroom card sits a single segmented control + one stage panel.

### 5.1 Chips

```
[ Attention (2) ] [ Machines (7) ] [ Time ] [ Audit ]
```

- Pills with count badges where relevant.
- Active chip: glass card with gold underline (3px, `--hai-money`).
- Inactive: ghost border, `--hai-text-secondary` text.
- Keyboard nav: ←/→ arrow keys.
- Default chip selection algorithm:

```typescript
function defaultChip(payload: RoiPayload): Chip {
  if (payload.anomalies.length > 0)            return 'Attention';
  if ((payload.levers ?? []).length > 0)       return 'Attention';
  if (payload.savings.calibrating)             return 'Time';   // Phase 1 has working data
  return 'Attention';                                            // default homepage
}
```

The page **never** lands on an empty stage. If Attention is empty, Time is selected — Phase 1's working dashboard.

### 5.2 Stage 1 — Attention (default)

Hosts:
- **Top-3 ROI Levers** (Phase C — Plan 5 §6.3). Already specified in `Top3LeversPanel`. Pulse on rank-1 only. When zero levers, shows "No levers ranked above 25 OMR/month — plant is well-tuned" empty state.
- **Watch list** (Phase B). The existing `WatchBand` component, repurposed.

Stage layout:
```
┌─ Top-3 Levers ──────────────────────────────────────────────────┐
│  L1 142 OMR/mo   L2 940 OMR/shift   L3 72 OMR/mo                │
└─────────────────────────────────────────────────────────────────┘
┌─ Watch ─────────────────────────────────────────────────────────┐
│  • <forecast>  • <anomaly>  • <forecast>                         │
└─────────────────────────────────────────────────────────────────┘
```

Empty state: "Nothing demanding your attention right now. Hercules is watching {N} machines and will surface anything unusual."

### 5.3 Stage 2 — Machines (replaces current asset bento)

**Compact one-row-per-asset table.** Replaces the 7 tall (~400px) asset cards entirely.

```
ASSET           STATUS  ENERGY USE   ELECTRICAL     SHIFT PACE     SETUP
─────────────── ─────── ──────────── ─────────────  ────────────── ────────
C32 Mill         ●      47.2 kWh/t   0.72 (target)  —              ✓
M30 Mill         ●      Learning…    0.68 (target)  —              ✓
M31 Mill         ●      Learning…    0.47 (target)  —              ✓
Mill B           ●      Learning…    —              On track 96%   ⚠ setup
Pasta 1          ●      Learning…    —              —              ⚠ setup
Pasta 4          ●      Learning…    —              —              ⚠ setup
Pasta E          ●      Learning…    —              —              ⚠ setup
```

Each row ~56px tall. 7 rows = ~392px total — less than ONE of the previous asset cards.

Click a row → drilldown drawer with PacingRing + SecCard + PfPenaltyCard + recent history chart. (The full-fat versions of those cards keep their use as drill content — they didn't deserve to live on the main page, but they're great in a drawer.)

Top of stage: "Setup status: 4 of 7 machines linked — finish setup →" with a link to AI Setup wizard.

### 5.4 Stage 3 — Time (Phase 1's home)

This is where the existing Phase 1 dashboard lives **untouched**:
- "Analyze Reports" button + filter chip
- Plant Score 92/100 breakdown
- Efficiency / Production / Energy / Energy Cost cards
- Time period tabs (Today / Yesterday / This Week / etc.)
- AI insights narrative
- MIL-B / Energy Report / Pasta / WPK1 drill cards

**No code change to Phase 1 components.** They just move from "page body" to "Time stage". This is the CLAUDE.md Rule #2 protection — Phase 1 keeps every working code path it currently has.

### 5.5 Stage 4 — Audit

Hosts:
- **Savings ledger entries** — the audit panel from Phase A. Shows per-entry: detected at, asset, OMR, confidence, evidence, "Mark actioned" / "Dispute" buttons.
- **Hercules accuracy stats** — small footer linking to `/hercules-ai/model-health` (admin only).

Empty state: "Hercules is calibrating. Confirmed savings will appear here once Hercules has 30 days of data."

---

## 6. File restructure — concrete

### 6.1 New files

```
Frontend/src/Pages/HerculesAI/
├── BoardroomCard.tsx                  ← THE hero card
├── SegmentedStage.tsx                 ← chips + stage container
├── stages/
│   ├── AttentionStage.tsx             ← Top-3 Levers + Watch
│   ├── MachinesStage.tsx              ← compact one-row-per-asset table
│   ├── TimeStage.tsx                  ← extracts existing Phase 1 surface
│   └── AuditStage.tsx                 ← savings ledger entries
└── components/
    ├── HeroVerdict.tsx                ← hero number selection (the algorithm in §3)
    ├── GoldCoin3D.tsx                 ← Three.js gilding coin (lazy)
    ├── GoldCoinStatic.tsx             ← SVG fallback (already shipping inside SavingsRibbon)
    └── AssetDrillDrawer.tsx           ← full-fat SecCard/PfPenaltyCard/PacingRing on row click
```

### 6.2 Files transformed

| File | Action | Reason |
|---|---|---|
| `RoiSurface.tsx` | DELETE | Replaced by BoardroomCard + SegmentedStage |
| `SavingsRibbon.tsx` | KEEP but unused on this page | Reusable elsewhere (digest emails) |
| `BillProjectionCard.tsx` | KEEP but unused on this page | Logic feeds HeroVerdict; component used in admin Model Health drilldowns |
| `WatchBand.tsx` | KEEP | Used inside AttentionStage |
| `SecCard.tsx`, `PfPenaltyCard.tsx`, `PacingRing.tsx` | KEEP | Used inside AssetDrillDrawer |
| `BriefingView.tsx` (Phase 1) | KEEP | Used inside TimeStage as-is |

### 6.3 `HerculesAISetup.jsx` change

Replace the "Insights" view (currently `step === 3`) body with:

```jsx
{step === 3 && (
  <div style={{ minHeight: '100vh', background: th.pageBg }}>
    <CompactHeader />                    {/* unchanged */}
    <BoardroomCard payload={payload} />
    <SegmentedStage payload={payload} />
  </div>
)}
```

`<SegmentedStage>` internally hosts the 4 stages. `<TimeStage>` is the only stage that's not new — it's the existing Phase 1 surface extracted into its own component.

---

## 7. Backend changes

### 7.1 `payload_builder.py` — add `plant_score` block

The boardroom card's hero algorithm needs Plant Score from Phase 1. Add a `plant_score` block to the `RoiPayload`:

```python
# Phase 1 plant-score component (already computed by ai_kpi_scorer.py — reuse)
try:
    from ai_kpi_scorer import score_overall
    plant_score = score_overall(get_recent_kpi_state())
except Exception:
    plant_score = None
```

`ai_kpi_scorer.py` is the existing Phase 1 module that produces `92/100` with sub-scores (Equipment / Flow Rates / Power Quality / Production). Wire its output into the payload — no new computation, just an aggregator.

### 7.2 No new endpoints

All Phase A+B endpoints stay. The boardroom card consumes `/api/hercules-ai/roi-payload` as before; it now contains the new `plant_score` block.

### 7.3 No new migrations

All Phase A+B tables stay. No new schema.

---

## 8. i18n — new keys

Boardroom Card:
- `herculesAI.boardroom.title` — "Plant Verdict"
- `herculesAI.boardroom.standingBy` — "Standing by"
- `herculesAI.boardroom.todayLabel` — "OMR today"
- `herculesAI.boardroom.byClose` — "by close"
- `herculesAI.boardroom.yesterdayWas` — "Yesterday: {value} OMR"
- `herculesAI.boardroom.linesOn` — "{on} of {total} lines on"
- `herculesAI.boardroom.daysLeft` — "Hercules learning · {days} days left"
- `herculesAI.boardroom.thingsWorthAttention` — "{n} things worth your attention"
- `herculesAI.boardroom.machinesWatched` — "{n} machines watched"
- `herculesAI.boardroom.trustBadge` — "Trust {score}/100"

Segmented control:
- `herculesAI.stage.attention` — "Attention"
- `herculesAI.stage.machines` — "Machines"
- `herculesAI.stage.time` — "Time"
- `herculesAI.stage.audit` — "Audit"

Stage empty states:
- `herculesAI.attention.empty` — "Nothing demanding your attention right now. Hercules is watching {n} machines and will surface anything unusual."
- `herculesAI.machines.setupStatus` — "Setup status: {linked} of {total} machines linked — finish setup →"
- `herculesAI.audit.calibrating` — "Hercules is calibrating. Confirmed savings will appear here once Hercules has 30 days of data."

All four locales (en, ar, hi, ur) updated together.

---

## 9. Anti-splash-screen — enforceable rules

Codified in code review checklist; violation gates the PR.

1. **Hero number is always a number** — never a word ("Calibrating" / "Loading" / "Standing by" goes in `verdict_text`, not in the primary slot).
2. **Card max-height: 320px.** Enforced via CSS, not just hope.
3. **Inline KPIs limit: 4 atoms** in line 3, separated by middle dots. Atoms drop gracefully on small screens; never wrap or stack.
4. **Gold reserved exclusively for OMR figures.** Plant Score, kWh/ton, t produced — none of these get gold colour. Lint rule on the design system tokens.
5. **5× display-to-body type ratio enforced** (display 80px ÷ body 14px = 5.7×).
6. **Default chip is never empty.** Algorithm in §5.1 ensures the page always shows real content.
7. **Sub-list maximum 3 bullets**, only one of which acknowledges calibrating state.
8. **Coin only spins when there's something to celebrate** (savings > 0). Calibrating coin is static — silence is correct here.
9. **Verdict sentence on Line 1 max 8 words.** "Running within targets" not "The plant is currently running within target parameters across all monitored lines".
10. **Bottom segmented control is always visible** without scrolling on a 1080p display when the boardroom card is at default height.

---

## 10. Acceptance test matrix

The page must pass every scenario before merge.

| # | Scenario | Required behaviour |
|---|---|---|
| T1 | Cold install, day 1, no production yet | Hero = Plant Score (Phase 1). Sub-list shows "Hercules learning · 30 days left". Coin matte-grey static. |
| T2 | Production day at 11:00, no confident forecast yet | Hero = today's OMR running total. No ghost projection. Status verdict from `plant_status_verdict`. |
| T3 | Production day at 14:30, forecast confidence ≥ 60% | Hero = today's OMR. Money line shows ghost projection with gold arrow, opacity 0.55. |
| T4 | Production day at 18:00, day mostly complete | Hero = today's OMR. Ghost hidden (close < 1 hour). |
| T5 | Friday morning (Oman weekend) | Hero = Plant Score (last weekday). Subline acknowledges weekend gracefully. |
| T6 | First savings ledger entry recorded mid-session | Coin plays one-shot gilding animation, then stays gold + spinning. |
| T7 | Trust score drops below 70, user is admin | Card border-inset desaturates to silver; trust badge red; small banner on Boardroom Card top strip. |
| T8 | Trust score drops below 70, user is plant operator | Card stays gold-tinted; no banner. (Smoke-detector rule.) |
| T9 | Stage = Attention, zero levers + zero anomalies | "Nothing demanding your attention right now…" empty state. Default chip flips to "Time" instead. |
| T10 | Stage = Machines, all 7 assets row-display | Each row ≤ 60px tall. Total stage ≤ 450px. Click row opens drilldown drawer. |
| T11 | Stage = Time | Phase 1 surface renders untouched — Plant Score, Efficiency, Production, Energy, Energy Cost cards, AI narrative, MIL-B/Pasta drills. |
| T12 | Stage = Audit, calibrating | Friendly empty state. No "0 OMR" pretending to be insight. |
| T13 | Reduced motion preference | Coin static (whatever colour state). Ghost projection appears instantly (no fade). Stage swap is instant. |
| T14 | RTL Arabic | Coin on visual leading edge (right). Verdict mirrors. Gold arrow flips direction. Segmented chips mirror order. |
| T15 | Mobile 375px width | Card collapses gracefully: KPIs stack with newlines, segmented control becomes scroll-snap. Card stays sticky. |
| T16 | Phase B forecast endpoint errors | Boardroom card still renders with Phase 1 data via Plant Score fallback. No "Couldn't load" scream. |
| T17 | Slow network — initial fetch > 1 s | Skeleton boardroom card with the right shape (border + grid skeleton); no spinner inside the card. Header strip + bottom segmented control render immediately. |
| T18 | 1080p display, page total height | ≤ 1.2 viewports without scrolling. (Card 320px max + segmented 56px + stage ~600px = 976px ≤ 1080.) |

---

## 11. Phase C placement

Phase C (Narrator + Settings + Onboarding) drops cleanly into Boardroom Mode without further redesign:

| Phase C piece | Boardroom placement |
|---|---|
| **Top-3 Levers panel** | Already inside Attention stage. Pulse on rank-1 only. |
| **CFO-mode prompt + JSON contract** | Backend-only. Output flows into `payload.plant_status_verdict` and the hero verdict text. The card displays it; the LLM never produces OMR figures. |
| **Settings page** (`/hercules-ai/settings`) | Cog icon in the Boardroom card top strip (right of Trust badge). Click → routes to settings. Not on the main surface. |
| **Onboarding modal** | Renders as a one-time overlay before first Boardroom Card appears. Walks through 6 highest-impact settings. Skip = use defaults; banner stays at top until "Confirmed defaults" clicked. |
| **Model Health page** (admin) | Footer link inside Audit stage. Admin only. |

No new page-level structural decisions for Phase C — it lands inside the existing chips.

---

## 12. Migration strategy — safe steps

The cutover is one PR but executed in small reversible commits.

1. **Extract TimeStage**: move the body of `HerculesAISetup.jsx` step-3 view (everything from "Analyze Reports" onwards) into `TimeStage.tsx` unchanged. Replace inline with `<TimeStage />`. Verify Phase 1 still works identically.
2. **Build BoardroomCard scaffold**: render the card above `<TimeStage />` with hardcoded mock data. Verify typography hierarchy passes the 5× ratio check.
3. **Wire HeroVerdict algorithm**: replace mock data with real `roi-payload`. Verify scenarios T1–T8 from §10.
4. **Add SegmentedStage**: introduce chips and the stage swap mechanism. `Time` chip points at the now-extracted `<TimeStage />`. Other chips render placeholder content.
5. **Build AttentionStage**: extract `Top3LeversPanel` (Phase C placeholder OK) + `WatchBand`. Run T9.
6. **Build MachinesStage**: row-display table; AssetDrillDrawer on click. Run T10.
7. **Build AuditStage**: ledger list with attribute/dispute. Run T12.
8. **Add GoldCoin3D** lazy-loaded; static SVG fallback. Run T6 + T13.
9. **Wire Trust glow**: bind `--hai-trust-glow` to score. Run T7 + T8.
10. **Delete `RoiSurface.tsx`** and the SavingsRibbon-on-page mounting. Verify scenario T11 (Phase 1 still untouched).
11. **i18n keys × 4 languages**, all in one commit.
12. **Run all 18 acceptance tests** before push to `Salalah_Mill_B`.

Each step is independently reversible. If step N introduces a regression, step N-1 still has a working page.

---

## 13. Known risks remaining

1. **Three.js bundle on a slow network**: lazy-load + IntersectionObserver helps, but cold first paint without WebGL might briefly show the static SVG before the gilding kicks in. Mitigation: SVG fallback is the matte-grey state visually; no jarring transition.
2. **`ai_kpi_scorer.py` (Phase 1) signature unknown**: the plan assumes `score_overall(state)` returns `{value, components}`. Need to verify this matches what's actually shipping; may need a thin adapter.
3. **Mobile RTL combination** (Arabic on a phone): card padding + sticky behaviour combined with mirroring is the most fragile combination. T14 + T15 must both pass; if either fails, the segmented control degrades to top-not-sticky on mobile RTL.
4. **The first-saving gilding animation firing prematurely** (e.g. on a small low-confidence ledger entry): mitigation already in §4.3 — only fires when `confidence ≥ 50` AND it's the first non-disputed entry. Fires once and is permanent.
5. **The verdict text source** (`plant_status_verdict`) needs to be plain language. Current `payload_builder.py` strings are: "Running smoothly", "Electrical efficiency below target", "Using more energy than usual" — already plain-language compliant per Phase A polish pass. No new work needed.

---

## 14. What this plan REMOVES from the current page

Concrete deletions on `Salalah_Mill_B` after this lands:

- `<SavingsRibbon>` mounting on `/hercules-ai` — moved into BoardroomCard absorption.
- The 3-up asset bento (7 cards × ~400px tall = ~2800px) — replaced by Machines stage row table (~390px).
- Standalone `<BillProjectionCard>` — its data feeds the boardroom hero, no separate card on the main surface.
- Standalone `<WatchBand>` — moved inside AttentionStage.
- The visual stack of "new ROI surface above the existing Phase 1 dashboard" — replaced by a single boardroom card with chip-driven stages.

What it keeps: every Phase 1 component, every Phase A+B backend endpoint, every Phase A+B i18n key. Phase C lands cleanly without further restructure.

---

## 15. Sign-off checklist before implementation begins

- [ ] Owner confirms Boardroom Mode picked over Tabs.
- [ ] Owner confirms the four chip names: Attention / Machines / Time / Audit.
- [ ] Owner confirms the coin gilds on first ledger entry (alternative: gild on first $1 saved by user-attribution; default = first auto-detected ≥ 50% confidence entry).
- [ ] Owner confirms hero number priority order in §3 (today's OMR > Plant Score > savings > date).
- [ ] Owner confirms no time-estimate column or duration field anywhere in this plan (already enforced).
- [ ] `ai_kpi_scorer.score_overall()` signature verified against the actual file before §7.1 wiring.

---

*End of plan.*
