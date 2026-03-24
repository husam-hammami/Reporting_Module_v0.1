# Report Templates and Seeding

This folder holds **seeding scripts** for report templates so that template tooling lives under docs and stays versioned with the template definitions.

## Templates

### Default Grains Report

- **Definition:** `docs/report-templates/Grain_Silos.json`
- **Name in DB:** `Grain_Silos`
- **Role:** Grain terminal report (intake, silos, quality, equipment, energy, alarms, maintenance). Marked as default for new reports.

### Mil-A Report

- **Definition:** `docs/report-templates/Mil-A.json`
- **Name in DB:** `Mil-A`
- **Role:** Mil-A report with Data tables (Bin/Material, Product kg), Bran Receiver, Yield Log table, and Yield Line chart. Use the Mil-A seed script to create the same template on another system.

## Seeding scripts

### Default Grains: `seed_default_grains_report.py`

Loads template JSON from `docs/report-templates/` and upserts into the `report_builder_templates` table. Idempotent (safe to run multiple times).

### Mil-A: `seed_mil_a_report.py`

Seeds the Mil-A template by default. Run on any system (with that system’s DB connection) to create or update the Mil-A report template there.

```bash
# Seed only the Mil-A template (Mil-A.json)
python docs/Templates/seed_mil_a_report.py

# Seed a specific template file
python docs/Templates/seed_mil_a_report.py docs/report-templates/Mil-A.json

# Seed all .json templates in docs/report-templates/
python docs/Templates/seed_mil_a_report.py --all
```

### Prerequisites

- Python 3 with `psycopg2-binary` and `python-dotenv` (or use the backend venv).
- Database running; `.env` with `POSTGRES_*` / `DB_HOST` / `DB_PORT` in `backend/tools/setup/`, `backend/`, or repo root.

### Usage for Default Grains (from repo root)

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
python backend/tools/setup/seed_report_templates.py docs/report-templates/Mil-A.json
```

Use either the script in this folder or the backend script; both read from `docs/report-templates/` and write to `report_builder_templates`.
