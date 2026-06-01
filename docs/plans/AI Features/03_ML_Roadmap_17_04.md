# Plan 3 — Machine Learning Roadmap — 2026-04-17

## Context

Hercules has rich 1-second PLC data but historically <30 days of retained history per site. ML must therefore ship infrastructure day one, remain silent until data depth crosses a threshold, and — above all — refuse to generate noise. The owner has explicitly rejected an ML stack that flags weekend shutdowns, stable production, and zero-variance sensors as "anomalies". This plan bakes those rejections into code, not just policy.

The plan reuses existing surfaces: `backend/workers/dynamic_archive_worker.py` for cadence, `tag_history` + `tag_history_archive` for data, `hercules_ai_tag_profiles` for the tag-type classification (`rate`, `counter`, `analog`, `percentage`, `boolean`, `id_selector`), and `shifts_config.json` for production-calendar awareness.

## Data-depth timeline

Features activate only when the site has enough retained history. Until the threshold is crossed, the feature's status on the Model Readiness page reads `Awaiting data: N more days`. Thresholds are audited nightly.

| Day | Activates | Requirement |
|-----|-----------|-------------|
| 1 | F1 Stuck-value detection, F2 Live SEC | No history needed; runs on current tag cache. |
| 2 | F3 Shift benchmarking | 2 complete shifts of data. |
| 14 | F4 Short-window anomaly, F5 SEC drift | 14 days of clean (post-filter) data. |
| 30 | F6 Root-cause decomposition, F7 Daily-seasonality anomaly | 30 days to establish daily baseline. |
| 60 | F8 Prophet production forecast | 60 days to capture weekly seasonality. |
| 90 | F9 Tariff-aware cost forecast | Plan 2 shipped; 90 days of kWh+cost history. |
| 180 | F10 Motor degradation pilot | `maintenance_events` table populated with ≥3 labelled events. |

"Clean data" means rows surviving the noise-reduction filter below — not calendar days.

## Day-1 infrastructure

All shipped regardless of data depth.

**New folder `backend/ml/`:**

```
backend/ml/
├── __init__.py
├── cost_calculator.py          # Plan 2
├── stuck_detector.py           # F1
├── sec_calculator.py           # F2
├── shift_benchmark.py          # F3
├── anomaly_isolation.py        # F4
├── sec_drift.py                # F5
├── root_cause.py               # F6
├── seasonality_anomaly.py      # F7
├── forecast_prophet.py         # F8
├── cost_forecast.py            # F9
├── motor_degradation.py        # F10
├── filters.py                  # noise-reduction logic shared by all features
├── model_registry.py           # DB access for ml_model_registry
└── ml_worker.py                # nightly scheduler entry; no-op logging until F-threshold crossed
```

**Five new tables:**

```sql
-- backend/migrations/create_ml_tables.sql

CREATE TABLE ml_anomaly_events (
    id             BIGSERIAL PRIMARY KEY,
    feature_id     VARCHAR(8)  NOT NULL,  -- 'F4', 'F5', 'F7' ...
    detected_at    TIMESTAMP   NOT NULL,
    window_from    TIMESTAMP   NOT NULL,
    window_to      TIMESTAMP   NOT NULL,
    tag_id         INT         REFERENCES tags(id) ON DELETE SET NULL,
    tag_name       VARCHAR(128),
    layout_id      INT         REFERENCES live_monitor_layouts(id) ON DELETE SET NULL,
    score          NUMERIC(10,4) NOT NULL,       -- raw statistical score
    significance   NUMERIC(10,4) NOT NULL,       -- 0..1; passes floor before insert
    delta_pct      NUMERIC(10,2),                -- vs baseline
    baseline_value NUMERIC(14,4),
    observed_value NUMERIC(14,4),
    narrative      TEXT,                         -- LLM-written, optional
    suppressed     BOOLEAN DEFAULT FALSE,        -- user dismissal
    created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_anomaly_window ON ml_anomaly_events(window_to DESC, significance DESC);

CREATE TABLE ml_model_registry (
    id             SERIAL PRIMARY KEY,
    feature_id     VARCHAR(8)  NOT NULL,
    tag_id         INT         REFERENCES tags(id) ON DELETE CASCADE,
    layout_id      INT         REFERENCES live_monitor_layouts(id) ON DELETE CASCADE,
    model_path     TEXT        NOT NULL,         -- file on disk
    trained_at     TIMESTAMP   NOT NULL,
    training_rows  INT         NOT NULL,
    training_span_days INT     NOT NULL,
    metrics        JSONB,                        -- { "mape": 0.09, "contamination": 0.02 }
    is_active      BOOLEAN     DEFAULT TRUE,
    UNIQUE(feature_id, tag_id, layout_id)
);

CREATE TABLE ml_forecasts (
    id             BIGSERIAL PRIMARY KEY,
    feature_id     VARCHAR(8)  NOT NULL,
    tag_id         INT,
    layout_id      INT,
    generated_at   TIMESTAMP   NOT NULL,
    forecast_ts    TIMESTAMP   NOT NULL,
    value_p50      NUMERIC(14,4),
    value_p10      NUMERIC(14,4),
    value_p90      NUMERIC(14,4),
    UNIQUE(feature_id, tag_id, layout_id, forecast_ts, generated_at)
);

CREATE TABLE sec_history (
    id             BIGSERIAL PRIMARY KEY,
    layout_id      INT         REFERENCES live_monitor_layouts(id),
    order_name     VARCHAR(128),
    window_from    TIMESTAMP   NOT NULL,
    window_to      TIMESTAMP   NOT NULL,
    kwh_consumed   NUMERIC(14,4) NOT NULL,
    tonnes_produced NUMERIC(14,4) NOT NULL,
    sec_kwh_per_t  NUMERIC(10,4) NOT NULL,
    computed_at    TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_sec_window ON sec_history(layout_id, window_to DESC);

CREATE TABLE ml_exclusion_windows (
    id             SERIAL PRIMARY KEY,
    window_from    TIMESTAMP   NOT NULL,
    window_to      TIMESTAMP   NOT NULL,
    scope          VARCHAR(32) NOT NULL,     -- 'global' | 'layout' | 'tag'
    layout_id      INT         REFERENCES live_monitor_layouts(id) ON DELETE CASCADE,
    tag_id         INT         REFERENCES tags(id) ON DELETE CASCADE,
    reason         VARCHAR(256),
    created_by     INT         REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMP DEFAULT NOW()
);
```

**Nightly worker.** `backend/ml/ml_worker.py` runs at 02:00 local (lowest plant activity). It iterates features, checks thresholds, trains or scores, writes results. Until any feature is ready, it still logs — a plant operator can open the Model Readiness page and see exactly what is blocking activation.

**Model Readiness page.** New route `/app-settings/ml-models` (admin only), page at `Frontend/src/Pages/AppSettings/MlModels.jsx`. Lists every feature with status badge (`ready` / `awaiting data: N days` / `training` / `error`), last training metrics, and a "Train now" button. Non-tech-facing — the page explains in plain English why a feature isn't active yet.

## Noise-reduction rules

This is the whole point. These rules run in `backend/ml/filters.py` as a chain applied to every training query and every scoring window. No feature calls ML primitives without going through the chain first.

**R1 — Equipment-on gate.** Each rate-type tag in `hercules_ai_tag_profiles` declares its `parent_boolean_tag` (the on/off sensor for the machine). A row is kept only if the parent boolean was TRUE at that timestamp. If no parent boolean exists, the tag is not eligible for ML; the profile UI surfaces this as "ML not available until parent sensor linked".

**R2 — Shutdown auto-detection.** A contiguous window where every boolean equipment tag on a line reads OFF is automatically treated as shutdown. `filters.py` materialises these windows into an in-memory interval tree per day; any query intersecting a shutdown window is clipped. The window is NOT inserted into `ml_exclusion_windows` — it is computed on the fly and is not user-editable.

**R3 — Weekend/holiday mask.** `shifts_config.json` declares operational days and shift times. Periods outside declared shifts are masked. If the user selects Friday as non-production, Friday data never enters training or scoring. The admin can override per-feature via the Model Readiness page (one checkbox: "train on weekends").

**R4 — Order-change buffer.** The `order_name` column is tracked; any window within ±15 minutes of a change is excluded. Order-change often includes intentional ramp-down, purge, changeover — that is real process noise, not anomalous behaviour.

**R5 — Minimum variance floor.** Before any tag is admitted to training, compute rolling 30-day coefficient of variation. Reject if < 0.01. This kills "anomalies" on pegged sensors (always 0, always 100%) that are almost certainly dead rather than actually anomalous.

**R6 — Significance floor.** A scoring result is inserted into `ml_anomaly_events` only if BOTH:
- Statistical novelty: z-score > 3 OR IsolationForest score < −0.2.
- Practical delta: `|observed − baseline| > 0.20 × baseline_range_p10_p90`.

Either alone is insufficient. This is the single rule that most directly addresses the owner's "don't flag shutdowns as anomalies" concern.

**R7 — User override.** The `ml_exclusion_windows` table lets admins blank out any period with a reason. An "Exclude" button appears on every anomaly event detail view — one click inserts a window covering the event's range. Retraining respects these windows.

**R8 — Quality code filter.** Rows with `quality_code IN ('BAD', 'STALE', 'COMM_ERROR')` are dropped. Already present in the historian; this plan formalises it.

Together, R1–R8 typically cut training-data volume by 30–60% on a real mill, and cut raised anomalies by 90–95%. The remaining signal is worth reading.

## Per-feature specifications

### F1 — Stuck-value detection (day 1)
- **Question:** Is a sensor stuck (identical value for too long)?
- **Algorithm:** For each active tag in the 1-second cache, compare the last N=600 samples (10 minutes). If all identical AND the tag's 30-day CoV > 0.01, flag.
- **Data needed:** Live cache only.
- **Noise reduction:** R5 prevents pegged-zero sensors from ever triggering. R1 ensures we only flag a stuck reading while the equipment is meant to be producing signal.
- **Failure mode:** A legitimately idle tag (a setpoint) looks stuck. Mitigated by R5 on historical variance.
- **Cost:** 0.5 day.

### F2 — Live SEC (day 1)
- **Question:** What is the specific energy consumption right now (kWh per tonne)?
- **Algorithm:** Over the last 60 minutes, integrate energy-meter tag (`unit = 'kWh'`) and production-counter tag (`unit IN ('kg', 't')`). Divide. Publish to UI and cache into `sec_history` once per completed order.
- **Data needed:** One energy tag + one production counter per line, linked in `hercules_ai_tag_profiles`.
- **Noise reduction:** Skip windows where production < 5% of typical — avoids ∞ SEC.
- **Failure mode:** Wrong tag linkage produces garbage SEC. UI shows the tag pair so the operator can verify.
- **Cost:** 1 day.

### F3 — Shift benchmarking (day 2+)
- **Question:** Which shift made the most tonnes per kWh this week?
- **Algorithm:** SQL GROUP BY shift × day on `sec_history`. No model needed.
- **Data needed:** `shifts_config.json` declaring shift boundaries; `sec_history` rows.
- **Noise reduction:** R4 (order changes) + R3 (non-production shifts).
- **Failure mode:** Short shifts compared unfairly. Report shows hours produced.
- **Cost:** 1 day.

### F4 — Short-window anomaly (day 14)
- **Question:** Did any tag just deviate sharply vs its 4-hour trailing profile?
- **Algorithm:** Per rate/analog tag, train IsolationForest weekly on 14 days of filtered data, features = `(value, rolling_mean_1h, rolling_std_1h, hour_of_day)`. Score every completed hour. Apply R6 before insert.
- **Data needed:** 14 days clean data per tag.
- **Noise reduction:** All R-rules applied to both training and scoring. Contamination fixed low (0.02); we accept lower recall for lower FPR.
- **Failure mode:** Seasonal drift causes quarterly retraining staleness — handled by weekly retrain cadence.
- **Cost:** 2 days.

### F5 — SEC drift alerts (day 14)
- **Question:** Has specific energy consumption drifted upward over the last week vs prior three weeks?
- **Algorithm:** Per line, compute rolling 7-day SEC median. Compare against prior 21-day median. Trigger alert if >8% upward drift persists for 48 hours.
- **Data needed:** 14 days in `sec_history`.
- **Noise reduction:** Alert only when drift persists — single-day spikes ignored. Product/grade segmentation via `order_name` prefix.
- **Failure mode:** Genuine grade change looks like drift. Solution: require grade-matched comparison (same `order_name` prefix in both windows).
- **Cost:** 1 day.

### F6 — Root-cause decomposition (day 30)
- **Question:** When F4/F5 fires, which other tags moved in sympathy?
- **Algorithm:** Around the anomaly window, compute Pearson correlation against every related tag (same line per `hercules_ai_tag_profiles`). Rank top-5. Feed to LLM with structured context; LLM writes 2-sentence narration. The LLM NEVER computes correlation.
- **Data needed:** 30 days clean data; ≥5 related tags per line.
- **Noise reduction:** Only tags with variance above R5 floor are considered. Trivial correlations (|r| < 0.3) dropped.
- **Failure mode:** Spurious correlation. Mitigated by narrative template: "moved in sympathy" — no causal claim.
- **Cost:** 2 days.

### F7 — Daily-seasonality anomaly (day 30)
- **Question:** Is today's hourly pattern different from the typical same-day-of-week pattern?
- **Algorithm:** STL decomposition per tag; compare today's residual to residual distribution of last 30 days.
- **Data needed:** 30 days.
- **Noise reduction:** R3 masks non-production days entirely.
- **Failure mode:** Ramadan shift patterns vary — 30-day window may not capture. Solution: admin can explicitly label seasonal periods via `ml_exclusion_windows`.
- **Cost:** 2 days.

### F8 — Prophet production forecast (day 60)
- **Question:** What will the next 7 days of production look like?
- **Algorithm:** Facebook Prophet per line on daily aggregated production. Weekly seasonality + holidays from `shifts_config`.
- **Data needed:** 60 days.
- **Noise reduction:** Training uses filtered daily data only.
- **Failure mode:** Step changes (new equipment) break the model. Solution: admin can mark a "regime break" that resets training origin.
- **Cost:** 2 days.

### F9 — Tariff-aware cost forecast (day 90)
- **Question:** What will next week's electricity bill be?
- **Algorithm:** F8 production forecast × per-tonne kWh ratio × tariff from Plan 2.
- **Data needed:** 90 days; Plan 2 active.
- **Noise reduction:** Inherits F8's filters.
- **Failure mode:** Tariff change mid-forecast horizon; handled by calculator's `TariffOutOfWindowError`.
- **Cost:** 1 day.

### F10 — Motor degradation pilot (day 180)
- **Question:** Is a motor's power draw trending upward at constant load?
- **Algorithm:** Regress power on load; monitor intercept drift.
- **Data needed:** 180 days; a `maintenance_events` table with ≥3 labelled service events to validate against.
- **Noise reduction:** Only windows with load in a narrow band (±5% around median).
- **Failure mode:** Viscosity/temperature confounders. Explicitly a pilot — ships behind a feature flag and is not advertised externally until validated.
- **Cost:** 5 days (includes labelling workflow).

## Model governance

- **Retraining cadence.** F4, F7 weekly. F5 daily. F8 monthly. F9 monthly. F10 manual.
- **Metrics tracked** in `ml_model_registry.metrics`: MAPE for forecasts, contamination rate and precision-at-alert for anomaly features.
- **Model files** in `%APPDATA%/Hercules/ml_models/` on desktop, `/var/lib/hercules/ml_models/` on server. Each file named `<feature>_<tag_id>_<timestamp>.pkl`. Registry row is the canonical reference.
- **Versioning.** Each retraining creates a new registry row; the prior row is marked `is_active = FALSE` but retained for rollback.

## Integration with the LLM layer

ML results are structured inputs to `ai_prompts.py` — never narrated by the model autonomously.

- `build_insights_prompt` gains an `ml_signals` block containing raw anomaly events (significant ones only) and SEC drift direction.
- The prompt instructs: "Quote only ML events with `significance >= 0.7`. Say 'detected by anomaly model' and include the tag name. Do not speculate about cause beyond the correlation list."

This pattern means an LLM hallucination cannot invent an anomaly — the event must exist in `ml_anomaly_events` to be mentioned.

## Explicitly out of scope

- LSTM / transformer models. Prophet + IsolationForest suffice; deep learning adds training complexity without payoff at current data depth.
- LLM fine-tuning. Prompt engineering is cheaper and traceable.
- Digital twin / physics simulation. Beyond scope; belongs in a future SCADA-integration track.
- Demand forecasting from ERP/order book — no ERP integration exists.
- Weather-based forecasting — climate signal is tiny for an indoor mill.

## KPIs for the ML system itself

- **False-positive rate < 1 per site per day** (hard target). Measured by user dismissal rate on anomaly events.
- **Alert precision > 60%** by 90 days. Precision = dismissals / total events, inverse target.
- **Forecast MAPE < 12%** by day 90 on F8 production.
- **Feature activation rate.** 100% of applicable features across a site reach `ready` status within their stated threshold days — otherwise the Model Readiness page must surface the reason (missing tag linkage, insufficient clean data after filters, etc.).

## Implementation cost

| Phase | Days | Work |
|-------|------|------|
| Foundation | 4 | Migrations, `backend/ml/` skeleton, `filters.py`, `ml_worker.py`, Model Readiness page. |
| F1, F2 | 1.5 | Stuck detection + live SEC. |
| F3 | 1 | Shift benchmark SQL. |
| F4, F5 | 3 | IsolationForest + SEC drift. |
| F6, F7 | 4 | Correlation + STL. |
| F8, F9 | 3 | Prophet + cost forecast. |
| F10 | 5 | Motor pilot (behind flag). |

**Total: ~21 days**, though note F6+ unlock only after calendar time accrues; F10 can defer indefinitely.

## What success looks like

- On day 1 of a new install, Model Readiness shows F1, F2 live; all others show clear countdowns.
- No anomaly events fire during weekend shutdowns.
- When an anomaly does fire, the narrative cites a named tag and a named time.
- MAPE on 7-day production forecast holds under 12% at a 90-day-old site.
- The owner, reviewing a month of alerts, agrees that at least 6 in 10 merited attention.

## Out of scope

- Real-time streaming anomaly detection (hourly batch is enough).
- Per-motor vibration analysis (requires accelerometers beyond PLC).
- Auto-retraining from user dismissals (supervised feedback loop — future).
- Multi-site cross-training (no cross-customer data sharing permitted).
- Any ML touching user-PII or chat content.
