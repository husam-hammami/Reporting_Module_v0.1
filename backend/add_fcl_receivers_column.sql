-- Add fcl_receivers column to FCL monitor tables
-- This allows storing multiple receiver values

-- Add to live monitoring table
ALTER TABLE fcl_monitor_logs 
ADD COLUMN IF NOT EXISTS fcl_receivers JSONB DEFAULT '[]'::jsonb;

-- Add to archive table
ALTER TABLE fcl_monitor_logs_archive 
ADD COLUMN IF NOT EXISTS fcl_receivers JSONB DEFAULT '[]'::jsonb;

-- Verify columns were added
SELECT 
    'fcl_monitor_logs' as table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'fcl_monitor_logs'
AND column_name = 'fcl_receivers';

SELECT 
    'fcl_monitor_logs_archive' as table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'fcl_monitor_logs_archive'
AND column_name = 'fcl_receivers';

-- Show sample of latest records
SELECT 
    'Latest FCL Logs' as info,
    id,
    receiver,
    fcl_receivers,
    created_at
FROM fcl_monitor_logs
ORDER BY created_at DESC
LIMIT 3;

