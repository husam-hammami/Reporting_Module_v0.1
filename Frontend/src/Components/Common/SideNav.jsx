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
            background: '#ffffff',
            color: '#334155',
            paddingTop: '80px',
            borderRight: '1px solid #e5e7eb',
            '.dark &': {
              background: '#111827',
              color: '#e8edf5',
              borderRight: '1px solid #1e293b',
            },
          },
        }}
      >
        <List sx={{ px: open ? 1.5 : 1, pt: 2 }}>
          {uniqueMenuItems.map((item) => {
            if (!auth || (auth.role !== 'superadmin' && !item.roles.includes(auth.role))) return null;
            const category = CATEGORY_MAP[item.link];
            const showCategory = category && category !== lastCategory;
            if (category) lastCategory = category;

            return (
              <ListItem key={item.link} disablePadding sx={{ display: 'block', mb: 0.75 }}>
                {showCategory && (
                  <div
                    className={`flex items-center gap-1.5 mb-1.5 ${open ? 'px-2' : 'px-0 justify-center'}`}
                    style={{ marginTop: lastCategory !== category ? 0 : 16 }}
                  >
                    {open && (
                      <>
                        <div className="w-0.5 h-3 rounded-full bg-[var(--brand)]" />
                        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#9ca3af] dark:text-[#475569]">
                          {category}
                        </span>
                      </>
                    )}
                    {!open && (
                      <div className="w-7 h-0.5 rounded-full bg-[#e5e7eb] dark:bg-[#1e293b]" />
                    )}
                  </div>
                )}
                <NavLink
                  to={item.link}
                  className={({ isActive }) =>
                    `block w-full rounded-lg transition-all duration-200 ${
                      isActive
                        ? ''
                        : 'hover:bg-[#f9fafb] dark:hover:bg-[#0d1320]'
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
                              background: 'rgba(37, 99, 235, 0.06)',
                              '.dark &': {
                                background: 'rgba(34, 211, 238, 0.08)',
                                border: '1px solid #1e293b',
                              },
                              '&:hover': {
                                background: 'rgba(37, 99, 235, 0.08)',
                                '.dark &': {
                                  background: 'rgba(34, 211, 238, 0.10)',
                                },
                              },
                            },
                          ]}
                        >
                          {isActive && (
                            <div
                              className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full bg-[var(--brand)]"
                              style={{
                                height: '55%',
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
                                ? 'text-[var(--brand)]'
                                : 'text-[#6b7280] dark:text-[#64748b]'
                              }
                            />
                          </div>
                          {open && (
                            <span
                              className={`text-[14px] font-medium leading-tight truncate transition-colors duration-200 ${
                                isActive
                                  ? 'text-[var(--brand)]'
                                  : 'text-[#374151] dark:text-[#94a3b8]'
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
            <div className="p-3 rounded-lg bg-[#f9fafb] dark:bg-[#0d1320] border border-[#e5e7eb] dark:border-[#1e293b]">
              <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#9ca3af] dark:text-[#475569] mb-0.5">Hercules v2</p>
              <p className="text-[10px] text-[#9ca3af] dark:text-[#475569]">Industrial SCADA</p>
            </div>
          </div>
        )}
      </Drawer>
    </Box>
  );
}
