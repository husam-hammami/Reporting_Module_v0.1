import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { FaTerminal, FaCircle, FaTrash, FaDownload, FaPause, FaPlay, FaSearch } from 'react-icons/fa';
import useSystemLogs from '../../../Hooks/useSystemLogs';
import { useLanguage } from '../../../Hooks/useLanguage';

const LEVEL_COLORS = {
  CRITICAL: 'text-red-500',
  ERROR:    'text-red-400',
  WARNING:  'text-amber-400',
  INFO:     'text-cyan-400',
  DEBUG:    'text-gray-500',
};

const LEVEL_BG = {
  CRITICAL: 'bg-red-500/10',
  ERROR:    'bg-red-400/10',
  WARNING:  'bg-amber-400/10',
  INFO:     '',
  DEBUG:    '',
};

const LEVELS = ['ALL', 'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'];

const LEVEL_RANK = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3, CRITICAL: 4 };

export default function SystemLogs() {
  const { logs, connected, loading, clearLogs } = useSystemLogs();
  const { t } = useLanguage();

  const [levelFilter, setLevelFilter] = useState('WARNING');
  const [search, setSearch] = useState('');
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const wasAtBottom = useRef(true);

  const filtered = useMemo(() => {
    let list = logs;
    if (levelFilter !== 'ALL') {
      const minRank = LEVEL_RANK[levelFilter] ?? 0;
      list = list.filter((e) => (LEVEL_RANK[e.level] ?? 0) >= minRank);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.message?.toLowerCase().includes(q) ||
          e.module?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [logs, levelFilter, search]);

  const checkBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  useEffect(() => {
    if (!paused && wasAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [filtered, paused]);

  const handleDownload = () => {
    const text = filtered
      .map((e) => `${e.ts}  ${(e.level || '').padEnd(8)} [${e.module}] ${e.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hercules-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const errorCount = useMemo(
    () => logs.filter((e) => e.level === 'ERROR' || e.level === 'CRITICAL').length,
    [logs]
  );
  const warnCount = useMemo(
    () => logs.filter((e) => e.level === 'WARNING').length,
    [logs]
  );

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40]">
        <div className="px-4 py-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 mr-auto">
            <div className="w-7 h-7 rounded-md flex items-center justify-center bg-slate-100 dark:bg-slate-800">
              <FaTerminal className="text-slate-600 dark:text-slate-300" size={12} />
            </div>
            <div>
              <h2 className="text-[12px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">
                {t('logs.title')}
              </h2>
              <p className="text-[10px] text-[#8898aa]">{t('logs.subtitle')}</p>
            </div>
          </div>

          {/* Connection badge */}
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium ${
            connected
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
          }`}>
            <FaCircle size={6} />
            {connected ? t('logs.connected') : t('logs.disconnected')}
          </span>

          {/* Stats */}
          {errorCount > 0 && (
            <span className="text-[10px] font-medium text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-full">
              {errorCount} {t('logs.errors')}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full">
              {warnCount} {t('logs.warnings')}
            </span>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40]">
        <div className="px-4 py-2.5 flex flex-wrap items-center gap-2">
          {/* Level filter */}
          <div className="flex gap-0.5 bg-[#f5f8fb] dark:bg-[#0d1825] rounded-md p-0.5">
            {LEVELS.map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                  levelFilter === lvl
                    ? 'bg-white dark:bg-[#1e2d40] text-[#2a3545] dark:text-[#e1e8f0] shadow-sm'
                    : 'text-[#8898aa] hover:text-[#2a3545] dark:hover:text-[#e1e8f0]'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8898aa]" size={10} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('logs.searchPlaceholder')}
              className="w-full pl-7 pr-2.5 py-1.5 text-[11px] rounded-md border border-[#e3e9f0] dark:border-[#1e2d40] bg-[#f5f8fb] dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:outline-none focus:border-[var(--brand)]"
            />
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={() => setPaused((p) => !p)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium rounded-md border border-[#e3e9f0] dark:border-[#1e2d40] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] transition-colors"
              title={paused ? t('logs.resume') : t('logs.pause')}
            >
              {paused ? <FaPlay size={9} /> : <FaPause size={9} />}
              {paused ? t('logs.resume') : t('logs.pause')}
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium rounded-md border border-[#e3e9f0] dark:border-[#1e2d40] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] transition-colors"
              title={t('logs.download')}
            >
              <FaDownload size={9} />
              {t('logs.download')}
            </button>
            <button
              onClick={clearLogs}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-medium rounded-md border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors"
              title={t('logs.clear')}
            >
              <FaTrash size={9} />
              {t('logs.clear')}
            </button>
          </div>
        </div>
      </div>

      {/* Terminal */}
      <div className="bg-[#0d1117] rounded-lg border border-[#1e2d40] overflow-hidden">
        {/* Terminal header */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border-b border-[#1e2d40]">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f85149]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#d29922]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#3fb950]" />
          </div>
          <span className="text-[10px] text-[#8b949e] font-mono ml-2">
            hercules — system logs
          </span>
          <span className="text-[10px] text-[#484f58] font-mono ml-auto">
            {filtered.length} {t('logs.entries')}
          </span>
        </div>

        {/* Log output */}
        <div
          ref={scrollRef}
          onScroll={checkBottom}
          className="h-[calc(100vh-420px)] min-h-[300px] overflow-y-auto p-3 font-mono text-[11px] leading-[1.7] select-text"
        >
          {loading && (
            <div className="text-[#8b949e] text-center py-8">{t('common.loading')}</div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-[#484f58] text-center py-8">{t('logs.empty')}</div>
          )}
          {filtered.map((entry) => (
            <div
              key={entry._id}
              className={`flex gap-2 px-2 py-0.5 rounded ${LEVEL_BG[entry.level] || ''} hover:bg-[#161b22] transition-colors`}
            >
              <span className="text-[#484f58] shrink-0 w-[190px]">
                {entry.ts?.replace('T', ' ').replace('Z', '')}
              </span>
              <span className={`shrink-0 w-[62px] font-semibold ${LEVEL_COLORS[entry.level] || 'text-[#8b949e]'}`}>
                {entry.level}
              </span>
              <span className="text-[#7d8590] shrink-0 max-w-[140px] truncate">
                [{entry.module}]
              </span>
              <span className="text-[#c9d1d9] break-all">
                {entry.message}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
