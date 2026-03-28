-- Migration: Create Formula Library tables for industry KPI management
-- Supports plant-type-specific KPIs with multi-instance variable assignment
-- Date: 2026-03

-- 1. System config (plant type + other settings)
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Formula library (KPI template catalog)
CREATE TABLE IF NOT EXISTS formula_library (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    plant_type VARCHAR(30) NOT NULL,
    formula TEXT NOT NULL,
    description TEXT DEFAULT '',
    unit VARCHAR(20) DEFAULT '',
    variables JSONB DEFAULT '[]'::jsonb,
    is_builtin BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(name, plant_type)
);

CREATE INDEX IF NOT EXISTS idx_formula_lib_plant_type ON formula_library(plant_type);
CREATE INDEX IF NOT EXISTS idx_formula_lib_category ON formula_library(category);

-- 3. Formula instances (multi-instance: Silo 1, Silo 2, Press A, Press B)
CREATE TABLE IF NOT EXISTS formula_instances (
    id SERIAL PRIMARY KEY,
    formula_id INTEGER NOT NULL REFERENCES formula_library(id) ON DELETE CASCADE,
    instance_label VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(formula_id, instance_label)
);

-- 4. Variable assignments (tag binding per formula/instance)
CREATE TABLE IF NOT EXISTS formula_variable_assignments (
    id SERIAL PRIMARY KEY,
    formula_id INTEGER NOT NULL REFERENCES formula_library(id) ON DELETE CASCADE,
    instance_id INTEGER REFERENCES formula_instances(id) ON DELETE CASCADE,
    variable_name VARCHAR(100) NOT NULL,
    tag_id INTEGER,
    aggregation VARCHAR(20) DEFAULT 'last',
    default_value DOUBLE PRECISION,
    assigned_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fva_formula_id ON formula_variable_assignments(formula_id);
CREATE INDEX IF NOT EXISTS idx_fva_instance_id ON formula_variable_assignments(instance_id);

-- ============================================================================
-- SEED DATA: 63 Industry KPIs
-- ============================================================================

-- ── FEED MILL (28 KPIs) ─────────────────────────────────────────────────────

-- Dosing & Weighing (6)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Dosing Accuracy', 'dosing', 'feed_mill', '({Actual_Weight} / {Target_Weight}) * 100', 'Actual ingredient weight vs target recipe value', '%', '[{"name":"Actual_Weight","description":"Actual dosed weight","unit":"kg"},{"name":"Target_Weight","description":"Recipe target weight","unit":"kg","defaultValue":1}]', true),
('Dosing Deviation', 'dosing', 'feed_mill', '{Actual_Weight} - {Target_Weight}', 'Absolute deviation between target and actual dose', 'kg', '[{"name":"Actual_Weight","description":"Actual dosed weight","unit":"kg"},{"name":"Target_Weight","description":"Recipe target weight","unit":"kg"}]', true),
('Dribbling Settling Time', 'dosing', 'feed_mill', '{Settling_Time}', 'Time for material to stabilize in scale after doser stop', 'sec', '[{"name":"Settling_Time","description":"Settling time sensor","unit":"sec"}]', true),
('Dribbling Residual Qty', 'dosing', 'feed_mill', '{Residual_Qty}', 'Material quantity falling after motor stop', 'kg', '[{"name":"Residual_Qty","description":"Residual quantity sensor","unit":"kg"}]', true),
('Weighing Cycle Time', 'dosing', 'feed_mill', '{Cycle_Time}', 'Total weighing time including settling', 'sec', '[{"name":"Cycle_Time","description":"Full cycle time","unit":"sec"}]', true),
('Re-dosing Rate', 'dosing', 'feed_mill', '({Correction_Batches} / {Total_Batches}) * 100', 'Percentage of batches requiring correction', '%', '[{"name":"Correction_Batches","description":"Batches needing re-dose","unit":"count"},{"name":"Total_Batches","description":"Total batches produced","unit":"count","defaultValue":1}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- Grinding (4)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Grinding Throughput', 'grinding', 'feed_mill', '{Grinder_Output}', 'Actual grinding output rate', 'TPH', '[{"name":"Grinder_Output","description":"Grinder output flow","unit":"TPH"}]', true),
('Specific Energy (Grinding)', 'grinding', 'feed_mill', '{Grinder_Power} / {Grinder_Output}', 'Energy consumed per ton of ground material', 'kWh/t', '[{"name":"Grinder_Power","description":"Grinder motor power","unit":"kW"},{"name":"Grinder_Output","description":"Grinder output rate","unit":"TPH","defaultValue":1}]', true),
('Particle Size Compliance', 'grinding', 'feed_mill', '({In_Spec_Weight} / {Total_Weight}) * 100', 'Material within target particle size', '%', '[{"name":"In_Spec_Weight","description":"Weight within spec","unit":"kg"},{"name":"Total_Weight","description":"Total sample weight","unit":"kg","defaultValue":1}]', true),
('Screen Size', 'grinding', 'feed_mill', '{Screen_Size}', 'Current hammer mill screen size', 'mm', '[{"name":"Screen_Size","description":"Active screen size","unit":"mm"}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- Mixing (5)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Mixing Uniformity (CV)', 'mixing', 'feed_mill', '{CV_Percent}', 'Coefficient of Variation of nutrient distribution', '%', '[{"name":"CV_Percent","description":"CV measurement","unit":"%"}]', true),
('Liquid Addition Ratio', 'mixing', 'feed_mill', '({Liquid_Added} / {Batch_Weight}) * 100', 'Liquids added relative to batch weight', '%', '[{"name":"Liquid_Added","description":"Total liquid added","unit":"kg"},{"name":"Batch_Weight","description":"Total batch weight","unit":"kg","defaultValue":1}]', true),
('Mixing Time', 'mixing', 'feed_mill', '{Mix_Time}', 'Total mixing duration', 'sec', '[{"name":"Mix_Time","description":"Mixing timer","unit":"sec"}]', true),
('Carryover Rate', 'mixing', 'feed_mill', '({Residual_Material} / {Batch_Weight}) * 100', 'Residual material affecting following batch', '%', '[{"name":"Residual_Material","description":"Residual after flush","unit":"kg"},{"name":"Batch_Weight","description":"Batch weight","unit":"kg","defaultValue":1}]', true),
('Batch Cycle Time', 'mixing', 'feed_mill', '{Batch_Total_Time}', 'Complete batch cycle duration', 'sec', '[{"name":"Batch_Total_Time","description":"Full batch cycle","unit":"sec"}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- Pelleting (7)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Pellet Mill Throughput', 'pelleting', 'feed_mill', '{Pellet_Output}', 'Actual pelleted output rate', 'TPH', '[{"name":"Pellet_Output","description":"Pellet press output","unit":"TPH"}]', true),
('Pellet Durability (PDI)', 'pelleting', 'feed_mill', '({Pellets_After_Tumble} / {Pellets_Before_Tumble}) * 100', 'Pellet strength after handling test', '%', '[{"name":"Pellets_After_Tumble","description":"Intact pellets after test","unit":"g"},{"name":"Pellets_Before_Tumble","description":"Pellets before test","unit":"g","defaultValue":1}]', true),
('Specific Energy (Pelleting)', 'pelleting', 'feed_mill', '{Pellet_Power} / {Pellet_Output}', 'Energy per ton of pellets', 'kWh/t', '[{"name":"Pellet_Power","description":"Press motor power","unit":"kW"},{"name":"Pellet_Output","description":"Press output rate","unit":"TPH","defaultValue":1}]', true),
('Die Compression Ratio', 'pelleting', 'feed_mill', '{Die_Length} / {Die_Diameter}', 'Die length to hole diameter ratio', 'ratio', '[{"name":"Die_Length","description":"Die effective length","unit":"mm"},{"name":"Die_Diameter","description":"Die hole diameter","unit":"mm","defaultValue":1}]', true),
('Conditioning Temperature', 'pelleting', 'feed_mill', '{Conditioner_Temp}', 'Conditioner outlet temperature', 'C', '[{"name":"Conditioner_Temp","description":"Conditioner temp sensor","unit":"C"}]', true),
('Steam Consumption Rate', 'pelleting', 'feed_mill', '{Steam_Used} / {Pellet_Output}', 'Steam used per ton of pellets', 'kg/t', '[{"name":"Steam_Used","description":"Steam flow rate","unit":"kg/h"},{"name":"Pellet_Output","description":"Press output","unit":"TPH","defaultValue":1}]', true),
('Cooler Delta Temperature', 'pelleting', 'feed_mill', '{Pellet_Temp_In} - {Pellet_Temp_Out}', 'Temperature drop across cooler', 'C', '[{"name":"Pellet_Temp_In","description":"Cooler inlet temp","unit":"C"},{"name":"Pellet_Temp_Out","description":"Cooler outlet temp","unit":"C"}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- General (6)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Production Rate', 'general', 'feed_mill', '{Output_Weight} / {Run_Time}', 'Overall production rate', 'TPH', '[{"name":"Output_Weight","description":"Total output","unit":"tons"},{"name":"Run_Time","description":"Running time","unit":"hours","defaultValue":1}]', true),
('Batch Yield', 'general', 'feed_mill', '({Output_Weight} / {Input_Weight}) * 100', 'Output vs input percentage', '%', '[{"name":"Output_Weight","description":"Finished product weight","unit":"kg"},{"name":"Input_Weight","description":"Raw material weight","unit":"kg","defaultValue":1}]', true),
('OEE', 'general', 'feed_mill', '({Availability} * {Performance} * {Quality}) / 10000', 'Overall Equipment Effectiveness', '%', '[{"name":"Availability","description":"Availability %","unit":"%","defaultValue":100},{"name":"Performance","description":"Performance %","unit":"%","defaultValue":100},{"name":"Quality","description":"Quality %","unit":"%","defaultValue":100}]', true),
('Downtime', 'general', 'feed_mill', '{Scheduled_Hours} - {Operating_Hours}', 'Non-operating time', 'hrs', '[{"name":"Scheduled_Hours","description":"Scheduled production hours","unit":"hrs"},{"name":"Operating_Hours","description":"Actual operating hours","unit":"hrs"}]', true),
('Fat/Oil Addition Rate', 'general', 'feed_mill', '({Fat_Added} / {Batch_Weight}) * 100', 'Fat or oil percentage in batch', '%', '[{"name":"Fat_Added","description":"Fat/oil added","unit":"kg"},{"name":"Batch_Weight","description":"Batch weight","unit":"kg","defaultValue":1}]', true),
('Moisture Addition', 'general', 'feed_mill', '{Output_Moisture} - {Input_Moisture}', 'Moisture gained in conditioning', '%', '[{"name":"Output_Moisture","description":"Post-conditioning moisture","unit":"%"},{"name":"Input_Moisture","description":"Pre-conditioning moisture","unit":"%"}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- ── FLOUR MILL (19 KPIs) ────────────────────────────────────────────────────

-- Production (5)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Extraction Rate', 'production', 'flour_mill', '({Flour_Output} / {Wheat_Input}) * 100', 'Ratio of flour output to wheat input', '%', '[{"name":"Flour_Output","description":"Total flour produced","unit":"tons"},{"name":"Wheat_Input","description":"Total wheat milled","unit":"tons","defaultValue":1}]', true),
('Mill Utilization', 'production', 'flour_mill', '({Actual_Output} / {Rated_Capacity}) * 100', 'Actual milling vs capacity', '%', '[{"name":"Actual_Output","description":"Actual daily output","unit":"TPD"},{"name":"Rated_Capacity","description":"Rated mill capacity","unit":"TPD","defaultValue":1}]', true),
('Downtime', 'production', 'flour_mill', '{Scheduled_Hours} - {Operating_Hours}', 'Hours not running due to issues', 'hrs', '[{"name":"Scheduled_Hours","description":"Scheduled hours","unit":"hrs"},{"name":"Operating_Hours","description":"Actual operating hours","unit":"hrs"}]', true),
('Shift Productivity', 'production', 'flour_mill', '{Shift_Output}', 'Output per shift', 'tons', '[{"name":"Shift_Output","description":"Shift total output","unit":"tons"}]', true),
('Energy Consumption', 'production', 'flour_mill', '{Total_Energy} / {Total_Output}', 'Energy per ton of flour', 'kWh/t', '[{"name":"Total_Energy","description":"Total electricity used","unit":"kWh"},{"name":"Total_Output","description":"Total flour produced","unit":"tons","defaultValue":1}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- Quality (5)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Moisture Content', 'quality', 'flour_mill', '{Flour_Moisture}', 'Flour moisture level', '%', '[{"name":"Flour_Moisture","description":"Moisture sensor","unit":"%"}]', true),
('Ash Content', 'quality', 'flour_mill', '{Flour_Ash}', 'Bran content indicator', '%', '[{"name":"Flour_Ash","description":"Ash content measurement","unit":"%"}]', true),
('Protein Content', 'quality', 'flour_mill', '{Flour_Protein}', 'Protein level in flour', '%', '[{"name":"Flour_Protein","description":"NIR protein reading","unit":"%"}]', true),
('Milling Loss', 'quality', 'flour_mill', '100 - {Flour_Extraction} - {Bran_Extraction}', 'Unaccounted material loss', '%', '[{"name":"Flour_Extraction","description":"Flour extraction %","unit":"%"},{"name":"Bran_Extraction","description":"Bran extraction %","unit":"%"}]', true),
('Break Release', 'quality', 'flour_mill', '({Break_Flour} / {Break_Input}) * 100', 'Stock passing through sieve after Break Roll', '%', '[{"name":"Break_Flour","description":"Flour from break","unit":"kg"},{"name":"Break_Input","description":"Input to break roll","unit":"kg","defaultValue":1}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- Maintenance (3)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Planned Maintenance %', 'maintenance', 'flour_mill', '({Planned_Hours} / {Total_Maint_Hours}) * 100', 'Planned vs total maintenance ratio', '%', '[{"name":"Planned_Hours","description":"Planned maintenance hours","unit":"hrs"},{"name":"Total_Maint_Hours","description":"Total maintenance hours","unit":"hrs","defaultValue":1}]', true),
('Lubrication Compliance', 'maintenance', 'flour_mill', '({Tasks_Done} / {Tasks_Scheduled}) * 100', 'Lubrication schedule adherence', '%', '[{"name":"Tasks_Done","description":"Completed lube tasks","unit":"count"},{"name":"Tasks_Scheduled","description":"Scheduled lube tasks","unit":"count","defaultValue":1}]', true),
('Roller Change Frequency', 'maintenance', 'flour_mill', '{Roller_Changes}', 'Number of roller changes', 'count', '[{"name":"Roller_Changes","description":"Roller change counter","unit":"count"}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- Supply Chain (3)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Wheat Inventory Days', 'supply_chain', 'flour_mill', '{Wheat_Stock} / {Daily_Consumption}', 'Days of wheat remaining', 'days', '[{"name":"Wheat_Stock","description":"Current wheat stock","unit":"tons"},{"name":"Daily_Consumption","description":"Daily milling rate","unit":"tons","defaultValue":1}]', true),
('Material Loss', 'supply_chain', 'flour_mill', '({Input_Weight} - {Output_Weight}) / {Input_Weight} * 100', 'Shrinkage from spillage, dust, etc.', '%', '[{"name":"Input_Weight","description":"Total input weight","unit":"tons","defaultValue":1},{"name":"Output_Weight","description":"Total output weight","unit":"tons"}]', true),
('On-Time Delivery', 'supply_chain', 'flour_mill', '({On_Time_Orders} / {Total_Orders}) * 100', 'Orders delivered on schedule', '%', '[{"name":"On_Time_Orders","description":"On-time deliveries","unit":"count"},{"name":"Total_Orders","description":"Total orders","unit":"count","defaultValue":1}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- General (3)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('OEE', 'general', 'flour_mill', '({Availability} * {Performance} * {Quality}) / 10000', 'Overall Equipment Effectiveness', '%', '[{"name":"Availability","description":"Availability %","unit":"%","defaultValue":100},{"name":"Performance","description":"Performance %","unit":"%","defaultValue":100},{"name":"Quality","description":"Quality %","unit":"%","defaultValue":100}]', true),
('Tempering Moisture', 'general', 'flour_mill', '{Tempered_Moisture}', 'Wheat moisture after tempering', '%', '[{"name":"Tempered_Moisture","description":"Post-tempering moisture","unit":"%"}]', true),
('Granulometry Compliance', 'general', 'flour_mill', '({In_Spec_Flour} / {Total_Flour}) * 100', 'Flour within particle size spec', '%', '[{"name":"In_Spec_Flour","description":"Flour within spec","unit":"kg"},{"name":"Total_Flour","description":"Total flour tested","unit":"kg","defaultValue":1}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- ── GRAIN SILO (16 KPIs) ────────────────────────────────────────────────────

-- Intake & Outloading (6)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Daily Intake', 'intake', 'grain_silo', '{Intake_Today}', 'Total grain received today', 'tons', '[{"name":"Intake_Today","description":"Daily intake totalizer","unit":"tons"}]', true),
('Daily Outloading', 'intake', 'grain_silo', '{Outload_Today}', 'Total grain dispatched today', 'tons', '[{"name":"Outload_Today","description":"Daily outload totalizer","unit":"tons"}]', true),
('Intake/Outload Balance', 'intake', 'grain_silo', '{Intake_Today} - {Outload_Today}', 'Net grain movement today', 'tons', '[{"name":"Intake_Today","description":"Daily intake","unit":"tons"},{"name":"Outload_Today","description":"Daily outload","unit":"tons"}]', true),
('Queue Wait Time', 'intake', 'grain_silo', '{Queue_Time}', 'Average truck queue time', 'min', '[{"name":"Queue_Time","description":"Queue time measurement","unit":"min"}]', true),
('Throughput (Elevator)', 'intake', 'grain_silo', '{Elevator_Output}', 'Bucket elevator throughput', 'TPH', '[{"name":"Elevator_Output","description":"Elevator output rate","unit":"TPH"}]', true),
('Truck Turnaround Time', 'intake', 'grain_silo', '{Departure_Time} - {Arrival_Time}', 'Total time truck spends at terminal', 'min', '[{"name":"Departure_Time","description":"Truck departure time","unit":"min"},{"name":"Arrival_Time","description":"Truck arrival time","unit":"min"}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- Storage (4)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Silo Fill Level', 'storage', 'grain_silo', '({Current_Level} / {Max_Capacity}) * 100', 'Silo fill percentage', '%', '[{"name":"Current_Level","description":"Current silo level","unit":"tons"},{"name":"Max_Capacity","description":"Silo maximum capacity","unit":"tons","defaultValue":1}]', true),
('Available Capacity', 'storage', 'grain_silo', '{Max_Capacity} - {Current_Tons}', 'Remaining storage space', 'tons', '[{"name":"Max_Capacity","description":"Silo maximum capacity","unit":"tons"},{"name":"Current_Tons","description":"Current stored quantity","unit":"tons"}]', true),
('Days Until Empty', 'storage', 'grain_silo', '{Current_Tons} / {Daily_Consumption}', 'Estimated days of stock remaining', 'days', '[{"name":"Current_Tons","description":"Current stored quantity","unit":"tons"},{"name":"Daily_Consumption","description":"Daily consumption rate","unit":"tons","defaultValue":1}]', true),
('Silo Turnover Rate', 'storage', 'grain_silo', '{Total_Throughput} / {Storage_Capacity}', 'How often storage is cycled', 'ratio', '[{"name":"Total_Throughput","description":"Total grain moved","unit":"tons"},{"name":"Storage_Capacity","description":"Total storage capacity","unit":"tons","defaultValue":1}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- Quality & Safety (4)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Temperature Differential', 'quality', 'grain_silo', '{Max_Temp} - {Min_Temp}', 'Temp spread across silo (hot spot detection)', 'C', '[{"name":"Max_Temp","description":"Highest cable temp","unit":"C"},{"name":"Min_Temp","description":"Lowest cable temp","unit":"C"}]', true),
('Grain Moisture', 'quality', 'grain_silo', '{Grain_Moisture}', 'Current grain moisture level', '%', '[{"name":"Grain_Moisture","description":"Moisture sensor","unit":"%"}]', true),
('Drying Efficiency', 'quality', 'grain_silo', '({Input_Moisture} - {Output_Moisture}) / {Dryer_Energy}', 'Moisture points removed per unit energy', '%pt/kWh', '[{"name":"Input_Moisture","description":"Dryer inlet moisture","unit":"%"},{"name":"Output_Moisture","description":"Dryer outlet moisture","unit":"%"},{"name":"Dryer_Energy","description":"Dryer energy consumption","unit":"kWh","defaultValue":1}]', true),
('Aeration Hours', 'quality', 'grain_silo', '{Aeration_Running}', 'Total aeration fan running hours', 'hrs', '[{"name":"Aeration_Running","description":"Aeration fan runtime","unit":"hrs"}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;

-- Equipment (2)
INSERT INTO formula_library (name, category, plant_type, formula, description, unit, variables, is_builtin) VALUES
('Equipment Utilization', 'equipment', 'grain_silo', '({Running_Hours} / {Available_Hours}) * 100', 'Equipment usage percentage', '%', '[{"name":"Running_Hours","description":"Actual running hours","unit":"hrs"},{"name":"Available_Hours","description":"Total available hours","unit":"hrs","defaultValue":1}]', true),
('Energy per Ton', 'equipment', 'grain_silo', '{Total_Energy} / {Total_Throughput}', 'Energy consumed per ton handled', 'kWh/t', '[{"name":"Total_Energy","description":"Total energy consumed","unit":"kWh"},{"name":"Total_Throughput","description":"Total grain handled","unit":"tons","defaultValue":1}]', true)
ON CONFLICT (name, plant_type) DO NOTHING;
