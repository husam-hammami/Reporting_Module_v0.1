import { useMemo, useRef, useCallback } from 'react';
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

const DEFAULT_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981'];

export default function ChartWidget({ config, tagValues, tagHistory, isPreview = true }) {
  const isCapturing = useThumbnailCapture();
  const accentColor = config.accentColor || null;
  const palette = config.colors?.length
    ? config.colors
    : accentColor
      ? [accentColor, ...DEFAULT_COLORS.filter((c) => c !== accentColor)]
      : DEFAULT_COLORS;
  const colors = palette;

  const series = config.series?.length
    ? config.series
    : (config.tags || []).map((t) => ({
        label: t.displayName || t.tagName,
        dataSource: { tagName: t.tagName },
      }));

  const isBarChart = config.chartType === 'bar';

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

  return (
    <div className="flex flex-col h-full w-full" style={{ padding: 0 }}>
      {config.title && (
        <div
          className="rb-widget-title flex-shrink-0 truncate"
          style={{
            padding: '4px 8px 0',
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--rb-text-muted)',
          }}
        >
          {config.title}
        </div>
      )}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{
          backgroundColor: config.backgroundColor || 'transparent',
          ...(!isPreview && { minHeight: '160px' }),
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

function BarChartView({ config, series, colors, tagValues, isPreview, isCapturing }) {
  const chartRef = useRef(null);
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  const chartData = useMemo(() => {
    const labels = series.length > 0
      ? series.map((s) => s.label || s.dataSource?.tagName || 'Series')
      : ['Sample'];
    const barColors = series.length > 0
      ? series.map((s, i) => s.color || colors[i % colors.length])
      : [colors[0]];
    // Create gradient fills for 3D effect
    const createGradient = (ctx, color) => {
      if (!ctx) return color;
      const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
      gradient.addColorStop(0, color + 'ee');
      gradient.addColorStop(0.5, color);
      gradient.addColorStop(1, color + '88');
      return gradient;
    };
    const datasets = [{
      label: config.title || 'Values',
      data: series.length > 0
        ? series.map((s) => {
            const tagName = s.dataSource?.tagName ?? s.tagName;
            const v = tagValues?.[tagName];
            return v != null ? Number(v) : 0;
          })
        : [30, 45, 60],
      backgroundColor: (ctx) => {
        const chart = ctx.chart;
        if (!chart?.ctx) return barColors;
        return barColors.map(c => createGradient(chart.ctx, c));
      },
      borderColor: barColors.map(c => c + 'cc'),
      borderWidth: 1,
      borderRadius: 8,
      borderSkipped: false,
    }];
    return { labels, datasets };
  }, [series, tagValues, config.title, colors]);

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
        borderColor: ann.color || '#f43f5e',
        borderWidth: 1.5,
        borderDash: [6, 4],
        label: {
          display: !!ann.label,
          content: ann.label || '',
          position: 'end',
          backgroundColor: 'rgba(5, 10, 18, 0.85)',
          color: ann.color || '#f43f5e',
          font: { size: 9, weight: '700', family: 'monospace' },
          padding: { top: 2, bottom: 2, left: 4, right: 4 },
        },
      };
    });
    return obj;
  }, [config.annotations]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: isCapturing ? false : { duration: 800, easing: 'easeOutQuart' },
    layout: {
      padding: { top: config.title ? 22 : 4, right: 4, bottom: 4, left: 4 },
    },
    plugins: {
      legend: {
        display: config.showLegend !== false,
        position: 'bottom',
        align: 'start',
        maxHeight: 60,
        labels: {
          color: isDark ? '#64748b' : '#6b7280',
          boxWidth: 8,
          boxHeight: 3,
          padding: 6,
          font: { size: 10, weight: '500' },
          usePointStyle: true,
          pointStyle: 'rectRounded',
        },
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: isDark ? '#111827' : '#ffffff',
        titleFont: { size: 13, weight: '600' },
        titleColor: isDark ? '#f1f5f9' : '#111827',
        bodyFont: { size: 12, weight: '500' },
        bodyColor: isDark ? '#94a3b8' : '#374151',
        bodySpacing: 6,
        padding: { top: 10, bottom: 10, left: 14, right: 14 },
        cornerRadius: 8,
        borderColor: isDark ? '#1e293b' : '#e5e7eb',
        borderWidth: 1,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
        usePointStyle: true,
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y}`,
        },
      },
      annotation: {
        annotations: annotationObjs,
      },
    },
    scales: {
      x: {
        display: config.showGrid !== false,
        grid: {
          display: false,
        },
        ticks: {
          color: isDark ? '#64748b' : '#6b7280',
          font: { size: 11 },
          padding: 4,
        },
        border: {
          display: false,
        },
      },
      y: {
        display: config.showGrid !== false,
        grid: {
          display: false,
        },
        ticks: {
          color: isDark ? '#64748b' : '#6b7280',
          font: { size: 11 },
          padding: 4,
        },
        border: {
          display: false,
        },
        beginAtZero: true,
      },
    },
  }), [config, isCapturing, annotationObjs, isDark]);

  return (
    <div className="flex flex-col h-full w-full" style={{ padding: 0 }}>
      {config.title && (
        <div
          className="rb-widget-title flex-shrink-0 truncate"
          style={{
            padding: '4px 8px 0',
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--rb-text-muted)',
          }}
        >
          {config.title}
        </div>
      )}
      <div
        className="flex-1 min-h-0 overflow-hidden"
        style={{
          backgroundColor: config.backgroundColor || 'transparent',
          ...(!isPreview && { minHeight: '160px' }),
        }}
      >
        <Bar ref={chartRef} data={chartData} options={options} />
      </div>
    </div>
  );
}
