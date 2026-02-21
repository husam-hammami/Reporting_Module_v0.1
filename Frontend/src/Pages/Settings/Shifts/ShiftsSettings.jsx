import React, { useState, useEffect } from 'react';
import { FaClock, FaSave } from 'react-icons/fa';
import axios from '../../../API/axios';
import { toast } from 'react-toastify';

export default function ShiftsSettings() {
  const [shiftCount, setShiftCount] = useState(3);
  const [shifts, setShifts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    axios.get('/api/settings/shifts')
      .then(res => {
        const d = res.data;
        setShiftCount(d.shift_count || 3);
        setShifts(d.shifts || []);
        setLoaded(true);
      })
      .catch(() => toast.error('Failed to load shifts config'));
  }, []);

  const handleShiftCountChange = (newCount) => {
    setShiftCount(newCount);
    setShifts(prev => {
      if (newCount > prev.length) {
        const extra = Array.from({ length: newCount - prev.length }, () => ({ name: '', start: '', end: '' }));
        return [...prev, ...extra];
      }
      return prev.slice(0, newCount);
    });
  };

  const handleShiftChange = (index, field, value) => {
    setShifts(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post('/api/settings/shifts', { shift_count: shiftCount, shifts });
      toast.success('Shift schedule saved');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save shifts');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-3 py-2 text-[13px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:ring-2 focus:ring-brand focus:border-transparent outline-none";
  const labelClass = "block text-[11px] font-medium text-[#6b7f94] mb-1.5";

  return (
    <div className="p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Section header */}
        <div className="flex items-center gap-2 mb-1">
          <FaClock className="text-brand" size={13} />
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7f94] dark:text-[#6b7f94]">
            Shift Schedule Configuration
          </h3>
        </div>
        <p className="text-[11px] text-[#8898aa] -mt-4">
          Define shift schedules used in the Reporting time filter.
        </p>

        {/* Shift count selector */}
        <div>
          <label className={labelClass}>Number of Shifts</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => handleShiftCountChange(n)}
                className={`px-4 py-2 text-[12px] font-medium rounded-lg border transition-colors ${
                  shiftCount === n
                    ? 'bg-brand text-white border-brand'
                    : 'border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Shift rows */}
        <div className="space-y-3">
          {shifts.map((shift, i) => (
            <div key={i} className="grid grid-cols-3 gap-4 items-end">
              <div>
                <label className={labelClass}>Shift {i + 1} Name</label>
                <input type="text" value={shift.name} onChange={e => handleShiftChange(i, 'name', e.target.value)}
                  placeholder={`Shift ${i + 1}`} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Start Time</label>
                <input type="time" value={shift.start} onChange={e => handleShiftChange(i, 'start', e.target.value)}
                  className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>End Time</label>
                <input type="time" value={shift.end} onChange={e => handleShiftChange(i, 'end', e.target.value)}
                  className={inputClass} />
              </div>
            </div>
          ))}
        </div>

        {/* Save button */}
        <div className="pt-2">
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50">
            <FaSave size={10} />
            {saving ? 'Saving...' : 'Save Shifts'}
          </button>
        </div>
      </div>
    </div>
  );
}
