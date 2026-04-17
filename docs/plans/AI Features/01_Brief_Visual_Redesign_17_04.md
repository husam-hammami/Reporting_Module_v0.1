# Plan 1 — Plant Status Briefing Visual Redesign — 2026-04-17

## Context

The "Plant Status" briefing is the flagship AI surface. It is rendered in `Frontend/src/Pages/HerculesAI/HerculesAISetup.jsx:534` via the `InsightCard` component (`HerculesAISetup.jsx:117`). Today it is a vertical stack of `InsightCard`s — one global overview card followed by one card per report (`HerculesAISetup.jsx:618`). Each card contains 400–800 words of prose bullets.

Backend produces this prose in `backend/hercules_ai_bp.py:1116` (`generate_insights`) using `build_insights_prompt` (`backend/ai_prompts.py:27`) and `build_single_report_prompt` (`backend/ai_prompts.py:113`). Output is free-text markdown — there is no structured JSON contract between backend and UI.

## Diagnosis — why the current UI fails

1. **Uniform typography.** Every bullet uses the same weight, size, colour. A plant manager scanning in 5 seconds cannot tell a critical value from a trivia line. The screen reads as a wall.
2. **Prose sentences for data.** Numbers live inside sentences like "Total flow was approximately 12,450 kg during the period, a moderate change compared to yesterday." A number belongs in a hero font; surrounding language should be compressed to a delta pill.
3. **Four duplicate per-report sections.** When three reports all reference the same physical mill line (e.g. Mill B), the user sees Mill B mentioned three times in three different prose flavours. The physical asset is the natural grouping unit, not the report that happened to include it.
4. **Extreme percentage artefacts.** `↑2,069%`, `↓100%`, `↑∞` appear when a baseline was zero or the asset was idle. These are mathematically correct and cognitively useless — they blow the attention hierarchy and train the user to ignore red numbers.
5. **No verdict.** There is nothing on the screen that answers the 5-second question: "Is the plant OK right now?" The user must read ~2,000 words to form that judgement.
6. **No drill-through.** Every interesting claim ("output dropped") is an inert bullet. There is no link to the report, tag, or time range that evidences it.

## Redesign principles

- **Attention hierarchy.** One verdict at the top. Three or fewer attention items. Then metrics grouped by physical asset. Then collapsed detail.
- **Data density.** Replace sentences with number + unit + delta pill + sparkline. Reserve prose for causal narration only.
- **Visual over verbal.** Gauges, rings, sparklines and badges are processed faster than digits inside paragraphs.
- **Progressive disclosure.** Default view fits on one screen. Detail is one click away, never three.
- **Fewer, larger, meaningful units.** One card per physical asset (Mill B, C32, Reception) — not per report.
- **Server clamps the absurd.** The backend sanitises before the UI ever sees a percentage.

## New component set

All components live in `Frontend/src/Pages/HerculesAI/components/` (new folder).

### `StatusHero`
- **Purpose:** The 5-second verdict.
- **Props:** `{ status: 'green'|'amber'|'red', verdict: string, generatedAt: string, period: string }`
- **Layout:** Full-width band at top of briefing. Large traffic-light dot (32px). Eight-word verdict (e.g. "Running well; C32 power factor below target"). Right-aligned meta line: period + generated time.
- **Rule:** `verdict` is capped at 80 characters by the prompt and by a frontend slice.

### `AttentionCard`
- **Purpose:** The short list of things the manager must act on.
- **Props:** `{ items: Array<{ severity, asset, headline, evidence, drill: { type, id, from, to } }> }`
- **Layout:** Maximum three items. Each row: severity chip, asset tag, 10-word headline, 18-word evidence sentence, `Open` button routing to the source report.
- **Rule:** If the model produces more than three, backend truncates by severity then recency. Empty state renders a green "Nothing requires attention" band.

### `MetricCard`
- **Purpose:** A single headline number.
- **Props:** `{ label, value, unit, delta, deltaDirection, sparkline, status }`
- **Layout:** 56px hero number, 11px unit, delta pill (colour-coded), 40×120 sparkline, label beneath.
- **Rule:** Delta pill shows "idle → 42 kW" instead of "↑∞%". Numbers never exceed ±500% display.

### `PowerFactorGauge`
- **Purpose:** Single-purpose visual for a metric that has a hard target.
- **Props:** `{ value: number, target: number, penaltyThreshold: number }`
- **Layout:** Arc from 0 to 1. Red zone 0–0.85, amber 0.85–0.9, green 0.9–1.0. Pointer at current value. Target tick marker.

### `ProductionTargetRing`
- **Purpose:** Progress toward today's production target.
- **Props:** `{ produced: number, target: number, unit: string, timeElapsedFraction: number }`
- **Layout:** Circular progress ring, inner number, pace indicator (e.g. "on pace" / "behind by 2.3 hr").

### `AssetPanel`
- **Purpose:** Replace the four duplicate per-report sections with one per physical asset.
- **Props:** `{ assetName, kpis: MetricCard[], notes: string[], relatedReports: [{ id, name }] }`
- **Layout:** Collapsed header showing asset name + overall status dot + two headline metrics. Expand reveals full MetricCard grid and any narration.
- **Rule:** Panels auto-expand only if the asset appears in `AttentionCard` items.

### `BriefingFooter`
- **Purpose:** Trust anchors.
- **Props:** `{ model, tokens, promptVersion, sources: string[] }`
- **Layout:** One-line muted row — "Generated by Sonnet 4.6 • 2,140 in / 610 out • v3 prompt • 3 reports."

## Backend contract change

Replace the current markdown-blob response from `POST /hercules-ai/insights` (`backend/hercules_ai_bp.py:1114`) with a structured JSON object. This is the load-bearing change.

```json
{
  "generated_at": "2026-04-17T09:15:00Z",
  "period": { "from": "2026-04-16T00:00:00Z", "to": "2026-04-17T00:00:00Z", "label": "Yesterday" },
  "status_hero": {
    "status": "amber",
    "verdict": "Running well; C32 power factor below target"
  },
  "attention_items": [
    {
      "severity": "amber",
      "asset": "C32 Mill",
      "headline": "Power factor 0.82, below 0.90 target",
      "evidence": "Held below target for 4h 10m from 02:00. Last hour 0.79.",
      "drill": { "type": "tag", "tag_name": "C32_PF_AVG", "from": "...", "to": "..." }
    }
  ],
  "assets": [
    {
      "name": "Mill B",
      "status": "green",
      "kpis": [
        {
          "label": "Throughput",
          "value": 12450,
          "unit": "kg",
          "delta": { "pct": 3.1, "direction": "up", "baseline_label": "vs prior day" },
          "sparkline": [12200, 12310, 12540, 12450],
          "status": "green"
        }
      ],
      "notes": ["SEC 42.1 kWh/t, within historical band."],
      "related_report_ids": [17, 19]
    }
  ],
  "metrics_global": [ /* ... MetricCard shape ... */ ],
  "meta": { "model": "claude-sonnet-4.6", "prompt_version": 3, "tokens_in": 2140, "tokens_out": 610 }
}
```

Legacy markdown output is kept only for distribution email bodies; the UI consumes JSON only.

## Prompt changes (`backend/ai_prompts.py`)

Rewrite `build_insights_prompt` to emit JSON with an explicit schema in the system message. Core instructions:

```
You are a plant operations briefing writer. You MUST respond with ONE valid JSON
object matching the schema below. No prose outside JSON.

Rules:
- `status_hero.verdict` max 80 characters, no numbers inside it.
- `attention_items` array length 0..3. Sort by severity (red > amber), then recency.
- Omit any item where the underlying delta is < 5% AND the asset is not already
  in an attention state.
- Percentages: never output above 500 or below -500. For zero-baseline transitions
  use the phrase "was idle, now Xkw" inside `evidence` and set `delta.pct` to null.
- Group KPIs by physical asset, NOT by report. If three reports each mention
  "Mill B", merge into one asset entry and cite `related_report_ids`.
- Use only tags and values present in the supplied data bundle. Do not invent.
- One decimal place for ratios, zero for weights > 1000, three for small flows.
```

A new helper `sanitize_insights_payload(obj)` in `backend/ai_prompts.py` runs post-LLM:

- Clamps every `delta.pct` into `[-500, 500]`; if clamped, replaces human text with "was idle, now Xkw" template when the prior value was 0.
- Deduplicates `attention_items` by `(asset, headline[:30])`.
- Merges `assets[]` entries by `name` (case-insensitive, trimmed).
- Caps total items: 3 attention, 8 assets, 12 global metrics.
- If JSON is malformed, one retry with error fed back; second failure returns a minimal stub object so the UI never sees null.

## Responsive behaviour

Mobile-first because plant managers use phones on the floor.

- <640px: `StatusHero` stacks label under dot; `AttentionCard` rows wrap evidence under headline; `AssetPanel` default-collapses all panels; `MetricCard` grid is 1 column.
- 640–1024px: 2-column metric grid; asset panels still collapsed except attention-linked ones.
- >1024px: 3-column metric grid, first two asset panels auto-expanded, rest collapsed.
- Print stylesheet: everything expanded, sparklines keep, colours kept for PDF export.

## Implementation plan — file-by-file

Target ~8 developer-days.

**Day 1 — Backend schema and prompt.**
- `backend/ai_prompts.py`: rewrite `build_insights_prompt` (~80 lines replacement), add `sanitize_insights_payload` (~120 lines), keep `build_single_report_prompt` intact for distribution emails.
- Add `INSIGHTS_SCHEMA_VERSION = 3` constant.
- Unit tests in `backend/tests/test_ai_prompts.py` for sanitisation (clamp, dedup, merge, retry).

**Day 2 — Endpoint.**
- `backend/hercules_ai_bp.py:1114`: `/insights` now wraps the model call, JSON-parses, sanitises, validates against schema, returns structured object. Add `?format=markdown` query param for backward compatibility with the distribution engine.
- ~150 lines diff.

**Day 3 — Component scaffolding.**
- Create `Frontend/src/Pages/HerculesAI/components/` with `StatusHero.jsx`, `AttentionCard.jsx`, `MetricCard.jsx`, `PowerFactorGauge.jsx`, `ProductionTargetRing.jsx`, `AssetPanel.jsx`, `BriefingFooter.jsx`. Each ~60–120 lines.
- Use existing Tailwind tokens; no new global styles.

**Day 4 — Integration into `HerculesAISetup.jsx`.**
- Replace the block at `HerculesAISetup.jsx:534` with `<BriefingView data={insightsResult} />`.
- Remove the `InsightCard` loop at `HerculesAISetup.jsx:618`. Keep `InsightCard` file for email previews only.
- ~200 lines diff in the setup page.

**Day 5 — Drill-through wiring.**
- Each `AttentionCard` item's `Open` button routes via `react-router` to the correct report or tag detail view with time range in query params.
- Wire `related_report_ids` chips on `AssetPanel`.

**Day 6 — Responsive + print.**
- Tailwind responsive classes, print stylesheet tested with `exportAsPDF` in `exportReport.js`.

**Day 7 — Distribution engine compatibility.**
- `backend/distribution_engine.py`: when rendering email body, call `/insights?format=markdown` path that internally re-formats the JSON payload into the existing markdown template so existing mail clients and saved PDFs keep working.

**Day 8 — QA pass.**
- Visual regression snapshots via Vitest + `@testing-library/react` for each new component.
- Manual QA matrix: green/amber/red status, 0/1/2/3 attention items, zero-baseline deltas, single-asset briefing, 10-asset briefing.

## Mockup — ASCII wireframe

```
+----------------------------------------------------------------------+
| HERCULES PLANT STATUS                            Yesterday  09:15 AM |
+----------------------------------------------------------------------+
| +-----------------------------------------------------------------+ |
| | ●  AMBER   Running well; C32 power factor below target          | |
| |            Period: 16 Apr 00:00 - 17 Apr 00:00  (24h)           | |
| +-----------------------------------------------------------------+ |
|                                                                      |
|   NEEDS ATTENTION  (2)                                                |
|  +------------------------------------------------------------------+|
|  | ● C32 MILL     Power factor 0.82, below 0.90 target              ||
|  |                Held below target 4h10m from 02:00. Last hr 0.79. ||
|  |                                                 [ Open report ]  ||
|  +------------------------------------------------------------------+|
|  | ● RECEPTION    Dust cyclone inlet vacuum dropped 18% overnight   ||
|  |                Last healthy reading 18:40. Recheck filter bags.  ||
|  |                                                 [ Open report ]  ||
|  +------------------------------------------------------------------+|
|                                                                      |
|   PRODUCTION TODAY                                                    |
|  +--------------------+  +--------------------+  +------------------+|
|  | Throughput         |  | SEC                |  | PowerFactor      ||
|  |  12,450 kg  ↑3.1%  |  |  42.1 kWh/t  ↓1.2% |  |   (gauge arc)    ||
|  |  /\/\_/^\/\        |  |  _/\_/^\_/         |  |   pointer 0.88   ||
|  +--------------------+  +--------------------+  +------------------+|
|                                                                      |
|   ▸ MILL B     ● green    12,450 kg | 42.1 kWh/t             [+]     |
|   ▾ C32 MILL   ● amber     9,820 kg | 0.82 PF                [-]     |
|       +------------------+  +------------------+  +---------------+  |
|       | Throughput       |  | SEC              |  | Runtime       |  |
|       |  9,820 kg ↑0.4%  |  | 45.8 kWh/t ↑2.1% |  | 22h 15m       |  |
|       +------------------+  +------------------+  +---------------+  |
|       Notes: PF dip correlates with compressor-2 start at 01:58.     |
|       Related reports: #17 C32 Daily, #19 Energy Summary             |
|                                                                      |
|   ▸ RECEPTION  ● amber     vacuum low                        [+]     |
|                                                                      |
+----------------------------------------------------------------------+
|  Generated by Sonnet 4.6 • 2,140 in / 610 out • v3 prompt • 3 rpts   |
+----------------------------------------------------------------------+
```

## What success looks like

- A plant manager can answer "is the plant OK?" in under 5 seconds from any device.
- Attention items drop from ~18 bullets to ≤3 per briefing.
- Zero instances of "↑2,069%" or similar artefacts in production over a 30-day window.
- Assets appear once each, even when three reports reference them.
- The briefing renders in a single screen on a 14" laptop at default zoom.

## Implementation cost

| Day | Work |
|-----|------|
| 1 | Prompt rewrite + sanitiser + prompt tests |
| 2 | `/insights` endpoint + schema validation |
| 3 | 7 React components scaffold |
| 4 | `HerculesAISetup.jsx` integration |
| 5 | Drill-through routing |
| 6 | Responsive + print |
| 7 | Distribution engine backward compat |
| 8 | QA + visual snapshot tests |

Total: 8 days, one engineer.

## Out of scope

- No changes to `AiInsightsPanel.jsx` (reports side panel) — that is a separate surface.
- No changes to the email template rendered by `distribution_engine.py` beyond the backward-compat adapter.
- No new tag groups, KPI definitions, or data pipelines.
- No chart library swap — sparklines reuse existing Chart.js wrapper.
- No mobile-native components — this remains a responsive web UI.
