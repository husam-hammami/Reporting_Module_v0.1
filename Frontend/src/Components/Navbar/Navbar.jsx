// ── Commented out old Navbar implementation (lines 1-136) preserved above ──

import { useContext, useState, useEffect } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import { IoIosMenu, IoIosClose } from 'react-icons/io';
import DarkModeButton from '../Common/DarkModeButton';
import HerculesNewLogo from '../../Assets/Hercules_New.png';
import AsmLogo from '../../Assets/Asm_Logo.png';
import { NavbarContext } from '../../Context/NavbarContext';
import { AuthContext } from '../../Context/AuthProvider';
import { Tooltip } from '@mui/material';
import { useSystemStatus } from '../../Context/SystemStatusContext';
import '../../Pages/ReportBuilder/reportBuilderTheme.css';

function Navbar({ isBlueprint = false }) {
  const contextValue = useContext(NavbarContext);
  const { open, setOpen } = contextValue || {};
  const { auth, logout } = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const { demoMode, loading: statusLoading } = useSystemStatus();

  return (
    <>
    {/* LIVE/DEMO 3px indicator bar */}
    {!statusLoading && demoMode !== null && (
      <div className={`rb-env-indicator ${demoMode ? 'demo' : 'live'}`} />
    )}
    <AppBar
      position="fixed"
      elevation={0}
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, top: !statusLoading && demoMode !== null ? '3px' : 0 }}
      className="!bg-white dark:!bg-[#0c1321] !border-b !border-[#e3e9f0] dark:!border-[#1e2d40] !shadow-none"
    >
      <Toolbar
        variant="dense"
        className="!min-h-[70px] !px-3 flex justify-between items-center"
      >
        {/* Left: hamburger + logo */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isBlueprint && auth && (
            <Tooltip title="Toggle menu" placement="bottom" arrow disableInteractive>
              <IconButton
                size="small"
                edge="start"
                color="inherit"
                onClick={() => setOpen?.((prev) => !prev)}
                className="!text-[#6b7f94] hover:!bg-[#f0f5fa] dark:hover:!bg-[#131b2d] !p-1"
              >
                {open ? <IoIosClose size={18} /> : <IoIosMenu size={18} />}
              </IconButton>
            </Tooltip>
          )}
          <img
            src={HerculesNewLogo}
            alt="HERCULES"
            className="h-12 w-auto object-contain shrink-0 dark:[filter:brightness(0)_invert(1)]"
          />
          <DarkModeButton />
          {!statusLoading && demoMode !== null && (
            <Tooltip title={demoMode ? "Demo mode active" : "Live mode active"} placement="bottom" arrow disableInteractive>
              <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider select-none ${
                demoMode
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
              }`}>
                {demoMode ? 'DEMO' : 'LIVE'}
              </div>
            </Tooltip>
          )}
        </div>

        {/* Right: ASN/ASM logo + user info */}
        <div className="flex items-center gap-3">
          <img
            src={AsmLogo}
            alt="ASN"
            className="h-12 w-auto object-contain shrink-0"
          />
          {auth && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#6b7f94] hidden sm:inline">
              {auth.username}
            </span>
            <div className="relative">
              <Tooltip title="User menu" placement="bottom" arrow disableInteractive>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="w-7 h-7 rounded-full bg-brand text-white text-[11px] font-semibold flex items-center justify-center hover:bg-brand-hover transition-colors"
                >
                  {auth.username?.charAt(0)?.toUpperCase()}
                </button>
              </Tooltip>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-[#131b2d] border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg shadow-xl py-1 min-w-[120px]">
                    <button
                      onClick={() => { setMenuOpen(false); logout(); }}
                      className="w-full text-left px-3 py-2 text-[12px] text-[#3a4a5c] dark:text-[#c1ccd9] hover:bg-[#f5f8fb] dark:hover:bg-[#131b2d] transition-colors"
                    >
                      Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          )}
        </div>
      </Toolbar>
    </AppBar>
    </>
  );
}

export default Navbar;
