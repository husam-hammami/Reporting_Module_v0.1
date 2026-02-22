# 02 -- PLC Connection

This document explains how the Reporting Module connects to industrial PLCs to read live process data. It covers the supported protocol, configuration, addressing, and technical internals.

---

## 1. What is a PLC?

A **Programmable Logic Controller (PLC)** is the industrial computer that controls and monitors equipment on the plant floor. PLCs read sensors (temperature, pressure, flow, weight) and drive actuators (motors, valves, conveyors). The Reporting Module connects to the PLC over the plant network to read these sensor values in real time, without interfering with the control logic running on the PLC itself.

---

## 2. Currently Supported: Siemens S7

The Reporting Module connects to **Siemens S7-300 and S7-1500 series PLCs** using the [snap7](https://snap7.sourceforge.net/) open-source library, which implements the S7 communication protocol over TCP/IP.

### 2.1 Connection Parameters

| Parameter | Description | Default | Notes |
|-----------|-------------|---------|-------|
| **IP Address** | The PLC's IPv4 address on the plant network | `192.168.23.11` | Must be reachable from the Reporting Module server |
| **Rack** | Physical rack number where the CPU module is installed | `0` | Almost always 0 for S7-1500; may vary for S7-300/400 |
| **Slot** | Slot number of the CPU module within the rack | `3` | Typically 2 for S7-300, 1 for S7-1500, 3 for some configurations |
| **TCP Port** | The S7 protocol port | `102` | Standard ISO-on-TCP port; handled internally by snap7 |

### 2.2 Configuring via the Admin UI

1. Navigate to **Admin --> PLC Settings** in the web interface.
2. Enter the PLC's **IP address**, **rack**, and **slot** values.
3. Click **Save**. The system will persist the configuration and reconnect automatically.
4. Use the **Test Connection** button to verify the PLC is reachable.

When you save new settings through the Admin UI, the backend calls `reconnect_shared_plc()`, which tears down the existing connection, creates a new `SharedPLCConnection` with the updated parameters, and establishes a fresh link to the PLC.

### 2.3 Configuration File

PLC settings are stored in a JSON file on the server:

**Location:** `backend/config/plc_config.json`

```json
{
  "ip": "192.168.23.11",
  "rack": 0,
  "slot": 3
}
```

The file is read by `plc_config.py`, which provides two functions:

- `get_plc_config()` -- Returns the current `{ip, rack, slot}` dictionary. Uses an in-memory cache with a **5-second TTL** so the file is not re-read on every PLC operation.
- `set_plc_config(ip, rack, slot)` -- Validates the IP format (must match `^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$`) and rack/slot types (must be integers), writes the JSON file, and invalidates the cache.

If the config file is missing or unreadable, the system falls back to the compiled defaults (`192.168.23.11`, rack 0, slot 3).

### 2.4 Timeouts, Retry, and Reconnection

The connection is tuned for responsiveness without blocking the web server:

| Setting | Value | Purpose |
|---------|-------|---------|
| **Connect timeout** | 2,000 ms | How long to wait when establishing a new connection (default snap7 is ~20s; reduced to 2s) |
| **Receive timeout** | 1,500 ms | Maximum wait for a PLC response to a read request |
| **Send timeout** | 1,500 ms | Maximum wait for sending a request to the PLC |
| **Reconnect cooldown** | 10 seconds | After a failed connection attempt, the system will not retry for 10 seconds to avoid flooding the network |

**Reconnection behavior:**

1. When a tag read is requested, `get_client()` first checks if the existing connection is alive by calling `get_cpu_state()`.
2. If the connection has dropped, it marks the connection as lost and attempts to reconnect.
3. If the previous connection attempt failed less than 10 seconds ago, it immediately raises a `ConnectionError` with a message indicating how many seconds remain in the cooldown.
4. On successful reconnection, the cooldown timer is reset to zero.

This design prevents the system from hammering an unreachable PLC and keeps the web server responsive even when the PLC is offline.

### 2.5 Connection Reuse (Shared Instance)

The system maintains a **single shared PLC connection** (`SharedPLCConnection`) that is reused across all tag reads and API requests. This avoids the overhead of opening a new TCP connection for every read cycle.

- The shared instance is created at module load time with the current config values.
- All access is **thread-safe** (protected by a `threading.Lock`).
- When PLC settings change via the Admin UI, `reconnect_shared_plc()` replaces the global shared instance with a new one configured for the updated IP/rack/slot.

### 2.6 Demo Mode

When the system is running in **demo mode** (no physical PLC available), `connect_to_plc_fast()` returns an emulator client instead of a real snap7 client. The emulator provides simulated tag values with realistic fluctuations, so the entire system -- dashboards, reports, historians -- can be tested without PLC hardware. See [07-EMULATOR](07-EMULATOR.md) for details.

---

## 3. Understanding S7 Addressing

This section is critical for anyone configuring PLC tags. Every data point in a Siemens PLC is stored in a **Data Block (DB)** at a specific memory location. You need three pieces of information to read a value:

### 3.1 Data Block (DB) Number

A Data Block is a numbered container of variables in the PLC program. The TIA Portal project defines which DB numbers exist and what data they hold. For example:

- **DB199** might contain water metering values
- **DB499** might contain scale weights
- **DB1603** might contain energy metering data
- **DB2099** might contain process sensor values

The DB number is assigned by the PLC programmer in TIA Portal.

### 3.2 Byte Offset

Within a DB, each variable occupies a position measured in **bytes from the start of the block**. The offset tells the system exactly where in the DB to start reading. For example, offset 24 means "start reading at byte 24."

Different data types occupy different numbers of bytes, so offsets are not necessarily consecutive. A REAL at offset 0 occupies bytes 0-3, and the next REAL would start at offset 4.

### 3.3 Bit Offset (BOOL Only)

For BOOL (true/false) data types, a single byte contains 8 individual bits. The bit offset (0 through 7) specifies which bit within the byte holds the value. For example, `DB100.20.3` means "DB 100, byte 20, bit 3."

Non-BOOL data types do not use bit offsets.

### 3.4 Data Types and Byte Sizes

| Data Type | Size | Range / Format | Bit Offset? | Description |
|-----------|------|----------------|-------------|-------------|
| **BOOL** | 1 bit | `true` / `false` | Yes (0-7) | Digital on/off status (motor running, valve open) |
| **INT** | 2 bytes | -32,768 to 32,767 | No | Signed 16-bit integer (small counters, setpoints) |
| **DINT** | 4 bytes | -2,147,483,648 to 2,147,483,647 | No | Signed 32-bit integer (large counters, energy totals) |
| **REAL** | 4 bytes | IEEE 754 float | No | Floating-point number (temperatures, pressures, flow rates) |
| **STRING** | Variable | Up to 254 characters | No | Text value; first 2 bytes are max-length and actual-length headers |

### 3.5 Address Examples

| Address | Meaning |
|---------|---------|
| `DB100.0` (REAL) | DB 100, byte offset 0, read 4 bytes as floating point |
| `DB100.4` (REAL) | DB 100, byte offset 4, next floating-point value |
| `DB100.8` (INT) | DB 100, byte offset 8, read 2 bytes as signed integer |
| `DB100.10` (DINT) | DB 100, byte offset 10, read 4 bytes as signed 32-bit integer |
| `DB100.14.0` (BOOL) | DB 100, byte offset 14, bit 0 |
| `DB100.14.5` (BOOL) | DB 100, byte offset 14, bit 5 |
| `DB100.16` (STRING) | DB 100, byte offset 16, read S7 string (header + characters) |

### 3.6 TIA Portal Address Notation

In TIA Portal exports, addresses use a slightly different notation with access-type prefixes:

| TIA Notation | System Notation | Meaning |
|--------------|-----------------|---------|
| `DB199.DBD20` | `DB199.20` (REAL/DINT) | Double-word (4 bytes) at offset 20 |
| `DB199.DBW20` | `DB199.20` (INT) | Word (2 bytes) at offset 20 |
| `DB199.DBB20` | `DB199.20` (byte) | Single byte at offset 20 |
| `DB199.DBX20.0` | `DB199.20.0` (BOOL) | Bit 0 of byte 20 |

The system's address parser (`utils/plc_parser.py`) accepts the simplified `DB<number>.<offset>` and `DB<number>.<offset>.<bit>` format. When importing from TIA Portal exports, the TIA notation is converted automatically. See [TIA_TAGS_IMPORT.md](TIA_TAGS_IMPORT.md) for the full import workflow.

### 3.7 Sample Address Map

Here is an example of how a DB might be laid out, showing how offsets relate to data types:

| Offset | Data Type | Size | Tag Name | Description |
|--------|-----------|------|----------|-------------|
| 0 | REAL | 4 bytes | Temperature_1 | Kiln inlet temperature |
| 4 | REAL | 4 bytes | Pressure_1 | System pressure |
| 8 | REAL | 4 bytes | Flow_Rate_1 | Main flow rate |
| 12 | REAL | 4 bytes | Motor_Speed_1 | Motor RPM |
| 16 | REAL | 4 bytes | Level_Tank_1 | Tank fill level |
| 20 | INT | 2 bytes | Alarm_Count | Active alarm count |
| 22 | BOOL | 1 bit | Motor_Running | bit 0: motor status |
| 22 | BOOL | 1 bit | Valve_Open | bit 1: valve status |
| 23 | -- | 1 byte | *(padding)* | Alignment padding |
| 24 | DINT | 4 bytes | Total_Energy | Cumulative energy counter |

Notice how REAL values consume 4 bytes each (offsets increment by 4), INT takes 2 bytes, and multiple BOOL values can share the same byte at different bit offsets.

---

## 4. For Developers

### 4.1 Source Files

| File | Purpose |
|------|---------|
| `backend/plc_utils.py` | Shared persistent PLC connection class and factory function |
| `backend/plc_config.py` | Configuration read/write with TTL cache |
| `backend/config/plc_config.json` | Persisted connection parameters |
| `backend/utils/plc_parser.py` | PLC address string parser |
| `backend/utils/tag_reader.py` | Tag value reading and type-specific parsing |

### 4.2 snap7 Client Lifecycle

1. **Initialization:** `SharedPLCConnection.__init__()` reads the current config from `plc_config.get_plc_config()` and stores `ip`, `rack`, `slot`. No connection is made yet.

2. **First read:** When `get_client()` is called, it creates a new `snap7.client.Client()`, sets the three timeout parameters (`PingTimeout`, `RecvTimeout`, `SendTimeout`), and calls `client.connect(ip, rack, slot)`.

3. **Subsequent reads:** `get_client()` checks the existing client with `get_cpu_state()`. If the call succeeds, the same client is returned. If it throws, the connection is marked as lost.

4. **Reconnection:** The old client is disconnected and destroyed. A new client is created and connected. If this fails, the failure timestamp is recorded and the 10-second cooldown begins.

5. **Configuration change:** `reconnect_shared_plc(ip, rack, slot)` disconnects and destroys the current client, then creates a completely new `SharedPLCConnection` instance with the new parameters.

### 4.3 Reading Values by Data Type

The `read_tag_value(plc, tag_config)` function in `tag_reader.py` handles all type-specific parsing:

```
BOOL:
    data = plc.db_read(db_number, offset, 1)      # read 1 byte
    value = snap7.util.get_bool(data, 0, bit_pos)  # extract bit

INT:
    data = plc.db_read(db_number, offset, 2)       # read 2 bytes
    value = struct.unpack('>h', data)[0]            # big-endian signed short

DINT:
    data = plc.db_read(db_number, offset, 4)       # read 4 bytes
    value = struct.unpack('>i', data)[0]            # big-endian signed int

REAL:
    data = plc.db_read(db_number, offset, 4)       # read 4 bytes
    if byte_swap:
        data = data[::-1]                           # reverse byte order
        value = struct.unpack('<f', data)[0]        # little-endian float
    else:
        value = struct.unpack('>f', data)[0]        # big-endian float (standard)

STRING:
    data = plc.db_read(db_number, offset, max_len + 2)  # header + payload
    actual_len = data[1]                                  # byte 1 = actual length
    value = data[2:2+actual_len].decode('ascii')          # payload starts at byte 2
```

**Key details:**

- All integer types use **big-endian** byte order (`>` prefix in struct format), which is standard for Siemens S7.
- REAL values default to **big-endian** (`byte_swap=False`). When `byte_swap=True`, the 4 bytes are reversed before unpacking as little-endian. This handles PLCs or firmware versions that store floats in reversed byte order.
- REAL values are rounded to the tag's configured `decimal_places` (default 2).
- STRING values in S7 have a 2-byte header: byte 0 is the maximum length, byte 1 is the actual length. The system reads `max_len + 2` bytes and decodes only the actual content.

### 4.4 Value Transformation Pipeline

After reading the raw PLC value, the system applies transformations:

1. **Value formula** (if configured): A mathematical expression using the variable `value` to represent the raw reading. Example: `value * 0.277778` converts t/h to kg/s. Supports standard math functions (`abs`, `round`, `sqrt`, `sin`, `cos`, `log`, `log10`, `exp`, `pow`, `pi`, `e`).

2. **Scaling factor** (fallback): If no value formula is set, the raw value is multiplied by the tag's `scaling` factor (default `1.0`). This provides backward compatibility with the simpler linear scaling approach.

### 4.5 Error Handling

- **Connection errors** raise `ConnectionError` and are caught by the calling code. The cooldown mechanism prevents rapid reconnection attempts.
- **Read errors** (invalid address, PLC busy) return `None` for the affected tag. Common errors like "Address out of range" are logged at WARNING level without a full traceback to reduce log noise.
- **Thread safety** is ensured by the `threading.Lock` in `SharedPLCConnection`. Only one thread can attempt connection or reconnection at a time.

### 4.6 Key Functions

| Function | Location | Signature | Purpose |
|----------|----------|-----------|---------|
| `connect_to_plc_fast()` | `plc_utils.py` | `() -> Client` | Returns the shared PLC client (or emulator in demo mode) |
| `reconnect_shared_plc()` | `plc_utils.py` | `(ip, rack, slot) -> None` | Replaces the shared connection with new parameters |
| `get_plc_config()` | `plc_config.py` | `() -> dict` | Returns `{ip, rack, slot}` with 5s TTL cache |
| `set_plc_config()` | `plc_config.py` | `(ip, rack, slot) -> bool` | Validates and persists new config; returns success |
| `read_tag_value()` | `tag_reader.py` | `(plc, tag_config) -> value` | Reads one tag from PLC; returns typed value or None |
| `read_all_tags()` | `tag_reader.py` | `(tag_names?, db_connection_func?) -> dict` | Reads multiple tags; returns `{name: value}` dict |
| `parse_plc_address()` | `plc_parser.py` | `(address_str) -> dict` | Parses `DB<n>.<offset>[.<bit>]` into components |
| `evaluate_value_formula()` | `tag_reader.py` | `(formula, raw_value) -> float` | Applies a math formula to transform a raw PLC value |

---

## 5. Future Protocols (Roadmap)

The Reporting Module is designed with a **tag abstraction layer**: the rest of the system (dashboards, reports, historian) works with tag names and values, not protocol-specific details. Adding support for a new protocol means implementing a new reader module -- the UI, database, and reporting layers remain unchanged.

### 5.1 OPC-UA (Planned)

**OPC Unified Architecture** is the modern standard for industrial communication. It provides a unified, cross-vendor protocol for reading data from PLCs, SCADA systems, and other industrial devices regardless of manufacturer.

- **Why:** Enables connecting to non-Siemens PLCs (Allen-Bradley, ABB, Schneider, Beckhoff) through a single protocol.
- **How:** A new `opc_ua_reader.py` module would use an OPC-UA client library (e.g., `opcua` or `asyncua`) to connect to an OPC-UA server and read node values by NodeID.

### 5.2 Modbus TCP/RTU (Planned)

**Modbus** is one of the oldest and most widely deployed industrial protocols. Many simpler devices (power meters, variable frequency drives, sensors) speak Modbus natively.

- **Modbus TCP:** Communication over Ethernet using TCP/IP.
- **Modbus RTU:** Communication over serial (RS-485) connections.
- **How:** A new `modbus_reader.py` module would use `pymodbus` to read holding registers, input registers, coils, and discrete inputs.

### 5.3 Architecture Note

To add a new protocol:

1. Create a reader module (e.g., `opc_ua_reader.py`) that implements the same interface as `read_tag_value()`.
2. Add the protocol name as a new `source_type` option in the tags table (alongside `PLC`, `Formula`, `Mapping`, `Manual`).
3. Update `read_all_tags()` to dispatch to the appropriate reader based on `source_type`.

No changes are needed in the dashboard, report builder, historian, or any other consumer of tag values.

---

Previous: [01-SYSTEM-OVERVIEW](01-SYSTEM-OVERVIEW.md) | Next: [03-TAG-ENGINEERING](03-TAG-ENGINEERING.md)
