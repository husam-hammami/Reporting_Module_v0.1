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
    return vals.reduce((a, b) => a + b, 0) / vals.length; // avg
  }
  return tagValues?.[ds.tagName] ?? null;
}

const ALIGN_CLASSES = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
};

export default function StatWidget({ config, tagValues }) {
  const raw = resolveValue(config, tagValues);
  const display = raw != null ? Number(raw).toFixed(config.decimals ?? 1) : '\u2014';
  const color = config.color || '#2563ab';

  const showTitle = config.showTitle !== false;
  const titleFontSize = TITLE_FONT_SIZES[config.titleFontSize] || TITLE_FONT_SIZES.md;
  const valueFontSize = VALUE_FONT_SIZES[config.valueFontSize];
  const align = config.align || 'center';

  return (
    <div
      className={`flex flex-col ${ALIGN_CLASSES[align] || ALIGN_CLASSES.center} justify-center h-full min-h-0 rounded-lg`}
      style={{
        padding: 'clamp(6px, 1.2vw, 16px)',
      }}
    >
      {showTitle && (
        <p
          className="font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate w-full"
          style={{ fontSize: titleFontSize }}
        >
          {config.title || 'Stat'}
        </p>
      )}
      <span
        className={`font-bold tabular-nums tracking-tight mt-1 ${!valueFontSize ? 'text-4xl' : ''}`}
        style={{ color, ...(valueFontSize ? { fontSize: valueFontSize } : {}) }}
      >
        {display}
      </span>
      {config.unit && (
        <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">{config.unit}</span>
      )}
    </div>
  );
}
