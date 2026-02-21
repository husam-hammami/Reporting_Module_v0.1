import { useContext } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Tooltip } from '@mui/material';
import { DarkModeContext } from '../../Context/DarkModeProvider';

function DarkModeButton() {
  const { mode, setMode } = useContext(DarkModeContext);

  return (
    <Tooltip title={mode === 'dark' ? "Switch to light mode" : "Switch to dark mode"} placement="bottom" arrow disableInteractive>
      <button
        onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
        className="h-7 w-7 flex items-center justify-center rounded-md cursor-pointer transition-colors shrink-0 text-[#6b7f94] hover:text-[#3a4a5c] hover:bg-[#f0f5fa] dark:text-[#8898aa] dark:hover:text-[#e1e8f0] dark:hover:bg-[#1e2d40]"
      >
        {mode === 'dark' ? (
          <Sun size={15} strokeWidth={2} />
        ) : (
          <Moon size={15} strokeWidth={2} />
        )}
      </button>
    </Tooltip>
  );
}

export default DarkModeButton;
