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

  const bodyL = 30;
  const bodyR = W - 30;
  const bodyW = bodyR - bodyL;
  const bodyRx = bodyW / 2;

  const capTop = 26;
  const capBase = 38;
  const capEllipseRy = 8;

  const bodyTop = capBase;
  const bodyBot = 172;
  const bodyH = bodyBot - bodyTop;

  const baseTop = bodyBot;
  const baseBot = 192;

  const fillH = bodyH * fillRatio;
  const fillY = bodyBot - fillH;
  const hasWave = fillRatio > 0.03 && fillRatio < 0.97 && !skipAnimation;
  const isLow = fillRatio > 0 && fillRatio < 0.15;

  const rgb = hexToRgb(fillColor.length === 7 ? fillColor : '#3b82f6');
  const fillDark = `rgb(${Math.max(rgb.r - 50, 0)}, ${Math.max(rgb.g - 50, 0)}, ${Math.max(rgb.b - 50, 0)})`;
  const fillLight = `rgb(${Math.min(rgb.r + 70, 255)}, ${Math.min(rgb.g + 70, 255)}, ${Math.min(rgb.b + 70, 255)})`;
  const fillVLight = `rgba(${Math.min(rgb.r + 100, 255)}, ${Math.min(rgb.g + 100, 255)}, ${Math.min(rgb.b + 100, 255)}, 0.5)`;

  const bandCount = 9;
  const bandSpacing = bodyH / (bandCount + 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden role="img">
      <defs>
        <linearGradient id={`${uid}-concrete`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5c6268" />
          <stop offset="10%" stopColor="#6a7076" />
          <stop offset="25%" stopColor="#7a8086" />
          <stop offset="40%" stopColor="#868c92" />
          <stop offset="50%" stopColor="#8c9298" />
          <stop offset="60%" stopColor="#868c92" />
          <stop offset="75%" stopColor="#7a8086" />
          <stop offset="90%" stopColor="#6a7076" />
          <stop offset="100%" stopColor="#5c6268" />
        </linearGradient>

        <linearGradient id={`${uid}-concrete-bot`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4a5058" />
          <stop offset="20%" stopColor="#565c62" />
          <stop offset="50%" stopColor="#626870" />
          <stop offset="80%" stopColor="#565c62" />
          <stop offset="100%" stopColor="#4a5058" />
        </linearGradient>

        <linearGradient id={`${uid}-cap`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#606870" />
          <stop offset="25%" stopColor="#727a82" />
          <stop offset="50%" stopColor="#7e868e" />
          <stop offset="75%" stopColor="#727a82" />
          <stop offset="100%" stopColor="#606870" />
        </linearGradient>

        <linearGradient id={`${uid}-cap-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.1" />
          <stop offset="60%" stopColor="white" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.08" />
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

        <linearGradient id={`${uid}-base-g`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#484e54" />
          <stop offset="20%" stopColor="#565c62" />
          <stop offset="50%" stopColor="#62686e" />
          <stop offset="80%" stopColor="#565c62" />
          <stop offset="100%" stopColor="#484e54" />
        </linearGradient>

        <clipPath id={`${uid}-body-clip`}>
          <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH} />
        </clipPath>
      </defs>

      <rect x={bodyL - 6} y={baseTop + capEllipseRy - 2} width={bodyW + 12} height={baseBot - baseTop - capEllipseRy + 4}
        fill={`url(#${uid}-base-g)`} rx="2" />
      <line x1={bodyL - 6} y1={baseTop + capEllipseRy - 2} x2={bodyR + 6} y2={baseTop + capEllipseRy - 2}
        stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
      <line x1={bodyL - 6} y1={baseBot + 2} x2={bodyR + 6} y2={baseBot + 2}
        stroke="rgba(0,0,0,0.12)" strokeWidth="0.5" />

      <rect x={bodyL} y={bodyTop} width={bodyW} height={bodyH}
        fill={`url(#${uid}-concrete)`} stroke="#6a7078" strokeWidth="0.7" />

      {Array.from({ length: bandCount }, (_, i) => {
        const by = bodyTop + bandSpacing * (i + 1);
        return (
          <g key={i}>
            <line x1={bodyL} y1={by} x2={bodyR} y2={by}
              stroke="rgba(0,0,0,0.08)" strokeWidth="1.2" />
            <line x1={bodyL} y1={by - 1} x2={bodyR} y2={by - 1}
              stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
          </g>
        );
      })}

      <rect x={bodyL} y={bodyTop} width={4} height={bodyH}
        fill="rgba(255,255,255,0.03)" />
      <rect x={bodyR - 3} y={bodyTop} width={3} height={bodyH}
        fill="rgba(0,0,0,0.04)" />

      {fillH > 0 && (
        <g clipPath={`url(#${uid}-body-clip)`}>
          <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
            fill={`url(#${uid}-fill-h)`} />
          <rect x={bodyL} y={fillY} width={bodyW} height={fillH + 1}
            fill={`url(#${uid}-fill-v)`} />

          {Array.from({ length: bandCount }, (_, i) => {
            const by = bodyTop + bandSpacing * (i + 1);
            if (by < fillY || by > bodyBot) return null;
            return (
              <g key={`fb-${i}`}>
                <line x1={bodyL} y1={by} x2={bodyR} y2={by}
                  stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
                <line x1={bodyL} y1={by - 1} x2={bodyR} y2={by - 1}
                  stroke="rgba(255,255,255,0.08)" strokeWidth="0.4" />
              </g>
            );
          })}

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

      <ellipse cx={cx} cy={bodyBot} rx={bodyRx} ry={capEllipseRy}
        fill={`url(#${uid}-concrete-bot)`} stroke="#586068" strokeWidth="0.6" />

      <rect x={bodyL} y={capTop} width={bodyW} height={capBase - capTop}
        fill={`url(#${uid}-cap)`} stroke="#6a7078" strokeWidth="0.7" />
      <rect x={bodyL} y={capTop} width={bodyW} height={capBase - capTop}
        fill={`url(#${uid}-cap-v)`} />

      <line x1={bodyL} y1={capTop} x2={bodyR} y2={capTop}
        stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />

      <ellipse cx={cx} cy={capBase} rx={bodyRx} ry={capEllipseRy}
        fill={`url(#${uid}-concrete)`} stroke="#6a7078" strokeWidth="0.6" />
      <ellipse cx={cx} cy={capBase} rx={bodyRx - 4} ry={capEllipseRy - 2}
        fill="rgba(255,255,255,0.04)" />

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
