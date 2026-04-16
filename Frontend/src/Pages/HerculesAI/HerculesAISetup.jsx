import { useState, useEffect, useCallback, useContext } from 'react';
import { Sparkles, Check, Eye, EyeOff, Loader2, RefreshCw, ArrowRight, ArrowLeft, Zap, Server, Cloud, ChevronRight } from 'lucide-react';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import { herculesAIApi } from '../../API/herculesAIApi';
import { toast } from 'react-toastify';
import { useLanguage } from '../../Hooks/useLanguage';
import { motion, AnimatePresence } from 'framer-motion';

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
  };
}

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku', desc: 'Fast & light', cost: '$7/yr', icon: '⚡' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet', desc: 'Balanced', cost: '$22/yr', icon: '✦' },
  { id: 'claude-opus-4-6', label: 'Opus', desc: 'Most capable', cost: '$109/yr', icon: '◆' },
];

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

/* ── Count-up animation hook ─────────────────────────────────────────────── */
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

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function HerculesAISetup() {
  const th = useTheme();
  const { t } = useLanguage();

  /* ── State ── */
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({});
  const [status, setStatus] = useState(null);

  // Wizard step (0 = connect, 1 = scan, 2 = done)
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  // Step 0: provider
  const [provider, setProvider] = useState('cloud');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [localUrl, setLocalUrl] = useState('http://localhost:1234/v1');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  // Step 1: scan
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  // Step 2: done / preview
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewText, setPreviewText] = useState('');
  const [completing, setCompleting] = useState(false);

  // Post-setup edit mode
  const [editingProvider, setEditingProvider] = useState(false);

  /* ── Initial load ── */
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
        // If already complete, show post-setup view
        if (cfg.setup_completed) setStep(3);
        // If provider configured but not complete, go to scan step
        else if (cfg.llm_api_key_set || cfg.local_server_url) setStep(0);
      } catch (e) {
        toast.error('Failed to load AI configuration');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ── Helpers ── */
  const goTo = useCallback((s) => {
    setDirection(s > step ? 1 : -1);
    setStep(s);
  }, [step]);

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
    } finally {
      setSaving(false);
    }
  }, [provider, apiKey, model, localUrl]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await saveProvider();
      const res = await herculesAIApi.testConnection();
      setTestResult(res.data || res);
    } catch (e) {
      setTestResult({ ok: false, message: e.response?.data?.message || e.response?.data?.error || e.message || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  }, [saveProvider]);

  const startScan = useCallback(async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await herculesAIApi.scan();
      const stRes = await herculesAIApi.getStatus();
      setStatus(stRes.data || stRes);
      setScanResult(res.data || res);
    } catch (e) {
      toast.error('Scan failed: ' + (e.response?.data?.message || e.response?.data?.error || e.message));
    } finally {
      setScanning(false);
    }
  }, []);

  const completeSetup = useCallback(async () => {
    setCompleting(true);
    try {
      const res = await herculesAIApi.updateConfig({ setup_completed: true });
      setConfig(res.data || res);
      toast.success('Hercules AI is ready!');
      goTo(3);
    } catch (e) {
      toast.error('Failed to complete setup');
    } finally {
      setCompleting(false);
    }
  }, [goTo]);

  const generatePreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewText('');
    try {
      const res = await herculesAIApi.previewSummary();
      const data = res.data || res;
      setPreviewText(data.summary || 'No summary generated.');
    } catch (e) {
      setPreviewText('Preview failed: ' + (e.response?.data?.message || e.response?.data?.error || e.message));
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // Auto-scan when entering step 1
  useEffect(() => {
    if (step === 1 && !scanning && !scanResult) startScan();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const animatedCount = useCountUp(status?.total || 0);
  const lineCount = status?.lines?.length || 0;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: th.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} style={{ color: th.accent, animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  /* ═══ Post-setup summary view ═══ */
  if (step === 3) {
    return (
      <div style={{ minHeight: '100vh', background: th.pageBg, padding: '40px 20px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: th.accentLight, marginBottom: 12 }}>
              <Sparkles size={28} style={{ color: th.accent }} />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: th.text, margin: '0 0 4px' }}>Hercules AI</h1>
            <p style={{ fontSize: 14, color: th.success, fontWeight: 600 }}>✓ Setup Complete</p>
          </div>

          {/* Stats card */}
          <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: th.textSecondary }}>Provider</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: th.text }}>{provider === 'cloud' ? `Cloud — ${MODELS.find(m => m.id === model)?.label || model}` : 'Local LLM'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: th.textSecondary }}>Tags Tracked</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: th.text }}>{status?.total || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: th.textSecondary }}>Production Lines</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: th.text }}>{lineCount}</span>
            </div>
            {status?.lines?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${th.border}` }}>
                {status.lines.map((l, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: th.accentLight, color: th.accent }}>{l.name} ({l.count})</span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={generatePreview} disabled={previewLoading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', borderRadius: 10, background: th.accent, color: th.btnText, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', opacity: previewLoading ? 0.7 : 1 }}>
              {previewLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={16} />}
              Preview AI Summary
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setScanResult(null); goTo(1); }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: th.surfaceAlt, color: th.textSecondary, fontSize: 13, fontWeight: 600, border: `1px solid ${th.border}`, cursor: 'pointer' }}>
                <RefreshCw size={14} /> Re-scan
              </button>
              <button onClick={() => setEditingProvider(!editingProvider)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: th.surfaceAlt, color: th.textSecondary, fontSize: 13, fontWeight: 600, border: `1px solid ${th.border}`, cursor: 'pointer' }}>
                <Zap size={14} /> Edit Provider
              </button>
            </div>
          </div>

          {/* Inline provider editor */}
          {editingProvider && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              style={{ marginTop: 16, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, padding: '20px 24px' }}>
              <ProviderForm th={th} provider={provider} setProvider={setProvider} apiKey={apiKey} setApiKey={setApiKey}
                showKey={showKey} setShowKey={setShowKey} model={model} setModel={setModel} localUrl={localUrl} setLocalUrl={setLocalUrl}
                testing={testing} testConnection={testConnection} testResult={testResult} config={config} saving={saving} />
            </motion.div>
          )}

          {/* Preview result */}
          {previewText && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: 16, background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, padding: '20px 24px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>AI Summary Preview</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: th.text, whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: previewText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^• /gm, '<span style="color:#0369a1">●</span> ') }} />
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  /* ═══ Wizard view ═══ */
  return (
    <div style={{ minHeight: '100vh', background: th.pageBg, padding: '40px 20px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {/* Logo + title */}
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
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, transition: 'all 0.3s',
                background: step >= i ? th.accent : th.surfaceAlt,
                color: step >= i ? th.btnText : th.textMuted,
                border: `2px solid ${step >= i ? th.accent : th.border}`,
              }}>
                {step > i ? <Check size={14} /> : i + 1}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: step === i ? th.text : th.textMuted }}>{label}</span>
              {i < 2 && <ChevronRight size={14} style={{ color: th.textMuted }} />}
            </div>
          ))}
        </div>

        {/* Step content with animation */}
        <AnimatePresence mode="wait" custom={direction}>
          {step === 0 && (
            <motion.div key="step0" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
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
            <motion.div key="step1" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
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
                    <p style={{ fontSize: 14, color: th.textSecondary, marginBottom: 16 }}>
                      tags found across <strong>{lineCount}</strong> production line{lineCount !== 1 ? 's' : ''}
                    </p>
                    {status?.lines?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
                        {status.lines.map((l, i) => (
                          <span key={i} style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: th.accentLight, color: th.accent }}>{l.name} ({l.count})</span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p style={{ color: th.textMuted }}>Ready to scan</p>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <button onClick={() => goTo(0)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: th.surfaceAlt, color: th.textSecondary, fontSize: 14, fontWeight: 600, border: `1px solid ${th.border}`, cursor: 'pointer' }}>
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
            <motion.div key="step2" custom={direction} variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
              <div style={{ background: th.surface, border: `1px solid ${th.border}`, borderRadius: 12, padding: '40px 28px', textAlign: 'center' }}>
                <motion.div animate={{ boxShadow: [`0 0 0 0 ${th.accentGlow}`, `0 0 0 16px transparent`] }} transition={{ repeat: Infinity, duration: 2 }}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: '50%', background: th.accentLight, marginBottom: 16 }}>
                  <Sparkles size={32} style={{ color: th.accent }} />
                </motion.div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: th.text, margin: '0 0 8px' }}>Hercules AI is Ready</h2>
                <p style={{ fontSize: 13, color: th.textMuted, marginBottom: 24 }}>
                  {status?.total || 0} tags across {lineCount} line{lineCount !== 1 ? 's' : ''} will be analyzed in your reports
                </p>

                <button onClick={generatePreview} disabled={previewLoading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: th.surfaceAlt, color: th.accent, fontSize: 13, fontWeight: 600, border: `1px solid ${th.border}`, cursor: 'pointer', marginBottom: 12 }}>
                  {previewLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
                  Preview AI Summary
                </button>

                {previewText && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ textAlign: 'left', margin: '16px 0', padding: '16px 20px', borderRadius: 10, background: th.surfaceAlt, border: `1px solid ${th.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: th.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>AI Summary Preview</div>
                    <div style={{ fontSize: 13, lineHeight: 1.6, color: th.text, whiteSpace: 'pre-wrap' }}
                      dangerouslySetInnerHTML={{ __html: previewText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^• /gm, '<span style="color:#0369a1">●</span> ') }} />
                  </motion.div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <button onClick={() => goTo(1)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, background: th.surfaceAlt, color: th.textSecondary, fontSize: 14, fontWeight: 600, border: `1px solid ${th.border}`, cursor: 'pointer' }}>
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


/* ═══════════════════════════════════════════════════════════════════════════
   PROVIDER FORM (shared between wizard step 0 and post-setup edit)
   ═══════════════════════════════════════════════════════════════════════════ */
function ProviderForm({ th, provider, setProvider, apiKey, setApiKey, showKey, setShowKey, model, setModel, localUrl, setLocalUrl, testing, testConnection, testResult, config, saving }) {
  return (
    <div>
      {/* Provider toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { id: 'cloud', label: 'Cloud', icon: <Cloud size={16} />, desc: 'Claude API' },
          { id: 'local', label: 'Local', icon: <Server size={16} />, desc: 'LM Studio' },
        ].map((p) => (
          <button key={p.id} onClick={() => setProvider(p.id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
              background: provider === p.id ? th.accentLight : th.surfaceAlt,
              border: `2px solid ${provider === p.id ? th.accent : th.border}`,
              color: provider === p.id ? th.accent : th.textSecondary,
            }}>
            {p.icon}
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{p.label}</div>
              <div style={{ fontSize: 11, color: th.textMuted }}>{p.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {provider === 'cloud' ? (
        <>
          {/* API Key */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: th.textSecondary, marginBottom: 6 }}>API Key</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={config.llm_api_key_set ? `••••••${config.llm_api_key_hint || ''}` : 'sk-ant-...'}
                style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 8, border: `1px solid ${th.inputBorder}`, background: th.inputBg, color: th.text, fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }}
              />
              <button onClick={() => setShowKey(!showKey)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: th.textMuted, padding: 4 }}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Model selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: th.textSecondary, marginBottom: 6 }}>Model</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {MODELS.map((m) => (
                <button key={m.id} onClick={() => setModel(m.id)}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                    background: model === m.id ? th.accentLight : th.surfaceAlt,
                    border: `2px solid ${model === m.id ? th.accent : th.border}`,
                    color: model === m.id ? th.accent : th.textSecondary,
                  }}>
                  <div style={{ fontSize: 16, marginBottom: 2 }}>{m.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: th.textMuted }}>{m.cost}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: th.textSecondary, marginBottom: 6 }}>Server URL</label>
          <input
            type="text"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            placeholder="http://localhost:1234/v1"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${th.inputBorder}`, background: th.inputBg, color: th.text, fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box' }}
          />
        </div>
      )}

      {/* Test connection */}
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
