import { useContext, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import { Menu, X } from 'lucide-react';
import DarkModeButton from '../Common/DarkModeButton';
import HerculesNewLogo from '../../Assets/Hercules_New.png';
import AsmLogo from '../../Assets/Asm_Logo.png';
import { NavbarContext } from '../../Context/NavbarContext';
import { AuthContext } from '../../Context/AuthProvider';
import { Tooltip } from '@mui/material';
import { useSystemStatus } from '../../Context/SystemStatusContext';
import { LogOut, ChevronDown } from 'lucide-react';
import '../../Pages/ReportBuilder/reportBuilderTheme.css';

function Navbar({ isBlueprint = false }) {
  const contextValue = useContext(NavbarContext);
  const { open, setOpen } = contextValue || {};
  const { auth, logout } = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const { demoMode, loading: statusLoading } = useSystemStatus();

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
      className="!bg-white/90 dark:!bg-[#0a1120]/90 !border-b !border-black/[0.08] dark:!border-white/[0.06] !shadow-none"
      style={{
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <Toolbar
        variant="dense"
        className="!min-h-[80px] !px-4 flex justify-between items-center"
      >
        <div className="flex items-center gap-3 shrink-0">
          {!isBlueprint && auth && (
            <Tooltip title="Toggle menu" placement="bottom" arrow disableInteractive>
              <IconButton
                size="small"
                edge="start"
                onClick={() => setOpen?.((prev) => !prev)}
                className="!text-[#64748b] dark:!text-[#94a3b8] hover:!bg-black/[0.04] dark:hover:!bg-white/[0.06] !p-1.5 !rounded-lg !transition-all !duration-200"
              >
                {open ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
              </IconButton>
            </Tooltip>
          )}

          <img
            src={HerculesNewLogo}
            alt="HERCULES"
            className="h-14 w-auto object-contain shrink-0 dark:[filter:brightness(0)_invert(1)_brightness(0.9)]"
          />

          <div className="flex items-center gap-1.5 ml-1">
            <DarkModeButton />

            {!statusLoading && demoMode !== null && (
              <Tooltip title={demoMode ? "Demo mode — simulated data" : "Live mode — real PLC data"} placement="bottom" arrow disableInteractive>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider select-none cursor-default transition-all duration-300 ${
                  demoMode
                    ? 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/20'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    demoMode
                      ? 'bg-amber-500 animate-live-pulse'
                      : 'bg-emerald-500 animate-live-pulse'
                  }`} />
                  {demoMode ? 'DEMO' : 'LIVE'}
                </div>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <img
            src={AsmLogo}
            alt="ASM"
            className="h-9 w-auto object-contain shrink-0 opacity-70 hover:opacity-100 transition-opacity duration-300"
          />
          {auth && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-all duration-200 group"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#475569] to-[#334155] dark:from-[#64748b] dark:to-[#475569] text-white text-[12px] font-bold flex items-center justify-center shadow-sm">
                  {auth.username?.charAt(0)?.toUpperCase()}
                </div>
                <div className="hidden sm:flex flex-col items-start">
                  <span className="text-[12px] font-medium text-[#334155] dark:text-[#e2e8f0] leading-tight">
                    {auth.username}
                  </span>
                  <span className="text-[10px] text-[#94a3b8] dark:text-[#64748b] capitalize leading-tight">
                    {auth.role}
                  </span>
                </div>
                <ChevronDown size={13} className="text-[#94a3b8] dark:text-[#64748b] group-hover:text-[#64748b] dark:group-hover:text-[#94a3b8] transition-colors" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-full mt-1.5 z-50 bg-white dark:bg-[#0f1a2e] border border-black/[0.08] dark:border-white/[0.08] rounded-xl shadow-xl min-w-[160px] py-1 animate-scale-in"
                    style={{
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                    }}
                  >
                    <div className="px-3 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                      <p className="text-[12px] font-semibold text-[#334155] dark:text-[#e2e8f0]">{auth.username}</p>
                      <p className="text-[10px] text-[#94a3b8] dark:text-[#64748b] capitalize">{auth.role}</p>
                    </div>
                    <button
                      onClick={() => { setMenuOpen(false); logout(); }}
                      className="w-full text-left px-3 py-2 text-[12px] text-[#64748b] dark:text-[#94a3b8] hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors flex items-center gap-2"
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Toolbar>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-[#475569]/20 to-transparent dark:via-[#64748b]/15" />
    </AppBar>
  );
}

export default Navbar;
