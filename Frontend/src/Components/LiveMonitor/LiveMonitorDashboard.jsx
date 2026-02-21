import React from 'react';
import { FaBell, FaTint, FaThermometerHalf, FaWarehouse } from 'react-icons/fa';
import GaugeChart from '../charts/GaugeChart';

// Parse weight string to numeric value (e.g. "7.48 t/h" -> 7.48, "104826.0 kg" -> 104826)
function parseWeightValue(weightStr) {
  if (weightStr == null || typeof weightStr !== 'string') return 0;
  const num = parseFloat(weightStr.replace(/[^0-9.-]/g, '').trim());
  return Number.isNaN(num) ? 0 : num;
}

// Progress bar for capacity / weight
function ProgressBar({ value, max = 100, label, valueLabel, color = 'blue' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const colorClass =
    color === 'green'
      ? 'bg-emerald-500'
      : color === 'orange'
      ? 'bg-amber-500'
      : 'bg-sky-500';
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-500 mb-1">
          <span>{label}</span>
          {valueLabel != null && <span>{valueLabel}</span>}
        </div>
      )}
      <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${colorClass} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// Status card: "Demo - no order", type, Status: Stopped/Running
export function StatusCard({ batchName = 'Demo - no order', type, lineRunning }) {
  return (
    <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-gray-100 dark:bg-[#131b2d] border border-gray-200 dark:border-gray-700 mb-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
          <FaBell className="text-lg" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{batchName}</h2>
          <p className="text-sm text-brand dark:text-cyan-400">{type}</p>
        </div>
      </div>
      <p
        className={`text-sm font-medium ${
          lineRunning ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
        }`}
      >
        Status: {lineRunning ? 'Running' : 'Stopped'}
      </p>
    </div>
  );
}

// Sender panel: silo icon, product/flow text, progress bar, circular gauge
export function SenderPanel({ senderRows = [], flowRateCapacity = 20, noOrderLabel = 'No order configured' }) {
  const totalFlow = senderRows.reduce((sum, row) => {
    const v = parseWeightValue(row.weight);
    return sum + (Number.isNaN(v) ? 0 : v);
  }, 0);
  const hasOrder = senderRows.length > 0;
  const productLabel = hasOrder
    ? senderRows.map((r) => r.product).filter(Boolean).join(', ') || '—'
    : 'FCL no order';
  const flowPct = flowRateCapacity > 0 ? Math.min(100, (totalFlow / flowRateCapacity) * 100) : 0;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#131b2d] p-5 mb-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <FaWarehouse className="text-brand dark:text-cyan-400" /> Sender
      </h3>
      <div className="flex flex-col md:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{productLabel}</p>
          <p className="text-sm mt-1 text-gray-700 dark:text-gray-300">
            Product flow rate is{' '}
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {totalFlow.toFixed(1)} t/h
            </span>
          </p>
          {!hasOrder && (
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{noOrderLabel}</p>
          )}
          <div className="mt-3 max-w-xs">
            <ProgressBar
              value={totalFlow}
              max={flowRateCapacity}
              label="Flow rate capacity"
              valueLabel={`${flowRateCapacity} t/h`}
              color={totalFlow > 0 ? 'green' : 'blue'}
            />
          </div>
        </div>
        <div className="flex-shrink-0">
          <div className="flex flex-col items-center">
            <div className="text-center text-xs text-gray-500 dark:text-gray-500 mb-1">
              {totalFlow.toFixed(1)} / {flowRateCapacity}
            </div>
            <GaugeChart
              value={flowPct}
              label="Flow"
              color={totalFlow > 0 ? 'green' : 'blue'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Receiver panel: list of cards with ID, Product, Location, progress bar for weight
export function ReceiverPanel({ receiverRows = [] }) {
  const getWeightMax = (weightStr) => {
    const num = parseWeightValue(weightStr);
    if (weightStr && String(weightStr).toLowerCase().includes('kg')) return Math.max(num * 1.2, 100000);
    return Math.max(num * 1.2, 20);
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#131b2d] p-5">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Receiver</h3>
      <div className="space-y-4">
        {receiverRows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-500">No receiver data</p>
        ) : (
          receiverRows.map((row, idx) => {
            const numVal = parseWeightValue(row.weight);
            const maxVal = getWeightMax(row.weight);
            const pct = maxVal > 0 ? Math.min(100, (numVal / maxVal) * 100) : 0;
            return (
              <div
                key={idx}
                className="p-4 rounded-lg bg-gray-50 dark:bg-[#0b111e] border border-gray-200 dark:border-gray-700"
              >
                <p className="text-sm font-medium text-brand dark:text-cyan-400">
                  ID {row.id}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700 dark:text-gray-300 mt-1">
                  {row.product && <span>{row.product}</span>}
                  {row.location && <span>{row.location}</span>}
                </div>
                <div className="mt-3">
                  <ProgressBar
                    value={numVal}
                    max={maxVal}
                    label="Actual weight"
                    valueLabel={row.weight}
                    color="green"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Setpoints panel: circular gauges with icons (Flowrate, Moisture Setpoint, Moisture Offset) or generic list
export function SetpointsPanel({ setpoints = [] }) {
  const flowItem = setpoints.find((s) => (s.id || '').toLowerCase().includes('flow'));
  const moistureSetpoint = setpoints.find((s) =>
    (String(s.id || '').toLowerCase().includes('moisture') && String(s.id || '').toLowerCase().includes('setpoint'))
  );
  const moistureOffset = setpoints.find((s) =>
    (String(s.id || '').toLowerCase().includes('moisture') && String(s.id || '').toLowerCase().includes('offset'))
  );

  const toNum = (v) => (v === '' || v == null ? 0 : parseFloat(v) || 0);
  const flowVal = toNum(flowItem?.value);
  const flowPct = Math.min(100, (flowVal / 20) * 100);
  const moistSetVal = toNum(moistureSetpoint?.value);
  const moistSetPct = Math.min(100, (moistSetVal / 20) * 100);
  const moistOffVal = toNum(moistureOffset?.value);
  const moistOffPct = Math.min(100, (moistOffVal / 20) * 100);

  const hasStandardSetpoints = flowItem != null || moistureSetpoint != null || moistureOffset != null;
  const standardItems = [
    { id: 'Flowrate', label: 'Flowrate', value: flowVal, display: `${flowVal.toFixed(1)} T/h`, pct: flowPct, Icon: FaTint },
    { id: 'Moisture Setpoint', label: 'Moisture Setpoint', value: moistSetVal, display: String(moistSetVal), pct: moistSetPct, Icon: FaThermometerHalf },
    { id: 'Moisture Offset', label: 'Moisture Offset', value: moistOffVal, display: String(moistOffVal), pct: moistOffPct, Icon: FaThermometerHalf },
  ];

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#131b2d] p-5">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Setpoints</h3>
      {hasStandardSetpoints ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {standardItems.map(({ id, label, display, pct, Icon }) => (
            <div
              key={id}
              className="flex flex-col items-center p-4 rounded-lg bg-gray-50 dark:bg-[#0b111e] border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <Icon className="text-lg" />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">{display}</p>
              <GaugeChart value={pct} label={label} color="green" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {setpoints.slice(0, 8).map((sp, idx) => {
            const numVal = toNum(sp.value);
            const pct = Math.min(100, numVal);
            const display = sp.value != null && sp.value !== '' ? String(sp.value) : '—';
            return (
              <div
                key={sp.id || idx}
                className="flex flex-col items-center p-3 rounded-lg bg-gray-50 dark:bg-[#0b111e] border border-gray-200 dark:border-gray-700"
              >
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400 text-center">{sp.id}</span>
                <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-1">{display}</p>
                {typeof numVal === 'number' && !Number.isNaN(numVal) && (
                  <div className="w-full mt-2">
                    <GaugeChart value={pct} label={sp.id} color="blue" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Main dashboard layout: status card, two columns (Sender+Receiver | Setpoints)
export default function LiveMonitorDashboard({
  batchName,
  type,
  lineRunning,
  senderRows = [],
  receiverRows = [],
  setpoints = [],
  flowRateCapacity = 20,
  noOrderLabel = 'No order configured',
}) {
  return (
    <div className="space-y-4">
      <StatusCard batchName={batchName} type={type} lineRunning={lineRunning} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <SenderPanel
            senderRows={senderRows}
            flowRateCapacity={flowRateCapacity}
            noOrderLabel={noOrderLabel}
          />
          <ReceiverPanel receiverRows={receiverRows} />
        </div>
        <div className="lg:col-span-1">
          <SetpointsPanel setpoints={setpoints} />
        </div>
      </div>
    </div>
  );
}
