import { useMemo, useState, useEffect, Component } from 'react';
import { LayoutGrid } from 'lucide-react';
import { loadAndMigrateConfig } from './state/templateSchema';
import WidgetRenderer from './widgets/WidgetRenderer';
import { CARDLESS_WIDGET_TYPES } from './widgets/WidgetRenderer';

const THUMB_W = 384;
const THUMB_H = 192;
const DEFAULT_COLS = 12;
const DEFAULT_ROW_H = 40;
const DEFAULT_CANVAS_W = 960;
const MAX_PREVIEW_WIDGETS = 24;

class WidgetErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(100,100,100,0.1)', borderRadius: '4px',
        }}>
          <span style={{ fontSize: '8px', color: '#94a3b8' }}>—</span>
        </div>
      );
    }
    return this.props.children;
  }
}

function safeArray(v) { return Array.isArray(v) ? v : []; }

function generateDemoValues(widgets) {
  const vals = {};
  const seed = (name) => {
    if (name && typeof name === 'string') vals[name] = (Math.random() * 450 + 50).toFixed(1);
  };
  const seedTag = (t) => {
    if (!t) return;
    if (typeof t === 'string') { seed(t); return; }
    seed(t.tagName);
  };

  for (const w of widgets) {
    if (!w?.config) continue;
    const c = w.config;
    const ds = c.dataSource;

    if (ds) {
      seed(ds.tagName);
      safeArray(ds.tags).forEach(seedTag);
      safeArray(ds.groupTags).forEach(seedTag);
    }

    seed(c.tagName);
    seed(c.capacityTag);
    seed(c.tonsTag);
    safeArray(c.tags).forEach(seedTag);
    safeArray(c.groupTags).forEach(seedTag);

    safeArray(c.columns).forEach(col => {
      if (!col) return;
      seed(col.tagName);
      safeArray(col.tags).forEach(seedTag);
    });
    safeArray(c.tableColumns).forEach(col => {
      if (!col) return;
      seed(col.tagName);
      safeArray(col.tags).forEach(seedTag);
    });
    safeArray(c.rows).forEach(row => {
      if (!row) return;
      seed(row.tagName);
      safeArray(row.tags).forEach(seedTag);
    });
    safeArray(c.series).forEach(s => {
      if (!s) return;
      seed(s.tagName);
      if (s.dataSource) {
        seed(s.dataSource.tagName);
        safeArray(s.dataSource.tags).forEach(seedTag);
      }
    });
  }
  return vals;
}

export default function ReportThumbnail({ template }) {
  const { config } = useMemo(() => {
    const lc = template?.layout_config;
    if (!lc) return { config: null };
    try {
      const { config: c } = loadAndMigrateConfig(lc);
      return { config: c };
    } catch {
      return { config: null };
    }
  }, [template?.layout_config]);

  const widgets = config?.widgets ?? [];

  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const validWidgets = useMemo(() =>
    widgets.filter(w => w && w.type).slice(0, MAX_PREVIEW_WIDGETS),
    [widgets]
  );

  const demoValues = useMemo(() => generateDemoValues(validWidgets), [validWidgets]);

  if (validWidgets.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center"
        style={{ background: isDark ? '#0a1525' : '#f1f5f9' }}
      >
        <div className="flex flex-col items-center gap-2 opacity-40">
          <LayoutGrid size={24} style={{ color: isDark ? '#64748b' : '#94a3b8' }} />
          <span className="text-[9px] font-semibold" style={{ color: isDark ? '#64748b' : '#94a3b8' }}>
            Empty Report
          </span>
        </div>
      </div>
    );
  }

  const gridCols = config?.grid?.cols ?? DEFAULT_COLS;
  const gridRowH = config?.grid?.rowHeight ?? DEFAULT_ROW_H;
  const canvasW = DEFAULT_CANVAS_W;
  const colW = canvasW / gridCols;

  const maxY = Math.max(...validWidgets.map(w => (w.y || 0) + (w.h || 1)), 1);
  const canvasH = maxY * gridRowH;

  const scaleX = THUMB_W / canvasW;
  const scaleY = THUMB_H / canvasH;
  const scale = Math.min(scaleX, scaleY, 0.45);

  const scaledW = canvasW * scale;
  const scaledH = canvasH * scale;
  const offsetX = (THUMB_W - scaledW) / 2;
  const offsetY = Math.max((THUMB_H - scaledH) / 2, 0);

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{
        background: isDark
          ? 'linear-gradient(145deg, #0a1525 0%, #0d1a2d 50%, #0a1220 100%)'
          : 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 50%, #e8eef5 100%)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: isDark
            ? 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.015) 1px, transparent 0)'
            : 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.02) 1px, transparent 0)',
          backgroundSize: '12px 12px',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: `${offsetX}px`,
          top: `${offsetY}px`,
          width: `${canvasW}px`,
          height: `${canvasH}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      >
        {validWidgets.map((w, i) => {
          const x = (w.x || 0) * colW;
          const y = (w.y || 0) * gridRowH;
          const width = (w.w || 1) * colW;
          const height = (w.h || 1) * gridRowH;
          const isCardless = CARDLESS_WIDGET_TYPES.has(w.type);

          return (
            <div
              key={w.id || i}
              className={isCardless ? '' : 'rounded-lg overflow-hidden'}
              style={{
                position: 'absolute',
                left: `${x}px`,
                top: `${y}px`,
                width: `${width}px`,
                height: `${height}px`,
                ...(isCardless ? {} : {
                  background: isDark ? '#0d1c30' : '#ffffff',
                  border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)'}`,
                  boxShadow: isDark
                    ? '0 1px 3px rgba(0,0,0,0.3)'
                    : '0 1px 3px rgba(0,0,0,0.06)',
                }),
              }}
            >
              <WidgetErrorBoundary>
                <WidgetRenderer
                  widget={w}
                  tagValues={demoValues}
                  isPreview={true}
                />
              </WidgetErrorBoundary>
            </div>
          );
        })}
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none"
        style={{
          background: isDark
            ? 'linear-gradient(to top, rgba(10,21,37,0.9) 0%, transparent 100%)'
            : 'linear-gradient(to top, rgba(248,250,252,0.9) 0%, transparent 100%)',
        }}
      />
    </div>
  );
}
