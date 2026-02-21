import { createContext, useState } from 'react';

// Create the context
export const NavbarContext = createContext();

// Create the provider
export const NavbarProvider = ({ children }) => {
  const [open, setOpen] = useState(true);

  return (
    <NavbarContext.Provider value={{ open, setOpen }}>
      {children}
    </NavbarContext.Provider>
  );
};
