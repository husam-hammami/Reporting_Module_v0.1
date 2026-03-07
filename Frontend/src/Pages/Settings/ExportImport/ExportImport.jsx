import React, { useState } from 'react';
import { useLenisScroll } from '../../../Hooks/useLenisScroll';
import { FaDownload, FaUpload, FaFileExport, FaFileImport } from 'react-icons/fa';

const ExportImport = () => {
  useLenisScroll();
  const [exportType, setExportType] = useState('full');
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);

  const handleExport = () => {
    const data = {};

    if (exportType === 'full' || exportType === 'tags') {
      const tags = localStorage.getItem('system_tags');
      if (tags) data.tags = JSON.parse(tags);
    }

    if (exportType === 'full' || exportType === 'tag_groups') {
      const tagGroups = localStorage.getItem('system_tag_groups');
      if (tagGroups) data.tag_groups = JSON.parse(tagGroups);
    }

    if (exportType === 'full' || exportType === 'mappings') {
      const mappings = localStorage.getItem('system_mappings');
      if (mappings) data.mappings = JSON.parse(mappings);
    }

    if (exportType === 'full' || exportType === 'reports') {
      const reports = localStorage.getItem('dynamicReportConfigs');
      if (reports) data.reports = JSON.parse(reports);
    }

    data.export_version = '1.0';
    data.export_date = new Date().toISOString();
    data.export_type = exportType;

    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hercules_export_${exportType}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        setImportPreview(imported);
        setImportFile(imported);
      } catch (err) {
        alert('Error reading file: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!importFile) {
      alert('Please select a file first');
      return;
    }

    if (!window.confirm('This will import configurations. Continue?')) {
      return;
    }

    try {
      if (importFile.tags) {
        localStorage.setItem('system_tags', JSON.stringify(importFile.tags));
        window.dispatchEvent(new Event('tagsUpdated'));
      }

      if (importFile.tag_groups) {
        localStorage.setItem('system_tag_groups', JSON.stringify(importFile.tag_groups));
        window.dispatchEvent(new Event('tagGroupsUpdated'));
      }

      if (importFile.mappings) {
        localStorage.setItem('system_mappings', JSON.stringify(importFile.mappings));
        window.dispatchEvent(new Event('mappingsUpdated'));
      }

      if (importFile.reports) {
        localStorage.setItem('dynamicReportConfigs', JSON.stringify(importFile.reports));
        window.dispatchEvent(new Event('reportConfigUpdated'));
      }

      alert('Import completed successfully!');
      setImportFile(null);
      setImportPreview(null);
    } catch (err) {
      alert('Error importing: ' + err.message);
    }
  };

  return (
    <div className="p-5 min-h-full bg-transparent">
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">
          Export / Import Configuration
        </h2>
        <p className="text-[11px] text-[#8898aa] mt-1">
          Export configurations for backup or import from another system
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Export Section */}
        <div className="bg-white dark:bg-[#131b2d] border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <FaFileExport className="text-brand text-[14px]" />
            <h3 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">
              Export Configuration
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-medium text-[#6b7f94] mb-1.5 block">
                Export Type
              </label>
              <select
                value={exportType}
                onChange={(e) => setExportType(e.target.value)}
                className="w-full text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] text-[#3a4a5c] dark:text-[#c1ccd9] focus:border-brand focus:ring-1 focus:ring-[#0e74904d] px-3 py-2 outline-none transition-colors"
              >
                <option value="full">Full System</option>
                <option value="tags">Tags Only</option>
                <option value="tag_groups">Tag Groups Only</option>
                <option value="mappings">Mappings Only</option>
                <option value="reports">Reports Only</option>
              </select>
            </div>

            <button
              onClick={handleExport}
              className="w-full bg-brand hover:bg-brand-hover text-white text-[11px] font-medium rounded-lg px-3 py-1.5 flex items-center justify-center gap-2 transition-colors"
            >
              <FaDownload className="text-[11px]" />
              Export Configuration
            </button>
          </div>
        </div>

        {/* Import Section */}
        <div className="bg-white dark:bg-[#131b2d] border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <FaFileImport className="text-[#059669] text-[14px]" />
            <h3 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">
              Import Configuration
            </h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-medium text-[#6b7f94] mb-1.5 block">
                Select JSON File
              </label>
              <label className="w-full px-3 py-2.5 bg-[#f5f8fb] dark:bg-[#0b111e] hover:bg-[#edf2f7] dark:hover:bg-[#131b2d] text-[#6b7f94] text-[12px] font-medium rounded-lg flex items-center justify-center gap-2 cursor-pointer border-2 border-dashed border-[#e3e9f0] dark:border-[#1e2d40] transition-colors">
                <FaUpload className="text-[12px]" />
                Choose File
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </label>
            </div>

            {importPreview && (
              <div className="bg-[#f0f7ff] dark:bg-[#1a2a3e] border border-[#c4d8ef] dark:border-[#1e2d40] rounded-lg p-4">
                <h4 className="text-[12px] font-bold text-[#2a3545] dark:text-[#e1e8f0] mb-2">
                  Import Preview
                </h4>
                <ul className="text-[12px] text-[#3a4a5c] dark:text-[#c1ccd9] space-y-1">
                  {importPreview.tags && (
                    <li>• {importPreview.tags.tags?.length || 0} Tags</li>
                  )}
                  {importPreview.tag_groups && (
                    <li>• {importPreview.tag_groups.tag_groups?.length || 0} Tag Groups</li>
                  )}
                  {importPreview.mappings && (
                    <li>• {importPreview.mappings.mappings?.length || 0} Mappings</li>
                  )}
                  {importPreview.reports && (
                    <li>• {importPreview.reports.length || 0} Reports</li>
                  )}
                  {importPreview.export_date && (
                    <li className="text-[10px] text-[#6b7f94] mt-2">
                      Exported: {new Date(importPreview.export_date).toLocaleString()}
                    </li>
                  )}
                </ul>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!importFile}
              className="w-full bg-[#059669] hover:bg-[#047857] disabled:bg-[#e3e9f0] disabled:text-[#8898aa] disabled:cursor-not-allowed text-white text-[11px] font-medium rounded-lg px-3 py-1.5 flex items-center justify-center gap-2 transition-colors"
            >
              <FaUpload className="text-[11px]" />
              Import Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportImport;
