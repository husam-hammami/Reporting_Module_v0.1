/**
 * OnboardingModal — Plan 5 §12 / Plan 6 §11 placement.
 *
 * One-time pre-render walkthrough. Renders only when:
 *   - `localStorage.hercules_ai_onboarding_done` is NOT set
 *   - AND user has at least one tracked tag (i.e. setup is complete)
 *
 * 6 critical settings, plain language. Skip = use defaults; the page
 * shows a small "Confirm defaults?" banner instead until the user
 * either reopens this modal or clicks the banner.
 *
 * Saves directly via /hercules-ai/config and dismisses itself.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { Sparkles, ArrowRight, ArrowLeft, Check, X } from 'lucide-react';
import { herculesAIApi } from '../../../API/herculesAIApi';

const LS_KEY = 'hercules_ai_onboarding_done';

interface OnboardingModalProps {
  /** Whether to consider showing the modal at all (typically `setup_completed`). */
  enabled: boolean;
  onClose?: () => void;
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.55)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  zIndex: 60,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--hai-space-6)',
};

const cardStyle: CSSProperties = {
  background: 'var(--hai-surface-canvas)',
  border: '1px solid var(--hai-glass-border)',
  borderRadius: 20,
  width: 560,
  maxWidth: '100%',
  maxHeight: '90vh',
  overflow: 'auto',
  padding: 'var(--hai-space-6) var(--hai-space-7)',
  boxShadow: '0 32px 64px -16px rgba(0,0,0,0.55)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--hai-space-4)',
  fontFamily: 'Inter Tight, system-ui, sans-serif',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--hai-text-secondary)',
  marginBottom: 6,
  letterSpacing: '0.02em',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--hai-glass-border)',
  background: 'var(--hai-glass-1)',
  color: 'var(--hai-text-primary)',
  fontSize: 14,
  fontFamily: 'inherit',
};

const helpStyle: CSSProperties = {
  fontSize: 12,
  color: 'var(--hai-text-tertiary)',
  marginTop: 6,
};

interface Step {
  key: string;
  title: string;
  desc: string;
  field: 'electricity_tariff_omr_per_kwh' | 'pf_target' | 'value_per_ton_flour' | 'capacitor_cost_omr_per_kvar' | 'savings_ledger_confidence_default_pct' | 'cfo_digest_enabled';
  type: 'number' | 'percent' | 'bool' | 'slider';
  defaultValue: number | boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

const STEPS: Step[] = [
  {
    key: 'tariff',
    title: 'Energy tariff',
    desc: 'How much does 1 kWh cost? Used everywhere on the AI page.',
    field: 'electricity_tariff_omr_per_kwh',
    type: 'number',
    defaultValue: 0.025,
    min: 0, step: 0.001, unit: 'OMR/kWh',
  },
  {
    key: 'flour',
    title: 'Flour value',
    desc: 'Wholesale price per ton of flour. Drives the yield-drift OMR calculation.',
    field: 'value_per_ton_flour',
    type: 'number',
    defaultValue: 250,
    min: 0, step: 1, unit: 'OMR/ton',
  },
  {
    key: 'pf',
    title: 'Power-factor target',
    desc: "Below this, your utility may add a penalty. Most contracts: 0.85–0.90.",
    field: 'pf_target',
    type: 'slider',
    defaultValue: 0.90,
    min: 0.80, max: 0.95, step: 0.01,
  },
  {
    key: 'capacitor',
    title: 'Power-correction equipment cost',
    desc: 'Roughly what you pay per kvar of corrective capacitor installed. Used for payback math.',
    field: 'capacitor_cost_omr_per_kvar',
    type: 'number',
    defaultValue: 12,
    min: 0, step: 1, unit: 'OMR/kvar',
  },
  {
    key: 'confidence',
    title: 'Savings confidence',
    desc: 'How much credit Hercules takes for auto-detected savings before you confirm. 0 = strict, 100 = generous.',
    field: 'savings_ledger_confidence_default_pct',
    type: 'percent',
    defaultValue: 50,
    min: 0, max: 100, step: 5,
  },
  {
    key: 'digest',
    title: 'Weekly digest email',
    desc: 'Send a CFO-style weekly summary email? You can change recipients later in settings.',
    field: 'cfo_digest_enabled',
    type: 'bool',
    defaultValue: false,
  },
];

export default function OnboardingModal({ enabled, onClose }: OnboardingModalProps) {
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [values, setValues] = useState<Record<string, any>>(() =>
    Object.fromEntries(STEPS.map((s) => [s.field, s.defaultValue]))
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(LS_KEY) === '1') return;
    setOpen(true);
  }, [enabled]);

  const close = (markDone: boolean) => {
    setOpen(false);
    if (markDone) {
      try { localStorage.setItem(LS_KEY, '1'); } catch { /* ignore */ }
    }
    onClose?.();
  };

  if (!open) return null;

  const step = STEPS[stepIdx];
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEPS.length - 1;

  const next = () => setStepIdx((i) => Math.min(STEPS.length - 1, i + 1));
  const prev = () => setStepIdx((i) => Math.max(0, i - 1));

  const finish = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      for (const s of STEPS) {
        const v = values[s.field];
        if (v === undefined || v === '' || v === null) continue;
        payload[s.field] = v;
      }
      await herculesAIApi.updateConfig(payload);
      close(true);
    } catch {
      // Silent on failure — user can re-edit in Settings.
      close(true);
    } finally {
      setSaving(false);
    }
  };

  const renderInput = () => {
    const v = values[step.field];
    if (step.type === 'bool') {
      return (
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!v}
            onChange={(e) => setValues((s) => ({ ...s, [step.field]: e.target.checked }))}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ fontSize: 14, color: 'var(--hai-text-primary)' }}>Send the weekly digest</span>
        </label>
      );
    }
    if (step.type === 'slider' || step.type === 'percent') {
      return (
        <div>
          <div style={{
            fontFamily: 'Inter Tight, system-ui, sans-serif',
            fontSize: 32, fontWeight: 300, color: 'var(--hai-text-primary)',
            marginBottom: 8, fontVariantNumeric: 'tabular-nums',
          }}>
            {step.type === 'percent' ? `${v}%` : Number(v).toFixed(2)}
          </div>
          <input
            type="range"
            min={step.min} max={step.max} step={step.step}
            value={v}
            onChange={(e) => setValues((s) => ({
              ...s,
              [step.field]: step.type === 'percent' ? parseInt(e.target.value, 10) : parseFloat(e.target.value),
            }))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--hai-text-tertiary)', marginTop: 4 }}>
            <span>{step.min}{step.type === 'percent' ? '%' : ''}</span>
            <span>{step.max}{step.type === 'percent' ? '%' : ''}</span>
          </div>
        </div>
      );
    }
    // number
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number"
          min={step.min} step={step.step}
          value={v}
          onChange={(e) => setValues((s) => ({ ...s, [step.field]: parseFloat(e.target.value) || 0 }))}
          style={{ ...inputStyle, maxWidth: 200, fontFamily: 'JetBrains Mono, monospace' }}
        />
        {step.unit && (
          <span style={{ fontSize: 13, color: 'var(--hai-text-secondary)' }}>{step.unit}</span>
        )}
      </div>
    );
  };

  return (
    <div role="dialog" aria-label="Hercules AI onboarding" aria-modal="true" style={overlayStyle}>
      <div style={cardStyle} className="hai-num">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Sparkles size={20} style={{ color: 'var(--hai-money)' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--hai-text-primary)' }}>
            Welcome to Hercules AI
          </h2>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => close(false)}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none', color: 'var(--hai-text-tertiary)',
              cursor: 'pointer', padding: 6, borderRadius: 8,
            }}
          >
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--hai-text-secondary)' }}>
          Six quick questions and Hercules can start tracking what costs you money.
          You can change any answer later in Settings.
        </p>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: i <= stepIdx ? 'var(--hai-money)' : 'var(--hai-glass-border)',
                transition: 'background 200ms cubic-bezier(.22,1,.36,1)',
              }}
            />
          ))}
        </div>

        {/* Step content */}
        <div style={{ paddingTop: 'var(--hai-space-3)' }}>
          <div style={{ fontSize: 11, color: 'var(--hai-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Step {stepIdx + 1} of {STEPS.length}
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600, color: 'var(--hai-text-primary)' }}>
            {step.title}
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--hai-text-secondary)' }}>
            {step.desc}
          </p>
          <label style={labelStyle}>{step.title}</label>
          {renderInput()}
          <p style={helpStyle}>You can change this later in Settings.</p>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--hai-glass-border)', paddingTop: 'var(--hai-space-4)' }}>
          <button
            onClick={() => close(true)}
            style={{
              fontSize: 12, color: 'var(--hai-text-tertiary)',
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}
          >
            Skip & use defaults
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={prev}
              disabled={isFirst}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10,
                border: '1px solid var(--hai-glass-border)',
                background: 'var(--hai-glass-1)',
                color: 'var(--hai-text-secondary)',
                cursor: isFirst ? 'not-allowed' : 'pointer',
                opacity: isFirst ? 0.4 : 1, fontSize: 13, fontFamily: 'inherit',
              }}
            >
              <ArrowLeft size={14} /> Back
            </button>
            {isLast ? (
              <button
                onClick={finish}
                disabled={saving}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', borderRadius: 10,
                  background: 'var(--hai-money)',
                  color: '#3a2400',
                  border: 'none', fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
                  fontSize: 13, fontFamily: 'inherit',
                }}
              >
                <Check size={14} /> {saving ? 'Saving…' : 'Confirm & start'}
              </button>
            ) : (
              <button
                onClick={next}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '8px 18px', borderRadius: 10,
                  background: 'var(--hai-money)',
                  color: '#3a2400',
                  border: 'none', fontWeight: 700, cursor: 'pointer',
                  fontSize: 13, fontFamily: 'inherit',
                }}
              >
                Next <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
