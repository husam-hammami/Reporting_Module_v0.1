import { useMemo, useState, useRef, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useThumbnailCapture } from '../ThumbnailCaptureContext';
import { VALUE_FONT_SIZES, TITLE_FONT_SIZES } from './widgetDefaults';

function useAnimatedValue(target, skipAnimation) {
  const [current, setCurrent] = useState(target);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(target);

  useEffect(() => {
    if (skipAnimation) { setCurrent(target); return; }
    const from = fromRef.current;
    const diff = target - from;
    if (Math.abs(diff) < 0.0001) { setCurrent(target); return; }
    const duration = 380;
    startRef.current = performance.now();
    const animate = (now) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      const eased = t < 1 ? 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.04 * (1 - t) : 1;
      setCurrent(from + diff * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, skipAnimation]);

  useEffect(() => { fromRef.current = current; }, [current]);
  return current;
}

export default function GaugeWidget({ config, tagValues }) {
  const prefersReducedMotion = useReducedMotion();
  const isCapturing = useThumbnailCapture();
  const skipAnimation = prefersReducedMotion || isCapturing;

  const tagName = config.dataSource?.tagName ?? config.tagName;
  const value = tagValues?.[tagName];
  const numValue = value != null ? Number(value) : 0;
  const min = config.min ?? 0;
  const max = config.max ?? 100;
  const range = max - min || 1;
  const percent = Math.max(0, Math.min(1, (numValue - min) / range));
  const clampedForDisplay = Math.max(min, Math.min(max, numValue));
  const displayValue = value != null ? clampedForDisplay.toLocaleString(undefined, { maximumFractionDigits: config.decimals ?? 0 }) : '—';

  const startAngle = -180;
  const endAngle = 0;

  const zones = config.zones || [
    { from: 0, to: 40, color: '#ef5350', status: 'LOW' },
    { from: 40, to: 70, color: '#ff9900', status: 'CAUTION' },
    { from: 70, to: 100, color: '#00e676', status: 'OPTIMAL' },
  ];

  const fallbackColor = config.color || '#2563eb';
  const { activeColor, statusLabel } = useMemo(() => {
    const percentVal = percent * 100;
    for (const z of zones) {
      if (percentVal >= z.from && percentVal <= z.to) {
        return { activeColor: z.color, statusLabel: z.status ?? 'OK' };
      }
    }
    return { activeColor: fallbackColor, statusLabel: 'OK' };
  }, [percent, zones, fallbackColor]);

  const gradientId = useMemo(() => `gauge-grad-${Math.random().toString(36).slice(2, 9)}`, []);
  const glowFilterId = useMemo(() => `gauge-glow-${Math.random().toString(36).slice(2, 9)}`, []);
  const bgTrackId = useMemo(() => `gauge-bg-${Math.random().toString(36).slice(2, 9)}`, []);

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

  function pointOnArc(cx, cy, r, deg) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const cx = 64;
  const cy = 58;
  const r = 42;
  const tickCount = 11;
  const trend = config.trend != null ? config.trend : null;
  const animatedPercent = useAnimatedValue(percent, skipAnimation);
  const unit = config.unit || '';
  const valueWithUnit = unit ? `${displayValue} ${unit}`.trim() : displayValue;

  const endpointAngle = startAngle + animatedPercent * 180;
  const endpoint = pointOnArc(cx, cy, r, endpointAngle);

  const showTitle = config.showTitle !== false;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;
  const valueFontSize = VALUE_FONT_SIZES[config.valueFontSize];

  const zoneGradientStops = useMemo(() => {
    if (!zones || zones.length === 0) return [];
    const sorted = [...zones].sort((a, b) => a.from - b.from);
    const stops = [];
    sorted.forEach((z) => {
      stops.push({ offset: `${z.from}%`, color: z.color });
      stops.push({ offset: `${z.to}%`, color: z.color });
    });
    return stops;
  }, [zones]);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ padding: '4px 6px' }}>
      {showTitle && (
        <div className="flex items-center justify-between gap-1 flex-shrink-0 mb-0.5">
          <span
            className="rb-widget-title truncate min-w-0 flex-1"
            title={config.title || 'Gauge'}
            style={{ fontSize: titleFontSize }}
          >
            {config.title || 'Gauge'}
          </span>
          {trend != null && (
            <span className="rb-badge flex-shrink-0" style={{ background: 'var(--rb-accent-subtle)', color: 'var(--rb-accent)' }}>
              {trend > 0 ? '+' : ''}{trend}%
            </span>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <svg viewBox="0 0 128 90" className="w-full flex-shrink" style={{ maxHeight: '70%' }}>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              {zoneGradientStops.map((stop, i) => (
                <stop key={i} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>

            <linearGradient id={bgTrackId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.15" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.08" />
            </linearGradient>

            <filter id={glowFilterId} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            d={describeArc(cx, cy, r, startAngle, endAngle)}
            fill="none"
            stroke="var(--rb-border, rgba(100,116,139,0.2))"
            strokeWidth="8"
            strokeLinecap="round"
            opacity="0.5"
          />

          {Array.from({ length: tickCount }).map((_, i) => {
            const t = i / (tickCount - 1);
            const deg = startAngle + t * 180;
            const rad = (deg * Math.PI) / 180;
            const isMajor = i === 0 || i === tickCount - 1 || i === Math.floor(tickCount / 2);
            const innerR = r - (isMajor ? 5 : 3);
            const outerR = r + (isMajor ? 3 : 2);
            const x1 = cx + innerR * Math.cos(rad);
            const y1 = cy + innerR * Math.sin(rad);
            const x2 = cx + outerR * Math.cos(rad);
            const y2 = cy + outerR * Math.sin(rad);
            return (
              <line
                key={i}
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="var(--rb-text-muted, #64748b)"
                strokeWidth={isMajor ? '1.2' : '0.7'}
                strokeLinecap="round"
                opacity={isMajor ? '0.5' : '0.3'}
              />
            );
          })}

          {animatedPercent > 0.002 && (
            <>
              <path
                d={describeArc(cx, cy, r, startAngle, endpointAngle)}
                fill="none"
                stroke={`url(#${gradientId})`}
                strokeWidth="8"
                strokeLinecap="round"
              />

              <circle
                cx={endpoint.x}
                cy={endpoint.y}
                r="5"
                fill={activeColor}
                stroke="var(--rb-panel, #111827)"
                strokeWidth="2"
              />
              <circle
                cx={endpoint.x}
                cy={endpoint.y}
                r="2"
                fill="white"
                opacity="0.9"
              />
            </>
          )}

          <text
            x={cx}
            y={cy + 10}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--rb-text, #e2e8f0)"
            style={{
              fontSize: valueFontSize || '16px',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.03em',
              fontFamily: 'inherit',
            }}
          >
            {valueWithUnit}
          </text>
        </svg>

        <div className="flex items-center gap-1.5 flex-shrink-0" style={{ marginTop: '-4px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: activeColor,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span
            className="rb-widget-title"
            style={{ color: activeColor }}
          >
            {statusLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
