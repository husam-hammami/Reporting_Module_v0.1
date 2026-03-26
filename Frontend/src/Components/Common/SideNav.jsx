import { Box, Tooltip } from '@mui/material';
import { getMenuItems } from '../../Data/Navbar';
import { NavbarContext } from '../../Context/NavbarContext';
import { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { AuthContext } from '../../Context/AuthProvider';
import { useLanguage } from '../../Hooks/useLanguage';
import { User, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import '../../Pages/ReportBuilder/reportBuilderTheme.css';

export default function SideNav() {
  const { open } = useContext(NavbarContext);
  const authContext = useContext(AuthContext);
  const auth = authContext?.auth;
  const { t, isRTL } = useLanguage();

  const sideWidth = open ? 220 : 60;
  const items = getMenuItems(t);

  const uniqueMenuItems = items.reduce((acc, item) => {
    const idx = acc.findIndex((i) => i.link === item.link);
    if (idx >= 0) acc[idx] = item;
    else acc.push(item);
    return acc;
  }, []);

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
                    <item.icon
                      size={22}
                      className={`transition-all duration-300 flex-shrink-0 ${
                        isActive
                          ? 'text-[#f0f4f8]'
                          : 'text-[#556677] hover:text-[#f0f4f8]'
                      }`}
                    />
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
        <div
          className="w-full h-12 flex items-center text-[#556677] hover:text-[#f0f4f8] hover:bg-[#1a2233] hover:shadow-[0_0_12px_rgba(34,211,238,0.1)] rounded-lg transition-all duration-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]"
          style={{
            justifyContent: open ? 'flex-start' : 'center',
            paddingLeft: open ? (isRTL ? '0px' : '14px') : '0px',
            paddingRight: open ? (isRTL ? '14px' : '0px') : '0px',
            gap: open ? '12px' : '0px',
          }}
        >
          <User size={20} className="transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(240,244,248,0.3)] flex-shrink-0" />
          {open && <span className="text-[13px] font-medium whitespace-nowrap text-[#8899ab]">{t('nav.profile')}</span>}
        </div>
        <div
          className="w-full h-12 flex items-center text-[#556677] hover:text-[#f0f4f8] hover:bg-[#1a2233] hover:shadow-[0_0_12px_rgba(34,211,238,0.1)] rounded-lg transition-all duration-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]"
          style={{
            justifyContent: open ? 'flex-start' : 'center',
            paddingLeft: open ? (isRTL ? '0px' : '14px') : '0px',
            paddingRight: open ? (isRTL ? '14px' : '0px') : '0px',
            gap: open ? '12px' : '0px',
          }}
        >
          <Settings size={20} className="transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(240,244,248,0.3)] flex-shrink-0" />
          {open && <span className="text-[13px] font-medium whitespace-nowrap text-[#8899ab]">{t('nav.settings')}</span>}
        </div>
      </Box>
    </Box>
  );
}
