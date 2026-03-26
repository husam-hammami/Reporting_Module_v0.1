import { useContext, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import { Menu, LogOut, Moon, Sun, User, Activity } from 'lucide-react';
import HerculesNewLogo from '../../Assets/Hercules_New.png';
import AsmLogo from '../../Assets/Asm_Logo.png';
import { NavbarContext } from '../../Context/NavbarContext';
import { AuthContext } from '../../Context/AuthProvider';
import { useSystemStatus } from '../../Context/SystemStatusContext';
import { useBranding } from '../../Context/BrandingContext';
import { useLocation } from 'react-router-dom';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import { useLanguage } from '../../Hooks/useLanguage';
import { motion, AnimatePresence } from 'framer-motion';
import '../../Pages/ReportBuilder/reportBuilderTheme.css';

function Navbar({ isBlueprint = false }) {
  const { open, setOpen } = useContext(NavbarContext);
  const { auth, logout } = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const { demoMode, loading: statusLoading } = useSystemStatus();
  const { clientLogo } = useBranding();
  const { mode, setMode } = useContext(DarkModeContext);
  const { lang, setLang, t } = useLanguage();
  const isDark = mode === 'dark';
  const location = useLocation();

  const PAGE_LABELS = {
    'report-builder': t('nav.builder'),
    'dashboards': t('nav.dashboards'),
    'reports': t('nav.tableReports'),
    'settings': t('nav.engineering'),
  };

  const pathSegments = location.pathname.split('/').filter(Boolean);
  const currentPage = PAGE_LABELS[pathSegments[0]] || 'Hercules SFMS';

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
      className="!bg-[#111827] !shadow-none border-b border-[#1e293b]"
    >
      <Toolbar
        variant="dense"
        className="!min-h-[72px] !px-5 flex items-center justify-between"
      >
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setOpen(!open)}
            className="p-2 hover:bg-[#1a2233] rounded-lg transition-colors text-[#f0f4f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]"
          >
            <Menu size={22} />
          </button>

          <img
            src={HerculesNewLogo}
            alt="HERCULES"
            className="h-14 w-auto object-contain shrink-0"
            style={{ filter: 'brightness(0) invert(1) brightness(0.95)' }}
          />
        </div>

        <div className="hidden md:flex items-center gap-3 absolute left-1/2 -translate-x-1/2">
          {!statusLoading && demoMode !== null && (
            <div className={`flex items-center gap-2.5 px-4 py-1.5 rounded-full border ${
              demoMode
                ? 'bg-amber-500/5 text-amber-400 border-amber-500/20'
                : 'bg-emerald-500/5 text-[#34d399] border-emerald-500/20'
            }`}>
              <span className={`w-2 h-2 rounded-full animate-pulse shadow-[0_0_6px_currentColor] ${
                demoMode ? 'bg-amber-500' : 'bg-[#34d399]'
              }`} />
              <span className="text-[11px] font-bold tracking-widest">{demoMode ? t('nav.demo') : t('nav.live')}</span>
              <span className="text-[10px] text-[#556677] font-medium tracking-wide">{currentPage}</span>
            </div>
          )}
          {(statusLoading || demoMode === null) && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#1e293b] bg-[#0a0f1a]">
              <Activity size={13} className="text-[#556677]" />
              <span className="text-[10px] text-[#556677] font-medium tracking-wide">{currentPage}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {clientLogo && (
            <img
              src={clientLogo}
              alt="Client"
              className="h-12 w-auto max-w-[140px] object-contain shrink-0 rounded-lg bg-white/95 px-2.5 py-1 shadow-sm"
            />
          )}
          <img
            src={AsmLogo}
            alt="ASM"
            className="h-12 w-auto object-contain shrink-0 rounded-lg bg-white/95 px-2.5 py-1 shadow-sm"
          />

          <div className="h-7 w-px bg-[#1e293b]" />

          <button
            onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
            className="px-2.5 py-1.5 hover:bg-[#1a2233] rounded-lg transition-colors text-[#8899ab] hover:text-[#f0f4f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee] text-xs font-bold tracking-wide"
            title={lang === 'en' ? t('common.switchToArabic') : t('common.switchToEnglish')}
          >
            {lang === 'en' ? 'ع' : 'EN'}
          </button>

          <button
            onClick={() => setMode(isDark ? 'light' : 'dark')}
            className="p-2 hover:bg-[#1a2233] rounded-lg transition-colors text-[#8899ab] hover:text-[#f0f4f8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee]"
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          >
            <motion.div 
              initial={false}
              animate={{ rotate: isDark ? 0 : 180, scale: isDark ? 1 : 0.8 }}
              transition={{ duration: 0.3 }}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </motion.div>
          </button>

          {auth && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-9 h-9 rounded-lg bg-[#1a2233] hover:bg-[#222d42] flex items-center justify-center border border-[#2a3347] text-[#8899ab] hover:text-[#f0f4f8] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee] shadow-sm"
              >
                <User size={18} />
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 z-50 bg-[#111827] border border-[#1e293b] rounded-xl shadow-2xl min-w-[180px] py-1.5 overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-[#1e293b] bg-[#0a0f1a]/50">
                        <p className="text-sm font-bold text-[#f0f4f8]">{auth.username}</p>
                        <p className="text-[11px] text-[#8899ab] font-medium tracking-wide uppercase mt-0.5">{auth.role}</p>
                      </div>
                      <div className="p-1.5">
                        <button
                          onClick={() => { setMenuOpen(false); logout(); }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-[#8899ab] hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors flex items-center gap-2.5"
                        >
                          <LogOut size={16} />
                          {t('nav.signOut')}
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
