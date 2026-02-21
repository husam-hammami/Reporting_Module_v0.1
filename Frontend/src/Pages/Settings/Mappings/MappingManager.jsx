import React, { useState, useEffect } from 'react';
import { FaPlus, FaEdit, FaTrash, FaCheck, FaTimes, FaTag } from 'react-icons/fa';
import { ArrowRight } from 'lucide-react';
import MappingForm from './MappingForm';
import { useEmulator } from '../../../Context/EmulatorContext';
import '../../ReportBuilder/reportBuilderTheme.css';

/* ── Salalah seed mappings ── */
const SEED_MAPPINGS = [
  {
    id: 'map_bin_material',
    name: 'Bin → Material',
    input_tag: 'Sender1BinId',
    output_tag_name: 'Sender1_Material',
    description: 'Reads bin ID from PLC, outputs the material stored in that bin',
    lookup: { '21': 'Wheat (Hard Red Winter)', '22': 'Wheat (Soft White)', '23': 'Wheat (Durum)', '25': 'Wheat (Spring)', '27': 'Barley', '28': 'Corn / Maize', '29': 'Premium Flour', '31': 'Semolina', '32': 'Bran (Coarse)', '94': 'Bran (Fine)' },
    fallback: 'Unknown Material',
    is_active: true,
  },
  {
    id: 'map_prd_code',
    name: 'Product Code → Product',
    input_tag: 'PrdCode',
    output_tag_name: 'ProductName',
    description: 'Converts numeric product code to product name',
    lookup: { '9101': 'Premium Flour 50kg', '9102': 'Standard Flour 50kg', '9103': 'Semolina 25kg', '9104': 'Bran (Coarse) Bulk', '9105': 'Bran (Fine) Bulk', '9201': 'Whole Wheat Flour 25kg', '9301': 'Animal Feed Mix' },
    fallback: 'Unknown Product',
    is_active: true,
  },
  {
    id: 'map_dest_silo',
    name: 'Dest Bin → Silo Location',
    input_tag: 'DestBinId',
    output_tag_name: 'DestSiloName',
    description: 'Converts destination bin ID to physical silo name',
    lookup: { '21': 'Silo 021 (Wheat Reception)', '211': 'Silo 021A (1st Clean)', '212': 'Silo 021B (2nd Clean)', '213': 'Silo 021C (Tempering)', '29': 'Flour Silo 029', '31': 'Semolina Silo 031', '32': 'Bran Silo 032' },
    fallback: 'Unknown Silo',
    is_active: true,
  },
  {
    id: 'map_job_status',
    name: 'Job Status → Label',
    input_tag: 'Job_status_code',
    output_tag_name: 'JobStatusLabel',
    description: 'Converts PLC job status code to readable label',
    lookup: { '0': 'Idle', '1': 'Starting', '2': 'Running', '3': 'Paused', '4': 'Stopping', '5': 'Completed', '6': 'Error', '7': 'Cleaning' },
    fallback: 'Unknown',
    is_active: true,
  },
];

function resolveLookup(mapping, inputValue) {
  if (inputValue == null) return mapping.fallback || '—';
  const key = String(Math.round(Number(inputValue)));
  return mapping.lookup[key] || mapping.fallback || '—';
}

const MappingManager = () => {
  const [mappings, setMappings] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingMapping, setEditingMapping] = useState(null);
  const { tagValues, enabled: emulatorOn } = useEmulator();

  useEffect(() => { loadMappings(); }, []);

  const loadMappings = () => {
    try {
      const saved = localStorage.getItem('system_mappings_v2');
      if (saved) {
        const loaded = JSON.parse(saved) || [];
        if (loaded.length > 0) { setMappings(loaded); return; }
      }
    } catch { /* ignore */ }
    localStorage.setItem('system_mappings_v2', JSON.stringify(SEED_MAPPINGS));
    setMappings(SEED_MAPPINGS);
  };

  const save = (updated) => {
    localStorage.setItem('system_mappings_v2', JSON.stringify(updated));
    setMappings(updated);
    window.dispatchEvent(new Event('mappingsUpdated'));
  };

  const handleSave = (data) => {
    if (editingMapping) {
      save(mappings.map(m => m.id === editingMapping.id ? { ...data, id: editingMapping.id } : m));
    } else {
      save([...mappings, { ...data, id: `map_${Date.now()}` }]);
    }
    setShowForm(false);
    setEditingMapping(null);
  };

  const handleDelete = (id) => {
    if (window.confirm('Delete this mapping?')) save(mappings.filter(m => m.id !== id));
  };

  const handleToggle = (id) => {
    save(mappings.map(m => m.id === id ? { ...m, is_active: !m.is_active } : m));
  };

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
