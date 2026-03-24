/**
 * Hercules Reporting Module — Electron Main Process
 *
 * Startup sequence:
 *   1. Single-instance lock
 *   2. License check (online → cache → deny)
 *   3. First-run detection → setup wizard
 *   4. Port conflict detection
 *   5. Start PostgreSQL (bundled)
 *   6. Start Flask backend (hercules-backend.exe)
 *   7. Health poll → load app
 *   8. System tray (minimize-to-tray, periodic license recheck)
 */

const { app, BrowserWindow, Tray, Menu, dialog, ipcMain } = require('electron');
const { execSync, spawn } = require('child_process');
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

const BACKEND_EXE = path.join(RESOURCES_DIR, 'backend', 'hercules-backend.exe');
const PG_BIN = path.join(RESOURCES_DIR, 'pgsql', 'bin');
const PG_CTL = path.join(PG_BIN, 'pg_ctl.exe');
const PG_ISREADY = path.join(PG_BIN, 'pg_isready.exe');
const INITDB = path.join(PG_BIN, 'initdb.exe');

const APPDATA_DIR = path.join(process.env.APPDATA || os.homedir(), 'Hercules');
const CONFIG_DIR = path.join(APPDATA_DIR, 'config');
const PG_DATA_DIR = path.join(APPDATA_DIR, 'pgdata');
const LICENSE_CACHE = path.join(APPDATA_DIR, 'license_cache.json');

const LICENSE_SERVER = 'https://api.herculesv2.app';
const BACKEND_PORT = 5001;
const DEFAULT_PG_PORT = 5435;
const GRACE_PERIOD_DAYS = 7;

function loadDbConfig() {
  try {
    const cfgPath = path.join(CONFIG_DIR, 'db_config.json');
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function getDbPort() {
  const cfg = loadDbConfig();
  return cfg.db_port || DEFAULT_PG_PORT;
}

function getDbPassword() {
  const cfg = loadDbConfig();
  return cfg.db_password || '';
}

let mainWindow = null;
let splashWindow = null;
let tray = null;
let backendProcess = null;
let backendRestarts = 0;
const MAX_BACKEND_RESTARTS = 3;

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
  // Match Python uuid.getnode() format: returns the first non-zero MAC
  // For consistency we use the same uuid.getnode() approach
  // uuid.getnode() returns an integer derived from the MAC
  // Replicating exact Python behavior:
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
    // Offline: check cache
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

// ─── PostgreSQL ──────────────────────────────────────────────────────────────
function initPostgres() {
  if (fs.existsSync(path.join(PG_DATA_DIR, 'PG_VERSION'))) return;
  console.log('[Electron] Initializing PostgreSQL cluster...');
  fs.mkdirSync(PG_DATA_DIR, { recursive: true });

  const dbPassword = getDbPassword();
  if (dbPassword) {
    const pwFile = path.join(APPDATA_DIR, '.pg_init_pw');
    fs.writeFileSync(pwFile, dbPassword, 'utf-8');
    execSync(`"${INITDB}" -D "${PG_DATA_DIR}" -U postgres --locale=C --encoding=UTF8 --pwfile="${pwFile}" -A md5`, {
      stdio: 'pipe',
      timeout: 60000,
    });
    try { fs.unlinkSync(pwFile); } catch { /* ignore */ }
  } else {
    execSync(`"${INITDB}" -D "${PG_DATA_DIR}" -U postgres --locale=C --encoding=UTF8`, {
      stdio: 'pipe',
      timeout: 60000,
    });
  }
}

function startPostgres() {
  const pgPort = getDbPort();
  console.log(`[Electron] Starting PostgreSQL on port ${pgPort}...`);
  spawn(PG_CTL, ['-D', PG_DATA_DIR, '-o', `-p ${pgPort}`, '-l', path.join(APPDATA_DIR, 'pg.log'), 'start'], {
    stdio: 'ignore',
    detached: true,
  }).unref();
}

function waitForPostgres(timeoutMs = 30000) {
  const pgPort = getDbPort();
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      try {
        const result = execSync(`"${PG_ISREADY}" -h 127.0.0.1 -p ${pgPort} -d postgres`, {
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

function stopPostgres() {
  try {
    execSync(`"${PG_CTL}" stop -D "${PG_DATA_DIR}" -m fast`, { stdio: 'pipe', timeout: 10000 });
  } catch { /* already stopped */ }
}

// ─── Backend ─────────────────────────────────────────────────────────────────
function startBackend() {
  const env = {
    ...process.env,
    HERCULES_DESKTOP: '1',
    DB_HOST: '127.0.0.1',
    DB_PORT: String(getDbPort()),
    POSTGRES_DB: 'dynamic_db_hercules',
    POSTGRES_USER: 'postgres',
    POSTGRES_PASSWORD: getDbPassword(),
    FLASK_PORT: String(BACKEND_PORT),
  };

  backendProcess = spawn(BACKEND_EXE, [], {
    cwd: path.dirname(BACKEND_EXE),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
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
    // Windows: use taskkill (SIGTERM does not exist on Windows)
    execSync(`taskkill /PID ${backendProcess.pid} /T /F`, { stdio: 'pipe', timeout: 5000 });
  } catch {
    try { backendProcess.kill(); } catch { /* already dead */ }
  }
  backendProcess = null;
}

// ─── Windows ─────────────────────────────────────────────────────────────────
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    maximizable: true,
    icon: path.join(__dirname, 'icons', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${BACKEND_PORT}`);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) { splashWindow.close(); splashWindow = null; }
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (tray) {
      e.preventDefault();
      mainWindow.hide();
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

// ─── Periodic license recheck ────────────────────────────────────────────────
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
  }, 60 * 60 * 1000); // every 60 minutes
}

// ─── First-run detection ─────────────────────────────────────────────────────
function isFirstRun() {
  return !fs.existsSync(path.join(CONFIG_DIR, 'db_config.json'));
}

function showSetupWizard() {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 900, height: 700, resizable: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    win.loadFile(path.join(__dirname, 'setup-wizard.html'));

    ipcMain.once('setup-complete', (_event, config) => {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(CONFIG_DIR, 'db_config.json'),
        JSON.stringify(config, null, 2),
        'utf-8',
      );
      win.close();
      resolve(config);
    });

    win.on('closed', () => resolve(null));
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

    // 2. First-run setup
    if (isFirstRun()) {
      const config = await showSetupWizard();
      if (!config) { app.quit(); return; }
    }

    // 3. Show splash
    createSplashWindow();

    // 4. Port checks
    const pgPort = getDbPort();
    const pgFree = await isPortFree(pgPort);
    const backendFree = await isPortFree(BACKEND_PORT);
    if (!pgFree || !backendFree) {
      const blocked = [];
      if (!pgFree) blocked.push(`PostgreSQL port ${pgPort}`);
      if (!backendFree) blocked.push(`Backend port ${BACKEND_PORT}`);
      dialog.showErrorBox(
        'Port Conflict',
        `The following port(s) are in use:\n\n${blocked.join('\n')}\n\nPlease close the conflicting application and try again.`
      );
      app.quit();
      return;
    }

    // 5. Start PostgreSQL
    if (fs.existsSync(PG_CTL)) {
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
      console.log('[Electron] Dev mode — assuming backend runs externally.');
    }

    // 7. Load app
    createMainWindow();
    createTray();
    startPeriodicLicenseCheck();

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
  if (!tray) app.quit();
});
