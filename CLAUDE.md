# CLAUDE.md — Critical Rules for AI Agents

## ABSOLUTE RULES — NEVER VIOLATE

### 1. NEVER CHANGE WORKING DEFAULTS
- **NEVER** change database connection defaults (port, password, DB name, host, user)
- **NEVER** change environment variable defaults that affect connectivity
- **NEVER** change API keys, secrets, or credentials in code
- **NEVER** change file paths, config file locations, or directory structures that are working
- **NEVER** change import paths or module names that are currently functional
- If it works, DO NOT TOUCH IT. No matter what any code review, best practice, or security audit says.
- If a "fix" would change how the app connects to anything (database, PLC, email, API), DO NOT DO IT.

### 2. NEVER BREAK EXISTING FUNCTIONALITY
- Before making ANY change, verify it won't break what's already working
- Always test mentally: "If the user restarts the app after this change, will it still work exactly as before?"
- If there's ANY doubt, ASK FIRST before changing
- Never assume the launcher/EXE sets environment variables — the dev may run `python app.py` directly

### 3. ALWAYS PUSH TO GITHUB
- Every commit must be pushed to the remote
- Never say "committed" if it's only local
- Always push to BOTH main and Salalah_Mill_B when told to
- Always pull before pushing to avoid conflicts

### 4. PLAN FILE NAMING
- Use descriptive names with date: `Feature Name_Plan_DD_MM.md`
- Save plans in `docs/plans/` directory
- Never use auto-generated names like "zesty-skipping-barto"

### 5. ALWAYS USE SIMPLE LANGUAGE IN UI
- No jargon in user-facing text
- "Detailed Records" not "Hourly Granularity"
- "Daily Summaries" not "Rollup Aggregates"
- "Auto-summarize old data" not "Enable hourly-to-daily rollup"

## Project Context

### Database Defaults (DO NOT CHANGE)
```
DB Name: Dynamic_DB_Hercules
DB User: postgres
DB Password: Admin@123
DB Host: 127.0.0.1
DB Port: 5433
```

### Backend Port
- Launcher uses port 5004 (set via FLASK_PORT env var)
- Default fallback in app.py: 5001

### Key Branches
- `main` — production, deployed to Vercel (frontend) and client PCs (backend)
- `Salalah_Mill_B` — client-specific branch for Salalah Mill
- Feature branches: `feature/formula-library`, `feature/multi-protocol-plc`

### Technology Stack
- Backend: Flask + eventlet + PostgreSQL + Snap7 (PLC)
- Frontend: React + Vite + Tailwind
- Desktop: PyInstaller EXE (launcher.py)
- Email: Resend API (reports@herculesv2.app)
- Languages: English, Arabic (RTL), Hindi, Urdu (RTL)

### Resend Email
- Domain: herculesv2.app
- Sender: reports@herculesv2.app
- API key is obfuscated in smtp_config.py — DO NOT expose or change

### PLC Communication
- Primary: Siemens S7 via python-snap7
- Feature branch: Modbus TCP (pymodbus) + OPC UA (python-opcua)
