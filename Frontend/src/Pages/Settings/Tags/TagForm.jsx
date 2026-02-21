import React, { useState, useEffect } from 'react';
import { FaTimes, FaSave, FaCheckCircle } from 'react-icons/fa';
import axios from '../../../API/axios';

const TagForm = ({ tag, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    tag_name: '',
    display_name: '',
    source_type: 'PLC',
    plc_address: '',
    data_type: 'REAL',
    unit: '',
    scaling: 1.0,
    description: '',
    is_active: true,
    // Formula-specific
    formula: '',
    // Mapping-specific
    mapping_name: '',
    // BOOL-specific
    bit_position: '',
    // STRING-specific
    string_length: 40,
    // REAL-specific
    byte_swap: true,
    // Counter / display
    is_counter: false,
    decimal_places: 2,
    // Bin activation fields
    is_bin_tag: false,
    activation_tag_name: '',
    activation_condition: 'equals',
    activation_value: '',
    // Value transformation formula
    value_formula: ''
  });

  const [errors, setErrors] = useState({});
  const [existingTags, setExistingTags] = useState([]);

  useEffect(() => {
    // Load existing tags for validation
    const loadTags = async () => {
      try {
        const response = await axios.get('/api/tags');
        if (response.data.status === 'success') {
          setExistingTags(response.data.tags || []);
        }
      } catch (e) {
        console.error('Error loading tags for validation:', e);
      }
    };
    loadTags();

    // If editing, populate form
    if (tag) {
      setFormData({
        tag_name: tag.tag_name || '',
        display_name: tag.display_name || '',
        source_type: tag.source_type || 'PLC',
        plc_address: tag.plc_address || '',
        data_type: tag.data_type || 'REAL',
        unit: tag.unit || '',
        scaling: tag.scaling || 1.0,
        description: tag.description || '',
        is_active: tag.is_active !== undefined ? tag.is_active : true,
        formula: tag.formula || '',
        mapping_name: tag.mapping_name || '',
        bit_position: tag.bit_position || '',
        string_length: tag.string_length || 40,
        byte_swap: tag.byte_swap !== undefined ? tag.byte_swap : true,
        is_counter: tag.is_counter || false,
        decimal_places: tag.decimal_places ?? 2,
        is_bin_tag: tag.is_bin_tag || false,
        activation_tag_name: tag.activation_tag_name || '',
        activation_condition: tag.activation_condition || 'equals',
        activation_value: tag.activation_value || '',
        value_formula: tag.value_formula || ''
      });
    }
  }, [tag]);

  // Auto-detect bin tags by name
  useEffect(() => {
    const tagName = formData.tag_name || '';
    const isBinTag = tagName.toLowerCase().includes('binid') || 
                     tagName.toLowerCase().includes('bin_id') ||
                     (tagName.toLowerCase().includes('bin') && tagName.toLowerCase().includes('id'));
    
    if (isBinTag && !formData.is_bin_tag && tagName) {
      setFormData(prev => ({ ...prev, is_bin_tag: true }));
    }
  }, [formData.tag_name]);

  const validate = () => {
    const newErrors = {};

    // Tag name required and unique
    if (!formData.tag_name.trim()) {
      newErrors.tag_name = 'Tag Name is required';
    } else {
      const duplicate = existingTags.find(
        t => t.tag_name.toLowerCase() === formData.tag_name.toLowerCase().trim() && 
        (!tag || t.tag_name !== tag.tag_name)
      );
      if (duplicate) {
        newErrors.tag_name = 'Tag Name already exists';
      }
    }

    // Source type specific validations
    if (formData.source_type === 'PLC') {
      if (!formData.plc_address.trim()) {
        newErrors.plc_address = 'PLC Address is required for PLC tags';
      }
    } else if (formData.source_type === 'Formula') {
      if (!formData.formula.trim()) {
        newErrors.formula = 'Formula is required for Formula tags';
      }
    } else if (formData.source_type === 'Mapping') {
      if (!formData.mapping_name.trim()) {
        newErrors.mapping_name = 'Mapping Name is required for Mapping tags';
      }
    }

    // Data type specific validations
    if (formData.data_type === 'BOOL' && formData.source_type === 'PLC') {
      // Only validate if a value is provided (field is optional)
      if (formData.bit_position !== '' && formData.bit_position !== null && formData.bit_position !== undefined) {
        if (formData.bit_position < 0 || formData.bit_position > 7) {
          newErrors.bit_position = 'Bit Position must be 0-7 for BOOL type';
        }
      }
    }

    if (formData.data_type === 'STRING' && formData.source_type === 'PLC') {
      if (!formData.string_length || formData.string_length < 1) {
        newErrors.string_length = 'String Length must be at least 1';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      // Clean up form data before sending
      const cleanedData = { ...formData };
      
      // Remove empty strings and convert to proper types
      if (cleanedData.bit_position === '' || cleanedData.bit_position === null) {
        cleanedData.bit_position = undefined;
      }
      if (cleanedData.string_length === '' || cleanedData.string_length === null) {
        cleanedData.string_length = undefined;
      }
      if (cleanedData.formula === '') {
        cleanedData.formula = undefined;
      }
      if (cleanedData.mapping_name === '') {
        cleanedData.mapping_name = undefined;
      }
      if (cleanedData.description === '') {
        cleanedData.description = undefined;
      }
      
      // Convert scaling to number
      if (cleanedData.scaling !== undefined) {
        cleanedData.scaling = parseFloat(cleanedData.scaling) || 1.0;
      }
      
      onSave(cleanedData);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleTestTag = async () => {
    if (!formData.tag_name || formData.source_type !== 'PLC') {
      alert('Please enter a tag name and ensure source type is PLC');
      return;
    }
    
    try {
      const response = await axios.get(`/api/tags/${formData.tag_name}/test`);
      if (response.data.status === 'success') {
        alert(`Tag Value: ${response.data.value} ${response.data.unit || ''}\nRaw Value: ${response.data.raw_value}`);
      } else {
        alert('Failed to test tag: ' + response.data.message);
      }
    } catch (e) {
      console.error('Error testing tag:', e);
      alert('Failed to test tag: ' + (e.response?.data?.message || e.message));
    }
  };

  /* ---- shared style tokens ---- */
  const labelCls = 'text-[11px] font-medium text-[#6b7f94] mb-1.5 block';
  const inputCls =
    'w-full text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] text-[#3a4a5c] dark:text-[#c1ccd9] placeholder-[#8898aa] px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-[#0e74904d]';
  const inputErrCls =
    'w-full text-[12px] rounded-lg border border-[#dc2626] bg-white dark:bg-[#131b2d] text-[#3a4a5c] dark:text-[#c1ccd9] placeholder-[#8898aa] px-3 py-2 focus:outline-none focus:border-[#dc2626] focus:ring-1 focus:ring-[#dc2626]/30';
  const helperCls = 'text-[10px] text-[#8898aa] mt-1';
  const errorCls = 'text-[10px] text-[#dc2626] mt-1';
  const checkboxCls = 'w-4 h-4 rounded border-[#e3e9f0] text-brand focus:ring-[#0e74904d]';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#131b2d] rounded-xl border border-[#e3e9f0] dark:border-[#1e2d40] shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="px-5 py-4 border-b border-[#e3e9f0] dark:border-[#1e2d40] flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-[#2a3545] dark:text-[#c1ccd9]">
            {tag ? 'Edit Tag' : 'Create New Tag'}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-[#6b7f94] hover:text-[#2a3545] dark:hover:text-[#c1ccd9] transition-colors"
          >
            <FaTimes size={14} />
          </button>
        </div>

        {/* ── Body ── */}
        <form id="tag-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                Tag Name <span className="text-[#dc2626]">*</span>
              </label>
              <input
                type="text"
                value={formData.tag_name}
                onChange={(e) => handleChange('tag_name', e.target.value)}
                className={errors.tag_name ? inputErrCls : inputCls}
                placeholder="e.g., FlowRate_Main"
              />
              {errors.tag_name && <p className={errorCls}>{errors.tag_name}</p>}
            </div>

            <div>
              <label className={labelCls}>Display Name</label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => handleChange('display_name', e.target.value)}
                className={inputCls}
                placeholder="e.g., Main Flow Rate"
              />
            </div>
          </div>

          {/* Source Type */}
          <div>
            <label className={labelCls}>
              Source Type <span className="text-[#dc2626]">*</span>
            </label>
            <select
              value={formData.source_type}
              onChange={(e) => handleChange('source_type', e.target.value)}
              className={inputCls}
            >
              <option value="PLC">PLC</option>
              <option value="Formula">Formula</option>
              <option value="Mapping">Mapping</option>
              <option value="Manual">Manual</option>
            </select>
          </div>

          {/* PLC Address (conditional) */}
          {formData.source_type === 'PLC' && (
            <div className="bg-[#f5f8fb] dark:bg-[#0d1825] rounded-lg p-3 border border-[#e3e9f0] dark:border-[#1e2d40]">
              <label className={labelCls}>
                PLC Address <span className="text-[#dc2626]">*</span>
              </label>
              <input
                type="text"
                value={formData.plc_address}
                onChange={(e) => handleChange('plc_address', e.target.value)}
                className={`${errors.plc_address ? inputErrCls : inputCls} font-mono`}
                placeholder="e.g., DB2099.0, DB499.100"
              />
              {errors.plc_address && <p className={errorCls}>{errors.plc_address}</p>}
              <p className={helperCls}>
                Format: DB[number].[offset] or DB[number].[offset].[bit] for BOOL
              </p>
            </div>
          )}

          {/* Formula (conditional) */}
          {formData.source_type === 'Formula' && (
            <div className="bg-[#f5f8fb] dark:bg-[#0d1825] rounded-lg p-3 border border-[#e3e9f0] dark:border-[#1e2d40]">
              <label className={labelCls}>
                Formula <span className="text-[#dc2626]">*</span>
              </label>
              <textarea
                value={formData.formula}
                onChange={(e) => handleChange('formula', e.target.value)}
                className={`${errors.formula ? inputErrCls : inputCls} font-mono`}
                rows="3"
                placeholder="e.g., Sender1_Weight + Sender2_Weight"
              />
              {errors.formula && <p className={errorCls}>{errors.formula}</p>}
            </div>
          )}

          {/* Mapping Name (conditional) */}
          {formData.source_type === 'Mapping' && (
            <div className="bg-[#f5f8fb] dark:bg-[#0d1825] rounded-lg p-3 border border-[#e3e9f0] dark:border-[#1e2d40]">
              <label className={labelCls}>
                Mapping Name <span className="text-[#dc2626]">*</span>
              </label>
              <input
                type="text"
                value={formData.mapping_name}
                onChange={(e) => handleChange('mapping_name', e.target.value)}
                className={errors.mapping_name ? inputErrCls : inputCls}
                placeholder="e.g., BinToMaterial"
              />
              {errors.mapping_name && <p className={errorCls}>{errors.mapping_name}</p>}
            </div>
          )}

          {/* Data Type and Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>
                Data Type <span className="text-[#dc2626]">*</span>
              </label>
              <select
                value={formData.data_type}
                onChange={(e) => handleChange('data_type', e.target.value)}
                className={inputCls}
              >
                <option value="BOOL">BOOL</option>
                <option value="INT">INT</option>
                <option value="DINT">DINT</option>
                <option value="REAL">REAL</option>
                <option value="STRING">STRING</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Unit</label>
              <input
                type="text"
                value={formData.unit}
                onChange={(e) => handleChange('unit', e.target.value)}
                className={inputCls}
                placeholder="e.g., t/h, kg, %, °C"
              />
            </div>
          </div>

          {/* Scaling and Decimal Places */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Scaling</label>
              <input
                type="number"
                step="any"
                value={formData.scaling}
                onChange={(e) => handleChange('scaling', e.target.value)}
                className={inputCls}
                placeholder="1.0"
              />
              <p className={helperCls}>Multiplier applied to raw PLC value</p>
            </div>
            <div>
              <label className={labelCls}>Decimal Places</label>
              <input
                type="number"
                min="0"
                max="6"
                value={formData.decimal_places}
                onChange={(e) => handleChange('decimal_places', parseInt(e.target.value) ?? 2)}
                className={inputCls}
              />
              <p className={helperCls}>Display precision (0–6 digits)</p>
            </div>
          </div>

          {/* Counter / Totalizer */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_counter}
              onChange={(e) => handleChange('is_counter', e.target.checked)}
              className={checkboxCls}
            />
            <span className="text-[11px] font-medium text-[#6b7f94]">
              Cumulative Counter / Totalizer
            </span>
          </div>
          {formData.is_counter && (
            <p className={`${helperCls} ml-6 -mt-2`}>
              Counter tags accumulate over time (e.g., production kg, energy kWh).
              Reports use <strong>delta</strong> (last − first) to show change over a period.
            </p>
          )}

          {/* BOOL-specific: Bit Position */}
          {formData.data_type === 'BOOL' && formData.source_type === 'PLC' && (
            <div className="bg-[#f5f8fb] dark:bg-[#0d1825] rounded-lg p-3 border border-[#e3e9f0] dark:border-[#1e2d40]">
              <label className={labelCls}>Bit Position (0-7)</label>
              <input
                type="number"
                min="0"
                max="7"
                value={formData.bit_position}
                onChange={(e) => {
                  const value = e.target.value;
                  // Allow empty string or valid number (including 0)
                  if (value === '') {
                    handleChange('bit_position', '');
                  } else {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue)) {
                      handleChange('bit_position', numValue);
                    }
                  }
                }}
                className={errors.bit_position ? inputErrCls : inputCls}
              />
              {errors.bit_position && <p className={errorCls}>{errors.bit_position}</p>}
            </div>
          )}

          {/* STRING-specific: String Length */}
          {formData.data_type === 'STRING' && formData.source_type === 'PLC' && (
            <div className="bg-[#f5f8fb] dark:bg-[#0d1825] rounded-lg p-3 border border-[#e3e9f0] dark:border-[#1e2d40]">
              <label className={labelCls}>
                String Length <span className="text-[#dc2626]">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={formData.string_length}
                onChange={(e) => handleChange('string_length', parseInt(e.target.value) || 40)}
                className={errors.string_length ? inputErrCls : inputCls}
              />
              {errors.string_length && <p className={errorCls}>{errors.string_length}</p>}
            </div>
          )}

          {/* REAL-specific: Byte Swap */}
          {formData.data_type === 'REAL' && formData.source_type === 'PLC' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formData.byte_swap}
                onChange={(e) => handleChange('byte_swap', e.target.checked)}
                className={checkboxCls}
              />
              <span className="text-[11px] font-medium text-[#6b7f94]">
                Byte Swap (Little-endian)
              </span>
            </div>
          )}

          {/* Value Transformation Formula */}
          <div>
            <label className={labelCls}>
              Value Transformation Formula
              <span className="text-[10px] text-[#8898aa] ml-1.5">(optional)</span>
            </label>
            <textarea
              value={formData.value_formula}
              onChange={(e) => handleChange('value_formula', e.target.value)}
              className={`${inputCls} font-mono`}
              rows="2"
              placeholder="e.g., value * 0.277778"
            />
            <p className={helperCls}>
              Formula to transform raw PLC value. Use{' '}
              <code className="bg-[#f5f8fb] dark:bg-[#0d1825] px-1 rounded text-[10px]">value</code>{' '}
              as variable name.
              <br />
              Examples:{' '}
              <code className="bg-[#f5f8fb] dark:bg-[#0d1825] px-1 rounded text-[10px]">value * 0.277778</code>{' '}
              (t/h to kg/s),{' '}
              <code className="bg-[#f5f8fb] dark:bg-[#0d1825] px-1 rounded text-[10px]">value / 1000</code>{' '}
              (g to kg),{' '}
              <code className="bg-[#f5f8fb] dark:bg-[#0d1825] px-1 rounded text-[10px]">value * 1.8 + 32</code>{' '}
              (°C to °F)
            </p>
            {formData.value_formula && (
              <div className="mt-2 bg-[#f5f8fb] dark:bg-[#0d1825] rounded-lg p-2 border border-[#e3e9f0] dark:border-[#1e2d40] text-[10px] text-[#3a4a5c] dark:text-[#c1ccd9]">
                <strong>Note:</strong> If formula is provided, it will be used instead of scaling multiplier.
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className={inputCls}
              rows="2"
              placeholder="Optional description or notes"
            />
          </div>

          {/* Is Active */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => handleChange('is_active', e.target.checked)}
              className={checkboxCls}
            />
            <span className="text-[11px] font-medium text-[#6b7f94]">
              Active (Tag is enabled)
            </span>
          </div>

          {/* ── Bin Activation Configuration ── */}
          <div className="border-t border-[#e3e9f0] dark:border-[#1e2d40] pt-4 mt-4 space-y-4">
            <h4 className="text-[12px] font-bold text-[#2a3545] dark:text-[#c1ccd9]">
              Bin Activation Configuration
            </h4>

            {/* Is Bin Tag */}
            <div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_bin_tag}
                  onChange={(e) => handleChange('is_bin_tag', e.target.checked)}
                  className={checkboxCls}
                />
                <span className="text-[11px] font-medium text-[#6b7f94]">
                  This is a bin tag (requires activation check)
                </span>
              </label>
              <p className="text-[10px] text-[#8898aa] mt-1 ml-6">
                Enable this if this tag represents a bin ID that should be filtered based on activation conditions
              </p>
            </div>

            {/* Activation Configuration Fields */}
            {formData.is_bin_tag && (
              <div className="bg-[#f5f8fb] dark:bg-[#0d1825] rounded-lg p-3 border border-[#e3e9f0] dark:border-[#1e2d40] space-y-3">
                {/* Activation Tag Name */}
                <div>
                  <label className={labelCls}>Activation Tag Name</label>
                  <input
                    type="text"
                    value={formData.activation_tag_name}
                    onChange={(e) => handleChange('activation_tag_name', e.target.value)}
                    placeholder="e.g., flap_1_selected"
                    className={inputCls}
                  />
                  <p className={helperCls}>
                    Tag name to check for activation (e.g., flap_1_selected)
                  </p>
                </div>

                {/* Activation Condition */}
                <div>
                  <label className={labelCls}>Activation Condition</label>
                  <select
                    value={formData.activation_condition}
                    onChange={(e) => handleChange('activation_condition', e.target.value)}
                    className={inputCls}
                  >
                    <option value="equals">Equals</option>
                    <option value="not_equals">Not Equals</option>
                    <option value="true">Is True</option>
                    <option value="false">Is False</option>
                    <option value="greater_than">Greater Than</option>
                    <option value="less_than">Less Than</option>
                  </select>
                </div>

                {/* Activation Value */}
                <div>
                  <label className={labelCls}>Activation Value</label>
                  <input
                    type="text"
                    value={formData.activation_value}
                    onChange={(e) => handleChange('activation_value', e.target.value)}
                    placeholder="e.g., true, 1, or specific value"
                    className={inputCls}
                  />
                  <p className={helperCls}>
                    Value to compare against (e.g., "true" for boolean, "1" for numeric)
                  </p>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-[#e3e9f0] dark:border-[#1e2d40] flex justify-end gap-2">
          {formData.source_type === 'PLC' && (
            <button
              type="button"
              onClick={handleTestTag}
              className="border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#131b2d] text-[11px] font-medium rounded-lg px-4 py-2 flex items-center gap-1.5 mr-auto"
            >
              <FaCheckCircle size={11} />
              Test Tag
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#131b2d] text-[11px] font-medium rounded-lg px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="tag-form"
            className="bg-brand hover:bg-brand-hover text-white text-[11px] font-medium rounded-lg px-4 py-2 flex items-center gap-1.5"
          >
            <FaSave size={11} />
            Save Tag
          </button>
        </div>
      </div>
    </div>
  );
};

export default TagForm;
