import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, HardDrive, Layers, Save, Play } from 'lucide-react';
import { reportBuilderApi } from '../../API/reportBuilderApi';
import RecipientInput from '../Settings/ReportDistribution/RecipientInput';
import { toast } from 'react-toastify';

const SCHEDULE_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const DELIVERY_OPTIONS = [
  { value: 'email', label: 'Email', icon: Mail, desc: 'Send via SMTP' },
  { value: 'disk', label: 'Save to Disk', icon: HardDrive, desc: 'Save to local path' },
  { value: 'both', label: 'Both', icon: Layers, desc: 'Email + disk save' },
];

const DAY_PILLS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EMPTY_RULE = {
  name: '',
  report_id: '',
  delivery_method: 'email',
  recipients: [],
  save_path: '',
  format: 'pdf',
  schedule_type: 'daily',
  schedule_time: '08:00',
  schedule_day_of_week: 0,
  schedule_day_of_month: 1,
  enabled: true,
};

function schedulePreview(form) {
  const time = form.schedule_time || '08:00';
  if (form.schedule_type === 'daily') return `Runs every day at ${time}`;
  if (form.schedule_type === 'weekly') return `Runs every ${DAY_PILLS[form.schedule_day_of_week ?? 0]} at ${time}`;
  if (form.schedule_type === 'monthly') {
    const d = form.schedule_day_of_month ?? 1;
    const s = [, 'st', 'nd', 'rd'][d % 10 > 3 ? 0 : (d % 100 - d % 10 !== 10) * (d % 10)] || 'th';
    return `Runs on the ${d}${s} of every month at ${time}`;
  }
  return '';
}

export default function DistributionRuleEditor({ rule, theme: t, onSave, onCancel, onRunNow }) {
  const isEdit = !!rule?.id;
  const [form, setForm] = useState({ ...EMPTY_RULE });
  const [reports, setReports] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rule && rule.id) {
      setForm({
        ...EMPTY_RULE,
        ...rule,
        recipients: Array.isArray(rule.recipients) ? rule.recipients : [],
        schedule_day_of_week: rule.schedule_day_of_week ?? 0,
        schedule_day_of_month: rule.schedule_day_of_month ?? 1,
      });
    } else {
      setForm({ ...EMPTY_RULE });
    }
  }, [rule]);

  useEffect(() => {
    reportBuilderApi.list()
      .then(res => {
        const data = res.data?.data || res.data || [];
        setReports(Array.isArray(data) ? data : []);
      })
      .catch(() => toast.error('Failed to load reports'));
  }, []);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.report_id) { toast.error('Please select a report'); return; }
    if (form.delivery_method !== 'disk' && form.recipients.length === 0) {
      toast.error('Add at least one recipient email');
      return;
    }
    if (form.delivery_method !== 'email' && !form.save_path?.trim()) {
      toast.error('Provide a save path');
      return;
    }
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  };

  const sectionStyle = {
    background: t.surface,
    border: `1px solid ${t.border}`,
  };

  const inputStyle = {
    background: t.modalInputBg,
    border: `1px solid ${t.border}`,
    color: t.text,
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.3 }}
      className="max-w-3xl mx-auto"
    >
      {/* Back button + title */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel}
          className="p-2 rounded-lg transition-colors"
          style={{ color: t.textSecondary }}
          onMouseEnter={e => { e.currentTarget.style.background = t.hoverBg; e.currentTarget.style.color = t.text; }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = t.textSecondary; }}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="text-lg font-bold" style={{ color: t.text }}>
            {isEdit ? 'Edit Rule' : 'New Distribution Rule'}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: t.textSecondary }}>
            {isEdit ? 'Update the rule configuration below.' : 'Configure schedule, delivery, and recipients.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 1. Basic Info */}
        <div className="rounded-xl p-5 space-y-4" style={sectionStyle}>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: t.accent }}>Basic Info</h3>
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: t.textSecondary }}>Rule Name</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Daily Silo Report"
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors"
              style={{ ...inputStyle, '--tw-ring-color': t.accentBg }} />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: t.textSecondary }}>Report *</label>
            <select
              value={form.report_id}
              onChange={e => set('report_id', Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors appearance-none"
              style={{ ...inputStyle, '--tw-ring-color': t.accentBg }}>
              <option value="">Select a report...</option>
              {reports.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>

        {/* 2. Delivery */}
        <div className="rounded-xl p-5 space-y-4" style={sectionStyle}>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: t.accent }}>Delivery</h3>
          <div className="grid grid-cols-3 gap-3">
            {DELIVERY_OPTIONS.map(opt => {
              const selected = form.delivery_method === opt.value;
              return (
                <button key={opt.value} type="button" onClick={() => set('delivery_method', opt.value)}
                  className="relative flex flex-col items-center gap-2 p-4 rounded-xl text-center transition-all duration-200"
                  style={{
                    border: `2px solid ${selected ? t.accent : t.border}`,
                    background: selected ? t.accentBg : t.modalInputBg,
                  }}>
                  {selected && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: t.accent }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  )}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${t.accent}15`, border: `1px solid ${t.accent}25` }}>
                    <opt.icon size={20} style={{ color: t.accent }} />
                  </div>
                  <div className="text-xs font-bold" style={{ color: selected ? t.accent : t.text }}>{opt.label}</div>
                  <div className="text-[10px]" style={{ color: t.textSecondary }}>{opt.desc}</div>
                </button>
              );
            })}
          </div>

          {form.delivery_method !== 'disk' && (
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: t.textSecondary }}>Recipients *</label>
              <RecipientInput value={form.recipients} onChange={v => set('recipients', v)} />
            </div>
          )}

          {form.delivery_method !== 'email' && (
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: t.textSecondary }}>Save Path *</label>
              <input type="text" value={form.save_path} onChange={e => set('save_path', e.target.value)}
                placeholder="C:\Reports"
                className="w-full px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors"
                style={{ ...inputStyle, '--tw-ring-color': t.accentBg }} />
            </div>
          )}
        </div>

        {/* 3. Format */}
        <div className="rounded-xl p-5 space-y-4" style={sectionStyle}>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: t.accent }}>Format</h3>
          <div className="flex gap-2">
            {['pdf', 'html'].map(f => (
              <button key={f} type="button" onClick={() => set('format', f)}
                className="px-4 py-2 text-xs font-semibold rounded-lg uppercase transition-all"
                style={{
                  background: form.format === f ? t.accent : 'transparent',
                  color: form.format === f ? t.btnText : t.textSecondary,
                  border: `1px solid ${form.format === f ? t.accent : t.border}`,
                }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Schedule */}
        <div className="rounded-xl p-5 space-y-4" style={sectionStyle}>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: t.accent }}>Schedule</h3>

          {/* Type toggles */}
          <div className="flex gap-2">
            {SCHEDULE_TYPES.map(s => (
              <button key={s.value} type="button" onClick={() => set('schedule_type', s.value)}
                className="px-4 py-2 text-xs font-semibold rounded-lg transition-all"
                style={{
                  background: form.schedule_type === s.value ? t.accent : 'transparent',
                  color: form.schedule_type === s.value ? t.btnText : t.textSecondary,
                  border: `1px solid ${form.schedule_type === s.value ? t.accent : t.border}`,
                }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Time */}
          <div>
            <label className="block text-[11px] font-medium mb-1.5" style={{ color: t.textSecondary }}>Time</label>
            <input type="time" value={form.schedule_time} onChange={e => set('schedule_time', e.target.value)}
              className="w-48 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors"
              style={{ ...inputStyle, '--tw-ring-color': t.accentBg }} />
          </div>

          {/* Day-of-week pills */}
          {form.schedule_type === 'weekly' && (
            <div>
              <label className="block text-[11px] font-medium mb-2" style={{ color: t.textSecondary }}>Day of Week</label>
              <div className="flex gap-2">
                {DAY_PILLS.map((d, i) => (
                  <button key={d} type="button" onClick={() => set('schedule_day_of_week', i)}
                    className="w-10 h-10 rounded-full text-[11px] font-semibold transition-all"
                    style={{
                      background: form.schedule_day_of_week === i ? t.accent : t.modalInputBg,
                      color: form.schedule_day_of_week === i ? t.btnText : t.textSecondary,
                      border: `1px solid ${form.schedule_day_of_week === i ? t.accent : t.border}`,
                    }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Day-of-month selector */}
          {form.schedule_type === 'monthly' && (
            <div>
              <label className="block text-[11px] font-medium mb-1.5" style={{ color: t.textSecondary }}>Day of Month</label>
              <select
                value={form.schedule_day_of_month}
                onChange={e => set('schedule_day_of_month', Number(e.target.value))}
                className="w-48 px-3 py-2.5 rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors appearance-none"
                style={{ ...inputStyle, '--tw-ring-color': t.accentBg }}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {/* Preview */}
          <p className="text-[11px] italic" style={{ color: t.textMuted }}>
            {schedulePreview(form)}
          </p>
        </div>

        {/* 5. Enable/Disable */}
        <div className="rounded-xl p-5 flex items-center gap-3" style={sectionStyle}>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} className="sr-only peer" />
            <div className="w-9 h-5 rounded-full transition-colors peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:shadow-sm"
              style={{ background: form.enabled ? t.accent : (t.dark ? '#334155' : '#d1d5db') }} />
          </label>
          <span className="text-xs font-medium" style={{ color: t.textSecondary }}>
            {form.enabled ? 'Rule is enabled — will run on schedule' : 'Rule is paused — will not run automatically'}
          </span>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between pt-2 pb-4">
          <div>
            {isEdit && (
              <button type="button" onClick={() => onRunNow(rule.id)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ color: t.dark ? '#34d399' : '#059669', border: `1px solid ${t.border}`, background: t.surface }}
                onMouseEnter={e => { e.currentTarget.style.background = t.dark ? 'rgba(16,185,129,0.1)' : '#ecfdf5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = t.surface; }}>
                <Play size={13} /> Run Now
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel}
              className="px-5 py-2.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ color: t.textSecondary, background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = t.btnGhostHover; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold transition-all hover:brightness-110 shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: t.accent, color: t.btnText }}>
              <Save size={13} />
              {saving ? 'Saving...' : isEdit ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </div>
      </form>
    </motion.div>
  );
}
