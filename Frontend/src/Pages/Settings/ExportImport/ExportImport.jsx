import React, { useState } from 'react';
import { useLenisScroll } from '../../../Hooks/useLenisScroll';
import { useLanguage } from '../../../Hooks/useLanguage';
import { FaDownload, FaUpload, FaFileExport, FaFileImport, FaSpinner } from 'react-icons/fa';
import axios from '../../../API/axios';
import { toast } from 'react-toastify';
import ConfirmationModal from '../../../Components/Common/ConfirmationModal';

const ExportImport = () => {
  useLenisScroll();
  const { t } = useLanguage();

  const SECTIONS = [
    { key: 'tags',               label: t('exportImport.tags'),              csvExport: true },
    { key: 'tag_groups',         label: t('exportImport.tagGroups')          },
    { key: 'mappings',           label: t('exportImport.mappingsLabel')      },
    { key: 'formulas',           label: t('exportImport.formulasLabel')      },
    { key: 'reports',            label: t('exportImport.reportConfigs')      },
    { key: 'report_templates',   label: t('exportImport.reportTemplates')    },
    { key: 'shifts',             label: t('exportImport.shiftsLabel')        },
    { key: 'smtp',               label: t('exportImport.smtpEmail')          },
    { key: 'distribution_rules', label: t('exportImport.distributionRules')  },
  ];

  const ALL_KEYS = SECTIONS.map(s => s.key);

  // Export state
  const [exportKeys, setExportKeys] = useState(new Set(ALL_KEYS));
  const [exportCsvTags, setExportCsvTags] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Import state
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importSections, setImportSections] = useState(new Set());
  const [csvFiles, setCsvFiles] = useState([]);
  const [xlsxFiles, setXlsxFiles] = useState([]);
  const [importCsv, setImportCsv] = useState(true);
  const [importXlsx, setImportXlsx] = useState(true);
  const [importing, setImporting] = useState(false);
  const [createReportDrafts, setCreateReportDrafts] = useState(false);
  const [importFileName, setImportFileName] = useState('');

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState({ open: false, title: '', description: '', onConfirm: null, confirmText: '', confirmColor: 'brand' });

  // ─── Toggle helpers ───
  const toggleExportKey = (key) => {
    setExportKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleImportSection = (key) => {
    setImportSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const selectAllExport = () => setExportKeys(new Set(ALL_KEYS));
  const selectNoneExport = () => setExportKeys(new Set());

  // ─── Helpers ───
  const downloadBlob = (content, filename, type = 'application/json') => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dateSuffix = () => new Date().toISOString().split('T')[0];

  // ─── Fetch helpers ───
  const fetchTags = async () => { try { return (await axios.get('/api/tags')).data?.tags || []; } catch { return []; } };
  const fetchTagGroups = async () => { try { return (await axios.get('/api/tag-groups')).data?.groups || []; } catch { return []; } };
  const fetchMappings = async () => { try { return (await axios.get('/api/mappings')).data?.mappings || []; } catch { return []; } };
  const fetchFormulas = () => { try { return JSON.parse(localStorage.getItem('system_saved_formulas') || '[]'); } catch { return []; } };
  const fetchReports = () => { try { return JSON.parse(localStorage.getItem('dynamicReportConfigs') || '[]'); } catch { return []; } };
  const fetchReportTemplates = async () => { try { return (await axios.get('/api/report-builder/templates')).data?.templates || []; } catch { return []; } };
  const fetchShifts = async () => { try { return (await axios.get('/api/settings/shifts')).data || null; } catch { return null; } };
  const fetchSmtp = async () => { try { return (await axios.get('/api/settings/smtp-config')).data || null; } catch { return null; } };
  const fetchDistributionRules = async () => { try { return (await axios.get('/api/distribution/rules')).data?.rules || []; } catch { return []; } };

  // ─── EXPORT ───
  const handleExport = async () => {
    if (exportKeys.size === 0 && !exportCsvTags) return;
    setExporting(true);

    try {
      if (exportCsvTags && exportKeys.size === 0) {
        const res = await axios.get('/api/tags/export-csv');
        if (res.data.status === 'success') {
          downloadBlob(res.data.csv, `tags_export_${dateSuffix()}.csv`, 'text/csv');
          toast.success('CSV exported successfully');
        }
        setExporting(false);
        return;
      }

      if (exportCsvTags) {
        try {
          const res = await axios.get('/api/tags/export-csv');
          if (res.data.status === 'success') {
            downloadBlob(res.data.csv, `tags_export_${dateSuffix()}.csv`, 'text/csv');
          }
        } catch { /* skip csv */ }
      }

      if (exportKeys.size > 0) {
        const data = {};
        const sel = exportKeys;

        if (sel.has('tags'))               data.tags = await fetchTags();
        if (sel.has('tag_groups'))          data.tag_groups = await fetchTagGroups();
        if (sel.has('mappings'))            data.mappings = await fetchMappings();
        if (sel.has('formulas'))            data.formulas = fetchFormulas();
        if (sel.has('reports'))             data.reports = fetchReports();
        if (sel.has('report_templates'))    data.report_templates = await fetchReportTemplates();
        if (sel.has('shifts'))              { const s = await fetchShifts(); if (s) data.shifts = s; }
        if (sel.has('smtp'))               { const s = await fetchSmtp(); if (s) data.smtp = s; }
        if (sel.has('distribution_rules'))  data.distribution_rules = await fetchDistributionRules();

        data.export_version = '2.0';
        data.export_date = new Date().toISOString();
        data.export_sections = [...sel];

        const label = sel.size === ALL_KEYS.length ? 'full' : [...sel].join('+');
        downloadBlob(JSON.stringify(data, null, 2), `hercules_export_${label}_${dateSuffix()}.json`);
        toast.success(`Exported ${sel.size} section(s)`);
      }
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    }
    setExporting(false);
  };

  // ─── IMPORT FILE SELECTION ───
  const handleImportFile = (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    const csv = files.filter(f => f.name.toLowerCase().endsWith('.csv'));
    const xlsx = files.filter(f => f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls'));
    const json = files.filter(f => f.name.toLowerCase().endsWith('.json'));

    setCsvFiles(csv);
    setXlsxFiles(xlsx);
    setImportCsv(csv.length > 0);
    setImportXlsx(xlsx.length > 0);

    if (json.length > 0) {
      const file = json[0];
      setImportFileName([file.name, ...csv.map(f => f.name), ...xlsx.map(f => f.name)].join(', '));
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target.result);
          setImportPreview(imported);
          setImportFile(imported);
          const available = new Set();
          SECTIONS.forEach(s => { if (imported[s.key]) available.add(s.key); });
          setImportSections(available);
        } catch (err) {
          toast.error('Error reading JSON file: ' + err.message);
        }
      };
      reader.readAsText(file);
    } else if (csv.length > 0 || xlsx.length > 0) {
      setImportFileName([...csv, ...xlsx].map(f => f.name).join(', '));
      setImportPreview(null);
      setImportFile(null);
      setImportSections(new Set());
    }

    event.target.value = '';
  };

  // ─── IMPORT EXECUTION ───
  const executeImport = async () => {
    setConfirmModal(m => ({ ...m, open: false }));
    setImporting(true);
    const results = [];

    try {
      if (csvFiles.length > 0 && importCsv) {
        try {
          const formData = new FormData();
          csvFiles.forEach(f => formData.append('files', f));
          const res = await axios.post('/api/tags/import-plc-csv', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          if (res.data.status === 'success') {
            results.push({ type: 'success', msg: `Tags (CSV): imported ${res.data.imported}` });
          } else {
            results.push({ type: 'error', msg: `Tags (CSV): ${res.data.message}` });
          }
          window.dispatchEvent(new Event('tagsUpdated'));
        } catch (e) {
          results.push({ type: 'error', msg: `Tags (CSV): ${e.response?.data?.message || e.message}` });
        }
      }

      if (xlsxFiles.length > 0 && importXlsx) {
        try {
          const formData = new FormData();
          xlsxFiles.forEach(f => formData.append('files', f));
          const res = await axios.post('/api/tags/import-plc-excel', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          if (res.data.status === 'success') {
            results.push({ type: 'success', msg: `Tags (Excel): imported ${res.data.imported}` });
          } else {
            results.push({ type: 'error', msg: `Tags (Excel): ${res.data.message}` });
          }
          window.dispatchEvent(new Event('tagsUpdated'));
        } catch (e) {
          results.push({ type: 'error', msg: `Tags (Excel): ${e.response?.data?.message || e.message}` });
        }
      }

      if (importFile) {
        const sel = importSections;

        if (sel.has('tags') && importFile.tags && Array.isArray(importFile.tags)) {
          try {
            const res = await axios.post('/api/tags/bulk-import', { tags: importFile.tags });
            results.push({ type: 'success', msg: `Tags: imported ${res.data.imported || 0}` });
            window.dispatchEvent(new Event('tagsUpdated'));
          } catch (e) { results.push({ type: 'error', msg: `Tags: ${e.response?.data?.message || e.message}` }); }
        }

        if (sel.has('tag_groups') && importFile.tag_groups && Array.isArray(importFile.tag_groups)) {
          try {
            let count = 0;
            for (const group of importFile.tag_groups) {
              try { await axios.post('/api/tag-groups', group); count++; }
              catch { try { await axios.put(`/api/tag-groups/${group.id || group.group_name}`, group); count++; } catch { /* skip */ } }
            }
            results.push({ type: 'success', msg: `Tag Groups: imported ${count}` });
            window.dispatchEvent(new Event('tagGroupsUpdated'));
          } catch (e) { results.push({ type: 'error', msg: `Tag Groups: ${e.message}` }); }
        }

        if (sel.has('mappings') && importFile.mappings) {
          try {
            const arr = Array.isArray(importFile.mappings) ? importFile.mappings : importFile.mappings.mappings || [];
            await axios.post('/api/mappings/migrate-from-local', arr);
            results.push({ type: 'success', msg: `Mappings: imported ${arr.length}` });
            window.dispatchEvent(new Event('mappingsUpdated'));
          } catch (e) { results.push({ type: 'error', msg: `Mappings: ${e.message}` }); }
        }

        if (sel.has('formulas') && importFile.formulas && Array.isArray(importFile.formulas)) {
          localStorage.setItem('system_saved_formulas', JSON.stringify(importFile.formulas));
          results.push({ type: 'success', msg: `Formulas: imported ${importFile.formulas.length}` });
          window.dispatchEvent(new Event('formulasUpdated'));
        }

        if (sel.has('reports') && importFile.reports) {
          const arr = Array.isArray(importFile.reports) ? importFile.reports : [];
          localStorage.setItem('dynamicReportConfigs', JSON.stringify(arr));
          results.push({ type: 'success', msg: `Report Configs: imported ${arr.length}` });
          window.dispatchEvent(new Event('reportConfigUpdated'));
        }

        if (sel.has('report_templates') && importFile.report_templates && Array.isArray(importFile.report_templates)) {
          try {
            let count = 0;
            for (const tpl of importFile.report_templates) {
              const payload = { ...tpl, status: 'released' };
              try { await axios.post('/api/report-builder/templates', payload); count++; }
              catch { try { await axios.put(`/api/report-builder/templates/${tpl.id}`, payload); count++; } catch { /* skip */ } }
            }
            results.push({ type: 'success', msg: `Report Templates: imported ${count}` });
          } catch (e) { results.push({ type: 'error', msg: `Report Templates: ${e.message}` }); }
        }

        if (sel.has('shifts') && importFile.shifts) {
          try { await axios.post('/api/settings/shifts', importFile.shifts); results.push({ type: 'success', msg: 'Shifts: imported' }); }
          catch (e) { results.push({ type: 'error', msg: `Shifts: ${e.message}` }); }
        }

        if (sel.has('smtp') && importFile.smtp) {
          try { await axios.post('/api/settings/smtp-config', importFile.smtp); results.push({ type: 'success', msg: 'SMTP Config: imported' }); }
          catch (e) { results.push({ type: 'error', msg: `SMTP Config: ${e.message}` }); }
        }

        if (sel.has('distribution_rules') && importFile.distribution_rules && Array.isArray(importFile.distribution_rules)) {
          try {
            let count = 0;
            for (const rule of importFile.distribution_rules) {
              try { await axios.post('/api/distribution/rules', rule); count++; }
              catch { try { await axios.put(`/api/distribution/rules/${rule.id}`, rule); count++; } catch { /* skip */ } }
            }
            results.push({ type: 'success', msg: `Distribution Rules: imported ${count}` });
          } catch (e) { results.push({ type: 'error', msg: `Distribution Rules: ${e.message}` }); }
        }
      }

      // Generate report drafts if requested
      if (createReportDrafts && (csvFiles.length > 0 || xlsxFiles.length > 0)) {
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
            results.push({ type: 'success', msg: `Report Drafts: created ${created}` });
          }
        } catch (e) {
          results.push({ type: 'error', msg: `Report Drafts: ${e.message}` });
        }
      }

      // Show toast notifications for results
      const successes = results.filter(r => r.type === 'success');
      const errors = results.filter(r => r.type === 'error');

      if (successes.length > 0) {
        toast.success(successes.map(r => r.msg).join('\n'), { style: { whiteSpace: 'pre-line' } });
      }
      if (errors.length > 0) {
        toast.error(errors.map(r => r.msg).join('\n'), { autoClose: 8000, style: { whiteSpace: 'pre-line' } });
      }

      setImportFile(null);
      setImportPreview(null);
      setImportSections(new Set());
      setCsvFiles([]);
      setXlsxFiles([]);
      setImportCsv(false);
      setImportXlsx(false);
      setCreateReportDrafts(false);
      setImportFileName('');
    } catch (err) {
      toast.error('Import failed: ' + err.message);
    }
    setImporting(false);
  };

  const handleImport = () => {
    if (!importFile && csvFiles.length === 0 && xlsxFiles.length === 0) {
      toast.warning(t('exportImport.selectFileFirst'));
      return;
    }
    if (importSections.size === 0 && !(csvFiles.length > 0 && importCsv) && !(xlsxFiles.length > 0 && importXlsx)) {
      toast.warning(t('exportImport.selectSection'));
      return;
    }

    // Count what's selected
    const parts = [];
    if (csvFiles.length > 0 && importCsv) parts.push(`${csvFiles.length} CSV file(s)`);
    if (xlsxFiles.length > 0 && importXlsx) parts.push(`${xlsxFiles.length} Excel file(s)`);
    if (importSections.size > 0) parts.push(`${importSections.size} section(s)`);
    if (createReportDrafts) parts.push('report drafts');

    setConfirmModal({
      open: true,
      title: t('exportImport.importConfig'),
      description: `This will import: ${parts.join(', ')}.\n\nExisting items with the same name will be updated. Continue?`,
      onConfirm: executeImport,
      confirmText: t('exportImport.import'),
      confirmColor: 'green',
    });
  };

  const handleClear = () => {
    setImportFile(null);
    setImportPreview(null);
    setImportSections(new Set());
    setCsvFiles([]);
    setXlsxFiles([]);
    setImportCsv(false);
    setImportXlsx(false);
    setImportFileName('');
  };

  // ─── Checkbox style helper ───
  const cbClass = 'w-3.5 h-3.5 rounded border-[#cdd8e4] dark:border-[#2a3a50] text-brand focus:ring-brand/30 focus:ring-offset-0 cursor-pointer accent-[#0e7490]';
  const lblClass = 'text-[12px] text-[#3a4a5c] dark:text-[#c1ccd9] select-none cursor-pointer';

  // ─── Available import sections from file ───
  const availableImportSections = importFile
    ? SECTIONS.filter(s => importFile[s.key])
    : [];

  return (
    <div className="p-5 min-h-full bg-transparent">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">
          {t('exportImport.title')}
        </h2>
        <p className="text-[11px] text-[#8898aa] mt-1">
          {t('exportImport.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Export Section ── */}
        <div className="bg-white dark:bg-[#131b2d] border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <FaFileExport className="text-brand text-[14px]" />
            <h3 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">
              {t('exportImport.export')}
            </h3>
          </div>

          <p className="text-[11px] text-[#8898aa] mb-3">{t('exportImport.selectSections')}</p>

          <div className="flex items-center gap-3 mb-2">
            <button onClick={selectAllExport} className="text-[10px] text-brand hover:underline">{t('exportImport.selectAll')}</button>
            <button onClick={selectNoneExport} className="text-[10px] text-[#8898aa] hover:underline">{t('exportImport.clearAll')}</button>
          </div>

          <div className="space-y-1.5 mb-4">
            {SECTIONS.map(s => (
              <label key={s.key} className="flex items-center gap-2">
                <input type="checkbox" checked={exportKeys.has(s.key)} onChange={() => toggleExportKey(s.key)} className={cbClass} />
                <span className={lblClass}>{s.label}</span>
              </label>
            ))}

            <div className="border-t border-[#e3e9f0] dark:border-[#1e2d40] pt-1.5 mt-1.5">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={exportCsvTags} onChange={() => setExportCsvTags(!exportCsvTags)} className={cbClass} />
                <span className={lblClass}>{t('exportImport.tagsAsCsv')}</span>
                <span className="text-[10px] text-[#8898aa]">{t('exportImport.separateFile')}</span>
              </label>
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting || (exportKeys.size === 0 && !exportCsvTags)}
            className="w-full bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-medium rounded-lg px-3 py-1.5 flex items-center justify-center gap-2 transition-colors"
          >
            {exporting ? <FaSpinner className="animate-spin text-[11px]" /> : <FaDownload className="text-[11px]" />}
            {exporting ? t('exportImport.exporting') : `${exportKeys.size > 0 ? t('exportImport.exportJson') : ''}${exportCsvTags ? (exportKeys.size > 0 ? ' + ' + t('exportImport.exportCsv') : t('exportImport.exportCsv')) : ''}`}
          </button>
        </div>

        {/* ── Import Section ── */}
        <div className="bg-white dark:bg-[#131b2d] border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <FaFileImport className="text-[#059669] text-[14px]" />
            <h3 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">
              {t('exportImport.import')}
            </h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-[#6b7f94] mb-1.5 block">
                {t('exportImport.selectFiles')}
              </label>
              <label className="w-full px-3 py-2.5 bg-[#f5f8fb] dark:bg-[#081320] hover:bg-[#edf2f7] dark:hover:bg-[#131b2d] text-[#6b7f94] text-[12px] font-medium rounded-lg flex items-center justify-center gap-2 cursor-pointer border-2 border-dashed border-[#e3e9f0] dark:border-[#1e2d40] transition-colors">
                <FaUpload className="text-[12px]" />
                {importFileName || t('exportImport.chooseFiles')}
                <input type="file" accept=".json,.csv,.xlsx,.xls" multiple onChange={handleImportFile} className="hidden" />
              </label>
            </div>

            {(availableImportSections.length > 0 || csvFiles.length > 0 || xlsxFiles.length > 0) && (
              <div className="bg-[#f0f7ff] dark:bg-[#1a2a3e] border border-[#c4d8ef] dark:border-[#1e2d40] rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[12px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">
                    {t('exportImport.selectSectionsImport')}
                  </h4>
                  <button onClick={handleClear} className="text-[10px] text-[#8898aa] hover:text-[#dc2626] transition-colors">
                    {t('exportImport.clear')}
                  </button>
                </div>

                <div className="space-y-1.5">
                  {csvFiles.length > 0 && (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={importCsv} onChange={() => setImportCsv(!importCsv)} className={cbClass} />
                      <span className={lblClass}>{t('exportImport.plcTagsCsv')}</span>
                      <span className="text-[10px] text-[#8898aa]">({csvFiles.length} {csvFiles.length > 1 ? t('exportImport.files') : t('exportImport.file')})</span>
                    </label>
                  )}

                  {xlsxFiles.length > 0 && (
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={importXlsx} onChange={() => setImportXlsx(!importXlsx)} className={cbClass} />
                      <span className={lblClass}>{t('exportImport.plcTagsExcel')}</span>
                      <span className="text-[10px] text-[#8898aa]">({xlsxFiles.length} {xlsxFiles.length > 1 ? t('exportImport.files') : t('exportImport.file')})</span>
                    </label>
                  )}

                  {(csvFiles.length > 0 || xlsxFiles.length > 0) && (
                    <label className="flex items-center gap-2 border-t border-[#e3e9f0] dark:border-[#1e2d40] pt-1.5 mt-1">
                      <input type="checkbox" checked={createReportDrafts} onChange={() => setCreateReportDrafts(!createReportDrafts)} className={cbClass} />
                      <span className={lblClass}>{t('exportImport.createReportDrafts')}</span>
                      <span className="text-[10px] text-[#8898aa]">{t('exportImport.oneTablePerDb')}</span>
                    </label>
                  )}

                  {availableImportSections.map(s => {
                    const raw = importFile[s.key];
                    const count = Array.isArray(raw) ? raw.length : (raw ? 1 : 0);
                    return (
                      <label key={s.key} className="flex items-center gap-2">
                        <input type="checkbox" checked={importSections.has(s.key)} onChange={() => toggleImportSection(s.key)} className={cbClass} />
                        <span className={lblClass}>{s.label}</span>
                        <span className="text-[10px] text-[#8898aa]">({count})</span>
                      </label>
                    );
                  })}
                </div>

                {importPreview?.export_date && (
                  <p className="text-[10px] text-[#6b7f94] mt-3">
                    Exported: {new Date(importPreview.export_date).toLocaleString()}
                    {importPreview.export_version ? ` (v${importPreview.export_version})` : ''}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={importing || (importSections.size === 0 && !(csvFiles.length > 0 && importCsv) && !(xlsxFiles.length > 0 && importXlsx))}
              className="w-full bg-[#059669] hover:bg-[#047857] disabled:bg-[#e3e9f0] disabled:text-[#8898aa] disabled:cursor-not-allowed text-white text-[11px] font-medium rounded-lg px-3 py-1.5 flex items-center justify-center gap-2 transition-colors"
            >
              {importing ? <FaSpinner className="animate-spin text-[11px]" /> : <FaUpload className="text-[11px]" />}
              {importing ? t('exportImport.importing') : t('exportImport.importSelected')}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.open}
        title={confirmModal.title}
        description={confirmModal.description}
        onConfirm={confirmModal.onConfirm || (() => {})}
        onCancel={() => setConfirmModal(m => ({ ...m, open: false }))}
        confirmText={confirmModal.confirmText}
        confirmColor={confirmModal.confirmColor}
      />
    </div>
  );
};

export default ExportImport;
