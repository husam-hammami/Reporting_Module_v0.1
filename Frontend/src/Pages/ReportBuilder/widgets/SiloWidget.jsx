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

function hexToRgb(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return { r, g, b };
}

function Silo2DSvg({ fillPercent, fillColor, skipAnimation }) {
  const fillRatio = Math.max(0, Math.min(1, fillPercent / 100));
  const bodyTop = 18;
  const bodyH = 80;
  const bodyBottom = bodyTop + bodyH;
  const bodyLeft = 18;
  const bodyRight = 82;
  const bodyW = bodyRight - bodyLeft;
  const cx = 50;
  const topRy = 7;
  const bottomRy = 5;
  const fillH = bodyH * fillRatio;
  const fillY = bodyBottom - fillH;
  const showWave = fillRatio > 0.04 && fillRatio < 0.96;
  const showLowGlow = fillRatio > 0 && fillRatio < 0.2;
  const showHighGlow = fillRatio > 0.8;

  const uniqueId = React.useId ? React.useId() : `silo-${Math.random().toString(36).slice(2, 8)}`;

  const rgb = hexToRgb(fillColor.length === 7 ? fillColor : '#3b82f6');
  const fillColorLight = `rgba(${Math.min(rgb.r + 60, 255)}, ${Math.min(rgb.g + 60, 255)}, ${Math.min(rgb.b + 60, 255)}, 0.7)`;

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
          <stop offset="0%" stopColor="#5a6a7a" />
          <stop offset="15%" stopColor="#8a9aaa" />
          <stop offset="30%" stopColor="#b0c0d0" />
          <stop offset="45%" stopColor="#d0dce8" />
          <stop offset="55%" stopColor="#c0ccd8" />
          <stop offset="70%" stopColor="#90a0b0" />
          <stop offset="85%" stopColor="#6a7a8a" />
          <stop offset="100%" stopColor="#4a5a6a" />
        </linearGradient>
        <linearGradient id={`${uniqueId}-metal-dark`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2a3444" />
          <stop offset="15%" stopColor="#3a4a5a" />
          <stop offset="30%" stopColor="#4a5e70" />
          <stop offset="50%" stopColor="#5a6e80" />
          <stop offset="70%" stopColor="#4a5e70" />
          <stop offset="85%" stopColor="#3a4a5a" />
          <stop offset="100%" stopColor="#2a3444" />
        </linearGradient>
        <linearGradient id={`${uniqueId}-fill`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fillColor} stopOpacity="0.75" />
          <stop offset="30%" stopColor={fillColor} stopOpacity="0.95" />
          <stop offset="50%" stopColor={fillColor} stopOpacity="1" />
          <stop offset="70%" stopColor={fillColor} stopOpacity="0.95" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0.65" />
        </linearGradient>
        <linearGradient id={`${uniqueId}-fill-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.18" />
          <stop offset="40%" stopColor="white" stopOpacity="0.02" />
          <stop offset="60%" stopColor="black" stopOpacity="0.04" />
          <stop offset="100%" stopColor="black" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id={`${uniqueId}-surface-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.25" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uniqueId}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8d4e0" />
          <stop offset="50%" stopColor="#8a9aaa" />
          <stop offset="100%" stopColor="#5a6a7a" />
        </linearGradient>
        <clipPath id={`${uniqueId}-clip`}>
          <rect x={bodyLeft} y={bodyTop} width={bodyW} height={bodyH} rx={1} />
        </clipPath>
        <filter id={`${uniqueId}-glow`}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        x={bodyLeft} y={bodyTop} width={bodyW} height={bodyH} rx={1}
        fill={`url(#${uniqueId}-metal)`}
        stroke="#667788" strokeWidth="0.6"
      />
      <rect
        x={bodyLeft} y={bodyTop} width={bodyW} height={bodyH} rx={1}
        fill={`url(#${uniqueId}-fill-gloss)`}
        stroke="none"
      />

      <line x1={bodyLeft + 3} y1={bodyTop + 6} x2={bodyLeft + 3} y2={bodyBottom - 6}
        stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" strokeLinecap="round"
      />
      <line x1={bodyRight - 3} y1={bodyTop + 6} x2={bodyRight - 3} y2={bodyBottom - 6}
        stroke="rgba(0,0,0,0.08)" strokeWidth="0.8" strokeLinecap="round"
      />

      <ellipse cx={cx} cy={bodyTop} rx={bodyW / 2} ry={topRy}
        fill={`url(#${uniqueId}-rim)`}
        stroke="#778899" strokeWidth="0.6"
      />
      <ellipse cx={cx} cy={bodyTop} rx={bodyW / 2 - 2} ry={topRy - 2}
        fill={`url(#${uniqueId}-surface-gloss)`}
        stroke="none"
      />

      {fillH > 0 && (
        <g clipPath={`url(#${uniqueId}-clip)`}>
          <rect
            x={bodyLeft} y={fillY} width={bodyW} height={fillH + 2}
            fill={`url(#${uniqueId}-fill)`}
          />
          <rect
            x={bodyLeft} y={fillY} width={bodyW} height={fillH + 2}
            fill={`url(#${uniqueId}-fill-gloss)`}
          />

          {showWave && !skipAnimation && (
            <>
              <g style={{ animation: 'silo-wave-slide 3s linear infinite' }}>
                <path
                  d={`M ${bodyLeft - 15} ${fillY}
                      Q ${bodyLeft + bodyW * 0.12} ${fillY - 3},
                        ${bodyLeft + bodyW * 0.25} ${fillY}
                      Q ${bodyLeft + bodyW * 0.38} ${fillY + 3},
                        ${bodyLeft + bodyW * 0.5} ${fillY}
                      Q ${bodyLeft + bodyW * 0.62} ${fillY - 3},
                        ${bodyLeft + bodyW * 0.75} ${fillY}
                      Q ${bodyLeft + bodyW * 0.88} ${fillY + 3},
                        ${bodyRight + 15} ${fillY}
                      L ${bodyRight + 15} ${fillY + 8}
                      L ${bodyLeft - 15} ${fillY + 8} Z`}
                  fill={fillColor}
                  opacity="0.35"
                  style={{ transition: 'all 0.3s ease' }}
                />
              </g>
              <g style={{ animation: 'silo-wave-slide-reverse 4s linear infinite' }}>
                <path
                  d={`M ${bodyLeft - 10} ${fillY + 1}
                      Q ${bodyLeft + bodyW * 0.2} ${fillY - 2},
                        ${bodyLeft + bodyW * 0.35} ${fillY + 1}
                      Q ${bodyLeft + bodyW * 0.5} ${fillY + 3},
                        ${bodyLeft + bodyW * 0.65} ${fillY + 1}
                      Q ${bodyLeft + bodyW * 0.8} ${fillY - 2},
                        ${bodyRight + 10} ${fillY + 1}
                      L ${bodyRight + 10} ${fillY + 6}
                      L ${bodyLeft - 10} ${fillY + 6} Z`}
                  fill={fillColorLight}
                  opacity="0.2"
                  style={{ transition: 'all 0.3s ease' }}
                />
              </g>
            </>
          )}

          <ellipse cx={cx} cy={fillY} rx={bodyW / 2 - 1} ry={3.5}
            fill={fillColor} opacity="0.5"
          />
          <ellipse cx={cx} cy={fillY} rx={bodyW / 2 - 4} ry={2}
            fill="white" opacity="0.08"
          />
        </g>
      )}

      <ellipse cx={cx} cy={bodyBottom} rx={bodyW / 2} ry={bottomRy}
        fill={`url(#${uniqueId}-metal-dark)`} stroke="#556677" strokeWidth="0.6"
      />

      <text x={cx} y={bodyTop + bodyH / 2 + 5} textAnchor="middle"
        fontSize="20" fontWeight="800" fontFamily="'Inter', system-ui, monospace"
        fill="white" opacity="0.95"
        style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6), 0 0 12px rgba(0,0,0,0.3)' }}
        paintOrder="stroke"
        stroke="rgba(0,0,0,0.3)" strokeWidth="0.5"
      >
        {Math.round(fillPercent)}%
      </text>

      {showHighGlow && (
        <rect x={bodyLeft + 1} y={fillY} width={bodyW - 2} height={Math.min(fillH, 8)}
          fill="none"
          style={{ filter: `drop-shadow(0 0 8px ${fillColor})` }}
          clipPath={`url(#${uniqueId}-clip)`}
        />
      )}
      {showLowGlow && (
        <rect x={bodyLeft + 1} y={fillY} width={bodyW - 2} height={fillH}
          fill="none"
          className={skipAnimation ? '' : 'silo-low-pulse'}
          style={{ filter: 'drop-shadow(0 0 8px #ef4444)' }}
          clipPath={`url(#${uniqueId}-clip)`}
        />
      )}

      <style>{`
        @keyframes silo-wave-slide {
          0% { transform: translateX(0); }
          100% { transform: translateX(-18px); }
        }
        @keyframes silo-wave-slide-reverse {
          0% { transform: translateX(0); }
          100% { transform: translateX(12px); }
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
        <span className="rb-value-primary rb-tabular-nums" style={{ fontSize: '14px', letterSpacing: '-0.02em' }}>
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
