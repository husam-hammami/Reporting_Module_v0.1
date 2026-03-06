import { useState, useRef, useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useThumbnailCapture } from '../ThumbnailCaptureContext';
import { evaluateFormula } from '../formulas/formulaEngine';
import { VALUE_FONT_SIZES, TITLE_FONT_SIZES } from './widgetDefaults';

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
    if (agg === 'delta') return vals.length < 2 ? 0 : vals[vals.length - 1] - vals[0];
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return tagValues?.[ds.tagName] ?? null;
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

const ALIGN_CLASSES = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
};

export default function StatWidget({ config, tagValues }) {
  const prefersReducedMotion = useReducedMotion();
  const isCapturing = useThumbnailCapture();
  const skipAnimation = prefersReducedMotion || isCapturing;

  const raw = resolveValue(config, tagValues);
  const numericValue = raw != null ? Number(raw) : null;
  const decimals = config.decimals ?? 1;
  const display = useAnimatedNumber(numericValue, decimals, skipAnimation);
  const color = config.color || '#2563ab';

  const showTitle = config.showTitle !== false;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;
  const valueFontSize = VALUE_FONT_SIZES[config.valueFontSize];
  const align = config.align || 'center';

  return (
    <div
      className={`flex flex-col ${ALIGN_CLASSES[align] || ALIGN_CLASSES.center} justify-center h-full min-h-0 rounded-lg`}
      style={{ padding: 'var(--rb-widget-padding, clamp(6px, 1.2vw, 16px))' }}
    >
      {showTitle && (
        <p
          className="rb-widget-title truncate w-full"
          style={{ fontSize: titleFontSize }}
        >
          {config.title || 'Stat'}
        </p>
      )}
      <span
        className={`rb-value-primary mt-1 ${!valueFontSize ? 'text-4xl' : ''}`}
        style={{ color, ...(valueFontSize ? { fontSize: valueFontSize } : {}) }}
      >
        {display}
      </span>
      {config.unit && (
        <span className="rb-value-unit mt-0.5">{config.unit}</span>
      )}
    </div>
  );
}
