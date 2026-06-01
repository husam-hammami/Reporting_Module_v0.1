import { useMemo, useRef, useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useThumbnailCapture } from '../ThumbnailCaptureContext';
import { evaluateFormula } from '../formulas/formulaEngine';
import { VALUE_FONT_SIZES, TITLE_FONT_SIZES } from './widgetDefaults';

function resolveValue(config, tagValues) {
  const ds = config.dataSource;
  if (!ds) return tagValues?.[config.tagName] ?? null;
  if (ds.type === 'formula' && ds.formula) {
    return evaluateFormula(ds.formula, tagValues);
  }
  if (ds.type === 'group' && ds.groupTags?.length) {
    const vals = ds.groupTags.map((t) => Number(tagValues?.[t]) || 0);
    if (vals.length === 0) return null;
    switch (ds.aggregation) {
      case 'sum': return vals.reduce((a, b) => a + b, 0);
      case 'min': return Math.min(...vals);
      case 'max': return Math.max(...vals);
      case 'count': return vals.length;
      case 'delta': {
        if (vals.length < 2) return 0;
        return vals[vals.length - 1] - vals[0];
      }
      default: return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
  return tagValues?.[ds.tagName] ?? null;
}

function getThresholdColor(value, thresholds, defaultColor) {
  if (!Array.isArray(thresholds) || thresholds.length === 0 || value == null) return defaultColor;
  for (const rule of thresholds) {
    const v = Number(value);
    if (rule.condition === 'above' && v > rule.value) return rule.color;
    if (rule.condition === 'below' && v < rule.value) return rule.color;
    if (rule.condition === 'between' && v >= rule.value && v <= rule.valueTo) return rule.color;
    if (rule.condition === 'equals' && v === rule.value) return rule.color;
  }
  return defaultColor;
}

function buildSparklinePoints(data, height = 40) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const n = data.length;
  return data
    .map((v, i) => {
      const x = n === 1 ? 50 : (i / (n - 1)) * 100;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function useAnimatedNumber(target, decimals, skipAnimation) {
  const [display, setDisplay] = useState(target);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const fromRef = useRef(target);

  useEffect(() => {
    if (skipAnimation || target == null) {
      setDisplay(target);
      return;
    }
    const from = fromRef.current ?? target;
    const diff = target - from;
    if (Math.abs(diff) < 0.0001) {
      setDisplay(target);
      return;
    }
    const duration = 350;
    startRef.current = performance.now();
    const animate = (now) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + diff * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, skipAnimation]);

  useEffect(() => { fromRef.current = display; }, [display]);

  if (target == null) return '\u2014';
  return Number(display).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function KPIWidget({ config, tagValues, sparklineData, layout }) {
  const prefersReducedMotion = useReducedMotion();
  const isCapturing = useThumbnailCapture();
  const skipAnimation = prefersReducedMotion || isCapturing;

  const rawValue = resolveValue(config, tagValues);
  const numericValue = rawValue != null ? Number(rawValue) : null;
  const decimals = config.decimals ?? 1;
  const displayValue = useAnimatedNumber(numericValue, decimals, skipAnimation);
  const activeColor = getThresholdColor(rawValue, config.thresholds, config.color || '#2563eb');

  const sparkValues = useMemo(
    () => Array.isArray(sparklineData) && sparklineData.length >= 2
      ? sparklineData.map((p) => (typeof p === 'object' && p !== null ? p.v : p))
      : null,
    [sparklineData],
  );
  const sparklinePoints = useMemo(
    () => sparkValues ? buildSparklinePoints(sparkValues, 40) : null,
    [sparkValues],
  );

  const sparkAreaPath = useMemo(() => {
    if (!sparklinePoints) return null;
    return `M0,40 L${sparklinePoints} L100,40 Z`;
  }, [sparklinePoints]);

  const [sparkVisible, setSparkVisible] = useState(skipAnimation);
  useEffect(() => {
    if (skipAnimation) { setSparkVisible(true); return; }
    const timer = setTimeout(() => setSparkVisible(true), 100);
    return () => clearTimeout(timer);
  }, [skipAnimation]);

  const showTitle = config.showTitle !== false;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;
  const valueFontSize = VALUE_FONT_SIZES[config.valueFontSize];
  const align = config.align || 'center';

  const isCompact = layout?.h === 1;

  const glowBarId = useMemo(() => `kpi-glow-${Math.random().toString(36).slice(2, 7)}`, []);
  const sparkGradId = useMemo(() => `kpi-spark-${Math.random().toString(36).slice(2, 7)}`, []);

  if (isCompact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          padding: '4px 10px',
          borderLeft: `3px solid ${activeColor}`,
          gap: '8px',
          minHeight: 0,
        }}
      >
        {showTitle && (
          <span
            className="rb-widget-title"
            style={{
              fontSize: titleFontSize,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {config.title || 'KPI'}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
          <span
            className="rb-value-primary"
            style={{
              color: activeColor,
              fontSize: valueFontSize || 'clamp(16px, 2.5vw, 24px)',
            }}
          >
            {displayValue}
          </span>
          {config.unit && (
            <span className="rb-value-unit">{config.unit}</span>
          )}
        </div>
      </div>
    );
  }

  const alignItems = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
  const textAlign = align;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        justifyContent: 'center',
        alignItems,
        padding: '4px 8px',
        minHeight: 0,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {showTitle && (
        <p
          className="rb-widget-title truncate w-full"
          style={{
            fontSize: titleFontSize,
            textAlign,
            marginBottom: '4px',
          }}
        >
          {config.title || 'KPI'}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '6px',
          justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        }}
      >
        <span
          className="rb-value-primary"
          style={{
            color: activeColor,
            fontSize: valueFontSize || (displayValue.length > 10 ? 'clamp(18px, 3vw, 28px)' : displayValue.length > 7 ? 'clamp(20px, 3.5vw, 34px)' : 'clamp(24px, 4vw, 42px)'),
            fontWeight: 800,
            letterSpacing: '-0.03em',
          }}
        >
          {displayValue}
        </span>
        {config.unit && (
          <span className="rb-value-unit">{config.unit}</span>
        )}
      </div>

      <div
        style={{
          width: align === 'center' ? '40px' : '32px',
          height: '3px',
          borderRadius: '2px',
          background: activeColor,
          marginTop: '6px',
          alignSelf: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        }}
      />

      {config.showSparkline && (
        <div
          style={{
            width: '100%',
            height: '28px',
            marginTop: '6px',
            opacity: sparkVisible ? 1 : 0,
            transform: sparkVisible ? 'translateY(0)' : 'translateY(4px)',
            transition: skipAnimation ? 'none' : 'opacity 300ms ease, transform 300ms ease',
            overflow: 'hidden',
          }}
        >
          <svg viewBox="0 0 100 40" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
            <defs>
              <linearGradient id={sparkGradId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={activeColor} stopOpacity="0.3" />
                <stop offset="100%" stopColor={activeColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {sparkAreaPath && (
              <path
                d={sparkAreaPath}
                fill={`url(#${sparkGradId})`}
              />
            )}
            <polyline
              fill="none"
              stroke={activeColor}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={sparklinePoints ?? '0,30 10,24 20,28 30,16 40,20 50,12 60,18 70,8 80,14 90,6 100,10'}
            />
          </svg>
        </div>
      )}
    </div>
  );
}
