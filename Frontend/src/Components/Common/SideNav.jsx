// import { styled, useTheme } from '@mui/material/styles';
// import MuiDrawer from '@mui/material/Drawer';
// import List from '@mui/material/List';
// import Divider from '@mui/material/Divider';
// import ListItem from '@mui/material/ListItem';
// import ListItemButton from '@mui/material/ListItemButton';
// import { Box, Tooltip } from '@mui/material';
// import { menuItems /*, bluePrint, feederBlueprint */ } from '../../Data/Navbar';
// import { NavbarContext } from '../../Context/NavbarContext';
// import { useContext } from 'react';
// import { NavLink } from 'react-router-dom';
// import { AuthContext } from '../../Context/AuthProvider';

// const drawerWidth = 240;

// const openedMixin = theme => ({
//   width: drawerWidth,
//   transition: theme.transitions.create('width', {
//     easing: theme.transitions.easing.sharp,
//     duration: theme.transitions.duration.enteringScreen,
//   }),
//   overflowX: 'hidden',
// });

// const closedMixin = theme => ({
//   transition: theme.transitions.create('width', {
//     easing: theme.transitions.easing.sharp,
//     duration: theme.transitions.duration.leavingScreen,
//   }),
//   overflowX: 'hidden',
//   width: `calc(${theme.spacing(7)} + 1px)`,
//   [theme.breakpoints.up('sm')]: {
//     width: `calc(${theme.spacing(8)} + 1px)`,
//   },
// });

// const DrawerHeader = styled('div')(({ theme }) => ({
//   display: 'flex',
//   alignItems: 'center',
//   justifyContent: 'flex-end',
//   padding: theme.spacing(0, 1),
//   ...theme.mixins.toolbar,
// }));

// const Drawer = styled(MuiDrawer, {
//   shouldForwardProp: prop => prop !== 'open',
// })(({ theme, open }) => ({
//   width: drawerWidth,
//   flexShrink: 0,
//   whiteSpace: 'nowrap',
//   boxSizing: 'border-box',
//   ...(open && {
//     ...openedMixin(theme),
//     '& .MuiDrawer-paper': openedMixin(theme),
//   }),
//   ...(!open && {
//     ...closedMixin(theme),
//     '& .MuiDrawer-paper': closedMixin(theme),
//   }),
// }));

// export default function SideNav() {
//   const { open } = useContext(NavbarContext);
//   const { auth } = useContext(AuthContext);

//   return (
//     <Box sx={{ display: 'flex' }}>
//       <Drawer
//         variant="permanent"
//         open={open}
//         PaperProps={{
//           className:
//             'dark:!bg-zinc-800 dark:!text-zinc-300 !bg-zinc-300 2xl:!pt-10 pt-7',
//         }}
//       >
//         <DrawerHeader />

//         {/* --- Standard Menu Items --- */}
//         <List>
//           {menuItems.map(
//             (item) =>
//               item.roles.includes(auth.role) && (
//                 <ListItem key={item.name} disablePadding sx={{ display: 'block' }}>
//                   <NavLink
//                     to={item.link}
//                     className={({ isActive }) =>
//                       `inline-block w-full transition-all duration-300 ease-in-out ${
//                         isActive
//                           ? 'bg-zinc-600 dark:bg-zinc-200 text-zinc-100 dark:text-zinc-800 hover:!bg-zinc-500 dark:hover:!bg-zinc-400'
//                           : 'dark:hover:!bg-zinc-700 hover:!bg-zinc-400'
//                       }`
//                     }
//                   >
//                     <Tooltip
//                       title={<span className="2xl:!text-lg">{item.tooltip}</span>}
//                       placement="top"
//                       arrow
//                       disableInteractive
//                       slotProps={{
//                         popper: { className: `${open ? 'hidden' : ''}` },
//                       }}
//                     >
//                       <ListItemButton
//                         sx={[
//                           { minHeight: 48, px: 2.5 },
//                           open
//                             ? { justifyContent: 'initial' }
//                             : { justifyContent: 'center' },
//                         ]}
//                         className="last:2xl:!mb-1 !py-6 2xl:!py-7"
//                       >
//                         <div
//                           className={`flex justify-center items-center ${
//                             open ? 'mr-3' : 'mr-auto'
//                           }`}
//                         >
//                           <item.icon className="text-xl md:text-2xl 2xl:!text-3xl" />
//                         </div>
//                         <span
//                           className={`text-xl 2xl:!text-2xl ml-3 ${
//                             open ? 'inline' : 'hidden'
//                           }`}
//                         >
//                           {item.name}
//                         </span>
//                       </ListItemButton>
//                     </Tooltip>
//                   </NavLink>
//                 </ListItem>
//               )
//           )}
//         </List>

//         <Divider className="dark:!bg-zinc-600" />

//         {/* --- Blueprint Order Menu --- */}
//         {/* Commented out for future use
//         <Tooltip
//           title={<span className="2xl:!text-lg">{bluePrint.tooltip}</span>}
//           placement="right"
//         >
//           <ListItemButton
//             component={NavLink}
//             to={bluePrint.link}
//             className={`!rounded-lg !mb-2 !p-2 !min-h-0 ${
//               open ? '!justify-start' : '!justify-center'
//             }`}
//             sx={{
//               '&.active': {
//                 backgroundColor: 'primary.main',
//                 color: 'white',
//                 '&:hover': {
//                   backgroundColor: 'primary.dark',
//                 },
//               },
//             }}
//           >
//             <Box
//               className={`flex items-center ${
//                 open ? 'w-full' : 'w-auto'
//               }`}
//             >
//               <bluePrint.icon className="text-xl md:text-2xl 2xl:!text-3xl" />
//               {open && (
//                 <span className="ml-3 text-sm md:text-base 2xl:!text-lg">
//                   {bluePrint.name}
//                 </span>
//               )}
//             </Box>
//           </ListItemButton>
//         </Tooltip>

//         <Tooltip
//           title={<span className="2xl:!text-lg">{feederBlueprint.tooltip}</span>}
//           placement="right"
//         >
//           <ListItemButton
//             component={NavLink}
//             to={feederBlueprint.link}
//             className={`!rounded-lg !mb-2 !p-2 !min-h-0 ${
//               open ? '!justify-start' : '!justify-center'
//             }`}
//             sx={{
//               '&.active': {
//                 backgroundColor: 'primary.main',
//                 color: 'white',
//                 '&:hover': {
//                   backgroundColor: 'primary.dark',
//                 },
//               },
//             }}
//           >
//             <Box
//               className={`flex items-center ${
//                 open ? 'w-full' : 'w-auto'
//               }`}
//             >
//               <feederBlueprint.icon className="text-xl md:text-2xl 2xl:!text-3xl" />
//               {open && (
//                 <span className="ml-3 text-sm md:text-base 2xl:!text-lg">
//                   {feederBlueprint.name}
//                 </span>
//               )}
//             </Box>
//           </ListItemButton>
//         </Tooltip>
//         */}
//       </Drawer>
//     </Box>
//   );
// }














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

/* Category header mapping — links to category labels */
const CATEGORY_MAP = {
  '/report-builder': 'BUILD',
  '/reporting': 'VIEW',
  '/settings': 'CONFIGURE',
};

const drawerWidth = 170;

const openedMixin = theme => ({
  width: drawerWidth,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
});

const closedMixin = theme => ({
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: 'hidden',
  width: 48,
  [theme.breakpoints.up('sm')]: {
    width: 48,
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
      borderRight: '1px solid #e3e9f0',
    },
  }),
  ...(!open && {
    ...closedMixin(theme),
    '& .MuiDrawer-paper': {
      ...closedMixin(theme),
      borderRight: '1px solid #e3e9f0',
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

  return (
    <Box sx={{ display: 'flex' }}>
      <Drawer
        variant="permanent"
        open={open}
        PaperProps={{
          sx: {
            background: '#ffffff',
            color: '#3a4a5c',
            paddingTop: '70px',
            '.dark &': {
              background: '#080f1a',
              color: '#e0e0e0',
              borderColor: '#1e2d40',
            },
          },
        }}
      >
        <List sx={{ px: open ? 1 : 0.5, pt: 0.5 }}>
          {uniqueMenuItems.map(
            (item) =>
              auth && item.roles.includes(auth.role) && (
                <ListItem key={item.link} disablePadding sx={{ display: 'block', mb: 0.25 }}>
                  {CATEGORY_MAP[item.link] && (
                    <div className={`rb-sidenav-category ${open ? '' : 'collapsed'}`}>
                      {CATEGORY_MAP[item.link]}
                    </div>
                  )}
                  <NavLink
                    to={item.link}
                    className={({ isActive }) =>
                      `block w-full rounded-lg transition-all duration-200 ${
                        isActive
                          ? 'bg-brand-subtle text-brand dark:bg-brand-subtle dark:text-brand'
                          : 'text-[#5a6d80] hover:bg-[#f4f8fb] dark:text-[#8898aa] dark:hover:bg-[#131b2d]'
                      }`
                    }
                  >
                    {({ isActive }) => (
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
                              minHeight: 34,
                              px: open ? 1.5 : 1,
                              py: 0.6,
                              borderRadius: '6px',
                            },
                            open
                              ? { justifyContent: 'initial' }
                              : { justifyContent: 'center' },
                          ]}
                        >
                          <div
                            className={`flex justify-center items-center flex-shrink-0 ${
                              open ? 'mr-2.5' : 'mr-0'
                            }`}
                          >
                            <item.icon
                              style={{ fontSize: 14 }}
                              className={isActive ? 'text-brand dark:text-brand' : 'text-[#8898aa] dark:text-[#a0a0a0]'}
                            />
                          </div>
                          {open && (
                            <span
                              className={`text-[12px] font-medium leading-tight truncate ${
                                isActive ? 'text-brand dark:text-brand' : 'text-[#3a4a5c] dark:text-[#c1ccd9]'
                              }`}
                            >
                              {item.name}
                            </span>
                          )}
                        </ListItemButton>
                      </Tooltip>
                    )}
                  </NavLink>
                </ListItem>
              )
          )}
        </List>
      </Drawer>
    </Box>
  );
}
