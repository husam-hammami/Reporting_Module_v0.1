import React, { useState, useEffect } from 'react';
import { FaTimes, FaSave } from 'react-icons/fa';

const LiveMonitorSectionBuilder = ({ section, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    section_name: '',
    section_type: 'table',
    is_active: true,
    display_order: 1
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (section) {
      setFormData({
        section_name: section.section_name || '',
        section_type: section.section_type || 'table',
        is_active: section.is_active !== undefined ? section.is_active : true,
        display_order: section.display_order || 1,
        config: section.config || {}
      });
    }
  }, [section]);

  const validate = () => {
    const newErrors = {};

    if (!formData.section_name.trim()) {
      newErrors.section_name = 'Section Name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onSave(formData);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  return (
    <div className="bg-white dark:!bg-[#131b2d] rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div className="sticky top-0 bg-white dark:!bg-[#131b2d] border-b border-gray-200 dark:border-gray-700 p-6 flex justify-between items-center">
        <h3 className="text-2xl font-bold dark:text-gray-100">
          {section ? 'Edit Section' : 'Create New Section'}
        </h3>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <FaTimes size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Section Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Section Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.section_name}
            onChange={(e) => handleChange('section_name', e.target.value)}
            className={`w-full p-2 border rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100 ${
              errors.section_name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="e.g., Sender Sources, Key Metrics"
          />
          {errors.section_name && <p className="text-red-500 text-xs mt-1">{errors.section_name}</p>}
        </div>

        {/* Section Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Section Type <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.section_type}
            onChange={(e) => handleChange('section_type', e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100"
          >
            <option value="table">Table</option>
            <option value="kpi_cards">KPI Cards</option>
            <option value="chart">Chart</option>
          </select>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formData.section_type === 'table' && 'Display data in a table format with dynamic rows from Tag Groups'}
            {formData.section_type === 'kpi_cards' && 'Display key performance indicators as cards'}
            {formData.section_type === 'chart' && 'Display data visualization in chart format'}
          </p>
        </div>

        {/* Display Order */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Display Order
          </label>
          <input
            type="number"
            min="1"
            value={formData.display_order}
            onChange={(e) => handleChange('display_order', parseInt(e.target.value) || 1)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100"
          />
        </div>

        {/* Is Active */}
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => handleChange('is_active', e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Active (Section is enabled)
            </span>
          </label>
        </div>

        {/* Info Message */}
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-md p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            After saving, you can configure the section details (columns, tag groups, KPI cards, etc.) by clicking "Edit Section".
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-md"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-md flex items-center gap-2"
          >
            <FaSave />
            Save Section
          </button>
        </div>
      </form>
    </div>
  );
};

export default LiveMonitorSectionBuilder;


