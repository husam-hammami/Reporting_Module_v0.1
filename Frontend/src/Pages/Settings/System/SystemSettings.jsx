import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaServer, FaPlug, FaNetworkWired, FaSave, FaSync, FaGlobe, FaCopy, FaCheck, FaTerminal, FaSearch, FaDownload, FaTrashAlt, FaPause, FaPlay } from 'react-icons/fa';
import { useSystemStatus } from '../../../Context/SystemStatusContext';
import DemoModeSettings from '../DemoMode/DemoModeSettings';
import { useLanguage } from '../../../Hooks/useLanguage';

export default function SystemSettings() {
  const { demoMode, plcConfig, loading, toggleDemoMode, updatePlcConfig, fetchStatus } = useSystemStatus();
  const { t } = useLanguage();

  const [ip, setIp] = useState('');
  const [rack, setRack] = useState(0);
  const [slot, setSlot] = useState(3);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [plcMsg, setPlcMsg] = useState(null);
  const dirty = useRef(false);
  const [networkInfo, setNetworkInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  // ── System Log Viewer state ──
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

  // Initial fetch + auto-refresh
  useEffect(() => {
    fetchLogs();
    if (autoRefresh) {
      logIntervalRef.current = setInterval(fetchLogs, 5000);
    }
    return () => clearInterval(logIntervalRef.current);
  }, [fetchLogs, autoRefresh]);

  // Auto-scroll to bottom when new lines arrive
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
    if (/\bERROR\b/i.test(line)) return 'text-red-400';
    if (/\bWARNING\b/i.test(line)) return 'text-amber-400';
    if (/\bINFO\b/i.test(line)) return 'text-emerald-400';
    if (/\bDEBUG\b/i.test(line)) return 'text-blue-400';
    return 'text-[#a0b0c0]';
  };

  useEffect(() => {
    fetch('/api/settings/network-info', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setNetworkInfo(data))
      .catch(() => {});
  }, []);

  const handleCopyLink = () => {
    if (!networkInfo) return;
    navigator.clipboard.writeText(networkInfo.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (plcConfig && !dirty.current) {
      setIp(plcConfig.ip || '');
      setRack(plcConfig.rack ?? 0);
      setSlot(plcConfig.slot ?? 3);
    }
  }, [plcConfig]);

  const handleToggle = async () => {
    setToggling(true);
    try { await toggleDemoMode(!demoMode); }
    catch (e) { console.error('Failed to toggle mode:', e); }
    finally { setToggling(false); }
  };

  const handleSavePlc = async () => {
    setSaving(true);
    setPlcMsg(null);
    try {
      await updatePlcConfig(ip, Number(rack), Number(slot));
      dirty.current = false;
      setPlcMsg({ type: 'ok', text: t('system.savedReconnecting') });
      fetchStatus();
    } catch (e) {
      setPlcMsg({ type: 'err', text: e.response?.data?.error || e.message });
    } finally { setSaving(false); }
  };

  if (loading && demoMode === null) {
    return <div className="p-6 text-center text-[11px] text-[#8898aa]">{t('system.loadingStatus')}</div>;
  }

  const isUnknown = demoMode === null;
  const isDemo = !!demoMode;

  return (
    <div className="space-y-4">
      {/* ── Unreachable backend ── */}
      {isUnknown && (
        <div className="flex items-center justify-between px-4 py-3 rounded-lg border bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md flex items-center justify-center bg-red-100 dark:bg-red-900/30">
              <FaServer className="text-red-600 dark:text-red-400" size={12} />
            </div>
            <div>
              <h2 className="text-[12px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">{t('system.backendUnreachable')}</h2>
              <p className="text-[10px] text-[#8898aa]">{t('system.backendUnreachableDesc')}</p>
            </div>
          </div>
          <button
            onClick={fetchStatus}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            <FaSync size={9} /> {t('common.retry')}
          </button>
        </div>
      )}

      {/* ── Backend Mode + PLC Connection ── inline row ── */}
      {!isUnknown && (
        <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40]">
          {/* Mode banner */}
          <div className={`flex items-center justify-between px-4 py-2.5 rounded-t-lg border-b ${
            isDemo
              ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
              : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
          }`}>
            <div className="flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-md flex items-center justify-center ${
                isDemo ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'
              }`}>
                <FaServer className={isDemo ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'} size={12} />
              </div>
              <div>
                <h2 className="text-[12px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">
                  {t('system.backendMode')} — {isDemo ? t('system.demoEmulator') : t('system.productionPLC')}
                </h2>
                <p className="text-[10px] text-[#8898aa]">
                  {isDemo ? t('system.demoDesc') : t('system.productionDesc')}
                </p>
              </div>
            </div>
            <button
              onClick={handleToggle}
              disabled={toggling}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-md transition-colors disabled:opacity-50 ${
                isDemo
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              <FaSync size={9} className={toggling ? 'animate-spin' : ''} />
              {toggling ? t('system.switching') : isDemo ? t('system.switchToProduction') : t('system.switchToDemo')}
            </button>
          </div>

          {/* PLC Connection — inline within same card */}
          <div className={`px-4 py-3 ${isDemo || isUnknown ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="flex items-center gap-2 mb-2">
              <FaNetworkWired className="text-brand" size={11} />
              <h3 className="text-[11px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">{t('system.plcConnection')}</h3>
              {isDemo && <span className="text-[9px] text-[#8898aa] italic">{t('system.appliesInProduction')}</span>}
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-medium text-[#6b7f94] mb-1">{t('system.ipAddress')}</label>
                <input
                  type="text" value={ip}
                  onChange={(e) => { dirty.current = true; setIp(e.target.value); }}
                  disabled={isDemo || isUnknown}
                  placeholder="192.168.23.11"
                  className="w-full px-2.5 py-1.5 text-[11px] font-mono rounded-md border border-[#e3e9f0] dark:border-[#1e2d40] bg-[#f5f8fb] dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:outline-none focus:border-brand disabled:opacity-50"
                />
              </div>
              <div className="w-20">
                <label className="block text-[10px] font-medium text-[#6b7f94] mb-1">{t('system.rack')}</label>
                <input
                  type="number" value={rack} min={0} max={7}
                  onChange={(e) => { dirty.current = true; setRack(e.target.value); }}
                  disabled={isDemo || isUnknown}
                  className="w-full px-2.5 py-1.5 text-[11px] font-mono rounded-md border border-[#e3e9f0] dark:border-[#1e2d40] bg-[#f5f8fb] dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:outline-none focus:border-brand disabled:opacity-50"
                />
              </div>
              <div className="w-20">
                <label className="block text-[10px] font-medium text-[#6b7f94] mb-1">{t('system.slot')}</label>
                <input
                  type="number" value={slot} min={0} max={31}
                  onChange={(e) => { dirty.current = true; setSlot(e.target.value); }}
                  disabled={isDemo || isUnknown}
                  className="w-full px-2.5 py-1.5 text-[11px] font-mono rounded-md border border-[#e3e9f0] dark:border-[#1e2d40] bg-[#f5f8fb] dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:outline-none focus:border-brand disabled:opacity-50"
                />
              </div>
              <button
                onClick={handleSavePlc}
                disabled={isDemo || isUnknown || saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-md bg-brand hover:bg-brand-hover text-[#0c1321] transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <FaSave size={9} />
                {saving ? t('common.saving') : t('system.saveReconnect')}
              </button>
            </div>
            {plcMsg && (
              <p className={`mt-1.5 text-[10px] ${plcMsg.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                {plcMsg.text}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Network Access ── */}
      {networkInfo && networkInfo.ip !== '127.0.0.1' && (
        <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40]">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-7 h-7 rounded-md flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                <FaGlobe className="text-blue-600 dark:text-blue-400" size={12} />
              </div>
              <div>
                <h3 className="text-[12px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">{t('system.networkAccess')}</h3>
                <p className="text-[10px] text-[#8898aa]">{t('system.networkAccessDesc')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded-md bg-[#f5f8fb] dark:bg-[#0d1825] border border-[#e3e9f0] dark:border-[#1e2d40]">
                <span className="text-[12px] font-mono text-[#2a3545] dark:text-[#e1e8f0]">{networkInfo.url}</span>
              </div>
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors whitespace-nowrap"
              >
                {copied ? <><FaCheck size={9} /> {t('system.networkCopied')}</> : <><FaCopy size={9} /> {t('system.networkCopyLink')}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── System Log Viewer ── */}
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
            {/* Auto-refresh toggle */}
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
            {/* Manual refresh */}
            <button
              onClick={fetchLogs}
              className="p-1.5 rounded-md text-[#8898aa] hover:text-[#2a3545] dark:hover:text-[#e1e8f0] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t('system.logRefresh')}
            >
              <FaSync size={9} className={logLoading ? 'animate-spin' : ''} />
            </button>
            {/* Download */}
            <button
              onClick={handleDownloadLogs}
              disabled={logLines.length === 0}
              className="p-1.5 rounded-md text-[#8898aa] hover:text-[#2a3545] dark:hover:text-[#e1e8f0] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30"
              title={t('system.logDownload')}
            >
              <FaDownload size={9} />
            </button>
            {/* Clear display */}
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
          {/* Level filter */}
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
          {/* Search */}
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
          {/* Line count */}
          {logMeta && (
            <span className="text-[9px] text-[#8898aa] whitespace-nowrap">
              {logLines.length} / {logMeta.filtered} {t('system.logLines')}
            </span>
          )}
        </div>

        {/* Terminal body */}
        <div className="bg-[#0a0e17] rounded-b-lg overflow-hidden">
          <div className="h-[320px] overflow-y-auto p-3 font-mono text-[10px] leading-[18px] scrollbar-thin scrollbar-thumb-[#2a3347] scrollbar-track-transparent">
            {logLines.length === 0 ? (
              <div className="flex items-center justify-center h-full text-[#4a5568]">
                <div className="text-center">
                  <FaTerminal size={20} className="mx-auto mb-2 opacity-30" />
                  <p className="text-[11px]">{t('system.logEmpty')}</p>
                  <p className="text-[9px] mt-1 opacity-60">{t('system.logEmptyHint')}</p>
                </div>
              </div>
            ) : (
              logLines.map((line, i) => (
                <div key={i} className={`hover:bg-white/[0.03] px-1 rounded ${getLogLineColor(line)}`}>
                  <span className="text-[#4a5568] select-none me-2">{String(i + 1).padStart(3, ' ')}</span>
                  {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>

      {/* ── Browser-Side Emulator ── */}
      <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40]">
        <div className="px-4 py-2.5 border-b border-[#e3e9f0] dark:border-[#1e2d40]">
          <div className="flex items-center gap-2">
            <FaPlug className="text-[#8898aa]" size={11} />
            <h3 className="text-[11px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">{t('system.browserEmulator')}</h3>
            <span className="text-[9px] text-[#8898aa]">{t('system.browserEmulatorDesc')}</span>
          </div>
        </div>
        <DemoModeSettings />
      </div>
    </div>
  );
}
