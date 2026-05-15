import { LayoutGrid, BarChart2, Settings, Table2, Send, ClipboardList, Box, Brain } from 'lucide-react';
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
    name: t('nav.digitalTwin'),
    icon: Box,
    tooltip: t('nav.tooltip.digitalTwin'),
    link: '/digital-twin',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
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
    name: t('nav.jobLogs'),
    icon: ClipboardList,
    tooltip: t('nav.tooltip.jobLogs'),
    link: '/job-logs',
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
    name: t('nav.atlasAI'),
    icon: Brain,
    tooltip: t('nav.tooltip.atlasAI'),
    link: '/atlas-ai',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
    badge: 'NEW',
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
    'nav.digitalTwin': 'Digital Twin',
    'nav.dashboards': 'Dashboards',
    'nav.tableReports': 'Table Reports',
    'nav.jobLogs': 'Job Logs',
    'nav.distribution': 'Distribution',
    'nav.atlasAI': 'Atlas AI',
    'nav.engineering': 'Engineering',
    'nav.tooltip.builder': 'Design and build reports',
    'nav.tooltip.digitalTwin': '3D plant view',
    'nav.tooltip.dashboards': 'View released dashboards',
    'nav.tooltip.tableReports': 'View released table reports',
    'nav.tooltip.jobLogs': 'Production order history',
    'nav.tooltip.distribution': 'Scheduled report delivery',
    'nav.tooltip.atlasAI': 'Forecast · Production · PdM · Yield',
    'nav.tooltip.engineering': 'Tags, groups, formulas, mappings',
  };
  return fallback[key] || key;
});
