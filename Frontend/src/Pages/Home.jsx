import { Box, createTheme, styled, ThemeProvider } from '@mui/material';
import SideNav from '../Components/Common/SideNav';
import Navbar from '../Components/Navbar/Navbar';
import { Outlet } from 'react-router-dom';
import { DarkModeContext } from '../Context/DarkModeProvider';
import { useContext } from 'react';

function Home() {
  const contextValue = useContext(DarkModeContext);
  const { mode } = contextValue || {};

  const DrawerHeader = styled('div')(() => ({
    minHeight: 80,
  }));

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
        sx={{ flexGrow: 1, p: 0, overflow: 'hidden' }}
        className="bg-[#f8f9fb] dark:bg-[#0d1117]"
      >
        <DrawerHeader />
        <ThemeProvider theme={theme}>
          <div id="main-scroll-container" className="h-[calc(100vh-80px)] overflow-auto">
            <Outlet />
          </div>
        </ThemeProvider>
      </Box>
    </Box>
  );
}

export default Home;
