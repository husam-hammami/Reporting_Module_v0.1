# Plan 5 — Hercules AI: The ROI-Genius Layer

Date: 2026-04-30
Author: Senior Plant-AI Architect
Target branch: `Salalah_Mill_B`
Builds on: Plan 1 (Visual Redesign), Plan 2 (Tariffs), Plan 3 (ML Roadmap), Plan 4 (Chat).

---

## 0. One-paragraph thesis

Today's AI tab tells you *what happened*. We will rebuild it to tell you *what it cost, what it will cost, and exactly which lever — in OMR per month — fixes it.* The existing Phase-1 briefing, Phase-2 tariff machinery (Plan 2), and ML primitives (Plan 3) are the engine. This plan adds the **money-and-prediction surface** that makes the engine sellable: an always-visible Savings Scoreboard, a Forecast band on every counter, a Top-3 Actions panel quoted in OMR/month, and a CFO-tier LLM prompt that names rials, not adjectives. It is scoped specifically against the report templates currently shipping with Salalah Mill B (Mill B production, C32/M30/M31 power dashboards, Pasta totalizers).

---

## 1. Why the current AI doesn't sell

Pulled from the live Phase-1 briefing on a Salalah day and the export `hercules_export_reports+report_templates_2026-04-15.json`:

1. **No money on screen.** The Salalah mill consumes hundreds of MWh/year. A briefing that says "Apparent Power 184 kVA" and not "**that's 38 OMR/hour, 273 OMR/day**" is leaving the convince on the table.
2. **No forward look.** Every metric is `now vs previous`. There is no projection. A plant manager at 14:00 cannot tell from this UI whether the shift will hit target — the most valuable question of the day.
3. **No translation between data and decision.** The user must mentally bridge "PF 0.74 on C32" to "you owe an OMR penalty and a capacitor bank fixes it in 4 months". The AI that doesn't do that bridge is just a dashboard with prose on top.
4. **One tag at a time.** SEC (kWh per tonne) is the single most diagnostic mill metric and it never appears, because it requires *cross-report* math (energy report + production report). The current AI processes reports in isolation.
5. **Anomaly noise risk** (acknowledged in Plan 3). Without the discipline below, ROI numbers will hallucinate at zero-baselines and the user will stop trusting them within a week.

Goal: a plant manager opening the AI tab forms a verdict, sees money, sees a forecast, and sees a fixable lever — in under 5 seconds.

---

## 2. Architecture: three layers

```
┌─────────────────────────────────────────────────────────────────┐
│  ① MONEY LAYER  (deterministic, no LLM)                          │
│      backend/ai_money/   ← new package                           │
│      • SEC (kWh/ton) — F2 promoted to first class                │
│      • PF penalty calculator — uses Plan 2 tariff table          │
│      • Energy cost per asset, per shift, per day                 │
│      • Throughput-to-revenue (production_value_per_ton already   │
│        in hercules_ai_config)                                    │
│      • Money-saved-this-month engine                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ② CRYSTAL BALL LAYER  (statistical, no ML libraries on client)  │
│      backend/ai_forecast/   ← new package                        │
│      • Shift-pace projector  (linear projection from delta-rate) │
│      • End-of-day energy bill projector (EWMA)                   │
│      • Holt-Winters 24h baseline (numpy-only)                    │
│      • PF/voltage-imbalance trend slope → predictive maintenance │
│      • Anomaly: stuck totalizer, flow=0 while ON, PF drift       │
│      All gated by R-rules from Plan 3 §"Noise reduction".        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  ③ NARRATOR LAYER  (LLM — Claude / LM Studio, existing)          │
│      backend/ai_prompts.py (extended)                            │
│      • CFO-mode prompt: every bullet ends in OMR                 │
│      • Receives a typed roi_payload, never raw tag rows          │
│      • Generates the Top-3 Actions list with $ figures           │
│      • Emails inherit the same payload                           │
└─────────────────────────────────────────────────────────────────┘
```

LLM is **never** the calculator. LLM is the storyteller. Math is auditable Python.

---

## 3. Tag inventory — what the export gives us

Pulled from the actual export. These are the levers; the plan is built around them.

### Mill B production (templates 5, 13, 11, 6 — Pasta + MIL-B + WPK1 + Mill B Dashboard + Mil_B_energy_report)

| Tag | Type | What it drives |
|---|---|---|
| `mil_b_b1_totalizer` | counter (kg) | B1 production delta, shift pace |
| `mil_b_bran_totalizer` | counter (kg) | Bran production delta |
| `mil_b_flour_totalizer` | counter (kg) | Flour production delta — primary revenue tag |
| `mil_b_b1_flowrate`, `mil_b_bran_flowrate`, `mil_b_flour_flowrate`, `mil_b_job_flowrate` | rate (kg/h or t/h) | Pace ETA, instantaneous SEC denominator |
| `mil_b_b1_percentage`, `mil_b_bran_percentage`, `mil_b_flour_percentage` | percentage | **Extraction yield drift** (Phase A feature 4) |
| `mil_b_order_active`, `mil_b_dampening_on`, `mil_b_b1_scale`, `mil_b_filter_flour_feeder`, `mil_b_vitamin_feeder_on`, `mil_b_mill_emptying`, `mil_b_b1_deopt_emptying` | boolean | Equipment-on gate (R1), shutdown detection (R2) |
| `mil_b_dest_id_1`, `mil_b_dest_id_2`, `millb_sender_1_id..3_id`, `mil_b_sender_id_1..3` | id_selector | Order/grade segmentation (R4 buffer) |
| `mil_b_vitamin_feeder_percentage` | percentage | Quality / dosing |

### C32 / M30 / M31 power dashboards (template 14, plus M30/M31 tabs)

| Tag pattern | Type | What it drives |
|---|---|---|
| `*_l1_voltage`, `*_l2_voltage`, `*_l3_voltage` | analog (V) | **Voltage imbalance health** (Phase B feature) |
| `*_l1_current`, `*_l2_current`, `*_l3_current` | analog (A) | Current imbalance, motor heating signature |
| `*_cos_phi` | percentage / pf | **PF penalty** (Phase A feature 2) |
| `*_apparent_power` (kVA), `*_reactive_power` (kvar), `*_effective_power` (kW) | analog | Demand + reactive load |
| `*_total_active_energy` (kWh) | counter | **OMR/hour, OMR/day, SEC numerator** |
| `*_total_apparent_energy`, `*_total_reactive_energy` | counter | TUoS demand basis (Plan 2) |

### Pasta line (template 5)

| Tag | Type | Notes |
|---|---|---|
| `pasta_1_521we_totalizer` | counter (kg) | Pasta line 1 |
| `pasta_4_830we_totalizer` | counter (kg) | Pasta line 4 |
| `pasta_e_1010_totalizer` | counter (kg) | Pasta E line |

**Asset linking model.** A new column `parent_asset` in `hercules_ai_tag_profiles` (added by Plan 3 — kept here) groups tags into physical assets:
- `Mill B` ← all `mil_b_*`, `millb_*`
- `C32 Mill` ← all `c32_*`
- `M30 Mill` ← all `m30_*`
- `M31 Mill` ← all `m31_*`
- `Pasta 1`, `Pasta 4`, `Pasta E` ← respective totalizer + scope

This is the unit the UI groups by. **Reports stop being the grouping primitive.** This eliminates the "MIL-B / Mill B Dashboard / Mil_B_energy_report appearing as four separate things" problem identified in Plan 1 §1 #4.

---

## 4. Phase A — Money Layer (week 1)

The "this is making me money" wow. Ship this and the rest sells itself.

### 4.1 Module skeleton

New package `backend/ai_money/`:

```
backend/ai_money/
├── __init__.py
├── sec.py              # Specific Energy Consumption per asset
├── pf_penalty.py       # Power-factor penalty per Oman CRT
├── cost.py             # Per-asset OMR/hour, OMR/day, OMR/month
├── revenue.py          # production × value_per_ton
├── savings_ledger.py   # Money-saved-this-month engine
└── tests/
    ├── test_sec.py
    ├── test_pf_penalty.py
    └── ...
```

### 4.2 Feature A1 — SEC per asset

Promotes Plan 3's F2 from "day 1 backend" to a first-class, always-visible KPI.

**Math.** For asset `A`, window `[t1, t2]`:
```
SEC(A) = Σ(energy counter delta over window)        kWh
       ─────────────────────────────────────────  ─────
         Σ(production counter delta over window)    ton
```

The energy/production tag pair per asset is declared once in `hercules_ai_tag_profiles` via two new columns:
- `is_energy_meter BOOLEAN`
- `is_production_counter BOOLEAN`

The Hercules-AI Setup wizard prompts the user to confirm the pair. Default auto-detection: any `*total_active_energy` is an energy meter; any `*totalizer` with unit `kg` or `t` is a production counter.

**SQL view** (materialized hourly by `dynamic_archive_worker`):

```sql
CREATE TABLE asset_sec_hourly (
    asset_name      VARCHAR(64) NOT NULL,
    hour_start      TIMESTAMP NOT NULL,
    kwh_consumed    NUMERIC(14,4),
    kg_produced     NUMERIC(14,4),
    sec_kwh_per_t   NUMERIC(10,4),
    cost_omr        NUMERIC(10,4),
    revenue_omr     NUMERIC(10,4),
    PRIMARY KEY (asset_name, hour_start)
);
```

Skip rows where `kg_produced < 5%` of asset's 30-day median to avoid ∞ SEC (R-rule from Plan 3).

**API.** `GET /api/hercules-ai/sec?asset=mill_b&from=...&to=...` → `[{hour, sec_kwh_per_t, baseline, delta_pct, cost_omr, revenue_omr}]`.

**UI card.** Sits in the AssetPanel (Plan 1 component). Two numbers: today's SEC + delta vs 30-day baseline. Hover tooltip shows the OMR equivalent: "This shift's SEC is 47.2 kWh/t. Baseline 42.8. **Excess cost: 87 OMR over 8 hours.**"

### 4.3 Feature A2 — PF penalty calculator

Uses the four-component CRT structure already specified in Plan 2. This plan does not redefine the tariff table — it consumes it.

**Math.** For an asset with average `cos_phi` over a billing month (default current calendar month):
- If `pf_avg ≥ pf_target` (`pf_target` default 0.85, configurable): penalty = 0.
- Else: `penalty_OMR = (kvarh / kwh_threshold) × penalty_rate`. The exact formula per Oman APSR DUoS schedule lives in `pf_penalty.py:compute_penalty()` — confirm the rate from Plan 2's Nama Dhofar 2025 CRT statement.

`backend/ai_money/pf_penalty.py` exposes:
```python
def compute_penalty(asset_name: str, period_start, period_end) -> dict
# returns {pf_avg, pf_target, kvarh, kwh, penalty_omr, target_pf_kvar_correction}
```

**Capacitor sizing — payback calculator.** From the kvar correction needed to lift PF to 0.95:
```
required_kvar = kw × (tan(arccos(pf_now)) − tan(arccos(0.95)))
```
A typical low-voltage capacitor bank is ~12 OMR/kvar installed. Payback months = bank_cost / monthly_penalty. Output:
> *"C32 PF 0.74. Penalty this month: 142 OMR. Bank required: 92 kvar (~1,100 OMR). Payback: 7.7 months."*

**API.** `GET /api/hercules-ai/pf-status?asset=c32` → object above.

**UI card.** New `PfPenaltyCard` in `Frontend/src/Pages/HerculesAI/components/`. Bright when penalty > 0, neutral when not.

### 4.4 Feature A3 — OMR/hour, OMR/day for every energy meter

Cheap and high-impact. Every energy counter on screen gets a "≈ X OMR/hr" sub-label. The conversion uses Plan 2's hourly `energy_charges_bz[hour]` plus DUoS — the exact same calculator the bill simulation uses, but applied live.

`backend/ai_money/cost.py:cost_omr_for_window(asset, t1, t2)` → OMR float.

UI: every kWh widget gets a small chip. Reuses the existing `MetricCard` `delta` slot but adds a `cost_chip` prop.

### 4.5 Feature A4 — Extraction yield drift (Mill B specific)

The export shows Mill B reports already track `mil_b_flour_percentage`, `mil_b_bran_percentage`, `mil_b_b1_percentage`. ROI math:

```
revenue_lost_OMR_per_shift =
   (baseline_flour_pct − current_flour_pct) × wheat_intake_kg × value_per_ton_flour / 100 / 1000
```

`wheat_intake_kg` is `mil_b_b1_totalizer` delta. `value_per_ton_flour` is in `hercules_ai_config` (already exists as `production_value_per_ton`).

**Storage.** New row appended to `asset_yield_hourly`:
```sql
CREATE TABLE asset_yield_hourly (
    asset_name      VARCHAR(64),
    hour_start      TIMESTAMP,
    flour_pct       NUMERIC(6,2),
    bran_pct        NUMERIC(6,2),
    b1_pct          NUMERIC(6,2),
    intake_kg       NUMERIC(14,4),
    flour_kg        NUMERIC(14,4),
    yield_revenue_omr NUMERIC(10,4),
    drift_omr_vs_baseline NUMERIC(10,4),
    PRIMARY KEY (asset_name, hour_start)
);
```

Baseline: rolling 30-day median of `flour_pct` per `order_name` (grade). Drift > 1% absolute and > 4 hours sustained → attention item.

### 4.6 Feature A5 — Money-saved-this-month scoreboard

The headline that closes the sale. A persistent ribbon at the top of the AI tab and the email footer:

> **Hercules saved you 2,140 OMR this month.**
>  ↳ PF correction recommendations: 480 OMR avoided
>  ↳ Yield drift caught early: 940 OMR recovered
>  ↳ Off-peak load advice: 720 OMR

**Mechanics.** Three rules feed the ledger:

1. **PF correction recommended.** When the AI flagged a PF-below-target event AND `cos_phi` improved within 14 days AND penalty fell, the difference attributes to Hercules. Confidence-weighted (start at 50%; user can mark "actioned by Hercules" → 100%).
2. **Yield drift caught.** When a yield-drift attention item was raised AND the user confirmed action AND yield recovered.
3. **Off-peak shift advice.** When the LLM recommended shifting non-critical load off-peak AND the kWh distribution measurably changed.

Schema:
```sql
CREATE TABLE ai_savings_ledger (
    id              SERIAL PRIMARY KEY,
    rule            VARCHAR(32) NOT NULL,         -- 'pf_correction' | 'yield_drift' | 'off_peak_shift'
    asset_name      VARCHAR(64),
    detected_at     TIMESTAMP,
    actioned_at     TIMESTAMP,
    omr_saved       NUMERIC(10,4),
    confidence_pct  INT NOT NULL DEFAULT 50,
    user_attributed BOOLEAN DEFAULT false,
    evidence_json   JSONB,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

**Honesty discipline.** The card shows confidence-weighted total by default and an "audit" toggle that breaks down each entry with the evidence link. Never reports speculative savings without ledger entries — empty month shows `0 OMR — Hercules is still calibrating to your plant`.

### 4.7 Phase A acceptance

- A user opens AI tab → sees a ribbon with a non-zero OMR figure (real or "calibrating"), per-asset SEC card, per-asset PF status card, and Mill-B yield card.
- Hover over any kWh number → OMR/hour chip appears.
- Switching the time range from `today` to `this month` updates all OMR figures within 2 seconds.
- Empty-data case shows `Calibrating — N more days of data needed`, not zeros pretending to be insights.

**Effort: ~5 working days.**

---

## 5. Phase B — Crystal Ball (week 2)

Predictions are the *attractive* dimension. Every projection comes with a confidence band, never a single number.

### 5.1 Module skeleton

```
backend/ai_forecast/
├── __init__.py
├── shift_pace.py       # End-of-shift projection from current rate
├── daily_bill.py       # End-of-day OMR projection
├── baseline_24h.py     # Holt-Winters daily seasonality (numpy only)
├── trend_slope.py      # Linear trend extrapolation for PF / voltage health
├── stuck_detector.py   # Promoted from F1
└── tests/
```

No external ML deps. `numpy` is already installed. `scipy.stats` if needed for confidence intervals.

### 5.2 Feature B1 — Shift Pace Projector

The single most useful real-time feature for an operator.

**Math.** Given:
- `t_start` of current shift (from `shifts_config.json`)
- `now`
- `t_end` of shift
- `produced_so_far` = totalizer delta from `t_start` to `now`
- `target_kg` = stored per asset in `hercules_ai_config[shift_target_kg][asset]`

```
elapsed_h = (now − t_start) / 1h
remaining_h = (t_end − now) / 1h
pace = produced_so_far / elapsed_h
projected_total = produced_so_far + pace × remaining_h
gap_kg = target_kg − projected_total
eta_to_target = produced_so_far + pace × remaining_h
```

For confidence, use the rolling stddev of hourly delta in the last 30 shifts. `projected_total ± 1.96 × stddev × sqrt(remaining_h)` gives a 95% band.

**API.** `GET /api/hercules-ai/shift-pace?asset=mill_b` → `{produced_so_far, projected_total, target, gap_kg, p10, p90, status: 'on_track'|'at_risk'|'will_miss'}`.

**UI card.** Pace ring: outer arc shows projected fraction of target. Centre shows projected total + gap. Sub-line: "ETA: target reached at 21:14, shift ends 22:00, +28 min margin." Red when `status='will_miss'`.

### 5.3 Feature B2 — End-of-day energy bill projector

By 14:00, you can forecast today's OMR bill within ±5%. By 18:00, ±2%. Sells.

**Math.** For each asset:
1. Take running kWh today (counter delta from 00:00).
2. Project remaining-hours kWh by multiplying remaining hours × historical hour-of-day median (last 30 calendar days, same day of week), filtered by R-rules.
3. Convert each future hour using Plan 2's `energy_charges_bz[hour]`.
4. Sum + DUoS + apportioned TUoS + supply.

**API.** `GET /api/hercules-ai/daily-bill-projection?asset=c32&date=today` → `{omr_so_far, omr_projected, omr_p10, omr_p90, last_year_same_day_omr}`.

**UI.** Below the SEC card. Plain bar: "So far 184 OMR. Day will close ~310 OMR (range 295–328). Last Wed: 304 OMR."

### 5.4 Feature B3 — PF / voltage-imbalance trend slope

Linear regression on cos_phi over last 14 days. If the slope is statistically significant (p<0.05) and points downward fast enough to cross 0.85 within 30 days, raise predictive maintenance attention item:

> *"C32 PF trend: 0.91 → 0.79 in 14 days. At this slope, target threshold (0.85) crossed in ~9 days. Capacitor bank inspection recommended within 7 days. Estimated avoided penalty: 220 OMR/month."*

Same pattern for L1/L2/L3 voltage imbalance: compute imbalance ratio `max(|Vi − Vavg|) / Vavg`. Slope-based warning when projected to cross 2% imbalance (motor de-rate threshold).

### 5.5 Feature B4 — Quiet anomaly detection (specific to these reports)

Three concrete detectors. Each gated by R-rules from Plan 3 §"Noise reduction". No ML libraries — these are deterministic rules with thresholds tuned to milling.

| Detector | Trigger | Suppression |
|---|---|---|
| **Stuck totalizer** | counter unchanged for ≥10 min while parent boolean (`mil_b_b1_scale`, etc.) is ON | R1, R5 |
| **Flow=0 while ON** | `*_flowrate < 0.05 × p10_flowrate` for ≥5 min while `mil_b_order_active = TRUE` | R3 (weekend), R4 (order-change buffer) |
| **PF cliff** | Δcos_phi > 0.10 within 60 min (capacitor failure signature) | R6 (significance floor) |

Detected events go to `ml_anomaly_events` (already specified in Plan 3). The narrator picks the top significance.

### 5.6 Phase B acceptance

- AI tab shows pace ring on every active production asset, updated every 30s.
- AI tab shows end-of-day OMR projection with 95% band, updated hourly.
- A simulated PF dip from 0.92 → 0.79 over 14 days raises one (and only one) attention item with the predicted threshold-cross date.
- A simulated stuck-totalizer condition (with parent ON) is detected within 10 minutes.
- A simulated weekend (Friday-Saturday in Oman) does **not** raise any anomaly — verifies R3.

**Effort: ~5 working days.**

---

## 6. Phase C — Narrator Upgrade (week 3)

Where the AI stops being a dashboard with prose on top and starts being a CFO briefing.

### 6.1 Typed `roi_payload` contract

Today the LLM gets newline-joined tag rows. We replace this with a typed object built by Phases A+B. The LLM's only job is narration.

```python
# backend/ai_prompts.py — NEW dataclass
@dataclass
class RoiPayload:
    period_from: str
    period_to: str
    cmp_label: str
    plant_status_level: Literal['ok', 'warn', 'crit']
    plant_status_verdict: str

    money: dict          # {savings_this_month_omr, projected_today_omr, pf_penalty_omr, sec_excess_omr_today}
    forecasts: list      # [{asset, metric, projected, p10, p90, status, eta}]
    anomalies: list      # [{asset, headline, severity, since, omr_at_risk_per_month}]
    levers: list         # the Top-3 Actions, computed BEFORE the LLM call

    per_asset: list      # [{asset, sec_kwh_per_t, sec_baseline, pf_avg, today_omr, throughput_kg, target_kg}]
```

Built deterministically by `backend/ai_money/payload_builder.py`. The LLM cannot fabricate OMR figures because they are pre-computed and the prompt contract demands quoting them verbatim.

### 6.2 New LLM prompt — CFO mode

Add `build_cfo_briefing_prompt(payload: RoiPayload)` to `ai_prompts.py`. Output sections (forced via JSON schema):

```
SECTION 1 — VERDICT
  one line. Quotes plant_status_verdict.

SECTION 2 — MONEY
  • Today running cost: <projected_today_omr> OMR  (range p10–p90)
  • PF penalty this month: <pf_penalty_omr> OMR
  • Yield drift today: <yield_drift_omr> OMR
  • Hercules saved this month: <savings_this_month_omr> OMR

SECTION 3 — TOP 3 ACTIONS  (the levers list, never invented)
  1. <lever[0].headline> — <lever[0].omr_per_month> OMR/month
     ↳ <lever[0].evidence>
  2. ...
  3. ...

SECTION 4 — WATCH
  • <forecast[0]> — at risk if <eta>
  • <anomaly[0]> — <since>
```

**Strict rule** in the prompt: `Every OMR number you write MUST appear verbatim in the input payload. You may not compute, estimate, or extrapolate values.` Enforced by post-validation in `_validate_cfo_response()` — if any OMR figure in the output doesn't match a payload key, regenerate once or fall back to a deterministic template.

### 6.3 Top-3 ROI Actions — the convince card

Computed in `backend/ai_money/levers.py`. Six lever generators, ranked by `omr_per_month`, top 3 surfaced.

| Lever | Trigger condition | OMR estimate |
|---|---|---|
| **L1 — Install capacitor on `<asset>`** | PF avg < 0.85 last 30d | this month's penalty × 12 − bank cost amortised |
| **L2 — Investigate yield drift on Mill B** | flour_pct drift > 1% × 7d | drift_omr × 30 |
| **L3 — Shift `<load>` to off-peak** | asset has flexible boolean tag (e.g. `mil_b_dampening_on`) and runs in peak hours | (peak_rate − offpeak_rate) × kWh shifted × 30 |
| **L4 — Repair stuck totalizer on `<tag>`** | F1 fired in last 7d | hidden_production_at_risk_omr |
| **L5 — Voltage rebalance on `<asset>`** | imbalance > 2% sustained 7d | de-rate_kwh × 30 + bearing replacement risk |
| **L6 — Reduce idle running** | `*_apparent_power > 30% nominal` while order_active=FALSE | idle_kwh × tariff × 30 |

Each lever object:
```python
{
    'id': 'L1', 'rank': 1, 'asset': 'C32',
    'headline': 'Install 92 kvar capacitor bank on C32',
    'omr_per_month': 142.4,
    'omr_per_year': 1709,
    'one_time_cost_omr': 1100,
    'payback_months': 7.7,
    'confidence_pct': 80,
    'evidence': 'PF averaged 0.74 over Mar 24–Apr 23. Penalty 142 OMR/month.',
    'evidence_link': '/insights/c32?metric=pf'
}
```

### 6.4 Distribution emails inherit the same payload

`backend/distribution_engine.py:_generate_ai_summary()` currently builds its own structured data. Replace with `payload_builder.build(report_ids, period)` → `build_cfo_briefing_prompt(payload)` → LLM call. Email body shows:

1. Verdict.
2. Money block (always).
3. Top-3 Actions.
4. Watch list.
5. Footer ribbon: `Hercules saved you X OMR this month.`

PDF/email charts (already generated in `ai_chart_generator.py` per Phase 2 plan): replace one chart slot with a stacked OMR-by-asset bar over the period. Delivers the savings number visually.

### 6.5 Frontend wiring

**New components** in `Frontend/src/Pages/HerculesAI/components/`:

| Component | Responsibility |
|---|---|
| `SavingsRibbon.tsx` | Top-of-page money-saved-this-month card |
| `PacingRing.tsx` | Phase B1 pace ring per asset |
| `BillProjectionCard.tsx` | Phase B2 |
| `PfPenaltyCard.tsx` | Phase A2 |
| `SecCard.tsx` | Phase A1 |
| `Top3LeversPanel.tsx` | Phase C — the close |
| `LeverDetailDrawer.tsx` | Lever click-through with evidence + payback math |

`HerculesAISetup.jsx` becomes a small page: status hero (existing) + savings ribbon + asset grid (each asset gets PacingRing + SecCard + PfPenaltyCard + BillProjectionCard) + Top3LeversPanel. Old prose blocks are deleted.

`schemas.ts` extended with `RoiPayload` matching the backend dataclass.

### 6.6 Phase C acceptance

- Email distribution sends a CFO-mode briefing where every OMR figure traces to the payload.
- The Top-3 Actions panel ranks levers by OMR/month and links each to evidence.
- Toggling LM Studio (local) vs Claude (cloud) does not change the OMR figures — only the narration tone.
- A user can audit: click any savings entry → opens a panel showing the underlying tag, window, calculation, and an "I disputed this" button that downgrades confidence.

**Effort: ~5 working days.**

---

## 7. File matrix

### New files

| File | Owner | Lines | Notes |
|---|---|---|---|
| `backend/ai_money/__init__.py` | Phase A | 5 | exports |
| `backend/ai_money/sec.py` | Phase A | ~120 | SEC math + view refresher |
| `backend/ai_money/pf_penalty.py` | Phase A | ~150 | depends on `electricity_tariffs` from Plan 2 |
| `backend/ai_money/cost.py` | Phase A | ~100 | hourly OMR helpers |
| `backend/ai_money/revenue.py` | Phase A | ~60 | production × value_per_ton |
| `backend/ai_money/savings_ledger.py` | Phase A | ~180 | rules engine + ledger writes |
| `backend/ai_money/payload_builder.py` | Phase C | ~200 | builds typed `RoiPayload` |
| `backend/ai_money/levers.py` | Phase C | ~200 | lever generators L1–L6 |
| `backend/ai_money/tests/*` | A+C | ~400 total | pytest |
| `backend/ai_forecast/__init__.py` | Phase B | 5 | |
| `backend/ai_forecast/shift_pace.py` | Phase B | ~100 | |
| `backend/ai_forecast/daily_bill.py` | Phase B | ~120 | |
| `backend/ai_forecast/baseline_24h.py` | Phase B | ~150 | numpy-only Holt-Winters |
| `backend/ai_forecast/trend_slope.py` | Phase B | ~80 | |
| `backend/ai_forecast/stuck_detector.py` | Phase B | ~70 | promoted from F1 |
| `backend/ai_forecast/tests/*` | Phase B | ~300 total | |
| `backend/migrations/create_asset_sec_hourly.sql` | A | small | |
| `backend/migrations/create_asset_yield_hourly.sql` | A | small | |
| `backend/migrations/create_ai_savings_ledger.sql` | A | small | |
| `backend/migrations/add_asset_columns_to_profiles.sql` | A | small | adds `parent_asset`, `is_energy_meter`, `is_production_counter` |
| `backend/migrations/add_shift_targets_to_config.sql` | B | small | seed `shift_target_kg` rows |
| `Frontend/src/Pages/HerculesAI/components/SavingsRibbon.tsx` | C | ~120 | |
| `Frontend/src/Pages/HerculesAI/components/PacingRing.tsx` | B | ~150 | |
| `Frontend/src/Pages/HerculesAI/components/BillProjectionCard.tsx` | B | ~120 | |
| `Frontend/src/Pages/HerculesAI/components/PfPenaltyCard.tsx` | A | ~120 | |
| `Frontend/src/Pages/HerculesAI/components/SecCard.tsx` | A | ~120 | |
| `Frontend/src/Pages/HerculesAI/components/Top3LeversPanel.tsx` | C | ~180 | |
| `Frontend/src/Pages/HerculesAI/components/LeverDetailDrawer.tsx` | C | ~200 | |
| `docs/AI/ROI_Method.md` | C | ~300 | the audit doc — every formula spelled out |

### Modified files

| File | Change |
|---|---|
| `backend/hercules_ai_bp.py` | New endpoints: `/sec`, `/pf-status`, `/shift-pace`, `/daily-bill-projection`, `/savings`, `/levers`, `/roi-payload`. Existing endpoints unchanged. |
| `backend/ai_prompts.py` | Add `build_cfo_briefing_prompt`, `RoiPayload` dataclass, JSON schema, post-validator |
| `backend/ai_provider.py` | No change to provider abstraction; `max_tokens` raised to 1200 for CFO mode |
| `backend/distribution_engine.py` | `_generate_ai_summary()` switches to CFO prompt + payload |
| `backend/workers/dynamic_archive_worker.py` | Hourly SEC view materialisation + savings ledger sweep |
| `backend/hercules.spec` | Add `ai_money.*`, `ai_forecast.*` to hiddenimports |
| `backend/requirements.txt` | none new; numpy already present |
| `backend/requirements-railway.txt` | mirror |
| `backend/init_db.py` | Append new migrations to `MIGRATION_ORDER` |
| `backend/app.py` | Append new migrations to `_run_startup_migrations` |
| `desktop/main.js` | Append new migrations to `migrationOrder` |
| `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx` | Replace body with the new layout described in §6.5 |
| `Frontend/src/Pages/HerculesAI/BriefingView.tsx` | Add ROI props; gate Top-3 panel behind `payload.levers.length > 0` |
| `Frontend/src/Pages/HerculesAI/schemas.ts` | Add `RoiPayload`, `Lever`, `ShiftPace`, etc. |
| `Frontend/src/API/herculesAIApi.js` | Add `getSec`, `getPfStatus`, `getShiftPace`, `getBillProjection`, `getSavings`, `getLevers`, `getRoiPayload` |
| `Frontend/src/i18n/en.json`, `ar.json`, `hi.json`, `ur.json` | All Phase A/B/C strings, plain language per CLAUDE.md rule #5 |
| `Frontend/src/Pages/Distribution/DistributionRuleEditor.jsx` | New `content_mode` value `cfo_briefing` (extends Phase 2 plan's mode list) |

---

## 8. Migrations & rollout

Migration order **append** (per CLAUDE.md "Adding New Features" §1, both `init_db.py` and `app.py:_run_startup_migrations` and `desktop/main.js:migrationOrder`):

```
... existing ...
add_asset_columns_to_profiles.sql
create_asset_sec_hourly.sql
create_asset_yield_hourly.sql
create_ai_savings_ledger.sql
add_shift_targets_to_config.sql
```

All migrations are idempotent (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Existing installs upgrade silently.

**Per-tenant data backfill.** A one-shot script `backend/tools/backfill_asset_sec_hourly.py` walks `tag_history_archive` from oldest to now and populates `asset_sec_hourly`. Runs on startup if table is empty AND archive has > 30 days. Logged, not blocking.

**Rollout to Salalah.**
- Phase A merges to `Salalah_Mill_B`. CI builds installer. Customer takes update on next OTA.
- Same for Phase B and C, two weeks apart.
- Each phase ships dark-launchable: `hercules_ai_config.roi_phase = 'A' | 'AB' | 'ABC'` toggle. UI hides the un-shipped surfaces. Default for Salalah on first deploy: `A`.

---

## 9. Acceptance criteria — global

A demo script run by Husam against the Salalah staging snapshot:

1. Open AI tab on a normal Wednesday. SavingsRibbon shows last-month attribution with non-zero OMR. Per-asset SEC, PF, BillProjection cards render.
2. Open at 14:00 on a production day. PacingRing shows projected end-of-shift. Click → drill to flour totalizer.
3. Force a PF dip in test data (cos_phi 0.91 → 0.78 over 14 days). Within one nightly worker run, an attention item appears with the projected threshold-cross date and a Top-3 lever for capacitor install.
4. Force a stuck `mil_b_b1_totalizer` while `mil_b_b1_scale = TRUE`. Within 10 min the stuck-detector fires; lever L4 appears.
5. Mark Friday-Saturday as non-production in `shifts_config.json`. Verify no anomaly, no Top-3 lever, no inflated SEC for that period.
6. Send a distribution email. Body shows verdict + Money + Top-3 + Watch + ledger ribbon. Every OMR figure quotable from the payload.
7. Switch from Claude to LM Studio. OMR figures unchanged. Narration tone may differ; numbers do not.
8. Audit: click any ledger entry → evidence opens → "Dispute" → confidence drops to 0% and total recomputes.

---

## 10. Risks and decisions

| Risk | Mitigation |
|---|---|
| **Tariff plan (Plan 2) not yet shipped** | This plan blocks on Plan 2's `electricity_tariffs` table. We will not hardcode rates. If Plan 2 lands after Phase A, OMR figures fall back to the existing `electricity_tariff_omr_per_kwh` flat rate with a banner: `Estimated using flat-rate tariff. Connect official APSR tariff for ±2% accuracy.` |
| **LLM hallucinating OMR** | Post-validator in `ai_prompts.py` rejects any OMR figure not present verbatim in the payload; falls back to deterministic template if regenerate fails. |
| **Savings ledger overclaims** | Default confidence 50% on auto-attribution. User must mark "actioned by Hercules" to lift to 100%. Disputes drop to 0%. Empty months show "Calibrating", never fabricated savings. |
| **Forecast width too tight on sparse data** | Confidence bands widen automatically with `sqrt(remaining_h)` and historical stddev. If stddev unavailable (< 7 days history), forecast is hidden, not displayed wide. |
| **Anomaly noise on weekends / shutdowns** | All R-rules from Plan 3 §"Noise reduction" enforced before any insert into `ml_anomaly_events`. |
| **Auditor / customer challenges OMR claim** | `docs/AI/ROI_Method.md` documents every formula. Each card and email line links to it. |
| **OTA can't ship Electron-shell changes** | This plan is backend + frontend dist only. No `main.js`, `splash.html`, `preload.js` changes. OTA-safe. |

---

## 11. Out of scope (deliberate)

- ML models requiring `prophet`, `scikit-learn`, etc. — Plan 3 covers F8+ when data depth allows.
- Multi-site federation. Single mill assumed.
- Tariff editor UI. That is Plan 2's surface.
- The chat assistant. That is Plan 4.
- Voice / mobile. Web only.

---

## 12. Settings panel — every "open question" is user-configurable in UI

None of the variables that change OMR figures live in code. They live in `hercules_ai_config` and are edited via a single new page **`/hercules-ai/settings`** (admin-only, alongside the existing AI Setup wizard). Defaults are conservative and citable; every override carries a help-tooltip + audit log.

| Setting | Default | UI control | Help text shown to user |
|---|---|---|---|
| `pf_target` | `0.90` (APSR upper bound — penalises sooner; safer to under-promise) | Slider 0.80–0.95 | "Below this power factor, your bill includes a penalty. Confirm with your APSR contract — Plan 2 docs the source." |
| `pf_penalty_rate_bz_per_kvarh` | per Plan 2 tariff table (when shipped) OR `4.0` baisa/kvarh fallback | Numeric input + currency tag | "Reactive-power surcharge from Nama Dhofar CRT 2025. Update yearly." |
| `capacitor_cost_omr_per_kvar` | `12` | Numeric | "Installed cost per kvar. Quoted by your electrical contractor." |
| `value_per_ton_flour` | from existing `production_value_per_ton` | Numeric, currency selector | "Wholesale flour price. Used for yield-drift OMR. Per grade if multi-grade." |
| `value_per_ton_bran` | `0.4 × flour value` | Numeric | "Bran value as fraction or absolute." |
| `value_per_ton_pasta` | new key, default `0` | Numeric | Hidden until pasta tags exist. |
| `shift_target_kg[asset][shift_id]` | none — empty until set | Table editor (per asset × per shift) | "Set a target so the pacing ring can show ETA. Skip and we show pace only." |
| `savings_ledger_confidence_default_pct` | `50` | Slider 0–100 | "How confident before crediting Hercules. 0 = only credit user-confirmed actions. 100 = credit auto-detected wins." |
| `savings_ledger_show_confidence_breakdown` | `true` | Toggle | "Show the audit panel under the Savings ribbon." |
| `cfo_digest_enabled` | `false` | Toggle + day picker + time picker | "Send a weekly CFO briefing email regardless of distribution rules." |
| `cfo_digest_recipients` | empty | Multi-email input | |
| `forecast_band_visible` | `true` | Toggle | "Show p10–p90 range on forecasts. Off = single line only." |
| `forecast_min_history_days` | `7` | Number | "Below this, forecasts are hidden. Defaults safe." |
| `equipment_on_voltage_threshold_v` | `0.7 × nominal` | Numeric | "Below this, asset is treated as OFF for all OMR/anomaly calcs." |
| `peak_hours` | `07:00–22:00` (Oman summer default per APSR) | Range pickers per season | "Used for off-peak load-shift recommendations." |
| `roi_phase` | `'A'` | Hidden in UI; admin-only via `?dev=true` | Dark-launch toggle for staged rollout. |

### Why every variable surfaces

A site manager unfamiliar with APSR has now seen this list once and never has to think about it again. A site manager who knows their tariff can override and the entire OMR engine recomputes. **Every page that displays OMR shows a small `(i)` icon → opens a side panel listing exactly which settings produced that figure.** That is the trust contract. No black box.

### Persistence

```sql
ALTER TABLE hercules_ai_config
  ADD COLUMN IF NOT EXISTS edit_history JSONB DEFAULT '[]';
```

Every change appends `{key, old_value, new_value, edited_by_user_id, edited_at}`. Unbounded but capped at last 50 per key in code. Surfaces an "Edit history" link on each setting row. Compliance-friendly.

### One-shot prompt at first run

When a customer opens the AI tab for the first time post-upgrade, an Onboarding modal walks through the 6 highest-impact settings (PF target, capacitor cost, value per ton, shift targets) in 60 seconds. Skip = uses defaults. Banner stays at top of AI tab until "Confirmed defaults" is clicked, so we never silently calculate OMR off a default the user hasn't seen.

---

## 13. Model accuracy and trust — the auditable layer

A claim of "Hercules saved you 2,140 OMR" is only useful if it is defensible. Every forecast and every anomaly has a measured accuracy that is visible to the user and that gates whether we display the prediction at all.

### 13.1 Accuracy table — log every prediction vs actuals

```sql
CREATE TABLE model_accuracy_log (
    id              BIGSERIAL PRIMARY KEY,
    feature         VARCHAR(32) NOT NULL,        -- 'shift_pace' | 'daily_bill' | 'pf_trend' | 'yield_drift' | 'sec_forecast'
    asset_name      VARCHAR(64),
    predicted_at    TIMESTAMP NOT NULL,           -- when the forecast was made
    horizon_minutes INT NOT NULL,                 -- how far ahead it predicted
    target_at       TIMESTAMP NOT NULL,           -- when it should be compared to truth
    predicted_value NUMERIC(14,4) NOT NULL,
    predicted_p10   NUMERIC(14,4),
    predicted_p90   NUMERIC(14,4),
    actual_value    NUMERIC(14,4),                -- filled in by closing worker
    abs_error       NUMERIC(14,4),
    pct_error       NUMERIC(8,4),
    band_hit        BOOLEAN,                      -- did actual fall in [p10, p90]?
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_accuracy_feature_asset ON model_accuracy_log(feature, asset_name, target_at DESC);
```

Each forecast endpoint inserts a row at predict-time with `actual_value = NULL`. A nightly closing worker (`backend/ai_forecast/accuracy_closer.py`) walks pending rows whose `target_at < now`, fills in actuals from `tag_history_archive`, computes `abs_error`, `pct_error`, `band_hit`. Cheap; runs in seconds.

### 13.2 Per-feature accuracy contracts

Each forecast feature commits to a measured target. If the trailing 30-day MAPE breaches the upper bound, the feature **auto-disables** and the UI explains:

| Feature | Target MAPE | Disable threshold | Calibration window |
|---|---|---|---|
| Shift Pace (totalizer end-of-shift) | ≤ 8% | > 15% | Last 30 shifts |
| Daily Bill OMR | ≤ 6% | > 12% | Last 14 days |
| PF Trend slope | p-value < 0.05 | p ≥ 0.10 | Last 14 days regression |
| Yield Drift OMR/shift | ≤ 10% | > 20% | Last 21 shifts |
| SEC 24h forecast | ≤ 12% | > 25% | Last 30 days |

Calibration window is the rolling backtest window, computed nightly. Disable threshold is a hard gate, not a suggestion: when breached, the related UI card switches to a "Calibrating" state showing the current MAPE and the data-depth needed to recover.

### 13.3 Honest display rules

| Trailing MAPE | UI badge | Behaviour |
|---|---|---|
| < target | green dot, hover shows MAPE | Forecast displayed normally with band |
| target → 1.5× target | amber dot | Forecast displayed; band widened by `× 1.5` for honesty |
| 1.5× target → disable threshold | red dot | Forecast displayed; band widened `× 2`; verdict text downgraded ("trending up" not "will be 310 OMR") |
| > disable threshold | grey "Calibrating" | Card collapses; shows current MAPE + days-to-recover |

This is the rule that keeps the AI from over-claiming. We measured it; we show what we measured.

### 13.4 Anomaly precision feedback loop

Every anomaly fired into `ml_anomaly_events` shows an inline "Was this useful?" with two buttons: ✅ Useful / ❌ Noise. User feedback is logged to `ml_anomaly_feedback`:

```sql
CREATE TABLE ml_anomaly_feedback (
    id              BIGSERIAL PRIMARY KEY,
    anomaly_id      BIGINT REFERENCES ml_anomaly_events(id) ON DELETE CASCADE,
    user_id         INT,
    label           VARCHAR(8) NOT NULL,         -- 'useful' | 'noise'
    note            TEXT,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

Nightly aggregator computes precision per detector: `useful / (useful + noise)`. If a detector falls below 70% precision over 30 events, it auto-tightens its threshold by one step (e.g. PF cliff Δ from 0.10 → 0.12). Logged + visible on the Model Health page so a returning user sees: *"PF cliff detector tightened on 2026-04-22 after 3 false positives."*

### 13.5 Model Health page

New route `/hercules-ai/model-health` (in addition to Plan 3's `/app-settings/ml-models`). User-facing. Shows:

- Per-feature MAPE chart (28-day rolling) with target line.
- Per-detector precision chart (30-event rolling).
- Last 10 forecast misses with click-through to the actual time series.
- A single composite **"Trust Score"** 0–100, weighted: 50% forecast MAPE conformance, 30% anomaly precision, 20% savings ledger dispute rate (low disputes = high trust).

The Trust Score appears in the footer of every email and the corner of the AI tab. It moves slowly. If it drops below 70, a banner appears: *"Hercules accuracy is below target on this site — recommend reviewing tag profile linkage."* with a one-click jump to the AI Setup wizard.

### 13.6 Backtest harness for releases

Before merging a Phase A/B/C change, run `backend/tools/backtest_roi.py` against a frozen Salalah snapshot (last 90 days). It replays every forecast feature against ground truth and produces a Markdown report with MAPE deltas vs main. CI gate: any feature regressing more than 2 percentage points in MAPE blocks the PR. This is the same discipline already practiced by Plan 3's nightly worker, lifted into the merge gate.

### 13.7 What we never claim

- Never an OMR figure with no underlying tag delta.
- Never a forecast without a band (or the disabled state).
- Never a savings entry without an evidence object pointing to the (tag, window, calculation).
- Never a confidence rounded up — always rounded down.
- The Trust Score is the only place where one number summarises everything; even it is reported with the formula visible on hover.

---

## 14. UI/UX design spec — genius, attractive, honest, 3D-futuristic without the PhD

Brief from the owner: clients prefer **genius attractive visual, preferably something 3D futuristic while still being accurate and on point**. The plan honours that with depth, motion and one premium illustration — and refuses any of these traps: scifi fonts, neon glow on everything, charts as decoration, dashboards that need a manual.

### 14.1 Five non-negotiable design rules

1. **One verdict in five seconds.** Plant manager opens tab → forms a pass/fail judgement before the second card finishes animating in.
2. **Every number has four parts: value, unit, delta, baseline.** No exceptions. Delta is a coloured pill, never an arrow alone.
3. **Money is the headline.** OMR figures use the largest type and the only gold-coloured surface on the page. Everything else is subordinate.
4. **No technical vocabulary on screen.** No "EWMA", "p10/p90", "MAPE", "z-score", "Holt-Winters", "IsolationForest". The math is in the audit panel; the surface is plain English.
5. **Motion is causal, never decorative.** A number animates because data changed, not on every page render. A card lifts on hover because it is clickable, not for show.

### 14.2 Visual language (the design tokens)

Add to `Frontend/src/Pages/HerculesAI/tokens.css`:

```css
:root {
  /* Surface depth — three layers, no more */
  --hai-bg:           #0a0e1a;             /* page */
  --hai-glass-1:      rgba(255,255,255,0.04); /* card */
  --hai-glass-2:      rgba(255,255,255,0.07); /* hovered card / drawer */
  --hai-border:       rgba(255,255,255,0.10);
  --hai-highlight:    rgba(255,255,255,0.18); /* 1px inset on top of glass */
  --hai-shadow-deep:  0 24px 48px -12px rgba(0,0,0,0.55);
  --hai-shadow-rest:  0 8px 16px  -8px rgba(0,0,0,0.40);

  /* Semantic accents — used very sparingly */
  --hai-money:        #f0b54f;             /* the only gold; reserved for OMR figures */
  --hai-money-glow:   rgba(240,181,79,0.22);
  --hai-good:         #34d399;
  --hai-warn:         #fbbf24;
  --hai-crit:         #f87171;
  --hai-future:       #8b9ff7;             /* forecasts, predictions */

  /* Typography ratios — the 5× hero rule */
  --hai-display:      clamp(56px, 6vw, 80px);  /* hero numbers */
  --hai-title:        24px;
  --hai-body:         13px;
  --hai-label:        11px;                /* uppercase, tracked */
  --hai-mono:         "JetBrains Mono", monospace;

  /* Motion — durations and curves */
  --hai-dur-fast:     180ms;
  --hai-dur-base:     420ms;
  --hai-dur-slow:     820ms;
  --hai-ease-out:     cubic-bezier(.22,1,.36,1);    /* easeOutQuart */
  --hai-ease-spring:  cubic-bezier(.34,1.56,.64,1); /* small overshoot */
}
```

Light mode is supported by inverting `--hai-bg` to `#f6f7fb` and dimming glass opacity; the page is dark-first because dark surfaces make gold OMR figures feel premium.

### 14.3 The 3D-futuristic vocabulary — done responsibly

Three depth devices. Each appears once. No more.

**1. Glass panels with single inset highlight.** Every card is glass `--hai-glass-1`, 1px border `--hai-border`, and a 1px `--hai-highlight` inset on the top edge only. No bevels, no neon outlines. CSS:

```css
.hai-card {
  background: var(--hai-glass-1);
  border: 1px solid var(--hai-border);
  border-radius: 18px;
  box-shadow: var(--hai-shadow-rest), inset 0 1px 0 var(--hai-highlight);
  backdrop-filter: blur(14px);
}
.hai-card:hover {
  background: var(--hai-glass-2);
  box-shadow: var(--hai-shadow-deep), inset 0 1px 0 var(--hai-highlight);
  transform: translateY(-2px);
  transition: transform var(--hai-dur-base) var(--hai-ease-out);
}
```

**2. The hero motif (the one premium 3D moment).** Top-left of the SavingsRibbon: a single Three.js canvas rendering a slowly rotating low-poly object — a stylised stack of Omani rial coins, OR a translucent crystal lattice (vote at design review). Lit by two soft directional lights, gold material with subtle Fresnel, rotates 360° over 30s, paused when off-screen via IntersectionObserver. Loaded lazily (chunk split). **One** Three.js component, ~200 lines, ~80 KB gzipped after tree-shake. Replaceable with a Lottie JSON if perf budget tightens.

**3. Pacing Ring with conic-gradient depth.** The PacingRing for each asset is an SVG ring drawn with `<defs><conicGradient/>` (or `radialGradient` fallback) so the stroke has a perceptible direction-of-travel. Drop shadow underneath the ring. Center text uses the `--hai-display` size. Stroke animates `stroke-dashoffset` from full to target over 820ms `--hai-ease-out`. When the asset crosses target, ring flashes gold for 200ms then settles. Pure CSS+SVG — no canvas, no library.

What we explicitly do NOT use:
- WebGL backgrounds, particle fields, animated meshes outside the hero motif.
- Glass-on-glass-on-glass (only two depth layers exist).
- Neon glow on text. Glow is reserved for the Money chip and never animates.
- Scifi fonts. Inter for everything; mono only for raw values where alignment matters.
- Drop-shadow on text. Ever.

### 14.4 Hierarchy — what fills the AI tab

Six bands, top to bottom. Total scroll length on a 1080p display: ~1.4 viewports.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ① SAVINGS RIBBON                                                     │ 96px
│   [hero motif]  Hercules saved you  [2,140] OMR  this month          │
│                                     ↑ 31% vs last month              │
│   sub-line:  PF correction +480 · Yield +940 · Off-peak +720         │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ ② STATUS HERO  (existing, compact)                                    │ 72px
│   Plant running within targets · Mill B 91 t/h · 4 of 5 lines on    │
│   freshness 2 min ago · trust 87/100                                 │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ ③ ASSET GRID (3 columns desktop / 1 column mobile)                    │ scrolls
│  ┌─MILL B─────────┐ ┌─C32 MILL──────┐ ┌─PASTA 1───────┐             │
│  │ Pacing Ring    │ │ PF gauge      │ │ Pacing Ring   │             │
│  │ SEC card       │ │ SEC card      │ │ Throughput    │             │
│  │ Bill projection│ │ Bill projectn │ │ ...           │             │
│  └────────────────┘ └───────────────┘ └───────────────┘             │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ ④ TOP-3 ROI ACTIONS                                                  │ 280px
│  ┌─L1─Capacitor──┐ ┌─L2─Yield Drift┐ ┌─L3─Off-peak Shift┐            │
│  │ 142 OMR/mo    │ │ 940 OMR/shift │ │  72 OMR/mo        │           │
│  │ Pay back 7.7m │ │ Investigate   │ │  Schedule         │           │
│  └───────────────┘ └───────────────┘ └───────────────────┘           │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ ⑤ WATCH                                                              │ 120px
│   • C32 PF trending to 0.85 in 9 days                                │
│   • Mill B yield drift -1.4% sustained 6h                            │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ ⑥ FOOTER                                                             │ 48px
│   Trust 87/100 · 142 tags analysed · Claude Sonnet 4.6 · v1.0.x      │
└──────────────────────────────────────────────────────────────────────┘
```

Density limits, enforced in component code:
- SavingsRibbon: max **3** sub-attributions visible. Overflow → "+2 more" chip → drawer.
- Asset grid: max **6** asset cards. Overflow → horizontal scroll with snap.
- Top-3: literally three. Never four.
- Watch: max **3** items. Overflow → "+N more" → opens the existing AttentionCard list.

### 14.5 Component-level designs

**SavingsRibbon.tsx**
- 96 px tall, full bleed, gold-tinted glass: `linear-gradient(90deg, rgba(240,181,79,0.06), rgba(240,181,79,0.02))` over `--hai-glass-1`.
- Left: 64×64 Three.js hero motif slot. Right of it: title in `--hai-label` "Hercules saved you", value in `--hai-display` `--hai-money`, unit "OMR", time-window pill "this month".
- Below value: animated count-up tween, 1.2 s, easeOutQuart. Tween only fires when value changes ≥ 1 OMR (avoids jitter on small adjustments).
- Right side: three sub-attribution chips, color-coded, each clickable.
- Empty state: motif still rotates; value reads "Calibrating · keep using Hercules for 30 days"; no zero pretending to be insight.

**SecCard.tsx**
- 240×140 glass card. Hero number (e.g. `47.2`), unit `kWh/t`, delta pill (red `+10.3% vs 30-day baseline`).
- Sub-line: `Excess cost today: 87 OMR`. The `87 OMR` glows gold.
- Mini sparkline (14-day) at bottom, neutral grey, no axes, 28px tall.
- Hover: card lifts 2 px, sparkline reveals last-point dot with timestamp tooltip.

**PfPenaltyCard.tsx**
- Glass card with a vertical mercury-like gauge on the left (12 px wide × full card height). Gauge is a CSS gradient bar with a 1-px white line at `pf_target`. Animated fill from 0 to current PF on mount.
- Right: "C32 cos φ" label + value (0.74) + delta pill.
- Bottom strip: `Penalty this month: 142 OMR · Capacitor payback 7.7 months`. Click → LeverDetailDrawer pre-filled with L1.
- Background tint subtly red when below target, neutral when not. Tint is 4% opacity max — mood, not alarm.

**PacingRing.tsx**
- 220×220 SVG with conic-gradient stroke, drop shadow.
- Center: hero number = projected end-of-shift total + a tiny gap chip (`+0.3 t over target` in green, `−1.2 t under` in amber).
- Bottom of ring: sub-line "ETA target 21:14 · shift ends 22:00 (+46 min)".
- Confidence band visualised as a faint grey arc *behind* the gold arc — shows the p10–p90 range as a lighter sweep. Honest; not technical.
- States: on-track (gold), at-risk (amber outline pulse, 1× then stops), will-miss (red).

**BillProjectionCard.tsx**
- 320×140 glass card with a single horizontal candlestick-style bar:
  - Solid gold segment = OMR consumed so far.
  - Hatched gold segment = projected remaining (median).
  - Lighter gold halo around the projected segment = p10–p90 range.
- Below: numerals "184 / 310 OMR · range 295–328". Range is shown only when forecast has a green/amber accuracy badge; hidden in red/grey states.
- Tooltip on hover shows tariff hour-by-hour breakdown (data already in cost.py).

**Top3LeversPanel.tsx**
- Three side-by-side cards. Each card is the only place on the page where the gold money chip is *animated* — a soft pulse every 6 s to attract attention. Pulse uses `box-shadow` interpolation, not transform — does not move siblings.
- Each card: rank badge "L1", asset chip, headline (max 60 chars), OMR/month in `--hai-display` `--hai-money`, sub-line "Payback 7.7 months · Confidence 80%".
- Hover: rotateX(2deg) rotateY(±2deg) parallax tied to mouse position, subtle. Click → LeverDetailDrawer.
- If fewer than 3 levers exist, missing slots fill with a neutral "No lever ranked above 25 OMR/month — plant is well-tuned" card. Honesty over false completeness.

**LeverDetailDrawer.tsx**
- Right-side drawer, 480 px wide, opens with translateX 460ms `--hai-ease-out`.
- Top: lever headline + OMR per month + payback math (one paragraph in plain English).
- Middle: evidence — the underlying chart of the relevant tag over the relevant window, with the threshold overlaid. This is the only chart on the AI tab outside drill-throughs.
- Bottom: two buttons: **Mark as Actioned** (writes `actioned_at` to ledger, lifts confidence to 100%), **Dispute this estimate** (logs feedback, drops confidence to 0 unless user re-attributes). No "Dismiss" — dismissing without feedback is forbidden.

**Settings page (§12) — "ROI Settings"**
- Two columns: form on left (grouped accordions: Tariff & PF, Production Value, Shift Targets, Anomaly Sensitivity, CFO Digest), live preview on right showing how the current OMR figures change as the user edits a value. Live preview is the killer feature here — user moves the PF target slider from 0.85 to 0.90 and watches the penalty number jump in real time, against simulated history.

### 14.6 Motion language

| Event | Animation | Duration | Curve |
|---|---|---|---|
| Number increases by ≥ 1 unit | Count-up tween from previous value | 1.2 s | easeOutQuart |
| Card mounts | Fade-up 8 px, stagger 50 ms per sibling | base (420 ms) | ease-out |
| Ring fills | stroke-dashoffset full → target | slow (820 ms) | ease-out |
| Hover-elevate card | translateY −2 px + shadow swap | fast (180 ms) | ease-out |
| Lever pulse | box-shadow opacity 0 → 0.22 → 0 | 1.4 s, every 6 s | ease-in-out |
| Drawer in | translateX 100% → 0 + fade | base | ease-out |
| Drawer out | translateX 0 → 100% + fade | fast | ease-in |
| Forecast disable transition | card collapses height to 64 px, content cross-fades to "Calibrating" | base | ease-in-out |

Reduced-motion: respect `prefers-reduced-motion: reduce`. All entrance animations switch to instant; only the savings count-up is preserved (drops to a 280 ms fade between values). Hero motif autoplay turns off.

### 14.7 Accessibility (built-in, not bolted on)

- All glass panels carry `role="region"` with an `aria-labelledby` to the card title.
- Hero numbers use `<span aria-label="Two thousand one hundred forty Omani Rial">` to keep screen readers from spelling digits.
- Keyboard: every card focusable, drawer reachable by Enter/Space, Escape closes drawer, Arrow keys scroll asset grid.
- Colour contrast: gold on dark glass tested at WCAG AA for the body text; the hero `--hai-display` numbers are tested at AAA.
- Arabic + Urdu RTL: the asset grid mirrors; the savings ribbon mirrors except the hero motif (motif stays on visual leading edge — tested with rtl on/off in `useRtl.ts`).
- All four i18n keys defined together (en, ar, hi, ur) per CLAUDE.md rule §i18n.

### 14.8 Performance budget

| Metric | Target | Mechanism |
|---|---|---|
| Initial bundle for AI tab | ≤ 220 KB gzipped | Three.js hero motif lazy-loaded; framer-motion via dynamic import |
| Time-to-first-meaningful-paint | ≤ 1.0 s on Salalah office laptop (i5-8th, 8 GB) | Server-rendered initial OMR figures via existing `/roi-payload` SSR-friendly endpoint |
| Animation frame budget | 60 fps sustained | Hero motif paused off-screen; pacing rings use CSS transforms; no JS-driven layout in animations |
| Background CPU when tab idle | < 1% | All polling 30 s + visibility API to suspend on hidden tab |

Add a Lighthouse run to CI for `/hercules-ai` route; gate at performance ≥ 90.

### 14.9 The mood board, in words

Aim for the visual register where these three live:
- **Apple Vision Pro UI** — depth via translucent layers, no neon, content-first.
- **Stripe Climate dashboard** — financial-tier polish, single accent, gold reserved for money.
- **Linear** — information density without clutter, motion as causal feedback only.

Avoid:
- The "industrial HMI" trap (skeuomorphic gauges everywhere).
- The "AI-startup" trap (purple gradients, particles, scifi).
- The "consultant deck" trap (pie charts, traffic-light tables, dense paragraphs).

The point is not to look futuristic. The point is to look **trustworthy and inevitable**. 3D and motion are the tools, not the goal.

---

## 14.10 Design system — locked picks (cross-reference)

The full design system is persisted in `design-system/hercules-roi-genius/`:
- `MASTER.md` — palette, typography, motion, component patterns, performance + accessibility contracts.
- `pages/hercules-ai-roi.md` — page-specific Bento composition and component overrides.

Picked via `ui-ux-pro-max` skill searches across style, color, typography, chart and ux domains. Headline picks (the auto-generated baseline was overridden — provenance table in MASTER.md §10):

| Decision | Locked choice | Source |
|---|---|---|
| **Style** | Glassmorphism + Dimensional Layering on Dark Mode (OLED) | style domain — Glassmorphism (Result 2), Spatial UI (Result 3), Dimensional Layering (Result 7), Dark Mode (Result 4) |
| **Layout pattern** | Bento Grid Showcase | landing domain |
| **Palette** | Banking/Traditional Finance: navy `#0F172A` + premium gold `#CA8A04` + restrained semantics | color domain (Result 3) — "Trust navy + premium gold" |
| **Display font** | Satoshi (DM Sans fallback) — Premium Sans pairing | typography domain (Result 1) |
| **Body font** | IBM Plex Sans — Financial Trust pairing | typography domain (Result 2) — "Excellent for data" |
| **Mono font** | JetBrains Mono — Developer Mono pairing | typography domain (Result 6) |
| **Forecast chart type** | Line with Confidence Band | chart domain (Result 3 — Time-Series Forecast) |
| **Real-time chart type** | Streaming Area Chart with smoothed D3 | chart domain (Result 1) |
| **Trend chart type** | Line Chart with hover+zoom (Recharts) | chart domain (Result 2) |
| **Z-index scale** | `10/20/30/40/50` only | ux domain — Z-Index Management |
| **Animation budget** | Max 2 animated elements per view at idle, transform/opacity only, ease-out enter / ease-in exit | ux domain — Excessive Motion, Transform Performance, Easing Functions |
| **Reduced-motion** | Mandatory `@media (prefers-reduced-motion: reduce)` honor | ux domain (severity HIGH) |
| **React perf** | `React.memo` only on expensive children (MetricCard); not on parents | react stack |

The "anti-PhD" rules — five-second verdict, four-part numbers, gold reserved for OMR, max two glass layers, max six KPIs per viewport, exactly three Top-3 cards always — are codified in MASTER.md §9 and gate PR review.

The hero motif (Three.js translucent crystal lattice vs rotating coin stack) is the only outstanding creative choice and is deferred to Phase C kickoff. Phase A ships without it (Lottie placeholder or static SVG); Phase A still delivers ~80% of the wow because the Bento glass + count-up tween + pacing ring are the primary delight surfaces.

---

## 15. Open questions — RESOLVED via dual review

Both `plan-eng-review` and `plan-design-review` agreed on all three. Locked:

1. **Hero motif → Lottie animated coin-stack for Phase A.** Three.js deferred to Phase C with explicit ship-or-cut decision. Reasoning: at 80×80 a Three.js scene reads no different from Lottie but costs ~80 KB more bundle; Phase A's wow is already delivered by glass + count-up + pacing ring. Lottie minimum size **160×160** so it actually registers.
2. **Phase order → Money → Crystal Ball → Narrator (unchanged).** "Predict before promising" sounds clever but the page that closes the sale is the savings figure. Forecasts without a money frame are abstract numbers; Money plants the flag, Phase B then quotes predictions in OMR.
3. **Trust Score → small in footer always; LARGE only when <70 AND admin role AND anchored to SavingsRibbon (not StatusHero).** Plant operator seeing "Trust 65/100" pre-shift is anxiety injection without recourse. Anchored to Ribbon because trust qualifies the money figure, not plant status.

---

## 16. Review fixes — applied to plan and design system

Outcome of dual review (eng + design). Items below are **locked**; the plan and design system files have been updated to match.

### 16.1 Architecture & data flow

| Issue | Fix | Source file |
|---|---|---|
| `distribution_engine._generate_ai_summary` rewrite would break legacy emails on OTA (CLAUDE.md Rule #2) | Function becomes a router on `distribution_rules.content_mode`: `markdown` (legacy, default for existing rules) / `cfo_briefing` (new). Existing rules unchanged on OTA. | §6.4, §7 |
| `assets` had no source of truth — Mill B could claim parent_asset but have no production counter, SEC silently empty | Add `assets_view` materialised view + `/api/hercules-ai/asset-health` endpoint that returns `{asset, has_energy_meter, has_production_counter, sec_available, missing_pairs[]}`. UI surfaces "Mill B: 1 energy meter, 0 production counters — link a tag" with one-click jump to AI Setup wizard. | §4.2 |
| `roi-payload` god endpoint duplicates `/sec`, `/pf-status`, `/shift-pace` calls | `roi-payload` is the public composed endpoint. Per-feature endpoints (`/sec`, `/pf-status`, etc.) are demoted to **drilldown-only** — used by tooltips, drawers, Model Health page, never by the main bento. UI hits `roi-payload` once and caches 30s. | §7 |

### 16.2 Schema corrections

| Issue | Fix |
|---|---|
| `model_accuracy_log` insert on every forecast = ~3M rows/month, no retention | Throttle: insert at most one row per (feature, asset) per 5 min. Add `created_at` index. Retention: 90-day rolling delete in nightly worker. |
| `model_accuracy_log` lacks `model_version` / `code_sha` | Add `code_sha VARCHAR(40)` column populated from `version.txt`. MAPE history segmented by sha so formula changes don't pollute history. |
| `asset_sec_hourly` missing `(hour_start)` index for sweep | Add `CREATE INDEX idx_sec_hourly_time ON asset_sec_hourly(hour_start DESC)` |
| `ai_savings_ledger.confidence_pct INT` violates "always rounded down" contract | Add `CHECK (confidence_pct BETWEEN 0 AND 100)` and round-down in code. INT stays. |
| `ai_savings_ledger.evidence_json` references tag_history that may be archived | Snapshot the underlying values into `evidence_json` at write-time (not refs). Audit drilldown then works even after archive purge. |
| `hercules_ai_config.edit_history JSONB` cap-in-code only | Add a row-level trigger that prunes `edit_history` to last 50 entries on each UPDATE — DB-enforced, not relying on application code. |

### 16.3 Migration & rollout

| Issue | Fix |
|---|---|
| §8 said "append" — never spelled the literal lines | Add §8.1 with exact migration order, copy-pasted across `init_db.py:MIGRATION_ORDER`, `app.py:_run_startup_migrations`, `desktop/main.js:migrationOrder`. Order: `add_asset_columns_to_profiles.sql` → `create_asset_sec_hourly.sql` → `create_asset_yield_hourly.sql` → `create_ai_savings_ledger.sql` → `create_model_accuracy_log.sql` → `create_ml_anomaly_feedback.sql` → `add_shift_targets_to_config.sql`. |
| `backfill_asset_sec_hourly.py` "runs on startup" — would block Electron splash (15s timeout) | Move backfill to a one-shot worker spawned by `dynamic_archive_worker` post-boot. Logged, never blocks `_run_startup_migrations`. CLI flag `--backfill-now` for manual trigger. |
| `roi_phase` set to `A` once and never auto-progresses | Tie `roi_phase` to backend version constant `BACKEND_PHASE` in `version.txt`. OTA bump → toggle progresses. Manual override still possible via Settings page. |

### 16.4 LLM + email path

| Issue | Fix |
|---|---|
| CFO prompt validator regex undefined; misses "OMR 142", "142 OMR/year" formatting | LLM returns **strict JSON** (no prose), schema-validated. Validator checks `omr_*` keys against payload (numeric tolerance ±0.5 OMR). Prose is built deterministically from JSON in the React layer. |
| Deterministic fallback template (when LLM fails twice) wasn't budgeted | Add `backend/ai_prompts/cfo_fallback_template.py` (~80 lines) — Verdict + Money + Top-3 + Watch from payload only. Listed in §7 file matrix. |
| Email format change risks customer churn at OTA time | Distribution rules retain `content_mode='markdown'` until owner explicitly switches to `cfo_briefing`. Onboarding modal (§12) prompts the switch. |

### 16.5 Forecast & accuracy contracts

| Issue | Fix |
|---|---|
| MAPE targets aspirational; Salalah may not have 30 clean shifts on day 1 | Add **warm-up disable** state: forecast hidden for first 14 calendar days *or* until `min_clean_shifts >= 14`, whichever comes later. Independent of MAPE. |
| Each forecaster's R-rule chain unspecified | §13.2 table extended with a "R-rules applied" column per feature. Locked: `shift_pace` runs R1+R3+R4; `daily_bill` runs R3+R4+R8; `pf_trend` runs R5+R6; `yield_drift` runs R3+R4+R5. |
| Anomaly precision feedback loop creates "feedback fatigue" failure mode (no clicks → undefined precision → no auto-tighten) | Define neutral state: `feedback_count < 10` over 30 days → no auto-action, log "insufficient feedback for tuning". Surfaced in Model Health. |
| Trust Score rendered "Calibrating" when components missing — but plan defaulted to weighted-50 | Trust Score is **null** until all 3 components have ≥7 days of data. UI shows "Calibrating · X/21 days". Never silent default. |

### 16.6 Performance & bundle

| Issue | Fix |
|---|---|
| Recharts (~80 KB) in critical path violates 220 KB target | `react-sparklines` (~10 KB) replaces Recharts for SecCard sparkline (above-fold). Recharts AreaChart imported lazily inside `LeverDetailDrawer` (drawer code-split). BillProjectionCard uses pure SVG band (no Recharts). |
| Three.js retained in §14.3 despite Phase-C deferral | Removed from Phase A bundle entirely. Replaced with Lottie (~25 KB). Re-added in Phase C only if owner approves crystal-or-coin choice. |

### 16.7 Visual hierarchy & motion (design fixes)

| Issue | Fix |
|---|---|
| Two competing heroes — SavingsRibbon (Band 1) AND StatusHero (Band 2) both full-width verdicts | **Collapse StatusHero into the SavingsRibbon as a 16 px sub-line** ("Plant within targets · Mill B 91 t/h · 4 of 5 lines on"). Ribbon becomes the only verdict. Free up Band 2. |
| Six asset cards × four metrics = 24 numbers per viewport | **Pull BillProjectionCard out of asset cards**. Single plant-wide bill projection moves to a new Band 5: "Today's bill: 1,840 OMR (range 1,700–1,950)". Six charts → one chart. Asset cards now show: PacingRing + SECCard + PfPenaltyCard (3 metrics, not 4). |
| Top3LeversPanel pulses on 3 cards + ring fill + count-up + motif rotate = 4+ animated elements at idle (budget = 2) | **Pulse only the rank-1 lever.** L2/L3 static at idle. Hover still elevates all three. |
| Hover parallax tilt on lever cards (rotateX/rotateY tied to mouse) is a third depth language | **Drop the parallax tilt entirely.** Glass `translateY(-2px)` + shadow swap is the depth signal. |
| Two PF visualisations in two languages — existing `PowerFactorGauge` (120° arc) AND new `PfPenaltyCard.mercury_gauge` | **One gauge.** Reuse existing `PowerFactorGauge` inside `PfPenaltyCard`. Drop the mercury-gauge spec. |
| Typography conflict — Plan 1 already ships **Inter Tight**; Plan 5 introduced Satoshi + IBM Plex | **Inter Tight wins.** Drop Satoshi from the design system. Keep Inter Tight (display + body) + JetBrains Mono (raw values). One font file, already loaded, proven at distance. |
| `--hai-trust` (`#1E3A8A` navy) chips invisible on `#0F172A` page bg | Replaced with `--hai-future` (`#8B5CF6`) for evidence/sub-action chips. `--hai-trust` token retired. |
| Gold focus ring (`--hai-money`) invisible on cards containing gold OMR | Focus ring switched to `outline: 2px solid rgba(255,255,255,0.6)`. Gold reserved exclusively for OMR figures. |
| Settings page "live preview" with simulated history is a what-if simulator (own feature) | **Cut for Phase A.** Settings page ships static — values save and the page reloads computed OMR. Live preview revisited in Phase C if owner asks. |
| Model Health page (§13.5) is compliance artifact; plant managers won't open | **Phase B ship**, admin-only route (`/hercules-ai/model-health` gated by role). Trust Score in footer (small) is sufficient public signal. |
| "Watch" band at 120 px too thin to register | Grow to 200 px, proper card treatment. Or merge with Top-3 — decision deferred to component build. Default: grow. |
| RTL spec for hero motif vague ("visual leading edge") | Locked: `inset-inline-start: 0` — appears on right in RTL. |
| No "max one chart per band" rule — plan permits 4 chart contexts | Added to MASTER.md anti-PhD rules: max one chart per band; sparklines (≤32 px tall) don't count. |

### 16.8 Effort estimate — revised

The eng review's 22–28 days estimate is correct; original 15 days was light by ~50%. Locked:

| Phase | Original | Revised | Reason |
|---|---|---|---|
| Phase A — Money | 5 days | **7 days** | + AI Setup wizard energy/production-pair prompt, + backfill worker, + assets health endpoint, + Lottie motif integration |
| Phase B — Crystal Ball | 5 days | **8 days** | + accuracy_closer worker, + R-rule wiring per feature, + warm-up disable state, + Model Health admin page |
| Phase C — Narrator | 5 days | **8 days** | + Settings page (15 settings, no live preview), + Onboarding modal, + CFO JSON schema + validator + deterministic fallback template, + i18n × 4 languages |
| **Total** | 15 days | **23 days** | ~5 weeks calendar with buffer |

### 16.9 What's now in the file matrix (additions)

- `backend/ai_prompts/cfo_fallback_template.py` — deterministic fallback when LLM JSON validation fails twice.
- `backend/ai_forecast/accuracy_closer.py` — nightly worker that fills `actual_value` and computes MAPE rolling window.
- `backend/ai_forecast/tests/fixtures/salalah_90d.parquet` — frozen backtest fixture (~30 MB).
- `backend/migrations/create_model_accuracy_log.sql`
- `backend/migrations/create_ml_anomaly_feedback.sql`
- `backend/migrations/create_assets_view.sql`
- `Frontend/src/Pages/HerculesAI/SettingsPage.jsx` — `/hercules-ai/settings` route (no live preview).
- `Frontend/src/Pages/HerculesAI/ModelHealthPage.jsx` — `/hercules-ai/model-health` admin-only.
- `Frontend/src/Pages/HerculesAI/components/OnboardingModal.tsx` — 60-second first-run walkthrough.
- `Frontend/src/Pages/HerculesAI/components/SavingsLottie.tsx` — Lottie hero motif (160×160 minimum).
- Removed from matrix (consolidated): `Frontend/src/Pages/HerculesAI/components/PfPenaltyCard.tsx` mercury-gauge custom — replaced by reuse of existing `PowerFactorGauge.tsx`.

---

## 17. Final go/no-go checklist before Phase A merges

- [ ] §16.1: `_generate_ai_summary` is a `content_mode` router; legacy `markdown` mode untouched in tests.
- [ ] §16.2: All schema CHECKs/indexes/triggers in migrations; `evidence_json` snapshots values not refs.
- [ ] §16.3: §8.1 migration order block exists with copy-pasted lines for the three checklist files.
- [ ] §16.4: CFO prompt returns JSON only; validator checks keys + ±0.5 OMR tolerance; fallback template tested.
- [ ] §16.5: Warm-up disable state implemented; R-rules wired per feature; Trust Score returns `null` for first 7 days.
- [ ] §16.6: Bundle measured ≤ 220 KB on `/hercules-ai`; Recharts confirmed lazy in drawer only.
- [ ] §16.7: StatusHero collapsed; BillProjection in Band 5 plant-wide; pulse only on L1; no parallax tilt; PowerFactorGauge reused; tokens.css uses Inter Tight + JetBrains Mono only.
- [ ] §16.8: Effort tracked at 23 days, slip flagged at 28.
- [ ] §16.9: All new file-matrix entries created.
- [ ] Lighthouse `/hercules-ai` ≥ 90.
- [ ] Reduced-motion tested.
- [ ] RTL Arabic + Urdu tested.
- [ ] All four i18n locales updated together.

---

*End of plan.*
