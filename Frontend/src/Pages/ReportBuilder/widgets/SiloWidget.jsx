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
  const H = 170;
  const cx = W / 2;

  const bodyL = 20;
  const bodyR = W - 20;
  const bodyW = bodyR - bodyL;
  const rx = bodyW / 2;
  const ry = 12;

  const topY = 16;
  const botY = 154;
  const bodyH = botY - topY;

  const fillH = bodyH * fillRatio;
  const fillY = botY - fillH;
  const isLow = fillRatio > 0 && fillRatio < 0.15;

  const rgb = hexToRgb(fillColor.length === 7 ? fillColor : '#3b82f6');
  const fillDark = `rgb(${Math.max(rgb.r - 40, 0)}, ${Math.max(rgb.g - 40, 0)}, ${Math.max(rgb.b - 40, 0)})`;
  const fillMid = fillColor;
  const fillBright = `rgb(${Math.min(rgb.r + 50, 255)}, ${Math.min(rgb.g + 50, 255)}, ${Math.min(rgb.b + 50, 255)})`;

  const glowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden role="img">
      <defs>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1a2230" />
          <stop offset="12%" stopColor="#1e2838" />
          <stop offset="35%" stopColor="#243040" />
          <stop offset="50%" stopColor="#283448" />
          <stop offset="65%" stopColor="#243040" />
          <stop offset="88%" stopColor="#1e2838" />
          <stop offset="100%" stopColor="#1a2230" />
        </linearGradient>

        <linearGradient id={`${uid}-top`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1c2535" />
          <stop offset="30%" stopColor="#253040" />
          <stop offset="50%" stopColor="#2a3648" />
          <stop offset="70%" stopColor="#253040" />
          <stop offset="100%" stopColor="#1c2535" />
        </linearGradient>

        <linearGradient id={`${uid}-bot`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#141c28" />
          <stop offset="30%" stopColor="#1a2432" />
          <stop offset="50%" stopColor="#1e2838" />
          <stop offset="70%" stopColor="#1a2432" />
          <stop offset="100%" stopColor="#141c28" />
        </linearGradient>

        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fillDark} />
          <stop offset="18%" stopColor={fillMid} />
          <stop offset="42%" stopColor={fillBright} />
          <stop offset="58%" stopColor={fillBright} />
          <stop offset="82%" stopColor={fillMid} />
          <stop offset="100%" stopColor={fillDark} />
        </linearGradient>

        <linearGradient id={`${uid}-fill-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.12" />
          <stop offset="40%" stopColor="white" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.15" />
        </linearGradient>

        <linearGradient id={`${uid}-fill-top`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fillDark} />
          <stop offset="35%" stopColor={fillMid} />
          <stop offset="50%" stopColor={fillBright} />
          <stop offset="65%" stopColor={fillMid} />
          <stop offset="100%" stopColor={fillDark} />
        </linearGradient>

        <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2a3a50" />
          <stop offset="25%" stopColor="#3a5068" />
          <stop offset="50%" stopColor="#4a6078" />
          <stop offset="75%" stopColor="#3a5068" />
          <stop offset="100%" stopColor="#2a3a50" />
        </linearGradient>

        <filter id={`${uid}-glow`}>
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
        </filter>

        <clipPath id={`${uid}-clip`}>
          <rect x={bodyL} y={topY} width={bodyW} height={bodyH} />
        </clipPath>
      </defs>

      <rect x={bodyL} y={topY} width={bodyW} height={bodyH}
        fill={`url(#${uid}-body)`} />

      <ellipse cx={cx} cy={botY} rx={rx} ry={ry}
        fill={`url(#${uid}-bot)`} stroke="#2a3a50" strokeWidth="0.6" />

      {fillH > 0 && (
        <>
          <rect x={bodyL + 1} y={fillY} width={bodyW - 2} height={fillH}
            fill={glowColor} filter={`url(#${uid}-glow)`} clipPath={`url(#${uid}-clip)`} />

          <g clipPath={`url(#${uid}-clip)`}>
            <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
              fill={`url(#${uid}-fill)`} />
            <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
              fill={`url(#${uid}-fill-v)`} />
          </g>
        </>
      )}

      {fillH > 0 && fillRatio < 0.93 && (
        <ellipse cx={cx} cy={fillY} rx={rx - 0.5} ry={ry - 1}
          fill={`url(#${uid}-fill-top)`} opacity="0.6" />
      )}

      <ellipse cx={cx} cy={topY} rx={rx} ry={ry}
        fill={`url(#${uid}-top)`} stroke="#3a5068" strokeWidth="0.6" />
      <ellipse cx={cx} cy={topY} rx={rx - 3} ry={ry - 2}
        fill="none" stroke="rgba(100,160,220,0.08)" strokeWidth="0.4" />

      <line x1={bodyL} y1={topY} x2={bodyL} y2={botY}
        stroke="#3a5068" strokeWidth="0.6" />
      <line x1={bodyR} y1={topY} x2={bodyR} y2={botY}
        stroke="#2a3a50" strokeWidth="0.6" />

      <ellipse cx={cx} cy={botY} rx={rx} ry={ry}
        fill="none" stroke="#2a3a50" strokeWidth="0.5" />

      <text x={cx} y={topY + bodyH / 2 + 8} textAnchor="middle"
        fontSize="22" fontWeight="700"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
        fill="white" opacity="0.95"
        paintOrder="stroke" stroke="rgba(0,0,0,0.7)" strokeWidth="2.5"
      >
        {Math.round(fillPercent)}%
      </text>

      {isLow && !skipAnimation && (
        <rect x={bodyL + 2} y={fillY - 1} width={bodyW - 4} height={Math.max(fillH, 4)}
          fill="none" className="silo-low-pulse"
          style={{ filter: 'drop-shadow(0 0 6px #ef4444)' }}
          clipPath={`url(#${uid}-clip)`}
        />
      )}

      <style>{`
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
