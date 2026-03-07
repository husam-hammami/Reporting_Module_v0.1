import { useMemo, useState, useEffect } from 'react';
import { BarChart3, Activity, Table2, Gauge, Container, Hash, Copy, Image, Type, LayoutGrid, Layers } from 'lucide-react';
import { loadAndMigrateConfig } from './state/templateSchema';

const TYPE_COLOR = {
  kpi: '#0d9488', stat: '#7c3aed', chart: '#059669', barchart: '#059669',
  table: '#2563eb', gauge: '#d97706', silo: '#22d3ee', image: '#4f46e5',
  text: '#64748b', repeat: '#ea580c',
};

const TYPE_ICON = {
  kpi: Hash, stat: Activity, chart: BarChart3, barchart: BarChart3,
  table: Table2, gauge: Gauge, silo: Container, image: Image,
  text: Type, repeat: Copy,
};

const TYPE_LABEL = {
  kpi: 'KPI', stat: 'Statistics', chart: 'Chart', barchart: 'Bar Chart',
  table: 'Table', gauge: 'Gauge', silo: 'Silo', image: 'Image',
  text: 'Text', repeat: 'Repeat',
};

const CATEGORY_LABEL = {
  kpi: 'KPI Dashboard', stat: 'Statistics', chart: 'Analytics',
  barchart: 'Analytics', table: 'Data Tables', gauge: 'Process Monitor',
  silo: 'Silo Overview', image: 'Visual', text: 'Documentation',
  repeat: 'Repeat Panels', mixed: 'Mixed Report',
};

function analyzeWidgets(widgets) {
  const counts = {};
  for (const w of widgets) {
    if (!w?.type) continue;
    counts[w.type] = (counts[w.type] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;
  const dominant = sorted[0][0];
  const isMixed = sorted.length > 2 && sorted[0][1] / total < 0.5;
  return { sorted, total, dominant, category: isMixed ? 'mixed' : dominant };
}

export default function ReportThumbnail({ template }) {
  const { config } = useMemo(() => {
    const lc = template?.layout_config;
    if (!lc) return { config: null };
    try {
      const { config: c } = loadAndMigrateConfig(lc);
      return { config: c };
    } catch { return { config: null }; }
  }, [template?.layout_config]);

  const widgets = config?.widgets ?? [];

  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains('dark')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const analysis = useMemo(
    () => analyzeWidgets(widgets.filter(w => w && typeof w === 'object')),
    [widgets]
  );

  if (!analysis) {
    return (
      <div style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isDark ? '#071018' : 'rgba(255,255,255,0.85)',
      }}>
        <div style={{ textAlign: 'center', opacity: 0.3 }}>
          <LayoutGrid size={24} style={{ color: isDark ? '#475569' : '#94a3b8', margin: '0 auto 6px' }} />
          <div style={{ fontSize: '10px', fontWeight: 600, color: isDark ? '#475569' : '#94a3b8' }}>No widgets</div>
        </div>
      </div>
    );
  }

  const { sorted, total, dominant, category } = analysis;
  const accent = TYPE_COLOR[dominant] || '#64748b';
  const DomIcon = TYPE_ICON[dominant] || LayoutGrid;
  const catLabel = CATEGORY_LABEL[category] || 'Report';

  return (
    <div style={{
      width: '100%', height: '100%', position: 'relative', overflow: 'hidden',
      background: isDark ? '#071018' : 'rgba(255,255,255,0.85)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        height: '3px', width: '100%', flexShrink: 0,
        background: `linear-gradient(90deg, ${accent}, ${accent}90)`,
        opacity: isDark ? 0.7 : 0.5,
      }} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 16px 10px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px',
        }}>
          <div style={{
            width: '28px', height: '28px', borderRadius: '7px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isDark ? `${accent}18` : `${accent}10`,
            border: `1px solid ${isDark ? accent + '25' : accent + '18'}`,
            flexShrink: 0,
          }}>
            <DomIcon size={14} style={{ color: accent }} strokeWidth={2} />
          </div>
          <div>
            <div style={{
              fontSize: '11px', fontWeight: 700,
              color: isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)',
              letterSpacing: '-0.01em',
            }}>
              {catLabel}
            </div>
            <div style={{
              fontSize: '9px', fontWeight: 500,
              color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
              marginTop: '1px',
            }}>
              {total} widget{total !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', gap: '3px', marginBottom: '8px' }}>
          {sorted.map(([type, count]) => {
            const c = TYPE_COLOR[type] || '#64748b';
            return (
              <div key={type} style={{
                flex: count, height: '3px', borderRadius: '1.5px',
                background: c,
                opacity: isDark ? 0.55 : 0.4,
                transition: 'opacity 200ms',
              }} />
            );
          })}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 6px' }}>
          {sorted.slice(0, 4).map(([type, count]) => {
            const Icon = TYPE_ICON[type] || LayoutGrid;
            const c = TYPE_COLOR[type] || '#64748b';
            const label = TYPE_LABEL[type] || type;
            return (
              <div key={type} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                padding: '2px 6px 2px 4px',
                borderRadius: '4px',
                background: isDark ? `${c}0c` : `${c}08`,
              }}>
                <Icon size={9} style={{ color: c, opacity: isDark ? 0.7 : 0.55 }} strokeWidth={2.2} />
                <span style={{
                  fontSize: '9px', fontWeight: 600,
                  color: isDark ? `${c}bb` : c,
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}>
                  {label} {count > 1 ? `(${count})` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
