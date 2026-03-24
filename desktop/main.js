/**
 * Hercules Reporting Module — Electron Main Process
 *
 * Handles: single instance lock, license gate, PostgreSQL startup,
 * Flask backend spawn, health polling, system tray, auto-update.
 */

const { app, BrowserWindow, Tray, Menu, dialog, ipcMain, nativeImage } = require('electron');
const path = require('path');
const { spawn, execSync, execFile } = require('child_process');
const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

// ── Paths ────────────────────────────────────────────────────────────────────
const IS_DEV = !app.isPackaged;
const RESOURCES = IS_DEV ? path.join(__dirname, '..') : process.resourcesPath;
const BACKEND_DIR = path.join(RESOURCES, 'backend');
const PGSQL_DIR = path.join(RESOURCES, 'pgsql');
const APPDATA_DIR = path.join(process.env.APPDATA || os.homedir(), 'Hercules');
const CONFIG_DIR = path.join(APPDATA_DIR, 'config');
const LOG_DIR = path.join(APPDATA_DIR, 'logs');
const LICENSE_CACHE = path.join(CONFIG_DIR, 'license_cache.json');
const DB_CONFIG = path.join(CONFIG_DIR, 'db_config.json');
const PGDATA = path.join(APPDATA_DIR, 'pgdata');

// Ensure directories exist
[CONFIG_DIR, LOG_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ── Constants ────────────────────────────────────────────────────────────────
const FLASK_PORT = 5001;
const PG_PORT = 5432;
const LICENSE_API = 'https://api.herculesv2.app';
const HEALTH_POLL_INTERVAL = 500;
const HEALTH_TIMEOUT = 30000;
const LICENSE_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour
const OFFLINE_GRACE_DAYS = 7;
const MAX_BACKEND_RESTARTS = 3;

let mainWindow = null;
let tray = null;
let backendProcess = null;
let pgProcess = null;
let backendRestarts = 0;
let licenseCheckTimer = null;

// ── Single Instance Lock ─────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ── Machine ID ───────────────────────────────────────────────────────────────
function getMachineId() {
  const hostname = os.hostname();

  // MAC address — same logic as Python uuid.getnode()
  const interfaces = os.networkInterfaces();
  const macs = [];
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.mac && addr.mac !== '00:00:00:00:00:00') {
        macs.push(addr.mac);
      }
    }
  }
  // uuid.getnode() returns the first non-zero MAC as a 48-bit int
  // We replicate its hex representation
  const macInt = BigInt('0x' + (macs[0] || '00:00:00:00:00:00').replace(/:/g, ''));
  const macStr = [];
  for (let i = 0; i < 48; i += 8) {
    macStr.push(Number((macInt >> BigInt(i)) & 0xffn).toString(16).padStart(2, '0'));
  }
  const mac = macStr.join(':');

  // Disk serial via PowerShell
  let diskSerial = 'unknown';
  try {
    diskSerial = execSync(
      'powershell -Command "(Get-CimInstance Win32_DiskDrive | Select-Object -First 1).SerialNumber"',
      { timeout: 10000 }
    ).toString().trim();
  } catch (e) {
    log('Failed to get disk serial: ' + e.message);
  }

  const raw = `${hostname}${mac}${diskSerial}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function getMachineInfo() {
  return {
    machine_id: getMachineId(),
    hostname: os.hostname(),
    mac_address: (() => {
      const ifaces = os.networkInterfaces();
      for (const iface of Object.values(ifaces)) {
        for (const addr of iface) {
          if (addr.mac && addr.mac !== '00:00:00:00:00:00') return addr.mac;
        }
      }
      return '';
    })(),
    os_version: `${os.type()} ${os.release()}`,
    cpu_info: os.cpus()[0]?.model || 'unknown',
    ram_gb: Math.round(os.totalmem() / (1024 ** 3) * 10) / 10,
  };
}

// ── Logging ──────────────────────────────────────────────────────────────────
const logFile = path.join(LOG_DIR, 'electron.log');
function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

// ── Port Check ───────────────────────────────────────────────────────────────
function isPortFree(port) {
  return new Promise(resolve => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(); resolve(true); });
    srv.listen(port, '127.0.0.1');
  });
}

// ── License Check ────────────────────────────────────────────────────────────
function httpPost(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 10000,
    };
    const req = https.request(options, res => {
      let responseData = '';
      res.on('data', chunk => { responseData += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(responseData)); }
        catch { reject(new Error('Invalid JSON response')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = { hostname: parsed.hostname, port: parsed.port || 443, path: parsed.pathname + parsed.search, timeout: 10000 };
    const req = https.get(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function saveLicenseCache(data) {
  const cache = { ...data, cached_at: new Date().toISOString() };
  fs.writeFileSync(LICENSE_CACHE, JSON.stringify(cache, null, 2));
}

function loadLicenseCache() {
  try {
    if (fs.existsSync(LICENSE_CACHE)) {
      return JSON.parse(fs.readFileSync(LICENSE_CACHE, 'utf8'));
    }
  } catch (e) { log('Failed to load license cache: ' + e.message); }
  return null;
}

async function checkLicense() {
  const info = getMachineInfo();
  try {
    const result = await httpPost(`${LICENSE_API}/api/license/register`, info);
    log(`License check: status=${result.status}, expiry=${result.expiry}`);
    saveLicenseCache(result);
    return result;
  } catch (e) {
    log('License check failed (network): ' + e.message);
    // Offline fallback — use cache
    const cache = loadLicenseCache();
    if (cache && cache.status === 'approved') {
      const cachedAt = new Date(cache.cached_at);
      const daysSince = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < OFFLINE_GRACE_DAYS) {
        log(`Offline grace: ${Math.round(daysSince)}/${OFFLINE_GRACE_DAYS} days used`);
        return { status: 'approved', expiry: cache.expiry, offline: true };
      }
      log('Offline grace period expired');
      return { status: 'expired', reason: 'Offline grace period expired' };
    }
    return { status: 'error', reason: 'Cannot reach license server and no valid cache' };
  }
}

// ── Windows ──────────────────────────────────────────────────────────────────
function createSplashWindow() {
  const win = new BrowserWindow({
    width: 400, height: 300,
    frame: false, resizable: false, center: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    backgroundColor: '#0d1825',
  });
  win.loadFile(path.join(__dirname, 'splash.html'));
  return win;
}

function createLicenseWindow(htmlFile) {
  const win = new BrowserWindow({
    width: 500, height: 400,
    frame: true, resizable: false, center: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
    backgroundColor: '#0d1825',
  });
  win.loadFile(path.join(__dirname, htmlFile));
  return win;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900,
    minWidth: 1024, minHeight: 600,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
    icon: path.join(__dirname, 'icons', 'icon.ico'),
    show: false,
  });
  mainWindow.loadURL(`http://127.0.0.1:${FLASK_PORT}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createSetupWindow() {
  const win = new BrowserWindow({
    width: 600, height: 550,
    frame: true, resizable: false, center: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
    backgroundColor: '#0d1825',
  });
  win.loadFile(path.join(__dirname, 'setup-wizard.html'));
  return win;
}

// ── System Tray ──────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'icons', 'icon.ico');
  // Use a default icon if custom icon not available
  tray = new Tray(fs.existsSync(iconPath) ? iconPath : nativeImage.createEmpty());
  const menu = Menu.buildFromTemplate([
    { label: 'Show', click: () => { if (mainWindow) mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setToolTip('Hercules Reporting Module');
  tray.setContextMenu(menu);
  tray.on('double-click', () => { if (mainWindow) mainWindow.show(); });
}

// ── PostgreSQL ───────────────────────────────────────────────────────────────
function startPostgres() {
  return new Promise((resolve, reject) => {
    const pgBin = path.join(PGSQL_DIR, 'bin');
    const pgCtl = path.join(pgBin, 'pg_ctl.exe');
    const initdb = path.join(pgBin, 'initdb.exe');

    if (!fs.existsSync(pgCtl)) {
      log('PostgreSQL not bundled at ' + pgCtl + ', skipping (use external DB)');
      resolve();
      return;
    }

    // Initialize data directory if needed
    if (!fs.existsSync(path.join(PGDATA, 'PG_VERSION'))) {
      log('Initializing PostgreSQL data directory...');
      try {
        execSync(`"${initdb}" -D "${PGDATA}" --locale=C -U postgres`, { timeout: 30000 });
        log('PostgreSQL data directory initialized');
      } catch (e) {
        reject(new Error('Failed to init PostgreSQL: ' + e.message));
        return;
      }
    }

    // Start PostgreSQL
    log('Starting PostgreSQL...');
    try {
      execSync(`"${pgCtl}" start -D "${PGDATA}" -l "${path.join(LOG_DIR, 'postgresql.log')}" -w`, { timeout: 30000 });
      log('PostgreSQL started');
      resolve();
    } catch (e) {
      reject(new Error('Failed to start PostgreSQL: ' + e.message));
    }
  });
}

function stopPostgres() {
  const pgCtl = path.join(PGSQL_DIR, 'bin', 'pg_ctl.exe');
  if (fs.existsSync(pgCtl)) {
    try {
      execSync(`"${pgCtl}" stop -D "${PGDATA}" -m fast`, { timeout: 10000 });
      log('PostgreSQL stopped');
    } catch (e) {
      log('Failed to stop PostgreSQL: ' + e.message);
    }
  }
}

// ── Flask Backend ────────────────────────────────────────────────────────────
function startBackend() {
  const exePath = path.join(BACKEND_DIR, 'hercules-backend.exe');
  if (!fs.existsSync(exePath)) {
    // Dev mode — run python directly
    log('Backend exe not found, attempting python desktop_entry.py (dev mode)');
    backendProcess = spawn('python', ['desktop_entry.py'], {
      cwd: path.join(__dirname, '..', 'backend'),
      env: { ...process.env, HERCULES_DESKTOP: '1', FLASK_PORT: String(FLASK_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else {
    log('Starting backend: ' + exePath);
    backendProcess = spawn(exePath, [], {
      cwd: BACKEND_DIR,
      env: { ...process.env, HERCULES_DESKTOP: '1', FLASK_PORT: String(FLASK_PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  backendProcess.stdout.on('data', d => log('[backend] ' + d.toString().trim()));
  backendProcess.stderr.on('data', d => log('[backend:err] ' + d.toString().trim()));

  backendProcess.on('exit', (code) => {
    log(`Backend exited with code ${code}`);
    if (!app.isQuitting && backendRestarts < MAX_BACKEND_RESTARTS) {
      backendRestarts++;
      log(`Auto-restarting backend (attempt ${backendRestarts}/${MAX_BACKEND_RESTARTS})`);
      setTimeout(startBackend, 2000);
    }
  });
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    log('Stopping backend...');
    try {
      // Windows: use taskkill (SIGTERM doesn't work on Windows)
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${backendProcess.pid} /T /F`, { timeout: 5000 });
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch (e) {
      log('taskkill failed, force killing: ' + e.message);
      backendProcess.kill();
    }
    backendProcess = null;
  }
}

// ── Health Poll ──────────────────────────────────────────────────────────────
function waitForHealth() {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      if (Date.now() - start > HEALTH_TIMEOUT) {
        reject(new Error('Backend health check timed out'));
        return;
      }
      const req = http.get(`http://127.0.0.1:${FLASK_PORT}/health`, res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.status === 'ok') { resolve(); return; }
          } catch {}
          setTimeout(poll, HEALTH_POLL_INTERVAL);
        });
      });
      req.on('error', () => setTimeout(poll, HEALTH_POLL_INTERVAL));
      req.setTimeout(2000, () => { req.destroy(); setTimeout(poll, HEALTH_POLL_INTERVAL); });
    };
    poll();
  });
}

// ── Periodic License Check ───────────────────────────────────────────────────
function startPeriodicLicenseCheck() {
  licenseCheckTimer = setInterval(async () => {
    try {
      const machineId = getMachineId();
      const result = await httpGet(`${LICENSE_API}/api/license/status?machine_id=${machineId}`);
      log(`Periodic license check: status=${result.status}`);
      if (result.status === 'approved') {
        saveLicenseCache(result);
      } else if (result.status === 'denied' || result.status === 'expired') {
        log('License revoked/expired — warning user');
        if (mainWindow) {
          dialog.showMessageBox(mainWindow, {
            type: 'warning',
            title: 'License Expired',
            message: 'Your license has been revoked or expired. The application will close in 5 minutes.',
            buttons: ['OK'],
          });
          setTimeout(() => { app.isQuitting = true; app.quit(); }, 5 * 60 * 1000);
        }
      }
    } catch (e) {
      log('Periodic license check failed (will retry): ' + e.message);
    }
  }, LICENSE_CHECK_INTERVAL);
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────
ipcMain.handle('run-init-db', async (event, args) => {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(RESOURCES, 'backend', 'init_db.py');
    const cmdArgs = [
      pythonScript,
      '--host', args.host || '127.0.0.1',
      '--port', String(args.port || PG_PORT),
      '--user', args.user || 'postgres',
      '--password', args.password || 'postgres',
      '--admin-user', args.adminUser || 'admin',
      '--admin-pass', args.adminPass || 'admin',
    ];
    execFile('python', cmdArgs, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) { reject(stderr || err.message); return; }
      if (stdout.includes('SUCCESS')) { resolve('ok'); }
      else { reject(stdout || 'Unknown error'); }
    });
  });
});

ipcMain.handle('save-config', async (event, { filename, data }) => {
  const filepath = path.join(CONFIG_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return 'ok';
});

ipcMain.handle('get-config', async (event, filename) => {
  const filepath = path.join(CONFIG_DIR, filename);
  if (fs.existsSync(filepath)) {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  }
  return null;
});

ipcMain.handle('quit-app', () => {
  app.isQuitting = true;
  app.quit();
});

// ── App Lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log('=== Hercules Desktop App Starting ===');

  // 1. License check
  log('Checking license...');
  const license = await checkLicense();

  if (license.status === 'pending') {
    const pendingWin = createLicenseWindow('license-pending.html');
    // Poll every 30s
    const pollInterval = setInterval(async () => {
      const result = await checkLicense();
      if (result.status === 'approved') {
        clearInterval(pollInterval);
        pendingWin.close();
        await startApp();
      } else if (result.status === 'denied') {
        clearInterval(pollInterval);
        pendingWin.close();
        createLicenseWindow('license-denied.html');
      }
    }, 30000);
    return;
  }

  if (license.status === 'denied' || license.status === 'expired' || license.status === 'error') {
    createLicenseWindow('license-denied.html');
    return;
  }

  // Approved — continue startup
  await startApp();
});

async function startApp() {
  // 2. Port check
  const [port5001Free, port5432Free] = await Promise.all([
    isPortFree(FLASK_PORT),
    isPortFree(PG_PORT),
  ]);

  if (!port5001Free) {
    dialog.showErrorBox('Port Conflict', `Port ${FLASK_PORT} is already in use. Please close the application using this port and try again.`);
    app.quit();
    return;
  }

  const splash = createSplashWindow();

  // 3. First-run setup wizard
  if (!fs.existsSync(DB_CONFIG)) {
    splash.close();
    const setupWin = createSetupWindow();
    // Wait for setup to complete via IPC
    await new Promise(resolve => {
      ipcMain.once('setup-complete', () => {
        setupWin.close();
        resolve();
      });
    });
  }

  // 4. Start PostgreSQL (if bundled and port is free)
  if (port5432Free && fs.existsSync(path.join(PGSQL_DIR, 'bin', 'pg_ctl.exe'))) {
    try {
      await startPostgres();
    } catch (e) {
      log('PostgreSQL start failed: ' + e.message);
      dialog.showErrorBox('Database Error', 'Failed to start PostgreSQL: ' + e.message);
      app.quit();
      return;
    }
  }

  // 5. Start Flask backend
  startBackend();

  // 6. Wait for health
  try {
    await waitForHealth();
    log('Backend is healthy');
  } catch (e) {
    log('Backend health check failed: ' + e.message);
    dialog.showErrorBox('Startup Error', 'Backend failed to start within 30 seconds. Check logs at:\n' + LOG_DIR);
    app.quit();
    return;
  }

  // 7. Show main window
  splash.close();
  createMainWindow();
  createTray();
  startPeriodicLicenseCheck();
}

app.on('window-all-closed', () => {
  // Don't quit — tray keeps running
  if (process.platform !== 'darwin' && app.isQuitting) {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (licenseCheckTimer) clearInterval(licenseCheckTimer);
  stopBackend();
  stopPostgres();
});

app.on('activate', () => {
  if (mainWindow) mainWindow.show();
});
