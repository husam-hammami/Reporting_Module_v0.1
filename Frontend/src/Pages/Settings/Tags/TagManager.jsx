import React, { useState, useEffect } from 'react';
import { useLenisScroll } from '../../../Hooks/useLenisScroll';
import { useLanguage } from '../../../Hooks/useLanguage';
import { useSocket } from '../../../Context/SocketContext';
import { FaPlus, FaEdit, FaTrash, FaCheck, FaTimes, FaDownload, FaUpload, FaSearch, FaFilter, FaSpinner } from 'react-icons/fa';
import axios from '../../../API/axios';
import TagForm from './TagForm';
import { useEmulator } from '../../../Context/EmulatorContext';
import { toast } from 'react-toastify';
import ConfirmationModal from '../../../Components/Common/ConfirmationModal';

const FALLBACK_TAGS = [
  { id: 1, tag_name: 'Temperature_1', display_name: 'Temperature Sensor 1', source_type: 'PLC', plc_address: 'DB2099.0', data_type: 'REAL', unit: '°C', description: 'Main process temperature', decimal_places: 1, is_active: true },
  { id: 2, tag_name: 'Pressure_1', display_name: 'Pressure Sensor 1', source_type: 'PLC', plc_address: 'DB2099.4', data_type: 'REAL', unit: 'bar', description: 'System pressure', decimal_places: 2, is_active: true },
  { id: 3, tag_name: 'Flow_Rate_1', display_name: 'Flow Rate', source_type: 'PLC', plc_address: 'DB2099.8', data_type: 'REAL', unit: 'm³/h', description: 'Main flow rate', decimal_places: 1, is_active: true },
  { id: 4, tag_name: 'Motor_Speed_1', display_name: 'Motor Speed', source_type: 'PLC', plc_address: 'DB2099.12', data_type: 'REAL', unit: 'RPM', description: 'Main motor speed', decimal_places: 0, is_active: true },
  { id: 5, tag_name: 'Level_Tank_1', display_name: 'Tank Level', source_type: 'PLC', plc_address: 'DB2099.16', data_type: 'REAL', unit: '%', description: 'Storage tank level', decimal_places: 1, is_active: true },
  { id: 6, tag_name: 'Power_Consumption', display_name: 'Power Consumption', source_type: 'PLC', plc_address: 'DB1603.392', data_type: 'REAL', unit: 'kW', description: 'Total power draw', decimal_places: 2, is_active: true },
  { id: 7, tag_name: 'Vibration_1', display_name: 'Vibration Sensor', source_type: 'PLC', plc_address: 'DB2099.20', data_type: 'REAL', unit: 'mm/s', description: 'Motor vibration', decimal_places: 2, is_active: true },
  { id: 8, tag_name: 'Weight_Scale_1', display_name: 'Scale Weight', source_type: 'PLC', plc_address: 'DB499.0', data_type: 'REAL', unit: 'kg', description: 'Product weight', decimal_places: 1, is_active: true },
  { id: 9, tag_name: 'Mill_Throughput', display_name: 'Mill Throughput', source_type: 'PLC', plc_address: 'DB2099.24', data_type: 'REAL', unit: 't/h', description: 'Production throughput', decimal_places: 2, is_active: true },
  { id: 10, tag_name: 'Flour_Extraction', display_name: 'Flour Extraction', source_type: 'PLC', plc_address: 'DB2099.28', data_type: 'REAL', unit: '%', description: 'Flour extraction rate', decimal_places: 2, is_active: true },
  { id: 11, tag_name: 'Bran_Extraction', display_name: 'Bran Extraction', source_type: 'PLC', plc_address: 'DB2099.32', data_type: 'REAL', unit: '%', description: 'Bran extraction rate', decimal_places: 2, is_active: true },
  { id: 12, tag_name: 'Water_Used', display_name: 'Total Water Used', source_type: 'PLC', plc_address: 'DB199.564', data_type: 'REAL', unit: 'L', description: 'Water consumption', decimal_places: 1, is_active: true },
  { id: 13, tag_name: 'MillingLossFormula', display_name: 'Milling Loss', source_type: 'Formula', formula: '100 - {Flour_Extraction} - {Bran_Extraction}', data_type: 'REAL', unit: '%', description: 'Calculated milling loss', decimal_places: 2, is_active: true },
  { id: 14, tag_name: 'FlowRate_Avg', display_name: 'Avg Flow Rate', source_type: 'Formula', formula: '{Flow_Rate_1}', data_type: 'REAL', unit: 'm³/h', description: 'Averaged flow rate', decimal_places: 1, is_active: true },
];

const TagManager = () => {
  useLenisScroll();
  const { t } = useLanguage();
  const [tags, setTags] = useState([]);
  const [filteredTags, setFilteredTags] = useState([]);
  const [tagValues, setTagValues] = useState({});
  const [tagValuesLoading, setTagValuesLoading] = useState(false);
  const [tagValuesError, setTagValuesError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [draftConfirm, setDraftConfirm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('tag_name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const { socket, isConnected } = useSocket();
  const { enabled: emulatorOn, tagValues: emulatorValues } = useEmulator();

  // Merge emulator values into tagValues when emulator is active
  useEffect(() => {
    if (emulatorOn && emulatorValues && Object.keys(emulatorValues).length > 0) {
      setTagValues(prev => ({ ...prev, ...emulatorValues }));
      setTagValuesError(false);
    }
  }, [emulatorOn, emulatorValues]);

  // Show data instantly from cache or fallback, then try API in background
  useEffect(() => {
    // 1. Instant: show cached or fallback tags (zero wait)
    try {
      const saved = localStorage.getItem('system_tags');
      if (saved) {
        const cached = JSON.parse(saved).tags || [];
        setTags(cached.length > 0 ? cached : FALLBACK_TAGS);
      } else {
        setTags(FALLBACK_TAGS);
      }
    } catch { setTags(FALLBACK_TAGS); }

    // 2. Background: try API, upgrade data if successful
    loadTagsFromAPI();
  }, []);

  useEffect(() => {
    let filtered = [...tags];
    if (searchTerm) {
      filtered = filtered.filter(tag =>
        tag.tag_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (tag.display_name && tag.display_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    if (sourceTypeFilter !== 'all') {
      filtered = filtered.filter(tag => tag.source_type === sourceTypeFilter);
    }
    filtered.sort((a, b) => {
      let aVal = a[sortBy] || '';
      let bVal = b[sortBy] || '';
      if (typeof aVal === 'string') { aVal = aVal.toLowerCase(); bVal = bVal.toLowerCase(); }
      if (sortOrder === 'asc') return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    });
    setFilteredTags(filtered);
    setPage(1);
  }, [tags, searchTerm, sourceTypeFilter, sortBy, sortOrder]);

  const loadTagsFromAPI = async () => {
    try {
      const response = await axios.get('/api/tags', { timeout: 3000, params: { is_active: 'true' } });
      if (response.data.status === 'success') {
        let loadedTags = response.data.tags || [];
        if (loadedTags.length === 0) {
          // Try seed once
          try {
            await axios.post('/api/tags/seed', {}, { timeout: 5000 });
            const retry = await axios.get('/api/tags', { timeout: 3000, params: { is_active: 'true' } });
            if (retry.data.status === 'success' && retry.data.tags?.length > 0) loadedTags = retry.data.tags;
          } catch { /* seed failed, keep what we have */ }
        }
        if (loadedTags.length > 0) {
          setTags(loadedTags);
          localStorage.setItem('system_tags', JSON.stringify({ tags: loadedTags }));
        }
      }
    } catch { /* API unavailable, already showing fallback */ }
  };

  // Alias for save/delete handlers that need to reload
  const loadTags = loadTagsFromAPI;

  const BATCH_SIZE = 200;
  const loadTagValues = async (tagsToLoad) => {
    try {
      setTagValuesLoading(true);
      setTagValuesError(false);
      const tagNames = tagsToLoad
        .filter(t => t.is_active && ['PLC', 'Manual', 'Formula'].includes(t.source_type))
        .map(t => t.tag_name);
      if (tagNames.length === 0) { setTagValues({}); setTagValuesLoading(false); return; }
      const batches = [];
      for (let i = 0; i < tagNames.length; i += BATCH_SIZE) {
        batches.push(tagNames.slice(i, i + BATCH_SIZE));
      }
      const responses = await Promise.all(
        batches.map((batch) =>
          axios.post('/api/tags/get-values', { tag_names: batch }, { timeout: 15000 })
        )
      );
      const merged = {};
      for (const response of responses) {
        if (response.data?.status === 'success' && response.data.tag_values) {
          Object.assign(merged, response.data.tag_values);
        }
      }
      if (Object.keys(merged).length > 0) {
        setTagValues(prev => ({ ...prev, ...merged }));
        setTagValuesError(false);
      } else { setTagValuesError(true); }
    } catch { setTagValuesError(true); }
    finally { setTagValuesLoading(false); }
  };

  useEffect(() => {
    if (!socket || !isConnected) return;
    const handler = (data) => {
      if (data.tag_values && typeof data.tag_values === 'object') {
        setTagValues(prev => ({ ...prev, ...data.tag_values }));
        setTagValuesError(false); setTagValuesLoading(false);
      }
    };
    socket.on('live_tag_data', handler);
    socket.on('live_data', handler);
    socket.on('plc_data', handler);
    return () => { socket.off('live_tag_data', handler); socket.off('live_data', handler); socket.off('plc_data', handler); };
  }, [socket, isConnected]);

  useEffect(() => {
    if (tags.length === 0 || loading || (socket && isConnected)) return;
    let intervalId = null;
    const timeoutId = setTimeout(() => {
      loadTagValues(tags);
      intervalId = setInterval(() => loadTagValues(tags), 15000);
    }, 2000);
    return () => { clearTimeout(timeoutId); if (intervalId) clearInterval(intervalId); };
  }, [tags, loading, socket, isConnected]);

  const handleAdd = () => { setEditingTag(null); setShowForm(true); };
  const handleEdit = (tag) => { setEditingTag(tag); setShowForm(true); };
  const handleDelete = (tag) => { setDeleteConfirm({ tagName: tag.tag_name, displayName: tag.display_name || tag.tag_name }); };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await axios.delete(`/api/tags/${deleteConfirm.tagName}`);
      await loadTags();
      window.dispatchEvent(new Event('tagsUpdated'));
      setDeleteConfirm(null);
    } catch (e) {
      toast.error(t('tags.failedDelete') + ': ' + (e.response?.data?.message || e.message));
      setDeleteConfirm(null);
    }
  };

  const handleToggleActive = async (tag) => {
    try {
      await axios.put(`/api/tags/${tag.tag_name}`, { ...tag, is_active: !tag.is_active });
      await loadTags();
      window.dispatchEvent(new Event('tagsUpdated'));
    } catch (e) { toast.error(t('tags.failedUpdate') + ': ' + (e.response?.data?.message || e.message)); }
  };

  const handleSave = async (tagData) => {
    try {
      if (editingTag) await axios.put(`/api/tags/${editingTag.tag_name}`, tagData);
      else await axios.post('/api/tags', tagData);
      await loadTags();
      window.dispatchEvent(new Event('tagsUpdated'));
      setShowForm(false); setEditingTag(null);
    } catch (e) {
      toast.error(t('tags.failedSave') + ': ' + (e.response?.data?.message || e.response?.data?.error || e.message));
    }
  };

  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const handleExportJSON = async () => {
    try {
      setExportMenuOpen(false);
      const response = await axios.get('/api/tags/export');
      if (response.data.status === 'success') {
        const blob = new Blob([JSON.stringify({ tags: response.data.tags }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `tags_export_${new Date().toISOString().split('T')[0]}.json`;
        a.click(); URL.revokeObjectURL(url);
      }
    } catch (e) { toast.error(t('tags.failedExport') + ': ' + (e.response?.data?.message || e.message)); }
  };

  const handleExportCSV = async () => {
    try {
      setExportMenuOpen(false);
      const response = await axios.get('/api/tags/export-csv');
      if (response.data.status === 'success') {
        const blob = new Blob([response.data.csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `tags_export_${new Date().toISOString().split('T')[0]}.csv`;
        a.click(); URL.revokeObjectURL(url);
      }
    } catch (e) { toast.error(t('tags.failedExportCsv') + ': ' + (e.response?.data?.message || e.message)); }
  };

  const handleImport = async (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const csvFiles = files.filter(f => f.name.toLowerCase().endsWith('.csv'));
    const xlsxFiles = files.filter(f => f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls'));
    const jsonFiles = files.filter(f => f.name.toLowerCase().endsWith('.json'));

    const results = [];

    try {
      // Handle CSV files (PLC engineering format) via dedicated endpoint
      if (csvFiles.length > 0) {
        const formData = new FormData();
        csvFiles.forEach(f => formData.append('files', f));
        const res = await axios.post('/api/tags/import-plc-csv', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        if (res.data.status === 'success') {
          results.push(`CSV: imported ${res.data.imported} tags`);
        } else {
          results.push(`CSV: failed - ${res.data.message || 'Unknown error'}`);
        }
      }

      // Handle Excel files (PLC engineering format) via dedicated endpoint
      if (xlsxFiles.length > 0) {
        const formData = new FormData();
        xlsxFiles.forEach(f => formData.append('files', f));
        const res = await axios.post('/api/tags/import-plc-excel', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        if (res.data.status === 'success') {
          results.push(`Excel: imported ${res.data.imported} tags`);
        } else {
          results.push(`Excel: failed - ${res.data.message || 'Unknown error'}`);
        }
      }

      // Handle JSON files via existing bulk-import
      for (const file of jsonFiles) {
        try {
          const text = await file.text();
          const imported = JSON.parse(text);
          if (imported.tags && Array.isArray(imported.tags)) {
            const res = await axios.post('/api/tags/bulk-import', { tags: imported.tags });
            if (res.data.status === 'success') {
              results.push(`${file.name}: imported ${res.data.imported} tags`);
            }
          } else {
            results.push(`${file.name}: invalid JSON format`);
          }
        } catch (jsonErr) {
          results.push(`${file.name}: ${jsonErr.message}`);
        }
      }

      if (csvFiles.length > 0 || xlsxFiles.length > 0 || jsonFiles.length > 0) {
        await loadTags();
        window.dispatchEvent(new Event('tagsUpdated'));

        // Offer to create report drafts for PLC imports
        if (csvFiles.length > 0 || xlsxFiles.length > 0) {
          setDraftConfirm(true);
        }
      }

      if (results.length > 0) {
        const successes = results.filter(r => !r.startsWith('Error') && !r.includes('failed') && !r.includes('invalid'));
        const errors = results.filter(r => r.startsWith('Error') || r.includes('failed') || r.includes('invalid'));
        if (successes.length > 0) toast.success(successes.join('\n'), { style: { whiteSpace: 'pre-line' } });
        if (errors.length > 0) toast.error(errors.join('\n'), { autoClose: 8000, style: { whiteSpace: 'pre-line' } });
      }
    } catch (e) {
      toast.error('Error importing: ' + (e.response?.data?.message || e.message));
    }

    event.target.value = '';
  };

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortOrder('asc'); }
  };

  const SortArrow = ({ field }) => sortBy === field ? <span className="ml-1 text-brand">{sortOrder === 'asc' ? '↑' : '↓'}</span> : null;

  const sourceColors = {
    PLC: 'bg-brand-subtle text-brand dark:bg-[#0f2840] dark:text-brand',
    Formula: 'bg-[#ecfdf5] text-[#059669] dark:bg-[#0d2e1f] dark:text-[#34d399]',
    Mapping: 'bg-[#f1f5f9] text-[#475569] dark:bg-[#1e293b] dark:text-[#94a3b8]',
    Manual: 'bg-[#f5f5f4] text-[#57534e] dark:bg-[#1c1917] dark:text-[#a8a29e]',
  };

  const handleCreateDrafts = async () => {
    setDraftConfirm(false);
    try {
      const draftRes = await axios.post('/api/tags/generate-report-drafts', {});
      if (draftRes.data.status === 'success' && draftRes.data.templates?.length > 0) {
        let created = 0;
        for (const tpl of draftRes.data.templates) {
          try {
            await axios.post('/api/report-builder/templates', {
              name: tpl.name,
              description: tpl.description || '',
              layout_config: tpl.layout_config || { widgets: [], grid: { cols: 12, rowHeight: 60 } },
            });
            created++;
          } catch { /* skip duplicates */ }
        }
        if (created > 0) toast.success(`Created ${created} report draft(s)`);
        else toast.info('Report drafts already exist');
      }
    } catch (e) { toast.error(`Failed to create drafts: ${e.message}`); }
  };

  const totalPages = Math.max(1, Math.ceil(filteredTags.length / PAGE_SIZE));
  const start = (page - 1) * PAGE_SIZE;
  const paginatedTags = filteredTags.slice(start, start + PAGE_SIZE);

  return (
    <div className="p-5">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">{t('tags.title')}</h2>
          <p className="text-[11px] text-[#8898aa] mt-0.5">{t('tags.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] text-[#3a4a5c] dark:text-[#c1ccd9] bg-white dark:bg-[#131b2d] hover:bg-[#f5f8fb] dark:hover:bg-[#1a2840] cursor-pointer transition-colors">
            <FaUpload size={11} /> {t('tags.import')}
            <input type="file" accept=".json,.csv,.xlsx,.xls" multiple onChange={handleImport} className="hidden" />
          </label>
          <div className="relative">
            <button onClick={() => setExportMenuOpen(!exportMenuOpen)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] text-[#3a4a5c] dark:text-[#c1ccd9] bg-white dark:bg-[#131b2d] hover:bg-[#f5f8fb] dark:hover:bg-[#1a2840] transition-colors">
              <FaDownload size={11} /> {t('tags.export')}
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-[#131b2d] border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg shadow-lg z-20 min-w-[140px]">
                <button onClick={handleExportJSON} className="w-full text-left px-3 py-2 text-[11px] text-[#3a4a5c] dark:text-[#c1ccd9] hover:bg-[#f5f8fb] dark:hover:bg-[#1a2840] rounded-t-lg transition-colors">
                  {t('tags.exportJson')}
                </button>
                <button onClick={handleExportCSV} className="w-full text-left px-3 py-2 text-[11px] text-[#3a4a5c] dark:text-[#c1ccd9] hover:bg-[#f5f8fb] dark:hover:bg-[#1a2840] rounded-b-lg transition-colors">
                  {t('tags.exportCsv')}
                </button>
              </div>
            )}
          </div>
          <button onClick={handleAdd} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors">
            <FaPlus size={11} /> {t('tags.addTag')}
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8898aa]" size={12} />
          <input
            type="text"
            placeholder={t('tags.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] text-[#3a4a5c] dark:text-[#c1ccd9] placeholder-[#8898aa] focus:outline-none focus:border-brand focus:ring-1 focus:ring-[#0e74904d] transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <FaFilter className="text-[#8898aa]" size={11} />
          <select
            value={sourceTypeFilter}
            onChange={(e) => setSourceTypeFilter(e.target.value)}
            className="px-3 py-2 text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] text-[#3a4a5c] dark:text-[#c1ccd9] focus:outline-none focus:border-brand transition-colors"
          >
            <option value="all">{t('tags.allTypes')}</option>
            <option value="PLC">PLC</option>
            <option value="Formula">Formula</option>
            <option value="Mapping">Mapping</option>
            <option value="Manual">Manual</option>
          </select>
        </div>
        <span className="text-[11px] text-[#8898aa] ml-auto">{filteredTags.length} {t('tags.tagsCount')}</span>
      </div>

      {/* ── Table ── */}
      <div className="border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#f5f8fb] dark:bg-[#0d1825] border-b border-[#e3e9f0] dark:border-[#1e2d40]">
                {[
                  { key: 'tag_name', label: t('tags.tagName') },
                  { key: 'display_name', label: t('tags.displayName') },
                  { key: 'source_type', label: t('tags.source') },
                ].map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)} className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#6b7f94] uppercase tracking-wide cursor-pointer hover:text-[#3a4a5c] dark:hover:text-[#c1ccd9] select-none transition-colors">
                    {col.label}<SortArrow field={col.key} />
                  </th>
                ))}
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#6b7f94] uppercase tracking-wide">{t('tags.addressFormula')}</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#6b7f94] uppercase tracking-wide">{t('tags.dataType')}</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#6b7f94] uppercase tracking-wide">{t('common.unit')}</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[#6b7f94] uppercase tracking-wide">{t('tags.value')}</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-[#6b7f94] uppercase tracking-wide w-20">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e3e9f0] dark:divide-[#1e2d40]">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-4 py-10 text-center text-[#8898aa]">
                    <FaSpinner className="animate-spin inline mr-2" size={14} />{t('tags.loadingTags')}
                  </td>
                </tr>
              ) : filteredTags.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-10 text-center text-[#8898aa]">
                    {tags.length === 0 ? t('tags.noTags') : t('tags.noMatch')}
                  </td>
                </tr>
              ) : (
                paginatedTags.map((tag) => (
                  <tr key={tag.id} className="hover:bg-[#f9fbfd] dark:hover:bg-[#111d2e] transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[#2a3545] dark:text-[#e1e8f0]">{tag.tag_name}</td>
                    <td className="px-4 py-2.5 text-[#6b7f94]">{tag.display_name || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${sourceColors[tag.source_type] || sourceColors.Manual}`}>
                        {tag.source_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[#6b7f94] font-mono text-[11px]">
                      {tag.source_type === 'PLC' ? tag.plc_address :
                       tag.source_type === 'Formula' ? (tag.formula || '—').substring(0, 30) + (tag.formula?.length > 30 ? '…' : '') :
                       tag.source_type === 'Mapping' ? tag.mapping_name || '—' : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[#6b7f94]">{tag.data_type || '—'}</td>
                    <td className="px-4 py-2.5 text-[#6b7f94]">{tag.unit || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px]">
                      {['PLC', 'Manual', 'Formula'].includes(tag.source_type) && tag.is_active ? (
                        tagValues[tag.tag_name] != null
                          ? <span className="text-[#059669] dark:text-[#34d399]">{typeof tagValues[tag.tag_name] === 'number' ? tagValues[tag.tag_name].toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(tagValues[tag.tag_name])}{tag.unit ? ` ${tag.unit}` : ''}</span>
                          : tagValuesError && !tagValuesLoading
                            ? <span className="text-[#dc2626] italic">{t('tags.error')}</span>
                            : <span className="text-[#8898aa] italic">Loading…</span>
                      ) : <span className="text-[#8898aa]">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => handleEdit(tag)} className="p-1.5 rounded-md text-[#6b7f94] hover:text-brand hover:bg-brand-subtle dark:hover:bg-[#0f2840] transition-colors" title={t('common.edit')}>
                          <FaEdit size={13} />
                        </button>
                        <button onClick={() => handleDelete(tag)} className="p-1.5 rounded-md text-[#6b7f94] hover:text-[#dc2626] hover:bg-[#fef2f2] dark:hover:bg-[#2a1215] transition-colors" title={t('common.delete')}>
                          <FaTrash size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ── */}
      {filteredTags.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 px-1">
          <span className="text-[11px] text-[#8898aa]">
            {t('tags.showing')} {start + 1}–{Math.min(start + PAGE_SIZE, filteredTags.length)} {t('tags.of')} {filteredTags.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2.5 py-1.5 text-[11px] font-medium rounded border border-[#e3e9f0] dark:border-[#1e2d40] text-[#3a4a5c] dark:text-[#c1ccd9] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f5f8fb] dark:hover:bg-[#1a2840] transition-colors"
            >
              {t('tags.previous')}
            </button>
            <span className="px-2 text-[11px] text-[#6b7f94]">
              {t('tags.page')} {page} {t('tags.of')} {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2.5 py-1.5 text-[11px] font-medium rounded border border-[#e3e9f0] dark:border-[#1e2d40] text-[#3a4a5c] dark:text-[#c1ccd9] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#f5f8fb] dark:hover:bg-[#1a2840] transition-colors"
            >
              {t('tags.next')}
            </button>
          </div>
        </div>
      )}

      {/* ── Tag Form Modal ── */}
      {showForm && (
        <TagForm
          tag={editingTag}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingTag(null); }}
        />
      )}

      {/* ── Delete Confirmation ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#131b2d] rounded-xl p-6 w-full max-w-sm shadow-xl border border-[#e3e9f0] dark:border-[#1e2d40]">
            <div className="flex items-center justify-center mb-4">
              <div className="w-10 h-10 rounded-full bg-[#fef2f2] dark:bg-[#2a1215] flex items-center justify-center">
                <FaTrash className="text-[#dc2626]" size={14} />
              </div>
            </div>
            <div className="text-center mb-5">
              <h3 className="text-[13px] font-semibold text-[#2a3545] dark:text-[#e1e8f0] mb-1">{t('tags.deleteTag')}</h3>
              <p className="text-[11px] text-[#6b7f94]">
                {t('tags.deleteTagConfirm')} <span className="font-medium text-[#2a3545] dark:text-[#e1e8f0]">"{deleteConfirm.displayName}"</span>?
                <span className="block mt-1.5 text-[#dc2626]">{t('tags.deleteTagWarning')}</span>
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 text-[11px] font-medium rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#131b2d] transition-colors">
                {t('common.cancel')}
              </button>
              <button onClick={confirmDelete} className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white transition-colors inline-flex items-center gap-1.5">
                <FaTrash size={10} /> {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Report Drafts Confirmation ── */}
      <ConfirmationModal
        isOpen={draftConfirm}
        title={t('tags.createDrafts')}
        description={t('tags.createDraftsDesc')}
        onConfirm={handleCreateDrafts}
        onCancel={() => setDraftConfirm(false)}
        confirmText={t('tags.createDraftsBtn')}
        confirmColor="brand"
      />
    </div>
  );
};

export default TagManager;
