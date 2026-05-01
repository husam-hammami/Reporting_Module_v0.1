/**
 * Energy cost per ton — last 24h actual + 12h forecast (OMR / ton).
 * Solid blue (info) up to NOW, dashed green forecast forward with band.
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

export default function EnergyCostChart({ series }) {
  const tokens = useTokenColors();

  const data = useMemo(() => {
    const infoClr = tokens['--hai-status-info-600'] || '#3E82D8';
    const okClr = tokens['--hai-status-ok-600'] || '#2E9E6A';
    const bandClr = tokens['--hai-forecast-band'] || 'rgba(46,158,106,0.12)';
    const surface = tokens['--hai-surface-100'] || '#111827';

    const actual = series.history_24h.map((p) => ({ x: p.t, y: p.v }));
    // Connect actual to forecast at NOW (t = 0)
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
          borderColor: infoClr,
          backgroundColor: infoClr,
          borderWidth: 2.4,
          pointRadius: (ctx) => (ctx.dataIndex === actual.length - 1 ? 4.5 : 0),
          pointBackgroundColor: infoClr,
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
            color: muted,
            font: { size: 10 },
            stepSize: 6,
            callback: (v) => {
              if (v === 0) return 'Now';
              return v < 0 ? `−${Math.abs(v)}h` : `+${v}h`;
            },
          },
          grid: { display: false },
          border: { color: gridStroke },
        },
        y: {
          min: 1.2,
          max: 1.65,
          ticks: {
            color: muted,
            font: { size: 10 },
            stepSize: 0.1,
            callback: (v) => v.toFixed(2),
          },
          grid: { color: gridStroke, drawTicks: false },
          border: { display: false },
          title: {
            display: true,
            text: 'OMR / TON',
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
