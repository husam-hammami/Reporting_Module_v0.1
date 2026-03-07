import { useContext } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Tooltip } from '@mui/material';
import { DarkModeContext } from '../../Context/DarkModeProvider';

function DarkModeButton() {
  const { mode, setMode } = useContext(DarkModeContext);
  const isDark = mode === 'dark';

  return (
    <Tooltip title={isDark ? "Switch to light mode" : "Switch to dark mode"} placement="bottom" arrow disableInteractive>
      <button
        onClick={() => setMode(isDark ? 'light' : 'dark')}
        className="relative h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer transition-all duration-300 shrink-0 text-[#94a3b8] hover:text-[#334155] hover:bg-black/[0.04] dark:text-[#475569] dark:hover:text-[#e2e8f0] dark:hover:bg-white/[0.06] overflow-hidden"
      >
        <Sun
          size={14}
          strokeWidth={2}
          className={`absolute transition-all duration-300 ${
            isDark
              ? 'rotate-0 scale-100 opacity-100'
              : 'rotate-90 scale-0 opacity-0'
          }`}
        />
        <Moon
          size={14}
          strokeWidth={2}
          className={`absolute transition-all duration-300 ${
            isDark
              ? '-rotate-90 scale-0 opacity-0'
              : 'rotate-0 scale-100 opacity-100'
          }`}
        />
      </button>
    </Tooltip>
  );
}

export default DarkModeButton;
