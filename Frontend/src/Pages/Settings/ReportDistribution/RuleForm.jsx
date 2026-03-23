import React, { useState, useEffect } from 'react';
import { FaTimes, FaSave } from 'react-icons/fa';
import RecipientInput from './RecipientInput';
import { reportBuilderApi } from '../../../API/reportBuilderApi';
import { toast } from 'react-toastify';

const SCHEDULE_TYPES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const DELIVERY_METHODS = [
  { value: 'email', label: 'Email' },
  { value: 'disk', label: 'Save to Disk' },
  { value: 'both', label: 'Both' },
];

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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

export default function RuleForm({ rule, onSave, onClose }) {
  const isEdit = !!rule;
  const [form, setForm] = useState({ ...EMPTY_RULE });
  const [reports, setReports] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rule) {
      setForm({
        ...EMPTY_RULE,
        ...rule,
        recipients: Array.isArray(rule.recipients) ? rule.recipients : [],
        schedule_day_of_week: rule.schedule_day_of_week ?? 0,
        schedule_day_of_month: rule.schedule_day_of_month ?? 1,
      });
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
    if (!form.report_id) {
      toast.error('Please select a report');
      return;
    }
    if (form.delivery_method !== 'disk' && form.recipients.length === 0) {
      toast.error('Add at least one recipient email');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 text-[13px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:ring-2 focus:ring-brand focus:border-transparent outline-none";
  const labelClass = "block text-[11px] font-medium text-[#6b7f94] mb-1.5";
  const selectClass = inputClass + " appearance-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-[#131b2d] rounded-xl border border-[#e3e9f0] dark:border-[#1e2d40] shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e3e9f0] dark:border-[#1e2d40]">
          <h3 className="text-[13px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">
            {isEdit ? 'Edit Rule' : 'New Distribution Rule'}
          </h3>
          <button onClick={onClose} className="text-[#8898aa] hover:text-[#3a4a5c] dark:hover:text-[#e1e8f0]">
            <FaTimes size={13} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Rule name */}
          <div>
            <label className={labelClass}>Rule Name</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Daily Silo Report" className={inputClass} />
          </div>

          {/* Report select */}
          <div>
            <label className={labelClass}>Report *</label>
            <select
              value={form.report_id}
              onChange={e => set('report_id', Number(e.target.value))}
              className={selectClass}
            >
              <option value="">Select a report...</option>
              {reports.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          {/* Delivery method */}
          <div>
            <label className={labelClass}>Delivery Method</label>
            <div className="flex gap-2">
              {DELIVERY_METHODS.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => set('delivery_method', m.value)}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                    form.delivery_method === m.value
                      ? 'bg-brand text-white border-brand'
                      : 'border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0f1829]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipients (for email / both) */}
          {form.delivery_method !== 'disk' && (
            <div>
              <label className={labelClass}>Recipients *</label>
              <RecipientInput value={form.recipients} onChange={v => set('recipients', v)} />
            </div>
          )}

          {/* Save path (for disk / both) */}
          {form.delivery_method !== 'email' && (
            <div>
              <label className={labelClass}>Save Path *</label>
              <input type="text" value={form.save_path} onChange={e => set('save_path', e.target.value)}
                placeholder="C:\Reports" className={inputClass} />
            </div>
          )}

          {/* Format */}
          <div>
            <label className={labelClass}>Format</label>
            <div className="flex gap-2">
              {['pdf', 'html'].map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => set('format', f)}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors uppercase ${
                    form.format === f
                      ? 'bg-brand text-white border-brand'
                      : 'border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0f1829]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule type */}
          <div>
            <label className={labelClass}>Schedule</label>
            <div className="flex gap-2">
              {SCHEDULE_TYPES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => set('schedule_type', s.value)}
                  className={`px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors ${
                    form.schedule_type === s.value
                      ? 'bg-brand text-white border-brand'
                      : 'border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0f1829]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule time */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Time</label>
              <input type="time" value={form.schedule_time} onChange={e => set('schedule_time', e.target.value)}
                className={inputClass} />
            </div>

            {form.schedule_type === 'weekly' && (
              <div>
                <label className={labelClass}>Day of Week</label>
                <select value={form.schedule_day_of_week} onChange={e => set('schedule_day_of_week', Number(e.target.value))}
                  className={selectClass}>
                  {DAYS_OF_WEEK.map((d, i) => (
                    <option key={i} value={i}>{d}</option>
                  ))}
                </select>
              </div>
            )}

            {form.schedule_type === 'monthly' && (
              <div>
                <label className={labelClass}>Day of Month</label>
                <select value={form.schedule_day_of_month} onChange={e => set('schedule_day_of_month', Number(e.target.value))}
                  className={selectClass}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)}
                className="sr-only peer" />
              <div className="w-9 h-5 bg-gray-300 peer-focus:ring-2 peer-focus:ring-brand rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
            </label>
            <span className="text-[12px] text-[#6b7f94]">Enabled</span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e3e9f0] dark:border-[#1e2d40]">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-[11px] font-medium rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825] transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50">
              <FaSave size={10} />
              {saving ? 'Saving...' : isEdit ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
