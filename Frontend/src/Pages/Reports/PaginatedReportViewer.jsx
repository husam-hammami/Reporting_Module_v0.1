/**
 * PaginatedReportViewer — View paginated reports with live/historical data.
 *
 * Renders the paginated sections from the template config with real tag data,
 * supports date range selection, live data polling, PDF/print export,
 * fullscreen mode, and professional A4 rendering.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft, Download, Printer, RefreshCw, Maximize, Minimize,
} from 'lucide-react';
import { useEmulator } from '../../Context/EmulatorContext';
import { useSocket } from '../../Context/SocketContext';
import { useReportCanvas, useAvailableTags } from '../../Hooks/useReportBuilder';
import { PaginatedReportPreview, collectPaginatedTagNames, collectPaginatedTagAggregations } from '../ReportBuilder/PaginatedReportBuilder';
import TimePeriodTabs, { PAGINATED_TABS } from './TimePeriodTabs';
import useTimePeriod from '../../Hooks/useTimePeriod';
import axios from '../../API/axios';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════ */

export default function PaginatedReportView({ reportId, onBack, siblingReports, onSelectReport }) {
  const { template, widgets, loading } = useReportCanvas(reportId);
  const { tags } = useAvailableTags();
  const { tagValues: emulatorValues, enabled: emulatorOn } = useEmulator();
  const { socket } = useSocket();

  const [shiftsConfig, setShiftsConfig] = useState(null);
  const { state: timePeriod, dateRange, actions: tpActions } = useTimePeriod('live', shiftsConfig);
  const isLive = timePeriod.tab === 'live';
  const [tagValues, setTagValues] = useState({});
  const [liveTagValues, setLiveTagValues] = useState({});
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [liveError, setLiveError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const reportRef = useRef(null);

  // Extract paginated sections from template
  const sections = useMemo(() => {
    if (!template) return [];
    const lc = typeof template.layout_config === 'string' ? JSON.parse(template.layout_config) : (template.layout_config || {});
    return lc.paginatedSections || [];
  }, [template]);

  const pageMode = useMemo(() => {
    if (!template) return 'a4';
    const lc = typeof template.layout_config === 'string' ? JSON.parse(template.layout_config) : (template.layout_config || {});
    return lc.grid?.pageMode || 'a4';
  }, [template]);

  // Collect all tag names needed
  const tagNames = useMemo(() => collectPaginatedTagNames(sections), [sections]);
  // Collect per-tag aggregation groups for historical fetches
  const tagAggGroups = useMemo(() => collectPaginatedTagAggregations(sections), [sections]);

  // Fetch shift schedule
  useEffect(() => {
    axios.get('/api/settings/shifts')
      .then(res => setShiftsConfig(res.data))
      .catch(() => {});
  }, []);

  // ── Live mode: poll REST + listen WebSocket ──
  useEffect(() => {
    if (!isLive || tagNames.length === 0) return;
    let errorShown = false;
    const fetchLive = async () => {
      try {
        const res = await axios.get('/api/live-monitor/tags', {
          params: { tags: tagNames.join(',') },
        });
        const data = res.data?.tag_values ?? res.data?.data ?? res.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          setLiveTagValues((prev) => ({ ...prev, ...data }));
          setLiveError(null);
        }
      } catch (err) {
        if (!errorShown) {
          setLiveError(err.response?.data?.error || err.message || 'Failed to fetch live data');
          errorShown = true;
        }
      }
    };
    setLiveError(null);
    fetchLive();
    const interval = setInterval(fetchLive, 5000);
    return () => clearInterval(interval);
  }, [isLive, tagNames]);

  // Live mode: WebSocket updates
  useEffect(() => {
    if (!isLive || !socket) return;
    const handler = (data) => {
      if (data?.tag_values && typeof data.tag_values === 'object') {
        setLiveTagValues((prev) => ({ ...prev, ...data.tag_values }));
      }
    };
    socket.on('live_tag_data', handler);
    return () => socket.off('live_tag_data', handler);
  }, [isLive, socket]);

  // ── Historical mode: fetch tag values for the date range ──
  // Supports per-cell aggregation: same tag can have 'first', 'last', 'delta' etc.
  // Non-default aggregations are namespaced as 'agg::tagName' in the merged result.
  const fetchData = useCallback(async () => {
    if (isLive || tagNames.length === 0 || !dateRange) return;
    setFetchLoading(true);
    setFetchError(null);
    try {
      const fromISO = dateRange.from.toISOString();
      const toISO = dateRange.to.toISOString();

      const aggEntries = Object.entries(tagAggGroups);
      if (aggEntries.length === 0) {
        // Fallback: fetch all tags with 'auto'
        const res = await axios.get('/api/historian/by-tags', {
          params: { tag_names: tagNames.join(','), from: fromISO, to: toISO, aggregation: 'auto' },
          timeout: 15000,
        });
        const data = res?.data?.tag_values || res?.data?.data || res?.data;
        if (data && typeof data === 'object' && !Array.isArray(data)) setTagValues(data);
      } else {
        // Fire parallel requests per aggregation type
        const results = await Promise.all(
          aggEntries.map(([agg, tags]) =>
            axios.get('/api/historian/by-tags', {
              params: { tag_names: tags.join(','), from: fromISO, to: toISO, aggregation: agg },
              timeout: 15000,
            }).then((res) => ({ agg, data: res?.data?.tag_values || res?.data?.data || res?.data || {} }))
              .catch(() => ({ agg, data: {} }))
          )
        );
        // Merge: default agg ('last') uses plain tagName, others use 'agg::tagName'
        const merged = {};
        for (const { agg, data } of results) {
          if (!data || typeof data !== 'object') continue;
          for (const [tagName, value] of Object.entries(data)) {
            if (agg === 'last') {
              merged[tagName] = value;
            } else {
              merged[`${agg}::${tagName}`] = value;
              // Also set plain tagName if not already set (so tags with only 'first' still work)
              if (!(tagName in merged)) merged[tagName] = value;
            }
          }
        }
        setTagValues(merged);
      }
    } catch (err) {
      console.warn('Failed to fetch historical data for paginated report:', err);
      try {
        const res2 = await axios.get('/api/live-monitor/tags', {
          params: { tags: tagNames.join(',') },
          timeout: 10000,
        });
        const data2 = res2?.data?.tag_values || res2?.data?.data || res2?.data;
        if (data2 && typeof data2 === 'object') setTagValues(data2);
      } catch {
        setFetchError('Could not load tag data');
      }
    }
    setFetchLoading(false);
  }, [isLive, tagNames, tagAggGroups, dateRange]);

  useEffect(() => { if (!isLive) fetchData(); }, [fetchData, isLive]);

  // Merge values: live or historical + emulator
  const mergedTagValues = useMemo(() => {
    const base = isLive ? { ...liveTagValues } : { ...tagValues };
    if (emulatorOn && emulatorValues) Object.assign(base, emulatorValues);
    return base;
  }, [isLive, liveTagValues, tagValues, emulatorOn, emulatorValues]);

  // ── Fullscreen toggle ──
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // PDF export
  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      // Capture the inner paginated-preview-root element (width: 210mm), not the
      // outer wrapper div which inherits max-w-[1200px] and would include empty side margins.
      const el = reportRef.current.querySelector('.paginated-preview-root') || reportRef.current.firstElementChild || reportRef.current;

      // Add PDF-export class for optimized styling during capture
      el.classList.add('rb-pdf-export');

      // Temporarily force the element to render at its natural width (no clipping)
      const prevOverflow = el.style.overflow;
      el.style.overflow = 'visible';

      // Wait a frame for styles to apply
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const canvas = await html2canvas(el, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        // Ensure html2canvas treats the element's full scroll width as the viewport
        windowWidth: Math.max(el.scrollWidth, el.offsetWidth),
        width: Math.max(el.scrollWidth, el.offsetWidth),
      });

      el.style.overflow = prevOverflow;
      el.classList.remove('rb-pdf-export');

      const imgWidth = 210; // A4 width mm
      const pageHeight = 297; // A4 height mm
      const marginX = 10;
      const marginTop = 8;
      const footerSpace = 6;
      const usableWidth = imgWidth - 2 * marginX;
      const usableHeight = pageHeight - marginTop - footerSpace;

      const scaledImgHeight = (canvas.height * usableWidth) / canvas.width;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      let yOffset = 0;
      let pageNum = 1;
      const totalPages = Math.ceil(scaledImgHeight / usableHeight);

      while (yOffset < scaledImgHeight) {
        if (pageNum > 1) pdf.addPage();

        const sourceY = (yOffset / scaledImgHeight) * canvas.height;
        const sourceH = Math.min((usableHeight / scaledImgHeight) * canvas.height, canvas.height - sourceY);
        const destH = (sourceH / canvas.height) * scaledImgHeight;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceH;
        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH);

        const imgData = pageCanvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', marginX, marginTop, usableWidth, destH);

        // Footer
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`Page ${pageNum} of ${totalPages}`, imgWidth / 2, pageHeight - 2, { align: 'center' });
        pdf.text(new Date().toLocaleDateString('en-GB'), imgWidth - marginX, pageHeight - 2, { align: 'right' });

        yOffset += usableHeight;
        pageNum++;
      }

      const name = template?.name || 'report';
      pdf.save(`${name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
    }
    setExporting(false);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--rb-accent)', borderTopColor: 'transparent' }} />
          <span className="text-[12px] font-medium" style={{ color: 'var(--rb-text-muted)' }}>Loading report...</span>
        </div>
      </div>
    );
  }

  const currentError = isLive ? liveError : fetchError;
  const currentLoading = isLive ? false : fetchLoading;
  const hasData = Object.keys(mergedTagValues).length > 0;

  return (
    <div className="report-builder min-h-screen" style={{ background: 'var(--rb-surface)' }}>
      {/* ── Sticky header: toolbar + time period tabs ── */}
      <div className="sticky top-0 z-20 print:hidden" style={{ boxShadow: 'var(--rb-elevation-1)' }}>

      {/* ── Toolbar ── */}
      <div className="px-3 py-2.5 flex items-center gap-2"
        style={{ background: 'var(--rb-panel)', borderBottom: '1px solid var(--rb-border)' }}>
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5">
          <ArrowLeft size={15} style={{ color: 'var(--rb-text)' }} />
        </button>

        {/* Center: report tab bar or name */}
        <div className="flex-1 min-w-0 flex items-center justify-center">
          {siblingReports?.length > 1 ? (
            <div className="flex items-center gap-1 overflow-x-auto max-w-full">
              {siblingReports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onSelectReport?.(String(r.id))}
                  className="px-3 py-1.5 text-[12px] font-bold rounded-lg whitespace-nowrap transition-colors"
                  style={
                    String(r.id) === String(reportId)
                      ? { background: 'var(--rb-accent)', color: '#fff' }
                      : { color: 'var(--rb-text-muted)', background: 'transparent' }
                  }
                >
                  {r.name || 'Untitled'}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center">
              <h2 className="text-[13px] font-bold truncate" style={{ color: 'var(--rb-text)' }}>{template?.name || 'Report'}</h2>
              <div className="text-[8px] font-bold uppercase tracking-widest" style={{ color: 'var(--rb-text-muted)' }}>Paginated Report</div>
            </div>
          )}
        </div>

        {!isLive && (
          <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5" title="Refresh data">
            <RefreshCw size={13} className={fetchLoading ? 'animate-spin' : ''} style={{ color: 'var(--rb-text-muted)' }} />
          </button>
        )}

        <div className="w-px h-5" style={{ background: 'var(--rb-border)' }} />

        <button onClick={toggleFullscreen} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5" title="Fullscreen">
          {fullscreen ? <Minimize size={13} style={{ color: 'var(--rb-text-muted)' }} /> : <Maximize size={13} style={{ color: 'var(--rb-text-muted)' }} />}
        </button>

        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="rb-btn-primary flex items-center gap-1.5 disabled:opacity-50"
        >
          <Download size={12} />
          <span className="text-[10px] font-bold uppercase tracking-wider">{exporting ? 'Exporting...' : 'PDF'}</span>
        </button>
        <button onClick={handlePrint} className="rb-btn-ghost flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
          <Printer size={12} /> Print
        </button>
      </div>

      {/* ── Time period tabs ── */}
      <TimePeriodTabs
        tabs={PAGINATED_TABS}
        activeTab={timePeriod.tab}
        onTabChange={tpActions.setTab}
        customFrom={timePeriod.customFrom}
        customTo={timePeriod.customTo}
        onCustomFrom={tpActions.setCustomFrom}
        onCustomTo={tpActions.setCustomTo}
        shiftsConfig={shiftsConfig}
        selectedShift={timePeriod.selectedShift}
        onShiftChange={tpActions.setShift}
      />

      {/* ── Status bar — single persistent div, bg cross-fades via transition-colors ── */}
      {(() => {
        let bg, dot, msg;
        if (currentError) {
          bg  = 'bg-[#fef2f2] dark:bg-[#1a0c0c] border-[#fca5a5]/30';
          dot = <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444] flex-shrink-0" />;
          msg = <span className="text-[11px] font-medium text-[#ef4444]">{currentError}</span>;
        } else if (currentLoading) {
          bg  = 'bg-[#eff6ff] dark:bg-[#0c1a2e] border-[#93c5fd]/30';
          dot = <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse flex-shrink-0" />;
          msg = <span className="text-[11px] font-medium text-[#3b82f6]">Loading data…</span>;
        } else if (isLive) {
          bg  = 'bg-[#ecfdf5] dark:bg-[#0d2e1f] border-[#a7f3d0] dark:border-[#065f46]';
          dot = <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse flex-shrink-0" />;
          msg = <span className="text-[11px] font-medium text-[#059669]">{emulatorOn ? 'Live (Emulator)' : 'Live'} — {Object.keys(mergedTagValues).length} tags</span>;
        } else if (hasData) {
          bg  = 'bg-[#ecfdf5] dark:bg-[#0d2e1f] border-[#a7f3d0] dark:border-[#065f46]';
          dot = <span className="w-1.5 h-1.5 rounded-full bg-[#059669] flex-shrink-0" />;
          msg = <span className="text-[11px] font-medium text-[#059669]">Data loaded — {Object.keys(mergedTagValues).length} tags</span>;
        } else {
          return null;
        }
        return (
          <div className={`px-4 py-1.5 flex items-center gap-2 border-b print:hidden transition-colors duration-300 ${bg}`}>
            {dot}{msg}
          </div>
        );
      })()}

      </div>{/* end sticky header */}

      {/* ── Report content ── */}
      <div
        id="paginated-report-print"
        className={`py-2 print:py-0 ${pageMode === 'a4' ? 'max-w-[1200px] mx-auto' : 'w-full'}`}
        style={{
          background: '#e5e7eb',
          opacity: currentLoading ? 0.45 : 1,
          transition: 'opacity 250ms ease',
          pointerEvents: currentLoading ? 'none' : undefined,
        }}
      >
        <div ref={reportRef} className="print:shadow-none">
          <PaginatedReportPreview
            sections={sections}
            tagValues={mergedTagValues}
            dateRange={dateRange}
            compact={pageMode === 'full'}
            isPreviewMode={true}
          />
        </div>
      </div>
    </div>
  );
}
