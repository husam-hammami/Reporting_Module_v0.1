import React, { useState, useEffect, useCallback } from 'react';
import { FaPlus, FaEdit, FaTrash, FaPlay, FaExclamationTriangle } from 'react-icons/fa';
import { distributionApi } from '../../../API/distributionApi';
import { toast } from 'react-toastify';
import RuleForm from './RuleForm';

const SCHEDULE_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const DELIVERY_LABELS = { email: 'Email', disk: 'Disk', both: 'Email + Disk' };
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function formatSchedule(rule) {
  const time = rule.schedule_time || '08:00';
  if (rule.schedule_type === 'daily') return `Daily at ${time}`;
  if (rule.schedule_type === 'weekly') return `${DAY_NAMES[rule.schedule_day_of_week ?? 0]}s at ${time}`;
  if (rule.schedule_type === 'monthly') {
    const d = rule.schedule_day_of_month ?? 1;
    const suffix = [,'st','nd','rd'][d % 10 > 3 ? 0 : (d % 100 - d % 10 !== 10) * (d % 10)] || 'th';
    return `${d}${suffix} of month at ${time}`;
  }
  return rule.schedule_type;
}

export default function DistributionRules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formRule, setFormRule] = useState(null); // null = closed, {} = new, {...} = edit
  const [runningId, setRunningId] = useState(null);

  const loadRules = useCallback(async () => {
    try {
      const res = await distributionApi.listRules();
      setRules(res.data?.data || []);
    } catch {
      toast.error('Failed to load distribution rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const handleSave = async (data) => {
    try {
      if (data.id) {
        await distributionApi.updateRule(data.id, data);
        toast.success('Rule updated');
      } else {
        await distributionApi.createRule(data);
        toast.success('Rule created');
      }
      setFormRule(null);
      loadRules();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save rule');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this distribution rule?')) return;
    try {
      await distributionApi.deleteRule(id);
      toast.success('Rule deleted');
      loadRules();
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const handleToggle = async (rule) => {
    try {
      const { name, report_id, delivery_method, recipients, save_path, format,
              schedule_type, schedule_time, schedule_day_of_week, schedule_day_of_month } = rule;
      await distributionApi.updateRule(rule.id, {
        name, report_id, delivery_method, recipients, save_path, format,
        schedule_type, schedule_time, schedule_day_of_week, schedule_day_of_month,
        enabled: !rule.enabled,
      });
      loadRules();
    } catch {
      toast.error('Failed to toggle rule');
    }
  };

  const handleRunNow = async (id) => {
    setRunningId(id);
    try {
      const res = await distributionApi.runRule(id);
      if (res.data?.status === 'success') {
        toast.success(res.data.message || 'Report delivered');
      } else {
        toast.error(res.data?.message || 'Delivery failed');
      }
      loadRules();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Execution failed');
    } finally {
      setRunningId(null);
    }
  };

  const statusBadge = (rule) => {
    if (!rule.last_run_status) return null;
    const isSuccess = rule.last_run_status === 'success';
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
        isSuccess
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
          : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
      }`}>
        {isSuccess ? 'OK' : 'Failed'}
      </span>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7f94]">
            Distribution Rules
          </h3>
          <p className="text-[11px] text-[#8898aa] mt-0.5">
            Schedule reports for automatic email delivery or disk save.
          </p>
        </div>
        <button
          onClick={() => setFormRule({})}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors"
        >
          <FaPlus size={9} />
          Add Rule
        </button>
      </div>

      {/* Rules list */}
      {loading ? (
        <div className="text-[12px] text-[#8898aa] py-8 text-center">Loading...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-10 bg-white dark:bg-[#131b2d] rounded-xl border border-[#e3e9f0] dark:border-[#1e2d40]">
          <p className="text-[12px] text-[#8898aa]">No distribution rules yet.</p>
          <p className="text-[11px] text-[#8898aa] mt-1">Click "Add Rule" to schedule your first report delivery.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`flex items-center justify-between px-4 py-3 bg-white dark:bg-[#131b2d] rounded-xl border transition-colors ${
                rule.enabled
                  ? 'border-[#e3e9f0] dark:border-[#1e2d40]'
                  : 'border-[#e3e9f0] dark:border-[#1e2d40] opacity-50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {/* Toggle */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input type="checkbox" checked={rule.enabled} onChange={() => handleToggle(rule)}
                    className="sr-only peer" />
                  <div className="w-8 h-4.5 bg-gray-300 peer-focus:ring-2 peer-focus:ring-brand rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-brand" style={{ width: 32, height: 18 }}></div>
                </label>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#2a3545] dark:text-[#e1e8f0] truncate">
                      {rule.name || 'Untitled Rule'}
                    </span>
                    {rule.report_missing && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                        <FaExclamationTriangle size={8} />
                        Report deleted
                      </span>
                    )}
                    {statusBadge(rule)}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-[#8898aa]">{rule.report_name || `Report #${rule.report_id}`}</span>
                    <span className="text-[11px] text-[#8898aa]">{formatSchedule(rule)}</span>
                    <span className="text-[11px] text-[#8898aa]">{DELIVERY_LABELS[rule.delivery_method] || rule.delivery_method}</span>
                    <span className="text-[11px] text-[#8898aa] uppercase">{rule.format}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0 ml-3">
                <button
                  onClick={() => handleRunNow(rule.id)}
                  disabled={runningId === rule.id}
                  title="Run now"
                  className="p-1.5 rounded-md text-[#8898aa] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                >
                  <FaPlay size={10} />
                </button>
                <button
                  onClick={() => setFormRule(rule)}
                  title="Edit"
                  className="p-1.5 rounded-md text-[#8898aa] hover:text-brand hover:bg-[#f0f5fa] dark:hover:bg-[#0f2840] transition-colors"
                >
                  <FaEdit size={10} />
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  title="Delete"
                  className="p-1.5 rounded-md text-[#8898aa] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <FaTrash size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal form */}
      {formRule !== null && (
        <RuleForm
          rule={formRule.id ? formRule : null}
          onSave={handleSave}
          onClose={() => setFormRule(null)}
        />
      )}
    </div>
  );
}
