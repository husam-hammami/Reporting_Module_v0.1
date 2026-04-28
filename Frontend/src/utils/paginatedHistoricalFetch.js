/**
 * Historical tag + silo-segment fetch for paginated report preview (shared by
 * PaginatedReportViewer and Job Logs order PDF/print).
 */
import axios from '../API/axios';
import { findSiloSegmentTableRows } from '../Pages/ReportBuilder/PaginatedReportBuilder';

/**
 * @param {object} params
 * @param {object[]} params.sections - layout_config.paginatedSections
 * @param {string[]} params.tagNames - from collectPaginatedTagNames(sections)
 * @param {Record<string, string[]>} params.tagAggGroups - from collectPaginatedTagAggregations(sections)
 * @param {string} params.fromISO - historian window start (ISO)
 * @param {string} params.toISO - historian window end (ISO)
 * @returns {Promise<{ tagValues: object, expandedRows: object }>}
 */
export async function fetchPaginatedHistoricalData({
  sections,
  tagNames,
  tagAggGroups,
  fromISO,
  toISO,
}) {
  const tagValues = {};
  const expandedRows = {};

  if (!fromISO || !toISO || !Array.isArray(tagNames) || tagNames.length === 0) {
    return { tagValues, expandedRows };
  }

  const aggEntries = Object.entries(tagAggGroups || {});
  if (aggEntries.length === 0) {
    const res = await axios.get('/api/historian/by-tags', {
      params: { tag_names: tagNames.join(','), from: fromISO, to: toISO, aggregation: 'auto' },
      timeout: 15000,
    });
    const data = res?.data?.tag_values || res?.data?.data || res?.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) Object.assign(tagValues, data);
  } else {
    const results = await Promise.all(
      aggEntries.map(([agg, tags]) =>
        axios.get('/api/historian/by-tags', {
          params: { tag_names: tags.join(','), from: fromISO, to: toISO, aggregation: agg },
          timeout: 15000,
        }).then((res) => ({ agg, data: res?.data?.tag_values || res?.data?.data || res?.data || {} }))
          .catch(() => ({ agg, data: {} }))
      )
    );
    for (const { agg, data } of results) {
      if (!data || typeof data !== 'object') continue;
      for (const [tagName, value] of Object.entries(data)) {
        if (agg === 'last') {
          tagValues[tagName] = value;
        } else {
          tagValues[`${agg}::${tagName}`] = value;
          if (!(tagName in tagValues)) tagValues[tagName] = value;
        }
      }
    }
  }

  const segmentRowDefs = findSiloSegmentTableRows(sections || []).map((d) => ({
    rowId: d.row.id,
    segCell: d.segCell,
    companionCells: d.companionCells,
  }));

  if (segmentRowDefs.length > 0) {
    try {
      const segRes = await axios.post('/api/historian/row-segments', {
        from: fromISO,
        to: toISO,
        rows: segmentRowDefs.map((def) => ({
          row_id: def.rowId,
          segment_tag: def.segCell.tagName,
          min_segment_seconds: def.segCell.segmentMinSeconds ?? 60,
          ignore_values: def.segCell.segmentIgnoreValues ?? [0],
          companion_cells: def.companionCells,
          merge_duplicates: def.segCell.segmentMergeDuplicates !== false,
        })),
      }, { timeout: 20000 });
      const rawRows = segRes?.data?.rows || {};
      segmentRowDefs.forEach((def) => {
        const segs = rawRows[def.rowId];
        if (!Array.isArray(segs) || segs.length === 0) return;
        const templateRow = (sections || [])
          .filter((s) => s.type === 'table')
          .flatMap((s) => s.rows || [])
          .find((r) => r.id === def.rowId);
        if (!templateRow) return;
        expandedRows[def.rowId] = segs.map((seg, i) => {
          const overlay = {};
          overlay[`silo_segments::${def.segCell.tagName}`] = seg.silo_id;
          const entries = Array.isArray(seg.values) ? seg.values : [];
          entries.forEach((entry) => {
            const tagName = entry?.tagName;
            if (!tagName) return;
            const agg = entry?.agg || 'last';
            const val = entry?.value;
            const fv = entry?.first;
            const lv = entry?.last;
            if (agg === 'last' || agg === 'silo_last') {
              overlay[tagName] = val;
              if (lv != null) overlay[`last::${tagName}`] = lv;
              if (fv != null && agg !== 'silo_last' && overlay[`first::${tagName}`] == null) {
                overlay[`first::${tagName}`] = fv;
              }
              if (agg === 'silo_last') {
                overlay[`silo_last::${tagName}`] = val;
              }
            } else {
              overlay[`${agg}::${tagName}`] = val;
              if (!String(agg).startsWith('silo_')) {
                if (fv != null && overlay[`first::${tagName}`] == null) overlay[`first::${tagName}`] = fv;
                if (lv != null && overlay[`last::${tagName}`] == null) overlay[`last::${tagName}`] = lv;
                if (overlay[tagName] == null) overlay[tagName] = lv != null ? lv : val;
              }
            }
          });
          return {
            ...templateRow,
            id: `${def.rowId}__seg${i}`,
            _segTagValues: overlay,
            _segMeta: { t_start: seg.t_start, t_end: seg.t_end, silo_id: seg.silo_id },
          };
        });
      });
    } catch (segErr) {
      console.warn('fetchPaginatedHistoricalData: segment fetch failed:', segErr);
    }
  }

  return { tagValues, expandedRows };
}
