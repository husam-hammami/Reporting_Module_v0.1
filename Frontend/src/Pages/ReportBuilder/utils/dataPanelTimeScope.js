/**
 * Per–Data Panel input time scope: calendar period ending at `anchor` (report range end or "now" in live).
 * `inherit` uses the global report range — handled by the viewer, not here.
 */

export const DATA_PANEL_TIME_SCOPE_LABELS = {
  inherit: 'Use report time range',
  day: 'Daily (calendar day → end)',
  week: 'Weekly (calendar week → end)',
  month: 'Monthly (calendar month → end)',
  year: 'Yearly (calendar year → end)',
};

export function dataPanelScopedValueKey(fieldId) {
  return `__dataPanelField:${fieldId}`;
}

/** @param {'day'|'week'|'month'|'year'} scope */
export function effectiveRangeForDataPanelTimeScope(scope, anchor) {
  if (!anchor || !(anchor instanceof Date) || Number.isNaN(anchor.getTime())) {
    return { from: null, to: null };
  }
  if (!scope || scope === 'inherit') return { from: null, to: null };

  const to = new Date(anchor.getTime());
  const y = to.getFullYear();
  const m = to.getMonth();
  const d = to.getDate();
  let from;

  if (scope === 'day') {
    from = new Date(y, m, d, 0, 0, 0, 0);
  } else if (scope === 'week') {
    const day = to.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    from = new Date(y, m, d + diff, 0, 0, 0, 0);
  } else if (scope === 'month') {
    from = new Date(y, m, 1, 0, 0, 0, 0);
  } else if (scope === 'year') {
    from = new Date(y, 0, 1, 0, 0, 0, 0);
  } else {
    return { from: null, to: null };
  }

  if (from > to) from = new Date(to);
  return { from, to };
}

/**
 * @param {Array<{ fieldId: string, tagName: string, aggregation: string, from: Date, to: Date }>} requests
 */
export function groupDataPanelScopedHistorianRequests(requests) {
  const map = new Map();
  for (const r of requests) {
    if (!r.from || !r.to || !r.fieldId || !r.tagName) continue;
    const fromISO = r.from.toISOString();
    const toISO = r.to.toISOString();
    const key = `${r.aggregation || 'last'}|${fromISO}|${toISO}`;
    if (!map.has(key)) {
      map.set(key, {
        aggregation: r.aggregation || 'last',
        from: r.from,
        to: r.to,
        items: [],
      });
    }
    map.get(key).items.push({ fieldId: r.fieldId, tagName: r.tagName });
  }
  return [...map.values()];
}

/**
 * @param {import('axios').AxiosInstance} axiosInstance
 * @param {ReturnType<typeof groupDataPanelScopedHistorianRequests>} groups
 */
export async function fetchDataPanelScopedHistorianValues(axiosInstance, groups) {
  const scopedMap = {};
  await Promise.all(
    groups.map(async (g) => {
      const tagNames = [...new Set(g.items.map((i) => i.tagName))];
      if (tagNames.length === 0) return;
      try {
        const res = await axiosInstance.get('/api/historian/by-tags', {
          params: {
            tag_names: tagNames.join(','),
            from: g.from.toISOString(),
            to: g.to.toISOString(),
            aggregation: g.aggregation,
          },
        });
        const data = res.data?.data || {};
        g.items.forEach(({ fieldId, tagName }) => {
          if (data[tagName] !== undefined && data[tagName] !== null) {
            scopedMap[dataPanelScopedValueKey(fieldId)] = data[tagName];
          }
        });
      } catch {
        /* non-fatal */
      }
    }),
  );
  return scopedMap;
}
