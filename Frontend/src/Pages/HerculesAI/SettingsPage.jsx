/**
 * Hercules AI — Settings page (Plan 5 §12 + Plan 6 §11)
 *
 * Dedicated route at /hercules-ai/settings. Replaces the inline collapsible
 * panel that previously lived inside HerculesAISetup.jsx step===3.
 *
 * Sections (each saves independently):
 *   1. AI Provider     — cloud Claude / local LM Studio + API key
 *   2. Energy Tariff    — flat OMR/kWh (Plan 2 hourly tariff supersedes when shipped)
 *   3. Production Value — value per ton for flour / bran / pasta
 *   4. Power Settings  — pf_target threshold + capacitor cost per kvar
 *   5. Shift Targets    — per-asset / per-shift production targets
 *   6. Savings Ledger   — default confidence + audit panel toggle
 *   7. CFO Digest       — opt-in weekly digest email
 */

import { useState, useEffect, useContext, useCallback } from 'react';
import { ArrowLeft, Save, Loader2, Eye, EyeOff } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { DarkModeContext } from '../../Context/DarkModeProvider';
import { herculesAIApi } from '../../API/herculesAIApi';
import { toast } from 'react-toastify';

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
    inputBg: dark ? '#0d1422' : '#f8fafc',
    inputBorder: dark ? '#1e293b' : '#cbd5e1',
    btnText: '#ffffff',
    success: dark ? '#34d399' : '#059669',
    danger: dark ? '#f87171' : '#dc2626',
  };
}

const sectionStyle = (th) => ({
  background: th.surface,
  border: `1px solid ${th.border}`,
  borderRadius: 14,
  padding: '20px 24px',
  marginBottom: 16,
});

const labelStyle = (th) => ({
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: th.textSecondary,
  marginBottom: 6,
});

const inputStyle = (th) => ({
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${th.inputBorder}`,
  background: th.inputBg,
  color: th.text,
  fontSize: 13,
  fontFamily: 'inherit',
});

const helpStyle = (th) => ({
  fontSize: 11,
  color: th.textMuted,
  marginTop: 4,
});

const sectionHeaderStyle = (th) => ({
  fontSize: 15,
  fontWeight: 700,
  color: th.text,
  marginBottom: 4,
});

const sectionDescStyle = (th) => ({
  fontSize: 12,
  color: th.textSecondary,
  marginBottom: 16,
});


export default function HerculesAISettingsPage() {
  const th = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(null);     // section key currently saving
  const [showKey, setShowKey] = useState(false);

  // Local form state — initialized from config
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await herculesAIApi.getConfig();
      setConfig(res.data);
      setForm({
        ai_provider: res.data.ai_provider || 'cloud',
        llm_api_key: '',                                       // Always blank-prefilled
        llm_model: res.data.llm_model || 'claude-sonnet-4-6',
        local_server_url: res.data.local_server_url || 'http://localhost:1234/v1',
        electricity_tariff_omr_per_kwh: res.data.electricity_tariff_omr_per_kwh ?? 0.025,
        production_value_per_ton: res.data.production_value_per_ton ?? 0,
        value_per_ton_flour: res.data.value_per_ton_flour ?? '',
        value_per_ton_bran: res.data.value_per_ton_bran ?? '',
        value_per_ton_pasta: res.data.value_per_ton_pasta ?? '',
        pf_target: res.data.pf_target ?? 0.90,
        pf_correction_target: res.data.pf_correction_target ?? 0.95,
        capacitor_cost_omr_per_kvar: res.data.capacitor_cost_omr_per_kvar ?? 12,
        savings_ledger_confidence_default_pct: res.data.savings_ledger_confidence_default_pct ?? 50,
        savings_ledger_show_confidence_breakdown: res.data.savings_ledger_show_confidence_breakdown ?? true,
        cfo_digest_enabled: res.data.cfo_digest_enabled ?? false,
        cfo_digest_recipients: (res.data.cfo_digest_recipients || []).join(', '),
      });
    } catch (e) {
      toast.error('Could not load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  const saveSection = async (sectionKey, payload) => {
    setSaving(sectionKey);
    try {
      // Sanitize numeric fields
      const sanitized = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v === '' || v === null || v === undefined) continue;
        sanitized[k] = v;
      }
      await herculesAIApi.updateConfig(sanitized);
      toast.success('Saved');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: th.pageBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} style={{ color: th.accent, animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: th.pageBg, padding: '24px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => navigate('/hercules-ai')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              background: th.surfaceAlt, color: th.textSecondary,
              border: `1px solid ${th.border}`, cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
            }}
          >
            <ArrowLeft size={14} /> Back
          </button>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: th.text }}>
            Hercules AI Settings
          </h1>
        </div>

        {/* 1. AI Provider */}
        <Section th={th} title="AI provider" desc="Where Hercules sends its analysis prompts.">
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {[
              { id: 'cloud', label: 'Cloud (Claude)', desc: 'Best quality, needs API key + internet' },
              { id: 'local', label: 'Local (LM Studio)', desc: 'Free, on-premises, needs 24 GB RAM' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setForm((f) => ({ ...f, ai_provider: opt.id }))}
                style={{
                  flex: 1, padding: '14px 16px', borderRadius: 10,
                  border: `2px solid ${form.ai_provider === opt.id ? th.accent : th.border}`,
                  background: form.ai_provider === opt.id ? `${th.accent}15` : th.surfaceAlt,
                  color: form.ai_provider === opt.id ? th.text : th.textSecondary,
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{opt.label}</div>
                <div style={{ fontSize: 11, marginTop: 4, color: th.textMuted }}>{opt.desc}</div>
              </button>
            ))}
          </div>

          {form.ai_provider === 'cloud' && (
            <>
              <label style={labelStyle(th)}>API key</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={form.llm_api_key}
                  onChange={set('llm_api_key')}
                  placeholder={config?.llm_api_key_set ? `current: ${config.llm_api_key_hint || '...****'}` : 'sk-ant-...'}
                  style={{ ...inputStyle(th), fontFamily: 'monospace' }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  style={{ padding: '0 10px', borderRadius: 8, border: `1px solid ${th.inputBorder}`, background: th.inputBg, color: th.textSecondary, cursor: 'pointer' }}
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              <label style={{ ...labelStyle(th), marginTop: 12 }}>Model</label>
              <select value={form.llm_model} onChange={set('llm_model')} style={inputStyle(th)}>
                <option value="claude-haiku-4-5-20251001">Haiku — fast &amp; light ($7/yr)</option>
                <option value="claude-sonnet-4-6">Sonnet — balanced ($22/yr)</option>
                <option value="claude-opus-4-6">Opus — most capable ($109/yr)</option>
              </select>
            </>
          )}

          {form.ai_provider === 'local' && (
            <>
              <label style={labelStyle(th)}>LM Studio server URL</label>
              <input value={form.local_server_url} onChange={set('local_server_url')} style={inputStyle(th)} />
              <p style={helpStyle(th)}>Default: http://localhost:1234/v1 — needs LM Studio running with a 32B model loaded.</p>
            </>
          )}

          <SaveBar
            th={th}
            busy={saving === 'provider'}
            onSave={() => {
              const p = { ai_provider: form.ai_provider };
              if (form.llm_api_key) p.llm_api_key = form.llm_api_key;
              if (form.ai_provider === 'cloud') p.llm_model = form.llm_model;
              if (form.ai_provider === 'local') p.local_server_url = form.local_server_url;
              saveSection('provider', p);
            }}
          />
        </Section>

        {/* 2. Energy tariff */}
        <Section th={th} title="Energy tariff" desc="Used to convert kWh to OMR everywhere on the AI page.">
          <label style={labelStyle(th)}>OMR per kWh</label>
          <input
            type="number" step="0.001" min="0"
            value={form.electricity_tariff_omr_per_kwh}
            onChange={set('electricity_tariff_omr_per_kwh')}
            style={{ ...inputStyle(th), maxWidth: 180, fontFamily: 'monospace' }}
          />
          <p style={helpStyle(th)}>
            Default: 0.025 OMR/kWh (Oman industrial flat rate). When the proper hourly tariff (Plan 2) is installed, this value becomes the fallback.
          </p>
          <SaveBar
            th={th}
            busy={saving === 'tariff'}
            onSave={() => saveSection('tariff', {
              electricity_tariff_omr_per_kwh: parseFloat(form.electricity_tariff_omr_per_kwh) || 0.025,
            })}
          />
        </Section>

        {/* 3. Production value */}
        <Section th={th} title="Product value" desc="Wholesale value per ton — drives the savings ledger and yield-drift OMR.">
          <Field th={th} label="Generic value per ton (OMR)" hint="Used when a product-specific value isn't set.">
            <input
              type="number" step="1" min="0"
              value={form.production_value_per_ton}
              onChange={set('production_value_per_ton')}
              style={{ ...inputStyle(th), maxWidth: 180, fontFamily: 'monospace' }}
            />
          </Field>
          <Field th={th} label="Flour (OMR/ton)" hint="Mill B — used for flour yield drift attribution.">
            <input
              type="number" step="1" min="0"
              value={form.value_per_ton_flour}
              onChange={set('value_per_ton_flour')}
              placeholder="leave blank to use generic"
              style={{ ...inputStyle(th), maxWidth: 240, fontFamily: 'monospace' }}
            />
          </Field>
          <Field th={th} label="Bran (OMR/ton)">
            <input
              type="number" step="1" min="0"
              value={form.value_per_ton_bran}
              onChange={set('value_per_ton_bran')}
              placeholder="defaults to 0.4 × flour"
              style={{ ...inputStyle(th), maxWidth: 240, fontFamily: 'monospace' }}
            />
          </Field>
          <Field th={th} label="Pasta (OMR/ton)">
            <input
              type="number" step="1" min="0"
              value={form.value_per_ton_pasta}
              onChange={set('value_per_ton_pasta')}
              placeholder="leave blank to use generic"
              style={{ ...inputStyle(th), maxWidth: 240, fontFamily: 'monospace' }}
            />
          </Field>
          <SaveBar
            th={th}
            busy={saving === 'value'}
            onSave={() => saveSection('value', {
              production_value_per_ton: parseFloat(form.production_value_per_ton) || 0,
              value_per_ton_flour: form.value_per_ton_flour === '' ? null : (parseFloat(form.value_per_ton_flour) || null),
              value_per_ton_bran:  form.value_per_ton_bran  === '' ? null : (parseFloat(form.value_per_ton_bran)  || null),
              value_per_ton_pasta: form.value_per_ton_pasta === '' ? null : (parseFloat(form.value_per_ton_pasta) || null),
            })}
          />
        </Section>

        {/* 4. Power settings */}
        <Section th={th} title="Power settings" desc="Power-factor target and capacitor pricing for the payback calculation.">
          <Field
            th={th}
            label={`Target power factor: ${form.pf_target}`}
            hint="Below this, the utility may add a penalty. Confirm with your APSR contract."
          >
            <input
              type="range" step="0.01" min="0.80" max="0.95"
              value={form.pf_target}
              onChange={(e) => setForm((f) => ({ ...f, pf_target: parseFloat(e.target.value) }))}
              style={{ width: 240 }}
            />
          </Field>
          <Field
            th={th}
            label="Capacitor cost (OMR per kvar installed)"
            hint="Quoted by your electrical contractor. Default 12 OMR/kvar."
          >
            <input
              type="number" step="1" min="0"
              value={form.capacitor_cost_omr_per_kvar}
              onChange={set('capacitor_cost_omr_per_kvar')}
              style={{ ...inputStyle(th), maxWidth: 180, fontFamily: 'monospace' }}
            />
          </Field>
          <SaveBar
            th={th}
            busy={saving === 'power'}
            onSave={() => saveSection('power', {
              pf_target: parseFloat(form.pf_target) || 0.90,
              capacitor_cost_omr_per_kvar: parseFloat(form.capacitor_cost_omr_per_kvar) || 12,
            })}
          />
        </Section>

        {/* 5. Savings ledger */}
        <Section th={th} title="Savings ledger" desc="How conservative Hercules is when crediting savings.">
          <Field
            th={th}
            label={`Default confidence on auto-detected entries: ${form.savings_ledger_confidence_default_pct}%`}
            hint="0 = only credit savings you mark as actioned. 100 = trust auto-detection. Default 50."
          >
            <input
              type="range" step="5" min="0" max="100"
              value={form.savings_ledger_confidence_default_pct}
              onChange={(e) => setForm((f) => ({ ...f, savings_ledger_confidence_default_pct: parseInt(e.target.value, 10) }))}
              style={{ width: 280 }}
            />
          </Field>
          <SaveBar
            th={th}
            busy={saving === 'ledger'}
            onSave={() => saveSection('ledger', {
              savings_ledger_confidence_default_pct: parseInt(form.savings_ledger_confidence_default_pct, 10),
            })}
          />
        </Section>

        {/* 6. CFO digest */}
        <Section th={th} title="CFO weekly digest" desc="Optional weekly email summarising the plant in money terms.">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13, color: th.text, marginBottom: 12 }}>
            <input type="checkbox" checked={!!form.cfo_digest_enabled} onChange={set('cfo_digest_enabled')} />
            Send a weekly CFO digest email
          </label>
          {form.cfo_digest_enabled && (
            <Field th={th} label="Recipients (comma-separated emails)">
              <input
                type="text" value={form.cfo_digest_recipients}
                onChange={set('cfo_digest_recipients')}
                placeholder="owner@example.com, cfo@example.com"
                style={inputStyle(th)}
              />
            </Field>
          )}
          <SaveBar
            th={th}
            busy={saving === 'cfo'}
            onSave={() => saveSection('cfo', {
              cfo_digest_enabled: !!form.cfo_digest_enabled,
              cfo_digest_recipients: form.cfo_digest_recipients
                .split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean),
            })}
          />
        </Section>

        <p style={{ fontSize: 11, color: th.textMuted, textAlign: 'center', marginTop: 24 }}>
          Each section saves independently. Changes take effect within 30 seconds on the AI page.
        </p>
      </div>
    </div>
  );
}

function Section({ th, title, desc, children }) {
  return (
    <section style={sectionStyle(th)}>
      <h2 style={sectionHeaderStyle(th)}>{title}</h2>
      <p style={sectionDescStyle(th)}>{desc}</p>
      {children}
    </section>
  );
}

function Field({ th, label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle(th)}>{label}</label>
      {children}
      {hint && <p style={helpStyle(th)}>{hint}</p>}
    </div>
  );
}

function SaveBar({ th, onSave, busy }) {
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${th.border}`, display: 'flex', justifyContent: 'flex-end' }}>
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 18px', borderRadius: 8,
          background: th.accent, color: th.btnText, border: 'none',
          fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}
