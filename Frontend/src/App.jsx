// Main imports
import './App.css';
import AppRouter from './Routes/AppRouter.jsx';

// Third parties imports
import { ToastContainer } from 'react-toastify';
import SplashScreen from './Components/Common/SplashScreen.jsx';
import useLoading from './Hooks/useLoading.jsx';
import { useContext, useEffect } from 'react';
import { DarkModeContext } from './Context/DarkModeProvider.jsx';
import { useLanguage } from './Hooks/useLanguage';
import { AuthContext } from './Context/AuthProvider.jsx';
import { useLenisScroll } from './Hooks/useLenisScroll.js'; // ✅ Add this

function App() {
  const loading = useLoading();
  const { mode } = useContext(DarkModeContext);
  const { isRTL } = useLanguage();
  useLenisScroll(); // ✅ Add this
  // Global error handler for message channel errors
  useEffect(() => {
    const handleError = (event) => {
      if (event.error && event.error.message && event.error.message.includes('message channel closed')) {
        console.warn('Message channel error caught and handled:', event.error);
        event.preventDefault();
        return false;
      }
    };

    const handleUnhandledRejection = (event) => {
      if (event.reason && event.reason.message && event.reason.message.includes('message channel closed')) {
        console.warn('Unhandled promise rejection (message channel) caught and handled:', event.reason);
        event.preventDefault();
        return false;
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <>
      {loading ? (
        <SplashScreen />
      ) : (
        <>
          <div className="app">
            <AppRouter />
            <ToastContainer
              position={isRTL ? "top-left" : "top-right"}
              autoClose={5000}
              closeOnClick
              rtl={isRTL}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              stacked
              theme={`${mode === 'dark' ? 'dark' : 'light'}`}
            />
          </div>
        </>
      )}
    </>
  );
}

export default App;
