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
  const H = 230;
  const cx = W / 2;

  const bodyRx = 30;
  const bodyL = cx - bodyRx;
  const bodyR = cx + bodyRx;
  const bodyW = bodyRx * 2;
  const ery = 7;

  const domeApex = 16;
  const bodyTop = 30;
  const bodyBot = 200;
  const bodyH = bodyBot - bodyTop;

  const baseY = bodyBot + ery;
  const baseH = 8;

  const fillH = bodyH * fillRatio;
  const fillY = bodyBot - fillH;
  const isLow = fillRatio > 0 && fillRatio < 0.15;

  const rgb = hexToRgb(fillColor.length === 7 ? fillColor : '#3b82f6');
  const fillDark = `rgb(${Math.max(rgb.r - 60, 0)}, ${Math.max(rgb.g - 60, 0)}, ${Math.max(rgb.b - 60, 0)})`;
  const fillMid = fillColor;
  const fillGlow = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;
  const fillGlowStrong = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`;

  const scanLines = 12;
  const scanSpacing = bodyH / (scanLines + 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden role="img">
      <defs>
        <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0c1a2e" />
          <stop offset="8%" stopColor="#0f2035" />
          <stop offset="25%" stopColor="#13283f" />
          <stop offset="45%" stopColor="#162d46" />
          <stop offset="55%" stopColor="#162d46" />
          <stop offset="75%" stopColor="#13283f" />
          <stop offset="92%" stopColor="#0f2035" />
          <stop offset="100%" stopColor="#0c1a2e" />
        </linearGradient>

        <linearGradient id={`${uid}-shell-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.04)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.08)" />
        </linearGradient>

        <linearGradient id={`${uid}-edge-l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(34,211,238,0.25)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0)" />
        </linearGradient>

        <linearGradient id={`${uid}-edge-r`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="rgba(34,211,238,0.15)" />
          <stop offset="100%" stopColor="rgba(34,211,238,0)" />
        </linearGradient>

        <linearGradient id={`${uid}-fill-h`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fillDark} stopOpacity="0.9" />
          <stop offset="15%" stopColor={fillMid} stopOpacity="0.75" />
          <stop offset="40%" stopColor={fillMid} stopOpacity="0.6" />
          <stop offset="50%" stopColor={fillMid} stopOpacity="0.55" />
          <stop offset="60%" stopColor={fillMid} stopOpacity="0.6" />
          <stop offset="85%" stopColor={fillMid} stopOpacity="0.75" />
          <stop offset="100%" stopColor={fillDark} stopOpacity="0.9" />
        </linearGradient>

        <linearGradient id={`${uid}-fill-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillMid} stopOpacity="0.15" />
          <stop offset="30%" stopColor={fillMid} stopOpacity="0.02" />
          <stop offset="85%" stopColor={fillMid} stopOpacity="0.06" />
          <stop offset="100%" stopColor={fillMid} stopOpacity="0.12" />
        </linearGradient>

        <linearGradient id={`${uid}-fill-glow`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={fillMid} stopOpacity="0.04" />
          <stop offset="80%" stopColor={fillMid} stopOpacity="0" />
          <stop offset="100%" stopColor={fillMid} stopOpacity="0.08" />
        </linearGradient>

        <radialGradient id={`${uid}-dome-g`} cx="0.5" cy="0.8" r="0.6">
          <stop offset="0%" stopColor="#1a3050" />
          <stop offset="100%" stopColor="#0c1a2e" />
        </radialGradient>

        <linearGradient id={`${uid}-base-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a2a3e" />
          <stop offset="100%" stopColor="#0e1a2a" />
        </linearGradient>

        <clipPath id={`${uid}-body-clip`}>
          <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH} />
        </clipPath>

        <filter id={`${uid}-glow`}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect x={bodyL - 4} y={baseY} width={bodyW + 8} height={baseH}
        fill={`url(#${uid}-base-g)`} rx="1.5" />
      <line x1={bodyL - 4} y1={baseY} x2={bodyR + 4} y2={baseY}
        stroke="rgba(34,211,238,0.12)" strokeWidth="0.5" />
      <line x1={bodyL - 4} y1={baseY + baseH} x2={bodyR + 4} y2={baseY + baseH}
        stroke="rgba(34,211,238,0.06)" strokeWidth="0.3" />

      <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH}
        fill={`url(#${uid}-shell)`} />
      <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH}
        fill={`url(#${uid}-shell-v)`} />

      <ellipse cx={cx} cy={bodyBot} rx={bodyRx} ry={ery}
        fill="#0e1e32" stroke="rgba(34,211,238,0.1)" strokeWidth="0.4" />

      <rect x={bodyL} y={bodyTop} width={3} height={bodyH}
        fill={`url(#${uid}-edge-l)`} />
      <rect x={bodyR - 3} y={bodyTop} width={3} height={bodyH}
        fill={`url(#${uid}-edge-r)`} />

      {Array.from({ length: scanLines }, (_, i) => {
        const sy = bodyTop + scanSpacing * (i + 1);
        return (
          <line key={`sc-${i}`} x1={bodyL + 1} y1={sy} x2={bodyR - 1} y2={sy}
            stroke="rgba(34,211,238,0.04)" strokeWidth="0.3" />
        );
      })}

      {fillH > 0 && (
        <g clipPath={`url(#${uid}-body-clip)`}>
          <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
            fill={`url(#${uid}-fill-h)`} />
          <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
            fill={`url(#${uid}-fill-v)`} />
          <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
            fill={`url(#${uid}-fill-glow)`} />

          {Array.from({ length: Math.floor(fillH / 8) }, (_, i) => {
            const ly = bodyBot - (i + 1) * 8;
            if (ly < fillY) return null;
            return (
              <line key={`fl-${i}`} x1={bodyL + 2} y1={ly} x2={bodyR - 2} y2={ly}
                stroke={fillGlow} strokeWidth="0.3" opacity={0.3 + (i % 3 === 0 ? 0.15 : 0)} />
            );
          })}

          <line x1={bodyL} y1={fillY} x2={bodyR} y2={fillY}
            stroke={fillGlowStrong} strokeWidth="1"
            filter={skipAnimation ? undefined : `url(#${uid}-glow)`} />

          <rect x={bodyL} y={fillY} width={2} height={fillH}
            fill={fillGlow} />
          <rect x={bodyR - 2} y={fillY} width={2} height={fillH}
            fill={`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`} />

          {fillRatio > 0.03 && fillRatio < 0.97 && !skipAnimation && (
            <g style={{ animation: 'silo-shimmer 3s ease-in-out infinite' }}>
              <rect x={bodyL + 4} y={fillY} width={bodyW - 8} height={3}
                fill={fillGlowStrong} opacity="0.15" rx="1" />
            </g>
          )}
        </g>
      )}

      <ellipse cx={cx} cy={bodyTop} rx={bodyRx} ry={ery}
        fill="#12243a" stroke="rgba(34,211,238,0.12)" strokeWidth="0.4" />

      <path
        d={`M ${bodyL} ${bodyTop}
            Q ${bodyL} ${domeApex + 6}, ${cx} ${domeApex}
            Q ${bodyR} ${domeApex + 6}, ${bodyR} ${bodyTop}`}
        fill={`url(#${uid}-dome-g)`}
        stroke="rgba(34,211,238,0.1)" strokeWidth="0.4" />

      <circle cx={cx} cy={domeApex - 2} r="2"
        fill="#1a2a3e" stroke="rgba(34,211,238,0.2)" strokeWidth="0.4" />

      <line x1={bodyL} y1={bodyTop} x2={bodyL} y2={bodyBot}
        stroke="rgba(34,211,238,0.15)" strokeWidth="0.6" />
      <line x1={bodyR} y1={bodyTop} x2={bodyR} y2={bodyBot}
        stroke="rgba(34,211,238,0.1)" strokeWidth="0.6" />

      {[0.25, 0.5, 0.75].map((pct) => {
        const ty = bodyTop + bodyH * pct;
        return (
          <g key={`tick-${pct}`}>
            <line x1={bodyL - 3} y1={ty} x2={bodyL} y2={ty}
              stroke="rgba(34,211,238,0.2)" strokeWidth="0.5" />
            <line x1={bodyR} y1={ty} x2={bodyR + 3} y2={ty}
              stroke="rgba(34,211,238,0.15)" strokeWidth="0.5" />
          </g>
        );
      })}

      <text x={cx} y={bodyTop + bodyH / 2 + 6} textAnchor="middle"
        fontSize="20" fontWeight="700"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
        fill="white" opacity="0.95"
        paintOrder="stroke" stroke="rgba(0,0,0,0.8)" strokeWidth="3"
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
        @keyframes silo-shimmer {
          0%, 100% { opacity: 0.6; transform: translateY(0); }
          50% { opacity: 0.2; transform: translateY(2px); }
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
