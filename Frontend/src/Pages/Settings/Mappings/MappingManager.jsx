import React, { useState, useEffect, useCallback } from 'react';
import { FaPlus, FaEdit, FaTrash, FaCheck, FaTimes } from 'react-icons/fa';
import { ArrowRight } from 'lucide-react';
import MappingForm from './MappingForm';
import { useEmulator } from '../../../Context/EmulatorContext';
import axios from '../../../API/axios';
import '../../ReportBuilder/reportBuilderTheme.css';

function resolveLookup(mapping, inputValue) {
  if (inputValue == null) return mapping.fallback || '—';
  const key = String(Math.round(Number(inputValue)));
  return (mapping.lookup || {})[key] || mapping.fallback || '—';
}

const MappingManager = () => {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingMapping, setEditingMapping] = useState(null);
  const { tagValues, enabled: emulatorOn } = useEmulator();

  const loadMappings = useCallback(async () => {
    try {
      setError(null);
      const res = await axios.get('/api/mappings');
      const list = res.data?.mappings || [];
      setMappings(list);

      // One-time migration: if DB is empty but localStorage has data, migrate it
      if (list.length === 0) {
        const saved = localStorage.getItem('system_mappings_v2');
        if (saved) {
          try {
            const local = JSON.parse(saved);
            if (Array.isArray(local) && local.length > 0) {
              const migrateRes = await axios.post('/api/mappings/migrate-from-local', local);
              if (migrateRes.data?.imported > 0) {
                // Reload from DB after migration
                const res2 = await axios.get('/api/mappings');
                setMappings(res2.data?.mappings || []);
                // Clear localStorage after successful migration
                localStorage.removeItem('system_mappings_v2');
              }
            }
          } catch (migrateErr) {
            console.warn('Failed to migrate localStorage mappings:', migrateErr);
          }
        }

        // If still empty after migration attempt, seed defaults
        const currentMappings = mappings.length > 0 ? mappings : (await axios.get('/api/mappings')).data?.mappings || [];
        if (currentMappings.length === 0) {
          await axios.post('/api/mappings/seed');
          const res3 = await axios.get('/api/mappings');
          setMappings(res3.data?.mappings || []);
        }
      }
    } catch (err) {
      console.error('Error loading mappings:', err);
      setError('Failed to load mappings from server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMappings(); }, [loadMappings]);

  const handleSave = async (data) => {
    try {
      if (editingMapping) {
        await axios.put(`/api/mappings/${editingMapping.id}`, data);
      } else {
        await axios.post('/api/mappings', data);
      }
      setShowForm(false);
      setEditingMapping(null);
      loadMappings();
      window.dispatchEvent(new Event('mappingsUpdated'));
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      alert('Error saving mapping: ' + msg);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this mapping?')) return;
    try {
      await axios.delete(`/api/mappings/${id}`);
      loadMappings();
      window.dispatchEvent(new Event('mappingsUpdated'));
    } catch (err) {
      alert('Error deleting mapping: ' + (err.response?.data?.message || err.message));
    }
  };

  const handleToggle = async (id) => {
    try {
      await axios.patch(`/api/mappings/${id}/toggle`);
      loadMappings();
      window.dispatchEvent(new Event('mappingsUpdated'));
    } catch (err) {
      alert('Error toggling mapping: ' + (err.response?.data?.message || err.message));
    }
  };

  if (loading) {
    return (
      <div className="p-5">
        <div className="text-center py-12 text-[12px] text-[#8898aa]">Loading mappings...</div>
      </div>
    );
  }

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">Mappings</h2>
          <p className="text-[11px] text-[#8898aa] mt-0.5">
            Map(Tag) → Lookup Table → New virtual tag available in reports
          </p>
        </div>
        <button onClick={() => { setEditingMapping(null); setShowForm(true); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors">
          <FaPlus size={10} /> New Mapping
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-[11px] text-[#dc2626]">
          {error}
          <button onClick={loadMappings} className="ml-2 font-medium underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Cards */}
      <div className="space-y-3">
        {mappings.length === 0 ? (
          <div className="text-center py-12 text-[12px] text-[#8898aa]">No mappings yet. Create one to convert PLC tag values into readable names.</div>
        ) : mappings.map((m) => {
          const liveInput = emulatorOn ? tagValues[m.input_tag] : null;
          const liveOutput = liveInput != null ? resolveLookup(m, liveInput) : null;
          const entryCount = Object.keys(m.lookup || {}).length;
          return (
            <div key={m.id} className="bg-white dark:bg-[#131b2d] border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg overflow-hidden">
              {/* Top row */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e3e9f0] dark:border-[#1e2d40]">
                {/* Flow diagram: two-tone mapping chip */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="rb-mapping-chip">
                    <span className="rb-mapping-chip-input">{m.input_tag}</span>
                    <span className="rb-mapping-chip-arrow"><ArrowRight size={10} /></span>
                    <span className="rb-mapping-chip-output">{m.output_tag_name}</span>
                  </div>
                  <span className="text-[11px] text-[#6b7f94] flex-shrink-0">{entryCount} rules</span>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className={m.is_active ? 'rb-status-badge-active' : 'rb-status-badge-off'}>
                    {m.is_active ? 'Active' : 'Off'}
                  </span>
                  <button onClick={() => handleToggle(m.id)} className="p-1.5 rounded-md text-[#6b7f94] hover:text-brand hover:bg-brand-subtle transition-colors" title="Toggle">
                    {m.is_active ? <FaCheck size={11} /> : <FaTimes size={11} />}
                  </button>
                  <button onClick={() => { setEditingMapping(m); setShowForm(true); }} className="p-1.5 rounded-md text-[#6b7f94] hover:text-brand hover:bg-brand-subtle transition-colors" title="Edit">
                    <FaEdit size={11} />
                  </button>
                  <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded-md text-[#6b7f94] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors" title="Delete">
                    <FaTrash size={11} />
                  </button>
                </div>
              </div>

              {/* Body: name + description + live preview */}
              <div className="px-4 py-3 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-[13px] font-semibold text-[#2a3545] dark:text-[#e1e8f0]">{m.name}</h3>
                  {m.description && <p className="text-[11px] text-[#8898aa] mt-0.5">{m.description}</p>}
                  {/* Compact lookup preview */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.entries(m.lookup || {}).slice(0, 6).map(([k, v]) => (
                      <span key={k} className="text-[10px] px-2 py-0.5 rounded bg-[#f5f8fb] dark:bg-[#0d1825] text-[#6b7f94] border border-[#e3e9f0] dark:border-[#1e2d40]">
                        <span className="font-mono">{k}</span> → {v}
                      </span>
                    ))}
                    {entryCount > 6 && <span className="text-[10px] text-[#8898aa]">+{entryCount - 6} more</span>}
                  </div>
                </div>

                {/* Live preview when emulator is on */}
                {emulatorOn && liveInput != null && (
                  <div className="flex-shrink-0 text-right bg-[#f5f8fb] dark:bg-[#0d1825] rounded-lg px-3 py-2 border border-[#e3e9f0] dark:border-[#1e2d40]">
                    <p className="text-[10px] text-[#8898aa] mb-0.5">Live</p>
                    <p className="text-[11px] font-mono text-[#6b7f94]">{m.input_tag} = {typeof liveInput === 'number' ? liveInput.toFixed(0) : liveInput}</p>
                    <p className="text-[12px] font-semibold text-[#059669] dark:text-[#34d399] mt-0.5">{liveOutput}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <MappingForm
          mapping={editingMapping}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingMapping(null); }}
        />
      )}
    </div>
  );
};

export default MappingManager;
