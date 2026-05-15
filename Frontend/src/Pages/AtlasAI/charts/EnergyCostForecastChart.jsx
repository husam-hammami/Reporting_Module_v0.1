/**
 * Forecast tab — energy cost per ton chart.
 * Last 24h actual (cyan) + 12h dashed forecast (green) with band.
 */

import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Filler);

const ACTUAL = '#7df9ff';
const FORECAST = '#34d399';
const BAND = 'rgba(52, 211, 153, 0.12)';
const SURFACE = '#0c1322';
const GRID = 'rgba(125, 249, 255, 0.08)';
const TICK = 'rgba(244, 249, 255, 0.42)';
const TITLE_CLR = 'rgba(244, 249, 255, 0.62)';
const TOOLTIP_TEXT = '#f4f9ff';

export default function EnergyCostForecastChart({ series }) {
  const data = useMemo(() => {
    const actual = series.history_24h.map((p) => ({ x: p.t, y: p.v }));
    const lastActual = actual[actual.length - 1];
    const forecast = [
      { x: 0, y: lastActual.y },
      ...series.forecast_12h.map((p) => ({ x: p.t, y: p.v })),
    ];
    const bandHi = [
      { x: 0, y: lastActual.y },
      ...series.forecast_12h.map((p) => ({ x: p.t, y: p.hi })),
    ];
    const bandLo = [
      { x: 0, y: lastActual.y },
      ...series.forecast_12h.map((p) => ({ x: p.t, y: p.lo })),
    ];

    return {
      datasets: [
        {
          label: 'forecast-hi',
          data: bandHi,
          borderColor: 'transparent',
          backgroundColor: BAND,
          pointRadius: 0,
          fill: '+1',
          order: 4,
          tension: 0.3,
        },
        {
          label: 'forecast-lo',
          data: bandLo,
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          pointRadius: 0,
          fill: false,
          order: 3,
          tension: 0.3,
        },
        {
          label: 'Forecast',
          data: forecast,
          borderColor: FORECAST,
          backgroundColor: FORECAST,
          borderWidth: 2.4,
          borderDash: [6, 5],
          pointRadius: (ctx) => (ctx.dataIndex === forecast.length - 1 ? 4.5 : 0),
          pointBackgroundColor: FORECAST,
          pointBorderColor: SURFACE,
          pointBorderWidth: 2,
          tension: 0.3,
          order: 2,
        },
        {
          label: 'Actual',
          data: actual,
          borderColor: ACTUAL,
          backgroundColor: ACTUAL,
          borderWidth: 2.4,
          pointRadius: (ctx) => (ctx.dataIndex === actual.length - 1 ? 4.5 : 0),
          pointBackgroundColor: ACTUAL,
          pointBorderColor: SURFACE,
          pointBorderWidth: 2,
          tension: 0.3,
          order: 1,
        },
      ],
    };
  }, [series]);

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: SURFACE,
        borderColor: GRID,
        borderWidth: 1,
        titleColor: TOOLTIP_TEXT,
        bodyColor: TITLE_CLR,
        padding: 8,
        filter: (item) => !['forecast-hi', 'forecast-lo'].includes(item.dataset.label),
        callbacks: {
          title: (items) => {
            const t = items[0].parsed.x;
            if (t === 0) return 'Now';
            if (t < 0) return `${Math.abs(t)}h ago`;
            return `+${t}h`;
          },
          label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(2)} OMR/t`,
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        min: -24,
        max: 12,
        ticks: {
          color: TICK,
          font: { size: 10 },
          stepSize: 6,
          callback: (v) => {
            if (v === 0) return 'Now';
            return v < 0 ? `−${Math.abs(v)}h` : `+${v}h`;
          },
        },
        grid: { display: false },
        border: { color: GRID },
      },
      y: {
        min: 1.2,
        max: 1.65,
        ticks: {
          color: TICK,
          font: { size: 10 },
          stepSize: 0.1,
          callback: (v) => v.toFixed(2),
        },
        grid: { color: GRID, drawTicks: false },
        border: { display: false },
        title: {
          display: true,
          text: 'OMR / TON',
          color: TITLE_CLR,
          font: { size: 9, weight: 600 },
        },
      },
    },
    elements: { line: { capBezierPoints: false } },
  }), []);

  return (
    <div className="fc-chart-canvas">
      <Line data={data} options={options} />
    </div>
  );
}
