import { createContext, useEffect, useState } from 'react';

export const DarkModeContext = createContext();
export const DarkModeProvider = ({ children }) => {
  const [mode, setMode] = useState(localStorage.getItem('theme') || "dark");  

  useEffect(() => {
    if (mode === 'light') {
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
    } else if (mode === 'dark') {
      localStorage.setItem('theme', 'dark');
      document.documentElement.classList.add('dark');
    }
  }, [mode]);
  return (
    <DarkModeContext.Provider value={{ mode, setMode }}>
      {children}
    </DarkModeContext.Provider>
  );
};
