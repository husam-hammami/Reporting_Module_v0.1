import { useState, useRef, useEffect, useMemo } from 'react';
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

// Build sparkline points from history buffer
function buildSparklinePath(history, width, height, padding = 2) {
  if (!history || history.length < 2) return '';
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const step = (width - padding * 2) / (history.length - 1);

  return history.map((v, i) => {
    const x = padding + i * step;
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function buildAreaPath(history, width, height, padding = 2) {
  const linePath = buildSparklinePath(history, width, height, padding);
  if (!linePath) return '';
  const lastX = padding + (history.length - 1) * ((width - padding * 2) / (history.length - 1));
  return `${linePath} L${lastX.toFixed(1)},${height - padding} L${padding},${height - padding} Z`;
}

const MAX_HISTORY = 30;

export default function SparklineWidget({ config, tagValues }) {
  const prefersReducedMotion = useReducedMotion();
  const isCapturing = useThumbnailCapture();
  const skipAnimation = prefersReducedMotion || isCapturing;

  const raw = resolveValue(config, tagValues);
  const numericValue = raw != null ? Number(raw) : null;
  const decimals = config.decimals ?? 1;
  const color = config.color || '#3b82f6';
  const showTitle = config.showTitle !== false;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.sm;

  const display = useAnimatedNumber(numericValue, decimals, skipAnimation);

  // Maintain history buffer for sparkline
  const historyRef = useRef([]);
  useEffect(() => {
    if (numericValue != null) {
      historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), numericValue];
    }
  }, [numericValue]);

  const history = historyRef.current;
  const sparkW = 120;
  const sparkH = 32;

  const linePath = useMemo(() => buildSparklinePath(history, sparkW, sparkH), [history, sparkW, sparkH]);
  const areaPath = useMemo(() => buildAreaPath(history, sparkW, sparkH), [history, sparkW, sparkH]);

  const gradientId = useMemo(() => `spark-grad-${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      height: '100%',
    }}>
      {/* Title */}
      {showTitle && (
        <p
          className="rb-widget-title"
          style={{
            fontSize: titleFontSize,
            margin: 0,
            color: 'var(--rb-text-muted)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            minWidth: 0,
            maxWidth: '30%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {config.title || 'Sparkline'}
        </p>
      )}

      {/* Sparkline SVG */}
      <div style={{ flex: 1, minWidth: 40, height: sparkH }}>
        <svg width="100%" height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {areaPath && (
            <path d={areaPath} fill={`url(#${gradientId})`} />
          )}
          {linePath && (
            <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
      </div>

      {/* Value */}
      <div style={{ flexShrink: 0, textAlign: 'end' }}>
        <span style={{
          fontSize: '14px',
          fontWeight: 700,
          color: 'var(--rb-text)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {display}
        </span>
        {config.unit && (
          <span style={{
            fontSize: '9px',
            color: 'var(--rb-text-muted)',
            marginInlineStart: '2px',
          }}>
            {config.unit}
          </span>
        )}
      </div>
    </div>
  );
}
