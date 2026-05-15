/**
 * Forecast tab mock snapshot.
 *
 * Shape mirrors Plan 17 §7.3 so live wiring in Phase 2 is a swap, not a
 * rewrite. Numbers are derived to be internally consistent: the chart series
 * lands on the hero values (today_tons, predicted_eod_tons, current_omr_per_t).
 *
 * Phase 2 will replace this with GET /api/hercules-ai/mill-b-snapshot.
 */

const NOW_H = 14.53;
const NOW_TONS = 68.4;
const PRED_EOD_TONS = 108;
const PLAN_TONS = 102;

function buildHourlyTons() {
  const today = [];
  let total = 0;
  for (let h = 0; h <= 24; h += 1) {
    let rate = 0;
    if (h >= 6 && h < 11) rate = 7.4;
    else if (h >= 11 && h < 12) rate = 3.5;
    else if (h >= 12 && h < 15) rate = 7.4;
    if (h <= Math.floor(NOW_H)) {
      total += rate;
      today.push({ h, tons: Number(total.toFixed(2)) });
    }
  }
  return today;
}

function buildForecastTons(actualNow) {
  const fc = [{ h: NOW_H, tons: actualNow, lo: actualNow, hi: actualNow }];
  const remainingTons = PRED_EOD_TONS - actualNow;
  const remainingHours = 22 - NOW_H;
  const fcRate = remainingTons / remainingHours;
  let total = actualNow;
  for (let h = Math.ceil(NOW_H); h <= 24; h += 1) {
    const prev = fc[fc.length - 1];
    const dh = h - prev.h;
    const rate = h <= 22 ? fcRate : 0;
    total += rate * dh;
    const horizonH = h - NOW_H;
    const bandFrac = 0.012 * horizonH;
    fc.push({
      h,
      tons: Number(total.toFixed(2)),
      lo: Number((total * (1 - bandFrac) - 1).toFixed(2)),
      hi: Number((total * (1 + bandFrac) + 1).toFixed(2)),
    });
  }
  return fc;
}

const todayHourly = buildHourlyTons();
const todayHourlyExt = [
  ...todayHourly,
  { h: NOW_H, tons: NOW_TONS },
];
const forecastHourly = buildForecastTons(NOW_TONS);

const costHistory24h = [
  1.45, 1.44, 1.43, 1.42, 1.41, 1.40,
  1.41, 1.43, 1.48, 1.52, 1.55, 1.53,
  1.50, 1.48, 1.46, 1.45, 1.44, 1.43,
  1.42, 1.41, 1.40, 1.41, 1.42, 1.42,
].map((v, i) => ({ t: -24 + i, v }));

const costForecast12h = [
  1.41, 1.39, 1.37, 1.34, 1.32, 1.31,
  1.30, 1.30, 1.31, 1.32, 1.34, 1.36,
].map((v, i) => {
  const horizon = i + 1;
  const band = 0.02 + i * 0.004;
  return { t: horizon, v, lo: v - band, hi: v + band };
});

export const forecastMock = {
  status: {
    online: true,
    plant_label: 'Salalah Mill B',
    last_update_iso: new Date().toISOString(),
  },

  production: {
    today_tons: NOW_TONS,
    predicted_eod_tons: PRED_EOD_TONS,
    plan_tons: PLAN_TONS,
    delta_vs_plan_tons: PRED_EOD_TONS - PLAN_TONS,
    pace_t_per_h: 6.66,
    confidence_pct: 82,
  },

  energy_cost_per_ton: {
    current_omr_per_t: 1.42,
    predicted_next_shift_omr_per_t: 1.31,
    savings_omr_8h: 12,
    history_24h: costHistory24h,
    forecast_12h: costForecast12h,
  },

  production_series: {
    now_h: NOW_H,
    today_hourly: todayHourlyExt,
    forecast_hourly: forecastHourly,
  },

  verdict: {
    text:
      'On track for {gold:108 tons} of flour today — {good:6 tons above plan}. ' +
      'Energy cost per ton will ease {good:0.11 OMR ↓} overnight as ambient temperature drops. ' +
      '{hi:One thing to watch:} bearing on RS-3.',
    severity: 'ok',
    cached: false,
  },

  kpis: [
    {
      key: 'pace',
      label: 'Pace',
      value: 6.66,
      unit: 'tons/hour',
      status: 'good',
      statusLabel: 'On track',
      message: 'Plan {b:6.30}. Ahead by {b:5.7%}.',
      precision: 2,
    },
    {
      key: 'yield',
      label: 'Yield',
      value: 72.4,
      unit: '% flour',
      status: 'good',
      statusLabel: 'Excellent',
      message: 'Best recent run: {b:73.5%}. Within 1 point.',
      precision: 1,
    },
    {
      key: 'energy',
      label: 'Energy',
      value: 376,
      unit: 'kW',
      status: 'warn',
      statusLabel: 'Slightly high',
      message: 'SEC {b:56.7 kWh/t} — 2.6% below 7-day average.',
      precision: 0,
    },
    {
      key: 'maintenance',
      label: 'Maintenance',
      value: 96,
      unit: '% healthy',
      status: 'warn',
      statusLabel: '1 watch',
      message: 'Bearing on {b:RS-3} — schedule inspection.',
      precision: 0,
    },
  ],
};
