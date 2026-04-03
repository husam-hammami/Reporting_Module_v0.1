import React from 'react';
import KPIWidget from './KPIWidget';
import ChartWidget from './ChartWidget';
import GaugeWidget from './GaugeWidget';
import SiloWidget from './SiloWidget';
import TableWidget from './TableWidget';
import StatWidget from './StatWidget';
import PieChartWidget from './PieChartWidget';
import ImageWidget from './ImageWidget';
import TextWidget from './TextWidget';
import LogoWidget from './LogoWidget';
import StatusWidget from './StatusWidget';
import SparklineWidget from './SparklineWidget';
import ProgressWidget from './ProgressWidget';
import HopperWidget from './HopperWidget';
import StatusBarWidget from './StatusBarWidget';
import TabContainerWidget from './TabContainerWidget';
import DataPanelWidget from './DataPanelWidget';

/* ── Error Boundary — catches widget render crashes ── */
class WidgetErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error(`Widget "${this.props.widgetType}" crashed:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <div className="text-center">
            <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 mb-1">Widget Error</p>
            <p className="text-[9px] text-red-400 dark:text-red-500 max-w-[180px] truncate">{this.state.error?.message || 'Render failed'}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-2 text-[9px] px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const RENDERERS = {
  kpi: KPIWidget,
  chart: ChartWidget,
  barchart: ChartWidget,
  gauge: GaugeWidget,
  silo: SiloWidget,
  table: TableWidget,
  stat: StatWidget,
  piechart: PieChartWidget,
  image: ImageWidget,
  text: TextWidget,
  logo: LogoWidget,
  status: StatusWidget,
  sparkline: SparklineWidget,
  progress: ProgressWidget,
  hopper: HopperWidget,
  statusbar: StatusBarWidget,
  tabcontainer: TabContainerWidget,
  datapanel: DataPanelWidget,
};

export const CARDLESS_WIDGET_TYPES = new Set(['image', 'text', 'logo']);

export const INVISIBLE_WRAPPER_TYPES = new Set(['text']);

function getKpiSparklineTag(config) {
  const ds = config?.dataSource;
  if (ds?.type === 'tag' && ds?.tagName) return ds.tagName;
  return config?.tagName ?? null;
}

export default function WidgetRenderer({ widget, tagValues, isPreview, isSelected, onUpdateWidget, widgetId, tags, isReportBuilderWorkspace, layoutRowHeight, tagHistory, savedFormulas = [], onSubWidgetSelect, selectedSubWidgetId, onSubLayoutChange }) {
  const Component = RENDERERS[widget.type];
  if (!Component) return null;
  const tableProps = widget.type === 'table'
    ? { isSelected, onUpdate: onUpdateWidget, widgetId, tags, layoutH: widget.h, layoutRowHeight, isReportBuilderWorkspace, savedFormulas, tagHistory }
    : {};
  const tabContainerProps = widget.type === 'tabcontainer'
    ? {
        isSelected, onUpdate: onUpdateWidget, widgetId, tags, savedFormulas, tagHistory,
        onSubWidgetSelect, selectedSubWidgetId, onSubLayoutChange,
        renderWidget: (subWidget, editCtx) => (
          <WidgetRenderer
            widget={subWidget}
            tagValues={tagValues}
            isPreview={false}
            isSelected={editCtx?.isSubSelected || false}
            onUpdateWidget={editCtx?.onUpdateSubWidget}
            widgetId={subWidget.id}
            tags={tags}
            tagHistory={tagHistory}
            savedFormulas={savedFormulas}
            isReportBuilderWorkspace
            layoutRowHeight={layoutRowHeight}
          />
        ),
      }
    : {};
  const dataPanelProps = widget.type === 'datapanel'
    ? { isSelected, onUpdate: onUpdateWidget, widgetId, tags, isReportBuilderWorkspace }
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

  const isInvisible = INVISIBLE_WRAPPER_TYPES.has(widget.type);

  return (
    <WidgetErrorBoundary widgetType={widget.type} key={widget.id || widgetId}>
      <div className={isInvisible ? 'h-full w-full' : `h-full w-full flex flex-col min-h-0 ${widget.type === 'tabcontainer' ? 'overflow-visible' : 'overflow-hidden'}`}>
        <Component
          config={widget.config || {}}
          tagValues={tagValues || {}}
          isPreview={isPreview}
          {...tableProps}
          {...tabContainerProps}
          {...dataPanelProps}
          {...siloProps}
          {...kpiProps}
          {...chartProps}
          {...imageProps}
        />
      </div>
    </WidgetErrorBoundary>
  );
}
