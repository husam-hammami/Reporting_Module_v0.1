# Local PostgreSQL Database Setup

This guide walks you through installing PostgreSQL and running the automated setup script that creates the database, tables, default user, and demo data.

---

## 1. Install PostgreSQL 17

Download and install from https://www.postgresql.org/downloads/ with default settings.

After installation, verify the service is running:

```bash
# Windows
sc query postgresql-x64-17

# Linux / macOS
systemctl status postgresql
```

---

## 2. Configure Authentication

PostgreSQL defaults to password authentication. For local development, switch to `trust` so scripts can connect without a password prompt.

Edit `pg_hba.conf`:
- **Windows:** `C:\Program Files\PostgreSQL\17\data\pg_hba.conf`
- **Linux:** `/etc/postgresql/17/main/pg_hba.conf`
- **macOS (Homebrew):** `/opt/homebrew/var/postgresql@17/pg_hba.conf`

Find these lines and change the METHOD column to `trust`:

```
# IPv4 local connections:
host    all    all    127.0.0.1/32    trust
# IPv6 local connections:
host    all    all    ::1/128         trust
```

Restart the service:

```bash
# Windows (run as Administrator)
net stop postgresql-x64-17
net start postgresql-x64-17

# Linux / macOS
sudo systemctl restart postgresql
```

---

## 3. Create Your `.env` File

```bash
cd backend
cp .env.example .env
```

Default values in `.env.example` work out of the box for local dev:

```
POSTGRES_DB=dynamic_db_hercules
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Hercules
DB_HOST=127.0.0.1
DB_PORT=5432
```

> If you set pg_hba.conf to `trust`, the password value doesn't matter but must be present.

---

## 4. Run the Setup Script

```bash
cd backend
python setup_local_db.py
```

The script does everything in order:

| Step | What it does |
|------|-------------|
| **1** | Creates `dynamic_db_hercules` database (skips if it already exists) |
| **2** | Runs all 12 migration SQL files in dependency order |
| **3** | Creates default `admin` user (password: `admin`) |
| **4** | Seeds 160 demo tags + "Grain Terminal Demo" layout with monitoring enabled |
| **5** | Lists all tables and row counts for verification |

To skip demo data seeding:

```bash
python setup_local_db.py --no-seed
```

---

## 5. Verify

After the script finishes, you should see output like:

```
  Found 18 tables in "dynamic_db_hercules":
    bins                                              0 rows
    dynamic_monitor_registry                          1 rows
    dynamic_orders                                    0 rows
    ...
    tags                                            160 rows
    users                                             1 rows
```

You can also verify manually:

```bash
psql -U postgres -h 127.0.0.1 -d dynamic_db_hercules -c "SELECT COUNT(*) FROM tags;"
```

---

## 6. Start the Backend

```bash
python app.py
```

The Flask server starts on `http://localhost:5000`. The dynamic monitor worker begins writing tag history to PostgreSQL automatically.

---

## What the Migrations Create

| Migration | Tables / Columns |
|-----------|-----------------|
| `create_tags_tables.sql` | `tags`, `tag_groups`, `tag_group_members`, `live_monitor_layouts`, `live_monitor_sections`, `live_monitor_columns`, `live_monitor_table_config`, `live_monitor_kpi_config` |
| `create_users_table.sql` | `users` |
| `create_bins_and_materials_tables.sql` | `materials`, `bins` |
| `create_report_builder_tables.sql` | `report_builder_templates` |
| `create_tag_history_tables.sql` | `tag_history`, `tag_history_archive` |
| `create_kpi_engine_tables.sql` | `kpi_config`, `kpi_tag_mapping`, `kpi_history` |
| `add_is_counter_to_tags.sql` | Adds `is_counter` column to `tags` |
| `add_bin_activation_fields.sql` | Adds bin activation columns to `tags` |
| `add_value_formula_field.sql` | Adds `value_formula` column to `tags` |
| `add_layout_config_field.sql` | Adds `config` JSONB column to `live_monitor_layouts` |
| `add_line_running_tag_fields.sql` | Adds line running tag columns to `live_monitor_layouts` |
| `add_dynamic_monitoring_tables.sql` | Adds publishing columns to `live_monitor_layouts` + creates `dynamic_monitor_registry`, `dynamic_order_counters`, `dynamic_orders` |

---

## Resetting the Database

To start fresh, drop and recreate:

```bash
psql -U postgres -h 127.0.0.1 -c "DROP DATABASE dynamic_db_hercules;"
python setup_local_db.py
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `could not connect to server: Connection refused` | PostgreSQL service not running — start it |
| `FATAL: password authentication failed` | pg_hba.conf not set to `trust` — edit and restart service |
| `psycopg2 is not installed` | Run `pip install psycopg2-binary` |
| `database "dynamic_db_hercules" already exists` | Safe to ignore — script skips creation |
| Migration says "already exists" | Safe to ignore — script skips it and continues |
