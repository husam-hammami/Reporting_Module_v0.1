import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaTerminal, FaSearch, FaDownload, FaTrashAlt, FaPause, FaPlay, FaSync } from 'react-icons/fa';
import { useLanguage } from '../../../Hooks/useLanguage';

export default function SystemLogs() {
  const { t } = useLanguage();

  const [logLines, setLogLines] = useState([]);
  const [logMeta, setLogMeta] = useState(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logLevel, setLogLevel] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const logEndRef = useRef(null);
  const logIntervalRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    setLogLoading(true);
    try {
      const params = new URLSearchParams({ lines: '300' });
      if (logLevel) params.set('level', logLevel);
      if (logSearch) params.set('search', logSearch);
      const res = await fetch(`/api/settings/system-logs?${params}`, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setLogLines(data.lines || []);
      setLogMeta({ total: data.totalLines, filtered: data.filteredCount, path: data.logPath });
    } catch { /* silently fail */ }
    finally { setLogLoading(false); }
  }, [logLevel, logSearch]);

  useEffect(() => {
    fetchLogs();
    if (autoRefresh) {
      logIntervalRef.current = setInterval(fetchLogs, 5000);
    }
    return () => clearInterval(logIntervalRef.current);
  }, [fetchLogs, autoRefresh]);

  useEffect(() => {
    if (autoRefresh && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logLines, autoRefresh]);

  const handleDownloadLogs = () => {
    const blob = new Blob([logLines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hercules-logs-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLogLineColor = (line) => {
    if (/\bERROR\b/i.test(line)) return 'text-red-600 dark:text-red-400';
    if (/\bWARNING\b/i.test(line)) return 'text-amber-600 dark:text-amber-400';
    if (/\bINFO\b/i.test(line)) return 'text-emerald-600 dark:text-emerald-400';
    if (/\bDEBUG\b/i.test(line)) return 'text-blue-600 dark:text-blue-400';
    return 'text-[#4a5c6e] dark:text-[#a0b0c0]';
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40]">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#e3e9f0] dark:border-[#1e2d40]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center bg-slate-100 dark:bg-slate-800/50">
              <FaTerminal className="text-slate-600 dark:text-slate-400" size={11} />
            </div>
            <div>
              <h3 className="text-[12px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">{t('system.logViewer')}</h3>
              <p className="text-[9px] text-[#8898aa]">
                {logMeta ? `${logMeta.path} · ${logMeta.total} ${t('system.logTotalLines')}` : t('system.logViewerDesc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center gap-1 px-2 py-1 text-[9px] font-medium rounded-md transition-colors ${
                autoRefresh
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
              title={autoRefresh ? t('system.logPause') : t('system.logResume')}
            >
              {autoRefresh ? <FaPause size={7} /> : <FaPlay size={7} />}
              {autoRefresh ? t('system.logLive') : t('system.logPaused')}
            </button>
            <button
              onClick={fetchLogs}
              className="p-1.5 rounded-md text-[#8898aa] hover:text-[#2a3545] dark:hover:text-[#e1e8f0] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t('system.logRefresh')}
            >
              <FaSync size={9} className={logLoading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleDownloadLogs}
              disabled={logLines.length === 0}
              className="p-1.5 rounded-md text-[#8898aa] hover:text-[#2a3545] dark:hover:text-[#e1e8f0] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30"
              title={t('system.logDownload')}
            >
              <FaDownload size={9} />
            </button>
            <button
              onClick={() => setLogLines([])}
              disabled={logLines.length === 0}
              className="p-1.5 rounded-md text-[#8898aa] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-30"
              title={t('system.logClear')}
            >
              <FaTrashAlt size={9} />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e3e9f0] dark:border-[#1e2d40] bg-[#f9fafb] dark:bg-[#0d1825]">
          <select
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value)}
            className="px-2 py-1 text-[10px] rounded-md border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] text-[#2a3545] dark:text-[#e1e8f0] focus:outline-none focus:border-brand"
          >
            <option value="">{t('system.logAllLevels')}</option>
            <option value="ERROR">ERROR</option>
            <option value="WARNING">WARNING</option>
            <option value="INFO">INFO</option>
            <option value="DEBUG">DEBUG</option>
          </select>
          <div className="flex-1 relative">
            <FaSearch className="absolute start-2 top-1/2 -translate-y-1/2 text-[#8898aa]" size={9} />
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder={t('system.logSearchPlaceholder')}
              className="w-full ps-7 pe-2 py-1 text-[10px] rounded-md border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] text-[#2a3545] dark:text-[#e1e8f0] focus:outline-none focus:border-brand placeholder:text-[#8898aa]"
            />
          </div>
          {logMeta && (
            <span className="text-[9px] text-[#8898aa] whitespace-nowrap">
              {logLines.length} / {logMeta.filtered} {t('system.logLines')}
            </span>
          )}
        </div>

        {/* Terminal body */}
        <div className="bg-[#f5f8fb] dark:bg-[#0a0e17] rounded-b-lg overflow-hidden">
          <div className="h-[480px] overflow-y-auto p-3 font-mono text-[10px] leading-[18px] scrollbar-thin scrollbar-thumb-[#c1ccd9] dark:scrollbar-thumb-[#2a3347] scrollbar-track-transparent">
            {logLines.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[#8898aa] dark:text-[#4a5568]">
                <div className="text-center">
                  <FaTerminal size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-[11px]">{t('system.logEmpty')}</p>
                  <p className="text-[9px] mt-1 opacity-60">{t('system.logEmptyHint')}</p>
                </div>
              </div>
            ) : (
              logLines.map((line, i) => (
                <div key={i} className={`hover:bg-black/[0.03] dark:hover:bg-white/[0.03] px-1 rounded ${getLogLineColor(line)}`}>
                  <span className="text-[#b0bec5] dark:text-[#4a5568] select-none me-2">{String(i + 1).padStart(3, ' ')}</span>
                  {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
