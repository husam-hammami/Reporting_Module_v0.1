import { Box, Tooltip } from '@mui/material';
import { getMenuItems } from '../../Data/Navbar';
import { NavbarContext } from '../../Context/NavbarContext';
import { useContext, useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { AuthContext } from '../../Context/AuthProvider';
import { useLanguage } from '../../Hooks/useLanguage';
import { User, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import axios from '../../API/axios';
import '../../Pages/ReportBuilder/reportBuilderTheme.css';

export default function SideNav() {
  const { open } = useContext(NavbarContext);
  const authContext = useContext(AuthContext);
  const auth = authContext?.auth;
  const { t, isRTL } = useLanguage();
  const location = useLocation();
  const [badgeCounts, setBadgeCounts] = useState({});

  const sideWidth = open ? 220 : 60;
  const items = getMenuItems(t);

  const uniqueMenuItems = items.reduce((acc, item) => {
    const idx = acc.findIndex((i) => i.link === item.link);
    if (idx >= 0) acc[idx] = item;
    else acc.push(item);
    return acc;
  }, []);

  // Fetch badge counts on mount + route change
  useEffect(() => {
    const badgeItems = uniqueMenuItems.filter(i => i.badgeEndpoint);
    badgeItems.forEach(item => {
      axios.get(item.badgeEndpoint)
        .then(res => setBadgeCounts(prev => ({ ...prev, [item.link]: res.data[item.badgeKey] || 0 })))
        .catch(() => {});
    });
  }, [location.pathname]);

  return (
    <Box
      component="aside"
      sx={{
        position: 'fixed',
        top: '72px',
        left: isRTL ? 'auto' : 0,
        right: isRTL ? 0 : 'auto',
        bottom: 0,
        width: `${sideWidth}px`,
        zIndex: 1200,
        display: 'flex',
        flexDirection: 'column',
        borderRight: isRTL ? 'none' : '1px solid #1e293b',
        borderLeft: isRTL ? '1px solid #1e293b' : 'none',
        background: '#111827',
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', pt: 3, px: 0.75 }}>
        {uniqueMenuItems.map((item) => {
          if (!auth || (auth.role !== 'superadmin' && !item.roles.includes(auth.role))) return null;

          return (
            <NavLink
              key={item.link}
              to={item.link}
              className="block w-full outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee] rounded-lg"
            >
              {({ isActive }) => (
                <Tooltip
                  title={!open ? <span style={{ fontSize: 12 }}>{item.tooltip || item.name}</span> : ''}
                  placement="right"
                  arrow
                  disableInteractive
                >
                  <div
                    className={`relative w-full h-12 flex items-center rounded-lg transition-all duration-300 cursor-pointer ${
                      isActive
                        ? 'bg-[#1a2233]'
                        : 'hover:bg-[#1a2233] hover:shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                    }`}
                    style={{
                      paddingLeft: open ? (isRTL ? '0px' : '14px') : '0px',
                      paddingRight: open ? (isRTL ? '14px' : '0px') : '0px',
                      justifyContent: open ? 'flex-start' : 'center',
                      gap: open ? '12px' : '0px',
                    }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeNavIndicator"
                        className={`absolute ${isRTL ? 'right-0 rounded-l-full' : 'left-0 rounded-r-full'} top-2 bottom-2 w-[3px] bg-[#22d3ee] shadow-[0_0_8px_rgba(34,211,238,0.5)]`}
                      />
                    )}
                    <div className="relative flex-shrink-0">
                      <item.icon
                        size={22}
                        className={`transition-all duration-300 ${
                          isActive
                            ? 'text-[#f0f4f8]'
                            : 'text-[#556677] hover:text-[#f0f4f8]'
                        }`}
                      />
                      {item.badgeEndpoint && badgeCounts[item.link] > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center
                                        text-[9px] font-bold bg-red-500 text-white rounded-full px-0.5">
                          {badgeCounts[item.link]}
                        </span>
                      )}
                    </div>
                    {open && (
                      <span
                        className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-all duration-200 ${
                          isActive ? 'text-[#f0f4f8]' : 'text-[#8899ab]'
                        }`}
                      >
                        {item.name}
                      </span>
                    )}
                  </div>
                </Tooltip>
              )}
            </NavLink>
          );
        })}
      </Box>

      <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', pb: 3, px: 0.75 }}>
        {[
          { to: '/profile', icon: User, label: t('nav.profile') },
          { to: '/app-settings', icon: Settings, label: t('nav.settings') },
        ].map((btn) => (
          <NavLink
            key={btn.to}
            to={btn.to}
            className="block w-full outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee] rounded-lg"
          >
            {({ isActive }) => (
              <Tooltip
                title={!open ? <span style={{ fontSize: 12 }}>{btn.label}</span> : ''}
                placement="right"
                arrow
                disableInteractive
              >
                <div
                  className={`relative w-full h-12 flex items-center rounded-lg transition-all duration-300 cursor-pointer ${
                    isActive
                      ? 'bg-[#1a2233]'
                      : 'hover:bg-[#1a2233] hover:shadow-[0_0_12px_rgba(34,211,238,0.1)]'
                  }`}
                  style={{
                    paddingLeft: open ? (isRTL ? '0px' : '14px') : '0px',
                    paddingRight: open ? (isRTL ? '14px' : '0px') : '0px',
                    justifyContent: open ? 'flex-start' : 'center',
                    gap: open ? '12px' : '0px',
                  }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeNavIndicator"
                      className={`absolute ${isRTL ? 'right-0 rounded-l-full' : 'left-0 rounded-r-full'} top-2 bottom-2 w-[3px] bg-[#22d3ee] shadow-[0_0_8px_rgba(34,211,238,0.5)]`}
                    />
                  )}
                  <btn.icon
                    size={20}
                    className={`transition-all duration-300 flex-shrink-0 ${
                      isActive ? 'text-[#f0f4f8]' : 'text-[#556677] hover:text-[#f0f4f8]'
                    }`}
                  />
                  {open && (
                    <span className={`text-[13px] font-medium whitespace-nowrap ${isActive ? 'text-[#f0f4f8]' : 'text-[#8899ab]'}`}>
                      {btn.label}
                    </span>
                  )}
                </div>
              </Tooltip>
            )}
          </NavLink>
        ))}
      </Box>
    </Box>
  );
}
