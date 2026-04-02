import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useThumbnailCapture } from '../ThumbnailCaptureContext';
import { TITLE_FONT_SIZES } from './widgetDefaults';

const PALETTE = [
  '#22d3ee', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444',
  '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16',
];

function useAnimatedSlices(targetSlices, skipAnimation) {
  const [current, setCurrent] = useState(targetSlices);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(targetSlices);

  useEffect(() => {
    if (skipAnimation) { setCurrent(targetSlices); fromRef.current = targetSlices; return; }
    const from = fromRef.current;
    if (JSON.stringify(from) === JSON.stringify(targetSlices)) return;
    const duration = 600;
    startRef.current = performance.now();
    const animate = (now) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const interpolated = targetSlices.map((slice, i) => ({
        ...slice,
        value: (from[i]?.value ?? 0) + ((slice.value ?? 0) - (from[i]?.value ?? 0)) * eased,
      }));
      setCurrent(interpolated);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = targetSlices;
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [targetSlices, skipAnimation]);

  return current;
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const rad = (a) => (a * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function describeDoughnutArc(cx, cy, outerR, innerR, startAngle, endAngle) {
  const rad = (a) => (a * Math.PI) / 180;
  const clampedEnd = Math.min(endAngle, startAngle + 359.99);
  const ox1 = cx + outerR * Math.cos(rad(startAngle));
  const oy1 = cy + outerR * Math.sin(rad(startAngle));
  const ox2 = cx + outerR * Math.cos(rad(clampedEnd));
  const oy2 = cy + outerR * Math.sin(rad(clampedEnd));
  const ix1 = cx + innerR * Math.cos(rad(clampedEnd));
  const iy1 = cy + innerR * Math.sin(rad(clampedEnd));
  const ix2 = cx + innerR * Math.cos(rad(startAngle));
  const iy2 = cy + innerR * Math.sin(rad(startAngle));
  const largeArc = clampedEnd - startAngle > 180 ? 1 : 0;
  return `M ${ox1} ${oy1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
}

export default function PieChartWidget({ config, tagValues }) {
  const prefersReducedMotion = useReducedMotion();
  const isCapturing = useThumbnailCapture();
  const skipAnimation = prefersReducedMotion || isCapturing;
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const svgRef = useRef(null);

  const series = config.series || [];
  const isDoughnut = config.doughnut !== false;
  const showLegend = config.showLegend !== false;
  const titleSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;

  const slicesData = useMemo(() => {
    if (series.length === 0) {
      return [
        { label: 'Segment A', value: 35, color: PALETTE[0] },
        { label: 'Segment B', value: 25, color: PALETTE[1] },
        { label: 'Segment C', value: 20, color: PALETTE[2] },
        { label: 'Segment D', value: 12, color: PALETTE[3] },
        { label: 'Segment E', value: 8, color: PALETTE[4] },
      ];
    }
    return series.map((s, i) => {
      const tagName = s.dataSource?.tagName ?? s.tagName;
      const raw = tagValues?.[tagName];
      const val = raw != null ? Math.max(0, Number(raw)) : 0;
      return {
        label: s.label || tagName || `Series ${i + 1}`,
        value: val,
        color: s.color || PALETTE[i % PALETTE.length],
      };
    });
  }, [series, tagValues]);

  const animatedSlices = useAnimatedSlices(slicesData, skipAnimation);

  const total = useMemo(() => animatedSlices.reduce((sum, s) => sum + s.value, 0), [animatedSlices]);

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let startAngle = -90;
    return animatedSlices.map((slice) => {
      const sweep = (slice.value / total) * 360;
      const arc = { ...slice, startAngle, endAngle: startAngle + sweep, sweep };
      startAngle += sweep;
      return arc;
    });
  }, [animatedSlices, total]);

  const handleMouseMove = useCallback((e, idx, arc) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top - 10,
      label: arc.label,
      value: slicesData[idx]?.value ?? 0,
      percent: total > 0 ? ((slicesData[idx]?.value ?? 0) / slicesData.reduce((s, d) => s + d.value, 0) * 100) : 0,
      color: arc.color,
    });
    setHoveredIdx(idx);
  }, [slicesData, total]);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    setHoveredIdx(null);
  }, []);

  const cx = 100;
  const cy = 100;
  const outerR = 85;
  const innerR = isDoughnut ? 52 : 0;
  const gapAngle = arcs.length > 1 ? 1.5 : 0;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {config.showTitle !== false && config.title && (
        <div className="px-3 pt-2.5 pb-1 flex-shrink-0">
          <p className="font-semibold text-[var(--rb-text)] truncate" style={{ fontSize: titleSize }}>{config.title}</p>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center min-h-0 px-2 pb-2 gap-2">
        <div className="relative flex-shrink-0" style={{ width: '55%', maxWidth: 200 }}>
          <svg ref={svgRef} viewBox="0 0 200 200" className="w-full h-full drop-shadow-lg" onMouseLeave={handleMouseLeave}>
            <defs>
              {arcs.map((arc, i) => (
                <filter key={`glow-${i}`} id={`pie-glow-${i}`}>
                  <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor={arc.color} floodOpacity="0.4" />
                </filter>
              ))}
            </defs>

            {arcs.length === 0 && (
              <circle cx={cx} cy={cy} r={outerR} fill="none" stroke="var(--rb-border, #1e293b)" strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
            )}

            {arcs.map((arc, i) => {
              const adjustedStart = arc.startAngle + gapAngle / 2;
              const adjustedEnd = arc.endAngle - gapAngle / 2;
              if (adjustedEnd <= adjustedStart) return null;
              const isHovered = hoveredIdx === i;
              const midAngle = ((adjustedStart + adjustedEnd) / 2) * (Math.PI / 180);
              const hoverOffset = isHovered ? 6 : 0;
              const tx = Math.cos(midAngle) * hoverOffset;
              const ty = Math.sin(midAngle) * hoverOffset;

              const path = isDoughnut
                ? describeDoughnutArc(cx, cy, outerR, innerR, adjustedStart, adjustedEnd)
                : describeArc(cx, cy, outerR, adjustedStart, adjustedEnd);

              return (
                <path
                  key={i}
                  d={path}
                  fill={arc.color}
                  opacity={hoveredIdx !== null && !isHovered ? 0.5 : 1}
                  filter={isHovered ? `url(#pie-glow-${i})` : undefined}
                  style={{
                    transform: `translate(${tx}px, ${ty}px)`,
                    transition: 'transform 0.2s ease, opacity 0.2s ease',
                    cursor: 'pointer',
                  }}
                  onMouseMove={(e) => handleMouseMove(e, i, arc)}
                  onMouseEnter={() => setHoveredIdx(i)}
                />
              );
            })}

            {isDoughnut && total > 0 && (
              <g>
                <text x={cx} y={cy - 4} textAnchor="middle" className="fill-[var(--rb-text,#f0f4f8)]" style={{ fontSize: '18px', fontWeight: 700, fontFamily: 'system-ui' }}>
                  {slicesData.reduce((s, d) => s + d.value, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </text>
                <text x={cx} y={cy + 14} textAnchor="middle" className="fill-[var(--rb-text-muted,#556677)]" style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.05em' }}>
                  TOTAL
                </text>
              </g>
            )}
          </svg>

          {tooltip && (
            <div
              className="absolute pointer-events-none z-20 px-3 py-2 rounded-lg shadow-xl text-[10px] whitespace-nowrap"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: 'translate(-50%, -100%)',
                background: 'var(--rb-panel, #111827)',
                border: '1px solid var(--rb-border, #1e293b)',
                color: 'var(--rb-text, #f0f4f8)',
              }}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tooltip.color }} />
                <span className="font-semibold">{tooltip.label}</span>
              </div>
              <div className="flex items-center gap-3 text-[var(--rb-text-secondary,#8899ab)]">
                <span>{tooltip.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                <span className="font-bold" style={{ color: tooltip.color }}>{tooltip.percent.toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>

        {showLegend && (
          <div className="flex flex-col gap-1 min-w-0 overflow-y-auto max-h-full py-1" style={{ maxWidth: '45%' }}>
            {slicesData.map((slice, i) => {
              const realTotal = slicesData.reduce((s, d) => s + d.value, 0);
              const pct = realTotal > 0 ? (slice.value / realTotal * 100).toFixed(1) : '0.0';
              return (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 rounded-md transition-colors cursor-default"
                  style={{
                    background: hoveredIdx === i ? 'var(--rb-surface-alt, rgba(34,211,238,0.05))' : 'transparent',
                  }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: slice.color }} />
                  <span className="text-[10px] text-[var(--rb-text,#f0f4f8)] whitespace-nowrap font-medium">{slice.label}</span>
                  <span className="text-[10px] text-[var(--rb-text-muted,#556677)] font-mono tabular-nums flex-shrink-0">{pct}%</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
