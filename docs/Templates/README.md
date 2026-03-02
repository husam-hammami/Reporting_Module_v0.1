# Report Templates and Seeding

This folder holds the **seeding script** for the **Default Grains Report** template (and other report templates) so that template tooling lives under docs and stays versioned with the template definitions.

## Default Grains Report template

- **Definition:** `docs/report-templates/Grain_Silos.json`
- **Name in DB:** `Grain_Silos`
- **Role:** Grain terminal report (intake, silos, quality, equipment, energy, alarms, maintenance). Marked as default for new reports.

## Seeding script

**Script:** `docs/Templates/seed_default_grains_report.py`

Loads template JSON from `docs/report-templates/` and upserts into the `report_builder_templates` table. Idempotent (safe to run multiple times).

### Prerequisites

- Python 3 with `psycopg2-binary` and `python-dotenv` (or use the backend venv).
- Database running; `.env` with `POSTGRES_*` / `DB_HOST` / `DB_PORT` in `backend/tools/setup/`, `backend/`, or repo root.

### Usage (from repo root)

```bash
# Seed only the Default Grains template (Grain_Silos.json)
python docs/Templates/seed_default_grains_report.py

# Seed a specific template file
python docs/Templates/seed_default_grains_report.py docs/report-templates/Grain_Silos.json

# Seed all .json templates in docs/report-templates/
python docs/Templates/seed_default_grains_report.py --all
```

### Alternative: backend script

The same seeding logic is available from the backend:

```bash
python backend/tools/setup/seed_report_templates.py
python backend/tools/setup/seed_report_templates.py docs/report-templates/Grain_Silos.json
```

Use either the script in this folder or the backend script; both read from `docs/report-templates/` and write to `report_builder_templates`.
