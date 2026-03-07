import { MdDashboardCustomize, MdInsertChart, MdEngineering } from 'react-icons/md';
import { Roles } from './Roles';

export const menuItems = [
  {
    name: 'Report Builder',
    icon: MdDashboardCustomize,
    tooltip: 'Design and build reports',
    link: '/report-builder',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  },
  {
    name: 'Reporting',
    icon: MdInsertChart,
    tooltip: 'View reports with live & historical data',
    link: '/reporting',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  },
  {
    name: 'Engineering',
    icon: MdEngineering,
    tooltip: 'Tags, groups, formulas, mappings',
    link: '/settings',
    roles: [Roles.Admin, Roles.Manager],
  },
];
