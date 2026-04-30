# Hercules AI Page — Essentials & Design Brief

Date: 2026-04-30
Audience: a world-class UI/UX designer redesigning the Hercules AI page from scratch.
Goal: ONE professional no-scroll page that surfaces every essential of what Hercules AI computes — money figures, insights, predictions, anomalies, charts, levers — without the current 4-tab chip-hopping or the universally-applied verdict card.

---

## 0. Why this exists

The current Hercules AI page was assembled iteratively across Plan 5 (ROI Money + Crystal Ball) → Plan 6 (Boardroom Mode redesign) → Plan 9-12 (architecture refactor, in progress). Each phase added cards. The end result is a four-tab structure (`Attention | Machines | Time | Audit`) where:

- The same big "92/100 Running smoothly" verdict anchor sits at the top of every tab.
- The Time tab's verdict duplicates the same number it already displays in its own detailed analysis.
- Predictions/forecasts (already computed by the backend) are buried inside the Attention tab's `WatchBand` component.
- The OMR figure — the entire point of "ROI Genius" — appears nowhere in the verdict; only kWh/ton is shown.
- "9 machines watched" inflates the count: 2 of those are junk (`ttt` user-test, `Mil-A` derived from a fallback that probably shouldn't classify as an asset).
- Levers have a hardcoded `confidence_pct = 80` literal — not a model output.

Customer feedback on 2026-04-30 (verbatim): *"the whole Hercules AI page should be redesigned from scratch to include only essentials from time and other tabs and top shit badge."*

That's the brief.

---

## 1. Hard constraints (the designer cannot relax these)

### No-scroll
- Target viewports: **1440×900** (laptop) and **1920×1080** (desktop). The page fits within available chrome on both, no vertical scroll bar.
- Below 1280 wide: hero region stays no-scroll, secondary sections may stack into a vertical accordion. Mobile is a separate consideration (§6).

### Locked design system
- Tokens: `design-system/hercules-roi-genius/MASTER.md`
- Page-specific: `design-system/hercules-roi-genius/pages/hercules-ai-roi.md`
- Stack: glassmorphism + dark mode (OLED-friendly) + bento grid
- **Gold (`var(--hai-money)`) reserved exclusively for OMR figures.** Do not use gold for any non-money element.
- Max 2 layers of glass nesting.
- Max 2 animated elements at idle.
- Motion: 240 ms `--hai-ease-out` for state changes; no idle pulses.
- No emojis. SVG icons only (Lucide preferred).

### Customer-facing language (CLAUDE.md Rule #5)
- Plain English. No jargon. No acronyms unless universally understood.
- Banned vocabulary on screen: `snapshot`, `payload`, `compute`, `advisory lock`, `EWMA`, `Holt-Winters`, `p10`, `p90`, `MAPE`, `RMSE`, `z-score`, `IsolationForest`, `kVAh`, `kVARh`, `cos phi`, `tag_id`, "calibrating" (use "Learning" instead).
- 4 languages required: English (LTR), Arabic (RTL), Hindi (LTR), Urdu (RTL).

### Identity invariants
- The plant score (0-100) **must** equal the score the Time tab's `/api/hercules-ai/insights` endpoint returns for the same period. Do not introduce a new metric.
- All OMR figures **must** trace back to `payload.money.*`, `payload.savings.*`, `payload.levers[*].omr_per_*`. No fabricated numbers, no decorative figures.

---

## 2. Data inventory — every essential available to render

### Tier 1 — must be visible without any interaction

| Data point | Backend source | Customer-facing label (English) | Format |
|---|---|---|---|
| Plant verdict text | `payload.plant_status_verdict` | (e.g. "Running smoothly", "Watch power factor on M30") | sentence |
| Plant status level | `payload.plant_status_level` | (color-coded dot: ok/warn/crit) | enum |
| Score 0-100 | `payload.plant_score.value` | "Plant score" | integer |
| Energy intensity | `payload.plant_score.efficiency` | "kWh/ton" | float, 1 decimal |
| Energy cost intensity | derived: `cost_omr_today / kg_today × 1000` | **"OMR/ton"** | float, 2 decimals |
| Month-to-date savings | `payload.money.savings_this_month_omr` | **"saved this month"** | OMR, integer |
| Today's running cost | `payload.money.cost_omr_today` | **"cost today"** | OMR, integer |
| Today's projected daily bill | `payload.forecasts.daily_bill.projected_omr` | **"projected today"** | OMR, integer + small range |
| Power-factor penalty risk | `payload.money.pf_penalty_omr_month` | **"at risk: power factor"** | OMR/month |
| Top 3 levers | `payload.levers[0..2]` | (per card: headline + OMR/year + payback) | — |
| → Lever headline | `levers[i].headline` | (e.g. "Install capacitor on M30") | sentence |
| → Lever value | `levers[i].omr_per_year` | "OMR/year" | OMR, integer |
| → Lever payback | `levers[i].payback_months` | "Pays back in N months" | float |
| Active anomalies | `payload.anomalies` (filtered: severity ∈ warn/crit, suppressed=false) | "Needs attention" | list of 3-5 |
| → Anomaly headline | `anomaly.headline` | sentence | — |
| → Anomaly asset | `anomaly.asset` | asset name | — |
| → Anomaly OMR at risk | `anomaly.omr_at_risk` | "OMR/month at risk" | OMR, integer |
| Number of real assets | filtered count of `payload.per_asset` (junk excluded) | "machines watched" | integer |
| Calibration state | `payload.savings.calibrating` AND days remaining | "Learning · N days left" | text+days |
| Last update timestamp | derived from snapshot generated_at | "Updated N min ago" | relative time |

### Tier 2 — expandable on hover / click / drawer

| Data point | Backend source | Trigger | Drilldown surface |
|---|---|---|---|
| Per-asset SEC + status | `payload.per_asset[i].sec` | click "kWh/ton" | drawer or modal: per-asset table |
| Per-asset PF + penalty | `payload.per_asset[i].pf` | click "PF risk" | same drawer, PF tab |
| Per-asset shift pace | `payload.forecasts.shift_pace` | click "today's projection" | inline expand or drawer |
| Yield outlook | `asset_yield_hourly` last 7d vs baseline 14d | click yield card | drawer: yield trend chart |
| Trust score detail | `payload.trust` | hover badge | tooltip with components |
| Plant score breakdown | `payload.plant_score.breakdown` | hover/click score | tooltip: production/quality/energy split |
| Lever evidence + actions | `levers[i].evidence`, `levers[i].confidence_pct` | click lever card | modal: full evidence + Implement/Schedule/Dismiss buttons |
| Anomaly evidence | `anomalies[i].evidence` + `tag_history` chart | click watch item | modal: evidence + last-N-min mini chart |
| Savings ledger | `/api/hercules-ai/savings` | click "saved this month" | drawer: ledger entries with confirm/dispute |
| Time-period analysis | `/api/hercules-ai/insights?from=...&to=...` | period selector or "see history" | drawer or modal: period analysis (replaces today's Time tab) |

### Tier 3 — settings/secondary, in cog menu only

- AI provider, LLM model, tariff (OMR/kWh), PF target, peak hours, value per ton (flour/bran/pasta), shift definitions
- Last AI scan timestamp, setup_completed flag
- Re-scan trigger, manual refresh trigger
- Distribution / CFO email settings

---

## 3. User goals — the 5-second test for three personas

The same single-page layout serves all three. The hierarchy is: **money → status → predictions → actions → watches**.

### CFO on a phone, mid-meeting
Wants to know: *"How much did Hercules save this month, is anything on fire?"*
- 1st glance (≤ 2 s): month-to-date OMR savings in gold + status dot color.
- 2nd glance (≤ 5 s): any crit anomalies? Any pending high-value lever?
- Should be readable at glance distance with phone in hand.

### Plant manager before morning rounds
Wants to know: *"What needs my attention today?"*
- 1st glance: anomalies count + Top-3 levers.
- 2nd glance: shift pace projection, today's projected bill.
- Drilldown to per-asset detail when something specific catches their eye.

### Operator during a shift
Wants to know: *"Are we on track, or is something off?"*
- 1st glance: status dot, current shift pace status, any anomalies on their line.
- They typically don't engage with money figures — but the page should not hide them.

---

## 4. Anti-patterns — explicit do-NOT list (from customer feedback)

1. **No giant verdict card at the top of every tab.** The current "92/100 Running smoothly" hero is dismissed as "shit". Demote, embed, or restyle — but it cannot be the universal anchor.
2. **No kWh/ton without OMR/ton next to it.** Energy intensity is engineer-shaped; money is the CFO headline.
3. **No buried predictions.** Today's projected bill, tomorrow's yield outlook, next likely anomaly — these are HERO material, not WatchBand-tab content.
4. **No phantom asset count.** Filter `payload.per_asset` to real assets only:
   - Drop entries with `asset_name = 'ttt'` (test garbage)
   - Drop entries derived solely from `line_name` fallback if they have no production counter and no energy meter
   - Drop entries with zero tracked tags
   - Show 4-7 real assets, not 9 inflated ones
5. **No verdict duplication on the Time tab.** Time is its own analytical surface — its existing layout (period selector + insights + charts + KPI score) is fine and complete. Don't anchor a verdict above it.
6. **No three-glass-layer stacks.** Max 2 layers of glass nesting.
7. **No chip-hopping for essentials.** Tabs may exist as filters, not as navigation between equally-essential surfaces.
8. **No idle animation.** No pulsing chips. No spinning coin when no event.
9. **No engineer vocabulary.** `payload`, `snapshot`, `cos phi`, `kVAh` — banned on screen.
10. **No fake-confidence.** Lever cards must NOT display "80% confident" until that number comes from a real model. Show payback months instead — that's grounded.

---

## 5. What the designer must produce

A complete layout proposal containing:

### 5.1 Region map (the bento grid)
Named regions, approximate pixel allocations on 1440×900, rationale for the hierarchy. Provide an ASCII layout sketch and a written description.

Example region naming (the designer is free to invent better names):
- "Money Hero" — the gold OMR figure(s)
- "Status Pulse" — the verdict text + status indicator
- "Today's Pace" — daily bill projection + shift pace
- "Action Tower" — Top-3 levers
- "Watch Strip" — anomalies + drift alerts
- "Asset Strip" — per-asset compact summary (real assets only)
- "Time Slice" — the time-period analysis tucked in or accessible

### 5.2 Per-region content
For each region: exact data points pulled from §2, the strings to render (with i18n keys), units, hover/click interaction → which Tier-2 surface.

### 5.3 Hierarchy ranking
What does each persona see first / second / third? Justify why the layout reads correctly for each.

### 5.4 Drilldown semantics
For every Tier 2 data point: modal? drawer? in-place expand? Specify which and why.

### 5.5 State coverage
For each region:
- Calibrating state (first 30 days, low-data)
- No-data / empty state
- Error state (worker failed, snapshot stale, API down)
- Normal state
- Alert state (warn/crit anomaly, will-miss pace, PF below target)

How each region degrades gracefully.

### 5.6 Color & typography assignments
Every region's surface color, border, text color, font sizes — specified using locked tokens (`var(--hai-glass-1)`, `var(--hai-text-primary)`, etc.).

### 5.7 Motion language
What animates when, what doesn't. Cite MASTER.md tokens.

### 5.8 Mobile collapse (< 1280 wide)
A single rule for stacking order. The hero region must remain priority-1.

### 5.9 Innovation freedom
The designer is **encouraged to break the current 4-tab structure entirely**. If a single-page bento with no tabs is right, propose that. If a "Now / Soon / Done" three-pane is right, propose that. If a money-first one-glance + drillable everything is right, propose that. Do not iterate on what's there — design from the data.

### 5.10 Design rationale
A short prose section explaining why the proposed layout vs at least 2 alternatives considered. Show your work.

---

## 6. Output

Save your proposal as:
**`docs/plans/AI Features/14_Hercules_AI_Page_Redesign_30_04.md`**

Length expected: 600-1200 lines of Markdown. Comprehensive enough that an implementer can build it. Include:
- ASCII bento sketch in a fenced code block
- Per-region tables (data, strings, interaction)
- Token-by-token color assignments
- State-coverage matrix
- Brief design rationale

You are the design authority. Make decisions. Don't ask the owner to choose — propose, justify, ship.

---

## 7. References

| Doc | Why read it |
|---|---|
| `design-system/hercules-roi-genius/MASTER.md` | Locked tokens, motion, glass rules, banned vocabulary |
| `design-system/hercules-roi-genius/pages/hercules-ai-roi.md` | Page-specific design decisions from prior reviews |
| `docs/plans/AI Features/06_Boardroom_Mode_Redesign_Plan_30_04.md` | What was tried before — understand it, do NOT replicate |
| `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx` | Current implementation (the thing being replaced) |
| `Frontend/src/Pages/HerculesAI/components/BoardroomCard.tsx` | Current verdict card (the "shit badge" — drop or transform) |
| `Frontend/src/Pages/HerculesAI/stages/{Attention,Machines,Time,Audit}Stage.tsx` | Current four-tab content — extract essentials, don't preserve structure |
| `Frontend/src/Pages/HerculesAI/hooks/useRoiPayload.ts` | Data hook; defines the payload shape you have to render |
| `backend/ai_money/payload_builder.py` | What's actually in the payload |
| `Frontend/src/i18n/en.json` | Existing customer-facing strings (search `herculesAI.`) |

---

*End of essentials brief. The designer should now produce `14_Hercules_AI_Page_Redesign_30_04.md`.*
