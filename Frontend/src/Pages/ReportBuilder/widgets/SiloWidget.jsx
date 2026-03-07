import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useThumbnailCapture } from '../ThumbnailCaptureContext';
import { evaluateFormula } from '../formulas/formulaEngine';
import { TITLE_FONT_SIZES } from './widgetDefaults';

function resolveValue(config, tagValues, key = 'dataSource') {
  const ds = config[key] || config.dataSource;
  if (!ds) return tagValues?.[config.tagName] ?? null;
  if (ds.type === 'formula' && ds.formula) return evaluateFormula(ds.formula, tagValues);
  if (ds.type === 'group' && ds.groupTags?.length) {
    const vals = ds.groupTags.map((t) => Number(tagValues?.[t]) || 0);
    if (vals.length === 0) return null;
    switch (ds.aggregation) {
      case 'sum': return vals.reduce((a, b) => a + b, 0);
      case 'min': return Math.min(...vals);
      case 'max': return Math.max(...vals);
      default: return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
  return tagValues?.[ds.tagName] ?? null;
}

function getZoneColor(percent, zones, defaultColor = '#3b82f6') {
  if (!Array.isArray(zones) || zones.length === 0) return defaultColor;
  const p = Math.max(0, Math.min(100, percent));
  for (const z of zones) {
    if (p >= z.from && p <= z.to) return z.color;
  }
  return defaultColor;
}

const DEFAULT_FILL_BLUE = '#3b82f6';

function useAnimatedValue(target, skipAnimation) {
  const [current, setCurrent] = useState(target);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(target);

  useEffect(() => {
    if (skipAnimation) { setCurrent(target); return; }
    const from = fromRef.current;
    const diff = target - from;
    if (Math.abs(diff) < 0.001) { setCurrent(target); return; }
    const duration = 380;
    startRef.current = performance.now();
    const animate = (now) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
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

function Silo2DSvg({ fillPercent, fillColor, skipAnimation }) {
  const fillRatio = Math.max(0, Math.min(1, fillPercent / 100));
  const bodyTop = 22;
  const bodyH = 78;
  const bodyBottom = bodyTop + bodyH;
  const bodyLeft = 15;
  const bodyRight = 85;
  const bodyW = bodyRight - bodyLeft;
  const cx = 50;
  const ry = 8;
  const fillH = bodyH * fillRatio;
  const fillY = bodyBottom - fillH;
  const showWave = fillRatio > 0.05 && fillRatio < 0.95;
  const showLowGlow = fillRatio > 0 && fillRatio < 0.2;
  const showHighGlow = fillRatio > 0.8;

  const uniqueId = React.useId ? React.useId() : `silo-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      viewBox="0 0 100 118"
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      role="img"
    >
      <defs>
        <linearGradient id={`${uniqueId}-metal`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a0b0c0" />
          <stop offset="30%" stopColor="#c8d4e0" />
          <stop offset="50%" stopColor="#b8c8d8" />
          <stop offset="100%" stopColor="#788898" />
        </linearGradient>
        <linearGradient id={`${uniqueId}-fill`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fillColor} stopOpacity="0.9" />
          <stop offset="50%" stopColor={fillColor} stopOpacity="1" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0.7" />
        </linearGradient>
        <clipPath id={`${uniqueId}-clip`}>
          <rect x={bodyLeft} y={bodyTop} width={bodyW} height={bodyH} rx={2} />
        </clipPath>
      </defs>

      <rect
        x={bodyLeft} y={bodyTop} width={bodyW} height={bodyH} rx={2}
        fill={`url(#${uniqueId}-metal)`}
        stroke="#556677" strokeWidth="0.8"
      />

      <ellipse cx={cx} cy={bodyTop} rx={bodyW / 2} ry={ry}
        fill={`url(#${uniqueId}-metal)`}
        stroke="#556677" strokeWidth="0.8"
      />

      {fillH > 0 && (
        <g clipPath={`url(#${uniqueId}-clip)`}>
          <rect
            x={bodyLeft} y={fillY} width={bodyW} height={fillH + 2}
            fill={`url(#${uniqueId}-fill)`}
          />
          {showWave && !skipAnimation && (
            <g style={{ animation: 'silo-wave-slide 3s linear infinite' }}>
              <path
                d={`M ${bodyLeft - 10} ${fillY}
                    Q ${bodyLeft + bodyW * 0.15} ${fillY - 2.5},
                      ${bodyLeft + bodyW * 0.25} ${fillY}
                    Q ${bodyLeft + bodyW * 0.35} ${fillY + 2.5},
                      ${bodyLeft + bodyW * 0.5} ${fillY}
                    Q ${bodyLeft + bodyW * 0.65} ${fillY - 2.5},
                      ${bodyLeft + bodyW * 0.75} ${fillY}
                    Q ${bodyLeft + bodyW * 0.85} ${fillY + 2.5},
                      ${bodyRight + 10} ${fillY}
                    L ${bodyRight + 10} ${fillY + 6}
                    L ${bodyLeft - 10} ${fillY + 6} Z`}
                fill={fillColor}
                opacity="0.4"
                style={{ transition: 'all 0.3s ease' }}
              />
            </g>
          )}
          <ellipse cx={cx} cy={fillY} rx={bodyW / 2 - 1} ry={3}
            fill={fillColor} opacity="0.6"
          />
        </g>
      )}

      <ellipse cx={cx} cy={bodyBottom} rx={bodyW / 2} ry={6}
        fill="#667788" stroke="#556677" strokeWidth="0.8"
      />

      <line x1={bodyLeft + 2} y1={bodyTop + 10} x2={bodyLeft + 2} y2={bodyBottom - 10}
        stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round"
      />

      <text x={cx} y={bodyTop + bodyH / 2 + 4} textAnchor="middle"
        fontSize="18" fontWeight="600" fontFamily="monospace"
        fill="white" opacity="0.9"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
      >
        {Math.round(fillPercent)}%
      </text>

      {showHighGlow && (
        <rect x={bodyLeft} y={fillY} width={bodyW} height={fillH}
          fill="none"
          style={{ filter: 'drop-shadow(0 0 6px #10b981)' }}
          clipPath={`url(#${uniqueId}-clip)`}
        />
      )}
      {showLowGlow && (
        <rect x={bodyLeft} y={fillY} width={bodyW} height={fillH}
          fill="none"
          className={skipAnimation ? '' : 'silo-low-pulse'}
          style={{ filter: 'drop-shadow(0 0 8px #ef4444)' }}
          clipPath={`url(#${uniqueId}-clip)`}
        />
      )}

      <style>{`
        @keyframes silo-wave-slide {
          0% { transform: translateX(0); }
          100% { transform: translateX(-15px); }
        }
        .silo-low-pulse {
          animation: silo-pulse 1.5s ease-in-out infinite;
        }
        @keyframes silo-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @media print {
          .silo-low-pulse { animation: none; }
        }
      `}</style>
    </svg>
  );
}

export default function SiloWidget({ config, tagValues }) {
  const prefersReducedMotion = useReducedMotion();
  const isCapturing = useThumbnailCapture();
  const skipAnimation = prefersReducedMotion || isCapturing;

  const ds = config.dataSource || { type: 'tag', tagName: '', formula: '', groupTags: [], aggregation: 'last' };
  const fillRaw = resolveValue(config, tagValues);
  const targetPercent = useMemo(() => {
    const v = fillRaw != null ? Number(fillRaw) : 0;
    return Math.max(0, Math.min(100, v));
  }, [fillRaw]);
  const fillPercent = useAnimatedValue(targetPercent, skipAnimation);

  const capacityRaw = config.capacityTag ? (tagValues?.[config.capacityTag] ?? null) : null;
  const tonsRaw = config.tonsTag ? (tagValues?.[config.tonsTag] ?? null) : null;
  const capacity = capacityRaw != null ? Number(capacityRaw) : null;
  const tons = tonsRaw != null ? Number(tonsRaw) : (capacity != null ? (fillPercent / 100) * capacity : null);
  const decimals = config.decimals ?? 1;
  const displayPercent = fillRaw != null ? fillPercent.toFixed(decimals) : '—';
  const displayTons = tons != null ? tons.toFixed(decimals) : '—';
  const unit = config.unit ?? '%';

  const zones = config.zones || [];
  const defaultFillColor = config.color || DEFAULT_FILL_BLUE;
  const fillColor = getZoneColor(fillPercent, zones.length ? zones : [{ from: 0, to: 100, color: defaultFillColor }], defaultFillColor);

  const showTitle = config.showTitle !== false;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;

  return (
    <div
      className="flex flex-col items-center h-full min-h-0 overflow-hidden"
      style={{ padding: '4px 6px' }}
    >
      {showTitle && config.title && (
        <p
          className="rb-widget-title mb-1 truncate w-full text-center flex-shrink-0"
          style={{ fontSize: titleFontSize }}
        >
          {config.title}
        </p>
      )}

      <div
        className="w-full flex-1 min-h-0 flex items-center justify-center cursor-help"
        title={`${displayPercent}${unit !== '%' ? ` ${unit}` : '%'}${tons != null ? ` • ${displayTons} t` : ''}`}
      >
        <Silo2DSvg fillPercent={fillPercent} fillColor={fillColor} skipAnimation={skipAnimation} />
      </div>

      <div className="flex flex-col items-center gap-0 w-full flex-shrink-0" style={{ marginTop: '2px' }}>
        <span className="rb-value-primary" style={{ fontSize: '14px' }}>
          {displayPercent}{unit !== '%' ? ` ${unit}` : '%'}
        </span>
        {config.showTons !== false && (tons != null || displayTons !== '—') && (
          <span className="rb-value-unit rb-tabular-nums" style={{ fontSize: '9px' }}>{displayTons} t</span>
        )}
        {config.showCapacity && capacity != null && (
          <span className="rb-caption rb-tabular-nums" style={{ fontSize: '9px' }}>cap. {Number(capacity).toFixed(0)}</span>
        )}
      </div>
    </div>
  );
}
