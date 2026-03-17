/**
 * PaginatedReportViewer — View paginated reports with live/historical data.
 *
 * Renders the paginated sections from the template config with real tag data,
 * supports date range selection, live data polling, PDF/print export,
 * fullscreen mode, and professional A4 rendering.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ArrowLeft, Download, Printer, Calendar, RefreshCw, Maximize, Minimize,
} from 'lucide-react';
import { useEmulator } from '../../Context/EmulatorContext';
import { useSocket } from '../../Context/SocketContext';
import { useReportCanvas, useAvailableTags } from '../../Hooks/useReportBuilder';
import { PaginatedReportPreview, collectPaginatedTagNames } from '../ReportBuilder/PaginatedReportBuilder';
import axios from '../../API/axios';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/* ══════════════════════════════════════════════════════════════════
   DATE RANGE PRESETS
   ══════════════════════════════════════════════════════════════════ */

const PRESETS = [
  { key: 'live', label: 'Live' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this-week', label: 'This Week' },
  { key: 'last-week', label: 'Last Week' },
  { key: 'this-month', label: 'This Month' },
  { key: 'custom', label: 'Custom' },
];

function getPresetRange(key) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(5, 0, 0, 0); // shift start at 05:00

  switch (key) {
    case 'today':
      if (now.getHours() < 5) start.setDate(start.getDate() - 1);
      return { from: start.toISOString(), to: new Date(start.getTime() + 24 * 3600 * 1000).toISOString() };
    case 'yesterday': {
      const y = new Date(start);
      y.setDate(y.getDate() - 1);
      if (now.getHours() < 5) y.setDate(y.getDate() - 1);
      return { from: y.toISOString(), to: new Date(y.getTime() + 24 * 3600 * 1000).toISOString() };
    }
    case 'this-week': {
      const d = new Date(start);
      d.setDate(d.getDate() - d.getDay());
      return { from: d.toISOString(), to: now.toISOString() };
    }
    case 'last-week': {
      const d = new Date(start);
      d.setDate(d.getDate() - d.getDay() - 7);
      return { from: d.toISOString(), to: new Date(d.getTime() + 7 * 24 * 3600 * 1000).toISOString() };
    }
    case 'this-month': {
      const d = new Date(start);
      d.setDate(1);
      return { from: d.toISOString(), to: now.toISOString() };
    }
    default:
      return { from: start.toISOString(), to: now.toISOString() };
  }
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════ */

export default function PaginatedReportView({ reportId, onBack }) {
  const { template, widgets, loading } = useReportCanvas(reportId);
  const { tags } = useAvailableTags();
  const { tagValues: emulatorValues, enabled: emulatorOn } = useEmulator();
  const { socket } = useSocket();

  const [preset, setPreset] = useState('live');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [tagValues, setTagValues] = useState({});
  const [liveTagValues, setLiveTagValues] = useState({});
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [liveError, setLiveError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const reportRef = useRef(null);

  const isLive = preset === 'live';

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

  // ISO string → local YYYY-MM-DDTHH:mm for datetime-local input
  const isoToLocalDatetime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
  };

  // Date range (only used for historical modes)
  const dateRange = useMemo(() => {
    if (preset === 'live') return { from: new Date().toISOString(), to: new Date().toISOString() };
    if (preset === 'custom') {
      return { from: customFrom || new Date().toISOString(), to: customTo || new Date().toISOString() };
    }
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

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
  const fetchData = useCallback(async () => {
    if (isLive || tagNames.length === 0) return;
    setFetchLoading(true);
    setFetchError(null);
    try {
      const res = await axios.get('/api/historian/by-tags', {
        params: {
          tag_names: tagNames.join(','),
          from: dateRange.from,
          to: dateRange.to,
          aggregation: 'auto',
        },
        timeout: 15000,
      });
      const data = res?.data?.tag_values || res?.data?.data || res?.data;
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        setTagValues(data);
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
  }, [isLive, tagNames, dateRange]);

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
      const el = reportRef.current;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });

      const imgWidth = 210; // A4 width mm
      const pageHeight = 297; // A4 height mm
      const margin = 5;
      const usableWidth = imgWidth - 2 * margin;
      const usableHeight = pageHeight - 2 * margin - 6;

      const imgHeight = (canvas.height * usableWidth) / canvas.width;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      let yOffset = 0;
      let pageNum = 1;
      const totalPages = Math.ceil(imgHeight / usableHeight);

      while (yOffset < imgHeight) {
        if (pageNum > 1) pdf.addPage();

        const sourceY = (yOffset / imgHeight) * canvas.height;
        const sourceH = Math.min((usableHeight / imgHeight) * canvas.height, canvas.height - sourceY);
        const destH = (sourceH / canvas.height) * imgHeight;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sourceH;
        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, sourceY, canvas.width, sourceH, 0, 0, canvas.width, sourceH);

        const imgData = pageCanvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', margin, margin, usableWidth, destH);

        // Footer
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.text(`Page ${pageNum} of ${totalPages}`, imgWidth / 2, pageHeight - 3, { align: 'center' });
        pdf.text(new Date().toLocaleDateString('en-GB'), imgWidth - margin, pageHeight - 3, { align: 'right' });

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
      {/* ── Toolbar ── */}
      <div className="sticky top-0 z-20 px-3 py-2.5 flex items-center gap-2 print:hidden"
        style={{ background: 'var(--rb-panel)', borderBottom: '1px solid var(--rb-border)', boxShadow: 'var(--rb-elevation-1)' }}>
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5">
          <ArrowLeft size={15} style={{ color: 'var(--rb-text)' }} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-bold truncate" style={{ color: 'var(--rb-text)' }}>{template?.name || 'Report'}</h2>
          <div className="text-[8px] font-bold uppercase tracking-widest" style={{ color: 'var(--rb-text-muted)' }}>Paginated Report</div>
        </div>

        {/* Date range selector */}
        <div className="flex items-center gap-1.5">
          <Calendar size={12} style={{ color: 'var(--rb-text-muted)' }} />
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            className="rb-input-base text-[11px] py-1.5 px-2"
          >
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
          {preset === 'custom' && (
            <>
              <input
                type="datetime-local"
                value={isoToLocalDatetime(customFrom)}
                onChange={(e) => setCustomFrom(new Date(e.target.value).toISOString())}
                className="rb-input-base text-[11px] py-1.5 px-2"
              />
              <span className="text-[10px]" style={{ color: 'var(--rb-text-muted)' }}>to</span>
              <input
                type="datetime-local"
                value={isoToLocalDatetime(customTo)}
                onChange={(e) => setCustomTo(new Date(e.target.value).toISOString())}
                className="rb-input-base text-[11px] py-1.5 px-2"
              />
            </>
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

      {/* ── Status bar ── */}
      {currentError && (
        <div className="px-4 py-1.5 flex items-center gap-2 bg-[#fef2f2] dark:bg-[#1a0c0c] border-b border-[#fca5a5]/30 print:hidden">
          <span className="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />
          <span className="text-[11px] font-medium text-[#ef4444]">{currentError}</span>
        </div>
      )}
      {currentLoading && !currentError && (
        <div className="px-4 py-1.5 flex items-center gap-2 bg-[#eff6ff] dark:bg-[#0c1a2e] border-b border-[#93c5fd]/30 print:hidden">
          <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
          <span className="text-[11px] font-medium text-[#3b82f6]">Loading data...</span>
        </div>
      )}
      {isLive && !liveError && (
        <div className="px-4 py-1.5 flex items-center gap-2 bg-[#ecfdf5] dark:bg-[#0d2e1f] border-b border-[#a7f3d0] dark:border-[#065f46] print:hidden">
          <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" />
          <span className="text-[11px] font-medium text-[#059669]">
            {emulatorOn ? 'Live (Emulator)' : 'Live'} — {Object.keys(mergedTagValues).length} tags
          </span>
        </div>
      )}
      {!isLive && !currentLoading && !currentError && hasData && (
        <div className="px-4 py-1.5 flex items-center gap-2 bg-[#ecfdf5] dark:bg-[#0d2e1f] border-b border-[#a7f3d0] dark:border-[#065f46] print:hidden">
          <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
          <span className="text-[11px] font-medium text-[#059669]">Data loaded — {Object.keys(mergedTagValues).length} tags</span>
        </div>
      )}

      {/* ── Report content ── */}
      <div id="paginated-report-print" className={`py-2 print:py-0 ${pageMode === 'a4' ? 'max-w-[1200px] mx-auto' : 'w-full'}`} style={{ background: '#e5e7eb' }}>
        <div ref={reportRef} className="print:shadow-none">
          <PaginatedReportPreview
            sections={sections}
            tagValues={mergedTagValues}
            dateRange={dateRange}
            compact={pageMode === 'full'}
          />
        </div>
      </div>
    </div>
  );
}
