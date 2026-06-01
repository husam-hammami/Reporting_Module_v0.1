# Plan 2 — Electricity Tariff Ingestion and Cost Calculation — 2026-04-17

## Context

The Salalah mill is a Cost-Reflective Tariff (CRT) customer under Oman's APSR framework. No cost data currently lives in the Hercules database: every report shows kWh but no OMR. Making energy economic requires a tariff table, a calculator, and a few thin integration points. This plan commits to minimal schema change (one table + one settings row) and zero scraping of legally binding rate documents.

## Oman CRT primer

APSR (Authority for Public Services Regulation) publishes a Cost-Reflective Tariff annually. Non-residential customers with consumption above 100 MWh/year are mandatory CRT participants. The Salalah mill exceeds this threshold by an order of magnitude.

CRT is a four-component tariff. Every monthly bill sums:

1. **Energy charge.** Hourly rate in baisa/kWh referencing the Public Wholesale (PWP) Bulk Supply Tariff. It varies by hour of day and season; July–August are cheapest because the regulated market values demand suppression in other months, not summer.
2. **Transmission Use of System (TUoS) charge.** A RO/MW charge applied to the customer's peak coincident demand for the month, depending on voltage level (400 kV, 132 kV, 33 kV, 11 kV, 0.415 kV).
3. **Distribution Use of System (DUoS) charge.** A baisa/kWh charge on all energy transported through the distribution network. For Dhofar customers, this is Nama Dhofar Services.
4. **Supply charge.** A fixed RO/month per customer account.

All four must be represented in the data model. Any plan that stores only a single "rate per kWh" will produce wrong numbers by 15–40%.

Relevant sources:

- APSR tariff portal: `https://apsr.om/en/tariffs`
- Nama Dhofar 2025 CRT Statement (English): `https://distribution.nama.om/PDF/EngCRT2025.pdf`
- APSR CRT customer guide: `https://www.apsr.om/downloadsdocs/CRT_Customer_Guide(ENG).pdf`
- Nama Services fixed-tariff calculator: `https://www.namaservices.om/crt/fixed-tariff`

PDF auto-extraction was attempted during research and failed reliably. The plan below commits to manual entry with an optional parser that requires human review before commit. Auto-scraping a legally binding tariff is wrong — a parser typo quietly introduces a 5% billing error.

## Schema

One new table. One new row in the existing `system_settings` key-value store. That is all.

```sql
-- backend/migrations/create_electricity_tariffs_table.sql
CREATE TABLE IF NOT EXISTS electricity_tariffs (
    id              SERIAL PRIMARY KEY,
    tariff_name     VARCHAR(128) NOT NULL,   -- e.g. 'Salalah 11kV 2026'
    voltage_level   VARCHAR(32)  NOT NULL,   -- '0.415kV' | '11kV' | '33kV' | '132kV' | '400kV'
    effective_from  DATE         NOT NULL,
    effective_to    DATE,                    -- NULL means open ended
    currency        VARCHAR(8)   NOT NULL DEFAULT 'OMR',

    -- component 1: hourly energy charge. 24 floats, baisa/kWh.
    energy_charges_bz  JSONB NOT NULL,       -- { "winter": [24 floats], "summer": [24 floats] }
    summer_months      INT[] NOT NULL DEFAULT '{6,7,8,9}',

    -- component 2: transmission
    tuos_ro_per_mw_month  NUMERIC(10,4) NOT NULL,

    -- component 3: distribution
    duos_bz_per_kwh       NUMERIC(10,4) NOT NULL,

    -- component 4: supply
    supply_ro_per_month   NUMERIC(10,4) NOT NULL,

    -- bookkeeping
    source_document_url   TEXT,
    notes                 TEXT,
    created_at            TIMESTAMP DEFAULT NOW(),
    updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tariffs_effective
  ON electricity_tariffs(voltage_level, effective_from, effective_to);
```

A single row in `system_settings`:

```
key:   'ACTIVE_TARIFF_ID'
value: '<id from electricity_tariffs>'
```

The `/api/settings/active-tariff` endpoint wraps get/set. Multi-site deployments later can extend this to a per-site key without migration churn.

Currency stays OMR. 1 OMR = 1000 baisa is handled inside the calculator only; the database never mixes units.

## Data entry workflow

**Primary path — manual form.** Admin UI at `/app-settings/tariffs`. Route added in `AppRoutes.jsx`, page at `Frontend/src/Pages/AppSettings/TariffSettings.jsx`.

The form has four collapsible sections mirroring the four tariff components:

1. Name, voltage level, effective from/to, source URL.
2. Energy charge grid: 2 rows × 24 columns (winter, summer). Each cell baisa/kWh, two decimals.
3. TUoS rate (RO/MW/month).
4. DUoS rate (baisa/kWh) and supply charge (RO/month).

Validation:

- All 48 energy cells required, must be positive.
- TUoS, DUoS, supply must be positive.
- Effective-from before effective-to if both set.
- Saving sets this tariff as `ACTIVE_TARIFF_ID` only when the user ticks "use as active".

**Optional helper — PDF parser.** `backend/tools/import_crt_pdf.py`. Command-line only, not wired into the UI.

```
python backend/tools/import_crt_pdf.py \
    --pdf EngCRT2025.pdf \
    --voltage 11kV \
    --effective-from 2025-01-01 \
    --out draft_tariff.json
```

Output is a JSON file in the same shape as a row in `electricity_tariffs`. The operator opens it in an editor, compares against the PDF, corrects anything wrong, then loads into the admin UI via a "Load from JSON" button. The tool never writes directly to the database. A separate audit log column could be added later; not in scope here.

**Annual refresh reminder.** When `effective_to` is within 30 days of today (and the column is not null), the `/app-settings/tariffs` page shows a banner: "Your tariff expires on YYYY-MM-DD. APSR typically publishes next year's schedule in December. Check apsr.om/en/tariffs." No automatic fetch.

## Cost calculation module

New file `backend/ml/cost_calculator.py`. One pure function plus helpers. No I/O, no DB writes. Takes a time series and a tariff, returns the breakdown.

```python
from datetime import datetime
from typing import Iterable, Tuple, Optional

def compute_cost(
    kwh_series: Iterable[Tuple[datetime, float]],  # (timestamp, kwh in that interval)
    tariff: dict,                                   # row from electricity_tariffs
    peak_demand_mw: Optional[float] = None          # if None, derived from kwh_series
) -> dict:
    """
    Returns:
      {
        "total_omr": float,
        "components": {
          "energy_omr": float,
          "tuos_omr": float,
          "duos_omr": float,
          "supply_omr": float
        },
        "by_hour": [ { "hour": 0..23, "kwh": float, "rate_bz": float, "omr": float } ],
        "by_band": { "winter_peak": float, "winter_offpeak": float,
                     "summer_peak": float, "summer_offpeak": float },
        "peak_demand_mw": float,
        "assumptions": {
          "tariff_name": str, "tariff_effective_from": date,
          "summer_months": [int], "voltage_level": str
        }
      }
    """
```

Algorithm:

1. Resample the series to hourly buckets aligned to clock hours. Anything <1h uses sum over the bucket.
2. For each bucket: pick `energy_charges_bz["summer"][hour]` if month in `summer_months`, else `"winter"`. Multiply bucket kWh × rate ÷ 1000 → OMR. Accumulate.
3. DUoS: total kWh × `duos_bz_per_kwh` ÷ 1000.
4. TUoS: compute peak_demand_mw as the maximum 15-minute average in the period (if not supplied), then multiply by `tuos_ro_per_mw_month` scaled by period length in months.
5. Supply: `supply_ro_per_month` × period length in months.
6. Return breakdown.

Design notes:

- The function is pure — 100 lines of tests cover component separation, summer/winter switching, peak demand edge cases.
- Peak demand derivation uses 15-minute rolling average. Raw 1-second peaks overstate by ~8x under normal production.
- If the caller passes a tariff whose effective window does not cover the query period, the function raises `TariffOutOfWindowError` with both dates; the caller decides whether to fall back to the most recent tariff or refuse.

Helper `load_active_tariff(period: tuple[datetime, datetime]) -> dict` in same module performs the DB lookup — selects the tariff with the latest `effective_from` that still covers the period, filtered by voltage level from settings.

## Integration points — exactly four

**1. Energy report templates.** `Frontend/src/Pages/ReportBuilder/widgetDefaults.js` — add a new column option `cost_omr` to the `TableWidget` defaults. When a row contains an energy tag, the backend resolves the row's time range, calls `compute_cost`, and returns OMR alongside kWh. No new widget type. No layout migration.

**2. Distribution engine template variables.** `backend/distribution_engine.py` — expose `{{energy_cost_omr}}`, `{{energy_cost_by_band}}`, `{{peak_demand_mw}}` when the rule's scope includes an energy report. Render inside existing email templates. No new template files.

**3. AI briefing structured output.** Plan 1's new `/insights` JSON gains a `cost` object per asset:

```json
"cost": { "total_omr": 142.8, "vs_prior_pct": 6.2, "peak_demand_mw": 0.48 }
```

The prompt in `backend/ai_prompts.py` instructs the model to mention cost only when the asset exceeds a 5% delta vs prior period — cost as a nag is noise.

**4. Chat assistant tool.** Plan 4's `compute_cost` tool wraps this same module. No duplicate logic.

## Endpoints that change

- New: `GET/POST /api/settings/tariffs` — CRUD over `electricity_tariffs`.
- New: `GET/POST /api/settings/active-tariff` — wraps the settings key.
- Modified: `GET /api/historian/by-tags` accepts `?include_cost=true`. When set, the response includes `cost_omr` per row for rows whose tag has `unit LIKE '%kWh%'` or is flagged as an energy meter.
- Modified: `POST /hercules-ai/insights` (Plan 1) — payload gains `cost` field per asset.

No existing endpoints break.

## Cost save-story framing

The AI must never say "you will save X OMR/month" without showing the math. The briefing renders a "Cost" panel with three elements:

1. Actual OMR for the period.
2. Band breakdown (how much was paid at summer-peak vs winter-offpeak rates).
3. An optional scenario: "If the 300 kWh consumed at 13:00 had shifted to 22:00, the bill would have been 4.2 OMR lower."

The scenario section is rendered only when the assistant's shift calculation produces a saving ≥5% AND the user has not ticked the "I have a bilateral PPA" flag in tariff settings. The flag disables scenario savings across the product because bilateral PPA rates are outside the published CRT.

An assumptions drawer — collapsed by default — shows the tariff name, effective dates, and the full 48-cell rate grid. A manager can open it, verify, and trust.

## Value estimation sanity check

A 500 kW Salalah mill running two-shift, ~250 days/year, at ~70% load factor consumes ~2.1 GWh/year. At a conservative average of 15 baisa/kWh energy charge plus ~4 baisa/kWh DUoS, plus TUoS and supply, annual electricity cost sits around 50,000–65,000 OMR.

Realistic optimisation targets:

- **Load shifting** (hand-tunable on mill startup times): 2–5% of the energy-charge component → ~500–1,500 OMR/year saved.
- **Power factor correction** (capacitor bank sizing guided by recorded PF data): avoids penalty KVARh charges where applicable — site-specific, 500–2,000 OMR/year.
- **Peak demand smoothing** (starting equipment sequentially): reduces TUoS component by 3–8% → ~300–1,000 OMR/year.

Total realistic annual saving, surfaced by Hercules: **1,500–4,500 OMR/year for a single 500 kW line.** Do not present single numbers without the assumptions that produced them.

## Implementation plan

Target 5 developer-days.

| Day | Work |
|-----|------|
| 1 | Migration + `system_settings` row + CRUD endpoint. Unit-test tariff selection. |
| 2 | `backend/ml/cost_calculator.py` with full test suite (hourly bucketing, summer/winter, peak demand, period-straddling). |
| 3 | `/app-settings/tariffs` admin UI. Route + page + form + validation. |
| 4 | Four integration points: widget defaults, distribution variables, `/insights` cost block, historian `?include_cost`. |
| 5 | `backend/tools/import_crt_pdf.py` helper script + manual QA pass against the Nama Dhofar 2025 PDF. |

## What success looks like

- A plant manager sees total OMR alongside kWh in every energy report.
- The daily briefing calls out "cost ran 6% hot yesterday — peak demand shifted into 14:00" when true, and says nothing when not.
- Admin can enter a full CRT tariff in under 15 minutes from the published PDF.
- `compute_cost` produces a total within 1% of an actual Nama Dhofar invoice for a full month of real mill data.
- Zero cases of a legally binding rate being auto-ingested without human review.

## Out of scope

- Multi-site tariff management (single active tariff per install today).
- Automatic tariff-document fetching from APSR (intentional).
- Optimisation recommendations beyond the briefing's scenario text — the controller never acts.
- Bilateral-PPA modelling beyond the boolean flag that suppresses scenario savings.
- Currency other than OMR.
- Reverse-calculating the bill to the cent — this tool estimates, it does not replace Nama's invoice.
