import React, { useContext } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { FaUser, FaUsers } from 'react-icons/fa';
import { AuthContext } from '../../Context/AuthProvider';
import { useLanguage } from '../../Hooks/useLanguage';
import { useLenisScroll } from '../../Hooks/useLenisScroll';

const ProfilePage = () => {
  useLenisScroll();
  const location = useLocation();
  const { auth } = useContext(AuthContext);
  const { t } = useLanguage();
  const isAdmin = auth?.role === 'admin' || auth?.role === 'superadmin' || auth?.role === 'manager';

  const tabs = [
    { name: t('profile.myAccount'), icon: FaUser, link: '/profile' },
    ...(isAdmin ? [{ name: t('profile.userManagement'), icon: FaUsers, link: '/profile/users' }] : []),
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <div className="min-h-[calc(100vh-80px)] bg-[var(--background)]">
      <div className="sticky top-0 z-10 bg-white dark:bg-[#111827] border-b border-[#e5e7eb] dark:border-[#1e293b] px-3 sm:px-6 pt-4 pb-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-4 rounded-full bg-[var(--brand)]" />
          <h1 className="text-[15px] font-bold text-[var(--text-primary)] tracking-tight">{t('profile.title')}</h1>
        </div>
        <nav className="flex gap-0 -mb-px overflow-x-auto scrollbar-none">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.link);
            return (
              <Link
                key={item.link}
                to={item.link}
                className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium whitespace-nowrap border-b-2 transition-all duration-200 ${
                  active
                    ? 'border-[var(--brand)] text-[var(--brand)] bg-[var(--brand-subtle)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--border)]'
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
        <Outlet />
      </div>
    </div>
  );
};

export default ProfilePage;
