import { useState, useRef, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useThumbnailCapture } from '../ThumbnailCaptureContext';
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

function useAnimatedNumber(target, decimals, skipAnimation) {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef(null);
  const fromRef = useRef(target);
  const startRef = useRef(null);

  useEffect(() => {
    if (skipAnimation || target == null) { setDisplay(target); return; }
    const from = fromRef.current ?? target;
    const diff = target - from;
    if (Math.abs(diff) < 0.0001) { setDisplay(target); return; }
    startRef.current = performance.now();
    const animate = (now) => {
      const t = Math.min((now - startRef.current) / 350, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + diff * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, skipAnimation]);

  useEffect(() => { fromRef.current = display; }, [display]);
  if (target == null) return '—';
  return Number(display).toFixed(decimals);
}

export default function ProgressWidget({ config, tagValues }) {
  const prefersReducedMotion = useReducedMotion();
  const isCapturing = useThumbnailCapture();
  const skipAnimation = prefersReducedMotion || isCapturing;

  const raw = resolveValue(config, tagValues);
  const numericValue = raw != null ? Number(raw) : null;

  const min = config.min ?? 0;
  const max = config.max ?? 100;
  const decimals = config.decimals ?? 1;
  const showTitle = config.showTitle !== false;
  const showValue = config.showValue !== false;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;
  const zones = config.zones || [];

  const percent = numericValue != null
    ? Math.max(0, Math.min(100, ((numericValue - min) / (max - min || 1)) * 100))
    : 0;

  const barColor = getZoneColor(percent, zones);
  const display = useAnimatedNumber(numericValue, decimals, skipAnimation);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: '4px',
      padding: '8px 12px',
      height: '100%',
    }}>
      {/* Title + value row */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
        {showTitle && (
          <p
            className="rb-widget-title"
            style={{
              fontSize: titleFontSize,
              margin: 0,
              color: 'var(--rb-text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              minWidth: 0,
            }}
          >
            {config.title || 'Progress'}
          </p>
        )}
        {showValue && (
          <span style={{
            fontSize: '13px',
            fontWeight: 700,
            color: barColor,
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {display}{config.unit ? ` ${config.unit}` : ''}
          </span>
        )}
      </div>

      {/* Bar */}
      <div style={{
        width: '100%',
        height: '10px',
        borderRadius: '5px',
        background: 'var(--rb-border, #e5e7eb)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        <div style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: '5px',
          background: barColor,
          transition: skipAnimation ? 'none' : 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
          minWidth: percent > 0 ? '4px' : '0',
        }} />
      </div>
    </div>
  );
}
