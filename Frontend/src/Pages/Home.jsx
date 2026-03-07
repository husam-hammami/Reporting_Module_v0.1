import { Box, createTheme, styled, ThemeProvider } from '@mui/material';
import SideNav from '../Components/Common/SideNav';
import Navbar from '../Components/Navbar/Navbar';
import { Outlet } from 'react-router-dom';
import { DarkModeContext } from '../Context/DarkModeProvider';
import { useContext, useRef, useEffect } from 'react';

function Home() {
  const contextValue = useContext(DarkModeContext);
  const { mode } = contextValue || {};
  const videoRef = useRef(null);

  const DrawerHeader = styled('div')(() => ({
    minHeight: 80,
  }));

  const theme = createTheme({
    colorSchemes: {
      dark: mode === 'dark' ? true : false,
    },
  });

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 0.75;
    }
  }, []);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Navbar />
      <SideNav />
      <Box
        component="main"
        sx={{ flexGrow: 1, p: 0, overflow: 'hidden', position: 'relative' }}
        className="bg-[#f8f9fb] dark:bg-[#060c1a]"
      >
        {mode === 'dark' && (
          <>
            <video
              ref={videoRef}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none motion-reduce:hidden"
              style={{ zIndex: 0, opacity: 0.45 }}
            >
              <source src="/bg-video.mp4" type="video/mp4" />
            </video>
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                zIndex: 1,
                background: 'linear-gradient(180deg, rgba(6,12,26,0.82) 0%, rgba(6,12,26,0.72) 40%, rgba(6,12,26,0.85) 100%)',
              }}
            />
          </>
        )}
        <DrawerHeader />
        <ThemeProvider theme={theme}>
          <div id="main-scroll-container" className="h-[calc(100vh-80px)] overflow-auto" style={{ position: 'relative', zIndex: 2 }}>
            <Outlet />
          </div>
        </ThemeProvider>
      </Box>
    </Box>
  );
}

export default Home;
