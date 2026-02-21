/**
 * ChartWidget — Report Builder chart dispatcher.
 *
 * LINE / AREA charts → UPlotChart (high-perf streaming, no full re-renders)
 * BAR charts         → Chart.js (categorical comparison, static snapshots)
 */
import { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Bar } from 'react-chartjs-2';
import { useThumbnailCapture } from '../ThumbnailCaptureContext';
import UPlotChart from './UPlotChart';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, annotationPlugin);

// Industrial palette: brand blue, orange alert, green ok, red alarm, amber warning, steel gray
const DEFAULT_COLORS = ['#2563ab', '#e67e22', '#27ae60', '#e74c3c', '#f39c12', '#7f8c8d'];

export default function ChartWidget({ config, tagValues, tagHistory, isPreview = true }) {
  const isCapturing = useThumbnailCapture();
  const accentColor = config.accentColor || null;
  const palette = config.colors?.length
    ? config.colors
    : accentColor
      ? [accentColor, ...DEFAULT_COLORS.filter((c) => c !== accentColor)]
      : DEFAULT_COLORS;
  const colors = palette;

  // Report builder uses config.series (dataSource.tagName); legacy uses config.tags
  const series = config.series?.length
    ? config.series
    : (config.tags || []).map((t) => ({
        label: t.displayName || t.tagName,
        dataSource: { tagName: t.tagName },
      }));

  const isBarChart = config.chartType === 'bar';

  /* ── BAR CHART (Chart.js — categorical, not streaming) ─────────── */
  if (isBarChart) {
    return (
      <BarChartView
        config={config}
        series={series}
        colors={colors}
        tagValues={tagValues}
        isPreview={isPreview}
        isCapturing={isCapturing}
      />
    );
  }

  /* ── LINE / AREA CHART (uPlot — live streaming) ────────────────── */
  return (
    <div className="flex flex-col h-full p-3">
      {config.title && (
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 truncate">
          {config.title}
        </h4>
      )}
      <div
        className={`flex-1 min-h-0 overflow-hidden ${config.showCard !== false ? 'rounded-lg border border-[var(--rb-border)]' : ''}`}
        style={{
          borderRadius: 'var(--rb-radius-lg)',
          ...(config.backgroundColor && { backgroundColor: config.backgroundColor }),
          ...(!isPreview && { minHeight: '200px' }),
        }}
      >
        <UPlotChart
          series={series}
          tagHistory={tagHistory}
          tagValues={tagValues}
          config={config}
        />
      </div>
    </div>
  );
}

/* ── Bar Chart sub-component (unchanged from before) ─────────────── */

function BarChartView({ config, series, colors, tagValues, isPreview, isCapturing }) {
  const chartData = useMemo(() => {
    const labels = series.length > 0
      ? series.map((s) => s.label || s.dataSource?.tagName || 'Series')
      : ['Sample'];
    const datasets = [{
      label: config.title || 'Values',
      data: series.length > 0
        ? series.map((s) => {
            const tagName = s.dataSource?.tagName ?? s.tagName;
            const v = tagValues?.[tagName];
            return v != null ? Number(v) : 0;
          })
        : [30, 45, 60],
      backgroundColor: series.length > 0
        ? series.map((s, i) => (s.color || colors[i % colors.length]) + '80')
        : [colors[0] + '80'],
      borderColor: series.length > 0
        ? series.map((s, i) => s.color || colors[i % colors.length])
        : [colors[0]],
      borderWidth: 2,
      borderRadius: 4,
    }];
    return { labels, datasets };
  }, [series, tagValues, config.title, colors]);

  // Build Chart.js annotation objects from config.annotations
  const annotationObjs = useMemo(() => {
    if (!config.annotations?.length) return {};
    const obj = {};
    config.annotations.forEach((ann, i) => {
      const yVal = Number(ann.value);
      if (!Number.isFinite(yVal)) return;
      obj[`ref_${i}`] = {
        type: 'line',
        yMin: yVal,
        yMax: yVal,
        borderColor: ann.color || '#ef4444',
        borderWidth: 1.5,
        borderDash: [6, 4],
        label: {
          display: !!ann.label,
          content: ann.label || '',
          position: 'end',
          backgroundColor: 'rgba(255,255,255,0.85)',
          color: ann.color || '#ef4444',
          font: { size: 10, weight: '600', family: 'monospace' },
          padding: { top: 2, bottom: 2, left: 4, right: 4 },
        },
      };
    });
    return obj;
  }, [config.annotations]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: isCapturing ? false : { duration: 0 },
    plugins: {
      legend: {
        display: config.showLegend !== false,
        position: 'bottom',
        align: 'start',
        labels: {
          color: '#9ca3af',
          boxWidth: 10,
          boxHeight: 3,
          padding: 12,
          font: { size: 10, family: 'monospace' },
        },
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        titleFont: { size: 11, weight: '600', family: 'monospace' },
        bodyFont: { size: 11, family: 'monospace' },
        bodySpacing: 4,
        padding: 10,
        cornerRadius: 4,
        borderColor: 'rgba(76, 224, 255, 0.3)',
        borderWidth: 1,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
        },
      },
      annotation: {
        annotations: annotationObjs,
      },
    },
    scales: {
      x: {
        display: config.showGrid !== false,
        grid: { color: config.gridColor || 'rgba(148,163,184,0.1)' },
        ticks: { color: '#64748b', font: { size: 9 } },
      },
      y: {
        display: config.showGrid !== false,
        grid: { color: config.gridColor || 'rgba(148,163,184,0.1)' },
        ticks: { color: '#64748b', font: { size: 9 } },
        beginAtZero: true,
      },
    },
  }), [config, isCapturing, annotationObjs]);

  return (
    <div className="flex flex-col h-full p-3">
      {config.title && (
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 truncate">
          {config.title}
        </h4>
      )}
      <div
        className={`flex-1 min-h-0 overflow-hidden ${config.showCard !== false ? 'rounded-lg border border-[var(--rb-border)]' : ''}`}
        style={{
          borderRadius: 'var(--rb-radius-lg)',
          ...(config.backgroundColor && { backgroundColor: config.backgroundColor }),
          ...(!isPreview && { minHeight: '200px' }),
        }}
      >
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
}
