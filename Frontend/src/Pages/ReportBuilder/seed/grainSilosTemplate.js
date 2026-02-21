/**
 * Grain_Silos report seed template — all 8 dashboard sections.
 * Used when SEED_DEMO_REPORTS is true and templates are empty after one-time clear.
 */
import { CURRENT_SCHEMA_VERSION } from '../state/templateSchema';

let _id = 1;
function wid() {
  return `w-grain-${_id++}-${Math.random().toString(36).slice(2, 6)}`;
}

function text(content, variant = 'h2', y, w = 12) {
  return { id: wid(), type: 'text', x: 0, y, w, h: 1, config: { content, variant, align: 'left', color: '' } };
}
function divider(y) {
  return { id: wid(), type: 'divider', x: 0, y, w: 12, h: 1, config: { style: 'solid', color: '' } };
}
function kpi(title, tagName, unit = '', decimals = 1, x, y, w = 2, h = 1) {
  return {
    id: wid(),
    type: 'kpi',
    x,
    y,
    w,
    h,
    config: {
      title,
      dataSource: { type: 'tag', tagName, formula: '', groupTags: [], aggregation: 'last' },
      unit,
      decimals,
      showSparkline: false,
      thresholds: [],
      color: '#06b6d4',
    },
  };
}
function stat(title, tagName, unit = '', decimals = 1, x, y, w = 2, h = 1) {
  return {
    id: wid(),
    type: 'stat',
    x,
    y,
    w,
    h,
    config: {
      title,
      dataSource: { type: 'tag', tagName, formula: '', groupTags: [], aggregation: 'last' },
      unit,
      decimals,
      thresholds: [],
      color: '#06b6d4',
    },
  };
}
function silo(title, levelTag, capacityTag, tonsTag, x, y, w = 3, h = 3) {
  return {
    id: wid(),
    type: 'silo',
    x,
    y,
    w,
    h,
    config: {
      title,
      dataSource: { type: 'tag', tagName: levelTag, formula: '', groupTags: [], aggregation: 'last' },
      capacityTag: capacityTag || '',
      tonsTag: tonsTag || '',
      unit: '%',
      decimals: 1,
      zones: [
        { from: 0, to: 70, color: '#22c55e' },
        { from: 70, to: 90, color: '#fbbf24' },
        { from: 90, to: 100, color: '#f87171' },
      ],
      showTons: true,
      showCapacity: false,
    },
  };
}
function chart(title, tags, x, y, w = 12, h = 3) {
  return {
    id: wid(),
    type: 'chart',
    x,
    y,
    w,
    h,
    config: {
      title,
      chartType: 'line',
      tags: tags.map((t) => ({ tagName: t, displayName: t })),
      timeRange: '1h',
      showLegend: true,
      showGrid: true,
      annotations: [],
    },
  };
}
function barchart(title, tags, x, y, w = 6, h = 3) {
  return {
    id: wid(),
    type: 'barchart',
    x,
    y,
    w,
    h,
    config: {
      title,
      chartType: 'bar',
      tags: tags.map((t) => ({ tagName: t, displayName: t })),
      timeRange: '1h',
      showLegend: true,
      showGrid: true,
      stacked: false,
    },
  };
}
function table(title, columns, x, y, w = 12, h = 2) {
  return {
    id: wid(),
    type: 'table',
    x,
    y,
    w,
    h,
    config: {
      title,
      tableColumns: columns.map((c) => ({
        label: c.label,
        sourceType: c.sourceType || 'tag',
        tagName: c.tagName || '',
        formula: c.formula || '',
        groupTags: c.groupTags || [],
        aggregation: c.aggregation || 'last',
        format: c.format || 'number',
        decimals: c.decimals ?? 1,
        unit: c.unit || '',
        align: 'left',
        width: 100,
        thresholds: [],
      })),
      summaryRows: [],
      striped: true,
      compact: true,
    },
  };
}

export function buildGrainSilosTemplate(templateId) {
  _id = 1;
  const widgets = [];
  let y = 0;

  // Row 0: Intake — 6 KPIs full width
  widgets.push(kpi('Intake Today', 'Intake_Today', 't', 1, 0, y));
  widgets.push(kpi('Intake Week', 'Intake_Week', 't', 1, 2, y));
  widgets.push(kpi('Intake Month', 'Intake_Month', 't', 1, 4, y));
  widgets.push(kpi('Outload Ship', 'Outload_Ship', 't', 1, 6, y));
  widgets.push(kpi('Outload Truck', 'Outload_Truck', 't', 1, 8, y));
  widgets.push(kpi('Outload Rail', 'Outload_Rail', 't', 1, 10, y));
  y += 1;
  // Row 1: Balance + Queue + Intake chart (side by side)
  widgets.push(kpi('Balance', 'Balance_Tons', 't', 1, 0, y, 2, 1));
  widgets.push(kpi('Queue', 'Queue_Status', '', 0, 2, y, 2, 1));
  widgets.push(chart('Intake / Outload', ['Intake_Today', 'Outload_Ship', 'Outload_Truck'], 4, y, 8, 2));
  y += 2;

  // Row 2: Section label (compact)
  widgets.push(text('Silo Status & Capacity', 'h3', y, 12));
  y += 1;
  // Rows 3–4: 8 Silos in 2 rows of 4 (w=3 each, h=2)
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 4; col++) {
      const n = row * 4 + col + 1;
      widgets.push(silo(`S${n}`, `Silo${n}_Level`, `Silo${n}_Capacity`, `Silo${n}_Tons`, col * 3, y, 3, 2));
    }
    y += 2;
  }
  // Row 5: Silo table + utilization chart side by side
  widgets.push(table(
    'Silo %',
    [
      { label: 'S1%', tagName: 'Silo1_Level', format: 'percentage', decimals: 1 },
      { label: 'S2%', tagName: 'Silo2_Level', format: 'percentage', decimals: 1 },
      { label: 'S3%', tagName: 'Silo3_Level', format: 'percentage', decimals: 1 },
      { label: 'S4%', tagName: 'Silo4_Level', format: 'percentage', decimals: 1 },
      { label: 'S5%', tagName: 'Silo5_Level', format: 'percentage', decimals: 1 },
      { label: 'S6%', tagName: 'Silo6_Level', format: 'percentage', decimals: 1 },
      { label: 'S7%', tagName: 'Silo7_Level', format: 'percentage', decimals: 1 },
      { label: 'S8%', tagName: 'Silo8_Level', format: 'percentage', decimals: 1 },
    ],
    0, y, 6, 2
  ));
  widgets.push(chart('Silo trend', ['Silo1_Level', 'Silo2_Level', 'Silo3_Level', 'Silo4_Level'], 6, y, 6, 2));
  y += 2;

  // Row 6: Grain Quality — label + KPIs
  widgets.push(text('Grain Quality', 'h3', y, 12));
  y += 1;
  widgets.push(kpi('Moisture', 'Moisture_Avg', '%', 2, 0, y));
  widgets.push(kpi('Aeration', 'Aeration_Status', '', 0, 4, y));
  widgets.push(kpi('Quality Dev', 'Quality_Deviation', '', 0, 8, y));
  y += 1;
  widgets.push(table(
    'Temp °C',
    [
      { label: 'S1', tagName: 'Silo1_Temp', unit: '°C', decimals: 1 },
      { label: 'S2', tagName: 'Silo2_Temp', unit: '°C', decimals: 1 },
      { label: 'S3', tagName: 'Silo3_Temp', unit: '°C', decimals: 1 },
      { label: 'S4', tagName: 'Silo4_Temp', unit: '°C', decimals: 1 },
      { label: 'S5', tagName: 'Silo5_Temp', unit: '°C', decimals: 1 },
      { label: 'S6', tagName: 'Silo6_Temp', unit: '°C', decimals: 1 },
      { label: 'S7', tagName: 'Silo7_Temp', unit: '°C', decimals: 1 },
      { label: 'S8', tagName: 'Silo8_Temp', unit: '°C', decimals: 1 },
    ],
    0, y, 8, 1
  ));
  widgets.push(chart('Silo temps', ['Silo1_Temp', 'Silo2_Temp', 'Silo3_Temp', 'Silo4_Temp'], 8, y, 4, 1));
  y += 1;

  // Row 7: Equipment — table + bar chart side by side
  widgets.push(text('Equipment', 'h3', y, 12));
  y += 1;
  widgets.push(table(
    'Equipment status',
    [
      { label: 'Conv', tagName: 'Conveyor1_Status', format: 'number', decimals: 0 },
      { label: 'Throughput', tagName: 'Conveyor1_Throughput', unit: 't/h', decimals: 1 },
      { label: 'Elev', tagName: 'Elevator1_Running', format: 'number', decimals: 0 },
      { label: 'Down %', tagName: 'Equipment_Downtime_Pct', format: 'percentage', decimals: 1 },
      { label: 'Util %', tagName: 'Equipment_Utilization_Pct', format: 'percentage', decimals: 1 },
    ],
    0, y, 8, 2
  ));
  widgets.push(barchart('Throughput', ['Conveyor1_Throughput'], 8, y, 4, 2));
  y += 2;

  // Row 8: Energy — 4 KPIs then table + chart
  widgets.push(text('Energy & Utilities', 'h3', y, 12));
  y += 1;
  widgets.push(kpi('Power In', 'Power_Intake_Area', 'kW', 1, 0, y));
  widgets.push(kpi('Power Stor', 'Power_Storage_Area', 'kW', 1, 3, y));
  widgets.push(kpi('kWh/t', 'Energy_Per_Ton', 'kWh/t', 2, 6, y));
  widgets.push(kpi('Peak', 'Peak_Power_kW', 'kW', 1, 9, y));
  y += 1;
  widgets.push(table(
    'Energy',
    [
      { label: 'Intake', tagName: 'Power_Intake_Area', unit: 'kW', decimals: 1 },
      { label: 'Storage', tagName: 'Power_Storage_Area', unit: 'kW', decimals: 1 },
      { label: 'kWh/t', tagName: 'Energy_Per_Ton', unit: 'kWh/t', decimals: 2 },
    ],
    0, y, 6, 1
  ));
  widgets.push(chart('Power', ['Power_Intake_Area', 'Power_Storage_Area'], 6, y, 6, 1));
  y += 1;

  // Row 9: Alarms + Ops KPI on same row
  widgets.push(text('Alarms & Ops KPI', 'h3', y, 12));
  y += 1;
  widgets.push(kpi('Active', 'Alarm_Active_Count', '', 0, 0, y));
  widgets.push(kpi('Critical', 'Alarm_Critical_Count', '', 0, 2, y));
  widgets.push(kpi('Response min', 'Alarm_Response_Time_Avg', 'min', 1, 4, y));
  widgets.push(stat('Tons/day', 'Tons_Per_Day', 't', 1, 6, y));
  widgets.push(stat('Avail %', 'Terminal_Availability_Pct', '%', 1, 8, y));
  widgets.push(stat('OEE', 'OEE_Style', '%', 1, 10, y));
  y += 1;
  widgets.push(table(
    'Alarms',
    [
      { label: 'Active', tagName: 'Alarm_Active_Count', decimals: 0 },
      { label: 'Critical', tagName: 'Alarm_Critical_Count', decimals: 0 },
      { label: 'Response', tagName: 'Alarm_Response_Time_Avg', decimals: 1 },
    ],
    0, y, 6, 1
  ));
  widgets.push(stat('Downtime %', 'Downtime_Pct', '%', 1, 6, y));
  widgets.push(stat('Losses %', 'Losses_Pct', '%', 2, 8, y));
  y += 1;

  // Row 10: Maintenance
  widgets.push(text('Maintenance', 'h3', y, 12));
  y += 1;
  widgets.push(table(
    'Maintenance',
    [
      { label: 'Run hrs', tagName: 'Running_Hours_Main', unit: 'h', decimals: 1 },
      { label: 'Cycles', tagName: 'StartStop_Cycles', decimals: 0 },
      { label: 'Abnormal', tagName: 'Abnormal_Load_Count', decimals: 0 },
      { label: 'Warnings', tagName: 'Early_Warning_Count', decimals: 0 },
    ],
    0, y, 12, 2
  ));
  y += 2;

  const now = new Date().toISOString();
  return {
    id: templateId,
    name: 'Grain_Silos',
    description: 'Grain Terminal: Intake, Silo Status, Quality, Equipment, Energy, Alarms, Ops KPI, Maintenance.',
    status: 'draft',
    layout_config: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      widgets,
      parameters: [],
      computedSignals: [],
      grid: { cols: 12, rowHeight: 40 },
    },
    created_at: now,
    updated_at: now,
  };
}
