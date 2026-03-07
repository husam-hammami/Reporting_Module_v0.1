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

function SiloSvg({ fillPercent, fillColor, skipAnimation }) {
  const fillRatio = Math.max(0, Math.min(1, fillPercent / 100));
  const uid = React.useId ? React.useId() : `s-${Math.random().toString(36).slice(2, 8)}`;

  const W = 120;
  const H = 160;
  const cx = W / 2;
  const bodyLeft = 20;
  const bodyRight = W - 20;
  const bodyW = bodyRight - bodyLeft;
  const bodyTop = 28;
  const bodyBottom = 130;
  const bodyH = bodyBottom - bodyTop;
  const topRx = bodyW / 2;
  const topRy = 10;
  const botRy = 8;
  const legH = 18;

  const fillH = bodyH * fillRatio;
  const fillY = bodyBottom - fillH;
  const hasWave = fillRatio > 0.03 && fillRatio < 0.97 && !skipAnimation;
  const isLow = fillRatio > 0 && fillRatio < 0.15;
  const isHigh = fillRatio > 0.85;

  const rgb = hexToRgb(fillColor.length === 7 ? fillColor : '#3b82f6');
  const fillLight = `rgba(${Math.min(rgb.r + 80, 255)}, ${Math.min(rgb.g + 80, 255)}, ${Math.min(rgb.b + 80, 255)}, 0.6)`;
  const fillDark = `rgba(${Math.max(rgb.r - 40, 0)}, ${Math.max(rgb.g - 40, 0)}, ${Math.max(rgb.b - 40, 0)}, 1)`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden role="img">
      <defs>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3a4858" />
          <stop offset="12%" stopColor="#5a7088" />
          <stop offset="28%" stopColor="#8aa0b8" />
          <stop offset="42%" stopColor="#b8cce0" />
          <stop offset="50%" stopColor="#d0e0f0" />
          <stop offset="58%" stopColor="#b8cce0" />
          <stop offset="72%" stopColor="#8aa0b8" />
          <stop offset="88%" stopColor="#5a7088" />
          <stop offset="100%" stopColor="#3a4858" />
        </linearGradient>
        <linearGradient id={`${uid}-body-dark`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1a2838" />
          <stop offset="12%" stopColor="#2a3e54" />
          <stop offset="28%" stopColor="#3a5670" />
          <stop offset="42%" stopColor="#4a6a88" />
          <stop offset="50%" stopColor="#5a7a98" />
          <stop offset="58%" stopColor="#4a6a88" />
          <stop offset="72%" stopColor="#3a5670" />
          <stop offset="88%" stopColor="#2a3e54" />
          <stop offset="100%" stopColor="#1a2838" />
        </linearGradient>
        <linearGradient id={`${uid}-cap`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0eaf4" />
          <stop offset="40%" stopColor="#a0b8d0" />
          <stop offset="100%" stopColor="#6a8098" />
        </linearGradient>
        <linearGradient id={`${uid}-liquid`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fillDark} />
          <stop offset="25%" stopColor={fillColor} stopOpacity="0.92" />
          <stop offset="45%" stopColor={fillLight} />
          <stop offset="55%" stopColor={fillColor} />
          <stop offset="75%" stopColor={fillColor} stopOpacity="0.92" />
          <stop offset="100%" stopColor={fillDark} />
        </linearGradient>
        <linearGradient id={`${uid}-liquid-v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.12" />
          <stop offset="50%" stopColor="transparent" stopOpacity="0" />
          <stop offset="100%" stopColor="black" stopOpacity="0.15" />
        </linearGradient>
        <linearGradient id={`${uid}-highlight`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.22" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-leg`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#4a5a6a" />
          <stop offset="50%" stopColor="#8a9aaa" />
          <stop offset="100%" stopColor="#4a5a6a" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="0.5" cy="0" r="0.8">
          <stop offset="0%" stopColor={fillColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${uid}-clip`}>
          <rect x={bodyLeft} y={bodyTop} width={bodyW} height={bodyH} />
        </clipPath>
      </defs>

      <line x1={bodyLeft + 12} y1={bodyBottom} x2={bodyLeft + 4} y2={bodyBottom + legH} stroke={`url(#${uid}-leg)`} strokeWidth="3.5" strokeLinecap="round" />
      <line x1={bodyRight - 12} y1={bodyBottom} x2={bodyRight - 4} y2={bodyBottom + legH} stroke={`url(#${uid}-leg)`} strokeWidth="3.5" strokeLinecap="round" />
      <line x1={cx} y1={bodyBottom} x2={cx} y2={bodyBottom + legH + 2} stroke={`url(#${uid}-leg)`} strokeWidth="3" strokeLinecap="round" />
      <rect x={bodyLeft - 2} y={bodyBottom + legH - 1} width={bodyW + 4} height="3" rx="1.5" fill="#5a6a7a" opacity="0.5" />

      <rect x={bodyLeft} y={bodyTop} width={bodyW} height={bodyH} rx="3"
        fill={`url(#${uid}-body)`} stroke="#667888" strokeWidth="0.8" />
      <rect x={bodyLeft} y={bodyTop} width={bodyW} height={bodyH} rx="3"
        fill={`url(#${uid}-highlight)`} />

      <line x1={bodyLeft + 4} y1={bodyTop + 8} x2={bodyLeft + 4} y2={bodyBottom - 8}
        stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={bodyLeft + 8} y1={bodyTop + 12} x2={bodyLeft + 8} y2={bodyBottom - 12}
        stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" strokeLinecap="round" />

      {[0.25, 0.5, 0.75].map((mark) => {
        const my = bodyBottom - bodyH * mark;
        return (
          <g key={mark}>
            <line x1={bodyRight - 6} y1={my} x2={bodyRight - 2} y2={my}
              stroke="rgba(255,255,255,0.35)" strokeWidth="0.8" />
            <line x1={bodyLeft + 2} y1={my} x2={bodyLeft + 5} y2={my}
              stroke="rgba(255,255,255,0.2)" strokeWidth="0.6" />
          </g>
        );
      })}

      {fillH > 0 && (
        <g clipPath={`url(#${uid}-clip)`}>
          <rect x={bodyLeft} y={fillY} width={bodyW} height={fillH + 2}
            fill={`url(#${uid}-liquid)`} />
          <rect x={bodyLeft} y={fillY} width={bodyW} height={fillH + 2}
            fill={`url(#${uid}-liquid-v)`} />

          {hasWave && (
            <>
              <g style={{ animation: 'silo-wave-a 3.5s ease-in-out infinite' }}>
                <path
                  d={`M ${bodyLeft - 10} ${fillY}
                      C ${bodyLeft + bodyW * 0.15} ${fillY - 4},
                        ${bodyLeft + bodyW * 0.35} ${fillY + 4},
                        ${cx} ${fillY}
                      C ${bodyLeft + bodyW * 0.65} ${fillY - 4},
                        ${bodyLeft + bodyW * 0.85} ${fillY + 4},
                        ${bodyRight + 10} ${fillY}
                      L ${bodyRight + 10} ${fillY + 10}
                      L ${bodyLeft - 10} ${fillY + 10} Z`}
                  fill={fillColor} opacity="0.25"
                />
              </g>
              <g style={{ animation: 'silo-wave-b 4.5s ease-in-out infinite' }}>
                <path
                  d={`M ${bodyLeft - 5} ${fillY + 1}
                      C ${bodyLeft + bodyW * 0.2} ${fillY + 3},
                        ${bodyLeft + bodyW * 0.4} ${fillY - 3},
                        ${cx} ${fillY + 1}
                      C ${bodyLeft + bodyW * 0.6} ${fillY + 4},
                        ${bodyLeft + bodyW * 0.8} ${fillY - 2},
                        ${bodyRight + 5} ${fillY + 1}
                      L ${bodyRight + 5} ${fillY + 8}
                      L ${bodyLeft - 5} ${fillY + 8} Z`}
                  fill={fillLight} opacity="0.18"
                />
              </g>
            </>
          )}

          <ellipse cx={cx} cy={fillY} rx={bodyW / 2 - 2} ry={4}
            fill={fillColor} opacity="0.4" />
          <ellipse cx={cx - 6} cy={fillY} rx={bodyW / 4} ry={2}
            fill="white" opacity="0.07" />

          {isHigh && (
            <rect x={bodyLeft} y={fillY} width={bodyW} height={6}
              fill={`url(#${uid}-glow)`} opacity="0.6" />
          )}
        </g>
      )}

      <ellipse cx={cx} cy={bodyTop} rx={topRx} ry={topRy}
        fill={`url(#${uid}-cap)`} stroke="#8898a8" strokeWidth="0.6" />
      <ellipse cx={cx} cy={bodyTop} rx={topRx - 4} ry={topRy - 3}
        fill="rgba(255,255,255,0.12)" />
      <ellipse cx={cx - 8} cy={bodyTop - 1} rx={topRx / 3} ry={topRy / 3}
        fill="white" opacity="0.12" />

      <ellipse cx={cx} cy={bodyBottom} rx={topRx} ry={botRy}
        fill={`url(#${uid}-body-dark)`} stroke="#556678" strokeWidth="0.6" />

      {[bodyTop + bodyH * 0.15, bodyTop + bodyH * 0.55, bodyTop + bodyH * 0.85].map((ry, i) => (
        <g key={i} opacity="0.12">
          <line x1={bodyLeft - 1} y1={ry} x2={bodyRight + 1} y2={ry}
            stroke="#aabbcc" strokeWidth="0.4" />
        </g>
      ))}

      <text x={cx} y={bodyTop + bodyH / 2 + 6} textAnchor="middle"
        fontSize="22" fontWeight="800"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
        fill="white" opacity="0.95"
        paintOrder="stroke" stroke="rgba(0,0,0,0.45)" strokeWidth="0.8"
        style={{ textShadow: '0 2px 6px rgba(0,0,0,0.5)' }}
      >
        {Math.round(fillPercent)}%
      </text>

      {isLow && !skipAnimation && (
        <rect x={bodyLeft + 2} y={fillY - 2} width={bodyW - 4} height={fillH + 2}
          fill="none"
          className="silo-low-pulse"
          style={{ filter: 'drop-shadow(0 0 6px #ef4444)' }}
          clipPath={`url(#${uid}-clip)`}
        />
      )}

      <style>{`
        @keyframes silo-wave-a {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-8px); }
        }
        @keyframes silo-wave-b {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(6px); }
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
        <SiloSvg fillPercent={fillPercent} fillColor={fillColor} skipAnimation={skipAnimation} />
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
