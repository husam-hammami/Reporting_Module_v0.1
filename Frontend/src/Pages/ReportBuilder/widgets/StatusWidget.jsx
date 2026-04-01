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

function getZoneMatch(value, zones) {
  if (value == null || !Array.isArray(zones) || zones.length === 0) {
    return { color: '#6b7280', status: 'UNKNOWN' };
  }
  const v = Number(value);
  for (const z of zones) {
    if (v >= z.from && v <= z.to) {
      return { color: z.color, status: z.status || '' };
    }
  }
  return { color: '#6b7280', status: 'UNKNOWN' };
}

export default function StatusWidget({ config, tagValues }) {
  const raw = resolveValue(config, tagValues);
  const numericValue = raw != null ? Number(raw) : null;

  const zones = config.zones || [];
  const showTitle = config.showTitle !== false;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;

  const { color, status } = useMemo(() => getZoneMatch(numericValue, zones), [numericValue, zones]);

  // Determine if pulsing (non-zero, non-null = active/running)
  const isActive = numericValue != null && numericValue > 0 && status !== 'STOPPED';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '4px 8px',
      height: '100%',
    }}>
      {/* Status circle */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <svg width="28" height="28" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="11" fill={color} opacity={0.15} />
          <circle cx="14" cy="14" r="7" fill={color} />
        </svg>
        {isActive && (
          <svg
            width="28" height="28" viewBox="0 0 28 28"
            style={{ position: 'absolute', top: 0, left: 0 }}
          >
            <circle
              cx="14" cy="14" r="11"
              fill="none"
              stroke={color}
              strokeWidth="2"
              opacity="0.4"
              style={{ animation: 'statusPulse 2s ease-in-out infinite' }}
            />
          </svg>
        )}
      </div>

      {/* Text */}
      <div style={{ minWidth: 0, flex: 1 }}>
        {showTitle && (
          <p
            className="rb-widget-title"
            style={{
              fontSize: titleFontSize,
              margin: 0,
              lineHeight: 1.3,
              color: 'var(--rb-text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {config.title || 'Status'}
          </p>
        )}
        <p style={{
          margin: 0,
          fontSize: '13px',
          fontWeight: 700,
          color,
          lineHeight: 1.3,
          letterSpacing: '0.02em',
        }}>
          {status || (numericValue != null ? numericValue : '—')}
        </p>
      </div>

      <style>{`
        @keyframes statusPulse {
          0%, 100% { r: 11; opacity: 0.4; }
          50% { r: 13; opacity: 0.1; }
        }
      `}</style>
    </div>
  );
}
