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
      {/* ── Network Access ── */}
      {networkInfo && networkInfo.ip !== '127.0.0.1' && (
        <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40]">
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-7 h-7 rounded-md flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                <FaGlobe className="text-blue-600 dark:text-blue-400" size={12} />
              </div>
              <div>
                <h3 className="text-[12px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">Network Access</h3>
                <p className="text-[10px] text-[#8898aa]">Share this link with anyone on the same network to access Hercules</p>
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
                {copied ? <><FaCheck size={9} /> Copied!</> : <><FaCopy size={9} /> Copy Link</>}
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
