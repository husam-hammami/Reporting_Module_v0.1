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
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend } from 'chart.js';
import { BriefingView } from './BriefingView';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend);

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

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const ICONS = { production: '📦', energy: '⚡', status: '⚙', alerts: '⚠', flow: '💧' };

function parseVerdict(text) {
  const vl = (text || '').toLowerCase();
  if (/stopped|no data|offline|down|critical|fault|zero|tripped/.test(vl)) return '#dc2626';
  if (/reduced|low|partial|warning|idle|standby|light/.test(vl)) return '#d97706';
  return '#059669';
}

function parseBullets(text) {
  if (!text) return [];
  return text.split('\n').filter(l => l.trim()).map(line => {
    const bm = line.match(/[•\-]\s*\*\*(.+?)\*\*:?\s*(.*)/);
    if (!bm) return { label: '', content: line.replace(/\*\*/g, '').trim(), raw: true };
    return { label: bm[1], content: bm[2] };
  }).filter(b => b.content);
}

function BulletRow({ label, content, th }) {
  const key = label.toLowerCase().split(/\s/)[0];
  const icon = ICONS[key] || '•';
  const isNone = key === 'alerts' && /^none\.?$/i.test(content.trim());
  return (
    <div style={{ display: 'flex', gap: 8, padding: '5px 10px', borderRadius: 8, marginBottom: 3, background: isNone ? th.successBg : th.surfaceAlt }}>
      <span style={{ fontSize: 13, flexShrink: 0, lineHeight: '18px' }}>{isNone ? '✓' : icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        {label && <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: isNone ? th.success : th.accent, marginBottom: 1 }}>{label}</div>}
        <div style={{ fontSize: 12, color: th.text, lineHeight: 1.45 }} dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
      </div>
    </div>
  );
}

/* ── Report insight card — always open, compact ──────────────────────────── */
function InsightCard({ text, th, defaultExpanded = false, name = '' }) {
  if (!text) return null;

  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return null;

  const first = lines[0];
  const vm = first.match(/\*\*(.+?)\*\*\s*[—–-]\s*(.+)/);
  let title = name, verdict = '';
  if (vm) { title = vm[1]; verdict = vm[2]; }
  else { verdict = first.replace(/\*\*/g, '').trim(); }
  const dotColor = parseVerdict(verdict);
  const bullets = parseBullets(lines.slice(vm ? 1 : 0).join('\n'));

  // Overview card — full width
  if (defaultExpanded) {
    return (
      <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, padding: '14px 18px', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: th.text }}>{title || 'Plant Status'}</span>
          {verdict && <span style={{ fontSize: 13, color: th.textSecondary }}>— {verdict}</span>}
        </div>
        {bullets.map((b, i) => <BulletRow key={i} label={b.label} content={b.content} th={th} />)}
      </div>
    );
  }

  // Per-report card — compact, no collapsible
  // Reports with no real bullets get a minimal inline treatment
  if (!bullets.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: th.surface, border: `1px solid ${th.border}`, borderRadius: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: th.text }}>{title}</span>
        {verdict && <span style={{ fontSize: 11, color: th.textMuted }}>— {verdict}</span>}
      </div>
    );
  }

  return (
    <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, position: 'relative', top: 1 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: th.text }}>{title}</span>
        {verdict && <span style={{ fontSize: 11, color: th.textMuted, flex: 1 }}>{verdict}</span>}
      </div>
      {bullets.map((b, i) => <BulletRow key={i} label={b.label} content={b.content} th={th} />)}
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
      // Restore cached insights
      try {
        const cached = localStorage.getItem('hercules_ai_insights');
        if (cached) {
          const parsed = JSON.parse(cached);
          // Only use cache if less than 2 hours old
          if (parsed._timestamp && Date.now() - parsed._timestamp < 2 * 60 * 60 * 1000) {
            setInsightsResult(parsed.insights);
            setCharts(parsed.charts);
          }
        }
      } catch (_) {}
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
      else {
        setInsightsResult(data);
        // Auto-load charts alongside insights
        let chartData = {};
        try {
          const chartRes = await herculesAIApi.chartData({
            report_ids: selectedReportIds,
            from: dateRange.from.toISOString(),
            to: dateRange.to.toISOString(),
          });
          chartData = chartRes.data || {};
          setCharts(chartData);
        } catch (_) { /* charts are optional */ }
        // Cache results
        try {
          localStorage.setItem('hercules_ai_insights', JSON.stringify({
            insights: data,
            charts: chartData,
            _timestamp: Date.now(),
          }));
        } catch (_) {}
      }
    } catch (e) {
      setInsightsError(e.response?.data?.error || e.response?.data?.message || e.message || 'Analysis failed');
    } finally { setAnalyzing(false); }
  }, [dateRange, selectedReportIds]);

  const loadCharts = useCallback(async () => {
    if (!dateRange) return;
    setLoadingCharts(true);
    setChartError(null);
    try {
      const res = await herculesAIApi.chartData({
        report_ids: selectedReportIds,
        from: dateRange.from.toISOString(),
        to: dateRange.to.toISOString(),
      });
      setCharts(res.data || {});
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
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px 24px' }}>
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

        {/* ═══ RESULTS — organized by business question ═══ */}
        {insightsResult && (() => {
          const eff = insightsResult.kpi?.efficiency;
          const withContent = insightsResult.reports?.filter(r => r.summary && parseBullets(r.summary).length > 0) || [];
          const noContent = insightsResult.reports?.filter(r => !r.summary || parseBullets(r.summary).length === 0) || [];
          return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>

            {/* ── 1. "How are we doing?" — KPI Cards Row ── */}
            {insightsResult.kpi && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                {/* Plant Score */}
                <div style={{ flex: 1, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Plant Score</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{
                      fontSize: 28, fontWeight: 800, lineHeight: 1,
                      color: insightsResult.kpi.score >= 75 ? '#059669' : insightsResult.kpi.score >= 50 ? '#d97706' : '#dc2626',
                    }}>{insightsResult.kpi.score}</span>
                    <span style={{ fontSize: 11, color: th.textMuted }}>/100</span>
                  </div>
                  {insightsResult.kpi.breakdown && (
                    <div style={{ marginTop: 6 }}>
                      {Object.values(insightsResult.kpi.breakdown).map((b, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                          <div style={{ width: 28, height: 4, borderRadius: 2, background: th.border, overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ width: `${b.score}%`, height: '100%', borderRadius: 2, background: b.score >= 75 ? '#059669' : b.score >= 50 ? '#d97706' : '#dc2626' }} />
                          </div>
                          <span style={{ fontSize: 9, color: th.textMuted, whiteSpace: 'nowrap' }}>{b.label} {b.score}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Efficiency */}
                <div style={{ flex: 1, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Efficiency</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: th.text, lineHeight: 1 }}>
                    {eff ? eff.current.toFixed(3) : '\u2014'}
                  </div>
                  <div style={{ fontSize: 10, color: th.textMuted, marginTop: 2 }}>ton/kWh</div>
                  {eff?.change_pct != null && (
                    <div style={{ fontSize: 10, fontWeight: 600, marginTop: 2, color: eff.change_pct >= 0 ? '#059669' : '#dc2626' }}>
                      {eff.change_pct >= 0 ? '\u2191' : '\u2193'}{Math.abs(eff.change_pct).toFixed(1)}% vs previous
                    </div>
                  )}
                </div>
                {/* Production */}
                <div style={{ flex: 1, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Production</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: th.text, lineHeight: 1 }}>
                    {eff?.production_tons != null ? eff.production_tons.toFixed(1) : '\u2014'}
                  </div>
                  <div style={{ fontSize: 10, color: th.textMuted, marginTop: 2 }}>tons</div>
                </div>
                {/* Energy */}
                <div style={{ flex: 1, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Energy</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: th.text, lineHeight: 1 }}>
                    {eff?.energy_kwh != null ? (eff.energy_kwh / 1000).toFixed(1) : '\u2014'}
                  </div>
                  <div style={{ fontSize: 10, color: th.textMuted, marginTop: 2 }}>MWh</div>
                </div>
              </div>
            )}

            {/* ── 2-6. New briefing (schema v3) or legacy fallback ── */}
            {insightsResult.schema_version === 3 ? (
              <div style={{ marginTop: 4 }}>
                <BriefingView
                  data={insightsResult}
                  onDrill={(ref) => {
                    // eslint-disable-next-line no-console
                    console.log('[briefing] drill', ref);
                  }}
                />
              </div>
            ) : (
              <LegacyBriefingBody
                insightsResult={insightsResult}
                charts={charts}
                withContent={withContent}
                noContent={noContent}
                th={th}
              />
            )}
          </motion.div>
          );
        })()}

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

/* ═══════════════════════════════════════════════════════════════════════════
   LEGACY BRIEFING BODY — preserved for schema_version !== 3 fallback.
   Renders the pre-Plan-1 layout (overview + equipment donut + charts +
   per-report cards + comparison table + footer). Will be removed once the
   new schema is stable in production.
   ═══════════════════════════════════════════════════════════════════════════ */
function LegacyBriefingBody({ insightsResult, charts, withContent, noContent, th }) {
  return (
    <>
      {/* ── 2. "What happened?" — AI Verdict + Equipment donut ── */}
      <div style={{ display: 'grid', gridTemplateColumns: charts?.equipment ? '1fr 240px' : '1fr', gap: 10, marginBottom: 12 }}>
        {insightsResult.overview && <InsightCard text={insightsResult.overview} th={th} defaultExpanded />}

        {charts?.equipment && (() => {
          const onCount = charts.equipment.states.filter(Boolean).length;
          const offCount = charts.equipment.states.length - onCount;
          return (
            <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: th.textSecondary, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Equipment</p>
              <div style={{ width: 70, height: 70, position: 'relative' }}>
                <Doughnut data={{
                  labels: ['Running', 'Stopped'],
                  datasets: [{ data: [onCount, offCount], backgroundColor: ['#059669', '#dc2626'], borderWidth: 0, cutout: '72%' }],
                }} options={{ plugins: { legend: { display: false }, tooltip: { enabled: true } }, responsive: true, maintainAspectRatio: true }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: th.text }}>{onCount}/{charts.equipment.states.length}</span>
                </div>
              </div>
              <div style={{ width: '100%', marginTop: 6 }}>
                {charts.equipment.labels.map((label, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1px 0', fontSize: 9 }}>
                    <span style={{ color: th.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{label}</span>
                    <span style={{ fontWeight: 700, color: charts.equipment.states[i] ? '#059669' : '#dc2626', fontSize: 8 }}>
                      {charts.equipment.states[i] ? 'ON' : 'OFF'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── 3. "Show me proof" — Production + Flow charts ── */}
      {charts && (charts.production || charts.rates) && (
        <div style={{ display: 'grid', gridTemplateColumns: charts.production && charts.rates ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>
          {charts.production && (
            <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: th.textSecondary, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Production Output</p>
              <Bar data={{
                labels: charts.production.labels,
                datasets: [
                  { label: 'Current', data: charts.production.current, backgroundColor: '#0369a1', borderRadius: 3, barThickness: 14 },
                  ...(charts.production.previous?.some(v => v > 0)
                    ? [{ label: 'Previous', data: charts.production.previous, backgroundColor: '#cbd5e1', borderRadius: 3, barThickness: 14 }]
                    : []),
                ],
              }} options={{
                responsive: true, maintainAspectRatio: true, aspectRatio: 2.0,
                plugins: { legend: { position: 'top', align: 'end', labels: { color: th.textMuted, font: { size: 9 }, boxWidth: 8, padding: 6 } } },
                scales: {
                  x: { ticks: { color: th.textMuted, font: { size: 8 }, maxRotation: 40 }, grid: { display: false } },
                  y: { ticks: { color: th.textMuted, font: { size: 8 }, callback: (v) => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v }, grid: { color: th.border + '30' } },
                },
              }} />
            </div>
          )}
          {charts.rates && (
            <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 10, padding: '10px 14px' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: th.textSecondary, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Flow Rates</p>
              <Bar data={{
                labels: charts.rates.labels,
                datasets: [
                  { label: 'Current', data: charts.rates.current, backgroundColor: '#0891b2', borderRadius: 3, barThickness: 14 },
                  ...(charts.rates.previous?.some(v => v > 0)
                    ? [{ label: 'Previous', data: charts.rates.previous, backgroundColor: '#cbd5e1', borderRadius: 3, barThickness: 14 }]
                    : []),
                ],
              }} options={{
                responsive: true, maintainAspectRatio: true, aspectRatio: 2.0,
                plugins: { legend: { position: 'top', align: 'end', labels: { color: th.textMuted, font: { size: 9 }, boxWidth: 8, padding: 6 } } },
                scales: {
                  x: { ticks: { color: th.textMuted, font: { size: 8 }, maxRotation: 40 }, grid: { display: false } },
                  y: { ticks: { color: th.textMuted, font: { size: 8 } }, grid: { color: th.border + '30' } },
                },
              }} />
            </div>
          )}
        </div>
      )}

      {/* ── 4. "Details?" — Per-report cards (with findings) + compact badges (no findings) ── */}
      {withContent.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 10, marginBottom: noContent.length > 0 ? 8 : 12 }}>
          {withContent.map((r, i) => (
            <InsightCard key={r.id || i} text={r.summary} th={th} name={r.name} />
          ))}
        </div>
      )}
      {noContent.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
          {noContent.map((r, i) => {
            const first = r.summary?.split('\n').find(l => l.trim()) || '';
            const vm = first.match(/\*\*(.+?)\*\*\s*[—–-]\s*(.+)/);
            const verdict = vm ? vm[2] : first.replace(/\*\*/g, '').trim();
            const dotColor = parseVerdict(verdict);
            return (
              <span key={r.id || i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: th.textSecondary, padding: '3px 0' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: th.text }}>{r.name}</span>
                {verdict && <span style={{ color: th.textMuted }}>{verdict}</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* ── 5. "Raw data?" — Comparison table (collapsed by default, max 15 rows) ── */}
      {insightsResult.comparison?.length > 0 && (
        <details style={{ marginTop: 4 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: th.text, padding: '6px 0', userSelect: 'none' }}>
            Detailed Comparison ({insightsResult.comparison.length} tags)
          </summary>
          <div style={{ overflowX: 'auto', marginTop: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${th.border}` }}>
                  <th style={{ textAlign: 'left', padding: '5px 8px', color: th.textSecondary, fontWeight: 600 }}>Tag</th>
                  <th style={{ textAlign: 'left', padding: '5px 8px', color: th.textSecondary, fontWeight: 600 }}>Line</th>
                  <th style={{ textAlign: 'right', padding: '5px 8px', color: th.textSecondary, fontWeight: 600 }}>Current</th>
                  <th style={{ textAlign: 'right', padding: '5px 8px', color: th.textSecondary, fontWeight: 600 }}>Previous</th>
                  <th style={{ textAlign: 'right', padding: '5px 8px', color: th.textSecondary, fontWeight: 600 }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {insightsResult.comparison.slice(0, 15).map((row, i) => {
                  const changeColor = row.change_pct == null ? th.textMuted
                    : row.change_pct > 5 ? '#059669'
                    : row.change_pct < -5 ? '#dc2626'
                    : th.textSecondary;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${th.border}`, background: i % 2 === 0 ? 'transparent' : th.surfaceAlt }}>
                      <td style={{ padding: '4px 8px', color: th.text, fontWeight: 500 }}>
                        {row.label}
                        {row.unit && <span style={{ color: th.textMuted, marginLeft: 4, fontSize: 9 }}>{row.unit}</span>}
                      </td>
                      <td style={{ padding: '4px 8px', color: th.textMuted }}>{row.line}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: th.text, fontFamily: 'monospace' }}>
                        {row.current != null ? row.current.toLocaleString() : '\u2014'}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: th.textMuted, fontFamily: 'monospace' }}>
                        {row.previous != null ? row.previous.toLocaleString() : '\u2014'}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color: changeColor, fontWeight: 600, fontFamily: 'monospace' }}>
                        {row.change_pct != null ? `${row.change_pct > 0 ? '+' : ''}${row.change_pct}%` : '\u2014'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {insightsResult.comparison.length > 15 && (
              <div style={{ fontSize: 10, color: th.textMuted, padding: '4px 8px', fontStyle: 'italic' }}>
                +{insightsResult.comparison.length - 15} more tags
              </div>
            )}
          </div>
        </details>
      )}

      {/* ── 6. Footer — single line ── */}
      <div style={{ marginTop: 10, fontSize: 10, color: th.textMuted, textAlign: 'center' }}>
        {insightsResult.tags_analyzed ? `${insightsResult.tags_analyzed} tags analyzed` : ''}
        {insightsResult.period ? ` \u00b7 ${new Date(insightsResult.period.from).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} \u2014 ${new Date(insightsResult.period.to).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
      </div>
    </>
  );
}
