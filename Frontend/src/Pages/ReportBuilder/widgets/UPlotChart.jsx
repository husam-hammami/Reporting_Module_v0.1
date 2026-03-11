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

const DEFAULT_COLORS = ['#2563ab', '#e67e22', '#27ae60', '#e74c3c', '#f39c12', '#7f8c8d'];

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
  // Theme-aware colors for readability
  const gridColor = config.gridColor || (isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.18)');
  const axisStroke = isDark ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.35)';
  const tickLabelColor = isDark ? '#9ca3af' : '#4b5563';  // gray-400 dark / gray-600 light

  const uSeries = [
    // X-axis (time) — first entry is always x in uPlot
    {},
    // Data series
    ...seriesDefs.map((s, i) => {
      const color = s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
      const currentVal = tagValues?.[s.tagName];
      const liveLabel = currentVal != null
        ? `${s.label || s.tagName} | ${Number(currentVal).toFixed(2)}`
        : (s.label || s.tagName);
      return {
        label: liveLabel,
        stroke: color,
        width: 1.5,
        fill: color + '1A',       // ~10% opacity area fill
        points: { show: false },   // No dots — clean signal line
        spanGaps: false,
        paths: uPlot.paths.spline(),  // Smooth cubic bezier curves — like SCADA trend viewers
      };
    }),
  ];

  return {
    width,
    height,
    padding: [8, 8, 0, 0],  // top, right, bottom, left
    cursor: {
      show: true,
      x: true,
      y: true,
      drag: { x: false, y: false },
      points: { show: true, size: 5, width: 1.5 },
      focus: { prox: 30 },
    },
    legend: {
      show: config.showLegend !== false,
      live: false,
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
      // X-axis — adaptive formatting based on data time span
      {
        show: showGrid,
        stroke: tickLabelColor,
        grid: { show: showGrid, stroke: gridColor, width: 1 },
        ticks: { show: showGrid, stroke: axisStroke, width: 1, size: 4 },
        font: '10px monospace',
        gap: 5,
        values: (self, ticks) =>
          ticks.map((t) => {
            const d = new Date(t * 1000);
            // Adapt format to data span — short spans show time, long spans show date+time
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
            // Default: full time for short spans (minutes / live)
            return d.toLocaleTimeString('en-US', {
              hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
            });
          }),
        space: dataSpan === 'months' || dataSpan === 'weeks' ? 80 : dataSpan === 'days' ? 75 : 70,
      },
      // Y-axis
      {
        show: showGrid,
        stroke: tickLabelColor,
        grid: { show: showGrid, stroke: gridColor, width: 1 },
        ticks: { show: showGrid, stroke: axisStroke, width: 1, size: 4 },
        font: '10px monospace',
        gap: 5,
        size: 55,
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
    const h = Math.floor(rect.height) || 200;
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
          chartRef.current.setSize({
            width: Math.floor(width),
            height: Math.floor(height),
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
