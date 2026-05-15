/**
 * Settings → AI section.
 *
 * Configures the AI provider (Cloud Claude or Local LM Studio), model, API
 * key, and tag classification used by the email distribution AI summaries.
 *
 * Replaces the old standalone Hercules AI page. Setup wizard chrome and
 * boardroom briefing are deliberately not ported — only the configuration
 * surface lives here.
 */

import { useEffect, useState, useCallback } from 'react';
import { Cloud, Server, Eye, EyeOff, Zap, Check, X, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'react-toastify';
import { herculesAIApi } from '../../../API/herculesAIApi';

const MODELS = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku', desc: 'Fast & light', cost: '~$7 / yr' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet', desc: 'Balanced', cost: '~$22 / yr' },
  { id: 'claude-opus-4-6',           label: 'Opus', desc: 'Most capable', cost: '~$109 / yr' },
];

const TAG_TYPE_LABEL = {
  counter:    'Counter',
  rate:       'Rate',
  boolean:    'Boolean',
  percentage: 'Percentage',
  analog:     'Analog',
  setpoint:   'Setpoint',
  unknown:    'Unknown',
};
const TAG_TYPE_OPTIONS = Object.keys(TAG_TYPE_LABEL);

/**
 * GET /api/hercules-ai/profiles returns profiles grouped by line_name:
 *   { profiles: { 'Line A': [...], 'Line B': [...], 'Other Tags': [...] }, total: N }
 * Flatten into a single array for the table.
 */
function flattenProfiles(payload) {
  const grouped = payload?.profiles;
  if (!grouped) return [];
  if (Array.isArray(grouped)) return grouped;
  return Object.values(grouped).flat();
}

export default function AISettings() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [provider, setProvider] = useState('cloud');
  const [model, setModel]       = useState(MODELS[1].id);
  const [apiKey, setApiKey]     = useState('');
  const [keyHint, setKeyHint]   = useState('');
  const [keyIsSet, setKeyIsSet] = useState(false);
  const [showKey, setShowKey]   = useState(false);
  const [localUrl, setLocalUrl] = useState('http://localhost:1234');

  const [scanning, setScanning] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [savingProfiles, setSavingProfiles] = useState(false);

  /* Initial load */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfgRes, profRes] = await Promise.all([
          herculesAIApi.getConfig(),
          herculesAIApi.getProfiles().catch(() => ({ data: { profiles: [] } })),
        ]);
        if (cancelled) return;
        const cfg = cfgRes.data || cfgRes;
        setProvider(cfg.ai_provider || 'cloud');
        setModel(cfg.llm_model || MODELS[1].id);
        setKeyHint(cfg.llm_api_key_hint || '');
        setKeyIsSet(Boolean(cfg.llm_api_key_set));
        setLocalUrl(cfg.local_server_url || 'http://localhost:1234');
        setProfiles(flattenProfiles(profRes.data || profRes));
      } catch (err) {
        toast.error('Failed to load AI settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* Save provider config */
  const saveConfig = useCallback(async () => {
    setSaving(true);
    try {
      const payload = { ai_provider: provider, llm_model: model };
      if (provider === 'cloud' && apiKey) payload.llm_api_key = apiKey;
      if (provider === 'local') payload.local_server_url = localUrl;
      const res = await herculesAIApi.updateConfig(payload);
      const cfg = res.data || res;
      setKeyHint(cfg.llm_api_key_hint || '');
      setKeyIsSet(Boolean(cfg.llm_api_key_set));
      setApiKey('');
      toast.success('AI settings saved');
    } catch (err) {
      toast.error('Save failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  }, [provider, model, apiKey, localUrl]);

  const testConnection = useCallback(async () => {
    setTesting(true); setTestResult(null);
    try {
      // Persist current form first so the test uses the latest values
      await saveConfig();
      const res = await herculesAIApi.testConnection();
      setTestResult(res.data || res);
    } catch (err) {
      setTestResult({
        ok: false,
        message: err.response?.data?.message || err.response?.data?.error || err.message || 'Connection failed',
      });
    } finally {
      setTesting(false);
    }
  }, [saveConfig]);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      await herculesAIApi.scan();
      const profRes = await herculesAIApi.getProfiles();
      setProfiles(flattenProfiles(profRes.data || profRes));
      toast.success('Tag scan complete');
    } catch (err) {
      toast.error('Scan failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setScanning(false);
    }
  }, []);

  const updateProfileType = (id, newType) => {
    setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, tag_type: newType, source: 'user' } : p)));
  };

  const saveProfiles = useCallback(async () => {
    setSavingProfiles(true);
    try {
      // Backend column is `tag_type`; bulk_update_profiles auto-marks source='user'.
      const payload = profiles.map((p) => ({ id: p.id, tag_type: p.tag_type }));
      await herculesAIApi.bulkUpdate(payload);
      toast.success('Tag classifications saved');
    } catch (err) {
      toast.error('Save failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setSavingProfiles(false);
    }
  }, [profiles]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--text-muted)]">
        <Loader2 size={18} className="animate-spin mr-2" /> Loading AI settings…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-[var(--brand)]" />
        <h2 className="text-[14px] font-bold text-[var(--text-primary)]">AI Provider & Tag Classification</h2>
      </div>
      <p className="text-[12px] text-[var(--text-muted)] -mt-4">
        Used by email distribution rules to generate AI summaries of the report data.
      </p>

      {/* Provider section */}
      <Section title="Provider">
        <div className="grid grid-cols-2 gap-3">
          <ProviderCard
            active={provider === 'cloud'}
            onClick={() => setProvider('cloud')}
            icon={<Cloud size={18} />}
            title="Cloud Claude"
            sub="Anthropic API · best quality, paid"
          />
          <ProviderCard
            active={provider === 'local'}
            onClick={() => setProvider('local')}
            icon={<Server size={18} />}
            title="Local LM Studio"
            sub="Runs on your PC · free, slower"
          />
        </div>
      </Section>

      {provider === 'cloud' && (
        <>
          <Section title="Model">
            <div className="grid grid-cols-3 gap-3">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    model === m.id
                      ? 'border-[var(--brand)] bg-[var(--brand-subtle)] ring-1 ring-[var(--brand)]'
                      : 'border-[var(--border)] hover:border-[var(--text-muted)] bg-[var(--surface)]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[var(--text-primary)]">{m.label}</span>
                    {model === m.id && <Check size={12} className="text-[var(--brand)]" />}
                  </div>
                  <div className="text-[10.5px] text-[var(--text-muted)] mt-1">{m.desc}</div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-1.5 font-mono">{m.cost}</div>
                </button>
              ))}
            </div>
          </Section>

          <Section title="API key">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={keyIsSet ? `Stored ✓ · enter new key to replace ${keyHint ? '(' + keyHint + ')' : ''}` : 'sk-ant-…'}
                  className="w-full px-3 py-2 text-[12px] rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand)]"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <button
                type="button"
                onClick={saveConfig}
                disabled={saving}
                className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--brand)] text-white disabled:opacity-50"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
              </button>
            </div>
            <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5">
              Get an API key at console.anthropic.com. Stored encrypted on this PC.
            </p>
          </Section>
        </>
      )}

      {provider === 'local' && (
        <Section title="Local server URL">
          <div className="flex gap-2">
            <input
              type="text"
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              placeholder="http://localhost:1234"
              className="flex-1 px-3 py-2 text-[12px] rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand)]"
            />
            <button
              type="button"
              onClick={saveConfig}
              disabled={saving}
              className="px-4 py-2 text-[12px] font-semibold rounded-lg bg-[var(--brand)] text-white disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
            </button>
          </div>
          <p className="text-[10.5px] text-[var(--text-muted)] mt-1.5">
            LM Studio's OpenAI-compatible endpoint. Default port is 1234.
          </p>
        </Section>
      )}

      {/* Test connection */}
      <Section title="Connection">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={testConnection}
            disabled={testing}
            className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--brand)] disabled:opacity-50"
          >
            {testing ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            Test connection
          </button>
          {testResult && (
            <span className={`flex items-center gap-1 text-[11.5px] ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {testResult.ok ? <Check size={13} /> : <X size={13} />}
              {testResult.ok ? 'Connected · ready' : (testResult.message || 'Failed')}
            </span>
          )}
        </div>
      </Section>

      {/* Tag classification */}
      <Section
        title="Tag classification"
        right={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={runScan}
              disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-semibold rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:border-[var(--brand)] disabled:opacity-50"
            >
              {scanning ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {scanning ? 'Scanning…' : 'Scan tags'}
            </button>
            {profiles.length > 0 && (
              <button
                type="button"
                onClick={saveProfiles}
                disabled={savingProfiles}
                className="px-3 py-1.5 text-[11.5px] font-semibold rounded-md bg-[var(--brand)] text-white disabled:opacity-50"
              >
                {savingProfiles ? <Loader2 size={12} className="animate-spin" /> : 'Save changes'}
              </button>
            )}
          </div>
        }
      >
        {profiles.length === 0 ? (
          <p className="text-[12px] text-[var(--text-muted)] py-3">
            No tags scanned yet. Click "Scan tags" to classify the tags currently configured in the system.
          </p>
        ) : (
          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="max-h-[400px] overflow-auto">
              <table className="w-full text-[11.5px]">
                <thead className="bg-[var(--surface-sunken)] sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold text-[var(--text-primary)]">Tag</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-primary)]">Label</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-primary)] w-[160px]">Type</th>
                    <th className="px-3 py-2 font-semibold text-[var(--text-primary)] w-[80px]">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => (
                    <tr key={p.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-1.5 font-mono text-[var(--text-primary)]">{p.tag_name || p.name}</td>
                      <td className="px-3 py-1.5 text-[var(--text-muted)]">{p.label || '—'}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={TAG_TYPE_LABEL[p.tag_type] ? p.tag_type : 'unknown'}
                          onChange={(e) => updateProfileType(p.id, e.target.value)}
                          className="w-full px-2 py-1 text-[11.5px] rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--brand)]"
                        >
                          {TAG_TYPE_OPTIONS.map((c) => (
                            <option key={c} value={c}>{TAG_TYPE_LABEL[c]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-muted)]">
                        {p.source === 'user' ? 'You' : 'Auto'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="text-[10.5px] text-[var(--text-muted)] mt-2">
          Classifications stored as "You" are never overwritten by re-scans.
        </p>
      </Section>
    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[12.5px] font-bold text-[var(--text-primary)] uppercase tracking-wide">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function ProviderCard({ active, onClick, icon, title, sub }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
        active
          ? 'border-[var(--brand)] bg-[var(--brand-subtle)] ring-1 ring-[var(--brand)]'
          : 'border-[var(--border)] hover:border-[var(--text-muted)] bg-[var(--surface)]'
      }`}
    >
      <span className={`flex-shrink-0 mt-0.5 ${active ? 'text-[var(--brand)]' : 'text-[var(--text-muted)]'}`}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-[var(--text-primary)]">{title}</span>
          {active && <Check size={13} className="text-[var(--brand)]" />}
        </div>
        <div className="text-[10.5px] text-[var(--text-muted)] mt-0.5">{sub}</div>
      </div>
    </button>
  );
}
