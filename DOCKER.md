# Running the Reporting Module with Docker

Uses ports **8081**, **5002**, **5433** so it can run alongside an existing stack (e.g. herculesv20docker on 8080, 5000, 5432). Backend listens on **5001** inside the container and is exposed on host **5002**.

## Prerequisites

- Docker and Docker Compose installed.
- Backend `.env` file with DB settings for Docker (see below).

## Backend `.env` for Docker

Create or edit `backend/.env` (do not commit real secrets). For Docker, the backend must connect to the `postgres` service:

```env
POSTGRES_DB=dynamic_db_hercules
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Hercules
DB_HOST=postgres
DB_PORT=5432
FLASK_SECRET_KEY=your-secret-key-here
```

`docker-compose.yml` also passes `DB_HOST`, `DB_PORT`, and `POSTGRES_*` via `environment:`; the `.env` is used for the rest.

## Build and run

From the **repository root**:

```bash
docker compose up -d --build
```

- **UI:** http://localhost:8081  
- **API:** http://localhost:5002  

## First run: database setup

After the first `up`, run migrations/setup once:

```bash
docker compose exec backend python tools/setup/setup_local_db.py
```

(Omit `--no-seed` if you want demo tags; use `--no-seed` for production and configure tags in Engineering.)

### Seed tags from CSV

To load tags from a CSV (e.g. `backend/tags.csv` or repo-root `tags.csv`) into the `tags` table (idempotent upsert on `tag_name`):

```bash
docker compose exec backend python tools/setup/seed_tags_from_csv.py
```

With no argument, the script uses `tags.csv` from the repo root if present, otherwise `backend/tags.csv` (included in the image). To use a specific path inside the container:

```bash
docker compose exec backend python tools/setup/seed_tags_from_csv.py /app/tags.csv
```

## Useful commands

```bash
docker compose ps
docker compose logs -f backend
docker compose down
```

## Troubleshooting: 502 Bad Gateway

If the UI loads but API calls and WebSocket fail with **502 Bad Gateway**:

1. **Check backend is running**
   ```bash
   docker compose ps
   ```
   If `reporting_module_v01-backend-1` is **Exited** or **Restarting**, the backend is crashing.

2. **Check backend logs**
   ```bash
   docker compose logs backend --tail 100
   ```
   Look for Python tracebacks, `Connection refused` to postgres, or missing-table errors.

3. **Run database setup (required first time)**
   If you never ran it, the app may crash when touching the DB:
   ```bash
   docker compose exec backend python tools/setup/setup_local_db.py
   ```
   Then restart the backend:
   ```bash
   docker compose restart backend
   ```

4. **Give the backend time to start**
   After `up`, wait 20–30 seconds and reload the page. The backend has a 30s healthcheck start period.

5. **Test the API directly**
   ```bash
   curl http://localhost:5002/api/settings/system-status
   ```
   If this returns JSON, the backend is fine and the issue may be browser cache or Nginx; try a hard refresh (Ctrl+Shift+R).
