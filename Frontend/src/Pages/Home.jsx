import { Box, createTheme, styled, ThemeProvider } from '@mui/material';
import SideNav from '../Components/Common/SideNav';
import Navbar from '../Components/Navbar/Navbar';
import { Outlet } from 'react-router-dom';
import { DarkModeContext } from '../Context/DarkModeProvider';
import { useContext, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

function VideoBackground({ mode }) {
  const videoRef = useRef(null);

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

  if (mode !== 'dark') return null;

  return createPortal(
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
          zIndex: -2,
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
          zIndex: -1,
          pointerEvents: 'none',
          background: 'linear-gradient(180deg, rgba(6,12,26,0.82) 0%, rgba(6,12,26,0.72) 40%, rgba(6,12,26,0.85) 100%)',
        }}
      />
    </>,
    document.body
  );
}

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
    <>
      <VideoBackground mode={mode} />
      <Box sx={{ display: 'flex', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
        <Navbar />
        <SideNav />
        <Box
          component="main"
          sx={{ flexGrow: 1, p: 0, overflow: 'hidden' }}
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
    </>
  );
}

export default Home;
