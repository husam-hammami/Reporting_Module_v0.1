/**
 * Mil-A report seed template — flour mill report.
 * Used when SEED_DEMO_REPORTS is true and Mil-A template is missing.
 */
import { CURRENT_SCHEMA_VERSION } from '../state/templateSchema';

export function buildMilATemplate(templateId) {
  const now = new Date().toISOString();
  return {
    id: templateId,
    name: 'Mil-A',
    description: 'Mil-A report: Data tables (Bin/Material, Product kg), Bran Receiver, Yield Log, Yield Line chart.',
    status: 'draft',
    layout_config: {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      widgets: [
        {
          id: 'w-mila-1-datatable-bin',
          type: 'table',
          x: 0, y: 0, w: 6, h: 2,
          config: {
            title: 'Data Table',
            tableColumns: [
              { label: 'Bin_Id', sourceType: 'tag', tagName: 'MilA_Bin_Id', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: '', align: 'left', width: 120, thresholds: [] },
              { label: 'Material', sourceType: 'tag', tagName: 'MilA_Material', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 0, unit: '', align: 'left', width: 200, thresholds: [] },
              { label: 'Values', sourceType: 'tag', tagName: 'MilA_Values', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: '', align: 'right', width: 100, thresholds: [] },
            ],
          },
        },
        {
          id: 'w-mila-2-datatable-product',
          type: 'table',
          x: 6, y: 0, w: 6, h: 2,
          config: {
            title: 'Data Table',
            tableColumns: [
              { label: 'Identific product', sourceType: 'tag', tagName: 'MilA_Identific_Product', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 0, unit: '', align: 'left', width: 150, thresholds: [] },
              { label: 'Values (kg)', sourceType: 'tag', tagName: 'MilA_Values_kg', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: 'kg', align: 'right', width: 120, thresholds: [] },
            ],
          },
        },
        {
          id: 'w-mila-3-bran-receiver',
          type: 'table',
          x: 0, y: 2, w: 6, h: 2,
          config: {
            title: 'Bran Receiver',
            tableColumns: [
              { label: 'F1', sourceType: 'tag', tagName: 'MilA_Bran_F1_kg', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: 'kg', align: 'right', width: 100, thresholds: [] },
              { label: 'F2', sourceType: 'tag', tagName: 'MilA_Bran_F2_kg', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: 'kg', align: 'right', width: 100, thresholds: [] },
              { label: 'Bran coarse', sourceType: 'tag', tagName: 'MilA_Bran_Coarse_kg', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: 'kg', align: 'right', width: 110, thresholds: [] },
              { label: 'Bran fine', sourceType: 'tag', tagName: 'MilA_Bran_Fine_kg', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: 'kg', align: 'right', width: 100, thresholds: [] },
              { label: 'Semolina', sourceType: 'tag', tagName: 'MilA_Semolina_kg', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: 'kg', align: 'right', width: 100, thresholds: [] },
            ],
          },
        },
        {
          id: 'w-mila-4-yield-log',
          type: 'table',
          x: 6, y: 2, w: 6, h: 2,
          config: {
            title: 'Data Table',
            tableColumns: [
              { label: 'Yield Max Flow', sourceType: 'tag', tagName: 'MilA_Yield_Max_Flow_th', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: 't/h', align: 'right', width: 120, thresholds: [] },
              { label: 'B1', sourceType: 'tag', tagName: 'MilA_Yield_B1_th', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: 't/h', align: 'right', width: 80, thresholds: [] },
              { label: 'F1', sourceType: 'tag', tagName: 'MilA_Yield_F1_th', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: 't/h', align: 'right', width: 80, thresholds: [] },
              { label: 'Bran coarse', sourceType: 'tag', tagName: 'MilA_Yield_Bran_Coarse_th', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: 't/h', align: 'right', width: 100, thresholds: [] },
              { label: 'Bran fine', sourceType: 'tag', tagName: 'MilA_Yield_Bran_Fine_th', formula: '', groupTags: [], aggregation: 'last', staticValue: '', format: 'number', decimals: 1, unit: 't/h', align: 'right', width: 100, thresholds: [] },
            ],
          },
        },
        {
          id: 'w-mila-5-yield-chart',
          type: 'chart',
          x: 0, y: 4, w: 12, h: 3,
          config: {
            title: 'Yield Line chart',
            chartType: 'line',
            series: [
              { label: 'Yield Max Flow', dataSource: { type: 'tag', tagName: 'MilA_Yield_Max_Flow_th', formula: '', groupTags: [], aggregation: 'avg' }, color: '' },
              { label: 'B1', dataSource: { type: 'tag', tagName: 'MilA_Yield_B1_th', formula: '', groupTags: [], aggregation: 'avg' }, color: '' },
              { label: 'F1', dataSource: { type: 'tag', tagName: 'MilA_Yield_F1_th', formula: '', groupTags: [], aggregation: 'avg' }, color: '' },
              { label: 'Bran coarse', dataSource: { type: 'tag', tagName: 'MilA_Yield_Bran_Coarse_th', formula: '', groupTags: [], aggregation: 'avg' }, color: '' },
              { label: 'Bran fine', dataSource: { type: 'tag', tagName: 'MilA_Yield_Bran_Fine_th', formula: '', groupTags: [], aggregation: 'avg' }, color: '' },
            ],
            timeRange: '1h',
            showLegend: true,
            showGrid: true,
            annotations: [],
            showCard: true,
            backgroundColor: '',
            gridColor: '',
            accentColor: '',
          },
        },
      ],
      parameters: [],
      computedSignals: [],
      grid: { cols: 12, rowHeight: 60, pageMode: 'a4' },
    },
    created_at: now,
    updated_at: now,
  };
}
