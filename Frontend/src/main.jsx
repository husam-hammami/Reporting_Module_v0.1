import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './Context/AuthProvider.jsx';
import AppProviders from './Routes/AppProvider.jsx'

// Render the application
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AppProviders>
        <App />
      </AppProviders>
    </AuthProvider>
  </StrictMode>
);
