import { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { Sparkles, Check, Eye, EyeOff, Loader2, RefreshCw, ArrowRight, ArrowLeft, Zap, Server, Cloud, ChevronRight, ChevronDown, ChevronUp, Settings, Filter } from 'lucide-react';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import { herculesAIApi } from '../../API/herculesAIApi';
import { reportBuilderApi } from '../../API/reportBuilderApi';
import { toast } from 'react-toastify';
import { useLanguage } from '../../Hooks/useLanguage';
import { motion, AnimatePresence } from 'framer-motion';
import TimePeriodTabs from '../Reports/TimePeriodTabs';
import useTimePeriod from '../../Hooks/useTimePeriod';

/* ── Theme ────────────────────────────────────────────────────────────────── */
function useTheme() {
  const { mode } = useContext(DarkModeContext);
  const dark = mode === 'dark';
  return {
    dark,
    pageBg: dark ? '#0a0f1a' : '#f1f5f9',
    surface: dark ? '#111827' : '#ffffff',
    surfaceAlt: dark ? '#0d1422' : '#f8fafc',
    border: dark ? '#1e293b' : '#e2e8f0',
    text: dark ? '#f0f4f8' : '#0f172a',
    textSecondary: dark ? '#8899ab' : '#475569',
    textMuted: dark ? '#556677' : '#94a3b8',
    accent: dark ? '#38bdf8' : '#0369a1',
    accentLight: dark ? 'rgba(56,189,248,0.12)' : 'rgba(3,105,161,0.08)',
    accentGlow: dark ? 'rgba(56,189,248,0.25)' : 'rgba(3,105,161,0.15)',
    inputBg: dark ? '#0d1422' : '#f8fafc',
    inputBorder: dark ? '#1e293b' : '#cbd5e1',
    btnText: '#ffffff',
    success: dark ? '#34d399' : '#059669',
    successBg: dark ? 'rgba(52,211,153,0.12)' : 'rgba(5,150,105,0.08)',
    danger: dark ? '#f87171' : '#dc2626',
    dangerBg: dark ? 'rgba(248,113,113,0.12)' : 'rgba(220,38,38,0.06)',
    warningColor: dark ? '#fbbf24' : '#d97706',
    warningBg: dark ? 'rgba(251,191,36,0.12)' : 'rgba(217,119,6,0.06)',
  };
}

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku', desc: 'Fast & light', cost: '$7/yr', icon: '⚡' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet', desc: 'Balanced', cost: '$22/yr', icon: '✦' },
  { id: 'claude-opus-4-6', label: 'Opus', desc: 'Most capable', cost: '$109/yr', icon: '◆' },
];

const INSIGHTS_TABS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this-week', label: 'This Week' },
  { id: 'last-week', label: 'Last Week' },
  { id: 'this-month', label: 'This Month' },
  { id: 'shift', label: 'Shift' },
  { id: 'custom', label: 'Custom' },
];

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

function useCountUp(target, duration = 800) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    let start = 0;
    const step = Math.max(1, Math.ceil(target / (duration / 16)));
    const id = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(id); }
      else setVal(start);
    }, 16);
    return () => clearInterval(id);
  }, [target, duration]);
  return val;
}

/* ── Render AI markdown → styled React nodes ─────────────────────────────── */
function InsightCard({ text, th, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (!text) return null;

  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return null;

  // Parse verdict line
  const first = lines[0];
  const vm = first.match(/\*\*(.+?)\*\*\s*[—–-]\s*(.+)/);
  let title = '', verdict = '', dotColor = '#059669';
  if (vm) {
    title = vm[1]; verdict = vm[2];
    const vl = verdict.toLowerCase();
    if (/stopped|no data|offline|down/.test(vl)) dotColor = '#dc2626';
    else if (/reduced|low|partial|warning/.test(vl)) dotColor = '#d97706';
  }

  const bullets = lines.slice(vm ? 1 : 0);
  const ICONS = { production: '📦', energy: '⚡', status: '⚙', alerts: '⚠', flow: '💧' };

  const renderBullet = (line, i) => {
    const bm = line.match(/[•\-]\s*\*\*(.+?)\*\*:?\s*(.*)/);
    if (!bm) return <div key={i} style={{ fontSize: 13, color: th.text, marginBottom: 2 }}>{line.replace(/\*\*/g, '')}</div>;
    const label = bm[1];
    const content = bm[2];
    const key = label.toLowerCase().split(/\s/)[0];
    const icon = ICONS[key] || '•';
    const isNone = key === 'alerts' && /^none\.?$/i.test(content.trim());

    return (
      <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 10px', borderRadius: 8, marginBottom: 4, background: isNone ? th.successBg : th.surfaceAlt }}>
        <span style={{ fontSize: 14, flexShrink: 0, lineHeight: '20px' }}>{isNone ? '✓' : icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: isNone ? th.success : th.accent, marginBottom: 1 }}>{label}</div>
          <div style={{ fontSize: 13, color: th.text, lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
        </div>
      </div>
    );
  };

  // For overview card — always expanded, no toggle
  if (defaultExpanded) {
    return (
      <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 12 }}>
        {vm && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: th.text }}>{title}</span>
            <span style={{ fontSize: 13, color: th.textSecondary }}>— {verdict}</span>
          </div>
        )}
        {bullets.map(renderBullet)}
      </div>
    );
  }

  // Per-report card — collapsible
  return (
    <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setExpanded(!expanded)} style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: th.text }}>{title || 'Report'}</span>
        <span style={{ fontSize: 12, color: th.textMuted }}>{verdict}</span>
        {expanded ? <ChevronUp size={14} style={{ color: th.textMuted }} /> : <ChevronDown size={14} style={{ color: th.textMuted }} />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            style={{ padding: '0 16px 12px', overflow: 'hidden' }}>
            {bullets.map(renderBullet)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function HerculesAISetup() {
  const th = useTheme();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({});
  const [status, setStatus] = useState(null);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  // Step 0
  const [provider, setProvider] = useState('cloud');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [localUrl, setLocalUrl] = useState('http://localhost:1234/v1');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  // Step 2
  const [completing, setCompleting] = useState(false);

  // Post-setup: Insights
  const [editingProvider, setEditingProvider] = useState(false);
  const [shiftsConfig, setShiftsConfig] = useState(null);
  const { state: timePeriod, dateRange, actions: tpActions } = useTimePeriod('yesterday', shiftsConfig);
  const [reports, setReports] = useState([]);
  const [selectedReportIds, setSelectedReportIds] = useState(null); // null = all
  const [showFilter, setShowFilter] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [insightsResult, setInsightsResult] = useState(null);
  const [insightsError, setInsightsError] = useState('');
  const [charts, setCharts] = useState(null);
  const [loadingCharts, setLoadingCharts] = useState(false);
  const [chartError, setChartError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [cfgRes, stRes] = await Promise.all([herculesAIApi.getConfig(), herculesAIApi.getStatus()]);
        const cfg = cfgRes.data || cfgRes;
        const st = stRes.data || stRes;
        setConfig(cfg);
        setStatus(st);
        setProvider(cfg.ai_provider || 'cloud');
        setModel(cfg.llm_model || 'claude-sonnet-4-6');
        if (cfg.local_server_url) setLocalUrl(cfg.local_server_url);
        if (cfg.setup_completed) setStep(3);
      } catch (e) {
        toast.error('Failed to load AI configuration');
      } finally {
        setLoading(false);
      }
    })();
    // Load reports for filter + shifts for time tabs
    reportBuilderApi.list().then(res => {
      const list = res.data?.data || res.data || [];
      setReports(list.map(r => ({ id: r.id, name: r.name })));
    }).catch(() => {});
    import('../../API/axios').then(({ default: ax }) => {
      ax.get('/api/shifts').then(r => setShiftsConfig(r.data)).catch(() => {});
    });
  }, []);

  const goTo = useCallback((s) => { setDirection(s > step ? 1 : -1); setStep(s); }, [step]);

  const saveProvider = useCallback(async () => {
    setSaving(true);
    try {
      const payload = { ai_provider: provider, llm_model: model };
      if (provider === 'cloud' && apiKey) payload.llm_api_key = apiKey;
      if (provider === 'local') payload.local_server_url = localUrl;
      const res = await herculesAIApi.updateConfig(payload);
      setConfig(res.data || res);
      toast.success('Provider saved');
    } catch (e) {
      toast.error('Failed to save: ' + (e.response?.data?.message || e.response?.data?.error || e.message));
    } finally { setSaving(false); }
  }, [provider, apiKey, model, localUrl]);

  const testConnection = useCallback(async () => {
    setTesting(true); setTestResult(null);
    try { await saveProvider(); const res = await herculesAIApi.testConnection(); setTestResult(res.data || res); }
    catch (e) { setTestResult({ ok: false, message: e.response?.data?.message || e.response?.data?.error || e.message || 'Connection failed' }); }
    finally { setTesting(false); }
  }, [saveProvider]);

  const startScan = useCallback(async () => {
    setScanning(true); setScanResult(null);
    try { const res = await herculesAIApi.scan(); const stRes = await herculesAIApi.getStatus(); setStatus(stRes.data || stRes); setScanResult(res.data || res); }
    catch (e) { toast.error('Scan failed: ' + (e.response?.data?.message || e.response?.data?.error || e.message)); }
    finally { setScanning(false); }
  }, []);

  const completeSetup = useCallback(async () => {
    setCompleting(true);
    try { const res = await herculesAIApi.updateConfig({ setup_completed: true }); setConfig(res.data || res); toast.success('Hercules AI is ready!'); goTo(3); }
    catch (e) { toast.error('Failed to complete setup'); }
    finally { setCompleting(false); }
  }, [goTo]);

  useEffect(() => { if (step === 1 && !scanning && !scanResult) startScan(); }, [step]); // eslint-disable-line

  const runInsights = useCallback(async () => {
    if (!dateRange) { toast.error('Select a time range first'); return; }
    setAnalyzing(true); setInsightsResult(null); setInsightsError(''); setCharts(null); setChartError(null);
    try {
      const res = await herculesAIApi.insights({
        report_ids: selectedReportIds,
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      });
      const data = res.data || res;
      if (data.error) { setInsightsError(data.error); }
      else { setInsightsResult(data); }
    } catch (e) {
      setInsightsError(e.response?.data?.error || e.response?.data?.message || e.message || 'Analysis failed');
    } finally { setAnalyzing(false); }
  }, [dateRange, selectedReportIds]);

  const loadCharts = useCallback(async () => {
    if (!dateRange) return;
    setLoadingCharts(true);
    setChartError(null);
    try {
      const res = await herculesAIApi.previewCharts({
        report_ids: selectedReportIds,
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      });
      setCharts(res.data?.charts || []);
    } catch (err) {
      setChartError(err.response?.data?.error || 'Chart generation failed');
    } finally {
      setLoadingCharts(false);
    }
  }, [selectedReportIds, dateRange]);

  const animatedCount = useCountUp(status?.total || 0);
  const lineCount = status?.lines?.length || 0;
  const modelLabel = MODELS.find(m => m.id === model)?.label || model;

  const toggleReport = (id) => {
    const all = reports.map(r => r.id);
    const current = selectedReportIds || all;
    if (current.includes(id)) {
      const next = current.filter(x => x !== id);
      setSelectedReportIds(next.length === all.length ? null : next);
    } else {
      const next = [...current, id];
      setSelectedReportIds(next.length >= all.length ? null : next);
    }
  };
  const activeIds = selectedReportIds || reports.map(r => r.id);

  if (loading) return (
    <div style={{ minHeight: '100vh', background: th.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={32} style={{ color: th.accent, animation: 'spin 1s linear infinite' }} />
    </div>
  );

  /* ═══ POST-SETUP: INSIGHTS HUB ═══ */
  if (step === 3) return (
    <div style={{ minHeight: '100vh', background: th.pageBg }}>
      {/* ── Compact header ── */}
      <div style={{ background: th.surface, borderBottom: `1px solid ${th.border}`, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Sparkles size={20} style={{ color: th.accent }} />
        <span style={{ fontSize: 16, fontWeight: 700, color: th.text }}>Hercules AI</span>
        <span style={{ fontSize: 12, color: th.success, fontWeight: 600, background: th.successBg, padding: '2px 10px', borderRadius: 99 }}>✓ Active</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: th.textMuted }}>{provider === 'cloud' ? `Cloud — ${modelLabel}` : 'Local'} · {status?.total || 0} tags · {lineCount} lines</span>
        <button onClick={() => setEditingProvider(!editingProvider)} style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${th.border}`, background: 'none', cursor: 'pointer', color: th.textMuted, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600 }}>
          <Settings size={12} /> Settings
        </button>
      </div>

      {/* ── Settings panel (collapsible) ── */}
      <AnimatePresence>
        {editingProvider && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 24px' }}>
              <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, padding: '20px 24px' }}>
                <ProviderForm th={th} provider={provider} setProvider={setProvider} apiKey={apiKey} setApiKey={setApiKey}
                  showKey={showKey} setShowKey={setShowKey} model={model} setModel={setModel} localUrl={localUrl} setLocalUrl={setLocalUrl}
                  testing={testing} testConnection={testConnection} testResult={testResult} config={config} saving={saving} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => { setScanResult(null); goTo(1); }} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${th.border}`, background: th.surfaceAlt, color: th.textSecondary, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <RefreshCw size={12} /> Re-scan Tags
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Time period tabs ── */}
      <TimePeriodTabs
        tabs={INSIGHTS_TABS}
        activeTab={timePeriod.tab}
        onTabChange={tpActions.setTab}
        customFrom={timePeriod.customFrom}
        customTo={timePeriod.customTo}
        onCustomFrom={tpActions.setCustomFrom}
        onCustomTo={tpActions.setCustomTo}
        shiftsConfig={shiftsConfig}
        selectedShift={timePeriod.selectedShift}
        onShiftChange={tpActions.setShift}
      />

      {/* ── Analyze bar + Filter ── */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={runInsights} disabled={analyzing || !dateRange}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 10, background: th.accent, color: th.btnText, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: (analyzing || !dateRange) ? 0.5 : 1 }}>
            {analyzing ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={16} />}
            {analyzing ? 'Analyzing...' : 'Analyze Reports'}
          </button>
          <button onClick={() => setShowFilter(!showFilter)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${th.border}`, background: th.surfaceAlt, color: th.textSecondary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Filter size={12} />
            {selectedReportIds ? `${activeIds.length} of ${reports.length}` : `All ${reports.length}`} reports
          </button>
        </div>

        {/* Filter dropdown */}
        <AnimatePresence>
          {showFilter && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              style={{ marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: '12px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {reports.map(r => {
                  const checked = activeIds.includes(r.id);
                  return (
                    <button key={r.id} onClick={() => toggleReport(r.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                        background: checked ? th.accentLight : th.surfaceAlt,
                        border: `1.5px solid ${checked ? th.accent : th.border}`,
                        color: checked ? th.accent : th.textMuted }}>
                      {checked && <Check size={11} />}
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {insightsError && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: th.dangerBg, color: th.danger, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
            {insightsError}
          </div>
        )}

        {/* Results */}
        {insightsResult && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* Period header */}
            {insightsResult.period && (
              <p style={{ fontSize: 11, color: th.textMuted, marginBottom: 8 }}>
                {new Date(insightsResult.period.from).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' — '}
                {new Date(insightsResult.period.to).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {insightsResult.tags_analyzed ? ` • ${insightsResult.tags_analyzed} tags analyzed` : ''}
              </p>
            )}
            {/* Overview card */}
            {insightsResult.overview && <InsightCard text={insightsResult.overview} th={th} defaultExpanded />}

            {/* Per-report cards */}
            {insightsResult.reports?.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: insightsResult.reports.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10, marginTop: 4 }}>
                {insightsResult.reports.map((r, i) => (
                  <InsightCard key={r.id || i} text={`${r.summary}`} th={th} />
                ))}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 11, color: th.textMuted }}>
              <span>{insightsResult.tags_analyzed} tags analyzed</span>
              <span>Generated just now</span>
            </div>

            {/* ── Chart Preview ── */}
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: th.text, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                  <span style={{ color: th.accent }}>Chart Preview</span>
                </h3>
                <button onClick={loadCharts} disabled={loadingCharts || !dateRange}
                  style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: `1px solid ${th.border}`, background: th.surfaceAlt, color: th.textSecondary, fontWeight: 600, cursor: 'pointer', opacity: (loadingCharts || !dateRange) ? 0.5 : 1 }}>
                  {loadingCharts ? 'Generating...' : 'Generate Charts'}
                </button>
              </div>

              {chartError && (
                <div style={{ padding: '8px 14px', borderRadius: 8, background: th.dangerBg, color: th.danger, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
                  {chartError}
                </div>
              )}

              {charts && charts.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
                  {charts.map((chart, i) => (
                    <div key={i} style={{ background: th.surfaceAlt, border: `1px solid ${th.border}`, borderRadius: 12, padding: 12 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: th.textSecondary, marginBottom: 8, marginTop: 0 }}>{chart.title}</p>
                      <img
                        src={`data:image/png;base64,${chart.image_base64}`}
                        alt={chart.title}
                        style={{ width: '100%', borderRadius: 8, border: `1px solid ${th.border}` }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {charts && charts.length === 0 && (
                <p style={{ fontSize: 12, color: th.textMuted }}>No charts to generate — need counter, boolean, or rate tags.</p>
              )}
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {!insightsResult && !insightsError && !analyzing && (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: th.textMuted }}>
            <Sparkles size={32} style={{ color: th.accent, opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontSize: 14, fontWeight: 600 }}>Select a time range and click Analyze</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>AI will analyze your reports and provide actionable insights</p>
          </div>
        )}
      </div>
    </div>
  );

  /* ═══ WIZARD VIEW (steps 0-2) ═══ */
  return (
    <div style={{ minHeight: '100vh', background: th.pageBg, padding: '40px 20px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: th.accentLight, marginBottom: 12 }}>
            <Sparkles size={28} style={{ color: th.accent }} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: th.text, margin: '0 0 4px' }}>Hercules AI Setup</h1>
          <p style={{ fontSize: 14, color: th.textMuted }}>3 quick steps to enable AI-powered report insights</p>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
          {['Connect', 'Scan', 'Done'].map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'all 0.3s',
                background: step >= i ? th.accent : th.surfaceAlt, color: step >= i ? th.btnText : th.textMuted, border: `2px solid ${step >= i ? th.accent : th.border}` }}>
                {step > i ? <Check size={14} /> : i + 1}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: step === i ? th.text : th.textMuted }}>{label}</span>
              {i < 2 && <ChevronRight size={14} style={{ color: th.textMuted }} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait" custom={direction}>
          {step === 0 && (
            <motion.div key="s0" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
              <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, padding: '24px 28px' }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: th.text, margin: '0 0 20px' }}>Connect AI Provider</h2>
                <ProviderForm th={th} provider={provider} setProvider={setProvider} apiKey={apiKey} setApiKey={setApiKey}
                  showKey={showKey} setShowKey={setShowKey} model={model} setModel={setModel} localUrl={localUrl} setLocalUrl={setLocalUrl}
                  testing={testing} testConnection={testConnection} testResult={testResult} config={config} saving={saving} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => goTo(1)} disabled={!testResult?.ok && !config.llm_api_key_set}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 10, background: th.accent, color: th.btnText, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: (!testResult?.ok && !config.llm_api_key_set) ? 0.4 : 1 }}>
                  Next <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="s1" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
              <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, padding: '40px 28px', textAlign: 'center' }}>
                {scanning ? (
                  <>
                    <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
                      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: th.accentLight, marginBottom: 16 }}>
                      <Sparkles size={28} style={{ color: th.accent }} />
                    </motion.div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: th.text, margin: '0 0 8px' }}>Scanning your reports...</h2>
                    <p style={{ fontSize: 13, color: th.textMuted }}>Identifying tags and classifying data types</p>
                  </>
                ) : scanResult ? (
                  <>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: th.successBg, marginBottom: 16 }}>
                      <Check size={28} style={{ color: th.success }} />
                    </div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: th.text, margin: '0 0 4px' }}>Scan Complete</h2>
                    <div style={{ fontSize: 36, fontWeight: 800, color: th.accent, margin: '8px 0' }}>{animatedCount}</div>
                    <p style={{ fontSize: 14, color: th.textSecondary, marginBottom: 16 }}>tags found across <strong>{lineCount}</strong> production line{lineCount !== 1 ? 's' : ''}</p>
                    {status?.lines?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
                        {status.lines.map((l, i) => <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: th.accentLight, color: th.accent }}>{l.name} ({l.count})</span>)}
                      </div>
                    )}
                  </>
                ) : <p style={{ color: th.textMuted }}>Ready to scan</p>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <button onClick={() => goTo(0)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: th.surfaceAlt, color: th.textSecondary, fontSize: 14, fontWeight: 600, border: `1px solid ${th.border}`, cursor: 'pointer' }}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button onClick={() => goTo(2)} disabled={scanning || !scanResult}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', borderRadius: 10, background: th.accent, color: th.btnText, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: (scanning || !scanResult) ? 0.4 : 1 }}>
                  Next <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
              <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, padding: '40px 28px', textAlign: 'center' }}>
                <motion.div animate={{ boxShadow: [`0 0 0 0 ${th.accentGlow}`, `0 0 0 16px transparent`] }} transition={{ repeat: Infinity, duration: 2 }}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: th.accentLight, marginBottom: 16 }}>
                  <Sparkles size={32} style={{ color: th.accent }} />
                </motion.div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: th.text, margin: '0 0 8px' }}>Hercules AI is Ready</h2>
                <p style={{ fontSize: 13, color: th.textMuted, marginBottom: 24 }}>{status?.total || 0} tags across {lineCount} line{lineCount !== 1 ? 's' : ''} will be analyzed</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <button onClick={() => goTo(1)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: th.surfaceAlt, color: th.textSecondary, fontSize: 14, fontWeight: 600, border: `1px solid ${th.border}`, cursor: 'pointer' }}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button onClick={completeSetup} disabled={completing}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 10, background: th.accent, color: th.btnText, fontSize: 14, fontWeight: 700, border: 'none', cursor: 'pointer', opacity: completing ? 0.7 : 1 }}>
                  {completing ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={16} />}
                  Complete Setup
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}


/* ═══ PROVIDER FORM ═══ */
function ProviderForm({ th, provider, setProvider, apiKey, setApiKey, showKey, setShowKey, model, setModel, localUrl, setLocalUrl, testing, testConnection, testResult, config, saving }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[{ id: 'cloud', label: 'Cloud', icon: <Cloud size={16} />, desc: 'Claude API' }, { id: 'local', label: 'Local', icon: <Server size={16} />, desc: 'LM Studio' }].map(p => (
          <button key={p.id} onClick={() => setProvider(p.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
            background: provider === p.id ? th.accentLight : th.surfaceAlt, border: `2px solid ${provider === p.id ? th.accent : th.border}`, color: provider === p.id ? th.accent : th.textSecondary }}>
            {p.icon}
            <div style={{ textAlign: 'left' }}><div style={{ fontSize: 13, fontWeight: 700 }}>{p.label}</div><div style={{ fontSize: 11, color: th.textMuted }}>{p.desc}</div></div>
          </button>
        ))}
      </div>
      {provider === 'cloud' ? (<>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: th.textSecondary, marginBottom: 6 }}>API Key</label>
          <div style={{ position: 'relative' }}>
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder={config.llm_api_key_set ? `••••••${config.llm_api_key_hint || ''}` : 'sk-ant-...'}
              style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 8, border: `1px solid ${th.inputBorder}`, background: th.inputBg, color: th.text, fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }} />
            <button onClick={() => setShowKey(!showKey)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, padding: 4 }}>
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: th.textSecondary, marginBottom: 6 }}>Model</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {MODELS.map(m => (
              <button key={m.id} onClick={() => setModel(m.id)} style={{ flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                background: model === m.id ? th.accentLight : th.surfaceAlt, border: `2px solid ${model === m.id ? th.accent : th.border}`, color: model === m.id ? th.accent : th.textSecondary }}>
                <div style={{ fontSize: 16, marginBottom: 2 }}>{m.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{m.label}</div>
                <div style={{ fontSize: 10, color: th.textMuted }}>{m.cost}</div>
              </button>
            ))}
          </div>
        </div>
      </>) : (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: th.textSecondary, marginBottom: 6 }}>Server URL</label>
          <input type="text" value={localUrl} onChange={e => setLocalUrl(e.target.value)} placeholder="http://localhost:1234/v1"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${th.inputBorder}`, background: th.inputBg, color: th.text, fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }} />
        </div>
      )}
      <button onClick={testConnection} disabled={testing || saving}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px 16px', borderRadius: 8, background: th.surfaceAlt, color: th.accent, fontSize: 13, fontWeight: 600, border: `1px solid ${th.border}`, cursor: 'pointer', opacity: (testing || saving) ? 0.6 : 1 }}>
        {testing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={14} />}
        {testing ? 'Testing...' : 'Test Connection'}
      </button>
      {testResult && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          style={{ marginTop: 10, padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: testResult.ok ? th.successBg : 'rgba(220,38,38,0.08)', color: testResult.ok ? th.success : th.danger }}>
          {testResult.ok ? `✓ Connected — ${testResult.model || 'Ready'}` : `✗ ${testResult.message}`}
        </motion.div>
      )}
    </div>
  );
}
