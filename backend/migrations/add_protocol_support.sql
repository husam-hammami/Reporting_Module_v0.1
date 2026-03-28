-- Migration: Add multi-protocol PLC support (Modbus TCP, OPC UA alongside Siemens S7)
-- Date: 2026-03

-- 1. Drop existing CHECK constraint that only allows 'PLC' source_type
ALTER TABLE tags DROP CONSTRAINT IF EXISTS chk_source_type;

-- 2. Recreate with expanded values including new protocols
ALTER TABLE tags ADD CONSTRAINT chk_source_type
    CHECK (source_type IN ('PLC', 'Modbus', 'OPC_UA', 'Formula', 'Mapping', 'Manual'));

-- 3. Add protocol_type column (S7 = Siemens Snap7, Modbus = Modbus TCP, OPC_UA = OPC Unified Architecture)
ALTER TABLE tags ADD COLUMN IF NOT EXISTS protocol_type VARCHAR(20) DEFAULT 'S7';

-- 4. Add address_spec JSONB for protocol-agnostic addressing
--    S7:     {"db": 2099, "offset": 0, "bit_position": 0, "byte_swap": false}
--    Modbus: {"register": 100, "function": "holding", "word_order": "big"}
--    OPC_UA: {"node_id": "ns=2;i=5"}
ALTER TABLE tags ADD COLUMN IF NOT EXISTS address_spec JSONB DEFAULT '{}'::jsonb;

-- 5. Backward populate address_spec from existing S7-specific columns
UPDATE tags SET
    protocol_type = 'S7',
    address_spec = jsonb_build_object(
        'db', db_number,
        'offset', "offset",
        'bit_position', COALESCE(bit_position, 0),
        'byte_swap', COALESCE(byte_swap, false)
    )
WHERE (protocol_type IS NULL OR protocol_type = 'S7')
  AND source_type = 'PLC'
  AND db_number IS NOT NULL;

-- 6. Index for protocol-based queries
CREATE INDEX IF NOT EXISTS idx_tags_protocol ON tags (protocol_type);
