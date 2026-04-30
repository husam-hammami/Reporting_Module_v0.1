# Plan 14 — Hercules AI Page Redesign (single-page, no tabs)

Date: 2026-04-30
Author: Senior Product Design Lead
Target branch: `Salalah_Mill_B`
Brief: `docs/plans/AI Features/13_Hercules_AI_Page_Essentials_30_04.md`
Replaces: Plan 6 (`06_Boardroom_Mode_Redesign_Plan_30_04.md`) page composition. Plan 6's content is preserved as a Time **drilldown drawer**, never as the main surface.
Design system: `design-system/hercules-roi-genius/MASTER.md` (locked tokens) + `pages/hercules-ai-roi.md` (page deltas, partially superseded by this plan — see §11).

---

## §1 — Design rationale

**Central design idea.** Replace the universal verdict card with a **money-led ROI bento**: one full-width gold OMR ribbon at the top (saved this month + cost today + projected today), then a 12-column bento that places the three first-class predictions (today's bill, tomorrow's yield outlook, next likely anomaly) on equal footing with the Top-3 levers and the Watch list. Plant score becomes a 56-px badge embedded inside an "intensity" tile (kWh/ton + OMR/ton + score), not a hero. Tabs disappear entirely. The four current "stages" (Attention, Machines, Time, Audit) collapse into a single bento where every essential is visible at once and Tier-2 detail surfaces in side drawers that overlay without leaving the page.

**What I considered and rejected.** *(a)* "Three-pane Now/Soon/Done" — rejected: it forces the operator persona (who only thinks in "now") to scan two panes they'll ignore, and it gives money no permanent home. *(b)* Plan 6's Boardroom card with chips kept but money-fixed — rejected: chips remain navigation, predictions still buried inside Attention. *(c)* Tabs-as-filters (filter the bento by persona) — rejected: filters add a state the screen has to defend against and the data fits one screen for all three personas. *(d)* Money-only one-glance with "more" button — rejected: predictions are the second-strongest reason this product exists; demoting them to a drilldown re-creates the original problem. The chosen design — "Money ribbon on top, predictions and actions on equal bento footing, drilldowns in drawers" — is the only structure that promotes the genuine essentials without trapping any persona on a wrong default tab.

**Why it serves all three personas.** The CFO's eye lands on the gold ribbon (top 14 % of page) and the lever stack (right column) — both readable from across a meeting room. The plant manager's eye lands on the predictions row (today's bill, tomorrow's yield, anomaly forecast) and the Watch list (bottom-left) — the "what needs my attention" answer is right there without a click. The operator's eye lands on the status pulse (top-left of bento, embedded inside the intensity tile) and the asset strip (bottom-right) — they don't engage with the gold money ribbon, but it doesn't hide. One screen, three reading orders, zero tabs.

---

## §2 — ASCII bento sketch (1440×900)

The page renders inside the existing 1400-px `max-width` container at 24-px lateral padding. Effective canvas: 1352 × ~836 (top app shell ~64 px). All sizes are CSS allocations; final pixels honor `--space-md` (16) gaps from `MASTER.md §4`.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  Hercules AI    [● Active]   Settings · Re-scan        Updated 2 min ago               │  64 px header
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│  ┌── ROI RIBBON ─────────────────────────────────────────────────────────────────────┐ │
│  │                                                                                   │ │
│  │   1,564 OMR              ·   294 OMR today  →  ~3,100 by close                    │ │  118 px
│  │   saved this month                                                                │ │
│  │                                                                                   │ │
│  │                                            Confidence: Reliable    Trust 87/100   │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                        │
│  ┌── INTENSITY ───────┐ ┌── TODAY'S BILL ──────────┐ ┌── TOP 3 ACTIONS ─────────────┐ │
│  │ STATUS  PLANT      │ │ Today's bill, by close   │ │ ① 940 OMR/shift              │ │
│  │  ●      92         │ │                          │ │   Off-peak load shift  · 1mo │ │
│  │ smooth  /100       │ │   ┌──────────────────┐   │ │ ──────────────────────────── │ │
│  │ ─────────────────  │ │   │  area chart with │   │ │ ② 142 OMR/mo                 │ │
│  │ 21.4 kWh/ton       │ │   │  forecast band   │   │ │   Capacitor on M30 · 18 mo   │ │
│  │ 0.107 OMR/ton  ◀── │ │   └──────────────────┘   │ │ ──────────────────────────── │ │
│  │ —2.1% vs last mo   │ │  Range 2,800 – 3,400 OMR │ │ ③ 72 OMR/mo                  │ │
│  └────────────────────┘ └──────────────────────────┘ │   Reduce idle on M31 · 9 mo  │ │  306 px
│   span 3                 span 5                      └──────────────────────────────┘ │
│                                                       span 4
│                                                                                        │
│  ┌── NEEDS ATTENTION ─────────────────┐ ┌── PREDICTIONS ─────────────────────────────┐ │
│  │ ●  Counter stuck on Mill B         │ │ ↗  Yield drifts down 3% on Pasta 1         │ │
│  │    Sensor freeze · 12 m            │ │    next 3 days · 84 OMR/day at risk        │ │
│  │    180 OMR/mo at risk          ▸   │ │ ──────────────────────────────────────── │ │
│  │ ───────────────────────────────── │ │ ↘  Power-factor likely to dip on M30       │ │
│  │ ●  Sudden electrical drop on M30   │ │    Tomorrow afternoon · 22 OMR/day risk    │ │
│  │    PF 0.84 → 0.71 · 1 h ago        │ │ ──────────────────────────────────────── │ │
│  │    410 OMR/mo at risk          ▸   │ │ ⏱  Energy bill trending +12% this week     │ │  244 px
│  └────────────────────────────────────┘ └────────────────────────────────────────────┘ │
│   span 6                                 span 6                                        │
│                                                                                        │
│  ┌── MACHINES (5) ────────────────────────────────────────────────────────────────┐ │
│  │ Asset      Status   Energy    Electrical   Pace        Setup    See history   │ │
│  │ M30 Mill    ●       46.8 t/h  0.71  ⚠      —          ✓                  ▸    │ │
│  │ M31 Mill    ●       47.1 t/h  0.66        On track    ✓                  ▸    │ │
│  │ Mill B      ●       Learning  —          On track 96% ⚠                 ▸    │ │
│  │ Pasta 1     ●       Learning  0.73        At risk 48% ⚠                 ▸    │ │  168 px
│  │ Pasta 4     ●       Learning  —           —          ✓                  ▸    │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
│   span 12                                                                            │
│                                                                                        │
│  Hercules learning · 28 days left          See full time analysis →                   │  40 px
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Vertical math (with `--space-lg` (24) gutters): header 64 + ribbon 118 + 24 + intensity/bill/levers row 306 + 24 + watch/predictions row 244 + 24 + machines 168 + 24 + footer 40 = **1,036 px** measured from page top to footer bottom. On 900-px viewports the footer 40-px strip and the bottom of the machines table sit just below the fold; the full bento above (ribbon + intensity-bill-levers + watch-predictions) totals **820 px** and is fully no-scroll. The footer + machines bottom is reachable in one short scroll — acceptable per brief §1 ("Below 1280 wide... secondary sections may stack"). On 1080-px viewports the entire bento is no-scroll.

Grid spec: 12 columns, `--space-md` (16) gap horizontally between cells, `--space-lg` (24) gap vertically between rows. Ribbon spans 12. Row 1 = 3+5+4. Row 2 = 6+6. Row 3 = 12.

---

## §3 — Region-by-region spec

### §3.1 ROI Ribbon

**Purpose.** Make the gold OMR savings figure the page's permanent visual anchor — readable at meeting-room distance — and bind today's running cost + projection + accuracy badge into the same horizontal band so a CFO has the full money picture in one fixation.

**Dimensions.** 1352 × 118 px. `padding: var(--space-lg) var(--space-xl)` (24/32). Rounded `24px` per Plan 6 §2.1 boardroom container.

**Data shown** (cite from `backend/ai_money/payload_builder.py`):
- Hero: `payload.money.savings_this_month_omr` (line 114; integer OMR).
- Today's running cost: `payload.money.cost_omr_today` (line 118).
- Today's projection + range: `payload.forecasts.daily_bill.projected_omr` and `.p10_omr / .p90_omr` (set by `ai_forecast.daily_bill.project()` line 78).
- Accuracy badge: `payload.trust.score` if non-null else `'calibrating'` (line 93).
- Calibration flag: `payload.savings.calibrating` (line 32 of `useRoiPayload.ts`); when true, hero degrades — see state matrix §6.

**Strings rendered** (English; all keys re-used or new):
| Slot | Key | Rendered example |
|---|---|---|
| Hero number | (raw, no key) | `1,564 OMR` (gold) |
| Hero caption | `herculesAI.ribbon.savedThisMonth` (NEW) | "saved this month" |
| Today running | `herculesAI.ribbon.todayRunning` (NEW) | "294 OMR today" (gold) |
| Today projected | `herculesAI.ribbon.byClose` (re-use 876) | "→ ~3,100 by close" (gold, opacity 0.55) |
| Confidence | `herculesAI.ribbon.confidenceReliable` (NEW) | "Confidence: Reliable" |
| Trust badge | `herculesAI.boardroom.trustBadge` (re-use 882) | "Trust 87/100" |

Rendered formats (frozen):
- Hero: `{toLocaleString} OMR` (NBSP between number and unit per Inter Tight rendering).
- Today running: `{x.toFixed(0)} OMR today` (no decimals — single-day operating cost is integer-rounded for screen).
- Projection: prefix `→ ~`, format with `toLocaleString`, suffix `by close`.
- Hidden until forecast confidence ≥ 60 %; crossfade 800 ms (Plan 6 §2.3 rule preserved).

**Color/typography tokens.**
- Container: `linear-gradient(135deg, rgba(202,138,4,0.06), rgba(202,138,4,0.01))` over `var(--hai-glass-1)` (MASTER §2). Border `var(--hai-border)`, border-radius 24, `inset 0 1px 0 var(--hai-highlight)`, shadow `var(--hai-shadow-rest)`. `backdrop-filter: blur(14px) saturate(160%)` (MASTER §6.1 universal).
- Hero: `font-family: 'Inter Tight'`, weight 300, `var(--hai-display)` (clamp 56 → 80 px), color `var(--hai-money)`, `letter-spacing: -0.02em`, `font-variant-numeric: tabular-nums lining-nums`.
- Hero caption: Inter Tight 500 16 px (`--hai-subtitle`), `var(--hai-text-muted)`, `text-transform: uppercase`, `letter-spacing: 0.06em`.
- Today running: Inter Tight 400 22 px, `var(--hai-money)`.
- Projection: Inter Tight 400 22 px, `var(--hai-money)` opacity 0.55.
- Confidence pill + Trust pill: 12 px, weight 600, `var(--hai-text-muted)` text on `var(--hai-glass-2)` chip with `var(--hai-border)` 1 px outline.

**Interactions.**
- Hover anywhere on the gold hero: tooltip `Confirmed savings ledger · {entries_count} entries` (data: `payload.savings.entries_count`).
- Click hero / "saved this month": opens **Savings Ledger Drawer** (§5.1).
- Hover today's projection: tooltip `Range: {p10}–{p90} OMR · Last same day {prev}` (data: `payload.forecasts.daily_bill.p10_omr / p90_omr / prev_same_day_omr`; reuses `herculesAI.bill.range` and `.lastSameDay`).
- Click "Confidence: Reliable": opens **Trust Drawer** (§5.5).
- Keyboard: hero is `<button>`; Enter/Space opens drawer. Tab order: hero → today running → confidence → trust. Trust pill is `<button aria-haspopup="dialog">`.

**States (this region only — see full matrix §6).**
- Calibrating: hero shows today's cost number instead of savings (gold), caption swaps to `herculesAI.ribbon.costToday` "spent today"; today-running collapses (single-fact ribbon).
- No-data: hero shows `--` in white (NOT gold — gold reserved for real OMR); caption "Awaiting first day". Trust pill replaced with `Hercules learning · 28 days left` chip.
- Error: hero shows last cached value with a tooltip "Updated 14:08 · couldn't refresh"; the chip area shows a `Try again` button (re-uses key `herculesAI.roi.tryAgain`).
- Alert (PF penalty > 50 OMR/month OR will-miss pace on any line): the trust pill is replaced with a red-tinted `2 things at risk →` button that scrolls focus to Predictions (§3.5).

---

### §3.2 Intensity tile (status + plant score + intensity)

**Purpose.** Fold the demoted plant-score badge, the status dot/verdict, and the engineer-shaped kWh/ton + the CFO-shaped OMR/ton into one tile. The status of the plant is then readable from the layout (dot color + score badge color), not from a giant labeled card — direct response to brief §3 anti-pattern #1.

**Dimensions.** Span 3 × 306 px (≈ 332 × 306).

**Data shown.**
- Status level: `payload.plant_status_level` ('ok' | 'warn' | 'crit'), drives dot color.
- Verdict text: `payload.plant_status_verdict` (e.g. "Running smoothly").
- Plant score: `payload.plant_score.value` (with `/100` suffix).
- Energy intensity: `payload.plant_score.efficiency.kwh_per_ton` (toFixed(1)).
- OMR/ton (derived in frontend): `payload.money.cost_omr_today / (payload.plant_score.efficiency.production_tons || 1)` rounded to 3 decimals. Single source of truth in a `useDerivedMoneyPerTon(payload)` hook.
- Trend vs previous period: `payload.plant_score.efficiency.kwh_change_pct` (drives ↑/↓ + sign).

**Strings rendered.**
| Slot | Key | Rendered example |
|---|---|---|
| Status header label | `herculesAI.intensity.statusLabel` (NEW) | "STATUS" |
| Score header label | `herculesAI.intensity.scoreLabel` (NEW) | "PLANT SCORE" |
| Verdict | `herculesAI.verdict.runningSmoothly` (re-use 826) | "Running smoothly" |
| kWh/ton | `herculesAI.roi.kwhPerTon` (re-use 802) | "kWh per ton" |
| OMR/ton | `herculesAI.intensity.omrPerTon` (NEW) | "OMR per ton" |
| Trend | `herculesAI.intensity.vsPrevious` (NEW) | "↓2.1 % vs last month" |

Top half of tile: `[●] 92 / 100` with the verdict text wrapping below in `--hai-text-secondary`. Bottom half: `21.4 kWh/ton · 0.107 OMR/ton · ↓2.1% vs last month` rendered as a vertical mini-stack. The OMR/ton row is highlighted (gold dot prefix `var(--hai-money)`) so the CFO eye finds it instantly per brief §4 anti-pattern #2.

**Color/typography tokens.**
- Card: standard `.hai-card` (MASTER §6.1).
- Status dot: 12 px circle, color = `--hai-good` (#22C55E) / `--hai-warn` (#FBBF24) / `--hai-crit` (#EF4444) per `plant_status_level`.
- Score: Inter Tight 300 56 px, color = white (`var(--hai-text)`) — never gold, per MASTER §9 rule 3.
- Score `/100`: Inter Tight 500 14 px, `var(--hai-text-muted)`, baseline-aligned to score.
- kWh/ton & OMR/ton numbers: Inter Tight 500 22 px, `var(--hai-text)`. The OMR/ton row uses `var(--hai-money)` for the gold dot prefix only (per MASTER §9 rule 3, gold attaches to OMR contexts, never bleeds onto numbers other than money).
- Trend ↓: `var(--hai-good)` if negative kWh change (lower energy is good); `var(--hai-crit)` if positive.
- Divider between halves: 1 px `var(--hai-border)` with 16 px vertical padding.

**Interactions.**
- Hover score: tooltip `payload.plant_score.breakdown` rendered as 4 rows (Equipment 88 · Flow 91 · Power Quality 82 · Production 95) — keys: `herculesAI.intensity.breakdownEquipment`, `.breakdownFlow`, `.breakdownPower`, `.breakdownProduction` (NEW).
- Click anywhere on tile: opens **Time Drawer** (§5.4) which hosts the full Phase 1 surface.
- Hover kWh/ton: tooltip "Energy used per ton produced — last 24 h".
- Hover OMR/ton: tooltip "Cost per ton produced — today".
- Keyboard: tile is `role="button"` with `aria-label="Plant score 92 of 100, running smoothly"`. Enter/Space opens Time Drawer.

**States.**
- Calibrating: score displays last computed value with `Learning` chip below; intensity numbers replaced with `Learning…` tokens; OMR/ton suppressed (no production data yet today).
- No-data: dot is grey `var(--hai-text-muted)`, score `--/100` (white), verdict "Standing by" (re-use 874), bottom half hidden entirely.
- Error: dot grey, verdict "Couldn't refresh" + tooltip showing last-known timestamp, score is last cached.
- Alert: dot is warn or crit color; the verdict text gets a 1-px left border in matching color to draw the eye.

---

### §3.3 Today's bill (forecast)

**Purpose.** Surface the prediction the brief explicitly elevates to first-class — today's projected energy bill — with its confidence band visible and its drilldown one click away. This is the "second screen for the CFO".

**Dimensions.** Span 5 × 306 px (≈ 564 × 306).

**Data shown.**
- `payload.forecasts.daily_bill.so_far_omr`, `.projected_omr`, `.p10_omr`, `.p90_omr`, `.prev_same_day_omr`, `.remaining_hours`.
- Hourly actual + forecast series for the chart: `payload.forecasts.daily_bill.series` (array of `{hour, actual, forecast, p10, p90}`). The chart type is "Line with Confidence Band" per MASTER §6.5 — already specified.

**Strings rendered.**
| Slot | Key | Rendered example |
|---|---|---|
| Title | `herculesAI.bill.title` (re-use 842) | "Today's energy bill" |
| Subtitle | `herculesAI.bill.byClose` (NEW) | "by close" |
| Range label | `herculesAI.bill.range` (re-use 845) | "Range: 2,800–3,400 OMR" |
| Last same day | `herculesAI.bill.lastSameDay` (re-use 846) | "Last same day: 2,930 OMR" |
| Remaining hours | `herculesAI.bill.remainingHours` (re-use 847) | "5 h remaining" |
| Forecast hidden | `herculesAI.bill.forecastHidden` (re-use 848) | "Forecast hidden — Hercules needs 12 more days of data" |

Top of card: title + subtitle on left, "5 h remaining" pill on right.
Center: 220-px tall area chart spanning full card width minus padding. Solid `var(--hai-future)` line for actual + dashed for forecast + filled band p10–p90 (MASTER §6.5 implementation, opacity 0.18 → 0.04 gradient). NO labeled confidence percentage.
Bottom: `Range: 2,800–3,400 OMR · Last same day: 2,930 OMR` in 12 px muted.

**Color/typography tokens.**
- Card: standard `.hai-card`.
- Title: Inter Tight 600 16 px (`--hai-subtitle`), `var(--hai-text)`.
- Subtitle: Inter Tight 400 12 px, `var(--hai-text-muted)`.
- Chart line/band: `var(--hai-future)` (#8B5CF6) — purple per MASTER §2 (forecast/sub-action token).
- Range / last-same-day: Inter Tight 500 12 px, `var(--hai-text-muted)`.
- "Remaining hours" pill: 11 px, weight 600, `var(--hai-text)` on `var(--hai-glass-2)`.

**Interactions.**
- Hover any point on the chart: tooltip showing `{hour}: {actual} OMR (range {p10}–{p90})`.
- Click anywhere on chart or card: opens **Bill Drilldown Drawer** (§5.2) with full-width 7-day bill projection + per-asset cost stacked-bar.
- Keyboard: card is focusable; Enter/Space opens drawer.

**States.**
- Calibrating (`payload.forecasts.daily_bill === null` or `daily_bill.forecast_hidden`): the chart area is replaced with the existing "Forecast hidden" empty (key `herculesAI.bill.forecastHidden`), only the actual line shown. No range string.
- No-data: card collapses to a "Awaiting first day" stack with a 32-px Sparkles icon and the calibrating sub-text. No chart axes.
- Error: chart area shows a single horizontal line with last cached value + retry button.
- Alert (band width / projected > 0.30): the "Confidence: Reliable" badge in the ribbon (§3.1) flips to "Confidence: Roughly right" and the band gets a 1-px dashed `var(--hai-warn)` outline. Card otherwise unchanged.

---

### §3.4 Top 3 actions (levers)

**Purpose.** Surface the highest-OMR opportunities Hercules has found, ranked, with payback months as the only honest second-axis. No fake confidence percentages.

**Dimensions.** Span 4 × 306 px (≈ 444 × 306). Three internal rows (~85 px each) + 12 px header.

**Data shown** (per row from `payload.levers[i]`):
- `levers[i].omr_per_year` OR `levers[i].omr_per_month` OR `levers[i].omr_per_shift` — pick whichever is highest-resolution available; cite explicitly via the suffix.
- `levers[i].headline` — sentence (e.g. "Off-peak load shift on Pasta 4").
- `levers[i].payback_months` — float; rendered as `Pays back in {n} months` per `herculesAI.attention.paysBackIn` (re-use 894).
- `levers[i].asset` — small chip on right for context.

**Strings rendered.**
| Slot | Key | Rendered example |
|---|---|---|
| Header | `herculesAI.levers.title` (NEW) | "Top 3 actions" |
| Money rate | (raw with i18n unit) | "940 OMR/shift" |
| Per-month | `herculesAI.levers.perMonth` (NEW) | "OMR per month" |
| Per-shift | `herculesAI.levers.perShift` (NEW) | "OMR per shift" |
| Per-year | `herculesAI.levers.perYear` (NEW) | "OMR per year" |
| Payback | `herculesAI.attention.paysBackIn` (re-use 894) | "Pays back in 1 month" |
| Empty | `herculesAI.levers.empty` (NEW) | "Plant is well-tuned. Nothing above 25 OMR/month right now." |

Each row: `① {money}` left, headline middle, asset chip right. Money figure is gold per MASTER §2. The rank glyph (①②③) sits in a 24-px circle, weight 600.

**Color/typography tokens.**
- Card: standard `.hai-card`.
- Header: Inter Tight 600 13 px, `var(--hai-text-muted)`, uppercase, `letter-spacing: 0.08em`.
- Rank circle: 24 × 24 `var(--hai-glass-2)` background, `var(--hai-border)` 1 px outline, weight 600 13 px `var(--hai-text)`.
- Money: Inter Tight 500 22 px, `var(--hai-money)` — same as today's running cost in ribbon, NOT the hero size.
- Headline: Inter Tight 500 13 px, `var(--hai-text)`, line-clamp 2.
- Payback: Inter Tight 400 11 px, `var(--hai-text-muted)`.
- Asset chip: 11 px weight 600 in `var(--hai-glass-2)`.

**Interactions.**
- Hover row: row background `var(--hai-glass-2)`, `--hai-dur-fast` transition.
- Click row: opens **Lever Drawer** (§5.3) with full evidence + chart + Implement / Schedule / Dismiss buttons.
- Rank-1 row only: subtle gold pulse on the money figure per MASTER §6.6 (`hai-pulse` 1.4 s) — one of the two permitted idle animations.
- Keyboard: each row is a `<button>`; Tab order top→bottom; Enter opens drawer.

**States.**
- Calibrating: header reads "Top 3 actions · Learning"; each row replaced with a single 60-px-tall placeholder showing a skeleton bar in `var(--hai-glass-2)`.
- No-data (zero qualifying levers): single full-height row with the empty key text; rank-1 pulse disabled.
- 1 or 2 levers: missing slots fill with a "well-tuned" honest empty (per MASTER §9 rule 7).
- Error: full-card error state with the key `herculesAI.roi.couldntLoad` and a Try Again button.
- Alert: if rank-1 lever has `omr_per_year > 5000`, the rank-1 money pulses gold per MASTER §6.6 (already always-on for rank-1 by design — alert state intensifies the pulse glow opacity from 0.22 to 0.30).

---

### §3.5 Predictions (forecasts row)

**Purpose.** Hold the second-tier forecasts (yield outlook, anomaly forecast, week trend) that the brief explicitly de-buries from the WatchBand. This is what answers the plant manager's "what's coming in the next 24-72 hours".

**Dimensions.** Span 6 × 244 px (≈ 668 × 244). Three rows ~70 px each.

**Data shown** (each row from `payload.forecasts.trends` and `payload.forecasts.shift_pace`):
- Trend type: 'yield_drift' | 'pf_dip' | 'energy_trend'.
- Asset: `trend.asset`.
- Headline (rendered by frontend from typed trend data — never raw model output).
- Time horizon: `trend.horizon_label` (e.g. "next 3 days", "tomorrow afternoon").
- OMR-at-risk: `trend.omr_at_risk` (per day or per week — labeled).

**Strings rendered.**
| Slot | Key | Rendered example |
|---|---|---|
| Header | `herculesAI.predictions.title` (NEW) | "Coming up" |
| Yield drift headline | `herculesAI.predictions.yieldDrift` (NEW) | "Yield drifts down 3 % on Pasta 1" |
| PF dip headline | `herculesAI.predictions.pfDip` (NEW) | "Power-factor likely to dip on M30" |
| Energy trend headline | `herculesAI.predictions.energyTrend` (NEW) | "Energy bill trending +12 % this week" |
| Horizon | (raw, derived) | "next 3 days" |
| Risk | `herculesAI.predictions.riskOmrPerDay` (NEW) | "84 OMR/day at risk" |
| Empty | `herculesAI.predictions.empty` (NEW) | "Nothing forecast in the next 3 days." |

Each row: arrow icon (↗ for trending up = bad if energy/cost, good if yield; ↘ for trending down) + headline + horizon (12 px muted) + risk pill on right.

**Color/typography tokens.**
- Card: standard `.hai-card`.
- Header: same as Top-3 header.
- Arrow icons: 18 px Lucide (`TrendingUp`, `TrendingDown`, `Clock`); color = `var(--hai-warn)` for warn, `var(--hai-crit)` for crit, `var(--hai-future)` for neutral forecasts.
- Headline: Inter Tight 500 14 px, `var(--hai-text)`.
- Horizon: Inter Tight 400 12 px, `var(--hai-text-muted)`.
- Risk pill: 12 px weight 600, `var(--hai-money)` text on `var(--hai-glass-2)` chip with `var(--hai-border)`. (The pill content is OMR — gold attaches to the figure per MASTER §9 rule 3, NOT to the chip background.)

**Interactions.**
- Hover row: same elevation as Top-3 rows.
- Click row: opens the appropriate drilldown — `yield_drift` → **Yield Drawer** (§5.6), `pf_dip` → **Asset Drawer** (§5.7) for that asset with the PF tab pre-selected, `energy_trend` → **Bill Drawer** (§5.2) with 7-day series.
- Keyboard: Tab order top→bottom; Enter opens drawer.

**States.**
- Calibrating: card replaced with a single "Hercules is still learning your patterns. Forecasts will appear within 14 days." block; arrow icon is a static `Sparkles`.
- No-data: same as calibrating.
- Error: row-level error with retry icon; remaining rows render normally.
- Alert: if any row is `severity = 'crit'`, that row gets a 2-px left border in `var(--hai-crit)` (only border, no background fill — keeps glass register clean).

---

### §3.6 Needs attention (anomalies)

**Purpose.** Surface real, current anomalies (filtered to severity ≥ 'warn', not suppressed) — the "fire is happening now" answer. Distinct from §3.5 which is "fire might happen soon".

**Dimensions.** Span 6 × 244 px (≈ 668 × 244). Up to 3 rows visible; the rest collapse into "+N more →" footer that opens **Watch Drawer** (§5.8).

**Data shown** (each row from `payload.anomalies[i]`):
- `anomalies[i].severity` (warn | crit) — drives dot color.
- `anomalies[i].headline` — already rendered by `_render_anomaly` (the existing keys 858–863).
- `anomalies[i].asset` — small label.
- `anomalies[i].omr_at_risk` — risk pill (re-use `herculesAI.watch.atRisk`, 856).
- `anomalies[i].minutes_ago` — relative time.

**Strings rendered.**
| Slot | Key | Rendered example |
|---|---|---|
| Header | `herculesAI.attention.titleNew` (NEW) | "Needs attention" |
| Empty | `herculesAI.watch.nothing` (re-use 852) | "Nothing unusual right now." |
| More | `herculesAI.watch.moreItems` (re-use 853) | "+2 more →" |
| Risk pill | `herculesAI.watch.atRisk` (re-use 856) | "180 OMR/month at risk" |

Each row: severity dot (8 px) + headline (line-clamp 1) + asset (muted) + risk pill on right + `▸` chevron.

**Color/typography tokens.**
- Same shape as Predictions row.
- Severity dot: `var(--hai-warn)` or `var(--hai-crit)`. NEVER green (we don't render "ok" anomalies — they don't exist).
- Headline: Inter Tight 500 14 px.

**Interactions.**
- Click row: opens **Anomaly Drawer** (§5.9) with full evidence + last-N-min mini chart + Useful / Not useful / Suppress 24 h actions.
- Hover row: subtle row tint.
- Keyboard: Tab + Enter to open.

**States.**
- Calibrating: empty state shown with "Hercules is calibrating. Anomaly detection will be active in {N} days" (existing 906 / 893 messaging).
- No-data: empty state "Nothing unusual right now."
- Error: "Couldn't load watch list — try again".
- Alert: card title gets a small `var(--hai-crit)` count badge `2` next to the header when any row is `severity='crit'`.

---

### §3.7 Machines strip

**Purpose.** Filter the inflated `per_asset` count to real assets only and present them as a scannable one-row-per-asset table. Click → drawer with full per-asset detail. Replaces the two unhelpful Plan 6 elements (asset bento + "9 machines watched" inflated count).

**Dimensions.** Span 12 × 168 px (≈ 1352 × 168). Header row 32 px + up to 5 data rows × ~28 px each (compact) or up to 4 data rows × ~34 px (default). On 1080-px viewports, 5 rows fit; on 1440-px viewports, 5 rows fit.

**Data shown** (filtered `payload.per_asset`):
- Filter rule (frontend): drop rows where
  1. `asset.startsWith('ttt')` (test garbage), or
  2. `asset === 'Mil-A'` AND `tracked_tags === 0` AND `!has_energy_meter && !has_production_counter` (line_name-only fallback with no real instruments), or
  3. `tracked_tags === 0` (no tags at all) — needs `tracked_tags` exposed in the per-asset block; if not present yet, deduce from `has_energy_meter + has_production_counter + sec_available` all being false.
- Columns: Asset · Status · Energy use (kWh/h) · Electrical eff (PF) · Pace · Setup · `▸`.
- Status: dot color from current asset alarm state (derive from `payload.anomalies` filtering on `asset`).
- Energy use: `payload.per_asset[i].sec.energy_kwh_per_h` if present else `Learning…`.
- Electrical eff: `payload.per_asset[i].pf.pf_avg` toFixed(2). Inline `⚠` badge if below target (`pf_below_target = pf_avg < pf.target`).
- Pace: `payload.forecasts.shift_pace[asset].label` ("On track 96 %", "At risk 48 %", "Will miss") with status color.
- Setup: ✓ if `tracked_tags > 0 && (has_energy_meter || has_production_counter)`; ⚠ otherwise with link.

**Strings rendered.**
| Slot | Key | Rendered example |
|---|---|---|
| Col headers | `herculesAI.machines.colAsset` etc. (re-use 897-902) | — |
| Setup status | `herculesAI.machines.setupStatus` (re-use 896) | "Setup status: 4 of 5 machines linked" |
| Empty | `herculesAI.machines.empty` (re-use 904) | — |
| Real-asset count | `herculesAI.machines.assetCount` (NEW) | "Machines (5)" |
| See history | `herculesAI.machines.seeHistory` (NEW) | "See history" |

**Color/typography tokens.**
- Table on standard `.hai-card`.
- Header row: 11 px uppercase `--hai-text-muted`, weight 600.
- Body rows: Inter Tight 500 13 px `var(--hai-text)`.
- Numeric cells: tabular-nums.
- Row hover: background `var(--hai-glass-2)`.
- Setup ⚠: `var(--hai-warn)`; Setup ✓: `var(--hai-good)`; status dot: per anomaly severity matched to asset.
- Action chevron: 12 px `var(--hai-text-muted)`, becomes `var(--hai-future)` on hover.

**Interactions.**
- Click row: opens **Asset Drawer** (§5.7) with full SecCard + PfPenaltyCard + PacingRing + recent history chart.
- Hover row: row tint.
- Keyboard: each row is `<tr role="button" tabindex=0>`; Enter opens drawer; ↑/↓ arrows navigate rows.

**States.**
- Calibrating: rows still render with `Learning…` tokens in numeric cells; setup column accurate.
- No-data (zero real assets after filter): single full-row empty using `herculesAI.machines.empty`. Show a "Add an asset" CTA button.
- Error: rows render with last-cached values; tooltip on each row "Couldn't refresh".
- Alert: row with `severity='crit'` gets a 2-px left border in `var(--hai-crit)`.

---

### §3.8 Footer strip (calibration + Time link)

**Purpose.** The page's only acknowledgement of calibration state, plus the entry point to the full Time analysis (Phase 1's surface preserved as a drawer, not a tab).

**Dimensions.** Span 12 × 40 px.

**Data shown.**
- `payload.savings.calibrating` & `payload.savings.days_of_history` → `Hercules learning · {30 - days} days left` if calibrating; else `Updated {N} min ago` + provider info.
- "See full time analysis" button always visible.

**Strings rendered.**
| Slot | Key | Rendered example |
|---|---|---|
| Calibration | `herculesAI.boardroom.daysLeft` (re-use 879) | "Hercules learning · 28 days left" |
| Updated | `herculesAI.footer.updated` (NEW) | "Updated 2 min ago" |
| Time link | `herculesAI.footer.fullTimeAnalysis` (NEW) | "See full time analysis →" |

**Color/typography tokens.**
- 12 px Inter Tight 400, `var(--hai-text-muted)`.
- Time link: `var(--hai-future)` (#8B5CF6) on hover, otherwise `var(--hai-text-muted)`.

**Interactions.** Click "See full time analysis →" opens **Time Drawer** (§5.4).

**States.** Single line, never empty.

---

## §4 — Hierarchy ranking per persona

Reading order is what each persona's eye lands on first/second/third on initial paint. All three see the same screen.

### CFO on a phone, mid-meeting

| Rank | Region | Why |
|---|---|---|
| 1 | ROI Ribbon (§3.1) — gold "1,564 OMR saved this month" | Largest figure, top-left, only gold on screen, premium. |
| 2 | ROI Ribbon — today's projection "→ ~3,100 by close" | Same band, same color, second-largest gold figure. |
| 3 | Top 3 Actions (§3.4) — "940 OMR/shift, off-peak load shift" | Highest-OMR opportunity, ranked, gold figure on the right. |

### Plant manager before morning rounds

| Rank | Region | Why |
|---|---|---|
| 1 | Needs Attention (§3.6) — anomaly count + headlines | Bottom-left, severity dots draw the eye after the gold is registered. |
| 2 | Predictions (§3.5) — yield drift, PF dip headlines | Adjacent, same row — natural pan from anomalies to forecasts. |
| 3 | Top 3 Actions (§3.4) — first lever | Dictates the day's single biggest fix. |

### Operator during a shift

| Rank | Region | Why |
|---|---|---|
| 1 | Intensity tile (§3.2) — status dot + verdict | Top-left of bento, dot is the 5-second test. |
| 2 | Machines strip (§3.7) — their line's row | Operators look for their own asset; bottom strip is a familiar "table of trucks". |
| 3 | Predictions (§3.5) — anomaly forecast on their line | Next-shift anticipation; arrow icons telegraph direction. |

The CFO never has to look below the fold. The plant manager has the answer above the fold (bottom row of bento is at ~750 px, fits 900-px viewports). The operator scans top-left, then bottom strip — both visible without scroll.

---

## §5 — Drilldown surfaces (modals/drawers)

**General rule.** All drilldowns are right-side **drawers** (`width: 480 px` on desktop, full-screen on mobile). Drawers slide in over the bento, leaving the bento dimmed at 40 % opacity behind. The bento stays visible — the user always feels anchored. Esc closes; clicking the dimmed bento closes; the drawer's own close button closes. Z-index 30 (per MASTER §4 scale). Two simultaneous drawers are forbidden.

**Modals are reserved** for confirmations only — Implement-lever, Dispute-savings — because those are commit actions. Z-index 40.

### §5.1 Savings Ledger Drawer

**Trigger.** Click ROI Ribbon hero or the "saved this month" caption.

**Surface.** Right drawer 480 px.

**Content.**
- Header: `Saved this month · 1,564 OMR`.
- Filter chips: All · Confirmed · Disputed · Pending.
- List of `payload.savings` ledger entries (existing endpoint `/api/hercules-ai/savings`):
  - Date, asset, OMR, confidence label (Reliable / Roughly right / Direction only / Learning — already keys 819-822), evidence chip, action buttons (Mark as done / This isn't right — keys 824-825).
- Footer link: "Open full ledger →" navigates to `/hercules-ai/audit` (kept for admin deep-linking).

ASCII sketch:
```
┌── Saved this month ───────────────── ✕ ┐
│  1,564 OMR                              │
│  [All] [Confirmed] [Disputed] [Pending] │
├──────────────────────────────────────── │
│  Wed 30 Apr  M30  +142 OMR  Reliable   │
│  PF capacitor: 0.71 → 0.84             │
│  [Mark as done] [This isn't right]     │
├──────────────────────────────────────── │
│  Tue 29 Apr  Pasta 1  +88 OMR  …       │
└──────────────────────────────────────── ┘
```

**Dismissal.** Esc / click-outside / ✕.

### §5.2 Bill Drilldown Drawer

**Trigger.** Click Today's Bill chart, click "Energy bill trending +12 %" prediction row, click `→ ~3,100 by close` projection.

**Surface.** Right drawer 480 px.

**Content.**
- Header: `Today's bill projection · ~3,100 OMR by close`.
- 7-day rolling chart (Line + Confidence Band — MASTER §6.5).
- Per-asset cost stacked bar (today only).
- Range, last-same-day, peak-hour breakdown.
- "Confidence: Reliable · 87 % within ±10 %" (the only place where the trust-against-bill detail surfaces; keeps it out of the main page).

**Dismissal.** Esc.

### §5.3 Lever Drawer

**Trigger.** Click any row in Top 3 Actions.

**Surface.** Right drawer 480 px.

**Content.**
- Header: `① 940 OMR / shift · Off-peak load shift on Pasta 4`.
- Evidence list (`levers[i].evidence` — typed array):
  - "Last 30 days, average 14:00–18:00 cost per ton was 0.18 OMR vs 0.07 OMR off-peak."
  - "Pasta 4 has 3.2 t/h of shiftable load."
  - Mini chart: 30-day cost-by-hour heatmap.
- "Pays back in 1 month · 120 OMR/year saving baseline."
- Action buttons:
  - **Implement** → opens confirmation modal (§5.10).
  - **Schedule** → opens calendar picker.
  - **Dismiss** → 30-day suppression.

**Dismissal.** Esc. Modal confirmation steps over the drawer.

### §5.4 Time Drawer (Phase 1 surface preserved)

**Trigger.** Click Intensity tile (§3.2) or footer "See full time analysis →".

**Surface.** Right drawer **640 px** wide (wider than standard because Phase 1 dashboard has chart density).

**Content.** Existing Phase 1 surface from `BriefingView.jsx`, untouched:
- Time period tabs (Today / Yesterday / This Week / Last Week / This Month / Shift / Custom).
- "Analyze Reports" button + report filter chip.
- KPI cards row (Plant Score / Efficiency / Production / Energy / Energy Cost).
- AI insights narrative card.
- Equipment donut + production / flow charts.
- Per-report cards.
- Detailed comparison table (collapsed).

**Why a drawer not a page.** Two reasons. (a) The brief mandates a no-scroll single page — Phase 1 was a multi-screen scrolling dashboard, which made it unsuitable as the page itself. (b) Phase 1 is essential when the user wants to *analyze* — but most viewings are *monitoring*. Putting it behind a drawer means the page stays calm when not analyzing, but the analytical depth is one click away.

**Dismissal.** Esc. The drawer can be expanded to full-screen via a ⤢ button in its header for users who want to drill deep into time analysis.

### §5.5 Trust Drawer

**Trigger.** Click "Confidence: Reliable" pill or "Trust 87/100" pill in ribbon.

**Surface.** Right drawer 480 px.

**Content.**
- Header: `Hercules accuracy · 87 / 100`.
- Component breakdown (from `payload.trust.components`):
  - Forecast accuracy band 78 (last 14 days, ±10 %).
  - Anomaly precision 92 (last 30 days, useful/total).
  - Savings ledger 84 (confirmed/disputed).
- Each component shows a 32-px sparkline of its trend.
- Footer: "Open Model Health →" (admin only).

**Dismissal.** Esc.

### §5.6 Yield Drawer

**Trigger.** Click "Yield drifts down 3 %" prediction row.

**Surface.** Right drawer 480 px.

**Content.**
- Header: `Yield drift on Pasta 1 · −3 % expected`.
- 21-day yield trend chart (asset_yield_hourly last 7d vs baseline 14d) — Line with Confidence Band, MASTER §6.5.
- Suspect contributors list (raw materials, machine state).
- "84 OMR/day at risk if not corrected by Tue."

**Dismissal.** Esc.

### §5.7 Asset Drawer

**Trigger.** Click any row in Machines strip (§3.7) or click "Power-factor likely to dip on M30" prediction.

**Surface.** Right drawer 480 px.

**Content.**
- Header: `M30 Mill · Running smoothly`.
- Tabs: Energy · Electrical · Pace · Setup. (Tabs *inside* a drawer are acceptable — they're filters of one asset's detail, not navigation between essentials.)
- Tab "Energy": `SecCard` (existing component) + 24-h kWh/ton chart.
- Tab "Electrical": `PfPenaltyCard` + PF trend chart.
- Tab "Pace": `PacingRing` + shift ledger.
- Tab "Setup": tracked tags + meter status + "Open in Setup wizard →".

**Dismissal.** Esc.

### §5.8 Watch Drawer

**Trigger.** "+N more →" footer of Needs Attention (§3.6).

**Surface.** Right drawer 480 px.

**Content.** Same row format as the inline anomalies, full list (no truncation), with filter chips (Severity · Asset · Last 24 h / 7 d).

**Dismissal.** Esc.

### §5.9 Anomaly Drawer

**Trigger.** Click any row in Needs Attention.

**Surface.** Right drawer 480 px.

**Content.**
- Header: `Counter stuck on Mill B · 12 m ago`.
- Evidence (from `anomalies[i].evidence`).
- Last-N-min mini chart of the offending tag.
- Actions: Useful · Not useful · Suppress 24 h (existing keys 864-866).

**Dismissal.** Esc.

### §5.10 Implement Lever Confirmation Modal

**Trigger.** Click "Implement" button inside Lever Drawer.

**Surface.** Centered modal 420 × 240 px. Z-index 40.

**Content.** "Mark this lever as implemented? Hercules will start tracking the savings tomorrow." [Cancel] [Implement].

**Dismissal.** Cancel / Implement / Esc.

---

## §6 — State coverage matrix

Rows = regions (§3). Columns = states. Cell = what the user sees. "—" means no special state for that combination.

| Region | Calibrating (first 30 days) | No data | Error | Normal | Alert |
|---|---|---|---|---|---|
| §3.1 ROI Ribbon | Hero shows today's cost (gold), caption "spent today"; learning chip in lieu of trust | Hero `--`, caption "Awaiting first day", trust suppressed | Hero last cached, "Try again" chip | Hero savings + today + projection, trust pill | Trust pill replaced with red-tint "2 things at risk →" jump button |
| §3.2 Intensity tile | Score = last computed; intensity numbers "Learning…"; OMR/ton suppressed | Dot grey, score `--/100`, verdict "Standing by", bottom hidden | Dot grey, verdict "Couldn't refresh", score last cached | Status dot + score + verdict + intensity stack | Dot warn/crit; verdict gets 1-px colored left border |
| §3.3 Today's bill | Forecast hidden, only actual line + "Forecast hidden — needs N more days" | "Awaiting first day" with Sparkles icon, no chart axes | Single horizontal line with last cached + retry | Full chart with line + dashed forecast + filled p10–p90 band | Band gets 1-px dashed warn outline if confidence drops |
| §3.4 Top 3 actions | Header "Top 3 actions · Learning"; rows are 60-px skeleton bars | Single full-card "Plant is well-tuned. Nothing above 25 OMR/month." | Card-level error with retry | 3 rows ranked by OMR; rank-1 pulses gold | Rank-1 pulse glow opacity intensifies to 0.30 if `omr_per_year > 5,000` |
| §3.5 Predictions | Single-card "Hercules still learning patterns. Forecasts active in 14 days." | Same as calibrating | Row-level error with retry | Up to 3 rows of forecasts with arrow + headline + horizon + risk pill | Crit row gets 2-px left border in crit color |
| §3.6 Needs attention | Empty state "Hercules calibrating. Anomaly detection active in N days" | "Nothing unusual right now." | "Couldn't load watch list — try again" | Up to 3 anomaly rows + +N more footer | Header gets `2` count badge in crit color |
| §3.7 Machines strip | Rows render with Learning… tokens; setup column accurate | Single full-row empty + "Add an asset" CTA | Rows render last cached + tooltip "Couldn't refresh" | Full table with status dots + numeric cells | Crit asset row gets 2-px crit left border |
| §3.8 Footer | "Hercules learning · 28 days left" | "No data yet" + provider info | "Couldn't refresh — last update {time}" | "Updated 2 min ago · Cloud — Sonnet" | — |

Every cell is designed; no region degrades into a 500-error scream or a generic spinner-everywhere blank.

**Calibration global feel.** During the 30-day learning window the page must feel ALIVE and learning, not "data not ready". The cues:
1. Ribbon hero is real (today's cost is real even on day 1).
2. Intensity tile renders the moment any tag has data.
3. Top-3 levers shows skeleton bars — visibly *populating*.
4. Predictions explicitly says "Forecasts active in N days" — countdown.
5. The footer learning-chip is the only place that's blunt about it.

The cumulative impression: 4 of 7 regions have real data on day 1. By day 14, 6 of 7. By day 30, all 7. The page literally fills out.

---

## §7 — Motion language

**Mandatory animations (drive the page's feel).**
1. Ribbon hero count-up tween — fires on value change ≥ 1 OMR. Uses `useCountUp` (already shipping). Duration `--hai-dur-tween` (1200 ms), curve `--hai-ease-out`.
2. Top-3 rank-1 lever gold pulse — `hai-pulse` 1.4 s infinite, glow 0 → 12 px → 0. Per MASTER §6.6 — already specified, kept.
3. Bill projection ghost crossfade — `→ ~3,100 by close` text fades in over 800 ms when forecast crosses confidence threshold. Uses `--hai-dur-tween`.

**At idle, only #2 (rank-1 pulse) is moving** — well within the MASTER §9 rule 10 budget of 2.

**Optional / on-demand animations.**
- Card hover lift: `translateY(-2px)` + shadow swap, duration `--hai-dur-fast` (180 ms), curve `--hai-ease-out`. MASTER §6.7 already specified.
- Drawer enter: `translateX(100%) → 0`, duration `--hai-dur-base` (420 ms), curve `--hai-ease-out`.
- Drawer exit: reverse, duration `--hai-dur-fast` (180 ms), curve `--hai-ease-in`.
- Modal enter: `scale(0.96)` + opacity 0 → 1, duration `--hai-dur-base`.
- Bento entrance on first paint: stagger of 60 ms across the 7 regions, each `translateY(8px) → 0` + opacity 0 → 1, `--hai-dur-base`.

**Prohibited.**
- No idle ribbon shimmer.
- No looping loaders inside cards (use skeleton bars instead).
- No status-dot pulse (the dot is colored — that's enough).
- No counter ticking on machines table (rows update via parent re-render only).

**Reduced motion.** `@media (prefers-reduced-motion: reduce)`:
- Count-up degrades to instant set.
- Pulse turns off entirely.
- Drawer enter is instant fade (no slide).
- Modal enter is instant.
- Bento entrance is instant.

Per MASTER §5 — non-negotiable.

---

## §8 — Mobile collapse rules (< 1280 wide)

The bento collapses into a vertical stack. Stack order chosen to keep the **highest-value-per-viewport** above the fold for each persona on a 375-px or 768-px screen.

**Stack order top-to-bottom.**
1. **ROI Ribbon (§3.1)** — full width. Hero scales via `clamp` to 56 px on 375-px screens. Today's running cost stacks below the hero.
2. **Intensity tile (§3.2)** + **Today's Bill (§3.3)** — side-by-side at 768 px+ (50/50), stacked at 375 px (intensity above bill).
3. **Top 3 Actions (§3.4)** — full width. Three rows as before.
4. **Needs Attention (§3.6)** — full width. Demoted below levers because action > observation.
5. **Predictions (§3.5)** — full width.
6. **Machines strip (§3.7)** — becomes a vertical accordion: each asset is a 60-px row that taps to expand into the AssetDrawer content inline (instead of a side drawer; mobile drawers cover the whole screen, defeating the purpose).
7. **Footer (§3.8)** — full width.

**No-scroll guarantee.** On 375 × 812 (iPhone 13 mini) the ribbon + intensity tile (the CFO + operator core) fits in the first viewport. Plant manager scrolls one section to reach predictions/anomalies. Acceptable per brief §1.

**On tablet (768–1279 px).** Bento collapses to **2 columns**:
- Row 1: Ribbon (span 2).
- Row 2: Intensity (span 1) + Bill (span 1).
- Row 3: Top 3 (span 1) + Predictions (span 1).
- Row 4: Needs Attention (span 1) + Machines (span 1).
- Row 5: Footer (span 2).

The 2-column collapse keeps the predictions row paired with the Top 3 column, preserving the plant-manager reading order.

---

## §9 — i18n key list

Every NEW key. Each gets a translator note. RTL implications flagged where relevant (Arabic + Urdu).

| Key | English | Translator note |
|---|---|---|
| `herculesAI.ribbon.savedThisMonth` | "saved this month" | All-caps in render — translators provide lowercase, page CSS uppercases. RTL: Arabic auto-mirrors. ≤ 20 chars. |
| `herculesAI.ribbon.todayRunning` | "{value} OMR today" | `{value}` is a `toLocaleString` integer. Keep the unit "OMR" — it is brand-locked. RTL: number-after-OMR ordering handled by browser bidi. ≤ 20 chars. |
| `herculesAI.ribbon.byClose` (alias for re-use) | "by close" | "By end of business day". Keep terse. ≤ 12 chars. |
| `herculesAI.ribbon.confidenceReliable` | "Confidence: Reliable" | "Reliable" is one of the four accuracy levels (keys 819-822). Translators reuse the same word. ≤ 24 chars. |
| `herculesAI.ribbon.costToday` | "spent today" | Calibrating-state caption. Lowercase render. ≤ 16 chars. |
| `herculesAI.intensity.statusLabel` | "STATUS" | Already uppercase by render. ≤ 12 chars. |
| `herculesAI.intensity.scoreLabel` | "PLANT SCORE" | Already uppercase by render. ≤ 16 chars. |
| `herculesAI.intensity.omrPerTon` | "OMR per ton" | "OMR/ton" is the typographic compaction; the i18n key spells it out for screen readers. Plural forms not needed (per ton is invariant). ≤ 16 chars. |
| `herculesAI.intensity.vsPrevious` | "{change}{pct}% vs last month" | `{change}` is `↓` or `↑`. Symbols are direction-only — Arabic preserves arrow direction visually. ≤ 28 chars. |
| `herculesAI.intensity.breakdownEquipment` | "Equipment {score}" | Tooltip row. ≤ 18 chars. |
| `herculesAI.intensity.breakdownFlow` | "Flow {score}" | ≤ 14 chars. |
| `herculesAI.intensity.breakdownPower` | "Power Quality {score}" | ≤ 24 chars. |
| `herculesAI.intensity.breakdownProduction` | "Production {score}" | ≤ 20 chars. |
| `herculesAI.bill.byClose` | "by close" | Subtitle for bill card. ≤ 12 chars. |
| `herculesAI.levers.title` | "Top 3 actions" | Header. ≤ 18 chars. |
| `herculesAI.levers.perMonth` | "OMR per month" | Suffix. ≤ 16 chars. |
| `herculesAI.levers.perShift` | "OMR per shift" | ≤ 16 chars. |
| `herculesAI.levers.perYear` | "OMR per year" | ≤ 14 chars. |
| `herculesAI.levers.empty` | "Plant is well-tuned. Nothing above 25 OMR/month right now." | Friendly, never alarmist. ≤ 80 chars. |
| `herculesAI.predictions.title` | "Coming up" | Header. ≤ 12 chars. |
| `herculesAI.predictions.yieldDrift` | "Yield drifts {direction}{pct}% on {asset}" | `{direction}` = `down` / `up`. ≤ 56 chars. |
| `herculesAI.predictions.pfDip` | "Power-factor likely to dip on {asset}" | "Power-factor" is a customer-facing term confirmed in existing keys. ≤ 56 chars. |
| `herculesAI.predictions.energyTrend` | "Energy bill trending {sign}{pct}% this week" | `{sign}` = `+` / `−`. ≤ 56 chars. |
| `herculesAI.predictions.riskOmrPerDay` | "{value} OMR/day at risk" | ≤ 26 chars. |
| `herculesAI.predictions.empty` | "Nothing forecast in the next 3 days." | Friendly. ≤ 56 chars. |
| `herculesAI.attention.titleNew` | "Needs attention" | Header. New key — old `herculesAI.watch.title` (851) is reserved for the drawer. ≤ 18 chars. |
| `herculesAI.machines.assetCount` | "Machines ({n})" | Header pill. ≤ 16 chars. |
| `herculesAI.machines.seeHistory` | "See history" | Link inside machines table. ≤ 18 chars. |
| `herculesAI.footer.updated` | "Updated {n} min ago" | Relative time. ≤ 24 chars. |
| `herculesAI.footer.fullTimeAnalysis` | "See full time analysis →" | Time drawer link. Translators omit the arrow if RTL. ≤ 28 chars. |

**RTL implications.**
- Arabic / Urdu: bento mirrors via `dir="rtl"` on the bento container. Ribbon hero stays leading-edge (visual right). Bill chart axis flips. Top-3 rank glyphs (①②③) are direction-neutral.
- Number/unit ordering (e.g. `1,564 OMR`) handled by browser bidi — locale puts `OMR` to the visual leading edge automatically. Verified via existing `useRtl.ts`.
- Arrows (↗ ↘ → ←): direction-independent in this design (they refer to data direction, not reading direction); they should NOT be flipped in RTL.

All four locales (`en.json`, `ar.json`, `hi.json`, `ur.json`) updated together in a single commit.

---

## §10 — Accessibility wiring

**ARIA roles.**
- Bento container: `role="region"` `aria-label="Hercules AI dashboard"`.
- Ribbon: `role="region"` `aria-label="Savings and today's cost"`.
- Hero number: wrapped in `<span aria-label="One thousand five hundred sixty-four Omani Rial saved this month">` — full word form. (MASTER §8.)
- Each bento tile: `role="region"` with descriptive `aria-label`.
- Status dot: decorative — uses `aria-hidden="true"` and the verdict text carries semantic meaning.
- Drawers: `role="dialog"` `aria-modal="true"` `aria-labelledby="drawer-title-{id}"`. Initial focus on the drawer's first focusable element. Esc closes (MASTER §8).
- Modal (lever confirmation): `role="alertdialog"` `aria-modal="true"`.
- Anomaly severity dot: decorative; severity is named in `aria-label` of the parent button: `"Warning: Counter stuck on Mill B, 180 OMR per month at risk"`.

**Focus management.**
- Tab order on initial paint: skip link → header settings → ribbon hero → ribbon today running → confidence pill → trust pill → intensity tile → bill chart → top-3 row 1 → top-3 row 2 → top-3 row 3 → predictions row 1 → predictions row 2 → predictions row 3 → attention row 1 → attention row 2 → attention row 3 → +more → machines row 1..N → footer time link.
- Drawer open: focus moves to drawer first focusable. On close, focus returns to the trigger element.
- Drawers trap focus while open (cycle through drawer's focusable elements only).
- Focus-visible outline: white `rgba(255, 255, 255, 0.6)` 2 px, 4 px offset (per MASTER §6.1 post-review — gold focus ring is invisible on cards containing OMR).

**Keyboard map.**
- `Tab` / `Shift+Tab`: navigate.
- `Enter` / `Space`: activate / open drawer.
- `Esc`: close drawer or modal.
- `↑` / `↓` inside Machines table: row navigation.
- `↑` / `↓` inside Drawer with tabs: tab navigation.
- `?` (anywhere): opens a "Keyboard shortcuts" modal (existing pattern, deferred to Phase 2 if not present).

**Screen-reader behavior for live-updating regions.**
- Ribbon hero: `aria-live="polite"`. When savings_this_month_omr changes (rare, ledger entry confirmed), SR announces the new value via the full-word aria-label.
- Today's running cost: NOT live (changes too frequently — would interrupt the user). Static aria-label, but the surrounding region's `aria-busy` toggles during refresh.
- Anomalies: when a new crit anomaly arrives, the Needs Attention region's `aria-live="assertive"` fires once with the new headline.
- Predictions: NOT live (forecasts update every 30 min — too noisy for SR).
- Machines table: NOT live; column header `aria-sort` reflects current sort.

**Touch targets.** Every interactive element is ≥ 44 × 44 px (MASTER §8). Top-3 lever rows are 85-px tall — exceeds. Anomaly rows are 70-px tall — exceeds. Machines table rows on mobile expand to 60-px tall — exceeds.

**Color independence.** Status dots are accompanied by verdict text on the same line; the dot is decorative. Severity in anomaly rows is named in the row's aria-label. PF below target shows a `⚠` symbol *and* the value in an alert color — text + symbol + color triple-encoded.

---

## §11 — Implementation notes for the dev team

**Components to write (NEW).**
- `Frontend/src/Pages/HerculesAI/HerculesAIDashboard.jsx` — top-level page replacing the chip-driven tree. Renders RoiRibbon + bento grid + footer.
- `Frontend/src/Pages/HerculesAI/dashboard/RoiRibbon.tsx` — §3.1.
- `Frontend/src/Pages/HerculesAI/dashboard/IntensityTile.tsx` — §3.2.
- `Frontend/src/Pages/HerculesAI/dashboard/TodaysBill.tsx` — §3.3 (wraps existing chart helpers).
- `Frontend/src/Pages/HerculesAI/dashboard/TopActions.tsx` — §3.4.
- `Frontend/src/Pages/HerculesAI/dashboard/Predictions.tsx` — §3.5.
- `Frontend/src/Pages/HerculesAI/dashboard/NeedsAttention.tsx` — §3.6.
- `Frontend/src/Pages/HerculesAI/dashboard/MachinesStrip.tsx` — §3.7.
- `Frontend/src/Pages/HerculesAI/dashboard/Footer.tsx` — §3.8.
- `Frontend/src/Pages/HerculesAI/dashboard/hooks/useRealAssets.ts` — applies the §3.7 filter rule to `payload.per_asset` (drop `ttt`, `Mil-A` line-name fallback, zero-tag entries).
- `Frontend/src/Pages/HerculesAI/dashboard/hooks/useDerivedMoneyPerTon.ts` — computes OMR/ton from `cost_omr_today / production_tons`.
- `Frontend/src/Pages/HerculesAI/dashboard/drawers/SavingsLedgerDrawer.tsx` — §5.1.
- `Frontend/src/Pages/HerculesAI/dashboard/drawers/BillDrilldownDrawer.tsx` — §5.2.
- `Frontend/src/Pages/HerculesAI/dashboard/drawers/LeverDrawer.tsx` — §5.3.
- `Frontend/src/Pages/HerculesAI/dashboard/drawers/TimeDrawer.tsx` — §5.4 (wraps existing `BriefingView` + `TimePeriodTabs`).
- `Frontend/src/Pages/HerculesAI/dashboard/drawers/TrustDrawer.tsx` — §5.5.
- `Frontend/src/Pages/HerculesAI/dashboard/drawers/YieldDrawer.tsx` — §5.6.
- `Frontend/src/Pages/HerculesAI/dashboard/drawers/AssetDrawer.tsx` — §5.7 (wraps existing `SecCard` + `PfPenaltyCard` + `PacingRing`).
- `Frontend/src/Pages/HerculesAI/dashboard/drawers/WatchDrawer.tsx` — §5.8.
- `Frontend/src/Pages/HerculesAI/dashboard/drawers/AnomalyDrawer.tsx` — §5.9.
- `Frontend/src/Pages/HerculesAI/dashboard/drawers/DrawerFrame.tsx` — common drawer chrome (close button, title slot, body slot, focus trap).

**Components to reuse.**
- `useRoiPayload` hook (existing; data shape is sufficient — see §3 references).
- `BriefingView`, `TimePeriodTabs`, `useTimePeriod` (mounted inside `TimeDrawer`).
- `SecCard`, `PfPenaltyCard`, `PacingRing` (mounted inside `AssetDrawer`).
- Chart utilities for forecast bands (already specified per MASTER §6.5).
- `useCountUp` hook (already shipping, used for ribbon hero).

**Components to delete after cutover.**
- `BoardroomCard.tsx` — replaced by RoiRibbon + IntensityTile.
- `SegmentedStage.tsx` — no more chips.
- `stages/AttentionStage.tsx` — content split between TopActions / Predictions / NeedsAttention.
- `stages/MachinesStage.tsx` — replaced by MachinesStrip.
- `stages/AuditStage.tsx` — content moves to SavingsLedgerDrawer.
- `stages/TimeStage.tsx` — content moves to TimeDrawer.
- `components/HeroVerdict.tsx` — verdict logic absorbed into IntensityTile.
- `components/GoldCoin3D.tsx` — Three.js coin removed (was a 3D moment in Plan 6; not in this redesign — gold ribbon is the premium moment).
- `components/AssetDrillDrawer.tsx` — superseded by `dashboard/drawers/AssetDrawer.tsx`.

**Page-spec doc update.** `design-system/hercules-roi-genius/pages/hercules-ai-roi.md` is partially superseded — the boardroom-card section + segmented-stage section need replacement with the bento spec from this plan. Submit the page-spec edit in the same PR as the implementation.

**Backend.** No changes required — existing `payload_builder.py` returns every field cited in §3. The `_compute_plant_score` cache stays. No new endpoints, no new migrations.

**Suggested commit sequence.**
1. **Scaffold dashboard skeleton.** Add `HerculesAIDashboard.jsx`, render placeholder cards in the bento grid with mock data. Mount it as the new `step === 3` body in `HerculesAISetup.jsx` behind a feature flag (`enableNewDashboard`). Old surface still renders by default.
2. **Build RoiRibbon.** Wire to `useRoiPayload`. Verify hero is gold OMR for normal/calibrating, white `--` for no-data.
3. **Build IntensityTile + TopActions + Predictions** in parallel (independent components).
4. **Build TodaysBill.** Wire chart and band rendering.
5. **Build NeedsAttention + MachinesStrip.** Wire `useRealAssets` filter.
6. **Build Footer + drawer frame + first drawer (TimeDrawer).** Verify Phase 1 surface renders unchanged inside the drawer.
7. **Build remaining drawers** (Savings, Bill, Lever, Trust, Yield, Asset, Watch, Anomaly).
8. **Add motion polish** (count-up, rank-1 pulse, drawer slide).
9. **i18n keys × 4 languages** (single commit).
10. **A11y pass**: aria-labels, focus order, focus trap on drawers, keyboard map.
11. **Flip the feature flag.** Old components stay in tree; new components are default.
12. **Delete dead components** (Boardroom, Segmented, stages, HeroVerdict, GoldCoin3D, AssetDrillDrawer). Single commit.

Each step is reversible. If step N regresses, step N-1 still has a working page.

**Performance budget (per MASTER §7).**
- Lazy-load every drawer via `React.lazy` + Suspense. Drawers do not contribute to initial bundle.
- Lazy-load the bill area chart (recharts) — already in bundle but the chart component file should chunk-split.
- Only memo'ize `MachinesStrip` rows and `TopActions` rows (per MASTER §7 — memo the high-frequency lists, not the parents).

---

## §12 — Open questions — LOCKED

All three answered. Plan is now locked for implementation.

| # | Question | Locked answer |
|---|---|---|
| 1 | OMR/ton baseline window | **Rolling 24 h** with a small "24h average" sub-label under the figure. Stable; matches the "Confidence: Reliable" framing of the rest of the ribbon. |
| 2 | Calibration footer wording | **Both shown together**: "Hercules learning · 28 days left · Updated N min ago". One strip, two facts, separated by middle dots. After day 30 the learning portion disappears and only the "Updated" portion remains. |
| 3 | `Mil-A` keep-or-drop | **Drop entirely.** Owner's anti-pattern feedback explicitly listed line_name-only fallbacks as junk. The §3.7 filter drops any asset where `tracked_tags === 0 && !has_energy_meter && !has_production_counter` AND the asset_name was derived from `line_name` (not `parent_asset` or a tag-name prefix). Setup workflow for genuinely uninstrumented lines lives in Settings, not in the watched-machines list. |

---

*End of plan.*
