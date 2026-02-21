import { FaChartBar, FaChartArea, FaCog } from 'react-icons/fa';
import { Roles } from './Roles';

export const menuItems = [
  {
    name: 'Report Builder',
    icon: FaChartBar,
    tooltip: 'Design and build reports',
    link: '/report-builder',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  },
  {
    name: 'Reporting',
    icon: FaChartArea,
    tooltip: 'View reports with live & historical data',
    link: '/reporting',
    roles: [Roles.Admin, Roles.Manager, Roles.Operator],
  },
  {
    name: 'Engineering',
    icon: FaCog,
    tooltip: 'Tags, groups, formulas, mappings',
    link: '/settings',
    roles: [Roles.Admin, Roles.Manager],
  },
];
