import { useMemo } from 'react';
import { evaluateFormula } from '../formulas/formulaEngine';
import { VALUE_FONT_SIZES, TITLE_FONT_SIZES } from './widgetDefaults';

function resolveValue(config, tagValues) {
  const ds = config.dataSource;
  if (!ds) return tagValues?.[config.tagName] ?? null; // legacy fallback
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
      default: return vals.reduce((a, b) => a + b, 0) / vals.length; // avg
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

/** Build SVG polyline points from numeric series (viewBox 0 0 100 20, y inverted). */
function buildSparklinePoints(data) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const n = data.length;
  return data
    .map((v, i) => {
      const x = n === 1 ? 50 : (i / (n - 1)) * 100;
      const y = 20 - ((v - min) / range) * 18 - 1; // 1px padding top/bottom
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

const ALIGN_CLASSES = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
};

const JUSTIFY_CLASSES = {
  left: '',
  center: 'justify-center',
  right: 'justify-end',
};

export default function KPIWidget({ config, tagValues, sparklineData }) {
  const rawValue = resolveValue(config, tagValues);
  const displayValue = rawValue != null ? Number(rawValue).toFixed(config.decimals ?? 1) : '\u2014';
  const activeColor = getThresholdColor(rawValue, config.thresholds, config.color || '#2563ab');

  // Extract numeric values from timestamped {t,v} objects (useTagHistory format)
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

  const showTitle = config.showTitle !== false;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;
  const valueFontSize = VALUE_FONT_SIZES[config.valueFontSize];
  const align = config.align || 'left';

  return (
    <div
      className={`flex flex-col h-full justify-between min-h-0 rounded-lg ${ALIGN_CLASSES[align] || ''}`}
      style={{
        padding: 'clamp(6px, 1.2vw, 16px)',
      }}
    >
      {showTitle && (
        <p
          className="font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate"
          style={{ fontSize: titleFontSize }}
        >
          {config.title || 'KPI'}
        </p>
      )}
      <div className={`flex items-baseline gap-1.5 mt-1 ${JUSTIFY_CLASSES[align] || ''}`}>
        <span
          className={`font-bold tabular-nums tracking-tight ${!valueFontSize ? 'text-3xl' : ''}`}
          style={{ color: activeColor, ...(valueFontSize ? { fontSize: valueFontSize } : {}) }}
        >
          {displayValue}
        </span>
        {config.unit && (
          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">{config.unit}</span>
        )}
      </div>
      {config.showSparkline && (
        <div className="mt-2 h-5 w-full rounded overflow-hidden bg-gray-100 dark:bg-gray-800/40">
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
