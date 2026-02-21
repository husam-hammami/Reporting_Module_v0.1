# Database Connection Audit Report

## Summary

All backend files have been audited for database connection consistency. All files now use the standard database configuration.

## Standard Database Configuration

- **Database**: `Dynamic_DB_Hercules`
- **User**: `postgres`
- **Password**: `Admin@123`
- **Host**: `127.0.0.1`
- **Port**: `5433`

All values can be overridden using environment variables:
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DB_HOST`
- `DB_PORT`

## Files Using Correct Configuration ✅

These files use the standard configuration (either directly or via `get_db_connection` from `app.py`):

1. **`backend/app.py`** - Main application with connection pool
2. **`backend/orders_bp.py`** - Uses standard config
3. **`backend/check_users.py`** - Uses standard config
4. **`backend/fix_fcl_table.py`** - Uses standard config
5. **`backend/tags_bp.py`** - Uses `get_db_connection` from app.py
6. **`backend/tag_groups_bp.py`** - Uses `get_db_connection` from app.py
7. **`backend/live_monitor_bp.py`** - Uses `get_db_connection` from app.py
8. **`backend/utils/tag_reader.py`** - Uses `get_db_connection` from app.py
9. **`backend/energy.py`** - Uses `get_db_connection` from app.py

## Files Fixed ✅

### 1. `backend/add_columns.py`
**Before:**
- Password: `'trust'`
- Host: `'localhost'`
- Port: `5432`

**After:**
- Password: `'Admin@123'` (via env var)
- Host: `'127.0.0.1'` (via env var)
- Port: `5433` (via env var)

### 2. `backend/add_fcl_receivers.py`
**Before:**
- Database: `'hercules_db'` (hardcoded)
- Password: `'postgres'` (hardcoded)
- Host: `'localhost'` (hardcoded)
- Port: Missing

**After:**
- Database: `'Dynamic_DB_Hercules'` (via env var)
- Password: `'Admin@123'` (via env var)
- Host: `'127.0.0.1'` (via env var)
- Port: `5433` (via env var)

## Files Without Database Connections

These files don't establish database connections:
- `backend/check_db2099_offsets.py`
- `backend/test_fcl_flow_reading.py`
- `backend/scheduler.py`
- `backend/report_mailer.py`

## Migration Scripts

### 1. `backend/run_migration.py`
Runs the SQL migration to create all tag-related tables.

**Usage:**
```bash
cd backend
python run_migration.py
```

**What it does:**
- Reads `backend/migrations/create_tags_tables.sql`
- Connects to `Dynamic_DB_Hercules` database
- Creates 8 tables:
  - `tags`
  - `tag_groups`
  - `tag_group_members`
  - `live_monitor_layouts`
  - `live_monitor_sections`
  - `live_monitor_columns`
  - `live_monitor_table_config`
  - `live_monitor_kpi_config`
- Creates indexes and triggers
- Safe to run multiple times (uses `CREATE TABLE IF NOT EXISTS`)

### 2. `backend/verify_tables.py`
Verifies that all required tag-related tables exist.

**Usage:**
```bash
cd backend
python verify_tables.py
```

**What it does:**
- Checks if all 8 required tables exist
- Lists all indexes
- Lists all update triggers
- Provides next steps if tables are missing

## Quick Start Guide

### Step 1: Run Migration
```bash
cd backend
python run_migration.py
```

### Step 2: Verify Tables
```bash
python verify_tables.py
```

### Step 3: Start Backend
```bash
python app.py
```

### Step 4: Access UI
- Tag Manager: `http://localhost:5000/settings/tags`
- Tag Groups: `http://localhost:5000/settings/tag-groups`
- Layout Manager: `http://localhost:5000/live-monitor/layouts-manager`
- Dynamic Live Monitor: `http://localhost:5000/live-monitor/dynamic/:layoutId`

## Alternative: Using psql

If you prefer using `psql` directly:

```bash
# Windows PowerShell
$env:PGPASSWORD="Admin@123"
psql -U postgres -d Dynamic_DB_Hercules -h 127.0.0.1 -p 5433 -f backend\migrations\create_tags_tables.sql
```

## Environment Variables

To override default database settings, set these environment variables:

```bash
# Windows PowerShell
$env:POSTGRES_DB="Dynamic_DB_Hercules"
$env:POSTGRES_USER="postgres"
$env:POSTGRES_PASSWORD="Admin@123"
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="5433"
```

```bash
# Linux/Mac
export POSTGRES_DB="Dynamic_DB_Hercules"
export POSTGRES_USER="postgres"
export POSTGRES_PASSWORD="Admin@123"
export DB_HOST="127.0.0.1"
export DB_PORT="5433"
```

## Verification Checklist

After running the migration, verify:

- [ ] All 8 tables exist
- [ ] Indexes are created
- [ ] Update triggers are active
- [ ] Can connect to database from backend
- [ ] Tag Manager UI loads without errors
- [ ] Can create a test tag
- [ ] Can read tag value from PLC

## Troubleshooting

### Connection Errors
- Verify PostgreSQL is running
- Check host, port, and database name
- Verify user has permissions
- Check firewall settings

### Migration Errors
- Ensure database exists: `Dynamic_DB_Hercules`
- Check user has CREATE TABLE permissions
- Verify SQL file exists: `backend/migrations/create_tags_tables.sql`

### Missing Tables
- Run `python verify_tables.py` to see which tables are missing
- Re-run `python run_migration.py`
- Check database logs for errors

## Date
2024-12-26

