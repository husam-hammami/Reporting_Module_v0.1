import React, { useMemo, useState } from 'react';
import { Bar, Pie, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// Resolve KPI cards from section (Report Config stores in config.cards; legacy uses kpi_cards)
const getKpiCards = (section) => {
  const list = section.kpi_cards || section.config?.kpi_cards || section.config?.cards || [];
  return Array.isArray(list) ? list : [];
};

const CHART_COLORS = [
  'rgba(6, 182, 212, 0.85)',  // cyan
  'rgba(34, 197, 94, 0.85)',  // green
  'rgba(234, 179, 8, 0.85)',  // amber
  'rgba(249, 115, 22, 0.85)', // orange
  'rgba(168, 85, 247, 0.85)', // violet
  'rgba(236, 72, 153, 0.85)', // pink
  'rgba(59, 130, 246, 0.85)', // blue
  'rgba(20, 184, 166, 0.85)', // teal
];

const CHART_BORDER_COLORS = [
  'rgb(6, 182, 212)',
  'rgb(34, 197, 94)',
  'rgb(234, 179, 8)',
  'rgb(249, 115, 22)',
  'rgb(168, 85, 247)',
  'rgb(236, 72, 153)',
  'rgb(59, 130, 246)',
  'rgb(20, 184, 166)',
];

// Value-based color for card accent and number: red (negative), orange (warning), green (good), gray (neutral)
function getValueColor(value) {
  if (value === null || value === undefined) return 'text-gray-500 dark:text-gray-300';
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(n)) return 'text-gray-500 dark:text-gray-300';
  if (n < 0) return 'text-red-600 dark:text-red-400';
  if (n === 0) return 'text-gray-500 dark:text-gray-300';
  if (n > 0 && n < 1) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function getAccentColor(value) {
  if (value === null || value === undefined) return 'bg-sky-500';
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(n)) return 'bg-sky-500';
  if (n < 0) return 'bg-red-500';
  if (n === 0) return 'bg-sky-500';
  if (n > 0 && n < 1) return 'bg-amber-500';
  return 'bg-emerald-500';
}

// Mini area chart (SVG) for "Live value" trend - lightweight, no Chart.js per card
function MiniLiveChart({ value, width = 120, height = 36, gradientId = 'miniLiveGrad' }) {
  const num = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  const points = 12;
  const pad = 2;
  const maxY = height - pad * 2;
  const maxX = width - pad * 2;
  const stepX = maxX / (points - 1);
  const vals = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const v = num * (0.3 + 0.7 * t) + (Math.sin(i * 0.7) * 0.1 * Math.abs(num));
    vals.push(Math.max(0, v));
  }
  const maxVal = Math.max(...vals, 1);
  const ys = vals.map((v) => height - pad - (v / maxVal) * maxY);
  const pathD = vals
    .map((_, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * stepX} ${ys[i]}`)
    .join(' ');
  const areaD = `${pathD} L ${pad + (points - 1) * stepX} ${height - pad} L ${pad} ${height - pad} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      className="min-w-0 block"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(56, 189, 248, 0.5)" />
          <stop offset="100%" stopColor="rgba(56, 189, 248, 0.05)" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradientId})`} />
      <path d={pathD} fill="none" stroke="rgb(56, 189, 248)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const DynamicKPISection = ({ section, tagValues, kpiValues = {} }) => {
  const [chartType, setChartType] = useState('bar'); // 'bar' | 'pie' | 'doughnut'

  const getCardValue = (kpi) => {
    const sourceType = (kpi.source_type || '').toLowerCase();
    if (sourceType === 'tag') {
      return tagValues[kpi.tag_name] ?? null;
    }
    if (sourceType === 'formula') {
      if (kpi.kpi_id != null && kpi.kpi_id !== '') return kpiValues[kpi.kpi_id] ?? null;
      return kpiValues[kpi.card_label] ?? null;
    }
    return null;
  };

  const kpiCards = getKpiCards(section);
  const sortedCards = useMemo(
    () => [...kpiCards].sort((a, b) => (a.display_order || 0) - (b.display_order || 0)),
    [kpiCards]
  );

  const chartData = useMemo(() => {
    const getVal = (kpi) => {
      const st = (kpi.source_type || '').toLowerCase();
      if (st === 'tag') return tagValues[kpi.tag_name] ?? null;
      if (st === 'formula') {
        if (kpi.kpi_id != null && kpi.kpi_id !== '') return kpiValues[kpi.kpi_id] ?? null;
        return kpiValues[kpi.card_label] ?? null;
      }
      return null;
    };
    const labels = sortedCards.map((k) => k.card_label);
    const rawValues = sortedCards.map((k) => {
      const v = getVal(k);
      if (v === null || v === undefined) return 0;
      return typeof v === 'number' ? v : parseFloat(v) || 0;
    });
    // For pie/doughnut, use absolute values (avoid negative segments)
    const values = chartType === 'pie' || chartType === 'doughnut'
      ? rawValues.map((v) => Math.max(0, v))
      : rawValues;

    const colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
    const borderColors = labels.map((_, i) => CHART_BORDER_COLORS[i % CHART_BORDER_COLORS.length]);

    if (chartType === 'bar') {
      return {
        labels,
        datasets: [
          {
            label: 'Value',
            data: values,
            backgroundColor: colors,
            borderColor: borderColors,
            borderWidth: 1,
          },
        ],
      };
    }
    return {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: colors,
          borderColor: borderColors,
          borderWidth: 2,
        },
      ],
    };
  }, [sortedCards, tagValues, kpiValues, chartType]);

  const isDarkMode =
    typeof document !== 'undefined' &&
    (document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const textColor = isDarkMode ? '#e5e7eb' : '#374151';
  const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)';

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        callbacks: {
          label: (ctx) => {
            const kpi = sortedCards[ctx.dataIndex];
            const unit = kpi?.unit ? ` ${kpi.unit}` : '';
            const decimals = kpi?.decimals ?? 2;
            const value = typeof ctx.raw === 'number' ? ctx.raw.toFixed(decimals) : ctx.raw;
            return `${value}${unit}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: textColor, maxRotation: 45, minRotation: 0, font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: gridColor },
        ticks: { color: textColor, font: { size: 11 } },
      },
    },
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: { color: textColor, padding: 12, usePointStyle: true, font: { size: 11 } },
      },
      tooltip: {
        backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total ? ((ctx.raw / total) * 100).toFixed(1) : 0;
            const kpi = sortedCards[ctx.dataIndex];
            const unit = kpi?.unit ? ` ${kpi.unit}` : '';
            const decimals = kpi?.decimals ?? 2;
            const value = typeof ctx.raw === 'number' ? ctx.raw.toFixed(decimals) : ctx.raw;
            return `${ctx.label}: ${value}${unit} (${pct}%)`;
          },
        },
      },
    },
  };

  if (sortedCards.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-base">
        No KPI cards configured for this section.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI cards – each with title, value, accent bar, mini Live value chart */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sortedCards.map((kpi) => {
          const value = getCardValue(kpi);
          const decimals = kpi.decimals ?? 2;
          const unit = kpi.unit ? ` ${kpi.unit}` : '';
          const display =
            value === null || value === undefined
              ? '–'
              : typeof value === 'number'
              ? value.toFixed(decimals) + unit
              : `${value}${unit}`;
          const valueColor = getValueColor(value);
          const accentColor = getAccentColor(value);
          return (
            <div
              key={kpi.id}
              className="relative rounded-lg overflow-hidden bg-white dark:bg-[#131b2d] border border-gray-200 dark:border-gray-700 shadow-lg"
            >
              {/* Left accent bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentColor}`} />
              <div className="pl-4 pr-4 pt-4 pb-3 w-full min-w-0">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white/90 truncate">{kpi.card_label}</h3>
                <div className={`text-2xl font-bold mt-1 tabular-nums w-full ${valueColor}`}>
                  {display}
                </div>
                <div className="mt-3 flex flex-col items-stretch w-full min-w-0">
                  <div className="w-full min-w-0" style={{ height: 40 }}>
                    <MiniLiveChart gradientId={`kpi-mini-${kpi.id}`} value={typeof value === 'number' ? value : parseFloat(value) || 0} width={140} height={40} />
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">Live value</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Chart type selector + Bar/Pie/Doughnut – unchanged */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Chart type:</span>
        <div className="flex gap-2">
          {[
            { value: 'bar', label: 'Bar chart' },
            { value: 'pie', label: 'Pie chart' },
            { value: 'doughnut', label: 'Doughnut' },
          ].map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setChartType(value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                chartType === value
                  ? 'bg-brand text-white shadow'
                  : 'bg-gray-200 dark:bg-[#081320] text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-[#131b2d]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#121e2c] p-4"
        style={{ height: '380px' }}
      >
        {chartType === 'bar' && (
          <Bar data={chartData} options={barOptions} />
        )}
        {chartType === 'pie' && (
          <Pie data={chartData} options={pieOptions} />
        )}
        {chartType === 'doughnut' && (
          <Doughnut data={chartData} options={pieOptions} />
        )}
      </div>
    </div>
  );
};

export default DynamicKPISection;
