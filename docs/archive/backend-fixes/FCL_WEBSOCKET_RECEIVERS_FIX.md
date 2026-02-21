# FCL WebSocket Receivers Missing Fix

## Problem
After fixing the frontend to dynamically display FCL receiver bin IDs, the live monitor was still showing "0081" instead of the correct destination bin. The issue persisted even after restarting Docker.

## Root Cause

The real problem was in the **WebSocket emission** in `app.py`, not the frontend or the REST API.

### Analysis

1. ✅ **REST API was correct** (`/orders/plc/db199-monitor`):
   ```python
   return jsonify({
       'status': 'success', 
       'data': result, 
       'fcl_receivers': result.get('fcl_receivers', [])
   }), 200
   ```

2. ✅ **Frontend was correct** (after the fix):
   ```javascript
   const receiverRows = d.fcl_receivers?.map(rec => { ... })
   ```

3. ❌ **WebSocket was WRONG** (`app.py` FCL monitor loop):
   ```python
   data = json.loads(res.data.decode("utf-8")).get("data", {})
   socketio.emit("fcl_data", data)
   ```
   
   **Issue:** Only extracting the `"data"` field and ignoring `"fcl_receivers"` field!

### Why This Happened

The REST API response structure is:
```json
{
  "status": "success",
  "data": { 
    "job_status": 4,
    "flow_rate": 24.0,
    ...
  },
  "fcl_receivers": [
    {"id": "0028", "name": "PREMIUM BAKER", "weight": 23.9},
    {"id": "FCL_2_520WE", "name": "FCL 2_520WE", "weight": 671137107.0}
  ]
}
```

But the WebSocket code was only extracting `response["data"]` and emitting it, which doesn't include `fcl_receivers`.

This meant:
- Initial page load worked (uses REST API directly)
- But live updates via WebSocket didn't include receiver info
- Frontend had no `fcl_receivers` to display, so it showed stale/cached/wrong data

## Solution

### Backend Fix (`app.py`)

**File:** `backend/app.py` (lines ~1854-1863)

**Before:**
```python
res = http.request("GET", "http://localhost:5000/orders/plc/db199-monitor")
if res.status != 200:
    logger.warning("⚠️ Failed to fetch /db199-monitor")
    gevent.sleep(1)
    continue

data = json.loads(res.data.decode("utf-8")).get("data", {})
logger.info(f"[FCL] Loop Time: {datetime.datetime.now()} | Job Status: {data.get('job_status')} | Order: {fcl_current_order_name}")

socketio.emit("fcl_data", data)
```

**After:**
```python
res = http.request("GET", "http://localhost:5000/orders/plc/db199-monitor")
if res.status != 200:
    logger.warning("⚠️ Failed to fetch /db199-monitor")
    gevent.sleep(1)
    continue

response_json = json.loads(res.data.decode("utf-8"))
data = response_json.get("data", {})
fcl_receivers = response_json.get("fcl_receivers", [])  # ✅ Extract fcl_receivers

# ✅ Include fcl_receivers in the data being emitted
data['fcl_receivers'] = fcl_receivers

logger.info(f"[FCL] Loop Time: {datetime.datetime.now()} | Job Status: {data.get('job_status')} | Order: {fcl_current_order_name} | Receivers: {[r.get('id') for r in fcl_receivers]}")

socketio.emit("fcl_data", data)
```

### What Changed

1. Parse full JSON response (not just `"data"` field)
2. Extract `fcl_receivers` array from response
3. Add `fcl_receivers` to the `data` object before emitting
4. Enhanced logging to show receiver bin IDs for debugging

## Testing

After restarting the backend:

1. **Check backend logs:**
   ```
   [FCL] Loop Time: ... | Order: FCL45 | Receivers: ['0028', 'FCL_2_520WE']
   ```
   Should show actual bin IDs (not '0081' if destination is bin 28)

2. **Check browser console (WebSocket messages):**
   ```javascript
   {
     job_status: 4,
     flow_rate: 24.0,
     fcl_receivers: [
       {id: "0028", name: "PREMIUM BAKER", weight: 23.9},
       {id: "FCL_2_520WE", name: "FCL 2_520WE", weight: 671137107.0}
     ]
   }
   ```

3. **Live Monitor Display:**
   - First receiver: Bin ID should match PLC destination (e.g., "0028", "0029", "0030")
   - Product name should show actual material (e.g., "PREMIUM BAKER")
   - Weight should update in real-time

## Impact

- ✅ WebSocket now includes `fcl_receivers` array
- ✅ Live monitor updates show correct receiver bin IDs in real-time
- ✅ Consistent with initial page load data
- ✅ Enhanced logging for debugging

## Files Modified
- `backend/app.py` - FCL monitor WebSocket emission (lines ~1854-1867)

## Related Files (Previous Fixes)
- `Frontend/src/Pages/Report.jsx` - Dynamic receiver type detection (already fixed)
- `backend/orders_bp.py` - Dynamic bin ID from PLC (already correct)

## Restart Required

```bash
cd "C:\Users\Administrator\Desktop\Hercules v2.0 Docker\backend"
docker-compose restart backend
```

The frontend doesn't need changes since it was already expecting `fcl_receivers` in the WebSocket data.

