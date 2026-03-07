import { styled } from '@mui/material/styles';
import MuiDrawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import { Box, Tooltip } from '@mui/material';
import { menuItems } from '../../Data/Navbar';
import { NavbarContext } from '../../Context/NavbarContext';
import { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { AuthContext } from '../../Context/AuthProvider';
import '../../Pages/ReportBuilder/reportBuilderTheme.css';

const CATEGORY_MAP = {
  '/report-builder': 'BUILD',
  '/reporting': 'VIEW',
  '/settings': 'CONFIGURE',
};

const CATEGORY_COLORS = {
  'BUILD': { accent: '#64748b', bg: 'rgba(100, 116, 139, 0.06)' },
  'VIEW': { accent: '#64748b', bg: 'rgba(100, 116, 139, 0.06)' },
  'CONFIGURE': { accent: '#64748b', bg: 'rgba(100, 116, 139, 0.06)' },
};

const ACTIVE_COLOR = '#cbd5e1';
const ACTIVE_COLOR_DARK = '#94a3b8';

const drawerWidth = 220;

const openedMixin = theme => ({
  width: drawerWidth,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: 250,
  }),
  overflowX: 'hidden',
});

const closedMixin = theme => ({
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: 200,
  }),
  overflowX: 'hidden',
  width: 60,
  [theme.breakpoints.up('sm')]: {
    width: 60,
  },
});

const Drawer = styled(MuiDrawer, {
  shouldForwardProp: prop => prop !== 'open',
})(({ theme, open }) => ({
  width: drawerWidth,
  flexShrink: 0,
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
  ...(open && {
    ...openedMixin(theme),
    '& .MuiDrawer-paper': {
      ...openedMixin(theme),
    },
  }),
  ...(!open && {
    ...closedMixin(theme),
    '& .MuiDrawer-paper': {
      ...closedMixin(theme),
    },
  }),
}));

export default function SideNav() {
  const { open } = useContext(NavbarContext);
  const authContext = useContext(AuthContext);
  const auth = authContext?.auth;

  const uniqueMenuItems = menuItems.reduce((acc, item) => {
    const idx = acc.findIndex((i) => i.link === item.link);
    if (idx >= 0) acc[idx] = item;
    else acc.push(item);
    return acc;
  }, []);

  let lastCategory = null;

  return (
    <Box sx={{ display: 'flex' }}>
      <Drawer
        variant="permanent"
        open={open}
        PaperProps={{
          sx: {
            background: '#f8f9fa',
            color: '#334155',
            paddingTop: '80px',
            borderRight: '1px solid rgba(0,0,0,0.08)',
            '.dark &': {
              background: '#0a1120',
              color: '#e2e8f0',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            },
          },
        }}
      >
        <List sx={{ px: open ? 1.5 : 1, pt: 2 }}>
          {uniqueMenuItems.map((item) => {
            if (!auth || !item.roles.includes(auth.role)) return null;
            const category = CATEGORY_MAP[item.link];
            const showCategory = category && category !== lastCategory;
            if (category) lastCategory = category;
            const catColor = CATEGORY_COLORS[category] || CATEGORY_COLORS['BUILD'];

            return (
              <ListItem key={item.link} disablePadding sx={{ display: 'block', mb: 0.5 }}>
                {showCategory && (
                  <div
                    className={`flex items-center gap-1.5 mb-1.5 ${open ? 'px-2' : 'px-0 justify-center'}`}
                    style={{ marginTop: lastCategory !== category ? 0 : 16 }}
                  >
                    {open && (
                      <>
                        <div
                          className="w-1 h-3 rounded-full bg-[#94a3b8]/40 dark:bg-[#475569]/50"
                        />
                        <span
                          className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[#94a3b8] dark:text-[#475569]"
                        >
                          {category}
                        </span>
                      </>
                    )}
                    {!open && (
                      <div
                        className="w-7 h-0.5 rounded-full bg-[#94a3b8]/25 dark:bg-[#475569]/30"
                      />
                    )}
                  </div>
                )}
                <NavLink
                  to={item.link}
                  className={({ isActive }) =>
                    `block w-full rounded-lg transition-all duration-200 ${
                      isActive
                        ? ''
                        : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.04]'
                    }`
                  }
                >
                  {({ isActive }) => {
                    return (
                      <Tooltip
                        title={<span style={{ fontSize: 12 }}>{item.tooltip}</span>}
                        placement="right"
                        arrow
                        disableInteractive
                        slotProps={{
                          popper: { className: `${open ? 'hidden' : ''}` },
                        }}
                      >
                        <ListItemButton
                          sx={[
                            {
                              minHeight: 44,
                              px: open ? 1.5 : 1.25,
                              py: 1,
                              borderRadius: '10px',
                              position: 'relative',
                              overflow: 'hidden',
                            },
                            open
                              ? { justifyContent: 'initial' }
                              : { justifyContent: 'center' },
                            isActive && {
                              background: 'rgba(100, 116, 139, 0.08)',
                              '.dark &': {
                                background: 'rgba(148, 163, 184, 0.08)',
                              },
                              '&:hover': {
                                background: 'rgba(100, 116, 139, 0.12)',
                                '.dark &': {
                                  background: 'rgba(148, 163, 184, 0.12)',
                                },
                              },
                            },
                          ]}
                        >
                          {isActive && (
                            <div
                              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-[#475569] dark:bg-[#94a3b8]"
                              style={{ height: '55%' }}
                            />
                          )}
                          <div
                            className={`flex justify-center items-center flex-shrink-0 ${
                              open ? 'mr-3' : 'mr-0'
                            }`}
                          >
                            <item.icon
                              style={{
                                fontSize: 22,
                                color: isActive ? undefined : undefined,
                              }}
                              className={isActive
                                ? 'text-[#334155] dark:text-[#e2e8f0]'
                                : 'text-[#94a3b8] dark:text-[#64748b]'
                              }
                            />
                          </div>
                          {open && (
                            <span
                              className={`text-[14px] font-medium leading-tight truncate transition-colors duration-200 ${
                                isActive
                                  ? 'text-[#1e293b] dark:text-[#f1f5f9]'
                                  : 'text-[#64748b] dark:text-[#94a3b8]'
                              }`}
                            >
                              {item.name}
                            </span>
                          )}
                        </ListItemButton>
                      </Tooltip>
                    );
                  }}
                </NavLink>
              </ListItem>
            );
          })}
        </List>

        {open && (
          <div className="mt-auto px-3 pb-3">
            <div className="p-3 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.04] dark:border-white/[0.04]">
              <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#64748b] dark:text-[#475569] mb-0.5">Hercules v2</p>
              <p className="text-[10px] text-[#94a3b8] dark:text-[#334155]">Industrial SCADA</p>
            </div>
          </div>
        )}
      </Drawer>
    </Box>
  );
}
