import React, { useState, useEffect } from 'react';
import { FaTimes, FaSave } from 'react-icons/fa';
import axios from '../../../API/axios';

const LiveMonitorLayoutForm = ({ layout, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    layout_name: '',
    description: '',
    is_active: true,
    is_default: false,
    include_line_running_tag: false,
    line_running_tag_name: '',
    order_status_tag_name: '',
    order_prefix: '',
    order_start_value: 1,
    order_stop_value: 0,
  });
  
  const [tags, setTags] = useState([]);
  const [allTags, setAllTags] = useState([]);

  const [errors, setErrors] = useState({});
  const [existingLayouts, setExistingLayouts] = useState([]);

  useEffect(() => {
    // Load existing layouts for validation
    const saved = localStorage.getItem('live_monitor_layouts');
    if (saved) {
      const data = JSON.parse(saved);
      setExistingLayouts(data.layouts || []);
    }

    // Load tags for line running tag selection
    loadTags();

    // If editing, populate form
    if (layout) {
      setFormData({
        layout_name: layout.layout_name || '',
        description: layout.description || '',
        is_active: layout.is_active !== undefined ? layout.is_active : true,
        is_default: layout.is_default || false,
        include_line_running_tag: layout.include_line_running_tag || false,
        line_running_tag_name: layout.line_running_tag_name || '',
        order_status_tag_name: layout.order_status_tag_name || '',
        order_prefix: layout.order_prefix || '',
        order_start_value: layout.order_start_value ?? 1,
        order_stop_value: layout.order_stop_value ?? 0,
      });
    }
  }, [layout]);

  const loadTags = async () => {
    try {
      console.log('[LiveMonitorLayoutForm] Loading tags from API...');
      const response = await axios.get('/api/tags', {
        params: {
          is_active: 'true' // Only get active tags
        },
        timeout: 30000 // 30 second timeout (increased from 10s)
      });
      
      console.log('[LiveMonitorLayoutForm] API response received:', {
        status: response.data.status,
        totalTags: response.data.tags?.length || 0
      });
      
      if (response.data.status === 'success') {
        const fetchedTags = response.data.tags || [];
        console.log(`[LiveMonitorLayoutForm] Total tags received: ${fetchedTags.length}`);
        
        setAllTags(fetchedTags);

        const boolTags = fetchedTags.filter(t => {
          const isBool = t.data_type === 'BOOL';
          const isActive = t.is_active !== false;
          if (!isBool) return false;
          if (!isActive) {
            console.warn(`[LiveMonitorLayoutForm] Skipping inactive BOOL tag: ${t.tag_name}`);
            return false;
          }
          return true;
        });
        
        console.log(`[LiveMonitorLayoutForm] Filtered to ${boolTags.length} active BOOL tags`);
        setTags(boolTags);
      } else {
        console.warn('[LiveMonitorLayoutForm] API returned error status:', response.data);
        setTags([]);
      }
    } catch (e) {
      console.error('[LiveMonitorLayoutForm] Error loading tags:', e);
      if (e.code === 'ECONNABORTED' || e.message?.includes('timeout')) {
        console.warn('[LiveMonitorLayoutForm] Request timed out. Trying to load from localStorage...');
        // Fallback to localStorage if available
        try {
          const saved = localStorage.getItem('system_tags');
          if (saved) {
            const data = JSON.parse(saved);
            const allTags = data.tags || [];
            const boolTags = allTags.filter(t => 
              (t.is_active !== false) && t.data_type === 'BOOL'
            );
            console.log(`[LiveMonitorLayoutForm] Loaded ${boolTags.length} BOOL tags from localStorage`);
            setTags(boolTags);
            return;
          }
        } catch (localError) {
          console.error('[LiveMonitorLayoutForm] Error loading from localStorage:', localError);
        }
      }
      setTags([]);
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.layout_name.trim()) {
      newErrors.layout_name = 'Layout Name is required';
    } else {
      const duplicate = existingLayouts.find(
        l => l.layout_name.toLowerCase() === formData.layout_name.toLowerCase().trim() && l.id !== layout?.id
      );
      if (duplicate) {
        newErrors.layout_name = 'Layout Name already exists';
      }
    }

    if (formData.include_line_running_tag && !formData.line_running_tag_name.trim()) {
      newErrors.line_running_tag_name = 'Line Running Tag is required when option is enabled';
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
          {layout ? 'Edit Live Monitor Layout' : 'Create New Live Monitor Layout'}
        </h3>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <FaTimes size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6">
        {/* Layout Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Layout Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.layout_name}
            onChange={(e) => handleChange('layout_name', e.target.value)}
            className={`w-full p-2 border rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100 ${
              errors.layout_name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="e.g., FCL Live Monitor, Energy Dashboard"
          />
          {errors.layout_name && <p className="text-red-500 text-xs mt-1">{errors.layout_name}</p>}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Description
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleChange('description', e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
            rows="3"
            placeholder="Describe the purpose and usage of this live monitor layout"
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
              Active (Layout is enabled)
            </span>
          </label>
        </div>

        {/* Is Default */}
        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_default}
              onChange={(e) => handleChange('is_default', e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Set as Default Layout
            </span>
          </label>
        </div>

        {/* Line Running Status Tag */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={formData.include_line_running_tag}
              onChange={(e) => handleChange('include_line_running_tag', e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Include Line Running Status Tag
            </span>
          </label>
          {formData.include_line_running_tag && (
            <div className="ml-6 mt-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Line Running Tag <span className="text-red-500">*</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                  (Select a BOOL tag: 1 = Running, 0 = Stopped)
                </span>
              </label>
              <select
                value={formData.line_running_tag_name}
                onChange={(e) => handleChange('line_running_tag_name', e.target.value)}
                onFocus={() => {
                  // Reload tags when dropdown is opened to get latest tags
                  console.log('[LiveMonitorLayoutForm] Dropdown opened, reloading tags...');
                  loadTags();
                }}
                className={`w-full p-2 border rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100 ${
                  errors.line_running_tag_name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                <option value="">Select a tag...</option>
                {tags.map((tag) => (
                  <option key={tag.tag_name} value={tag.tag_name}>
                    {tag.tag_name} {tag.display_name ? `(${tag.display_name})` : ''}
                  </option>
                ))}
              </select>
              {errors.line_running_tag_name && (
                <p className="text-red-500 text-xs mt-1">{errors.line_running_tag_name}</p>
              )}
              {tags.length === 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  No active BOOL tags found. Please create a BOOL tag in the Tags section first.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Order Tracking */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">
            Order Tracking (Job Logs)
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Configure automatic order detection from a PLC status tag. Leave empty to disable order tracking for this layout.
          </p>

          {/* Order Status Tag */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Order Status Tag
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                (Numeric tag: value transitions trigger order start/stop)
              </span>
            </label>
            <select
              value={formData.order_status_tag_name}
              onChange={(e) => handleChange('order_status_tag_name', e.target.value)}
              onFocus={loadTags}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
            >
              <option value="">None (order tracking disabled)</option>
              {allTags.map((tag) => (
                <option key={tag.tag_name} value={tag.tag_name}>
                  {tag.tag_name} {tag.display_name ? `(${tag.display_name})` : ''} [{tag.data_type}]
                </option>
              ))}
            </select>
          </div>

          {formData.order_status_tag_name && (
            <div className="ml-4 space-y-4">
              {/* Order Prefix */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Order Name Prefix
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                    (e.g. MILA → MILA1, MILA2, …)
                  </span>
                </label>
                <input
                  type="text"
                  value={formData.order_prefix}
                  onChange={(e) => handleChange('order_prefix', e.target.value)}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                  placeholder="e.g. MILA, MILB, FCL"
                />
              </div>

              {/* Start / Stop Values */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Start Value
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(order begins)</span>
                  </label>
                  <input
                    type="number"
                    value={formData.order_start_value}
                    onChange={(e) => handleChange('order_start_value', parseInt(e.target.value, 10) || 0)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Stop Value
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">(order ends)</span>
                  </label>
                  <input
                    type="number"
                    value={formData.order_stop_value}
                    onChange={(e) => handleChange('order_stop_value', parseInt(e.target.value, 10) || 0)}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                  />
                </div>
              </div>
            </div>
          )}
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
            Save Layout
          </button>
        </div>
      </form>
    </div>
  );
};

export default LiveMonitorLayoutForm;


