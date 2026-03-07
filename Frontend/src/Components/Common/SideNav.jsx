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
            background: 'rgba(248,249,250,0.92)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            color: '#334155',
            paddingTop: '80px',
            borderRight: '1px solid rgba(0,0,0,0.08)',
            '.dark &': {
              background: 'rgba(7,14,28,0.96)',
              color: '#e8edf5',
              borderRight: '1px solid rgba(34, 211, 238, 0.1)',
              boxShadow: '1px 0 8px rgba(0,0,0,0.3)',
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

            return (
              <ListItem key={item.link} disablePadding sx={{ display: 'block', mb: 0.5 }}>
                {showCategory && (
                  <div
                    className={`flex items-center gap-1.5 mb-1.5 ${open ? 'px-2' : 'px-0 justify-center'}`}
                    style={{ marginTop: lastCategory !== category ? 0 : 16 }}
                  >
                    {open && (
                      <>
                        <div className="w-0.5 h-3 rounded-full bg-[#94a3b8]/40 dark:bg-[#22d3ee]/30" />
                        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#94a3b8] dark:text-[#22d3ee]/60">
                          {category}
                        </span>
                      </>
                    )}
                    {!open && (
                      <div className="w-7 h-0.5 rounded-full bg-[#94a3b8]/25 dark:bg-[#22d3ee]/20" />
                    )}
                  </div>
                )}
                <NavLink
                  to={item.link}
                  className={({ isActive }) =>
                    `block w-full rounded-lg transition-all duration-200 ${
                      isActive
                        ? ''
                        : 'hover:bg-black/[0.04] dark:hover:bg-[#22d3ee]/[0.04]'
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
                              borderRadius: '8px',
                              position: 'relative',
                              overflow: 'hidden',
                            },
                            open
                              ? { justifyContent: 'initial' }
                              : { justifyContent: 'center' },
                            isActive && {
                              background: 'rgba(100, 116, 139, 0.08)',
                              '.dark &': {
                                background: 'rgba(34, 211, 238, 0.06)',
                                border: '1px solid rgba(34, 211, 238, 0.12)',
                                boxShadow: '0 0 8px rgba(34, 211, 238, 0.04)',
                              },
                              '&:hover': {
                                background: 'rgba(100, 116, 139, 0.12)',
                                '.dark &': {
                                  background: 'rgba(34, 211, 238, 0.08)',
                                },
                              },
                            },
                          ]}
                        >
                          {isActive && (
                            <div
                              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-[#475569] dark:bg-[#22d3ee]"
                              style={{
                                height: '55%',
                                boxShadow: 'var(--scada-cyan-glow, none)',
                              }}
                            />
                          )}
                          <div
                            className={`flex justify-center items-center flex-shrink-0 ${
                              open ? 'mr-3' : 'mr-0'
                            }`}
                          >
                            <item.icon
                              style={{ fontSize: 22 }}
                              className={isActive
                                ? 'text-[#334155] dark:text-[#22d3ee]'
                                : 'text-[#94a3b8] dark:text-[#556677]'
                              }
                            />
                          </div>
                          {open && (
                            <span
                              className={`text-[14px] font-medium leading-tight truncate transition-colors duration-200 ${
                                isActive
                                  ? 'text-[#1e293b] dark:text-[#e8edf5]'
                                  : 'text-[#64748b] dark:text-[#8899ab]'
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
            <div className="p-3 rounded-lg bg-black/[0.02] dark:bg-[#22d3ee]/[0.03] border border-black/[0.04] dark:border-[#22d3ee]/10">
              <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#64748b] dark:text-[#22d3ee]/50 mb-0.5">Hercules v2</p>
              <p className="text-[10px] text-[#94a3b8] dark:text-[#556677]">Industrial SCADA</p>
            </div>
          </div>
        )}
      </Drawer>
    </Box>
  );
}
