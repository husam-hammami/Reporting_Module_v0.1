# Enable LAN Access — Auto Firewall Rule + Shareable Network Link in Engineering

**Plan date:** 25/03/2026
**File:** `Enable LAN access — auto firewall rule + shareable network link in Engineering_Plan_25_03.md`

## Context
When Hercules is installed on a client's PC via the EXE installer, other PCs on the same network should be able to access the app by IP. Currently:
- The backend already binds to `0.0.0.0` (app.py line 904) ✅
- But CORS only allows `localhost`/`127.0.0.1` origins — blocks LAN requests ❌
- Windows Firewall blocks inbound connections on port 5004 by default ❌
- There's no UI to discover/share the LAN URL ❌

**Port is 5004** (launcher.py line 141: `BACKEND_PORT = "5004"`).

---

## Step 1: Auto-open firewall port on first launch

**File:** `launcher.py`

Add a function `ensure_firewall_rule()` before `start_backend()` call (before line 448):

```python
def ensure_firewall_rule():
    """Add Windows Firewall inbound rule for Hercules (idempotent — skips if exists)."""
    if platform.system() != "Windows":
        return
    rule_name = "Hercules Web Access"
    # Check if rule already exists
    check = subprocess.run(
        ["netsh", "advfirewall", "firewall", "show", "rule", f"name={rule_name}"],
        capture_output=True, text=True
    )
    if check.returncode == 0 and rule_name in check.stdout:
        print(f"Firewall rule '{rule_name}' already exists.")
        return
    print(f"Adding firewall rule '{rule_name}' for port {BACKEND_PORT}...")
    result = subprocess.run(
        ["netsh", "advfirewall", "firewall", "add", "rule",
         f"name={rule_name}", "dir=in", "action=allow",
         "protocol=TCP", f"localport={BACKEND_PORT}"],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        print("Firewall rule added successfully.")
    else:
        print(f"Warning: Could not add firewall rule: {result.stderr}")
```

Call `ensure_firewall_rule()` in `main()` just before `start_backend()` (line 448).

---

## Step 2: Fix CORS to allow LAN origins

**File:** `backend/app.py`

The current CORS setup (lines 84-97, 118-146) uses a hardcoded `ALLOWED_ORIGINS` set. Requests from `http://192.168.x.x:5004` get blocked.

**Approach:** Modify the `_normalize_origin()` check in `before_request` (line 118) and `after_request` (line 138) to also accept any origin that matches `http://<private-IP>:<FLASK_PORT>`. This keeps the explicit whitelist for known origins and adds dynamic LAN acceptance.

Add a helper function after `_normalize_origin()` (after line 115):

```python
import re

_PRIVATE_IP_RE = re.compile(
    r'^https?://(10\.\d{1,3}\.\d{1,3}\.\d{1,3}'
    r'|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}'
    r'|192\.168\.\d{1,3}\.\d{1,3})'
    r'(:\d+)?$'
)

def _is_allowed_origin(origin):
    """Return True if origin is in the whitelist OR is a private-network IP."""
    if not origin:
        return False
    normalized = _normalize_origin(origin)
    if normalized in ALLOWED_ORIGINS:
        return True
    return bool(_PRIVATE_IP_RE.match(normalized))
```

Then replace all `_normalize_origin(origin) in ALLOWED_ORIGINS` checks with `_is_allowed_origin(origin)` in:
- `before_request` handler (~line 123)
- `after_request` handler (~line 141)

Also update SocketIO init (line 100-105): change `cors_allowed_origins=list(ALLOWED_ORIGINS)` to `cors_allowed_origins=lambda origin: _is_allowed_origin(origin)`.

---

## Step 3: Backend endpoint to return LAN IP

**File:** `backend/app.py`

Add endpoint near other `/api/settings/*` routes (after line ~260):

```python
import socket

@app.route('/api/settings/network-info', methods=['GET'])
@login_required
def get_network_info():
    """Return the host machine's LAN IP and access URL."""
    port = int(os.environ.get('FLASK_PORT', 5001))
    try:
        # Connect to external host to determine LAN IP (doesn't send data)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except Exception:
        ip = "127.0.0.1"
    return jsonify({
        "ip": ip,
        "port": port,
        "url": f"http://{ip}:{port}"
    })
```

---

## Step 4: Engineering > System tab — "Network Access" card

**File:** `frontend/src/Pages/Settings/System/SystemSettings.jsx`

Add a new card section AFTER the existing PLC config card (after line ~165), BEFORE the DemoModeSettings card. Follow the existing Tailwind + dark mode styling patterns.

```jsx
// State for network info
const [networkInfo, setNetworkInfo] = useState(null);
const [copied, setCopied] = useState(false);

// Fetch network info on mount
useEffect(() => {
  fetch('/api/settings/network-info', { credentials: 'include' })
    .then(r => r.json())
    .then(data => setNetworkInfo(data))
    .catch(() => {});
}, []);

// Copy handler
const handleCopy = () => {
  navigator.clipboard.writeText(networkInfo.url);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

**UI card:** Dark card matching existing style with:
- 🌐 icon + "Network Access" heading
- Display: `http://<ip>:<port>` in a monospace/highlighted box
- 📋 Copy Link button (shows "Copied!" for 2s)
- Subtitle: "Share this link with anyone on the same network to access Hercules"

Only show this card when `networkInfo` is loaded and IP is not `127.0.0.1`.

---

## Files to modify

| File | Change |
|---|---|
| `launcher.py` | Add `ensure_firewall_rule()`, call before `start_backend()` |
| `backend/app.py` | Add `_is_allowed_origin()`, update CORS checks, add `/api/settings/network-info` |
| `frontend/src/Pages/Settings/System/SystemSettings.jsx` | Add Network Access card with copy-link UI |

## Verification

1. Run the app locally, visit Engineering > System — confirm the Network Access card shows with correct LAN IP
2. Test the copy button works
3. From another device on the same network, open the copied URL — confirm the app loads
4. Check `netsh advfirewall firewall show rule name="Hercules Web Access"` confirms rule exists after launcher runs
