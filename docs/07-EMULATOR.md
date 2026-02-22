# 07 -- Emulator

## What is the Emulator?

The Reporting Module includes a built-in software PLC emulator that simulates real tag values without requiring physical PLC hardware. When the system cannot connect to a real Siemens S7 PLC -- or when demo mode is explicitly enabled -- it falls back to the emulator, which generates realistic, time-varying values for all configured tags. This makes the emulator essential for:

- **Development** -- Backend and frontend engineers can work on features without a PLC on the network.
- **Testing** -- Automated and manual testing of dashboards, reports, and archive workers.
- **Demos** -- Sales and training sessions with realistic-looking live data.
- **Training** -- New operators can learn the interface with simulated plant data before going live.

The emulator is not a separate application. It is built into the backend and activated transparently via a configuration flag.

---

## How Demo Mode Works

The system has two data paths, selected at runtime:

```
Production mode:  PLC (real hardware)  --->  snap7 client  --->  tag_reader  --->  database
Demo mode:        Emulator (software)  --->  EmulatorClient  --->  tag_reader  --->  database
```

When `connect_to_plc_fast()` is called (in `backend/plc_utils.py`), it checks the demo mode flag:

```python
def connect_to_plc_fast():
    from demo_mode import get_demo_mode
    if get_demo_mode():
        from plc_data_source import get_emulator_client
        return get_emulator_client()
    return shared_plc.get_client()
```

If demo mode is active, it returns an `EmulatorClient` instance instead of a real snap7 client. The `EmulatorClient` has the same `db_read(db_number, offset, size)` interface as snap7, so the rest of the backend -- tag reader, monitor workers, archive workers -- does not know or care whether it is talking to a real PLC or the emulator.

### Two simulation layers

The emulator has two layers that handle different tag source types:

1. **PLC tags** (source_type = `"PLC"`) -- Simulated by `plc_data_source.py`. The emulator maintains an in-memory byte store keyed by `(db_number, offset)` with the same memory layout as a real Siemens PLC. The `EmulatorClient.db_read()` method returns bytes from this store, and the tag reader unpacks them identically to real PLC data.

2. **Manual/Formula tags** (source_type = `"Manual"` or `"Formula"`) -- Simulated by `tag_reader.py` function `_generate_demo_manual_values()`. These tags have no PLC address (no db_number/offset), so they are simulated separately using mathematical functions driven by tag unit and data type.

---

## Enabling Demo Mode

### Configuration file

Demo mode is controlled by a single JSON file:

```
backend/config/demo_mode.json
```

Contents:

```json
{
  "demo_mode": true
}
```

Set to `true` to enable the emulator, `false` to connect to a real PLC.

### Programmatic control

The `backend/demo_mode.py` module provides two functions:

| Function | Description |
|----------|-------------|
| `get_demo_mode()` | Returns `True` if demo mode is enabled. Uses a 5-second TTL in-memory cache to avoid re-reading the JSON file on every call. |
| `set_demo_mode(enabled)` | Writes the `demo_mode` flag to the JSON file and invalidates the cache. Called by the Settings API. |

### Switching between demo and real PLC

- **Via the UI:** Go to **Settings --> System**, toggle the Demo Mode switch. The backend calls `set_demo_mode()` and reconfigures the PLC connection.
- **Via the config file:** Edit `backend/config/demo_mode.json` directly. The change takes effect within 5 seconds (cache TTL).
- **Automatic fallback:** If `demo_mode` is `false` but the PLC connection fails repeatedly, the system does **not** automatically switch to demo mode. It will keep retrying the PLC connection with a 10-second cooldown between attempts. Demo mode must be explicitly enabled.

---

## Emulator Tags

The emulator supports two categories of tags, seeded via different mechanisms.

### PLC tags (from INTEGRATED_OFFSETS)

The file `backend/plc_data_source.py` defines `INTEGRATED_OFFSETS` -- a list of all PLC memory addresses the system reads in production. The emulator seeds simulated values at these exact `(db_number, offset)` locations:

| DB Block | Purpose | Example Tags |
|----------|---------|------------|
| DB199 | FCL (First Cleaning Line) monitor | Run/Idle, DestNo, DestBinId, Water consumed, Produced weight, Moisture setpoint, Source active flags |
| DB299 | SCL (Second Cleaning Line) monitor | DestNo, Flowrate, JobQty, MoistureSetpoint, Dumping flag |
| DB499 | MIL-A (Milling Line A) monitor | scale_weight, feeder targets, receiver bin IDs, linning_running |
| DB2099 | Report data + cross-line flows | FlowRate tags, Bran/Flour/Semolina flows, cumulative receiver counters |
| DB1603 | Energy/Power monitor | Phase currents/voltages (C2, M20-M24), EffectivePower, Total_Active_Energy counters |

The emulator seeds these at startup via `_seed_all()`, which calls dedicated functions for each DB block:

- `_seed_db2099_report()` -- 24 flow/product tags
- `_seed_db199_fcl()` -- FCL control, sources, receivers
- `_seed_db299_scl()` -- SCL control and feeder flows
- `_seed_db499_db2099_mila()` -- MIL-A scale weights, feeders, bran receivers
- `_seed_db1603_energy()` -- Power monitor with 5 meter blocks (C2, M20-M24)

### Manual tags (from seed_demo_tags.py)

The script `backend/tools/setup/seed_demo_tags.py` seeds **76 Manual-type tags** into the `tags` database table. These cover plant areas that do not have direct PLC addresses but are needed by report templates and dashboards:

| Category | Tags | Examples |
|----------|------|---------|
| Silo monitoring (8 silos x 4 tags) | 32 | `Silo1_Level`, `Silo1_Capacity`, `Silo1_Tons`, `Silo1_Temp` through `Silo8_*` |
| Process measurements | 9 | `Temperature_1`, `Pressure_1`, `Flow_Rate_1`, `Motor_Speed_1`, `Level_Tank_1`, `Power_Consumption`, `Vibration_1`, `Weight_Scale_1`, `Mill_Throughput` |
| Extraction/Quality | 5 | `Flour_Extraction`, `Bran_Extraction`, `Moisture_Avg`, `Aeration_Status`, `Quality_Deviation` |
| Intake/Outload | 7 | `Intake_Today`, `Intake_Week`, `Intake_Month`, `Outload_Ship`, `Outload_Truck`, `Outload_Rail`, `Balance_Tons` |
| Equipment status | 6 | `Conveyor1_Status`, `Conveyor1_Throughput`, `Elevator1_Running`, `Equipment_Downtime_Pct`, `Equipment_Utilization_Pct`, `Queue_Status` |
| Energy | 4 | `Power_Intake_Area`, `Power_Storage_Area`, `Energy_Per_Ton`, `Peak_Power_kW` |
| Alarms | 3 | `Alarm_Active_Count`, `Alarm_Critical_Count`, `Alarm_Response_Time_Avg` |
| KPIs | 7 | `Tons_Per_Day`, `Terminal_Availability_Pct`, `Downtime_Pct`, `Losses_Pct`, `OEE_Style`, `Running_Hours_Main`, `StartStop_Cycles` |
| Maintenance | 2 | `Abnormal_Load_Count`, `Early_Warning_Count` |

All Manual tags are seeded with `source_type = 'Manual'`, `data_type = 'REAL'`, and `is_active = true`. The seed script is idempotent -- it uses `ON CONFLICT (tag_name) DO UPDATE SET ...` so re-running it updates existing tags without creating duplicates.

---

## Adding New Tags to the Emulator

### Option A: Add a Manual tag via the seed script

1. Open `backend/tools/setup/seed_demo_tags.py`.
2. Add an entry to the `MANUAL_TAGS` list:
   ```python
   {'tag_name': 'My_New_Sensor', 'unit': 'bar', 'decimals': 2},
   ```
3. Run the seed script:
   ```bash
   cd backend/tools/setup
   python seed_demo_tags.py
   ```
4. The tag is now in the database. In demo mode, `_generate_demo_manual_values()` in `tag_reader.py` will automatically simulate values for it based on its unit (bar -> base 4.0, amplitude 0.5).

### Option B: Create a Manual tag in the UI

1. Go to **Engineering --> Tags**.
2. Click **Add Tag**.
3. Set **source_type** to `Manual`, enter the tag name, unit, and decimals.
4. Save. The emulator picks up new Manual tags automatically because `_generate_demo_manual_values()` queries the database for all active Manual/Formula tags on every cycle.

### Option C: Add a PLC tag with custom emulator offset

1. Define the tag in the database (via UI or seed script) with `source_type = 'PLC'` and the correct `db_number` and `offset`.
2. The emulator will automatically register it at startup via `seed_tags_from_db()`, or you can add a custom offset via the Settings UI or the `add_custom_offset()` API.
3. Custom offsets are persisted to `backend/config/emulator_custom_offsets.json`.

**Important:** The tag name must match what report templates and layout configurations expect. If a report template references `{Mill_Throughput}`, the emulator must produce a value for a tag named exactly `Mill_Throughput`.

---

## Value Generation Patterns

The emulator uses several patterns to generate realistic-looking industrial data.

### Sinusoidal simulation (most tags)

The primary pattern is a time-based sine wave with configurable base value and amplitude:

```python
value = base + amplitude * sin(2 * pi * t / period)
```

Where `t` is `time.time()` (Unix timestamp in seconds). This produces smooth, continuously varying values that look like real sensor readings on a live dashboard.

**For PLC tags** (`plc_data_source.py`), the period defaults to 60 seconds and a phase offset is derived from `hash(key) % 100` to prevent all tags from oscillating in sync:

```python
value = round(base + amplitude * sin(2*pi*t/60.0 + hash(key)%100), 6)
```

**For Manual tags** (`tag_reader.py`), the simulation adds a secondary drift component to make values look more natural:

```python
period = 200 + (hash(tag_name) % 200)       # 200-400 second period (varies per tag)
phase = hash(tag_name) % 100                 # unique phase per tag
val = base + amp * sin(2*pi*t/period + phase)
drift = amp * 0.08 * sin(2*pi*t/(period*2.3+47) + phase)  # slow drift overlay
final = val + drift
```

### Counter/accumulator simulation

Tags flagged as counters (e.g., `Total_Active_Energy`, cumulative receiver weights) use a linearly increasing pattern within each hour:

```python
value = int(base + amplitude * (t % 3600) / 3600)
```

This produces a value that ramps up from `base` to `base + amplitude` over each 3600-second (1-hour) period, then resets. In a real PLC, these values would only increase; the emulator approximates this behavior within each hour.

### Unit-based defaults

When a new tag is registered, the emulator picks (base, amplitude) defaults based on the tag's unit:

| Unit | Base | Amplitude | Behavior |
|------|------|-----------|----------|
| `°C` | 40.0 | 5.0 | Oscillates 35-45 |
| `bar` | 4.0 | 0.5 | Oscillates 3.5-4.5 |
| `%` | 50.0 | 10.0 | Oscillates 40-60 |
| `RPM` | 1450.0 | 20.0 | Oscillates 1430-1470 |
| `kW` | 100.0 | 15.0 | Oscillates 85-115 |
| `t/h` | 10.0 | 3.0 | Oscillates 7-13 |
| `A` | 100.0 | 30.0 | Oscillates 70-130 |
| `V` | 400.0 | 10.0 | Oscillates 390-410 |
| `kWh` | 500.0 | 50.0 | Counter pattern |
| `h` | 1200.0 | 0.0 | Static (running hours) |

If the unit is not recognized, the system falls back to data-type defaults (`REAL`: 50/10, `INT`: 50/10, `DINT`: 10000/1000, `BOOL`: 1/0).

### Silo-specific simulation

Silo tags (`Silo1_Level` through `Silo8_Temp`) have specialized logic:

- **`SiloN_Capacity`** -- Returns a fixed value of `500.0` tonnes.
- **`SiloN_Level`** -- Oscillates around 65% with amplitude 15%, each silo phase-shifted by `i * 17` radians so they don't move in lockstep.
- **`SiloN_Temp`** -- Oscillates around 26 degrees C with amplitude 2 degrees.
- **`SiloN_Tons`** -- Computed as `(Level / 100) * Capacity`, derived from the other two simulated values rather than independently generated.

---

## Limitations

The emulator is a simulation tool, not a PLC replica. Be aware of these differences:

| Aspect | Real PLC | Emulator |
|--------|----------|----------|
| **Timing** | PLC scan cycle is deterministic (typically 10-100ms). Reads happen within the PLC cycle. | Values are computed on-demand when `db_read()` is called. No real scan cycle. |
| **Communication errors** | Network timeouts, ISO protocol errors, address-out-of-range faults. | Always succeeds. `get_connected()` always returns `True`. No communication errors. |
| **Hardware faults** | PLC can report CPU stop, rack/slot errors, module failures. | No hardware state simulation. |
| **Counter behavior** | Cumulative counters only increase (or wrap at max value). They persist across power cycles. | Counters follow a periodic ramp that resets every hour. They do not persist across restarts. |
| **Byte order** | Real Siemens PLCs use big-endian for most data types but some implementations use byte-swapping. | Emulator stores values in big-endian (`>f`, `>i`) format. Byte-swap behavior matches the tag reader's expectations. |
| **String tags** | PLC strings have a 2-byte header (max length, actual length) followed by ASCII data. | No string simulation -- string reads return zero bytes. |
| **Multi-source correlation** | In a real plant, flow rates, temperatures, and pressures are physically correlated. | Each tag oscillates independently. No physical relationships between tags. |

---

## For Developers

### plc_data_source.py -- Class structure

The emulator is not implemented as a class hierarchy. It uses a module-level in-memory store with these key components:

| Component | Type | Purpose |
|-----------|------|---------|
| `_store` | `dict` of `(db, offset) -> (value, fmt)` | Current value and struct format for each PLC address |
| `_sim_defs` | `dict` of `(db, offset) -> (base, amp, fmt, kind)` | Simulation definitions for live-varying values |
| `_custom_entries` | `dict` of `(db, offset) -> entry_dict` | Custom offsets loaded from JSON config |
| `_store_lock` | `threading.Lock` | Thread safety for concurrent reads |
| `EmulatorClient` | class | Drop-in replacement for snap7 `Client` with `db_read()` method |

### Key methods

| Method | What it does |
|--------|-------------|
| `get_bytes(db_number, offset, size)` | Main entry point. Returns `size` bytes for the given PLC address. Calls `_seed_all()` on first access, then `_refresh_sim_values()` on every read to update time-varying values. |
| `_seed_all()` | One-time initialization. Calls all `_seed_db*` functions to populate `_store` and `_sim_defs`. Protected by a guard (`if _store: return`) so it only runs once. |
| `_refresh_sim_values()` | Recomputes all sinusoidal and counter values based on current `time.time()`. Called on every `get_bytes()` read. |
| `_register_sim(key, base, amplitude, fmt, kind)` | Registers a simulation definition and sets the initial value in `_store`. |
| `register_tag_in_emulator(tag_name, ...)` | Registers a tag dynamically (e.g., when a new PLC tag is created). Only acts on PLC-type tags; Manual/Formula tags are handled by `tag_reader.py`. |
| `seed_tags_from_db(db_connection_func)` | Called at startup. Reads all active PLC tags from the database and registers them in the emulator so they produce values. |
| `get_emulator_client()` | Returns a singleton `EmulatorClient` instance. |
| `get_emulator_offsets()` | Returns all integrated offsets with their current values. Used by the Settings UI to show the emulator state. |
| `add_custom_offset(...)` / `remove_custom_offset(...)` | CRUD operations for dynamic emulator offsets stored in `config/emulator_custom_offsets.json`. |

### How values are served to the tag reader

The flow in demo mode:

```
tag_reader.read_all_tags()
  |
  +-- connect_to_plc_fast()  -->  returns EmulatorClient (because demo_mode=true)
  |
  +-- For each PLC tag in the database:
  |     emulator_client.db_read(db_number, offset, size)
  |       |
  |       +-- plc_data_source.get_bytes(db_number, offset, size)
  |             |
  |             +-- _seed_all()          (first call only)
  |             +-- _refresh_sim_values() (every call)
  |             +-- Pack value into bytes using struct format
  |             +-- Return bytearray
  |
  |     tag_reader.read_tag_value() unpacks the bytes (struct.unpack)
  |     tag_reader.evaluate_value_formula() applies any formula
  |     Result stored in tag_values dict
  |
  +-- If demo mode: _generate_demo_manual_values()
  |     Queries database for all Manual/Formula tags
  |     Generates simulated values using _sim_manual()
  |     Merges into tag_values dict
  |
  +-- If no PLC tags found: get_demo_fallback_tag_values()
        Returns tag values derived from INTEGRATED_OFFSETS labels
```

### Adding new value generation patterns

To add a new simulation pattern:

1. Open `backend/plc_data_source.py`.
2. In the `_refresh_sim_values()` function, add a new `kind` branch:
   ```python
   elif kind == 'your_new_pattern':
       _store[key] = (your_value_function(t, base, amplitude), fmt)
   ```
3. When registering tags, use the new kind:
   ```python
   _register_sim((db, offset), base, amplitude, '>f', 'your_new_pattern')
   ```
4. For Manual tags, modify `_sim_manual()` in `backend/utils/tag_reader.py` to add tag-name-specific logic (see the existing silo handling as an example).

### Integration with the monitor worker

The monitor worker calls `read_all_tags()` on every poll cycle (~1 second). In demo mode, this function:

1. Reads PLC-type tags via the `EmulatorClient` (which calls `get_bytes()` internally).
2. Generates Manual/Formula tag values via `_generate_demo_manual_values()`.
3. Merges both sets into a single dict.
4. Returns the dict to the monitor worker, which stores it in `tag_values` JSONB and emits it via WebSocket.

The monitor worker, archive worker, and historian worker all operate identically in demo mode and production mode. They do not need to know which data source is active.

---

Previous: [06-FORMULAS-AND-CALCULATIONS](06-FORMULAS-AND-CALCULATIONS.md) | Next: [08-REPORT-TEMPLATES-AND-SEEDING](08-REPORT-TEMPLATES-AND-SEEDING.md)
