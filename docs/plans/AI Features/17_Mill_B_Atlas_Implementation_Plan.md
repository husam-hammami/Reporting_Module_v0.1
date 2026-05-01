# Hercules Atlas - Implementation Plan - 02_05

Branch: `Salalah_Mill_B`
Status: ready for implementation
Page name: **Hercules Atlas** (user-facing label, sidebar entry, page title)
Route: **`/atlas`** (Sam decision, 02_05)
Builds on: `16_Hercules_AI_Mill_B_Atlas_Redesign_Plan_01_05.md` (concept, layout, data contract, deterministic math, phases, risks)
Grounded in: `15_Salalah_Mill_B_Hercules_AI_Data_Inventory_01_05.md` (real Mill B tag inventory)
Visual references:
- `prototypes/mill_b_atlas_mockup_v3.html` — approved standalone layout (02_05)
- `prototypes/mill_b_atlas_mockup_v4.html` — approved in-app shell (sidebar, top bar, light + dark, 02_05)

---

## 1. Purpose

Plan 16 specified **what** the Atlas page is. Plan 17 specifies **how** it gets built inside the existing Reporting Module — which directories, which existing components to reuse, which CSS tokens to bind to, what new fields the snapshot API must expose, and what ships in each phase.

Treat this document as the engineering checklist that turns the v3 + v4 mockups into a production page at a **new route**, while leaving the existing Hercules AI page untouched and looking native to the rest of the app.

## 2. Architectural posture (the rule everything below follows)

**Hercules Atlas is a NEW page on a NEW route. It is NOT a modification of, replacement for, or feature-flagged variant of the existing Hercules AI page.**

- New route: **`/atlas`**.
- New page module: `Frontend/src/Pages/Atlas/` — a separate top-level module.
- Page name (user-facing, sidebar, title bar): **Hercules Atlas**.
- Existing `/hercules-ai` route, the `HerculesAISetup` page, and the `Frontend/src/Pages/HerculesAI/` module are **not modified** by this plan.

**However, Atlas reuses everything reusable** from the existing Hercules AI module — by **import**, not by copy-paste:

- Backend APIs in `backend/hercules_ai_bp.py` and helper modules in `backend/ai_money/`, `backend/ai_forecast/`, `backend/ai_provider.py` — call them, do not duplicate them.
- Frontend components in `Frontend/src/Pages/HerculesAI/components/` (`MetricCard`, `SparklineInline`, `HeroVerdict`, `DeltaPill`, `LoadingState`, `ErrorState`, `EmptyState`, `DensityProvider`, `SavingsRibbon`, etc.) — import them.
- Design tokens in `Frontend/src/Pages/HerculesAI/tokens.css` — import the file once at the page root.
- The existing `herculesAIApi.js` API wrapper — import its helpers; only add new wrappers for endpoints we extend.

If a needed primitive doesn't exist yet, add it under `Frontend/src/Pages/HerculesAI/components/` (so the existing page benefits too) — do not fork it into `Atlas/`.

The mental model: `Atlas/` is a thin **composition layer** over the shared Hercules AI primitives, not a parallel implementation.

## 3. What's new vs. Plan 16

The v3 + v4 mockups approved by Sam, plus Sam's 02_05 routing and naming decisions, supersede four Plan 16 decisions:

1. **Production output forecast is now a hero element**, equal in weight to the cost/SEC orb. Plan 16's snapshot contract has `yield.predicted_end_of_shift_pct` but no `production.predicted_eod_tons`. We extend the contract to add that.
2. **OMR/ton is labeled "Energy cost per ton"**, not "Cost per ton". Plan 15 confirms only the energy portion is derivable from current data (~1.4 OMR/t at the configured 0.025 OMR/kWh tariff). Full per-ton cost (raw wheat + labor + overhead) is out of scope until those config inputs exist.
3. **Atlas lives at its own route, not behind a flag on `/hercules-ai`.** Plan 16 §15 says Atlas replaces `/hercules-ai` with a feature flag and pushes the existing setup to `/hercules-ai/legacy`. Per Sam's 02_05 instruction, that swap is cancelled. Both pages now coexist as independent routes. Final route is **`/atlas`**, page name is **"Hercules Atlas"**.
4. **Atlas renders inside the standard app shell** — same fixed top bar (logo, live pill, language toggle, theme toggle, user avatar) and same left sidebar as every other page in the app, with a new "Hercules Atlas" entry in the sidebar's Intelligence section. The v3 standalone mockup is the *content area only*; the v4 mockup shows how it sits in the shell. **Both light and dark themes** are first-class — every color comes from `tokens.css`, never a hex literal, so the existing theme toggle in `Components/Navbar/Navbar.jsx` flips Atlas like any other page.

Plan 16 sections that remain authoritative and are NOT re-litigated here: §6 (3D centerpiece, deferred to Phase 5), §10 (visual language), §13 (deterministic math), §17 (reliability), §18 (accessibility), §22 (risks), §23 (production safety). Plan 16 §15 (routing/flag) and the parts of §16 that talk about endpoint **introduction** are reframed below as endpoint **extension**.

## 4. Layout (final, from v3 mockup)

Two-column grid, no scroll, no tabs.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Top bar — Hercules · Mill B · Production & Cost Forecast            │  56 px
├──────────────────────┬───────────────────────────────────────────────┤
│                      │                                               │
│  PRODUCTION HERO     │  PRODUCTION CHART                             │
│  (today + forecast)  │  (cumulative tons today, actual + forecast)   │  ~38%
│                      │                                               │
├──────────────────────┼───────────────────────────────────────────────┤
│                      │                                               │
│  ENERGY-COST HERO    │  COST CHART                                   │
│  (now + forecast)    │  (24h actual + 12h forecast OMR/t)            │  ~38%
│                      │                                               │
├──────────────────────┴───────────────────────────────────────────────┤
│  AI verdict bar — one sentence + "Why?" CTA                          │  ~80 px
├──────────────────────────────────────────────────────────────────────┤
│  KPI strip — Pace · Yield · Energy · Maintenance                     │  ~110 px
└──────────────────────────────────────────────────────────────────────┘
```

The 3D mill thumbnail from earlier mockups is **dropped from the v1 layout**. Reintroduce only after Phase 4 if the page still has visual room. Plan 16's full Atlas-with-twin remains the long-term target; v3 is the bridge.

## 5. Component architecture

Atlas lives at `Frontend/src/Pages/Atlas/` — a new sibling module to `Frontend/src/Pages/HerculesAI/`. Atlas **imports from** the HerculesAI module; it does not nest inside it.

### 5.1 New files in `Atlas/`

| File | Role |
|---|---|
| `AtlasPage.jsx` | Route entry. Wraps content in `DensityProvider` (imported from HerculesAI). No flag/swap logic — this page just renders. |
| `AtlasLayout.tsx` | The two-row grid layout. Owns the snapshot query and threads slices to children. |
| `heroes/ProductionHero.tsx` | Left card row 1. Today-so-far tons + AI forecast EOD + delta vs plan. |
| `heroes/EnergyCostHero.tsx` | Left card row 2. Current OMR/ton + AI forecast next shift + estimated savings. |
| `charts/ProductionChart.tsx` | Right card row 1. Cumulative tons over the day. Solid line up to NOW, dashed forecast to 24:00, gold confidence band. |
| `charts/EnergyCostChart.tsx` | Right card row 2. 24h actual + 12h forecast OMR/t with confidence band. |
| `charts/AtlasLineChart.tsx` | Shared chart wrapper around `react-chartjs-2` (token-bound colors, reduced-motion respect). |
| `AtlasVerdictBar.tsx` | Composes existing `HeroVerdict` (imported from HerculesAI) with the snapshot's verdict text. |
| `AtlasKpiStrip.tsx` | Four KPI cards built from existing `MetricCard` (imported from HerculesAI). |
| `hooks/useMillBSnapshot.ts` | React Query hook, 5 s polling, returns typed snapshot. Calls extended endpoint via shared `herculesAIApi`. |
| `hooks/useVerdict.ts` | React Query hook, 60 s polling, never blocks render, falls back to last value with "from cache". |
| `types.ts` | TypeScript interface for the snapshot payload (mirrors backend dict shape). |

### 5.2 Imports from `HerculesAI/` (reuse, never copy-paste)

Every entry below is an `import` from the existing HerculesAI module — Atlas owns no copies.

| Source path | Used by | Notes |
|---|---|---|
| `Pages/HerculesAI/tokens.css` | `AtlasPage` (one global `import`) | Single source of truth for all CSS variables. |
| `Pages/HerculesAI/components/MetricCard.tsx` | `AtlasKpiStrip` (4 cards) | Pass `status`, `value`, `unit`, `meta`. |
| `Pages/HerculesAI/components/SparklineInline.tsx` | inside hero cards (small trend) | Optional v1 polish. |
| `Pages/HerculesAI/components/HeroVerdict.tsx` | `AtlasVerdictBar` (compose) | If its props don't fit Atlas, **extend it in place** in HerculesAI/components — do not fork. |
| `Pages/HerculesAI/components/DeltaPill.tsx` | both heroes (delta vs plan / vs baseline) | |
| `Pages/HerculesAI/components/LoadingState.tsx` | `AtlasLayout` first paint | |
| `Pages/HerculesAI/components/ErrorState.tsx` | `AtlasLayout` snapshot failure | |
| `Pages/HerculesAI/components/EmptyState.tsx` | when no order is active | |
| `Pages/HerculesAI/components/DensityProvider.tsx` | `AtlasPage` wraps everything | Enables compact / comfortable / wallboard density. |
| `Pages/HerculesAI/components/SavingsRibbon.tsx` | optional polish on hero cards | Reuse the gold accent. |
| `Pages/HerculesAI/hooks/useRoiPayload.ts` | reference pattern only | Read for shape, then write `useMillBSnapshot` with the same React Query conventions. |
| `API/herculesAIApi.js` | both `useMillBSnapshot` and `useVerdict` | Add **new** wrapper methods (`getMillBSnapshot`, `postMillBVerdict`) to this file rather than creating a parallel API client. |

If a needed primitive is missing (for example a `ConfidenceBandLegend`), add it under `Pages/HerculesAI/components/` so the existing page can adopt it later. **Never create a `Atlas/components/` directory.**

### 5.3 Charts

Use `react-chartjs-2 ^5.3.0` (already in `Frontend/package.json`) on top of `chart.js ^4.5.0`. Both charts are line charts with a confidence-band fill drawn as a second dataset with `fill: '+1'`.

A thin wrapper `Atlas/charts/AtlasLineChart.tsx` configures the shared options:
- Inherit colors from CSS variables via `getComputedStyle(document.documentElement).getPropertyValue('--hai-data-1')` etc., so light/dark themes flip cleanly.
- `--hai-future` for forecast line, `--hai-money` for production confidence band, `--hai-data-5` for actual production line, `--hai-status-info-600` for actual cost line.
- Tabular numerics on tooltips: `font: { family: 'Inter Tight', features: 'tnum' }`.
- Disable animation when `prefers-reduced-motion: reduce` (use `AtlasLayout` to read it once and propagate via context).

Do **not** introduce D3, Recharts, or Nivo. We already have a chart library and bundle size matters on the client laptop.

### 5.4 The 3D mill thumbnail (deferred)

Not in v1 page. If reintroduced post-Phase 4, build under `Atlas/three/MillBMini.tsx` using `@react-three/fiber ^8.17.0` (already installed). Stick to Plan 16 §6 implementation rules: low-poly, oscillation, particle cap, SVG fallback. For v1 we explicitly deliver a 2-column layout with no twin to keep Phase 1 tractable.

## 6. Design system integration

All visual values bind to `Frontend/src/Pages/HerculesAI/tokens.css`. **No raw hex values in any new component.** Same rule as the existing module (see header comment in `tokens.css`).

### 6.1 Token map (mockup → token)

| v3 mockup color | Production token | Used for |
|---|---|---|
| `#22d3ee` (cyan actual line) | `--hai-status-info-600` | Cost chart actual line, info accents |
| `#34d399` (green forecast) | `--hai-status-ok-600` (line) + `--hai-future` (forecast accent) | Forecast line and band |
| `#fbbf24` (gold production) | `--hai-money` | OMR figures, production hero accent |
| `#f87171` (warning red) | `--hai-status-crit-600` | Risk states only |
| `#0a1828` (canvas) | `--hai-surface-canvas` | Page background |
| Glass card surface | `--hai-glass-1` / `--hai-glass-2` + `.hai-roi-card` | All hero and chart cards |
| Card shadow | `--hai-shadow-rest` / `--hai-shadow-deep` (hover) | Card depth |
| Big number typography | `.hai-money-figure` (OMR), `.hai-text-display-lg` (tons) | Hero metrics |
| Small label typography | `.hai-text-label` | "AI FORECAST · NEXT SHIFT" etc. |
| Body copy | `.hai-text-body` / `.hai-text-body-sm` | AI verdict, KPI explainer |
| Numeric features | `.hai-num` class | Every number on the page |
| Spacing | `--hai-space-1..16` | Padding, gap |
| Radii | `--hai-radius-lg` (chart cards), `--hai-radius-xl` (hero cards) | |
| Motion | `--hai-motion-short` / `--hai-ease-out-quart` | Hover lifts, value fades |

### 6.2 New tokens (only if absolutely needed)

We should add **at most one** new token: `--hai-forecast-band` for the dashed-line confidence fill (an alpha variant of `--hai-status-ok-600`). Add it to both light and dark blocks in `tokens.css`. Avoid any other additions in v1 — `tokens.css` already covers the full surface. The token gets added to the shared HerculesAI `tokens.css`, not duplicated in the Atlas module.

### 6.3 Theme support

The existing app supports dark and light via `[data-theme='dark' | 'light']` on a parent. Atlas inherits this for free as long as it consumes tokens (not raw colors). Validate both themes in Phase 3 QA.

### 6.4 Density and wallboard mode

Wrap `AtlasPage` in `DensityProvider` (imported from HerculesAI). `tokens.css` already defines `[data-hai-density='wallboard']` overrides — we get TV-friendly type sizes by default. Plan 16 §2 explicitly targets the 1920×1080 wallboard.

## 7. Data flow

### 7.1 Reuse first, extend only when needed

Atlas does not introduce a parallel API. It reuses the existing Hercules AI surface in `backend/hercules_ai_bp.py` and **extends** the snapshot endpoint with the three new payload sections required by v3.

| Endpoint | Status | Atlas use |
|---|---|---|
| `GET /api/hercules-ai/mill-b-snapshot` | Defined by Plan 16 §16; not yet implemented | **Extend** payload with `production`, `energy_cost_per_ton`, `production_series` (see §7.3). Atlas is the first consumer. The endpoint is shared — if the existing Hercules AI page later wants to read these fields, it can. |
| `POST /api/hercules-ai/mill-b-verdict` | Defined by Plan 16 §16; not yet implemented | Reused as-is. |
| `GET /api/hercules-ai/status` | Exists | Reused for nav-badge / online indicator. |
| `backend/ai_provider.py` | Exists (cloud + local LM Studio) | Reused for verdict generation. |
| `backend/ai_money/*` (when present) | Plan 16 helpers | Reused as data-derivation helpers. |
| `backend/ai_forecast/*` | Existing deterministic heuristics | Reused as the prediction backbone; we add two new modules (production EOD, OMR/t) that follow the same pattern. |
| `backend/hercules_ai_tag_profiles` table | Exists | Read-only consumer — derives Mill B tag IDs. |

Atlas creates **no new blueprint**, **no new tables**, and **no new migrations** in v1. Everything is additive on the existing Hercules AI backend.

### 7.2 Polling

Single read-only snapshot endpoint, polled every 5 s by React Query through `useMillBSnapshot`. Verdict is polled separately every 60 s through `useVerdict` so a slow LLM never blocks live data — exactly the cadence Plan 16 §12 specifies.

### 7.3 Snapshot payload extension

Response shape is the one defined in Plan 16 §12, with the following **additions** required by v3:

```jsonc
{
  // ... all Plan 16 §12 fields ...

  // NEW — production output prediction (top hero in v3 mockup)
  "production": {
    "today_tons": 68.4,                    // sum(flour_totalizer_delta) since 00:00 local
    "predicted_eod_tons": 108,             // current pace * remaining operating hours, blended with EWMA same-DoW
    "plan_tons": 102,                      // optional: from dynamic_orders if available
    "delta_vs_plan_tons": 6,               // predicted_eod - plan
    "pace_t_per_h": 6.66,                  // current 1h rolling flour flow rate
    "confidence_pct": 82                   // derived from variance of last 7 same-DoW days
  },

  // NEW — energy cost per ton series for the chart
  // (Plan 16 §12 already has "sec.current_kwh_per_t"; we add the OMR-per-ton view explicitly)
  "energy_cost_per_ton": {
    "current_omr_per_t": 1.42,             // (kWh_delta * tariff) / flour_t for last hour
    "predicted_next_shift_omr_per_t": 1.31,
    "savings_omr_8h": 12,                  // (current - predicted) * predicted_eod_tons * 8/24
    "history_24h": [ { "t": "...", "v": 1.45 }, ... ],   // hourly buckets
    "forecast_12h": [ { "t": "...", "v": 1.41, "lo": 1.39, "hi": 1.43 }, ... ]
  },

  // NEW — production cumulative series for the chart
  "production_series": {
    "today_hourly": [ { "h": 0, "tons": 0 }, ..., { "h": 14, "tons": 68.4 } ],
    "forecast_hourly": [ { "h": 15, "tons": 75.0, "lo": 74, "hi": 76 }, ..., { "h": 24, "tons": 108, "lo": 102, "hi": 113 } ]
  }
}
```

All other v3 elements (KPI strip, AI verdict, status pill) are already covered by Plan 16 §12.

### 7.4 Backend changes required

Additive only — no schema changes for v1.

| Module | Change |
|---|---|
| `backend/ai_money/mill_b_snapshot.py` | New helper module per Plan 16 §16. Adds the three new payload sections above. Compute from raw `tag_history` (per Plan 15 — `asset_*_hourly` rollups remain untrusted). Lives in the **shared** `ai_money` namespace; not Atlas-specific. |
| `backend/ai_forecast/production_eod.py` | New. Pure function: given today's hourly tons + last 7 same-DoW days, return EOD projection + low/high band. EWMA blended with current pace. Deterministic, no ML, per Plan 16 §1. Reusable by future pages. |
| `backend/ai_forecast/cost_per_ton.py` | New. Same deterministic style for the OMR/t forecast. Reusable. |
| `backend/hercules_ai_bp.py` | Add the `GET /api/hercules-ai/mill-b-snapshot` route (Plan 16 §16) that calls the helpers above. **Extend it** to include the new sections from §7.3. Stays in the existing blueprint — no new blueprint. |

No new tables, no migrations, no PLC changes. Read-only on production DB. Production safety rules from Plan 16 §23 and CLAUDE.md apply unchanged.

### 7.5 Frontend data layer

```ts
// Atlas/hooks/useMillBSnapshot.ts (sketch)
import { getMillBSnapshot } from '../../../API/herculesAIApi';   // shared API wrapper

export function useMillBSnapshot() {
  return useQuery({
    queryKey: ['mill-b-snapshot'],
    queryFn: () => getMillBSnapshot(),
    refetchInterval: 5_000,
    staleTime: 4_000,
    keepPreviousData: true,           // don't blank-screen on refetch
  });
}
```

```ts
// Atlas/hooks/useVerdict.ts (sketch)
import { postMillBVerdict } from '../../../API/herculesAIApi';

export function useVerdict() {
  return useQuery({
    queryKey: ['mill-b-verdict'],
    queryFn: () => postMillBVerdict(),
    refetchInterval: 60_000,
    staleTime: 55_000,
    retry: 0,                         // verdict failure must NOT cascade
    keepPreviousData: true,           // ribbon stays on previous sentence
  });
}
```

`AtlasLayout` uses `keepPreviousData` to honor Plan 16 §17: never blank-screen on a refetch failure.

## 8. Routing and navigation

### 8.1 Routes (Sam's 02_05 clarification — no swap)

Atlas is a **new, independent route at `/atlas`**. The existing `/hercules-ai` route is left intact. The page renders inside the same shell (top bar + sidebar) every other page uses — that wiring is owned by `AppRouter` / the shell layout, not by Atlas itself.

Edit `Frontend/src/Routes/AppRoutes.jsx`:

```jsx
import AtlasPage from '../Pages/Atlas/AtlasPage';
// existing imports stay:
// import HerculesAISetup from '../Pages/HerculesAI/HerculesAISetup';
// import HerculesAISettingsPage from '../Pages/HerculesAI/SettingsPage';

<Route path="atlas" element={<AtlasPage />} />                              // NEW
<Route path="hercules-ai" element={<HerculesAISetup />} />                  // unchanged
<Route path="hercules-ai/settings" element={<HerculesAISettingsPage />} />  // unchanged
```

No `/hercules-ai/legacy` route. No flag-driven page swap on `/hercules-ai`. The two pages are independent and both reachable. The top bar's "current page" pill (set in `Navbar.jsx`'s `PAGE_LABELS` map) gets a new entry: `'atlas': t('nav.atlas')`.

### 8.2 Feature flag (optional, in-development gating only)

A `localStorage` flag is **not** required for routing. Atlas is just a page at its own URL. We may still gate the nav-bar entry behind `localStorage.getItem('atlas.v1') === '1'` during Phases 1–3 so non-staff users don't see an in-development item — direct URL access still works for demos. Once Phase 4 ships, drop the gate.

### 8.3 Navbar

`Frontend/src/Data/Navbar.js`: **add** a new entry, do not modify the existing Hercules AI entry. The new entry slots in **after** Hercules AI (Intelligence section), before Engineering (System section).

```js
// existing entry stays:
//   { name: 'nav.herculesAI', link: '/hercules-ai', icon: Sparkles, ... }

// NEW entry — uses the Compass icon from lucide-react (matches v4 mockup):
{
  name: 'nav.atlas',
  icon: Compass,                      // import from 'lucide-react'
  tooltip: t('nav.tooltip.atlas'),
  link: '/atlas',
  roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  badgeEndpoint: '/api/hercules-ai/status',
}
```

The badge endpoint is shared since both pages care about the same plant-online status. The English fallback in the same file gets `'nav.atlas': 'Hercules Atlas'` and `'nav.tooltip.atlas': 'Live production & cost forecast'`.

### 8.4 i18n

Per CLAUDE.md, all four language files (`en.json`, `ar.json`, `hi.json`, `ur.json`) must add the new strings together. Approximate v1 string surface:

- New nav label `nav.atlas` — "Hercules Atlas"
- Page section labels (Today's headline, Right now, AI forecast · end of day, AI forecast · next shift, Estimated savings, vs plan)
- KPI labels and statuses (On track, Excellent, Slightly high, 1 watch)
- Chart titles and subtitles
- "Why?" CTA, "from cache" suffix, error/empty/loading copy

Use simple, non-technical language per CLAUDE.md Rule §5. Specifically: "Energy cost per ton" not "SEC OMR/t"; "On track" not "Within tolerance"; "AI forecast" not "Predicted projection".

## 9. Phased delivery

### Phase 1 — Static layout with mock data
Goal: page exists at `/atlas`, looks like the v3 mockup, runs on hardcoded sample data shaped exactly like §7.3.

Scope:
- New `Frontend/src/Pages/Atlas/` directory with all components from §5.1.
- New nav entry (gated to staff during dev — see §8.2).
- Hardcoded `mockSnapshot` constant returned by `useMillBSnapshot` (no network call).
- All design tokens wired through (imported from `Pages/HerculesAI/tokens.css`).
- All shared components imported from `Pages/HerculesAI/components/` per §5.2.
- Both themes validated.
- Wallboard density validated.

Exit criteria: Sam can navigate to `/atlas` and see the page render identically in light and dark, on a 1440×900 laptop and 1920×1080 wallboard. No backend changes shipped. The existing `/hercules-ai` page is unchanged.

### Phase 2 — Live data hookup (extend the shared snapshot endpoint)
Goal: page reads from a real, **shared** snapshot endpoint with deterministic math from raw `tag_history`. Numbers are real. Forecasts can still be naive (current-pace projection).

Scope:
- Implement `backend/ai_money/mill_b_snapshot.py` per Plan 16 §16, including the three new sections from §7.3 above.
- Add `GET /api/hercules-ai/mill-b-snapshot` route to the existing `backend/hercules_ai_bp.py` blueprint.
- Implement minimal forecast modules: EOD tons = `current_pace * remaining_operating_hours`; OMR/t forecast = current value held flat.
- Confidence bands set to ±5% placeholder.
- Add `getMillBSnapshot` and `postMillBVerdict` helpers to `Frontend/src/API/herculesAIApi.js`.
- Hook `useMillBSnapshot` to the real endpoint.
- Loading / error / empty states wired (use existing `LoadingState`, `ErrorState`, `EmptyState` imported from HerculesAI).
- Verdict ribbon still uses cached / sample text.

Exit criteria: numbers on the page match a hand-computed Mill B snapshot from `tag_history` within 2% (mirroring Plan 16 §25 success criteria for the orbs).

### Phase 3 — Real predictions (shared forecast modules)
Goal: replace naive forecasts with EWMA-of-same-DoW + current-pace blend, plus genuine confidence bands. Forecast modules live in the **shared** `backend/ai_forecast/` package so the existing Hercules AI page can adopt them too.

Scope:
- `backend/ai_forecast/production_eod.py` and `cost_per_ton.py` implemented.
- Forecast math: 70% weight on rolling current pace (last 1h), 30% weight on same-DoW historical average for the remaining hours.
- Confidence band = ± 1.5 × std dev of last 7 same-DoW days.
- Verdict ribbon hooked to `POST /api/hercules-ai/mill-b-verdict` (added to existing blueprint), with the constraints from Plan 16 §14.

Exit criteria: forecasts are stable across reloads, bands widen sensibly with horizon, verdict reads naturally and never invents numbers.

### Phase 4 — QA and nav un-gating
Goal: validate on the Salalah Mill B client PC and remove the dev gate from the navbar entry.

Scope:
- Run on the live client install. Tune copy, contrast, and motion with Sam.
- Drop the `atlas.v1` localStorage gate on the nav entry so the link is visible to all users by default.
- Document the new route in `CLAUDE.md` (Backend Blueprints / Key Directories sections).

Exit criteria: Sam signs off on the live client. Page passes Plan 16 §25 success criteria.

### Phase 5 — Optional 3D twin (post-v1)
Per Plan 16 §6. Only if Phases 1–4 leave room and the client wants it. Out of scope for this plan.

## 10. Dependencies

All already present in `Frontend/package.json`:
- `react-chartjs-2 ^5.3.0`, `chart.js ^4.5.0` — charts
- `@tanstack/react-query ^5.80.7` — snapshot polling
- `lucide-react ^0.352.0` — icons
- `clsx ^2.1.1` — classnames
- `tailwindcss ^3.4.17` — utility classes
- `@react-three/fiber ^8.17.0` and `three ^0.170.0` — only if Phase 5 ships

**No new npm packages required** for Phases 1–4.

Backend Python: no new packages. Snapshot math uses `psycopg2` queries on existing `tag_history`. Per CLAUDE.md, if any new package is added later, both `backend/requirements.txt` AND `backend/requirements-railway.txt` must be updated, plus `backend/hercules.spec` `hiddenimports`.

## 11. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Forecasts marketed as ML when they aren't | medium | high | Page wording says "AI forecast" (acceptable umbrella). Internal docs and verdict prompt forbid the word "predicts" — use "projects" or "expects". Already enforced by Plan 16 §1, §14. |
| `tag_history` queries slow under load at 5 s polling | medium | high | Plan 16 §22 mitigation: cached `tag_id` lookups, restrict windows to last 24 h on hot path, hourly rollups for projections. Add p95 timing to `/api/hercules-ai/mill-b-snapshot`. |
| Confidence bands look fake / hand-wavy | medium | medium | Phase 3 ties bands to real std dev of last 7 same-DoW days. Don't ship a band you can't defend. |
| `--hai-money` (gold) overused — visual noise | low | medium | Token comment says "the only gold on the page; reserved exclusively for OMR figures". Production hero uses gold for tons because tons are the money equivalent for a flour mill — confirm with Sam in Phase 1 review. If he objects, switch production accent to `--hai-data-3` (green). |
| OMR/ton confused with full cost | medium | high | Page label is "Energy cost per ton" everywhere. AI verdict prompt is constrained to never say "total cost per ton". Tooltip on the chart explains the formula. |
| Plan 16 §6 3D twin promised, v3 dropped it | low | medium | Phase 5 holds the option open. Document in client demo that twin is staged for a later release. |
| Build trigger fatigue — every push to `Salalah_Mill_B` builds installer (~8 min) | medium | low | Batch commits per phase; avoid pushing iterative WIP to the branch. CLAUDE.md already flags this. |
| Migration of `assets_view` still failing on client | medium | medium | Plan 15 §1. Snapshot module does NOT depend on `assets_view`. Independent failure path. |
| Two requirements files diverge if backend deps change | low | high | CLAUDE.md "Adding New Features" checklist; lint script in CI could check parity (out of scope here, worth flagging for later). |
| **Atlas duplicates HerculesAI primitives by accident** | medium | high | §2 architectural posture, §5.2 reuse table. Code review rule: any component, hook, or token that ends up under `Atlas/` must be Atlas-specific composition; if it's reusable, it lives under `HerculesAI/components/`. |
| **Two routes drift apart visually as HerculesAI evolves** | medium | medium | Both pages consume the same `tokens.css` and the same `components/`; visual drift requires a token change, which both pages inherit. Periodic visual diff in QA. |

## 12. Files touched (summary)

### New (Atlas-specific)
- `Frontend/src/Pages/Atlas/` — entire directory per §5.1 (separate sibling module to `HerculesAI/`)

### New (shared infra — lives outside Atlas, reusable by HerculesAI later)
- `backend/ai_money/mill_b_snapshot.py`
- `backend/ai_forecast/production_eod.py`
- `backend/ai_forecast/cost_per_ton.py`

### Modified
- `Frontend/src/Routes/AppRoutes.jsx` — add `atlas` route. **Existing `hercules-ai` route untouched.**
- `Frontend/src/Data/Navbar.js` — add `nav.atlas` entry. Existing entry untouched.
- `Frontend/src/API/herculesAIApi.js` — add `getMillBSnapshot` and `postMillBVerdict` helpers (extension, not replacement).
- `Frontend/src/Pages/HerculesAI/tokens.css` — add one new token: `--hai-forecast-band` (light + dark).
- `Frontend/src/i18n/{en,ar,hi,ur}.json` — string additions per §8.4.
- `backend/hercules_ai_bp.py` — add `GET /api/hercules-ai/mill-b-snapshot` and `POST /api/hercules-ai/mill-b-verdict` routes to the **existing** blueprint.
- `backend/hercules.spec` — `hiddenimports` += new modules.

### Untouched (explicitly — no swap, no fork)
- `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx` — existing Hercules AI page stays at `/hercules-ai`.
- `Frontend/src/Pages/HerculesAI/SettingsPage.jsx`
- `Frontend/src/Pages/HerculesAI/components/*` (only **add** missing primitives if needed; never modify existing)
- `Frontend/public/mill-b-digital-twin.html` (existing twin prototype, separate concern)
- All PLC code, DB defaults, ports per CLAUDE.md absolute rules

## 13. Open decisions (Sam input)

### Resolved 02_05
- ~~**Route name**~~ → **`/atlas`** (Sam, 02_05).
- ~~**Page name**~~ → **"Hercules Atlas"** (Sam, 02_05).
- ~~**App-shell integration**~~ → **inside the standard top bar + sidebar** with a new sidebar entry. Both light and dark themes mandatory. v4 mockup approved (Sam, 02_05).

### Still open
1. **Production hero accent color**: gold (`--hai-money`) like v3/v4 mockups, or green (`--hai-status-ok-600`) to keep gold reserved strictly for OMR? Recommendation: gold. Tons of flour are the throughput-money equivalent in this context, and the visual hierarchy works.
2. **Plan tons source**: pull `plan_tons` from `dynamic_orders` if an active order has a target, else hide the "vs plan" pill. Recommendation: yes, hide gracefully.
3. **Energy-cost-per-ton chart Y axis**: free-floating (1.20–1.65 in mockup) or anchored at zero? Recommendation: free-floating with grid lines every 0.10 OMR — anchoring at zero would flatten the variance the chart exists to show.
4. **Phase 1 ship target**: directly to `Salalah_Mill_B` (triggers installer build) or stage on `main` first then cherry-pick? Recommendation: ship Phase 1 to `main` first to validate the page in dev, then merge to `Salalah_Mill_B` once ready for client preview. Atlas being on its own route means the Salalah client never accidentally loses access to Hercules AI.
5. **Sidebar icon**: v4 mockup uses `Compass` from lucide-react (matches the "atlas" / navigator metaphor). Alternatives: `Globe`, `Map`. Recommendation: `Compass`.

## 14. Success criteria (mirrors Plan 16 §25, extended)

- Page renders within 1.5 s on the client laptop, both themes, all densities.
- Production hero, energy-cost hero, and both charts hand-verifiable from `tag_history` within 2%.
- Forecast values are stable: two reloads 30 s apart show the same number unless input data has changed.
- Verdict ribbon never invents a number not present in the snapshot.
- Page survives 60 s network blip and an LLM outage with no error toast.
- Light theme and wallboard density both pass WCAG AA contrast.
- The existing `/hercules-ai` page is unchanged and reachable throughout all phases — no regressions in Hercules AI Setup, Settings, or any related route.
- A grep for hardcoded hex colors or duplicated `MetricCard`-like components inside `Pages/Atlas/` returns zero hits.

## 15. References

- `15_Salalah_Mill_B_Hercules_AI_Data_Inventory_01_05.md` — production data sample, tag inventory, broken rollup tables
- `16_Hercules_AI_Mill_B_Atlas_Redesign_Plan_01_05.md` — concept, layout, snapshot contract, deterministic math, phases (this plan extends, does not replace it)
- `prototypes/mill_b_atlas_mockup_v3.html` — approved visual reference
- `Frontend/src/Pages/HerculesAI/tokens.css` — design system source of truth
- `Frontend/src/Pages/HerculesAI/components/` — reusable component inventory
- `CLAUDE.md` — production safety rules, plan naming, i18n, requirements files, hidden imports
