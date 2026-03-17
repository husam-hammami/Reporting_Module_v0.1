import React, { useEffect, useContext } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLenisScroll } from '../../Hooks/useLenisScroll';
import { FaTags, FaLayerGroup, FaExchangeAlt, FaDownload, FaServer, FaSuperscript, FaEnvelope, FaClock, FaUsers, FaKey } from 'react-icons/fa';
import { AuthContext } from '../../Context/AuthProvider';
import '../ReportBuilder/reportBuilderTheme.css';

const NAV_ITEMS = [
  { name: 'Users', icon: FaUsers, link: '/settings/users', description: 'User accounts & roles' },
  { name: 'Tags', icon: FaTags, link: '/settings/tags', description: 'PLC tags & data sources' },
  { name: 'Tag Groups', icon: FaLayerGroup, link: '/settings/tag-groups', description: 'Organize tags for reports' },
  { name: 'Formulas', icon: FaSuperscript, link: '/settings/formulas', description: 'Reusable calculations' },
  { name: 'Mappings', icon: FaExchangeAlt, link: '/settings/mappings', description: 'Value mapping rules' },
  { name: 'Email / SMTP', icon: FaEnvelope, link: '/settings/email', description: 'Email delivery config' },
  { name: 'Shifts', icon: FaClock, link: '/settings/shifts', description: 'Shift schedule config' },
  { name: 'Export / Import', icon: FaDownload, link: '/settings/export-import', description: 'System configurations' },
  { name: 'System', icon: FaServer, link: '/settings/system', description: 'PLC, mode & emulator' },
  { name: 'Licenses', icon: FaKey, link: '/settings/license-activations', description: 'Machine license activations', superadminOnly: true },
];

const SettingsHome = () => {
  useLenisScroll();
  const location = useLocation();
  const navigate = useNavigate();
  const { auth } = useContext(AuthContext);

  const filteredNavItems = NAV_ITEMS.filter(item => {
    if (item.superadminOnly) {
      return auth?.role === 'superadmin';
    }
    if (item.link === '/settings/users') {
      return auth?.role === 'superadmin' || auth?.role === 'admin' || auth?.role === 'manager';
    }
    return true;
  });

  useEffect(() => {
    if (location.pathname === '/settings') {
      navigate('/settings/tags', { replace: true });
    }
  }, [location.pathname, navigate]);

  const isActive = (path) => location.pathname === path;
  const showDefault = location.pathname === '/settings';

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[var(--background)]">
      <div className="sticky top-0 z-10 bg-white dark:bg-[#111827] border-b border-[#e5e7eb] dark:border-[#1e293b] px-3 sm:px-6 pt-4 pb-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-4 rounded-full bg-[var(--brand)]" />
          <h1 className="text-[15px] font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] tracking-tight">Engineering</h1>
        </div>
        <nav className="flex gap-0 -mb-px overflow-x-auto scrollbar-none">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.link);
            return (
              <Link
                key={item.link}
                to={item.link}
                className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium whitespace-nowrap border-b-2 transition-all duration-200 ${
                  active
                    ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--brand-subtle)]'
                    : 'border-transparent text-[var(--text-muted)] dark:text-[var(--text-muted)] hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] hover:border-[var(--border)] dark:hover:border-[var(--border)]'
                }`}
              >
                <Icon size={12} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="px-4 sm:px-5 py-4">
        {showDefault ? (
          <div className="text-center py-16 px-6">
            <div className="w-12 h-12 rounded-xl bg-[var(--surface-sunken)] dark:bg-[var(--surface-sunken)] dark:border dark:border-[var(--border)] flex items-center justify-center mx-auto mb-4">
              <FaTags className="text-[var(--text-muted)] dark:text-[var(--text-muted)] text-lg" />
            </div>
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-1">Select a section</h2>
            <p className="text-[12px] text-[var(--text-muted)] dark:text-[var(--text-muted)] max-w-sm mx-auto">
              Choose a tab above to manage tags, groups, mappings, or system settings.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
};

export default SettingsHome;
