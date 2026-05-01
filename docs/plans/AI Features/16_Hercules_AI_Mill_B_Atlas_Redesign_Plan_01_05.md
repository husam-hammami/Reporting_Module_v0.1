# Hercules AI - Mill B Atlas Redesign Plan - 01_05

Branch: `Salalah_Mill_B`
Status: proposal, not yet implemented
Supersedes: `14_Hercules_AI_Page_Redesign_30_04.md`
Grounded in: `15_Salalah_Mill_B_Hercules_AI_Data_Inventory_01_05.md`
Visual references: `prototypes/mill_b_digital_twin.html`, `prototypes/mill_b_digital_twin_v3.html`, `prototypes/plant_view_digital_twin*.html`

---

## 1. Context

The current Hercules AI page is overloaded: setup wizard, ROI boardroom, legacy insights, SEC dashboard, anomaly list, and savings ledger all collide on one route. Several headline cards depend on `asset_sec_hourly` and `asset_yield_hourly`, which the production sample on Salalah Mill B confirmed are populated but all-zero. The page therefore frequently shows "calibrating", "standing by", or empty ROI states even though the raw `tag_history` data is rich and accurate.

At the same time:

- Raw 1 Hz `tag_history` is plentiful (about 98 million rows over 30 days).
- Mill B has the right tag mix to compute real SEC, yield, idle waste, PF cost, and order pace deterministically.
- The client base is GCC-focused and prefers visual, executive surfaces over text-heavy reports.
- The prediction modules in `backend/ai_forecast/*` are deterministic heuristics, not a true ML pipeline. They are fine as a starting point but should not be marketed as ML.

This plan replaces the current `/hercules-ai` user-facing page with a single-screen visual command surface that is honest about what it knows, predicts what it can, and feels premium.

## 2. Goals

- One screen, no scroll, no tabs.
- 3D centerpiece (Mill B Atlas) as the visual anchor.
- Around 80 percent visual, 15 percent numbers, 5 percent text.
- Every visible number is computed from raw production data, not from broken rollup tables.
- LLM is used only as a one-line narrator, never as the source of truth.
- Premium, futuristic, but reliable. No cyberpunk, no fake holograms.
- Works on a 1440 x 900 desktop and looks great on a 1920 x 1080 wallboard.
- Accessible at WCAG AA contrast and respects reduced motion.
- Backend changes are additive only on the `Salalah_Mill_B` branch.

## 3. Non-Goals

- No new ML models in this phase.
- No change to PLC connection, DB defaults, ports, or Electron startup.
- No removal of the legacy page on day one. It moves behind a flag.
- No reliance on `asset_sec_hourly` or `asset_yield_hourly` until the worker bug is fixed.
- No multi-asset surface in v1. Mill B only.
- No setup wizard on the main route. Setup remains in `/hercules-ai/settings`.

## 4. Concept

Name: **Mill B Atlas**.
Route: `/hercules-ai` becomes Mill B Atlas; the legacy ROI page moves to `/hercules-ai/legacy` behind a flag.

Single-line pitch: a control sphere built around Mill B that shows what is happening, what will happen, and what to do, with one sentence and a few large numbers.

## 5. Layout Specification

Target viewport: 1440 x 900 desktop, no scroll. Scales fluidly to 1920 x 1080.

```
┌──────────────────────────────────────────────────────────────────┐
│  HERCULES · Mill B            ● Operating              22:14 GST │  56 px
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ╭──────────╮                                    ╭──────────╮   │
│   │  YIELD   │             ╔════════════╗         │   SEC    │   │
│   │  72.4%   │             ║            ║         │ 56.7 kWh │   │
│   │  −1.1 pt │             ║   3D       ║         │  / ton   │   │
│   ╰──────────╯             ║   MILL B   ║         ╰──────────╯   │  720 px
│                            ║   ATLAS    ║                        │
│                            ║            ║                        │
│   ╭──────────╮             ║  rotates   ║         ╭──────────╮   │
│   │   BILL   │             ║  energy +  ║         │  RISK    │   │
│   │ 218 OMR  │             ║  product   ║         │ C32 PF   │   │
│   │ end of d │             ║  flows     ║         │ 4.8 OMR/h│   │
│   ╰──────────╯             ╚════════════╝         ╰──────────╯   │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  AI verdict — one sentence, 600 ms crossfade, 60 s refresh       │  60 px
├──────────────────────────────────────────────────────────────────┤
│  ◉ Action 1   ◉ Action 2   ◉ Action 3                            │  64 px
└──────────────────────────────────────────────────────────────────┘
```

Grid:

- Top strip: brand, plant status pill, local time. Height 56 px.
- Stage: 3D twin centered, four floating intelligence orbs at the four outer thirds. Height 720 px.
- Verdict ribbon: AI sentence. Height 60 px.
- Action ring: maximum 3 chips. Height 64 px.

Stage internal proportions:

- Twin canvas: about 56 percent of the stage width.
- Left and right orb columns: each about 22 percent wide, two orbs stacked.

No tabs. The 3D twin is the navigator: clicking a part of the model changes what the orbs and verdict emphasise.

## 6. The 3D Centerpiece (Mill B Atlas)

- Stylised low-poly isometric Mill B model. Custom-built mesh, not photoreal CAD.
- Slowly oscillates 8 degrees back and forth, 12 second loop. Mouse parallax up to 4 degrees.
- Three glowing energy nodes feed the mill from above: M30, M31, C32. Each node intensity scales with live `effective_power` for that submeter.
- Three output streams flow downward into bins: flour (gold particles), bran (amber), B1 (warm white). Particle rate is mapped from live `mil_b_flour_flowrate`, `mil_b_bran_flowrate`, and B1 flow.
- Floor ring under the model is a 24-hour timeline. A live cursor sweeps it. Open `ml_anomaly_events` appear as small red beads on the ring at their `detected_at` position.
- An order banner inside the twin shows the running `dynamic_orders.order_name`. When no order is active, the twin dims and shows a quiet "Idle" label.

Interactions:

- Click an energy node: the right column switches to that submeter's detail (live kW, PF, kVAR, today's kWh, today's cost in OMR).
- Click an output stream: the left column switches to a yield drawer for that stream.
- Click an anomaly bead: opens an evidence drawer with the event headline, evidence, observed and baseline values, and a link to the time window.
- Click the order banner: opens the order drawer with per-order SEC, yield, throughput, and the projected finish time.

Implementation:

- React Three Fiber on top of three.js.
- A single mesh authored as low-poly geometry in code, not imported assets.
- Particle system in shader-based instanced meshes for performance.
- Render at native devicePixelRatio capped at 2. Pause when tab is hidden. Disable when `prefers-reduced-motion` is set, replaced by a flat isometric SVG.

## 7. Intelligence Orbs

Four glass tiles. Each is one number, one delta, one micro spark.

| Orb | Big number | Delta | Spark | Source |
|---|---|---|---|---|
| Yield | flour percent | gap vs best recent run | 60 minute flour percent line | computed from totalizer deltas |
| SEC | kWh per ton | vs 7 day baseline | 24 hour SEC line | M30+M31+C32 kWh / Mill B flour tons |
| Bill | projected OMR end of day | confidence band p10 to p90 | 24 hour cost line | hourly cost projection at configured tariff |
| Risk | top live OMR per hour | confidence dot | last 60 minute risk strip | top non-zero anomaly cost |

Visuals:

- 24 px corner radius, frosted glass at `rgba(255,255,255,0.06)` with `backdrop-filter: blur(40px) saturate(140%)`.
- 1 px inner highlight using `inset 0 1px 0 rgba(255,255,255,0.08)`.
- Hover lifts 6 px and scales 1.02 over 200 ms ease-out.
- A small "Why?" icon at the top right opens an evidence drawer with the formula and inputs.

## 8. AI Verdict Ribbon

- One sentence, max 120 characters.
- Generated by Claude using only the deterministic snapshot block as input.
- Refresh every 60 seconds. Crossfade swap over 600 ms.
- Never blocks the page. If the LLM is slow or fails, the ribbon stays on the previous sentence and a small italic suffix says "from cache".
- The ribbon's tone is calm, executive, and specific. It must reference at least one number from the snapshot.

Examples:

- "C32 power factor is the only real risk tonight. Yield slightly below your best run. Production pace healthy."
- "Mill B is having its best day this week. Maintain current setpoints."
- "Stuck counter on Pasta E is hiding about 1.2 t of production. Check the totalizer."

## 9. Action Ring

- Up to 3 chips at the bottom.
- Each chip carries: short title, OMR per hour impact, confidence dot.
- Chip color reflects severity: gold for opportunity, amber for warning, red for risk.
- Click opens an evidence drawer over the page. The main view stays visible behind a 60 percent dim.

Selection rule:

1. Prefer active anomalies with computed `omr_at_risk > 0`.
2. Then yield drift gap with monetised loss.
3. Then idle energy waste.
4. Then PF capacitor recommendation.
5. Cap at 3, sorted by OMR impact descending.

## 10. Visual Language

- Style: VisionOS-inspired Spatial UI plus restrained industrial. No cyberpunk. No neon overload.
- Background: deep midnight `#050714`. A faint blue radial light from behind the twin (`radial-gradient(circle at 50% 60%, #0E1B3A 0%, #050714 70%)`).
- Glass tiles: `rgba(255,255,255,0.06)`, blur 40 px, saturate 140 percent.
- Energy color: `#5BD7E0` cyan.
- Money color: `#D4A24E` gold.
- Risk color: `#E5484D` ember red, used only when the risk is real and computed.
- OK color: `#3FB37F` desaturated green, used sparingly.
- Idle color: `#6B7280` neutral.

Typography:

- Headings and numbers: **Inter Tight**, already in the app.
- Captions: **Inter**.
- Evidence drawer mono: **JetBrains Mono**.
- Numeric features: `font-feature-settings: 'tnum' 1, 'lnum' 1, 'ss02' 1`.

Spacing scale: existing `--hai-space-*` tokens.
New tokens proposed: `--hai-glass-bg`, `--hai-glass-border`, `--hai-glass-blur`, `--hai-money`, `--hai-energy`, `--hai-depth-1`, `--hai-depth-2`.

## 11. Motion

- 3D twin: 12 second oscillation loop, 200 ms ease-out tilt on mouse parallax.
- Particles: rate scales linearly with live flow rates, capped at 80 particles per second per stream.
- Orbs: 200 ms hover lift.
- Verdict: 600 ms crossfade.
- Anomaly bead: 1.5 second pulse on appear.
- All motion respects `prefers-reduced-motion: reduce`. In reduced mode, particles freeze, oscillation stops, and crossfades become instant swaps.

## 12. Data Contract

The page reads exactly one snapshot endpoint, polled every 5 seconds:

`GET /api/hercules-ai/mill-b-snapshot`

Response shape (proposed):

```jsonc
{
  "generated_at": "2026-05-01T22:14:03+04:00",
  "asset": "Mill B",
  "status": {
    "level": "ok | warn | crit | idle",
    "label": "Operating | Warning | Critical | Idle"
  },
  "order": {
    "id": 5,
    "name": "MILB4",
    "started_at": "2026-05-01T14:37:00+04:00",
    "elapsed_seconds": 27420,
    "is_active": true
  },
  "live": {
    "flour_flowrate_t_h": 6.66,
    "bran_flowrate_t_h": 1.42,
    "b1_flowrate_t_h": 0.86,
    "energy_kw": 376.19
  },
  "today": {
    "flour_kg": 108270,
    "bran_kg": 22150,
    "b1_kg": 13540,
    "energy_kwh": 6713,
    "cost_omr": 167.83
  },
  "yield": {
    "current_pct": 72.4,
    "best_recent_pct": 73.5,
    "delta_pt": -1.1,
    "predicted_end_of_shift_pct": 72.6,
    "lost_flour_kg_estimate": 420,
    "lost_omr_estimate": 105
  },
  "sec": {
    "current_kwh_per_t": 56.7,
    "baseline_7d_kwh_per_t": 58.2,
    "delta_pct": -2.6
  },
  "bill": {
    "so_far_omr": 167.83,
    "projected_omr": 218.0,
    "p10_omr": 200.0,
    "p90_omr": 236.0,
    "vs_last_same_dow_omr": 224.0
  },
  "submeters": [
    { "name": "M30", "kw": 210.79, "pf": 0.92, "kwh_today": 3625, "cost_omr": 90.6 },
    { "name": "M31", "kw": 2.33,   "pf": 0.31, "kwh_today": 64,   "cost_omr": 1.6  },
    { "name": "C32", "kw": 163.07, "pf": 0.20, "kwh_today": 3045, "cost_omr": 76.1 }
  ],
  "anomalies_open": [
    {
      "id": 14,
      "feature_id": "pf_cliff",
      "asset": "Mill B",
      "tag_name": "c32_cos_phi",
      "severity": "crit",
      "headline": "Sudden electrical-efficiency drop on C32",
      "evidence": "Power factor fell from 0.81 to 0.20 within the last hour.",
      "observed_value": 0.20,
      "baseline_value": 0.81,
      "omr_per_hour_at_risk": 4.8,
      "detected_at": "2026-05-01T21:42:00+04:00"
    }
  ],
  "actions": [
    {
      "id": "c32-pf",
      "title": "Check C32 capacitor",
      "omr_per_hour": 4.8,
      "severity": "crit",
      "confidence": 0.85,
      "evidence_id": 14
    }
  ],
  "verdict_inputs": { /* compact summary used by the LLM, see section 14 */ },
  "fallbacks_used": []
}
```

Polling:

- 5 s polling for `live`, `today`, `submeters`, `anomalies_open`, `actions`.
- The `verdict` text is fetched separately every 60 s from `POST /api/hercules-ai/mill-b-verdict` so a slow LLM never blocks live data.

## 13. Deterministic Math

All numbers in the snapshot are computed from raw `tag_history` for the configured Mill B tag set, with no dependency on `asset_sec_hourly` or `asset_yield_hourly`.

- Mill B energy delta over a window: sum of `value_delta` for `m30_total_active_energy`, `m31_total_active_energy`, `c32_total_active_energy` between `t_from` and `t_to`.
- Mill B production delta: sum of `value_delta` for `mil_b_flour_totalizer`, `mil_b_bran_totalizer`, `mil_b_b1_totalizer`.
- SEC: `sum(kWh_delta) / (sum(flour_kg_delta) / 1000)` over the chosen window.
- Yield percent: `flour_kg / (flour_kg + bran_kg + b1_kg) * 100` over the chosen window.
- Today's cost: sum of hourly `kWh_delta * tariff_omr_per_kwh` from `hercules_ai_config.electricity_tariff_omr_per_kwh`.
- End-of-day projection: today's cost so far plus EWMA of historical same DOW same hour kWh, multiplied by tariff.
- Lost flour estimate: `(best_recent_pct - current_pct) / 100 * total_input_kg_for_window`, monetised with `value_per_ton_flour`.
- PF cliff cost: `omr_per_hour = baseline_kw * (1 - observed_pf / target_pf) * tariff` where target is `pf_target` from config. Refined later by `pf_penalty_rate_bz_per_kvarh`.
- Idle energy waste: while `mil_b_order_active_499 = false`, sum any `kWh_delta` above an idle threshold; multiply by tariff.

Edge cases:

- Any tag missing returns `null` for the affected number with a `fallbacks_used` entry.
- Production windows shorter than 5 minutes are excluded from yield to avoid noise.
- Counter resets are detected as a negative `value_delta` and treated as zero.

## 14. LLM Role (Constrained Narrator)

The LLM is used only to produce the verdict ribbon. The contract:

- Input: `verdict_inputs` block with status, top action, yield delta, SEC delta, projected bill, and one anomaly headline if any.
- Output: a single sentence, max 120 characters, that references at least one number.
- Hard rules in the system prompt:
  - Plain language, no jargon (no "PF", "SEC", "kVARh", "kvar", "MAPE", "p10").
  - No new numbers. Only numbers present in the input may appear.
  - No predictions beyond what the input states.
  - English only for v1. Arabic added later.
- Rate limit: 1 call per 60 s per user. Cached on the backend per asset for 60 s.

## 15. Frontend Architecture

- New page module: `Frontend/src/Pages/HerculesAI/Atlas/`.
  - `AtlasPage.jsx` (route entry)
  - `AtlasStage.jsx` (3D + orbs layout)
  - `MillBTwin.tsx` (React Three Fiber)
  - `orbs/YieldOrb.tsx`, `SecOrb.tsx`, `BillOrb.tsx`, `RiskOrb.tsx`
  - `VerdictRibbon.tsx`
  - `ActionRing.tsx`
  - `drawers/EvidenceDrawer.tsx`, `OrderDrawer.tsx`, `SubmeterDrawer.tsx`, `YieldDrawer.tsx`
  - `hooks/useMillBSnapshot.ts` (5 s polling)
  - `hooks/useVerdict.ts` (60 s polling, never blocks render)
- Reuse existing tokens in `Frontend/src/Pages/HerculesAI/tokens.css` and add new glass and depth tokens.
- Routing change in `Frontend/src/Routes/AppRoutes.jsx`:
  - `/hercules-ai` -> `AtlasPage` (gated by feature flag, default off in v1).
  - `/hercules-ai/legacy` -> existing `HerculesAISetup` (always available).
  - `/hercules-ai/settings` -> existing `HerculesAISettingsPage` (unchanged).

Feature flag: `localStorage.atlas.v1 === '1'` enables Atlas. Once stable, default flips to on with the same escape hatch the legacy dashboard uses today.

## 16. Backend Changes

New blueprint endpoints in `backend/hercules_ai_bp.py`:

- `GET /api/hercules-ai/mill-b-snapshot` -> assembles the snapshot from raw `tag_history` and config. No new tables. Uses existing modules in `backend/ai_money/*` only as helpers.
- `POST /api/hercules-ai/mill-b-verdict` -> generates a single-sentence verdict via `ai_provider.generate(...)`. Cached per asset for 60 s.

New helper module: `backend/ai_money/mill_b_snapshot.py` that:

- Reads tag IDs once and caches them in process for 5 minutes.
- Computes all numbers from `tag_history`.
- Pulls open anomalies from `ml_anomaly_events`.
- Pulls running order from `dynamic_orders`.
- Computes `omr_per_hour_at_risk` for each open anomaly, even if the stored value is 0 (read-only enrichment, does not update the row).

No DB schema changes for v1. Schema additions for actions and feedback come in v2.

## 17. Reliability and Fallbacks

- Every section can degrade independently. The page never blank-screens.
- 3D twin failure: collapses to a flat isometric SVG with the same orbs and verdict.
- WebGL not available: same SVG fallback, no behaviour change.
- Snapshot endpoint failure: page stays on last good snapshot for up to 60 s, then shows a small "couldn't refresh" subline.
- Verdict endpoint failure: ribbon stays on previous sentence with an italic "from cache" suffix.
- LLM rate limit hit: ribbon stays on previous sentence; no error toast.
- Reduced motion: oscillation, particles, and crossfades disabled.

## 18. Accessibility

- Color contrast 4.5:1 minimum for all text on glass tiles, verified against the midnight background.
- All interactive elements have visible focus rings (`outline: 2px solid #5BD7E0`).
- 3D twin and particles are decorative; orbs and verdict carry the meaning.
- Each orb exposes an ARIA label like `Yield, 72.4 percent, 1.1 points below best recent run`.
- Action chips are buttons with `aria-describedby` linked to the evidence drawer.
- Keyboard navigation: tab order is verdict, then orbs left to right, then action chips.
- Reduced motion fully respected.

## 19. Performance Budget

- First meaningful paint under 1.5 s on a typical client laptop.
- 3D scene under 60 k triangles.
- Particle systems under 250 active particles total.
- Snapshot payload under 8 KB gzipped.
- Memory under 200 MB after 1 hour idle on the page.
- Snapshot endpoint p95 server time under 250 ms (cached tag IDs, indexed `tag_history` queries).

## 20. Phases and Milestones

### Phase 0 - Approval (this plan)
- Review and sign-off on layout, palette, and data contract.

### Phase 1 - Static Mock
- Build a single static HTML mock of the Atlas screen using fixed sample numbers from the data inventory snapshot.
- Goal: walk the client through the look and feel before any backend work.
- Deliverable: `prototypes/mill_b_atlas_v1.html`.

### Phase 2 - Backend Snapshot
- Implement `GET /api/hercules-ai/mill-b-snapshot` from raw `tag_history`.
- Add unit-style verification script that compares its output against a known 1-hour window.
- No frontend changes yet.

### Phase 3 - Frontend Shell
- Build `AtlasPage` behind the feature flag.
- Use the new endpoint.
- Skip the 3D twin in this phase; show a flat isometric SVG placeholder.
- Wire up the four orbs, ribbon, action ring, and evidence drawers.

### Phase 4 - 3D Twin
- Replace the SVG placeholder with the React Three Fiber Mill B twin.
- Energy nodes, output streams, anomaly beads, order banner.
- Reduced-motion fallback validated.

### Phase 5 - Verdict
- Implement `POST /api/hercules-ai/mill-b-verdict`.
- Hook ribbon up with caching and graceful degrade.

### Phase 6 - QA on Salalah Mill B
- Validate live numbers against hand-computed values from `tag_history`.
- Tune motion, contrast, and copy with the client.

### Phase 7 - Default Flip
- Flip the flag default to on.
- Keep `/hercules-ai/legacy` available.
- Keep an escape hatch via `localStorage.atlas.v1 = '0'`.

### Phase 8 (later, separate plan)
- Anomaly feedback writes to `ml_anomaly_feedback`.
- Savings ledger writes from confirmed actions.
- Real ML on top of the now-trustworthy deterministic layer.

## 21. Rollout

- Implementation happens on `Salalah_Mill_B` only.
- Each phase ships independently.
- All snapshot reads are read-only on the production DB.
- No DB schema migration is required for v1.
- Backend changes go behind the new endpoints, so old endpoints keep working.
- Frontend route stays the same; the flag selects which page renders.

## 22. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `tag_history` queries get slow at scale | medium | high | use pre-computed `tag_id` cache, restrict to last 24 h for hot path, hourly windows for projections |
| 3D twin too heavy on weak GPUs | medium | medium | low-poly geometry, particle cap, SVG fallback, reduced-motion path |
| LLM verdict goes off-topic | low | medium | strict system prompt, banned-words list, only numbers from input |
| Tag set drifts after future scans | low | high | snapshot module reads tag set on each request through a 5 minute cache, logs a warning if a required tag is missing |
| Client expects savings figures we cannot back yet | medium | high | do not show savings until `ai_savings_ledger` is real |
| Migration churn on `assets_view` continues | medium | medium | snapshot module does not depend on `assets_view`; uses derived asset logic from `ai_money/db.py` |

## 23. Production Safety Notes

- Do not change DB defaults, ports, credentials, or PLC connection settings.
- Do not write to `hercules_ai_tag_profiles`, `asset_sec_hourly`, `asset_yield_hourly`, or `assets_view` from this feature.
- Do not delete rows from any production table as part of this work.
- The snapshot endpoint is read-only.
- The verdict endpoint writes only its own per-asset cache entry.
- Keep `/hercules-ai/legacy` available throughout the rollout so the client can switch back instantly.

## 24. Open Decisions (need user input)

1. Confirm the asset name to display: "Mill B" (current) or a localized label.
2. Confirm the action selection priority order in section 9.
3. Confirm the verdict refresh cadence (default 60 s) and per-day LLM call cap.
4. Confirm whether to expose the `Risk Orb` to non-admin roles in v1 or keep the page admin-only as today.
5. Confirm whether to ship the static mock (Phase 1) before any backend work, or go straight to Phase 2 in parallel.

## 25. Success Criteria

- The Atlas page renders within 1.5 s and stays responsive on the client laptop.
- All four orbs display real, hand-verifiable numbers within 2 percent of `tag_history` math.
- The verdict reads naturally and never invents numbers.
- The page survives a network blip and an LLM outage with no error toasts.
- Client demo feedback: "I can leave this on a TV and understand the mill at a glance."

## 26. References

- `15_Salalah_Mill_B_Hercules_AI_Data_Inventory_01_05.md` - production data sample and tag inventory.
- `14_Hercules_AI_Page_Redesign_30_04.md` - previous redesign plan (superseded).
- `prototypes/mill_b_digital_twin.html`, `prototypes/mill_b_digital_twin_v3.html` - earlier 3D twin explorations.
- `prototypes/plant_view_digital_twin.html`, `prototypes/plant_view_digital_twin_v2.html` - multi-asset twin explorations.
- `backend/hercules_ai_bp.py` - current AI blueprint and endpoints.
- `backend/ai_money/*` and `backend/ai_forecast/*` - current deterministic helpers.
- `Frontend/src/Pages/HerculesAI/tokens.css` - existing `--hai-*` design tokens.
- `CLAUDE.md` - production safety rules and naming conventions for plans.
