import { LayoutGrid, BarChart2, Settings, Table2, Send } from 'lucide-react';
import { Roles } from './Roles';

export const menuItems = [
  {
    name: 'Builder',
    icon: LayoutGrid,
    tooltip: 'Design and build reports',
    link: '/report-builder',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  },
  {
    name: 'Dashboards',
    icon: BarChart2,
    tooltip: 'View released dashboards',
    link: '/dashboards',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  },
  {
    name: 'Table Reports',
    icon: Table2,
    tooltip: 'View released table reports',
    link: '/reports',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  },
  {
    name: 'Distribution',
    icon: Send,
    tooltip: 'Scheduled report delivery',
    link: '/distribution',
    roles: [Roles.Admin, Roles.Manager],
  },
  {
    name: 'Engineering',
    icon: Settings,
    tooltip: 'Tags, groups, formulas, mappings',
    link: '/settings',
    roles: [Roles.Admin, Roles.Manager],
  },
];
