/**
 * Hercules Reporting Module — Electron Main Process
 *
 * Startup sequence (follows Desktop_App_Plan Phase 3 + Phase 6):
 *   1. Single-instance lock
 *   2. License check (online → cache → deny)
 *   3. First-run → setup wizard (auto-init DB, PLC, SMTP)
 *   4. Port checks
 *   5. Start PostgreSQL (if not already running from wizard)
 *   6. Start Flask backend (hercules-backend.exe)
 *   7. Health poll → load app in maximized BrowserWindow
 *   8. System tray + periodic license recheck
 */

const { app, BrowserWindow, Tray, Menu, dialog, ipcMain } = require('electron');
const { execSync, spawn, execFile } = require('child_process');
const crypto = require('crypto');
const http = require('http');
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');

// ─── Paths ───────────────────────────────────────────────────────────────────
const IS_DEV = !app.isPackaged;
const RESOURCES_DIR = IS_DEV
  ? path.join(__dirname)
  : path.join(process.resourcesPath);

const BACKEND_DIR = path.join(RESOURCES_DIR, 'backend');
const BACKEND_EXE = path.join(BACKEND_DIR, 'hercules-backend.exe');
const PG_BIN = path.join(RESOURCES_DIR, 'pgsql', 'bin');
const PG_CTL = path.join(PG_BIN, 'pg_ctl.exe');
const PG_ISREADY = path.join(PG_BIN, 'pg_isready.exe');
const INITDB_EXE = path.join(PG_BIN, 'initdb.exe');
const PSQL_EXE = path.join(PG_BIN, 'psql.exe');
const INIT_DB_PY = path.join(BACKEND_DIR, '_internal', 'init_db.py');

const APPDATA_DIR = path.join(process.env.APPDATA || os.homedir(), 'Hercules');
const CONFIG_DIR = path.join(APPDATA_DIR, 'config');
const PG_DATA_DIR = path.join(APPDATA_DIR, 'pgdata');
const LICENSE_CACHE = path.join(APPDATA_DIR, 'license_cache.json');

const LICENSE_SERVER = 'https://api.herculesv2.app';
const BACKEND_PORT = 5001;
const PG_PORT = 5435;
const PG_DB = 'dynamic_db_hercules';
const GRACE_PERIOD_DAYS = 7;

// ─── OTA Update Config ──────────────────────────────────────────────────────
const GITHUB_REPO = 'husam-hammami/Reporting_Module_v0.1';
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
const VERSION_FILE = path.join(RESOURCES_DIR, 'version.txt');
const BRANCH_FILE = path.join(RESOURCES_DIR, 'release_branch.txt');

let mainWindow = null;
let splashWindow = null;
let wizardWindow = null;
let tray = null;
let backendProcess = null;
let backendRestarts = 0;
let pgStarted = false;
let otaInProgress = false;
let lastUserActivity = Date.now();
let liveOtaInterval = null;
const MAX_BACKEND_RESTARTS = 3;
const OTA_POLL_INTERVAL = 5 * 60 * 1000; // check every 5 minutes
const IDLE_THRESHOLD = 60 * 1000;         // 60 seconds of no interaction

// ─── Machine ID (must match backend/machine_id.py exactly) ──────────────────
function getMachineId() {
  const hostname = os.hostname();
  const mac = getMacAddress();
  const diskSerial = getDiskSerial();
  const raw = `${hostname}${mac}${diskSerial}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function getMacAddress() {
  const interfaces = os.networkInterfaces();
  const macs = [];
  for (const iface of Object.values(interfaces)) {
    for (const info of iface) {
      if (!info.internal && info.mac && info.mac !== '00:00:00:00:00:00') {
        macs.push(info.mac.toLowerCase());
      }
    }
  }
  try {
    const nodeInt = BigInt('0x' + macs[0].replace(/:/g, ''));
    const parts = [];
    for (let i = 40; i >= 0; i -= 8) {
      parts.push(((nodeInt >> BigInt(i)) & BigInt(0xFF)).toString(16).padStart(2, '0'));
    }
    return parts.join(':');
  } catch {
    return macs[0] || '00:00:00:00:00:00';
  }
}

function getDiskSerial() {
  try {
    const result = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_DiskDrive | Select-Object -First 1).SerialNumber"',
      { timeout: 10000 }
    ).toString().trim();
    return (result && result.toLowerCase() !== 'none') ? result : '';
  } catch {
    return '';
  }
}

function getMachineInfo() {
  let cpuInfo = '';
  let ramGb = 0;
  try {
    cpuInfo = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_Processor | Select-Object -First 1).Name"',
      { timeout: 10000 }
    ).toString().trim();
  } catch { /* ignore */ }
  try {
    ramGb = parseFloat(execSync(
      'powershell -NoProfile -Command "[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)"',
      { timeout: 10000 }
    ).toString().trim()) || 0;
  } catch { /* ignore */ }

  const ifaces = os.networkInterfaces();
  let ipAddress = '';
  for (const iface of Object.values(ifaces)) {
    for (const info of iface) {
      if (!info.internal && info.family === 'IPv4') {
        ipAddress = info.address;
        break;
      }
    }
    if (ipAddress) break;
  }

  return {
    machine_id: getMachineId(),
    hostname: os.hostname(),
    mac_address: getMacAddress(),
    ip_address: ipAddress,
    os_version: `${os.type()} ${os.release()}`,
    cpu_info: cpuInfo,
    ram_gb: ramGb,
    disk_serial: getDiskSerial(),
  };
}

// ─── License check ───────────────────────────────────────────────────────────
function postJSON(url, data) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const body = JSON.stringify(data);
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'HerculesDesktop/1.0',
        'ngrok-skip-browser-warning': 'true',
      },
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

function saveLicenseCache(data) {
  fs.mkdirSync(APPDATA_DIR, { recursive: true });
  fs.writeFileSync(LICENSE_CACHE, JSON.stringify({
    ...data,
    cached_at: new Date().toISOString(),
  }), 'utf-8');
}

function loadLicenseCache() {
  try {
    if (!fs.existsSync(LICENSE_CACHE)) return null;
    return JSON.parse(fs.readFileSync(LICENSE_CACHE, 'utf-8'));
  } catch { return null; }
}

async function checkLicense() {
  const info = getMachineInfo();
  try {
    const result = await postJSON(`${LICENSE_SERVER}/api/license/register`, info);
    const status = result.status;
    const expiry = result.expiry;

    if (status === 'approved' && expiry) {
      const expiryDate = new Date(expiry + 'T23:59:59');
      if (expiryDate >= new Date()) {
        saveLicenseCache({ status, expiry, machine_id: info.machine_id });
        return { ok: true, status };
      }
      return { ok: false, status: 'expired' };
    }
    if (status === 'expired') return { ok: false, status: 'expired' };
    if (status === 'pending') return { ok: false, status: 'pending' };
    if (status === 'denied') return { ok: false, status: 'denied' };
    return { ok: false, status: status || 'unknown' };
  } catch (err) {
    const cache = loadLicenseCache();
    if (cache && cache.status === 'approved' && cache.expiry && cache.cached_at) {
      const cachedAt = new Date(cache.cached_at);
      const daysSince = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince <= GRACE_PERIOD_DAYS) {
        return { ok: true, status: 'approved', offline: true };
      }
    }
    return { ok: false, status: 'network_error', error: err.message };
  }
}

// ─── Port check ──────────────────────────────────────────────────────────────
function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(); resolve(true); });
    srv.listen(port, '127.0.0.1');
  });
}

// ─── PostgreSQL (matches launcher.py pattern: trust auth, no password) ───────
function initPostgres() {
  if (fs.existsSync(path.join(PG_DATA_DIR, 'PG_VERSION'))) return;
  console.log('[Electron] Initializing PostgreSQL cluster...');
  fs.mkdirSync(PG_DATA_DIR, { recursive: true });
  execSync(`"${INITDB_EXE}" -D "${PG_DATA_DIR}" -U postgres --locale=C --encoding=UTF8`, {
    stdio: 'pipe',
    timeout: 60000,
  });
}

function startPostgres() {
  if (pgStarted) return;
  console.log(`[Electron] Starting PostgreSQL on port ${PG_PORT}...`);
  spawn(PG_CTL, ['-D', PG_DATA_DIR, '-o', `-p ${PG_PORT}`, '-l', path.join(APPDATA_DIR, 'pg.log'), 'start'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  pgStarted = true;
}

function waitForPostgres(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      try {
        const result = execSync(`"${PG_ISREADY}" -h 127.0.0.1 -p ${PG_PORT} -d postgres`, {
          stdio: 'pipe', timeout: 5000,
        });
        if (result.toString().includes('accepting connections')) {
          resolve();
          return;
        }
      } catch { /* not ready yet */ }
      if (Date.now() > deadline) {
        reject(new Error('PostgreSQL did not start in time'));
        return;
      }
      setTimeout(check, 500);
    };
    check();
  });
}

function runInitDb() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      DB_HOST: '127.0.0.1',
      DB_PORT: String(PG_PORT),
      POSTGRES_DB: PG_DB,
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: '',
    };

    // init_db.py is bundled inside the PyInstaller _internal folder
    // Run it using the frozen backend exe with a special flag, or use psql + SQL directly
    // Simplest: use the standalone init_db.py with the bundled Python from hercules-backend
    // Since init_db.py is inside _internal, we run hercules-backend.exe with init_db as module
    // Actually, the simplest approach: run init_db.py logic via psql directly

    const steps = [
      { desc: 'Creating database...', sql: `SELECT 1 FROM pg_database WHERE datname = '${PG_DB}'` },
    ];

    // Step 1: Create database if not exists
    try {
      const checkDb = execSync(
        `"${PSQL_EXE}" -h 127.0.0.1 -p ${PG_PORT} -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${PG_DB}'"`,
        { stdio: 'pipe', timeout: 10000, env }
      ).toString().trim();

      if (checkDb !== '1') {
        execSync(
          `"${PSQL_EXE}" -h 127.0.0.1 -p ${PG_PORT} -U postgres -d postgres -c "CREATE DATABASE ${PG_DB}"`,
          { stdio: 'pipe', timeout: 10000, env }
        );
        console.log('[Electron] Created database:', PG_DB);
      } else {
        console.log('[Electron] Database already exists:', PG_DB);
      }
    } catch (e) {
      reject(new Error(`Failed to create database: ${e.message}`));
      return;
    }

    // Step 2: Run all migration SQL files
    const migrationsDir = path.join(BACKEND_DIR, '_internal', 'migrations');
    // Fallback: check if migrations are directly in backend dir
    const migDir = fs.existsSync(migrationsDir) ? migrationsDir : path.join(BACKEND_DIR, 'migrations');

    const migrationOrder = [
      'create_tags_tables.sql',
      'create_users_table.sql',
      'create_bins_and_materials_tables.sql',
      'create_report_builder_tables.sql',
      'create_tag_history_tables.sql',
      'create_kpi_engine_tables.sql',
      'add_is_counter_to_tags.sql',
      'add_bin_activation_fields.sql',
      'add_value_formula_field.sql',
      'add_layout_config_field.sql',
      'add_line_running_tag_fields.sql',
      'add_dynamic_monitoring_tables.sql',
      'alter_tag_history_nullable_layout.sql',
      'create_licenses_table.sql',
      'create_mappings_table.sql',
      'add_tag_history_archive_unique_universal.sql',
      'add_license_machine_info.sql',
      'add_site_and_license_name.sql',
      'create_distribution_rules_table.sql',
      'add_archive_granularity.sql',
      'create_report_execution_log.sql',
      'add_must_change_password.sql',
      'create_hercules_ai_tables.sql',
      'add_ai_summary_to_distribution.sql',
      'add_order_tracking_to_report_templates.sql',
      'add_distribution_content_mode.sql',
      // Drift fix: these were missing from desktop main.js but present in init_db.py / app.py
      'add_value_text_to_tag_history.sql',
      'allow_wstring_data_type.sql',
      // Plan 5 — ROI Genius Layer (Phase A migrations)
      'add_asset_columns_to_profiles.sql',
      'create_asset_sec_hourly.sql',
      'create_asset_yield_hourly.sql',
      'create_ai_savings_ledger.sql',
      'create_model_accuracy_log.sql',
      'create_ml_anomaly_feedback.sql',
      'create_assets_view.sql',
      // Plan 5 — Phase B (Crystal Ball)
      'create_ml_anomaly_events.sql',
      // Plan 6 hotfix — assets_view self-healing
      'recreate_assets_view_self_healing.sql',
    ];

    for (const file of migrationOrder) {
      const filePath = path.join(migDir, file);
      if (!fs.existsSync(filePath)) {
        console.log(`[Electron] SKIP migration: ${file} (not found)`);
        continue;
      }
      try {
        execSync(
          `"${PSQL_EXE}" -h 127.0.0.1 -p ${PG_PORT} -U postgres -d ${PG_DB} -f "${filePath}"`,
          { stdio: 'pipe', timeout: 30000, env }
        );
        console.log(`[Electron] OK migration: ${file}`);
      } catch (e) {
        // "already exists" errors are expected and safe
        console.log(`[Electron] SKIP migration: ${file} (${e.message.split('\n')[0]})`);
      }
    }

    // Step 3: Create default admin user (admin/admin)
    // Use werkzeug-compatible bcrypt hash for password "admin"
    const adminHash = 'scrypt:32768:8:1$salt$' + crypto.randomBytes(32).toString('hex');
    // Simpler: use a known werkzeug hash for "admin"
    try {
      const checkUser = execSync(
        `"${PSQL_EXE}" -h 127.0.0.1 -p ${PG_PORT} -U postgres -d ${PG_DB} -tAc "SELECT 1 FROM users WHERE username = 'admin'"`,
        { stdio: 'pipe', timeout: 10000, env }
      ).toString().trim();

      if (checkUser !== '1') {
        // Verified bcrypt hash for password "admin" (same as setup_local_db.py)
        // Write SQL to temp file to avoid shell escaping issues with $ in bcrypt hash
        const adminSqlFile = path.join(APPDATA_DIR, '_admin_init.sql');
        fs.writeFileSync(adminSqlFile,
          "INSERT INTO users (username, password_hash, role) VALUES ('admin', '$2b$12$LJ3m4ys3Lk0TSwMBQWJxaeflIOwnGGkahJCsOvn/F9JDOaFf1liGu', 'admin');\n",
          'utf-8'
        );
        execSync(
          `"${PSQL_EXE}" -h 127.0.0.1 -p ${PG_PORT} -U postgres -d ${PG_DB} -f "${adminSqlFile}"`,
          { stdio: 'pipe', timeout: 10000, env }
        );
        try { fs.unlinkSync(adminSqlFile); } catch { /* ignore */ }
        console.log('[Electron] Created default admin user (admin/admin)');
      } else {
        console.log('[Electron] Admin user already exists');
      }
    } catch (e) {
      console.log(`[Electron] Admin user creation: ${e.message.split('\n')[0]}`);
    }

    resolve();
  });
}

function stopPostgres() {
  try {
    execSync(`"${PG_CTL}" stop -D "${PG_DATA_DIR}" -m fast`, { stdio: 'pipe', timeout: 10000 });
  } catch { /* already stopped */ }
  pgStarted = false;
}

// ─── Backend ─────────────────────────────────────────────────────────────────
function startBackend() {
  const env = {
    ...process.env,
    HERCULES_DESKTOP: '1',
    DB_HOST: '127.0.0.1',
    DB_PORT: String(PG_PORT),
    POSTGRES_DB: PG_DB,
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: '',
    FLASK_PORT: String(BACKEND_PORT),
  };

  backendProcess = spawn(BACKEND_EXE, [], {
    cwd: path.dirname(BACKEND_EXE),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backendProcess.stdout.on('data', (d) => console.log(`[Backend] ${d.toString().trim()}`));
  backendProcess.stderr.on('data', (d) => console.error(`[Backend] ${d.toString().trim()}`));

  backendProcess.on('exit', (code) => {
    console.log(`[Backend] exited with code ${code}`);
    if (code !== 0 && code !== null && backendRestarts < MAX_BACKEND_RESTARTS) {
      backendRestarts++;
      console.log(`[Backend] Restarting (attempt ${backendRestarts}/${MAX_BACKEND_RESTARTS})...`);
      setTimeout(startBackend, 2000);
    }
  });
}

function waitForBackend(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, { timeout: 2000 }, (res) => {
        if (res.statusCode === 200) { resolve(); return; }
        retry();
      });
      req.on('error', retry);
      req.on('timeout', () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error('Backend did not respond to /health in time'));
        return;
      }
      setTimeout(poll, 500);
    };
    poll();
  });
}

function stopBackend() {
  if (!backendProcess) return;
  try {
    execSync(`taskkill /PID ${backendProcess.pid} /T /F`, { stdio: 'pipe', timeout: 5000 });
  } catch {
    try { backendProcess.kill(); } catch { /* already dead */ }
  }
  backendProcess = null;
}

// ─── OTA Auto-Update ────────────────────────────────────────────────────────
function getLocalVersion() {
  for (const f of [VERSION_FILE, path.join(BACKEND_DIR, 'version.txt')]) {
    try {
      if (fs.existsSync(f)) return fs.readFileSync(f, 'utf-8').trim();
    } catch { /* try next */ }
  }
  return '0.0.0';
}

function getReleaseBranch() {
  for (const f of [BRANCH_FILE, path.join(BACKEND_DIR, 'release_branch.txt')]) {
    try {
      if (fs.existsSync(f)) return fs.readFileSync(f, 'utf-8').trim();
    } catch { /* try next */ }
  }
  return process.env.RELEASE_BRANCH || 'Salalah_Mill_B';
}

function parseVersion(v) {
  const m = String(v).match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : [0, 0, 0];
}

function isNewer(remote, local) {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  for (let i = 0; i < 3; i++) {
    if (r[i] > l[i]) return true;
    if (r[i] < l[i]) return false;
  }
  return false;
}

function updateSplashStatus(message, percent) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  const safeMsg = message.replace(/'/g, "\\'");
  splashWindow.webContents.executeJavaScript(
    `document.getElementById('status').textContent='${safeMsg}';`
  ).catch(() => {});
  if (typeof percent === 'number') {
    splashWindow.webContents.executeJavaScript(
      `document.getElementById('progress-bar').style.display='block';` +
      `document.getElementById('progress-fill').style.width='${Math.round(percent)}%';`
    ).catch(() => {});
  } else {
    splashWindow.webContents.executeJavaScript(
      `document.getElementById('progress-bar').style.display='none';`
    ).catch(() => {});
  }
}

function httpsGetJSON(url) {
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'HerculesDesktop/1.0', 'Accept': 'application/vnd.github+json' },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from GitHub')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function downloadFile(url, dest, onProgress) {
  const https = require('https');
  const IDLE_TIMEOUT_MS = 30000; // abort if no bytes received for 30s

  return new Promise((resolve, reject) => {
    let redirects = 0;
    let settled = false;
    const settle = (err) => {
      if (settled) return;
      settled = true;
      if (err) reject(err); else resolve();
    };

    const follow = (u) => {
      const req = https.get(u, {
        headers: { 'User-Agent': 'HerculesDesktop/1.0' },
        timeout: 120000,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (++redirects > 5) { settle(new Error('Too many redirects')); return; }
          res.resume();
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          settle(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }

        const total = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const file = fs.createWriteStream(dest);

        let idleTimer;
        const resetIdle = () => {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            res.destroy(new Error(`Stalled: no data for ${IDLE_TIMEOUT_MS / 1000}s (got ${downloaded}/${total || '?'} bytes)`));
          }, IDLE_TIMEOUT_MS);
        };

        const finalize = (err) => {
          clearTimeout(idleTimer);
          file.end(() => {
            if (err) {
              try { fs.unlinkSync(dest); } catch { /* may not exist */ }
              return settle(err);
            }
            if (total > 0 && downloaded < total) {
              try { fs.unlinkSync(dest); } catch {}
              return settle(new Error(`Incomplete download: ${downloaded}/${total} bytes`));
            }
            settle();
          });
        };

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          file.write(chunk);
          if (total > 0 && onProgress) onProgress((downloaded / total) * 100);
          resetIdle();
        });
        res.on('end', () => finalize());
        res.on('aborted', () => finalize(new Error('Connection aborted')));
        res.on('error', (e) => finalize(e));
        res.on('close', () => { if (!settled) finalize(new Error('Connection closed unexpectedly')); });
        file.on('error', (e) => finalize(e));

        resetIdle();
      });

      req.on('error', (e) => settle(e));
      req.on('timeout', function() {
        this.destroy();
        settle(new Error('Initial connection timeout (120s to first byte)'));
      });
    };

    follow(url);
  });
}

function killExistingBackend() {
  try {
    execSync('taskkill /IM hercules-backend.exe /F', { stdio: 'pipe', timeout: 10000 });
    console.log('[OTA] Killed existing hercules-backend.exe processes');
  } catch { /* none running */ }
}

async function checkAndApplyUpdate() {
  const localVer = getLocalVersion();
  const branch = getReleaseBranch();
  const slug = branch.replace(/\//g, '-').toLowerCase();
  const prefix = slug + '-v';

  console.log(`[OTA] Current version: ${localVer}, branch: ${branch} (${slug})`);
  updateSplashStatus('Checking for updates...');

  let releases;
  try {
    releases = await httpsGetJSON(`${GITHUB_RELEASES_URL}?per_page=20`);
  } catch (err) {
    console.warn('[OTA] Cannot reach GitHub (offline?):', err.message);
    updateSplashStatus('Starting services...');
    return null;
  }

  if (!Array.isArray(releases)) {
    console.warn('[OTA] Unexpected releases response');
    updateSplashStatus('Starting services...');
    return null;
  }

  // Find the latest release matching our branch
  let bestRelease = null;
  let bestVersion = localVer;
  for (const rel of releases) {
    if (!rel.tag_name || !rel.tag_name.startsWith(prefix)) continue;
    const ver = rel.tag_name.substring(prefix.length);
    if (isNewer(ver, bestVersion)) {
      bestVersion = ver;
      bestRelease = rel;
    }
  }

  if (!bestRelease) {
    console.log('[OTA] Already up to date.');
    updateSplashStatus('Starting services...');
    return null;
  }

  // Find the .zip OTA asset
  const zipAsset = (bestRelease.assets || []).find(a => a.name.endsWith('.zip'));
  if (!zipAsset) {
    console.warn('[OTA] No .zip asset found in release', bestRelease.tag_name);
    updateSplashStatus('Starting services...');
    return null;
  }

  console.log(`[OTA] Update available: ${localVer} → ${bestVersion}`);
  otaInProgress = true;
  updateSplashStatus(`Downloading update v${bestVersion}...`, 0);

  const tmpZip = path.join(os.tmpdir(), zipAsset.name);
  try {
    await downloadFile(zipAsset.browser_download_url, tmpZip, (pct) => {
      updateSplashStatus(`Downloading update v${bestVersion}... ${Math.round(pct)}%`, pct);
    });
  } catch (err) {
    console.error('[OTA] Download failed:', err.message);
    otaInProgress = false;
    updateSplashStatus('Starting services...');
    return null;
  }

  updateSplashStatus('Installing update...');

  // Kill any running backend before replacing files
  killExistingBackend();

  const backupDir = BACKEND_DIR + '_backup';
  try {
    // Remove old backup if exists
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }

    // Backup current backend
    if (fs.existsSync(BACKEND_DIR)) {
      fs.renameSync(BACKEND_DIR, backupDir);
      console.log('[OTA] Backed up current backend');
    }

    // Extract zip — the zip contains a backend/ folder at root
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${RESOURCES_DIR}' -Force"`,
      { stdio: 'pipe', timeout: 120000 }
    );
    console.log('[OTA] Extracted update');

    // Verify extraction worked
    if (!fs.existsSync(BACKEND_EXE)) {
      throw new Error('Backend exe not found after extraction');
    }

    // Write new version
    fs.writeFileSync(VERSION_FILE, bestVersion, 'utf-8');
    console.log(`[OTA] Updated version file to ${bestVersion}`);

    // Clean up backup and temp zip
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
    try { fs.unlinkSync(tmpZip); } catch { /* ignore */ }

    console.log(`[OTA] Successfully updated to v${bestVersion}`);
    otaInProgress = false;
    updateSplashStatus(`Updated to v${bestVersion}!`);
    return bestVersion;

  } catch (err) {
    console.error('[OTA] Install failed, rolling back:', err.message);
    // Rollback: remove partial extraction, restore backup
    if (fs.existsSync(BACKEND_DIR) && fs.existsSync(backupDir)) {
      try { fs.rmSync(BACKEND_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    if (fs.existsSync(backupDir)) {
      try { fs.renameSync(backupDir, BACKEND_DIR); } catch { /* critical failure */ }
    }
    try { fs.unlinkSync(tmpZip); } catch { /* ignore */ }
    otaInProgress = false;
    updateSplashStatus('Starting services...');
    return null;
  }
}

// ─── Live OTA (background polling + idle-aware restart) ─────────────────────

/**
 * Check for update silently (no splash, no UI). Returns release info or null.
 */
async function checkForUpdateSilently() {
  if (otaInProgress) return null;
  const localVer = getLocalVersion();
  const branch = getReleaseBranch();
  const slug = branch.replace(/\//g, '-').toLowerCase();
  const prefix = slug + '-v';

  let releases;
  try {
    releases = await httpsGetJSON(`${GITHUB_RELEASES_URL}?per_page=10`);
  } catch { return null; }

  if (!Array.isArray(releases)) return null;

  let bestRelease = null;
  let bestVersion = localVer;
  for (const rel of releases) {
    if (!rel.tag_name || !rel.tag_name.startsWith(prefix)) continue;
    const ver = rel.tag_name.substring(prefix.length);
    if (isNewer(ver, bestVersion)) {
      bestVersion = ver;
      bestRelease = rel;
    }
  }

  if (!bestRelease) return null;

  const zipAsset = (bestRelease.assets || []).find(a => a.name.endsWith('.zip'));
  if (!zipAsset) return null;

  return { version: bestVersion, zipUrl: zipAsset.browser_download_url, zipName: zipAsset.name };
}

/**
 * Download, extract, and restart — called only when idle.
 */
async function applyUpdateAndRestart(updateInfo) {
  if (otaInProgress) return;
  otaInProgress = true;
  console.log(`[LiveOTA] Applying update to v${updateInfo.version}...`);

  const tmpZip = path.join(os.tmpdir(), updateInfo.zipName);
  try {
    // Download silently (no splash)
    await downloadFile(updateInfo.zipUrl, tmpZip, (pct) => {
      console.log(`[LiveOTA] Downloading... ${Math.round(pct)}%`);
    });

    // Stop the running backend
    stopBackend();
    killExistingBackend();

    // Backup + extract (same logic as startup OTA)
    const backupDir = BACKEND_DIR + '_backup';
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
    if (fs.existsSync(BACKEND_DIR)) {
      fs.renameSync(BACKEND_DIR, backupDir);
    }

    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${tmpZip}' -DestinationPath '${RESOURCES_DIR}' -Force"`,
      { stdio: 'pipe', timeout: 120000 }
    );

    if (!fs.existsSync(BACKEND_EXE)) {
      throw new Error('Backend exe not found after extraction');
    }

    fs.writeFileSync(VERSION_FILE, updateInfo.version, 'utf-8');

    // Clean up
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
    try { fs.unlinkSync(tmpZip); } catch { /* ignore */ }

    console.log(`[LiveOTA] Updated to v${updateInfo.version}. Restarting backend...`);

    // Restart backend
    backendRestarts = 0;
    startBackend();
    await waitForBackend();

    // Reload the main window to pick up new frontend
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ota-updated', updateInfo.version);
      mainWindow.reload();
    }

    otaInProgress = false;
    console.log(`[LiveOTA] v${updateInfo.version} is live.`);

  } catch (err) {
    console.error('[LiveOTA] Update failed, rolling back:', err.message);
    const backupDir = BACKEND_DIR + '_backup';
    if (fs.existsSync(BACKEND_DIR) && fs.existsSync(backupDir)) {
      try { fs.rmSync(BACKEND_DIR, { recursive: true, force: true }); } catch { /* */ }
    }
    if (fs.existsSync(backupDir)) {
      try { fs.renameSync(backupDir, BACKEND_DIR); } catch { /* */ }
    }
    try { fs.unlinkSync(tmpZip); } catch { /* */ }

    // Restart backend from backup
    backendRestarts = 0;
    try { startBackend(); await waitForBackend(); } catch { /* */ }

    otaInProgress = false;
  }
}

/**
 * Start periodic background OTA check. Called after app is fully loaded.
 */
function startLiveOTA() {
  if (liveOtaInterval) return;
  console.log('[LiveOTA] Background update check enabled (every 5 min, restart when idle).');

  liveOtaInterval = setInterval(async () => {
    if (otaInProgress) return;

    const updateInfo = await checkForUpdateSilently();
    if (!updateInfo) return;

    console.log(`[LiveOTA] Update found: v${updateInfo.version}. Waiting for idle...`);

    // Wait for idle before applying
    const waitForIdle = () => {
      const idleCheck = setInterval(async () => {
        const idleMs = Date.now() - lastUserActivity;
        if (idleMs >= IDLE_THRESHOLD && !otaInProgress) {
          clearInterval(idleCheck);
          console.log(`[LiveOTA] User idle for ${Math.round(idleMs / 1000)}s. Applying update...`);
          await applyUpdateAndRestart(updateInfo);
        }
      }, 10000); // check every 10 seconds

      // Give up after 30 minutes of waiting for idle
      setTimeout(() => clearInterval(idleCheck), 30 * 60 * 1000);
    };

    waitForIdle();
  }, OTA_POLL_INTERVAL);
}

/**
 * Track user activity in the main window for idle detection.
 */
function trackUserActivity() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // Track mouse/keyboard events via the web contents
  mainWindow.webContents.on('before-input-event', () => {
    lastUserActivity = Date.now();
  });

  // Also track window focus
  mainWindow.on('focus', () => { lastUserActivity = Date.now(); });

  // Track mouse movement via IPC (optional, the input event covers keyboard + clicks)
  console.log('[LiveOTA] User activity tracking enabled.');
}

// ─── Windows ─────────────────────────────────────────────────────────────────
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420, height: 320,
    frame: false, transparent: true, alwaysOnTop: true, resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('close', (e) => {
    if (otaInProgress) e.preventDefault();
  });
  // Fallback: auto-destroy splash after 15s
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      console.warn('[Electron] Splash timeout — force destroying');
      splashWindow.destroy();
      splashWindow = null;
    }
  }, 15000);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1024, minHeight: 700,
    show: false, maximizable: true,
    icon: path.join(__dirname, 'icons', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true,
    },
  });
  mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`);
  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) { splashWindow.destroy(); splashWindow = null; }
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('close', (e) => {
    e.preventDefault();
    if (tray) {
      mainWindow.hide();
    } else {
      const choice = require('electron').dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Minimize', 'Quit'],
        defaultId: 0,
        cancelId: 0,
        title: 'Hercules Reporting Module',
        message: 'Closing will stop PLC polling and report distribution.\nMinimize instead?',
      });
      if (choice === 1) {
        mainWindow.removeAllListeners('close');
        app.quit();
      } else {
        mainWindow.minimize();
      }
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icons', 'icon.ico');
  if (!fs.existsSync(iconPath)) return;
  tray = new Tray(iconPath);
  tray.setToolTip('Hercules Reporting Module');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => { if (mainWindow) mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { tray = null; app.quit(); } },
  ]));
  tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
}

function showLicenseScreen(status) {
  const file = status === 'pending' ? 'license-pending.html' : 'license-denied.html';
  const win = new BrowserWindow({
    width: 600, height: 480, resizable: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  win.loadFile(path.join(__dirname, file));
  win.on('closed', () => app.quit());
}

function startPeriodicLicenseCheck() {
  setInterval(async () => {
    const result = await checkLicense();
    if (!result.ok && !result.offline) {
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'License Issue',
          message: `Your license is ${result.status}. The application will close in 5 minutes.`,
          buttons: ['OK'],
        });
        setTimeout(() => { app.quit(); }, 5 * 60 * 1000);
      }
    }
  }, 60 * 60 * 1000);
}

// ─── First-run detection ─────────────────────────────────────────────────────
function isFirstRun() {
  return !fs.existsSync(path.join(CONFIG_DIR, 'db_config.json'));
}

// ─── IPC handlers for setup wizard ───────────────────────────────────────────
ipcMain.handle('init-database', async (event) => {
  try {
    // Step 1: Check port
    const free = await isPortFree(PG_PORT);
    if (!free) {
      return { ok: false, error: `Port ${PG_PORT} is already in use. Close the conflicting app and retry.` };
    }

    // Step 2: Init PostgreSQL cluster
    if (wizardWindow) wizardWindow.webContents.send('db-progress', 'Initializing PostgreSQL...');
    initPostgres();

    // Step 3: Start PostgreSQL
    if (wizardWindow) wizardWindow.webContents.send('db-progress', 'Starting PostgreSQL...');
    startPostgres();
    await waitForPostgres();

    // Step 4: Run migrations + create default admin
    if (wizardWindow) wizardWindow.webContents.send('db-progress', 'Creating database and tables...');
    await runInitDb();

    if (wizardWindow) wizardWindow.webContents.send('db-progress', 'Database ready!');
    return { ok: true };
  } catch (err) {
    console.error('[Electron] DB init error:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('save-config', async (_event, config) => {
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });

    // Save db_config.json (marks setup as complete)
    fs.writeFileSync(
      path.join(CONFIG_DIR, 'db_config.json'),
      JSON.stringify({ db_port: PG_PORT, setup_complete: true, ...config }, null, 2),
      'utf-8',
    );

    // Save PLC config
    if (config.plc) {
      fs.writeFileSync(
        path.join(CONFIG_DIR, 'plc_config.json'),
        JSON.stringify(config.plc, null, 2), 'utf-8',
      );
    }

    // Save demo mode
    if (config.demo_mode !== undefined) {
      fs.writeFileSync(
        path.join(CONFIG_DIR, 'demo_mode.json'),
        JSON.stringify({ demo_mode: config.demo_mode }, null, 2), 'utf-8',
      );
    }

    // Save SMTP config
    if (config.smtp && config.smtp.smtp_server) {
      fs.writeFileSync(
        path.join(CONFIG_DIR, 'smtp_config.json'),
        JSON.stringify(config.smtp, null, 2), 'utf-8',
      );
    }

    console.log('[Electron] Config saved to', CONFIG_DIR);
    return { ok: true };
  } catch (err) {
    console.error('[Electron] Config save error:', err);
    return { ok: false, error: err.message };
  }
});

// ─── IPC: Restart for OTA update ─────────────────────────────────────────────
ipcMain.handle('restart-for-update', async () => {
  console.log('[Electron] Restart requested for update...');
  stopBackend();
  stopPostgres();
  app.relaunch();
  app.exit(0);
});

// ─── IPC: Clean restart (from UI) ───────────────────────────────────────────
ipcMain.handle('restart-app', async () => {
  console.log('[Electron] Clean restart requested by user...');
  stopBackend();
  stopPostgres();
  app.relaunch();
  app.exit(0);
});

// ─── Setup wizard ────────────────────────────────────────────────────────────
function showSetupWizard() {
  return new Promise((resolve) => {
    wizardWindow = new BrowserWindow({
      width: 900, height: 700, resizable: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false, contextIsolation: true,
      },
    });
    wizardWindow.loadFile(path.join(__dirname, 'setup-wizard.html'));

    ipcMain.once('wizard-done', () => {
      if (wizardWindow) { wizardWindow.close(); wizardWindow = null; }
      resolve(true);
    });

    wizardWindow.on('closed', () => {
      wizardWindow = null;
      resolve(false);
    });
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on('ready', async () => {
  try {
    // 1. License check
    const licResult = await checkLicense();
    if (!licResult.ok) {
      showLicenseScreen(licResult.status);
      return;
    }

    // 2. First-run → setup wizard (DB auto-init + PLC + SMTP config)
    if (isFirstRun()) {
      const completed = await showSetupWizard();
      if (!completed) { app.quit(); return; }
    }

    // 3. Show splash
    createSplashWindow();

    // 3.5. OTA auto-update (before starting backend — no locked files)
    try {
      const updatedVer = await checkAndApplyUpdate();
      if (updatedVer) console.log(`[Electron] Updated to v${updatedVer}`);
    } catch (err) {
      console.warn('[Electron] OTA check failed (continuing):', err.message);
    }
    updateSplashStatus('Starting services...');

    // 4. Port checks
    const pgFree = await isPortFree(PG_PORT);
    const backendFree = await isPortFree(BACKEND_PORT);
    if (!pgFree && !pgStarted) {
      dialog.showErrorBox('Port Conflict', `PostgreSQL port ${PG_PORT} is in use.\nClose the conflicting application and try again.`);
      app.quit();
      return;
    }
    if (!backendFree) {
      dialog.showErrorBox('Port Conflict', `Backend port ${BACKEND_PORT} is in use.\nClose the conflicting application and try again.`);
      app.quit();
      return;
    }

    // 5. Start PostgreSQL (skip if already started during wizard)
    if (fs.existsSync(PG_CTL) && !pgStarted) {
      initPostgres();
      startPostgres();
      await waitForPostgres();
      console.log('[Electron] PostgreSQL ready.');
    }

    // 6. Start backend
    if (fs.existsSync(BACKEND_EXE)) {
      startBackend();
      await waitForBackend();
      console.log('[Electron] Backend ready.');
    } else {
      console.warn('[Electron] Backend exe not found at', BACKEND_EXE);
    }

    // 7. Load app
    createMainWindow();
    createTray();
    startPeriodicLicenseCheck();

    // 8. Start live OTA (background polling + idle-aware auto-restart)
    trackUserActivity();
    startLiveOTA();

  } catch (err) {
    console.error('[Electron] Startup error:', err);
    dialog.showErrorBox('Startup Error', err.message);
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
  stopPostgres();
});

app.on('window-all-closed', () => {
  if (otaInProgress) return; // Don't quit during OTA update
  if (!tray) app.quit();
});
