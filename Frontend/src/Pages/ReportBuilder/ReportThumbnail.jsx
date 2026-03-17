import { useMemo, useContext } from 'react';
import { LayoutGrid, Table2 } from 'lucide-react';
import { loadAndMigrateConfig } from './state/templateSchema';
import { DarkModeContext } from '../../Context/DarkModeProvider';

export default function ReportThumbnail({ template }) {
  const { mode } = useContext(DarkModeContext);
  const isDark = mode === 'dark';

  const { config } = useMemo(() => {
    const lc = template?.layout_config;
    if (!lc) return { config: null };
    try {
      const { config: c } = loadAndMigrateConfig(lc);
      return { config: c };
    } catch { return { config: null }; }
  }, [template?.layout_config]);

  const reportType = config?.reportType || 'dashboard';
  const isPaginated = reportType === 'paginated';
  const iconColor = isDark ? '#475569' : '#94a3b8';
  const bg = isDark ? '#0f172a' : '#f8fafc';

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: bg,
    }}>
      {isPaginated
        ? <Table2 size={20} style={{ color: iconColor }} strokeWidth={1.5} />
        : <LayoutGrid size={20} style={{ color: iconColor }} strokeWidth={1.5} />
      }
    </div>
  );
}
