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
    const video = videoRef.current;
    if (!video || mode !== 'dark') return;
    video.playbackRate = 0.75;
    const tryPlay = () => {
      video.play().catch(() => {});
    };
    tryPlay();
    video.addEventListener('canplay', tryPlay);
    document.addEventListener('click', tryPlay, { once: true });
    document.addEventListener('touchstart', tryPlay, { once: true });
    return () => {
      video.removeEventListener('canplay', tryPlay);
    };
  }, [mode]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {mode === 'dark' && (
        <>
          <video
            ref={videoRef}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              objectFit: 'cover',
              zIndex: 0,
              opacity: 0.4,
              pointerEvents: 'none',
            }}
          >
            <source src="/bg-video.mp4" type="video/mp4" />
          </video>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 0,
              pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(6,12,26,0.82) 0%, rgba(6,12,26,0.72) 40%, rgba(6,12,26,0.85) 100%)',
            }}
          />
        </>
      )}
      <Navbar />
      <SideNav />
      <Box
        component="main"
        sx={{ flexGrow: 1, p: 0, overflow: 'hidden', position: 'relative', zIndex: 1 }}
        className="bg-[#f8f9fb] dark:bg-transparent"
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
