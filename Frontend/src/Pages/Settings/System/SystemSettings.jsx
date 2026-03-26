import React, { useState, useEffect, useRef } from 'react';
import { FaServer, FaPlug, FaNetworkWired, FaSave, FaSync, FaGlobe, FaCopy, FaCheck } from 'react-icons/fa';
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
