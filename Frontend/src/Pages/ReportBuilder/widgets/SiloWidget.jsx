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
    const duration = 600;
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

function GrainSilo3D({ fillPercent, fillColor, skipAnimation }) {
  const fillRatio = Math.max(0, Math.min(1, fillPercent / 100));
  const uid = React.useId ? React.useId() : `s-${Math.random().toString(36).slice(2, 8)}`;

  const W = 140;
  const H = 200;
  const cx = W / 2;

  const bodyL = 26;
  const bodyR = W - 26;
  const bodyW = bodyR - bodyL;
  const bodyRx = bodyW / 2;

  const roofPeak = 28;
  const roofBase = 42;
  const roofEllipseRy = 10;

  const bodyTop = roofBase;
  const bodyBot = 182;
  const bodyH = bodyBot - bodyTop;

  const fillH = bodyH * fillRatio;
  const fillY = bodyBot - fillH;
  const hasWave = fillRatio > 0.03 && fillRatio < 0.97 && !skipAnimation;
  const isLow = fillRatio > 0 && fillRatio < 0.15;

  const rgb = hexToRgb(fillColor.length === 7 ? fillColor : '#3b82f6');
  const fillDark = `rgb(${Math.max(rgb.r - 50, 0)}, ${Math.max(rgb.g - 50, 0)}, ${Math.max(rgb.b - 50, 0)})`;
  const fillLight = `rgb(${Math.min(rgb.r + 70, 255)}, ${Math.min(rgb.g + 70, 255)}, ${Math.min(rgb.b + 70, 255)})`;
  const fillVLight = `rgba(${Math.min(rgb.r + 100, 255)}, ${Math.min(rgb.g + 100, 255)}, ${Math.min(rgb.b + 100, 255)}, 0.5)`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden role="img">
      <defs>
        <linearGradient id={`${uid}-metal`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6b7d8d" />
          <stop offset="8%" stopColor="#8899a8" />
          <stop offset="20%" stopColor="#a8bac8" />
          <stop offset="35%" stopColor="#c8d6e2" />
          <stop offset="45%" stopColor="#dae6f0" />
          <stop offset="50%" stopColor="#e4eef6" />
          <stop offset="55%" stopColor="#dae6f0" />
          <stop offset="65%" stopColor="#c0d0de" />
          <stop offset="80%" stopColor="#98aab8" />
          <stop offset="92%" stopColor="#7a8c9c" />
          <stop offset="100%" stopColor="#68788a" />
        </linearGradient>

        <linearGradient id={`${uid}-metal-shadow`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4a5a6a" />
          <stop offset="15%" stopColor="#5a6a7a" />
          <stop offset="35%" stopColor="#7a8a98" />
          <stop offset="50%" stopColor="#8a9aa8" />
          <stop offset="65%" stopColor="#7a8a98" />
          <stop offset="85%" stopColor="#5a6a7a" />
          <stop offset="100%" stopColor="#4a5a6a" />
        </linearGradient>

        <linearGradient id={`${uid}-roof`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7a8a9a" />
          <stop offset="20%" stopColor="#a0b0c0" />
          <stop offset="40%" stopColor="#c0d0dd" />
          <stop offset="50%" stopColor="#d8e4ee" />
          <stop offset="60%" stopColor="#c0d0dd" />
          <stop offset="80%" stopColor="#90a0b0" />
          <stop offset="100%" stopColor="#6a7a8a" />
        </linearGradient>

        <linearGradient id={`${uid}-roof-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.3" />
          <stop offset="60%" stopColor="white" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.15" />
        </linearGradient>

        <linearGradient id={`${uid}-fill-h`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fillDark} />
          <stop offset="15%" stopColor={fillColor} />
          <stop offset="40%" stopColor={fillLight} />
          <stop offset="50%" stopColor={fillVLight} />
          <stop offset="60%" stopColor={fillLight} />
          <stop offset="85%" stopColor={fillColor} />
          <stop offset="100%" stopColor={fillDark} />
        </linearGradient>

        <linearGradient id={`${uid}-fill-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.15" />
          <stop offset="30%" stopColor="white" stopOpacity="0.03" />
          <stop offset="70%" stopColor="black" stopOpacity="0.05" />
          <stop offset="100%" stopColor="black" stopOpacity="0.18" />
        </linearGradient>

        <clipPath id={`${uid}-body-clip`}>
          <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH} />
        </clipPath>
      </defs>

      <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH}
        fill={`url(#${uid}-metal)`} stroke="#8898a6" strokeWidth="0.7" />


      {fillH > 0 && (
        <g clipPath={`url(#${uid}-body-clip)`}>
          <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
            fill={`url(#${uid}-fill-h)`} />
          <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
            fill={`url(#${uid}-fill-v)`} />

          {hasWave && (
            <>
              <g style={{ animation: 'silo-wave-a 3s ease-in-out infinite' }}>
                <path
                  d={`M ${bodyL - 8} ${fillY}
                      C ${bodyL + bodyW * 0.15} ${fillY - 3},
                        ${bodyL + bodyW * 0.35} ${fillY + 3},
                        ${cx} ${fillY}
                      C ${bodyL + bodyW * 0.65} ${fillY - 3},
                        ${bodyL + bodyW * 0.85} ${fillY + 3},
                        ${bodyR + 8} ${fillY}
                      L ${bodyR + 8} ${fillY + 8}
                      L ${bodyL - 8} ${fillY + 8} Z`}
                  fill={fillColor} opacity="0.2"
                />
              </g>
              <g style={{ animation: 'silo-wave-b 4s ease-in-out infinite' }}>
                <path
                  d={`M ${bodyL - 4} ${fillY + 1}
                      C ${bodyL + bodyW * 0.2} ${fillY + 3},
                        ${bodyL + bodyW * 0.45} ${fillY - 2},
                        ${cx} ${fillY + 1}
                      C ${bodyL + bodyW * 0.55} ${fillY + 3},
                        ${bodyL + bodyW * 0.8} ${fillY - 2},
                        ${bodyR + 4} ${fillY + 1}
                      L ${bodyR + 4} ${fillY + 6}
                      L ${bodyL - 4} ${fillY + 6} Z`}
                  fill={fillLight} opacity="0.12"
                />
              </g>
            </>
          )}

          <ellipse cx={cx} cy={fillY} rx={bodyW / 2 - 1} ry={3}
            fill={fillColor} opacity="0.35" />
          <ellipse cx={cx - 4} cy={fillY} rx={bodyW / 3} ry={1.5}
            fill="white" opacity="0.06" />

          <rect x={bodyL} y={fillY} width={5} height={fillH}
            fill="rgba(255,255,255,0.04)" />
        </g>
      )}

      <ellipse cx={cx} cy={bodyBot} rx={bodyRx} ry={roofEllipseRy}
        fill={fillH > 0 ? `url(#${uid}-fill-h)` : `url(#${uid}-metal-shadow)`} stroke="#778899" strokeWidth="0.6" />

      <path
        d={`M ${bodyL} ${roofBase}
            Q ${bodyL} ${roofPeak + 4}, ${cx} ${roofPeak}
            Q ${bodyR} ${roofPeak + 4}, ${bodyR} ${roofBase}`}
        fill={`url(#${uid}-roof)`} stroke="#8898a8" strokeWidth="0.7" />
      <path
        d={`M ${bodyL} ${roofBase}
            Q ${bodyL} ${roofPeak + 4}, ${cx} ${roofPeak}
            Q ${bodyR} ${roofPeak + 4}, ${bodyR} ${roofBase}`}
        fill={`url(#${uid}-roof-v)`} />


      <ellipse cx={cx} cy={roofBase} rx={bodyRx} ry={roofEllipseRy}
        fill={`url(#${uid}-metal)`} stroke="#8898a8" strokeWidth="0.6" />
      <ellipse cx={cx} cy={roofBase} rx={bodyRx - 4} ry={roofEllipseRy - 3}
        fill="rgba(255,255,255,0.08)" />

      <line x1={cx - 4} y1={roofPeak + 4} x2={cx - 4} y2={roofBase - 3}
        stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
      <line x1={cx + 4} y1={roofPeak + 4} x2={cx + 4} y2={roofBase - 3}
        stroke="rgba(0,0,0,0.05)" strokeWidth="0.5" />

      <text x={cx} y={bodyTop + bodyH / 2 + 7} textAnchor="middle"
        fontSize="24" fontWeight="800"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
        fill="white" opacity="0.95"
        paintOrder="stroke" stroke="rgba(0,0,0,0.5)" strokeWidth="1"
        style={{ textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 0 16px rgba(0,0,0,0.3)' }}
      >
        {Math.round(fillPercent)}%
      </text>

      {isLow && !skipAnimation && (
        <rect x={bodyL + 2} y={fillY - 1} width={bodyW - 4} height={Math.max(fillH, 4)}
          fill="none" className="silo-low-pulse"
          style={{ filter: 'drop-shadow(0 0 6px #ef4444)' }}
          clipPath={`url(#${uid}-body-clip)`}
        />
      )}

      <style>{`
        @keyframes silo-wave-a {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-6px); }
        }
        @keyframes silo-wave-b {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(5px); }
        }
        .silo-low-pulse {
          animation: silo-pulse 1.5s ease-in-out infinite;
        }
        @keyframes silo-pulse {
          0%, 100% { opacity: 0.3; }
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
          className="rb-widget-title mb-0.5 truncate w-full text-center flex-shrink-0"
          style={{ fontSize: titleFontSize }}
        >
          {config.title}
        </p>
      )}

      <div
        className="w-full flex-1 min-h-0 flex items-center justify-center cursor-help"
        title={`${displayPercent}${unit !== '%' ? ` ${unit}` : '%'}${tons != null ? ` • ${displayTons} t` : ''}`}
        style={{ maxWidth: '160px', margin: '0 auto' }}
      >
        <GrainSilo3D fillPercent={fillPercent} fillColor={fillColor} skipAnimation={skipAnimation} />
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
