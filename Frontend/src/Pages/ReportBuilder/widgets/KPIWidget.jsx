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

function buildSparklinePoints(data) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const n = data.length;
  return data
    .map((v, i) => {
      const x = n === 1 ? 50 : (i / (n - 1)) * 100;
      const y = 20 - ((v - min) / range) * 18 - 1;
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
  return Number(display).toFixed(decimals);
}

export default function KPIWidget({ config, tagValues, sparklineData }) {
  const prefersReducedMotion = useReducedMotion();
  const isCapturing = useThumbnailCapture();
  const skipAnimation = prefersReducedMotion || isCapturing;

  const rawValue = resolveValue(config, tagValues);
  const numericValue = rawValue != null ? Number(rawValue) : null;
  const decimals = config.decimals ?? 1;
  const displayValue = useAnimatedNumber(numericValue, decimals, skipAnimation);
  const activeColor = getThresholdColor(rawValue, config.thresholds, config.color || '#2563ab');

  const sparkValues = useMemo(
    () => Array.isArray(sparklineData) && sparklineData.length >= 2
      ? sparklineData.map((p) => (typeof p === 'object' && p !== null ? p.v : p))
      : null,
    [sparklineData],
  );
  const sparklinePoints = useMemo(
    () => sparkValues ? buildSparklinePoints(sparkValues) : null,
    [sparkValues],
  );

  const [sparkVisible, setSparkVisible] = useState(skipAnimation);
  useEffect(() => {
    if (skipAnimation) { setSparkVisible(true); return; }
    const timer = setTimeout(() => setSparkVisible(true), 100);
    return () => clearTimeout(timer);
  }, [skipAnimation]);

  const showTitle = config.showTitle !== false;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;
  const valueFontSize = VALUE_FONT_SIZES[config.valueFontSize];
  const align = config.align || 'left';

  const alignItems = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
  const justifyValue = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

  return (
    <div
      className="flex flex-col h-full justify-between min-h-0"
      style={{ padding: '6px 8px', alignItems }}
    >
      {showTitle && (
        <p
          className="rb-widget-title truncate w-full"
          style={{ fontSize: titleFontSize, textAlign: align }}
        >
          {config.title || 'KPI'}
        </p>
      )}
      <div className="flex items-baseline gap-1 mt-0.5" style={{ justifyContent: justifyValue }}>
        <span
          className="rb-value-primary"
          style={{
            color: activeColor,
            fontSize: valueFontSize || 'clamp(18px, 3vw, 32px)',
          }}
        >
          {displayValue}
        </span>
        {config.unit && (
          <span className="rb-value-unit">{config.unit}</span>
        )}
      </div>
      {config.showSparkline && (
        <div
          className="w-full overflow-hidden"
          style={{
            height: '16px',
            marginTop: '2px',
            opacity: sparkVisible ? 1 : 0,
            transform: sparkVisible ? 'translateY(0)' : 'translateY(4px)',
            transition: skipAnimation ? 'none' : 'opacity 300ms ease, transform 300ms ease',
          }}
        >
          <svg viewBox="0 0 100 20" className="w-full h-full" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke={activeColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={sparklinePoints ?? '0,15 10,12 20,14 30,8 40,10 50,6 60,9 70,4 80,7 90,3 100,5'}
              opacity="0.6"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
