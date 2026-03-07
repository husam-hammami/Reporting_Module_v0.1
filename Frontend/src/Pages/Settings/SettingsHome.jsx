import React, { useEffect, useContext } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLenisScroll } from '../../Hooks/useLenisScroll';
import { FaTags, FaLayerGroup, FaExchangeAlt, FaDownload, FaServer, FaSuperscript, FaEnvelope, FaClock, FaUsers } from 'react-icons/fa';
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
];

const SettingsHome = () => {
  useLenisScroll();
  const location = useLocation();
  const navigate = useNavigate();
  const { auth } = useContext(AuthContext);

  const filteredNavItems = NAV_ITEMS.filter(item => {
    if (item.link === '/settings/users') {
      return auth?.role === 'admin' || auth?.role === 'manager';
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
    <div className="min-h-[calc(100vh-80px)] bg-[#f8f9fb] dark:bg-transparent">
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-[#0a1020]/95 border-b border-black/[0.06] dark:border-[#22d3ee]/10 px-6 pt-4 pb-0"
        style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-4 rounded-full bg-[#a78bfa] dark:bg-[#22d3ee]" />
          <h1 className="text-[15px] font-bold text-[#0f1729] dark:text-[#e8edf5] tracking-tight">Engineering</h1>
        </div>
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.link);
            return (
              <Link
                key={item.link}
                to={item.link}
                className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium whitespace-nowrap border-b-2 transition-all duration-200 ${
                  active
                    ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--brand-subtle)]'
                    : 'border-transparent text-[#64748b] dark:text-[#556677] hover:text-[#334155] dark:hover:text-[#8899ab] hover:border-[#cbd5e1] dark:hover:border-[#22d3ee]/20'
                }`}
              >
                <Icon size={12} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="max-w-[1200px] mx-auto px-5 py-4">
        {showDefault ? (
          <div className="text-center py-16 px-6">
            <div className="w-12 h-12 rounded-xl bg-[#f0f5fa] dark:bg-[#111c2e] dark:border dark:border-[#22d3ee]/10 flex items-center justify-center mx-auto mb-4">
              <FaTags className="text-[#94a3b8] dark:text-[#22d3ee]/50 text-lg" />
            </div>
            <h2 className="text-[14px] font-semibold text-[#334155] dark:text-[#e8edf5] mb-1">Select a section</h2>
            <p className="text-[12px] text-[#94a3b8] dark:text-[#556677] max-w-sm mx-auto">
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
