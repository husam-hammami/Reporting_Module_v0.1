import React, { useEffect, useContext } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLenisScroll } from '../../Hooks/useLenisScroll';
import { FaTags, FaLayerGroup, FaExchangeAlt, FaDownload, FaServer, FaSuperscript, FaEnvelope, FaClock, FaUsers, FaKey, FaImage } from 'react-icons/fa';
import { AuthContext } from '../../Context/AuthProvider';
import { useLanguage } from '../../Hooks/useLanguage';
import '../ReportBuilder/reportBuilderTheme.css';

const SettingsHome = () => {
  useLenisScroll();
  const location = useLocation();
  const navigate = useNavigate();
  const { auth } = useContext(AuthContext);
  const { t } = useLanguage();

  const NAV_ITEMS = [
    { name: t('settings.users'), icon: FaUsers, link: '/settings/users', description: t('settings.desc.users') },
    { name: t('settings.tags'), icon: FaTags, link: '/settings/tags', description: t('settings.desc.tags') },
    { name: t('settings.tagGroups'), icon: FaLayerGroup, link: '/settings/tag-groups', description: t('settings.desc.tagGroups') },
    { name: t('settings.formulas'), icon: FaSuperscript, link: '/settings/formulas', description: t('settings.desc.formulas') },
    { name: t('settings.mappings'), icon: FaExchangeAlt, link: '/settings/mappings', description: t('settings.desc.mappings') },
    { name: t('settings.emailSmtp'), icon: FaEnvelope, link: '/settings/distribution', description: t('settings.desc.emailSmtp') },
    { name: t('settings.shifts'), icon: FaClock, link: '/settings/shifts', description: t('settings.desc.shifts') },
    { name: t('settings.exportImport'), icon: FaDownload, link: '/settings/export-import', description: t('settings.desc.exportImport') },
    { name: t('settings.branding'), icon: FaImage, link: '/settings/branding', description: t('settings.desc.branding') },
    { name: t('settings.system'), icon: FaServer, link: '/settings/system', description: t('settings.desc.system') },
    { name: t('settings.licenses'), icon: FaKey, link: '/settings/license-activations', description: t('settings.desc.licenses'), superadminOnly: true },
  ];

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
          <h1 className="text-[15px] font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] tracking-tight">{t('settings.title')}</h1>
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
            <h2 className="text-[14px] font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-1">{t('settings.selectSection')}</h2>
            <p className="text-[12px] text-[var(--text-muted)] dark:text-[var(--text-muted)] max-w-sm mx-auto">
              {t('settings.selectSectionHint')}
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
