/**
 * Widget catalog and factory for the Report Builder.
 * Professional Lucide icons only. No emoji.
 */

let _counter = Date.now();
export const uid = () => `w-${_counter++}-${Math.random().toString(36).slice(2, 7)}`;

/* ── Shared formatting constants ──────────────────────────────── */

export const VALUE_FONT_SIZES = {
  auto: undefined,
  sm: '1.125rem',
  md: '1.5rem',
  lg: '2rem',
  xl: '2.5rem',
};

export const TITLE_FONT_SIZES = {
  sm: '0.5625rem',
  md: '0.625rem',
  lg: '0.75rem',
};

/* ── Widget Categories ─────────────────────────────────────────── */

export const WIDGET_CATEGORIES = [
  { id: 'values', label: 'Values' },
  { id: 'trends', label: 'Trends' },
  { id: 'data', label: 'Data' },
  { id: 'layout', label: 'Layout' },
  { id: 'advanced', label: 'Advanced' },
];

/* ── Widget Catalog ────────────────────────────────────────────── */

export const WIDGET_CATALOG = [
  // ── Values ──
  {
    type: 'kpi',
    category: 'values',
    label: 'KPI Card',
    lucideIcon: 'Activity',
    description: 'Single value with optional sparkline',
    defaultW: 2,
    defaultH: 1,
    defaultConfig: {
      title: 'KPI Value',
      dataSource: { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'last' },
      unit: '',
      decimals: 1,
      showSparkline: false,
      thresholds: [],
      color: '#2563ab',
      showCard: true,
      valueFontSize: 'auto',
      titleFontSize: 'md',
      align: 'left',
      showTitle: true,
    },
  },
  {
    type: 'gauge',
    category: 'values',
    label: 'Gauge',
    lucideIcon: 'Gauge',
    description: 'Radial progress indicator',
    defaultW: 2,
    defaultH: 2,
    defaultConfig: {
      title: 'Gauge',
      dataSource: { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'last' },
      unit: '%',
      min: 0,
      max: 100,
      decimals: 0,
      zones: [
        { from: 0, to: 40, color: '#ef4444' },
        { from: 40, to: 70, color: '#f59e0b' },
        { from: 70, to: 100, color: '#10b981' },
      ],
      showCard: true,
      valueFontSize: 'auto',
      titleFontSize: 'md',
      showTitle: true,
    },
  },
  {
    type: 'silo',
    category: 'values',
    label: 'Silo',
    lucideIcon: 'Cylinder',
    description: '2.5D cylinder fill level (grain silo)',
    defaultW: 2,
    defaultH: 3,
    defaultConfig: {
      title: 'Silo',
      dataSource: { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'last' },
      capacityTag: '',
      tonsTag: '',
      unit: '%',
      decimals: 1,
      zones: [
        { from: 0, to: 70, color: '#10b981' },
        { from: 70, to: 90, color: '#f59e0b' },
        { from: 90, to: 100, color: '#ef4444' },
      ],
      showTons: true,
      showCapacity: false,
      showCard: true,
      color: '',
      titleFontSize: 'md',
      showTitle: true,
    },
  },
  {
    type: 'stat',
    category: 'values',
    label: 'Stat Panel',
    lucideIcon: 'Hash',
    description: 'Large number with label',
    defaultW: 2,
    defaultH: 1,
    defaultConfig: {
      title: 'Stat',
      dataSource: { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'last' },
      unit: '',
      decimals: 1,
      thresholds: [],
      color: '#2563ab',
      showCard: true,
      valueFontSize: 'auto',
      titleFontSize: 'md',
      align: 'center',
      showTitle: true,
    },
  },

  // ── Trends ──
  {
    type: 'chart',
    category: 'trends',
    label: 'Line Chart',
    lucideIcon: 'TrendingUp',
    description: 'Time-series line or area chart',
    defaultW: 4,
    defaultH: 3,
    defaultConfig: {
      title: 'Line Chart',
      chartType: 'line',
      series: [],
      timeRange: '5m',
      showLegend: true,
      showGrid: true,
      annotations: [],
      showCard: true,
      backgroundColor: '',
      gridColor: '',
      accentColor: '',
    },
  },
  {
    type: 'barchart',
    category: 'trends',
    label: 'Bar Chart',
    lucideIcon: 'BarChart3',
    description: 'Categorical or time-based bars',
    defaultW: 4,
    defaultH: 3,
    defaultConfig: {
      title: 'Bar Chart',
      chartType: 'bar',
      series: [],
      timeRange: '1h',
      showLegend: true,
      showGrid: true,
      stacked: false,
      showCard: true,
      backgroundColor: '',
      gridColor: '',
      accentColor: '',
    },
  },

  // ── Data ──
  {
    type: 'table',
    category: 'data',
    label: 'Table',
    lucideIcon: 'Table2',
    description: 'Data table with computed columns',
    defaultW: 4,
    defaultH: 3,
    defaultConfig: {
      title: 'Data Table',
      tableColumns: [],
      summaryRows: [],
      staticDataRows: [],
      striped: true,
      compact: false,
      showCard: true,
      headerBg: '',
      headerColor: '',
      rowBg: '',
      stripedRowBg: '',
      borderColor: '',
    },
  },

  // ── Layout ──
  {
    type: 'text',
    category: 'layout',
    label: 'Text',
    lucideIcon: 'Type',
    description: 'Inline text label or heading',
    defaultW: 3,
    defaultH: 1,
    defaultConfig: {
      content: 'Text',
      fontSize: '14px',
      fontWeight: '600',
      color: '',
      align: 'left',
      fontStyle: 'normal',
      showCard: false,
    },
  },
  {
    type: 'image',
    category: 'layout',
    label: 'Image',
    lucideIcon: 'Image',
    description: 'Upload an image from your PC',
    defaultW: 3,
    defaultH: 2,
    defaultConfig: {
      src: '',
      objectFit: 'contain',
      alt: '',
      borderRadius: '0',
      showCard: false,
    },
  },

  // ── Advanced ──
  {
    type: 'repeat',
    category: 'advanced',
    label: 'Repeat Panel',
    lucideIcon: 'Repeat2',
    description: 'Repeat a widget per parameter value',
    defaultW: 4,
    defaultH: 3,
    defaultConfig: {
      parameterName: '',
      childWidgetType: 'kpi',
      childConfig: {},
      direction: 'horizontal',
      maxVisible: 6,
    },
  },
];

/* ── DataSource defaults ───────────────────────────────────────── */

export const DEFAULT_DATA_SOURCE = {
  type: 'tag',       // 'tag' | 'formula' | 'group'
  tagName: '',
  formula: '',
  groupTags: [],
  aggregation: 'last', // 'last' | 'avg' | 'sum' | 'min' | 'max' | 'count' | 'delta'
};

/* ── Threshold model ───────────────────────────────────────────── */

export const DEFAULT_THRESHOLD = {
  condition: 'above',  // 'above' | 'below' | 'between' | 'equals'
  value: 0,
  valueTo: 0,          // only for 'between'
  color: '#ef4444',
};

/* ── Factory ───────────────────────────────────────────────────── */

export function createWidget(catalogEntry, x = 0, y = Infinity) {
  return {
    id: uid(),
    type: catalogEntry.type,
    x,
    y,
    w: catalogEntry.defaultW,
    h: catalogEntry.defaultH,
    config: JSON.parse(JSON.stringify(catalogEntry.defaultConfig)),
  };
}
