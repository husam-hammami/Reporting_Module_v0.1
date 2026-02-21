import { useContext } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkModeProvider } from '../Context/DarkModeProvider';
import { NavbarProvider } from '../Context/NavbarContext';
import { AuthContext } from '../Context/AuthProvider';
import LoadingScreen from '../Components/Common/LoadingScreen';
import { SocketProvider } from '../Context/SocketContext';
import { EmulatorProvider } from '../Context/EmulatorContext';
import { SystemStatusProvider } from '../Context/SystemStatusContext';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 2,
    },
  },
});

const AppProviders = ({ children }) => {
  const { authLoading } = useContext(AuthContext);

  if (authLoading) {
    return <LoadingScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <SystemStatusProvider>
        <EmulatorProvider>
        <NavbarProvider>
          <DarkModeProvider>
            {children}
          </DarkModeProvider>
        </NavbarProvider>
        </EmulatorProvider>
        </SystemStatusProvider>
      </SocketProvider>
    </QueryClientProvider>
  );
};

export default AppProviders;
