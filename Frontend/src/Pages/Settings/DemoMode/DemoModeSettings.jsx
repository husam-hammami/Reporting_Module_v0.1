import React from 'react';
import { FaBolt, FaPlay, FaPause, FaClock } from 'react-icons/fa';
import { useEmulator } from '../../../Context/EmulatorContext';

const INTERVAL_OPTIONS = [
  { value: 500,  label: '0.5s' },
  { value: 1000, label: '1s' },
  { value: 2000, label: '2s' },
  { value: 5000, label: '5s' },
];

export default function DemoModeSettings() {
  const { enabled, toggle, interval, setIntervalMs, tagValues, tick } = useEmulator();
  const tagEntries = Object.entries(tagValues).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="p-4 space-y-3">
      {/* ── Status + Controls row ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
            enabled ? 'bg-[#059669]/10' : 'bg-[#8898aa]/10'
          }`}>
            <FaBolt className={enabled ? 'text-[#059669]' : 'text-[#8898aa]'} size={12} />
          </div>
          <div>
            <span className="text-[12px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">
              Tag Emulator {enabled ? '— Running' : '— Stopped'}
            </span>
            <p className="text-[9px] text-[#8898aa]">
              {enabled
                ? `Generating values every ${interval / 1000}s · tick #${tick} · ${tagEntries.length} tags`
                : 'Enable to simulate PLC tag values in the browser'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Interval pills — only show when running */}
          {enabled && (
            <div className="flex items-center gap-1 mr-2">
              <FaClock className="text-[#8898aa]" size={9} />
              {INTERVAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setIntervalMs(opt.value)}
                  className={`px-2 py-0.5 text-[9px] font-medium rounded transition-colors ${
                    interval === opt.value
                      ? 'bg-brand/15 text-brand border border-brand/30'
                      : 'text-[#6b7f94] hover:text-[#3a4a5c] border border-transparent hover:border-[#e3e9f0] dark:hover:border-[#1e2d40]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={toggle}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-md transition-colors ${
              enabled
                ? 'bg-[#dc2626] hover:bg-[#b91c1c] text-white'
                : 'bg-[#059669] hover:bg-[#047857] text-white'
            }`}
          >
            {enabled ? <><FaPause size={9} /> Stop</> : <><FaPlay size={9} /> Start</>}
          </button>
        </div>
      </div>

      {/* ── Live tag values table ── */}
      {enabled && tagEntries.length > 0 && (
        <div className="border border-[#e3e9f0] dark:border-[#1e2d40] rounded-md overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-[#f5f8fb] dark:bg-[#0d1825]">
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-[#6b7f94] uppercase tracking-wide">Tag</th>
                <th className="px-3 py-1.5 text-right text-[10px] font-semibold text-[#6b7f94] uppercase tracking-wide w-24">Value</th>
                <th className="px-3 py-1.5 text-left text-[10px] font-semibold text-[#6b7f94] uppercase tracking-wide w-20">Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e9f0] dark:divide-[#1e2d40]">
              {tagEntries.map(([name, value]) => (
                <tr key={name} className="hover:bg-[#f9fbfd] dark:hover:bg-[#111d2e] transition-colors">
                  <td className="px-3 py-1 font-medium text-[#2a3545] dark:text-[#e1e8f0]">{name}</td>
                  <td className="px-3 py-1 text-right font-mono text-[#059669] dark:text-[#34d399]">
                    {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value)}
                  </td>
                  <td className="px-3 py-1">
                    <div className="w-14 h-2 bg-[#f0f5fa] dark:bg-[#0d1825] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(5, (typeof value === 'number' ? Math.abs(value) % 100 : 50)))}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
