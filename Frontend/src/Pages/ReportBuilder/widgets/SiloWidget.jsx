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

  const W = 120;
  const H = 220;
  const cx = W / 2;

  const bodyL = 22;
  const bodyR = W - 22;
  const bodyW = bodyR - bodyL;

  const capTop = 8;
  const capH = 14;
  const capBot = capTop + capH;

  const roofTop = capBot;
  const roofBot = roofTop + 8;

  const bodyTop = roofBot;
  const bodyBot = 186;
  const bodyH = bodyBot - bodyTop;

  const foundTop = bodyBot;
  const foundBot = 196;
  const foundH = foundBot - foundTop;

  const baseBot = 210;

  const fillH = bodyH * fillRatio;
  const fillY = bodyBot - fillH;
  const isLow = fillRatio > 0 && fillRatio < 0.15;

  const rgb = hexToRgb(fillColor.length === 7 ? fillColor : '#3b82f6');
  const fillDark = `rgb(${Math.max(rgb.r - 40, 0)}, ${Math.max(rgb.g - 40, 0)}, ${Math.max(rgb.b - 40, 0)})`;
  const fillLight = `rgb(${Math.min(rgb.r + 50, 255)}, ${Math.min(rgb.g + 50, 255)}, ${Math.min(rgb.b + 50, 255)})`;

  const pourLines = 8;
  const pourSpacing = bodyH / (pourLines + 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden role="img">
      <defs>
        <linearGradient id={`${uid}-concrete`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8a8a80" />
          <stop offset="5%" stopColor="#959589" />
          <stop offset="15%" stopColor="#a8a89c" />
          <stop offset="30%" stopColor="#b8b8ac" />
          <stop offset="45%" stopColor="#c4c4b8" />
          <stop offset="50%" stopColor="#c8c8bc" />
          <stop offset="55%" stopColor="#c4c4b8" />
          <stop offset="70%" stopColor="#b0b0a4" />
          <stop offset="85%" stopColor="#9a9a8e" />
          <stop offset="95%" stopColor="#8e8e82" />
          <stop offset="100%" stopColor="#858578" />
        </linearGradient>

        <linearGradient id={`${uid}-concrete-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.08" />
          <stop offset="20%" stopColor="white" stopOpacity="0.02" />
          <stop offset="80%" stopColor="black" stopOpacity="0.03" />
          <stop offset="100%" stopColor="black" stopOpacity="0.12" />
        </linearGradient>

        <linearGradient id={`${uid}-fill-h`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fillDark} />
          <stop offset="15%" stopColor={fillColor} />
          <stop offset="40%" stopColor={fillLight} />
          <stop offset="50%" stopColor={fillLight} />
          <stop offset="60%" stopColor={fillColor} />
          <stop offset="85%" stopColor={fillColor} />
          <stop offset="100%" stopColor={fillDark} />
        </linearGradient>

        <linearGradient id={`${uid}-fill-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.12" />
          <stop offset="30%" stopColor="white" stopOpacity="0.02" />
          <stop offset="80%" stopColor="black" stopOpacity="0.05" />
          <stop offset="100%" stopColor="black" stopOpacity="0.15" />
        </linearGradient>

        <linearGradient id={`${uid}-found`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9a9a8e" />
          <stop offset="100%" stopColor="#7a7a6e" />
        </linearGradient>

        <filter id={`${uid}-noise`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise" />
          <feColorMatrix type="saturate" values="0" in="noise" result="gray" />
          <feBlend in="SourceGraphic" in2="gray" mode="multiply" result="blend" />
          <feComponentTransfer in="blend">
            <feFuncA type="linear" slope="1" />
          </feComponentTransfer>
        </filter>

        <clipPath id={`${uid}-body-clip`}>
          <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH} />
        </clipPath>

        <pattern id={`${uid}-texture`} patternUnits="userSpaceOnUse" width="4" height="4">
          <rect width="4" height="4" fill="transparent" />
          <circle cx="1" cy="1" r="0.3" fill="rgba(0,0,0,0.03)" />
          <circle cx="3" cy="3" r="0.2" fill="rgba(255,255,255,0.02)" />
          <circle cx="2" cy="0" r="0.15" fill="rgba(0,0,0,0.02)" />
        </pattern>
      </defs>

      <rect x={bodyL - 8} y={foundBot} width={bodyW + 16} height={baseBot - foundBot}
        fill="#6a6a5e" rx="1" />
      <line x1={bodyL - 8} y1={foundBot} x2={bodyR + 8} y2={foundBot}
        stroke="#5a5a4e" strokeWidth="0.8" />

      <rect x={bodyL - 4} y={foundTop} width={bodyW + 8} height={foundH}
        fill={`url(#${uid}-found)`} rx="1" />
      <line x1={bodyL - 4} y1={foundTop} x2={bodyR + 4} y2={foundTop}
        stroke="rgba(0,0,0,0.15)" strokeWidth="0.6" />
      <line x1={bodyL - 4} y1={foundBot} x2={bodyR + 4} y2={foundBot}
        stroke="rgba(0,0,0,0.1)" strokeWidth="0.4" />

      <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH}
        fill={`url(#${uid}-concrete)`} />
      <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH}
        fill={`url(#${uid}-concrete-v)`} />
      <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH}
        fill={`url(#${uid}-texture)`} />

      <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH}
        fill="none" stroke="#8a8a7e" strokeWidth="0.8" />

      {Array.from({ length: pourLines }, (_, i) => {
        const py = bodyTop + pourSpacing * (i + 1);
        return (
          <g key={`pour-${i}`}>
            <line x1={bodyL} y1={py} x2={bodyR} y2={py}
              stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
            <line x1={bodyL} y1={py + 0.5} x2={bodyR} y2={py + 0.5}
              stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
          </g>
        );
      })}

      {[0.25, 0.5, 0.75].map((pct, i) => {
        const vx = bodyL + bodyW * pct;
        return (
          <line key={`vl-${i}`} x1={vx} y1={bodyTop} x2={vx} y2={bodyBot}
            stroke="rgba(0,0,0,0.04)" strokeWidth="0.5" />
        );
      })}

      <rect x={bodyL} y={bodyTop} width={4} height={bodyH}
        fill="rgba(255,255,255,0.04)" />
      <line x1={bodyL + 2} y1={bodyTop + 3} x2={bodyL + 2} y2={bodyBot - 3}
        stroke="rgba(255,255,255,0.06)" strokeWidth="0.6" />
      <rect x={bodyR - 3} y={bodyTop} width={3} height={bodyH}
        fill="rgba(0,0,0,0.05)" />

      {fillH > 0 && (
        <g clipPath={`url(#${uid}-body-clip)`}>
          <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
            fill={`url(#${uid}-fill-h)`} />
          <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
            fill={`url(#${uid}-fill-v)`} />

          {Array.from({ length: pourLines }, (_, i) => {
            const py = bodyTop + pourSpacing * (i + 1);
            if (py < fillY || py > bodyBot) return null;
            return (
              <line key={`fp-${i}`} x1={bodyL} y1={py} x2={bodyR} y2={py}
                stroke="rgba(0,0,0,0.05)" strokeWidth="0.8" />
            );
          })}

          {fillRatio > 0.03 && fillRatio < 0.97 && !skipAnimation && (
            <>
              <g style={{ animation: 'silo-wave-a 3.5s ease-in-out infinite' }}>
                <path
                  d={`M ${bodyL - 4} ${fillY}
                      C ${bodyL + bodyW * 0.2} ${fillY - 2.5},
                        ${bodyL + bodyW * 0.4} ${fillY + 2.5},
                        ${cx} ${fillY}
                      C ${bodyL + bodyW * 0.6} ${fillY - 2.5},
                        ${bodyL + bodyW * 0.8} ${fillY + 2.5},
                        ${bodyR + 4} ${fillY}
                      L ${bodyR + 4} ${fillY + 6}
                      L ${bodyL - 4} ${fillY + 6} Z`}
                  fill={fillColor} opacity="0.15"
                />
              </g>
              <g style={{ animation: 'silo-wave-b 4.5s ease-in-out infinite' }}>
                <path
                  d={`M ${bodyL - 2} ${fillY + 0.5}
                      C ${bodyL + bodyW * 0.25} ${fillY + 2},
                        ${bodyL + bodyW * 0.45} ${fillY - 1.5},
                        ${cx} ${fillY + 0.5}
                      C ${bodyL + bodyW * 0.55} ${fillY + 2},
                        ${bodyL + bodyW * 0.75} ${fillY - 1.5},
                        ${bodyR + 2} ${fillY + 0.5}
                      L ${bodyR + 2} ${fillY + 5}
                      L ${bodyL - 2} ${fillY + 5} Z`}
                  fill={fillLight} opacity="0.08"
                />
              </g>
            </>
          )}

          <ellipse cx={cx} cy={fillY} rx={bodyW / 2 - 2} ry={2.5}
            fill={fillColor} opacity="0.3" />
          <ellipse cx={cx - 3} cy={fillY} rx={bodyW / 3} ry={1.2}
            fill="white" opacity="0.05" />

          <rect x={bodyL} y={fillY} width={3} height={fillH}
            fill="rgba(255,255,255,0.03)" />
        </g>
      )}

      <rect x={bodyL} y={roofTop} width={bodyW} height={roofBot - roofTop}
        fill="#a0a094" stroke="#8a8a7e" strokeWidth="0.5" />
      <rect x={bodyL} y={roofTop} width={bodyW} height={3}
        fill="rgba(255,255,255,0.1)" />
      <line x1={bodyL} y1={roofBot} x2={bodyR} y2={roofBot}
        stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />

      <rect x={bodyL - 2} y={roofTop - 1} width={bodyW + 4} height={2}
        fill="#9a9a8e" rx="0.5" />

      <rect x={cx - 14} y={capTop} width={28} height={capH}
        fill="#9a9a90" stroke="#8a8a7e" strokeWidth="0.6" rx="2" />
      <rect x={cx - 14} y={capTop} width={28} height={4}
        fill="rgba(255,255,255,0.08)" rx="2" />
      <rect x={cx - 3} y={capTop + 2} width={6} height={capH - 3}
        fill="#7a7a70" rx="1" />
      <line x1={cx - 10} y1={capTop + capH / 2} x2={cx - 5} y2={capTop + capH / 2}
        stroke="#7a7a70" strokeWidth="0.8" />
      <line x1={cx + 5} y1={capTop + capH / 2} x2={cx + 10} y2={capTop + capH / 2}
        stroke="#7a7a70" strokeWidth="0.8" />

      <g opacity="0.3">
        {Array.from({ length: Math.floor(bodyH / 5) }, (_, i) => {
          const ry = bodyTop + 3 + i * 5;
          if (ry > bodyBot - 3) return null;
          return (
            <g key={`ladder-${i}`}>
              <line x1={bodyR - 1} y1={ry} x2={bodyR + 3} y2={ry}
                stroke="#70706a" strokeWidth="0.6" />
            </g>
          );
        })}
        <line x1={bodyR - 1} y1={bodyTop + 2} x2={bodyR - 1} y2={bodyBot - 2}
          stroke="#70706a" strokeWidth="0.7" />
        <line x1={bodyR + 3} y1={bodyTop + 2} x2={bodyR + 3} y2={bodyBot - 2}
          stroke="#70706a" strokeWidth="0.7" />
      </g>

      <text x={cx} y={bodyTop + bodyH / 2 + 7} textAnchor="middle"
        fontSize="22" fontWeight="800"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
        fill="white" opacity="0.95"
        paintOrder="stroke" stroke="rgba(0,0,0,0.6)" strokeWidth="1.2"
      >
        {Math.round(fillPercent)}%
      </text>

      {isLow && !skipAnimation && (
        <rect x={bodyL + 1} y={fillY - 1} width={bodyW - 2} height={Math.max(fillH, 4)}
          fill="none" className="silo-low-pulse"
          style={{ filter: 'drop-shadow(0 0 6px #ef4444)' }}
          clipPath={`url(#${uid}-body-clip)`}
        />
      )}

      <style>{`
        @keyframes silo-wave-a {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-4px); }
        }
        @keyframes silo-wave-b {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(3px); }
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
        style={{ maxWidth: '140px', margin: '0 auto' }}
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
