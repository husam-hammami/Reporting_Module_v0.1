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
    <div className="min-h-[calc(100vh-70px)] bg-[#f5f8fb] dark:bg-[#0b111e]">
      {/* ── Sticky top bar with tabs ── */}
      <div className="sticky top-0 z-10 bg-white dark:bg-[#131b2d] border-b border-[#e3e9f0] dark:border-[#1e2d40] px-6 pt-4 pb-0">
        <h1 className="text-[15px] font-bold text-[#2a3545] dark:text-[#e1e8f0] mb-3">Engineering</h1>
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.link);
            return (
              <Link
                key={item.link}
                to={item.link}
                className={`rb-settings-tab ${active ? 'active' : ''}`}
              >
                <Icon size={13} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Content ── */}
      <div className="max-w-[1200px] mx-auto px-5 py-4">
        {showDefault ? (
          <div className="text-center py-16 px-6">
            <div className="w-12 h-12 rounded-xl bg-[#f0f5fa] dark:bg-[#0f2840] flex items-center justify-center mx-auto mb-4">
              <FaTags className="text-[#8898aa] text-lg" />
            </div>
            <h2 className="text-[14px] font-semibold text-[#3a4a5c] dark:text-[#c1ccd9] mb-1">Select a section</h2>
            <p className="text-[12px] text-[#8898aa] max-w-sm mx-auto">
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
