# Multi-Protocol PLC Support: Modbus TCP + OPC UA

**Date:** 28/03/2026
**Branch:** `feature/multi-protocol-plc`

---

## Context

Hercules currently supports only Siemens S7 PLCs via Snap7. Many industrial clients use non-Siemens equipment (ABB, Schneider, Rockwell, generic Modbus devices) or PLCs with OPC UA servers. Adding Modbus TCP and OPC UA as first-class protocols opens Hercules to the broader market — feed mills, flour mills, and grain silos globally.

**Constraint:** Zero regression to existing S7 installations. All existing tags, reports, and configurations must work unchanged after the upgrade.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│              Tag Value Cache                  │  ← Unchanged (protocol-agnostic)
├──────────────────────────────────────────────┤
│              Tag Reader                       │  ← Dispatches to correct driver
├──────────┬──────────────┬────────────────────┤
│ Snap7    │  Modbus TCP  │     OPC UA         │  ← Protocol drivers
│ Driver   │  Driver      │     Driver         │
├──────────┴──────────────┴────────────────────┤
│          PLCDriver (ABC)                      │  ← Abstract interface
└──────────────────────────────────────────────┘
```

Workers (historian, dynamic_monitor, archive) read from TagValueCache — they never touch drivers. Zero worker changes needed.

**Single-protocol enforcement:** The system runs one protocol at a time (set in Settings > System). Tags must match the active protocol. This avoids silent failures from mixed-protocol tags.

---

## Phase 1: Database Migration

**File:** `backend/migrations/add_protocol_support.sql` (NEW)

Must run first — unblocks everything else.

```sql
-- Drop existing CHECK constraint that only allows 'PLC'
ALTER TABLE tags DROP CONSTRAINT IF EXISTS chk_source_type;

-- Recreate with new protocol values
ALTER TABLE tags ADD CONSTRAINT chk_source_type
    CHECK (source_type IN ('PLC', 'Modbus', 'OPC_UA', 'Formula', 'Mapping', 'Manual'));

-- Add protocol columns
ALTER TABLE tags ADD COLUMN IF NOT EXISTS protocol_type VARCHAR(20) DEFAULT 'S7';
ALTER TABLE tags ADD COLUMN IF NOT EXISTS address_spec JSONB DEFAULT '{}'::jsonb;

-- Backward populate address_spec from existing S7 columns
UPDATE tags SET
    protocol_type = 'S7',
    address_spec = jsonb_build_object(
        'db', db_number, 'offset', "offset",
        'bit_position', COALESCE(bit_position, 0),
        'byte_swap', COALESCE(byte_swap, false)
    )
WHERE (protocol_type IS NULL OR protocol_type = 'S7')
  AND source_type = 'PLC' AND db_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tags_protocol ON tags (protocol_type);
```

Add to `MIGRATION_ORDER` in `backend/init_db.py`.

---

## Phase 2: Abstract Driver Interface

**File:** `backend/drivers/__init__.py` (NEW)

```python
from abc import ABC, abstractmethod

class PLCDriver(ABC):
    @abstractmethod
    def connect(self, config: dict) -> None: ...
    @abstractmethod
    def disconnect(self) -> None: ...
    @abstractmethod
    def close(self) -> None: ...          # disconnect + release all resources
    @abstractmethod
    def is_connected(self) -> bool: ...
    @abstractmethod
    def read_tag(self, address: dict, data_type: str, **kwargs) -> any: ...
    @abstractmethod
    def read_batch(self, tags: list[dict]) -> dict[str, any]: ...
    @property
    @abstractmethod
    def protocol_name(self) -> str: ...

DRIVER_MAP = {}  # populated by imports below

def get_driver_class(protocol: str):
    return DRIVER_MAP.get(protocol)
```

**File:** `backend/drivers/snap7_driver.py` (NEW)

Refactored from existing code:
- Connection: `plc_utils.py` lines 52-88 (timeouts, connect/disconnect/destroy)
- Single read: `tag_reader.py` lines 85-167 (`read_tag_value()` with struct.unpack, byte_swap, S7 STRING)
- Batch read: `tag_reader.py` lines 524-588 (group by DB number, single db_read per block)
- `from snap7.util import get_bool` moves here (only S7 needs it)
- S7-specific timeout constants move here

**File:** `backend/drivers/modbus_driver.py` (NEW)

Uses `pymodbus>=3.6` (stable, well-maintained):
- `connect()`: `ModbusTcpClient(host, port, timeout).connect()`
- `read_tag()`: dispatch by function type
- `read_batch()`: group by function type, chunk at 125 registers max
- Address format: `{"register": 100, "function": "holding", "word_order": "big"}`
- Data types: BOOL=coil, INT=1 register, DINT/REAL=2 registers

**File:** `backend/drivers/opcua_driver.py` (NEW)

Uses `opcua>=0.98` (legacy python-opcua, synchronous API — compatible with eventlet):
- `connect()`: `Client(endpoint).connect()` with optional username/password
- `read_tag()`: `client.get_node(node_id).get_value()` — returns typed values
- `read_batch()`: low-level bulk read via `uaclient.read(ReadParameters)` with multiple `ReadValueId` entries
- Address format: `{"node_id": "ns=2;i=5"}`
- OPC UA returns native Python types — minimal conversion needed

**OPC UA known limitations:**
- python-opcua is unmaintained (2019) but its synchronous API works with eventlet
- Certificate-based security not supported — anonymous and username/password only
- Node browsing not supported — users enter node_id strings manually
- eventlet + opcua threading requires testing

---

## Phase 3: Refactor Core Backend

**File:** `backend/plc_utils.py` (MODIFY)

- `SharedPLCConnection.__init__(config: dict)` — instantiates correct driver from `DRIVER_MAP`
- `get_driver() -> PLCDriver` — replaces `get_client()`, same reconnection/cooldown logic
- `reconnect_shared_plc(config: dict)` — replaces `reconnect_shared_plc(ip, rack, slot)`
- `connect_to_plc_fast() -> PLCDriver` — returns driver or EmulatorClient

**File:** `backend/utils/tag_reader.py` (MODIFY)

- Remove `from snap7.util import get_bool` (now in snap7_driver)
- Replace `plc.db_read()` calls with `driver.read_tag()` / `driver.read_batch()`
- **Fix SQL queries**: change `WHERE source_type = 'PLC'` to `WHERE source_type IN ('PLC', 'Modbus', 'OPC_UA')` at lines 312, 324, 410, 420, 618
- Keep `decimal_places` rounding, `value_formula`, `scaling` in tag_reader (not in drivers)

**File:** `backend/plc_config.py` (MODIFY)

Add `protocol_type` to config. Default `'S7'` for backward compatibility.

**File:** `backend/plc_data_source.py` (MODIFY)

- `EmulatorClient` implements `PLCDriver` interface
- `seed_tags_from_db()`: skip tags where `protocol_type != 'S7'`
- For Modbus/OPC UA tags in demo mode: return random realistic values

**File:** `backend/live_monitor_bp.py` (MODIFY)

Change `/live-monitor/tags` to read from `TagValueCache` instead of calling `read_all_tags()` directly. Fixes both multi-protocol and the previously flagged cache-bypass issue.

---

## Phase 4: Backend API

**File:** `backend/app.py` (MODIFY)

- `POST /api/settings/plc-config`: accept `protocol_type` + protocol-specific fields
- `reconnect_shared_plc(config)` — pass full config dict
- Return `protocol_type` in system-status endpoint

**File:** `backend/tags_bp.py` (MODIFY)

- Accept `protocol_type` and `address_spec` in tag CRUD
- Enforce protocol consistency: reject tags with protocol != system protocol
- Tag import/export: include `protocol_type` and `address_spec`
- Add address parsers: `parse_modbus_address('HR100')` → `{"register": 100, "function": "holding"}`

**File:** `backend/utils/plc_parser.py` (MODIFY)

Add `parse_modbus_address()`:
- `HR100` → Holding Register 100
- `IR200` → Input Register 200
- `CO50` → Coil 50
- `DI75` → Discrete Input 75

---

## Phase 5: Frontend

**File:** `Frontend/src/Pages/Settings/System/SystemSettings.jsx` (MODIFY)

Protocol selector in PLC Connection section:
- **S7**: IP, Rack, Slot (current — unchanged)
- **Modbus**: IP, Port, Unit ID
- **OPC UA**: Endpoint URL, Username, Password

**File:** `Frontend/src/Pages/Settings/Tags/TagForm.jsx` (MODIFY)

Protocol-aware address fields:
- S7 (`source_type='PLC'`): plc_address, bit_position, byte_swap (unchanged)
- Modbus (`source_type='Modbus'`): register, function type dropdown, word order
- OPC UA (`source_type='OPC_UA'`): node_id text input

Source type dropdown expands: `PLC (S7)`, `Modbus`, `OPC UA`, `Formula`, `Manual`

**File:** `Frontend/src/i18n/*.json` (MODIFY — all 4 languages)

---

## Phase 6: Build & Tests

**File:** `backend/requirements.txt` (MODIFY)

```
pymodbus>=3.6
opcua>=0.98
```

**File:** `backend/hercules.spec` (MODIFY)

Bundle pymodbus and opcua dependencies for PyInstaller.

**File:** `backend/tests/test_batch_reads.py` (MODIFY)

Update `MockPLC` to implement `PLCDriver` interface.

---

## Files Summary

### NEW (5 files)
| File | Purpose |
|------|---------|
| `backend/drivers/__init__.py` | PLCDriver ABC + factory |
| `backend/drivers/snap7_driver.py` | S7 driver (refactored from existing) |
| `backend/drivers/modbus_driver.py` | Modbus TCP driver |
| `backend/drivers/opcua_driver.py` | OPC UA driver |
| `backend/migrations/add_protocol_support.sql` | Schema + CHECK constraint |

### MODIFIED (15 files)
| File | Change |
|------|--------|
| `backend/plc_utils.py` | Driver factory, config dict signature |
| `backend/utils/tag_reader.py` | Remove snap7, use driver interface, fix SQL |
| `backend/plc_config.py` | Add protocol_type |
| `backend/plc_data_source.py` | EmulatorClient → PLCDriver |
| `backend/live_monitor_bp.py` | Read from cache, not PLC |
| `backend/app.py` | Multi-protocol config API |
| `backend/tags_bp.py` | Protocol-aware CRUD + import/export |
| `backend/utils/plc_parser.py` | parse_modbus_address() |
| `backend/init_db.py` | Add migration |
| `backend/requirements.txt` | pymodbus, opcua |
| `backend/hercules.spec` | Bundle new deps |
| `backend/tests/test_batch_reads.py` | Update mock |
| `Frontend/.../TagForm.jsx` | Protocol fields |
| `Frontend/.../SystemSettings.jsx` | Protocol selector |
| `Frontend/src/i18n/*.json` | Translations (EN, AR, HI, UR) |

### UNCHANGED (confirmed protocol-agnostic)
- All workers (historian, dynamic_monitor, dynamic_archive)
- distribution_engine.py
- All Report Builder frontend

---

## Confidence

| Deliverable | Confidence |
|---|---|
| Driver interface + Snap7 refactor | 100% |
| DB migration | 100% |
| Modbus TCP driver | 95% |
| OPC UA basic reads | 75% |
| Backward compatibility | 100% |
| Frontend | 100% |
| Real hardware | 0% (requires physical devices) |

---

## Deployment Order

1. Backend first (migration + drivers + API)
2. Frontend second (protocol selector + tag form)
3. Never deploy frontend before backend

---

## Verification

1. Existing test_batch_reads.py passes with Snap7Driver mock
2. Migration on existing DB → tags get protocol_type + address_spec
3. Modbus: pymodbus simulator → create tags → read values
4. OPC UA: opcua test server → create tags → read values
5. Demo mode: each protocol works with EmulatorClient
6. Frontend: protocol selector adapts, tag form shows correct fields
7. Reports: distribution generates correct PDF/Excel
8. Enforcement: cannot create Modbus tag when system is S7
