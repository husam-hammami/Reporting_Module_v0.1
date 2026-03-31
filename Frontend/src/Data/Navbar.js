import { LayoutGrid, BarChart2, Settings, Table2, Send, Sparkles } from 'lucide-react';
import { Roles } from './Roles';

export const getMenuItems = (t) => [
  {
    name: t('nav.builder'),
    icon: LayoutGrid,
    tooltip: t('nav.tooltip.builder'),
    link: '/report-builder',
    roles: [Roles.Admin, Roles.Manager],
  },
  {
    name: t('nav.dashboards'),
    icon: BarChart2,
    tooltip: t('nav.tooltip.dashboards'),
    link: '/dashboards',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  },
  {
    name: t('nav.tableReports'),
    icon: Table2,
    tooltip: t('nav.tooltip.tableReports'),
    link: '/reports',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  },
  {
    name: t('nav.distribution'),
    icon: Send,
    tooltip: t('nav.tooltip.distribution'),
    link: '/distribution',
    roles: [Roles.Admin, Roles.Manager],
  },
  {
    name: t('nav.herculesAI'),
    icon: Sparkles,
    tooltip: t('nav.tooltip.herculesAI'),
    link: '/hercules-ai',
    roles: [Roles.Admin],
    badgeEndpoint: '/api/hercules-ai/status',
    badgeKey: 'unseen_reports_count',
  },
  {
    name: t('nav.engineering'),
    icon: Settings,
    tooltip: t('nav.tooltip.engineering'),
    link: '/settings',
    roles: [Roles.Admin, Roles.Manager],
  },
];

// Backward-compatible static export (English fallback)
export const menuItems = getMenuItems((key) => {
  const fallback = {
    'nav.builder': 'Builder',
    'nav.dashboards': 'Dashboards',
    'nav.tableReports': 'Table Reports',
    'nav.distribution': 'Distribution',
    'nav.herculesAI': 'Hercules AI',
    'nav.engineering': 'Engineering',
    'nav.tooltip.builder': 'Design and build reports',
    'nav.tooltip.dashboards': 'View released dashboards',
    'nav.tooltip.tableReports': 'View released table reports',
    'nav.tooltip.distribution': 'Scheduled report delivery',
    'nav.tooltip.herculesAI': 'AI-powered insights and summaries',
    'nav.tooltip.engineering': 'Tags, groups, formulas, mappings',
  };
  return fallback[key] || key;
});
