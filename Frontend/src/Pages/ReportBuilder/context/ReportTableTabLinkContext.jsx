import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ReportTableTabLinkContext = createContext(null);

const noopNotify = () => {};

/**
 * Lets a Data Table notify a Tab Container on the same report canvas/viewer:
 * row click → switch tab whose label matches the row key (case-insensitive).
 */
export function ReportTableTabLinkProvider({ children }) {
  const [pulse, setPulse] = useState(null);

  const notifyRowKeyForTabContainer = useCallback((targetWidgetId, rowKey) => {
    if (!targetWidgetId || rowKey == null || String(rowKey).trim() === '') return;
    setPulse({
      targetWidgetId: String(targetWidgetId),
      rowKey: String(rowKey).trim(),
      seq: Date.now(),
    });
  }, []);

  const value = useMemo(
    () => ({ pulse, notifyRowKeyForTabContainer }),
    [pulse, notifyRowKeyForTabContainer],
  );

  return (
    <ReportTableTabLinkContext.Provider value={value}>
      {children}
    </ReportTableTabLinkContext.Provider>
  );
}

const FALLBACK = { pulse: null, notifyRowKeyForTabContainer: noopNotify };

export function useReportTableTabLinkOptional() {
  return useContext(ReportTableTabLinkContext) || FALLBACK;
}
