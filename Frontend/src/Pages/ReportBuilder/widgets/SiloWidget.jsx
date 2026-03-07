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

  const W = 100;
  const H = 240;
  const cx = W / 2;

  const bodyRx = 32;
  const bodyL = cx - bodyRx;
  const bodyR = cx + bodyRx;
  const bodyW = bodyRx * 2;

  const ery = 8;

  const domeTop = 14;
  const domeH = 20;
  const bodyTop = domeTop + domeH;
  const bodyBot = 204;
  const bodyH = bodyBot - bodyTop;

  const baseTop = bodyBot + ery;
  const baseBot = baseTop + 10;

  const fillH = bodyH * fillRatio;
  const fillY = bodyBot - fillH;
  const isLow = fillRatio > 0 && fillRatio < 0.15;

  const rgb = hexToRgb(fillColor.length === 7 ? fillColor : '#3b82f6');
  const fillDark = `rgb(${Math.max(rgb.r - 55, 0)}, ${Math.max(rgb.g - 55, 0)}, ${Math.max(rgb.b - 55, 0)})`;
  const fillMid = fillColor;
  const fillLight = `rgb(${Math.min(rgb.r + 40, 255)}, ${Math.min(rgb.g + 40, 255)}, ${Math.min(rgb.b + 40, 255)})`;

  const pourLines = 10;
  const pourSpacing = bodyH / (pourLines + 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden role="img">
      <defs>
        <linearGradient id={`${uid}-cyl`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6e6e64" />
          <stop offset="8%" stopColor="#828276" />
          <stop offset="22%" stopColor="#9e9e90" />
          <stop offset="38%" stopColor="#b2b2a4" />
          <stop offset="48%" stopColor="#bdbdb0" />
          <stop offset="52%" stopColor="#c0c0b4" />
          <stop offset="58%" stopColor="#bab8ac" />
          <stop offset="72%" stopColor="#a6a698" />
          <stop offset="88%" stopColor="#8a8a7c" />
          <stop offset="100%" stopColor="#747468" />
        </linearGradient>

        <linearGradient id={`${uid}-cyl-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.06" />
          <stop offset="15%" stopColor="white" stopOpacity="0.01" />
          <stop offset="85%" stopColor="black" stopOpacity="0.02" />
          <stop offset="100%" stopColor="black" stopOpacity="0.1" />
        </linearGradient>

        <radialGradient id={`${uid}-dome`} cx="0.45" cy="0.7" r="0.65">
          <stop offset="0%" stopColor="#c4c4b6" />
          <stop offset="50%" stopColor="#b0b0a2" />
          <stop offset="100%" stopColor="#8a8a7c" />
        </radialGradient>

        <linearGradient id={`${uid}-fill-cyl`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fillDark} />
          <stop offset="12%" stopColor={fillMid} />
          <stop offset="35%" stopColor={fillLight} />
          <stop offset="48%" stopColor={fillLight} />
          <stop offset="60%" stopColor={fillMid} />
          <stop offset="88%" stopColor={fillMid} />
          <stop offset="100%" stopColor={fillDark} />
        </linearGradient>

        <linearGradient id={`${uid}-fill-depth`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.08" />
          <stop offset="40%" stopColor="white" stopOpacity="0" />
          <stop offset="90%" stopColor="black" stopOpacity="0.08" />
          <stop offset="100%" stopColor="black" stopOpacity="0.14" />
        </linearGradient>

        <linearGradient id={`${uid}-base`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a8a7c" />
          <stop offset="100%" stopColor="#686860" />
        </linearGradient>

        <clipPath id={`${uid}-body-clip`}>
          <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH} rx="0" />
        </clipPath>

      </defs>

      <rect x={bodyL - 6} y={baseTop} width={bodyW + 12} height={baseBot - baseTop}
        fill={`url(#${uid}-base)`} rx="2" />
      <line x1={bodyL - 6} y1={baseTop + 1} x2={bodyR + 6} y2={baseTop + 1}
        stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />

      <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH}
        fill={`url(#${uid}-cyl)`} />
      <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH}
        fill={`url(#${uid}-cyl-v)`} />

      <ellipse cx={cx} cy={bodyBot} rx={bodyRx} ry={ery}
        fill={`url(#${uid}-cyl)`} />
      <ellipse cx={cx} cy={bodyBot} rx={bodyRx} ry={ery}
        fill="rgba(0,0,0,0.15)" />

      {Array.from({ length: pourLines }, (_, i) => {
        const py = bodyTop + pourSpacing * (i + 1);
        return (
          <g key={`pour-${i}`}>
            <line x1={bodyL} y1={py} x2={bodyR} y2={py}
              stroke="rgba(0,0,0,0.06)" strokeWidth="0.8" />
            <line x1={bodyL + 1} y1={py + 0.6} x2={bodyR - 1} y2={py + 0.6}
              stroke="rgba(255,255,255,0.03)" strokeWidth="0.4" />
          </g>
        );
      })}

      {[0.33, 0.67].map((pct, i) => (
        <line key={`vf-${i}`} x1={bodyL + bodyW * pct} y1={bodyTop + 2} x2={bodyL + bodyW * pct} y2={bodyBot - 2}
          stroke="rgba(0,0,0,0.025)" strokeWidth="0.4" />
      ))}

      {fillH > 0 && (
        <g clipPath={`url(#${uid}-body-clip)`}>
          <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
            fill={`url(#${uid}-fill-cyl)`} />
          <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
            fill={`url(#${uid}-fill-depth)`} />

          {Array.from({ length: pourLines }, (_, i) => {
            const py = bodyTop + pourSpacing * (i + 1);
            if (py < fillY || py > bodyBot) return null;
            return (
              <line key={`fp-${i}`} x1={bodyL} y1={py} x2={bodyR} y2={py}
                stroke="rgba(0,0,0,0.04)" strokeWidth="0.6" />
            );
          })}

          {fillRatio > 0.03 && fillRatio < 0.97 && !skipAnimation && (
            <>
              <g style={{ animation: 'silo-wave-a 4s ease-in-out infinite' }}>
                <path
                  d={`M ${bodyL} ${fillY}
                      C ${bodyL + bodyW * 0.2} ${fillY - 2},
                        ${bodyL + bodyW * 0.4} ${fillY + 2},
                        ${cx} ${fillY}
                      C ${bodyL + bodyW * 0.6} ${fillY - 2},
                        ${bodyL + bodyW * 0.8} ${fillY + 2},
                        ${bodyR} ${fillY}
                      L ${bodyR} ${fillY + 5}
                      L ${bodyL} ${fillY + 5} Z`}
                  fill={fillMid} opacity="0.12"
                />
              </g>
              <g style={{ animation: 'silo-wave-b 5s ease-in-out infinite' }}>
                <path
                  d={`M ${bodyL} ${fillY + 0.5}
                      C ${bodyL + bodyW * 0.25} ${fillY + 2},
                        ${bodyL + bodyW * 0.5} ${fillY - 1},
                        ${cx} ${fillY + 0.5}
                      C ${bodyL + bodyW * 0.6} ${fillY + 1.5},
                        ${bodyL + bodyW * 0.8} ${fillY - 1},
                        ${bodyR} ${fillY + 0.5}
                      L ${bodyR} ${fillY + 4}
                      L ${bodyL} ${fillY + 4} Z`}
                  fill={fillLight} opacity="0.06"
                />
              </g>
            </>
          )}

          <ellipse cx={cx} cy={fillY} rx={bodyRx - 1} ry={2}
            fill={fillLight} opacity="0.2" />
        </g>
      )}

      <ellipse cx={cx} cy={bodyTop} rx={bodyRx} ry={ery}
        fill={`url(#${uid}-cyl)`} />
      <ellipse cx={cx} cy={bodyTop} rx={bodyRx} ry={ery}
        fill="rgba(255,255,255,0.06)" />
      <ellipse cx={cx} cy={bodyTop} rx={bodyRx} ry={ery}
        fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="0.5" />

      <path
        d={`M ${bodyL} ${bodyTop}
            Q ${bodyL} ${domeTop + 4}, ${cx} ${domeTop}
            Q ${bodyR} ${domeTop + 4}, ${bodyR} ${bodyTop}`}
        fill={`url(#${uid}-dome)`} />
      <path
        d={`M ${bodyL} ${bodyTop}
            Q ${bodyL} ${domeTop + 4}, ${cx} ${domeTop}
            Q ${bodyR} ${domeTop + 4}, ${bodyR} ${bodyTop}`}
        fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" />

      <line x1={cx} y1={domeTop - 1} x2={cx} y2={domeTop + 5}
        stroke="#8a8a7c" strokeWidth="1.5" strokeLinecap="round" />
      <rect x={cx - 5} y={domeTop - 4} width={10} height={5}
        fill="#9a9a8c" rx="1" stroke="rgba(0,0,0,0.1)" strokeWidth="0.3" />

      <g opacity="0.25">
        <line x1={bodyR + 2} y1={bodyTop + 4} x2={bodyR + 2} y2={bodyBot - 4}
          stroke="#7a7a70" strokeWidth="0.8" />
        <line x1={bodyR + 4.5} y1={bodyTop + 4} x2={bodyR + 4.5} y2={bodyBot - 4}
          stroke="#7a7a70" strokeWidth="0.8" />
        {Array.from({ length: Math.floor(bodyH / 6) }, (_, i) => {
          const ry = bodyTop + 4 + i * 6;
          if (ry > bodyBot - 6) return null;
          return (
            <line key={`lr-${i}`} x1={bodyR + 2} y1={ry} x2={bodyR + 4.5} y2={ry}
              stroke="#7a7a70" strokeWidth="0.5" />
          );
        })}
      </g>

      <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH}
        fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="0.6" />

      <text x={cx} y={bodyTop + bodyH / 2 + 6} textAnchor="middle"
        fontSize="20" fontWeight="700"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
        fill="white" opacity="0.92"
        paintOrder="stroke" stroke="rgba(0,0,0,0.7)" strokeWidth="2.5"
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
          50% { transform: translateX(-3px); }
        }
        @keyframes silo-wave-b {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(2px); }
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
