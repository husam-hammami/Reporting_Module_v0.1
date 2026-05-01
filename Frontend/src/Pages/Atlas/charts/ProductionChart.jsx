/**
 * Production cumulative-tons chart.
 *
 * Solid line up to NOW (gold), dashed forecast to 24:00 (green) with a
 * confidence band (translucent green fill between hi/lo). Token-bound so
 * theme flips cleanly.
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
import { useTokenColors } from './useTokenColors';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Filler);

export default function ProductionChart({ series }) {
  const tokens = useTokenColors();

  const data = useMemo(() => {
    const moneyClr = tokens['--hai-money'] || '#f0b54f';
    const okClr = tokens['--hai-status-ok-600'] || '#2E9E6A';
    const bandClr = tokens['--hai-forecast-band'] || 'rgba(46,158,106,0.12)';
    const surface = tokens['--hai-surface-100'] || '#111827';

    const actual = series.today_hourly.map((p) => ({ x: p.h, y: p.tons }));
    const forecast = series.forecast_hourly.map((p) => ({ x: p.h, y: p.tons }));
    const bandHi = series.forecast_hourly.map((p) => ({ x: p.h, y: p.hi }));
    const bandLo = series.forecast_hourly.map((p) => ({ x: p.h, y: p.lo }));

    return {
      datasets: [
        // Confidence band — drawn first so lines render on top
        {
          label: 'forecast-hi',
          data: bandHi,
          borderColor: 'transparent',
          backgroundColor: bandClr,
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
          borderColor: okClr,
          backgroundColor: okClr,
          borderWidth: 2.4,
          borderDash: [6, 5],
          pointRadius: (ctx) => (ctx.dataIndex === forecast.length - 1 ? 4.5 : 0),
          pointBackgroundColor: okClr,
          pointBorderColor: surface,
          pointBorderWidth: 2,
          tension: 0.25,
          order: 2,
        },
        {
          label: 'Actual',
          data: actual,
          borderColor: moneyClr,
          backgroundColor: moneyClr,
          borderWidth: 2.4,
          pointRadius: (ctx) => (ctx.dataIndex === actual.length - 1 ? 4.5 : 0),
          pointBackgroundColor: moneyClr,
          pointBorderColor: surface,
          pointBorderWidth: 2,
          tension: 0.25,
          order: 1,
        },
      ],
    };
  }, [series, tokens]);

  const options = useMemo(() => {
    const muted = tokens['--hai-text-disabled'] || '#334155';
    const tertiary = tokens['--hai-text-tertiary'] || '#556677';
    const gridStroke = tokens['--hai-surface-border'] || '#1e293b';
    const surface = tokens['--hai-surface-100'] || '#111827';
    const primary = tokens['--hai-text-primary'] || '#f0f4f8';

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: surface,
          borderColor: gridStroke,
          borderWidth: 1,
          titleColor: primary,
          bodyColor: tertiary,
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
            color: muted,
            font: { size: 10 },
            stepSize: 6,
            callback: (v) => `${String(v).padStart(2, '0')}:00`,
          },
          grid: { display: false },
          border: { color: gridStroke },
        },
        y: {
          min: 0,
          max: 120,
          ticks: {
            color: muted,
            font: { size: 10 },
            stepSize: 30,
          },
          grid: { color: gridStroke, drawTicks: false },
          border: { display: false },
          title: {
            display: true,
            text: 'TONS',
            color: tertiary,
            font: { size: 9, weight: 600 },
          },
        },
      },
      elements: { line: { capBezierPoints: false } },
    };
  }, [tokens]);

  return (
    <div className="atlas-chart-canvas">
      <Line data={data} options={options} />
    </div>
  );
}
