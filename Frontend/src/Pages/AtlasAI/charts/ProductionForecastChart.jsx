/**
 * Forecast tab — production cumulative chart.
 *
 * Solid cyan up to NOW, dashed green forecast forward with translucent
 * confidence band. Atlas AI dark palette (no theme switch).
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

export default function ProductionForecastChart({ series }) {
  const data = useMemo(() => {
    const actual = series.today_hourly.map((p) => ({ x: p.h, y: p.tons }));
    const forecast = series.forecast_hourly.map((p) => ({ x: p.h, y: p.tons }));
    const bandHi = series.forecast_hourly.map((p) => ({ x: p.h, y: p.hi }));
    const bandLo = series.forecast_hourly.map((p) => ({ x: p.h, y: p.lo }));

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
          tension: 0.25,
        },
        {
          label: 'forecast-lo',
          data: bandLo,
          borderColor: 'transparent',
          backgroundColor: 'transparent',
          pointRadius: 0,
          fill: false,
          order: 3,
          tension: 0.25,
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
          tension: 0.25,
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
          tension: 0.25,
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
        displayColors: true,
        filter: (item) => !['forecast-hi', 'forecast-lo'].includes(item.dataset.label),
        callbacks: {
          title: (items) => `${String(items[0].parsed.x).padStart(2, '0')}:00`,
          label: (item) => `${item.dataset.label}: ${item.parsed.y.toFixed(1)} t`,
        },
      },
    },
    scales: {
      x: {
        type: 'linear',
        min: 0,
        max: 24,
        ticks: {
          color: TICK,
          font: { size: 10 },
          stepSize: 6,
          callback: (v) => `${String(v).padStart(2, '0')}:00`,
        },
        grid: { display: false },
        border: { color: GRID },
      },
      y: {
        min: 0,
        max: 120,
        ticks: {
          color: TICK,
          font: { size: 10 },
          stepSize: 30,
        },
        grid: { color: GRID, drawTicks: false },
        border: { display: false },
        title: {
          display: true,
          text: 'TONS',
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
