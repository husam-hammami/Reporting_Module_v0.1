import { useMemo } from 'react';
import { evaluateFormula } from '../formulas/formulaEngine';
import { TITLE_FONT_SIZES } from './widgetDefaults';

function resolveValue(config, tagValues) {
  const ds = config.dataSource;
  if (!ds) return null;
  if (ds.type === 'formula' && ds.formula) return evaluateFormula(ds.formula, tagValues);
  if (ds.type === 'group' && ds.groupTags?.length) {
    const vals = ds.groupTags.map((t) => Number(tagValues?.[t]) || 0);
    if (!vals.length) return null;
    const agg = ds.aggregation || 'avg';
    if (agg === 'sum') return vals.reduce((a, b) => a + b, 0);
    if (agg === 'min') return Math.min(...vals);
    if (agg === 'max') return Math.max(...vals);
    if (agg === 'count') return vals.length;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
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

export default function HopperWidget({ config, tagValues }) {
  const raw = resolveValue(config, tagValues);
  const numericValue = raw != null ? Number(raw) : null;

  const decimals = config.decimals ?? 1;
  const showTitle = config.showTitle !== false;
  const showCapacity = config.showCapacity === true;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;
  const zones = config.zones || [];

  const percent = numericValue != null ? Math.max(0, Math.min(100, numericValue)) : 0;
  const fillColor = getZoneColor(percent, zones);

  // Capacity from secondary tag
  const capacityRaw = config.capacityTag ? tagValues?.[config.capacityTag] : null;
  const capacity = capacityRaw != null ? Number(capacityRaw) : null;
  const tons = capacity != null && numericValue != null ? (numericValue / 100) * capacity : null;

  // Hopper SVG dimensions
  const W = 120;
  const H = 140;
  const topW = 100;    // top opening width
  const botW = 40;     // bottom outlet width
  const topY = 20;     // top of vessel
  const botY = 120;    // bottom of vessel
  const midX = W / 2;

  // Trapezoid corners (hopper shape: wider top, narrow bottom)
  const tl = { x: midX - topW / 2, y: topY };
  const tr = { x: midX + topW / 2, y: topY };
  const br = { x: midX + botW / 2, y: botY };
  const bl = { x: midX - botW / 2, y: botY };

  // Hopper outline path
  const outlinePath = `M${tl.x},${tl.y} L${tr.x},${tr.y} L${br.x},${br.y} L${bl.x},${bl.y} Z`;

  // Fill: clip from bottom up based on percent
  const fillH = (botY - topY) * (percent / 100);
  const fillY = botY - fillH;

  // Calculate fill width at fillY level (linear interpolation between top and bottom widths)
  const t = (fillY - topY) / (botY - topY); // 0 = top, 1 = bottom
  const fillTopW = topW + (botW - topW) * t;
  const fillBotW = botW;

  const fillPath = useMemo(() => {
    const ftl = { x: midX - fillTopW / 2, y: fillY };
    const ftr = { x: midX + fillTopW / 2, y: fillY };
    return `M${ftl.x},${ftl.y} L${ftr.x},${ftr.y} L${br.x},${br.y} L${bl.x},${bl.y} Z`;
  }, [fillTopW, fillY, midX, br, bl]);

  const clipId = useMemo(() => `hopper-clip-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '4px 8px',
      height: '100%',
      gap: '2px',
    }}>
      {/* Title */}
      {showTitle && (
        <p
          className="rb-widget-title"
          style={{
            fontSize: titleFontSize,
            margin: 0,
            color: 'var(--rb-text-muted)',
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            width: '100%',
          }}
        >
          {config.title || 'Hopper'}
        </p>
      )}

      {/* SVG Hopper */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: '100%', maxWidth: '140px' }}>
          <defs>
            <clipPath id={clipId}>
              <path d={outlinePath} />
            </clipPath>
          </defs>

          {/* Vessel outline (subtle) */}
          <path d={outlinePath} fill="var(--rb-surface-alt, #f3f4f6)" stroke="var(--rb-border, #d1d5db)" strokeWidth="1.5" />

          {/* Fill level */}
          {percent > 0 && (
            <path d={fillPath} fill={fillColor} opacity={0.85} clipPath={`url(#${clipId})`}>
              <animate
                attributeName="opacity"
                values="0.75;0.9;0.75"
                dur="3s"
                repeatCount="indefinite"
              />
            </path>
          )}

          {/* Percentage text centered */}
          <text
            x={midX}
            y={topY + (botY - topY) * 0.45}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: '16px',
              fontWeight: 700,
              fill: percent > 40 ? '#fff' : 'var(--rb-text, #111)',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {numericValue != null ? `${numericValue.toFixed(decimals)}%` : '—'}
          </text>

          {/* Bottom outlet (small rectangle) */}
          <rect x={midX - 8} y={botY} width={16} height={6} rx={2} fill="var(--rb-border, #d1d5db)" />
        </svg>
      </div>

      {/* Capacity / Tons info */}
      {showCapacity && capacity != null && (
        <div style={{
          display: 'flex',
          gap: '12px',
          fontSize: '9px',
          color: 'var(--rb-text-muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {tons != null && <span>{tons.toFixed(1)} {config.unit || 't'}</span>}
          <span>/ {capacity.toFixed(0)} {config.unit || 't'}</span>
        </div>
      )}
    </div>
  );
}
