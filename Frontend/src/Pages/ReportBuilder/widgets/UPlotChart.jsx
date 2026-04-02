/**
 * UPlotChart — High-performance streaming time-series chart.
 *
 * Uses uPlot (< 30 KB) for native canvas rendering without full redraws.
 * Unlike Chart.js which re-renders the entire canvas on every React update,
 * uPlot uses setData() to repaint only the changed canvas region —
 * exactly like SCADA/HMI trend viewers.
 *
 * Props:
 *   series     – array of { label, dataSource: { tagName }, color }
 *   tagHistory – { tagName: [{t, v}, ...] } from useTagHistory
 *   tagValues  – { tagName: number } current snapshot for legend
 *   config     – widget config (showLegend, showGrid, gridColor, etc.)
 */
import { useRef, useEffect, useMemo, useState } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

const DEFAULT_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981'];

/* ── Data transformation ─────────────────────────────────────────── */

/**
 * Convert tagHistory {tagName: [{t,v},...]} into uPlot's columnar format:
 * [[timestamps_in_seconds], [series1_values], [series2_values], ...]
 */
function buildData(seriesDefs, tagHistory) {
  if (!seriesDefs.length) return null;

  // Collect ALL unique timestamps across all series, sorted
  const tsSet = new Set();
  seriesDefs.forEach((s) => {
    const pts = tagHistory?.[s.tagName];
    if (Array.isArray(pts)) pts.forEach((p) => tsSet.add(p.t));
  });

  if (tsSet.size < 2) return null;

  const timestamps = Array.from(tsSet).sort((a, b) => a - b);
  // uPlot expects seconds (Unix epoch), not milliseconds
  const xData = new Float64Array(timestamps.length);
  for (let i = 0; i < timestamps.length; i++) {
    xData[i] = timestamps[i] / 1000;
  }

  // Build columnar data for each series via lookup map
  const columns = seriesDefs.map((s) => {
    const pts = tagHistory?.[s.tagName];
    const col = new Float64Array(timestamps.length);
    if (!Array.isArray(pts) || pts.length === 0) {
      col.fill(NaN); // NaN = gap in uPlot
      return col;
    }
    const lookup = new Map();
    pts.forEach((p) => lookup.set(p.t, p.v));
    for (let i = 0; i < timestamps.length; i++) {
      const v = lookup.get(timestamps[i]);
      col[i] = v !== undefined ? v : NaN;
    }
    return col;
  });

  return [xData, ...columns];
}

/* ── Annotation / reference line draw hook ──────────────────────── */

/**
 * Draw horizontal reference lines on the chart canvas.
 * Each annotation: { label, value (Y), color }
 */
function drawAnnotations(u, annotations) {
  if (!annotations?.length) return;
  const ctx = u.ctx;
  const { left, top, width, height } = u.bbox;
  // Convert CSS pixels → canvas pixels (handles HiDPI / devicePixelRatio)
  const dpr = window.devicePixelRatio || 1;
  const l = left, t = top, w = width, h = height;

  ctx.save();
  annotations.forEach((ann) => {
    const yVal = Number(ann.value);
    if (!Number.isFinite(yVal)) return;
    const yPos = u.valToPos(yVal, 'y', true);  // true = canvas px (already scaled)
    if (yPos < t || yPos > t + h) return;       // outside visible range

    // Dashed line
    ctx.beginPath();
    ctx.setLineDash([6 * dpr, 4 * dpr]);
    ctx.strokeStyle = ann.color || '#ef4444';
    ctx.lineWidth = 1.5 * dpr;
    ctx.moveTo(l, yPos);
    ctx.lineTo(l + w, yPos);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    if (ann.label) {
      const fontSize = 10 * dpr;
      ctx.font = `600 ${fontSize}px monospace`;
      ctx.fillStyle = ann.color || '#ef4444';
      const textW = ctx.measureText(ann.label).width;
      const pad = 3 * dpr;
      // Background pill
      ctx.fillStyle = document.documentElement.classList.contains('dark') ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.85)';
      ctx.fillRect(l + w - textW - pad * 3, yPos - fontSize - pad, textW + pad * 2, fontSize + pad * 2);
      // Text
      ctx.fillStyle = ann.color || '#ef4444';
      ctx.fillText(ann.label, l + w - textW - pad * 2, yPos - pad);
    }
  });
  ctx.restore();
}

/* ── uPlot options builder ───────────────────────────────────────── */

function buildOpts(width, height, seriesDefs, config, tagValues, isDark, dataSpan) {
  const showGrid = config.showGrid !== false;
  const gridColor = config.gridColor || (isDark ? 'rgba(148,163,184,0.10)' : 'rgba(0,0,0,0.06)');
  const axisStroke = isDark ? 'rgba(148,163,184,0.20)' : 'rgba(0,0,0,0.08)';
  const tickLabelColor = isDark ? '#cbd5e1' : '#374151';
  const axisFont = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  const uSeries = [
    {},
    ...seriesDefs.map((s, i) => {
      const color = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
      const currentVal = tagValues?.[s.tagName];
      const liveLabel = currentVal != null
        ? `${s.label || s.tagName} | ${Number(currentVal).toFixed(2)}`
        : (s.label || s.tagName);
      return {
        label: liveLabel,
        stroke: color,
        width: 2,
        fill: color + '1A',
        points: { show: false },
        spanGaps: false,
        paths: uPlot.paths.spline(),
      };
    }),
  ];

  return {
    width,
    height,
    padding: [8, 8, 0, 0],
    cursor: {
      show: true,
      x: true,
      y: true,
      drag: { x: false, y: false },
      points: {
        show: true,
        size: 8,
        width: 2,
        fill: isDark ? '#111827' : '#ffffff',
        stroke: (self, seriesIdx) => {
          const s = seriesDefs[seriesIdx - 1];
          return s?.color || DEFAULT_COLORS[(seriesIdx - 1) % DEFAULT_COLORS.length];
        },
      },
      focus: { prox: 50 },
    },
    legend: {
      show: config.showLegend !== false,
      live: true,
    },
    scales: {
      x: { time: true, auto: true },
      y: {
        auto: true,
        range: (self, dataMin, dataMax) => {
          if (dataMin == null || dataMax == null) return [0, 100];
          if (dataMin === dataMax) return [dataMin - 1, dataMax + 1];
          const pad = (dataMax - dataMin) * 0.1;
          return [dataMin - pad, dataMax + pad];
        },
      },
    },
    axes: [
      {
        show: showGrid,
        stroke: tickLabelColor,
        grid: { show: showGrid, stroke: gridColor, width: 0.5, dash: [3, 3] },
        ticks: { show: showGrid, stroke: axisStroke, width: 1, size: 6 },
        font: axisFont,
        gap: 8,
        values: (self, ticks) =>
          ticks.map((t) => {
            const d = new Date(t * 1000);
            if (dataSpan === 'months' || dataSpan === 'weeks') {
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                + '\n' + d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            }
            if (dataSpan === 'days') {
              return d.toLocaleDateString('en-US', { weekday: 'short' })
                + ' ' + d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            }
            if (dataSpan === 'hours') {
              return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
            }
            return d.toLocaleTimeString('en-US', {
              hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
          }),
        space: dataSpan === 'months' || dataSpan === 'weeks' ? 90 : dataSpan === 'days' ? 80 : 75,
      },
      {
        show: showGrid,
        stroke: tickLabelColor,
        grid: { show: showGrid, stroke: gridColor, width: 0.5, dash: [3, 3] },
        ticks: { show: showGrid, stroke: axisStroke, width: 1, size: 6 },
        font: axisFont,
        gap: 8,
        size: 60,
        values: (self, ticks) => ticks.map((v) => v.toFixed(1)),
      },
    ],
    series: uSeries,
    hooks: {
      draw: [
        (u) => drawAnnotations(u, config.annotations),
      ],
    },
  };
}

/* ── Stable key for series definitions (to detect config changes) ── */
function seriesKey(seriesDefs) {
  return seriesDefs.map((s) => s.tagName).join('|');
}

/** Compute a rough "time span class" to detect when data switches between live vs historical. */
function dataSpanKey(data) {
  if (!data || data[0]?.length < 2) return 'none';
  const xArr = data[0];
  const rangeS = xArr[xArr.length - 1] - xArr[0];
  // Classify: <10min, <2h, <2d, <14d, else
  if (rangeS < 600) return 'minutes';
  if (rangeS < 7200) return 'hours';
  if (rangeS < 172800) return 'days';
  if (rangeS < 1209600) return 'weeks';
  return 'months';
}

/* ── Component ───────────────────────────────────────────────────── */

export default function UPlotChart({ series: seriesDefs, tagHistory, tagValues, config }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesKeyRef = useRef('');
  const spanKeyRef = useRef('');
  const [ready, setReady] = useState(false);

  // Normalize series definitions
  const normalizedSeries = useMemo(
    () =>
      (seriesDefs || []).map((s, i) => ({
        tagName: s.dataSource?.tagName ?? s.tagName ?? '',
        label: s.label || s.dataSource?.tagName || s.tagName || `Series ${i + 1}`,
        color: s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      })),
    [seriesDefs],
  );

  // Build columnar data from tagHistory
  const data = useMemo(
    () => buildData(normalizedSeries, tagHistory),
    [normalizedSeries, tagHistory],
  );

  // Destroy helper
  const destroyChart = () => {
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => () => destroyChart(), []);

  // Create or update chart
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !data) return;

    const rect = el.getBoundingClientRect();
    const w = Math.floor(rect.width) || 400;
    // Reserve ~30px for legend below chart
    const legendReserve = config.showLegend !== false ? 30 : 0;
    const h = Math.max(60, (Math.floor(rect.height) || 200) - legendReserve);
    const currentKey = seriesKey(normalizedSeries);
    const currentSpan = dataSpanKey(data);

    // Recreate chart if series config changed OR data time span class changed
    // (e.g., switching from live 5-min streaming to historical "This Week")
    if (chartRef.current && (seriesKeyRef.current !== currentKey || spanKeyRef.current !== currentSpan)) {
      destroyChart();
    }

    if (!chartRef.current) {
      // ── Create chart for the first time ──
      const isDark = document.documentElement.classList.contains('dark');
      const opts = buildOpts(w, h, normalizedSeries, config, tagValues, isDark, currentSpan);
      try {
        chartRef.current = new uPlot(opts, data, el);
      } catch (err) {
        console.warn('uPlot create error:', err);
        return;
      }
      seriesKeyRef.current = currentKey;
      spanKeyRef.current = currentSpan;
      if (!ready) setReady(true);
    } else {
      // ── Streaming update — NO full re-render ──
      // This is the magic: setData() repaints only the canvas pixels that changed
      chartRef.current.setData(data);
    }
  }, [data, normalizedSeries, config, tagValues]);

  // Update legend labels on every tagValues change (without recreating chart)
  useEffect(() => {
    if (!chartRef.current) return;
    normalizedSeries.forEach((s, i) => {
      const currentVal = tagValues?.[s.tagName];
      const liveLabel = currentVal != null
        ? `${s.label} | ${Number(currentVal).toFixed(2)}`
        : s.label;
      const seriesEntry = chartRef.current.series[i + 1];
      if (seriesEntry) seriesEntry.label = liveLabel;
    });
    // Redraw legend only (not the canvas)
    if (chartRef.current?.root) {
      const legendEls = chartRef.current.root.querySelectorAll('.u-series .u-label');
      normalizedSeries.forEach((s, i) => {
        const currentVal = tagValues?.[s.tagName];
        const liveLabel = currentVal != null
          ? `${s.label} | ${Number(currentVal).toFixed(2)}`
          : s.label;
        if (legendEls[i + 1]) legendEls[i + 1].textContent = liveLabel;
      });
    }
  }, [tagValues, normalizedSeries]);

  // Handle container resize via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (chartRef.current && width > 0 && height > 0) {
          // Reserve space for legend (approx 28px per row, max 2 rows)
          const legendEl = el.querySelector('.u-legend');
          const legendH = legendEl ? legendEl.offsetHeight : 0;
          const chartH = Math.max(60, Math.floor(height) - legendH);
          chartRef.current.setSize({
            width: Math.floor(width),
            height: chartH,
          });
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Detect if we're in historical mode by checking whether tagHistory has
  // arrays with 100+ points (typical of backend time-series responses)
  const isHistorical = useMemo(() => {
    if (!tagHistory) return false;
    return Object.values(tagHistory).some((pts) => Array.isArray(pts) && pts.length > 50);
  }, [tagHistory]);

  return (
    <div ref={containerRef} className="uplot-container w-full h-full relative">
      {!data && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 z-10">
          <span className={isHistorical ? '' : 'animate-pulse'}>
            {isHistorical ? 'No chart data for this period' : 'Accumulating live data…'}
          </span>
        </div>
      )}
    </div>
  );
}
