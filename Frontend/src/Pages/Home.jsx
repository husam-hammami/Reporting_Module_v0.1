import { Box, createTheme, styled, ThemeProvider } from '@mui/material';
import SideNav from '../Components/Common/SideNav';
import Navbar from '../Components/Navbar/Navbar';
import { Outlet } from 'react-router-dom';
import { DarkModeContext } from '../Context/DarkModeProvider';
import { NavbarContext } from '../Context/NavbarContext';
import { useContext } from 'react';

function Home() {
  const contextValue = useContext(DarkModeContext);
  const { mode } = contextValue || {};
  const { open } = useContext(NavbarContext);

  const sideWidth = open ? 220 : 60;

  const theme = createTheme({
    colorSchemes: {
      dark: mode === 'dark' ? true : false,
    },
  });

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Navbar />
      <SideNav />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 0,
          overflow: 'hidden',
          marginLeft: `${sideWidth}px`,
          transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        className="bg-transparent"
      >
        <Box sx={{ minHeight: 72 }} />
        <ThemeProvider theme={theme}>
          <div id="main-scroll-container" className="h-[calc(100vh-72px)] overflow-auto">
            <Outlet />
          </div>
        </ThemeProvider>
      </Box>
    </Box>
  );
}

export default Home;
