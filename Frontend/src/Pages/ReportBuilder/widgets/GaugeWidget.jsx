import { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { VALUE_FONT_SIZES, TITLE_FONT_SIZES } from './widgetDefaults';

export default function GaugeWidget({ config, tagValues }) {
  const tagName = config.dataSource?.tagName ?? config.tagName;
  const value = tagValues?.[tagName];
  const numValue = value != null ? Number(value) : 0;
  const min = config.min ?? 0;
  const max = config.max ?? 100;
  const range = max - min || 1;
  const percent = Math.max(0, Math.min(1, (numValue - min) / range));
  const clampedForDisplay = Math.max(min, Math.min(max, numValue));
  const displayValue = value != null ? clampedForDisplay.toLocaleString(undefined, { maximumFractionDigits: config.decimals ?? 0 }) : '—';

  // Arc: 180° semi-circle, needle rotates from -180° (left) to 0° (right)
  const startAngle = -180;
  const endAngle = 0;

  // Zones with optional status labels
  const zones = config.zones || [
    { from: 0, to: 40, color: '#ef5350', status: 'LOW' },
    { from: 40, to: 70, color: '#ff9900', status: 'CAUTION' },
    { from: 70, to: 100, color: '#00e676', status: 'OPTIMAL' },
  ];

  const fallbackColor = config.color || '#00BFFF';
  const { activeColor, statusLabel } = useMemo(() => {
    const percentVal = percent * 100;
    for (const z of zones) {
      if (percentVal >= z.from && percentVal <= z.to) {
        return { activeColor: z.color, statusLabel: z.status ?? 'OK' };
      }
    }
    return { activeColor: fallbackColor, statusLabel: 'OK' };
  }, [percent, zones, fallbackColor]);

  function describeArc(cx, cy, r, startDeg, endDeg) {
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const largeArc = endDeg - startDeg > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
  }

  const cx = 64;
  const cy = 56;
  const r = 40;
  const needleLen = r - 6;
  const tickCount = 11;
  const trend = config.trend != null ? config.trend : null;
  const needleRotation = -90 + percent * 180;
  const unit = config.unit || '';
  const valueWithUnit = unit ? `${displayValue} ${unit}`.trim() : displayValue;

  const showTitle = config.showTitle !== false;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;
  const valueFontSize = VALUE_FONT_SIZES[config.valueFontSize];

  return (
    <div className={`flex flex-col h-full min-h-0 overflow-hidden ${config.showCard !== false ? 'rounded-xl bg-[var(--rb-panel)] border border-[var(--rb-border)]' : ''}`}>
      {/* Header: title + icon | trend badge */}
      {showTitle && (
        <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <Gauge size={14} className="flex-shrink-0 text-gray-600 dark:text-white/90" />
            <span
              className="font-medium truncate min-w-0 text-gray-800 dark:text-white"
              title={config.title || 'Gauge'}
              style={{ fontSize: `calc(${titleFontSize} + 4px)`, minWidth: '3rem' }}
            >
              {config.title || 'Gauge'}
            </span>
          </div>
          {trend != null && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-[#5a6b8a]/60 text-blue-700 dark:text-white flex-shrink-0">
              {trend > 0 ? '+' : ''}{trend}%
            </span>
          )}
        </div>
      )}

      {/* Gauge SVG */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-2">
        <svg viewBox="0 0 128 88" className="w-full max-w-[140px] flex-shrink-0">
          <defs />

          {/* Track arc (full range) */}
          <path
            d={describeArc(cx, cy, r, startAngle, endAngle)}
            fill="none"
            className="stroke-gray-300 dark:stroke-gray-600"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* Tick marks */}
          {Array.from({ length: tickCount }).map((_, i) => {
            const t = i / (tickCount - 1);
            const deg = startAngle + t * 180;
            const rad = (deg * Math.PI) / 180;
            const innerR = r - 4;
            const outerR = r + 2;
            const x1 = cx + innerR * Math.cos(rad);
            const y1 = cy + innerR * Math.sin(rad);
            const x2 = cx + outerR * Math.cos(rad);
            const y2 = cy + outerR * Math.sin(rad);
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-gray-400 dark:stroke-gray-500" strokeWidth="1.5" strokeLinecap="round" />
            );
          })}

          {/* Filled arc (zone color) */}
          {percent > 0.002 && (
            <path
              d={describeArc(cx, cy, r, startAngle, startAngle + percent * 180)}
              fill="none"
              stroke={activeColor === '#00e676' || activeColor === '#10b981' ? '#00BFFF' : activeColor}
              strokeWidth="10"
              strokeLinecap="round"
              style={{ transition: 'stroke 0.3s ease-out' }}
            />
          )}

          {/* Center hub (pivot) */}
          <circle cx={cx} cy={cy} r="5" className="fill-gray-800 stroke-gray-500 dark:fill-[#0f172a] dark:stroke-[#334155]" strokeWidth="1" />

          {/* Needle */}
          <g transform={`rotate(${needleRotation} ${cx} ${cy})`}>
            <line
              x1={cx}
              y1={cy}
              x2={cx + needleLen * Math.cos((-90 * Math.PI) / 180)}
              y2={cy + needleLen * Math.sin((-90 * Math.PI) / 180)}
              className="stroke-gray-700 dark:stroke-white/90"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>

        </svg>

        {/* Value with unit inline + status below gauge */}
        <div className="flex flex-col items-center justify-center mt-0 pt-0.5 pb-2 flex-shrink-0">
          <span
            className={`font-bold tabular-nums leading-none text-gray-900 dark:text-white ${!valueFontSize ? 'text-xl' : ''}`}
            style={valueFontSize ? { fontSize: valueFontSize } : undefined}
          >
            {valueWithUnit}
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wider mt-1 text-gray-600 dark:text-white/80">
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
