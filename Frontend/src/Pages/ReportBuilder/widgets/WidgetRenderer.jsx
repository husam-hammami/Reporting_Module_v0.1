import KPIWidget from './KPIWidget';
import ChartWidget from './ChartWidget';
import GaugeWidget from './GaugeWidget';
import SiloWidget from './SiloWidget';
import TableWidget from './TableWidget';
import StatWidget from './StatWidget';
import ImageWidget from './ImageWidget';
import TextWidget from './TextWidget';

const RENDERERS = {
  kpi: KPIWidget,
  chart: ChartWidget,
  barchart: ChartWidget,
  gauge: GaugeWidget,
  silo: SiloWidget,
  table: TableWidget,
  stat: StatWidget,
  image: ImageWidget,
  text: TextWidget,
};

/* Types that never show a card wrapper by default */
export const CARDLESS_WIDGET_TYPES = new Set(['image', 'text']);

/* Types that should render with zero visual chrome (no border, no background) */
export const INVISIBLE_WRAPPER_TYPES = new Set(['text']);

function getKpiSparklineTag(config) {
  const ds = config?.dataSource;
  if (ds?.type === 'tag' && ds?.tagName) return ds.tagName;
  return config?.tagName ?? null;
}

export default function WidgetRenderer({ widget, tagValues, isPreview, isSelected, onUpdateWidget, widgetId, tags, isReportBuilderWorkspace, layoutRowHeight, tagHistory, savedFormulas = [] }) {
  const Component = RENDERERS[widget.type];
  if (!Component) return null;
  const tableProps = widget.type === 'table'
    ? { isSelected, onUpdate: onUpdateWidget, widgetId, tags, layoutH: widget.h, layoutRowHeight, isReportBuilderWorkspace, savedFormulas }
    : {};
  const siloProps = widget.type === 'silo' ? { isReportBuilderWorkspace } : {};
  const sparklineTag = widget.type === 'kpi' ? getKpiSparklineTag(widget.config) : null;
  const kpiProps = widget.type === 'kpi' && sparklineTag && tagHistory ? { sparklineData: tagHistory[sparklineTag] ?? [] } : {};
  const chartProps = (widget.type === 'chart' || widget.type === 'barchart') && tagHistory
    ? { tagHistory }
    : {};
  const imageProps = widget.type === 'image'
    ? { onUpdateConfig: (patch) => onUpdateWidget?.(widgetId, { config: patch }) }
    : {};
  return (
    <Component
      config={widget.config || {}}
      tagValues={tagValues || {}}
      isPreview={isPreview}
      {...tableProps}
      {...siloProps}
      {...kpiProps}
      {...chartProps}
      {...imageProps}
    />
  );
}
