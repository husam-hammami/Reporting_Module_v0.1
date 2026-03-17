import React, { useState, useEffect, useContext } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Tag, Cpu, Beaker, FlaskConical, Database, Settings2, ToggleLeft, ArrowRightLeft } from 'lucide-react';
import axios from '../../../API/axios';
import { DarkModeContext } from '../../../Context/DarkModeProvider';

function useTheme() {
  const { mode } = useContext(DarkModeContext);
  const dark = mode === 'dark';
  return {
    dark,
    modalBg: dark ? '#111827' : '#ffffff',
    inputBg: dark ? '#0a0f1a' : '#f9fafb',
    sectionBg: dark ? 'rgba(10,15,26,0.5)' : 'rgba(249,250,251,0.6)',
    border: dark ? '#1e293b' : '#e5e7eb',
    borderSubtle: dark ? 'rgba(30,41,59,0.5)' : 'rgba(229,231,235,0.5)',
    text: dark ? '#f0f4f8' : '#111827',
    textSecondary: dark ? '#8899ab' : '#6b7280',
    textMuted: dark ? '#556677' : '#9ca3af',
    accent: dark ? '#22d3ee' : '#0369a1',
    accentBg: dark ? 'rgba(34,211,238,0.10)' : 'rgba(3,105,161,0.08)',
    accentBorder: dark ? 'rgba(34,211,238,0.20)' : 'rgba(3,105,161,0.15)',
    btnText: dark ? '#0a0f1a' : '#ffffff',
    danger: '#dc2626',
    dangerBg: dark ? 'rgba(220,38,38,0.08)' : 'rgba(220,38,38,0.05)',
    codeBg: dark ? '#0a0f1a' : '#f1f5f9',
  };
}

const TAB_GENERAL = 'general';
const TAB_CONFIG = 'config';

const TagForm = ({ tag, onSave, onCancel }) => {
  const t = useTheme();
  const [activeTab, setActiveTab] = useState(TAB_GENERAL);

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
    formula: '',
    mapping_name: '',
    bit_position: '',
    string_length: 40,
    byte_swap: true,
    is_counter: false,
    decimal_places: 2,
    is_bin_tag: false,
    activation_tag_name: '',
    activation_condition: 'equals',
    activation_value: '',
    value_formula: ''
  });

  const [errors, setErrors] = useState({});
  const [existingTags, setExistingTags] = useState([]);

  useEffect(() => {
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
    if (!formData.tag_name.trim()) {
      newErrors.tag_name = 'Tag Name is required';
    } else {
      const duplicate = existingTags.find(
        tg => tg.tag_name.toLowerCase() === formData.tag_name.toLowerCase().trim() &&
        (!tag || tg.tag_name !== tag.tag_name)
      );
      if (duplicate) newErrors.tag_name = 'Tag Name already exists';
    }
    if (formData.source_type === 'PLC' && !formData.plc_address.trim()) {
      newErrors.plc_address = 'PLC Address is required for PLC tags';
    } else if (formData.source_type === 'Formula' && !formData.formula.trim()) {
      newErrors.formula = 'Formula is required for Formula tags';
    } else if (formData.source_type === 'Mapping' && !formData.mapping_name.trim()) {
      newErrors.mapping_name = 'Mapping Name is required for Mapping tags';
    }
    if (formData.data_type === 'BOOL' && formData.source_type === 'PLC') {
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
      const cleanedData = { ...formData };
      if (cleanedData.bit_position === '' || cleanedData.bit_position === null) cleanedData.bit_position = undefined;
      if (cleanedData.string_length === '' || cleanedData.string_length === null) cleanedData.string_length = undefined;
      if (cleanedData.formula === '') cleanedData.formula = undefined;
      if (cleanedData.mapping_name === '') cleanedData.mapping_name = undefined;
      if (cleanedData.description === '') cleanedData.description = undefined;
      if (cleanedData.scaling !== undefined) cleanedData.scaling = parseFloat(cleanedData.scaling) || 1.0;
      onSave(cleanedData);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
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

  const inputStyle = {
    background: t.inputBg,
    border: `1px solid ${t.border}`,
    color: t.text,
  };
  const inputErrStyle = {
    background: t.inputBg,
    border: `1px solid ${t.danger}`,
    color: t.text,
  };
  const inputCls = 'w-full px-3 py-2.5 rounded-lg text-[13px] focus:outline-none focus:ring-1 transition-colors';

  const Label = ({ children, required }) => (
    <label className="block text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: t.accent }}>
      {children}{required && <span style={{ color: t.danger }}> *</span>}
    </label>
  );

  const Helper = ({ children }) => (
    <p className="text-[10px] mt-1.5" style={{ color: t.textMuted }}>{children}</p>
  );

  const ErrorMsg = ({ msg }) => msg ? (
    <p className="text-[10px] mt-1" style={{ color: t.danger }}>{msg}</p>
  ) : null;

  const SectionCard = ({ children, title, icon: Icon }) => (
    <div className="rounded-lg p-3.5 space-y-3" style={{ background: t.sectionBg, border: `1px solid ${t.accentBorder}` }}>
      {title && (
        <div className="flex items-center gap-2 mb-1">
          {Icon && <Icon size={12} style={{ color: t.accent }} />}
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: t.accent }}>{title}</span>
        </div>
      )}
      {children}
    </div>
  );

  const Checkbox = ({ checked, onChange, label }) => (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        className="w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-all"
        style={{
          borderColor: checked ? t.accent : t.border,
          background: checked ? t.accent : 'transparent',
        }}
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke={t.btnText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
      <span className="text-[12px] font-medium" style={{ color: t.textSecondary }}>{label}</span>
    </label>
  );

  const generalHasErrors = !!(errors.tag_name || errors.plc_address || errors.formula || errors.mapping_name);
  const configHasErrors = !!(errors.bit_position || errors.string_length);

  const renderGeneralTab = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>Tag Name</Label>
          <input
            type="text"
            value={formData.tag_name}
            onChange={(e) => handleChange('tag_name', e.target.value)}
            className={inputCls}
            style={errors.tag_name ? inputErrStyle : inputStyle}
            placeholder="e.g., FlowRate_Main"
          />
          <ErrorMsg msg={errors.tag_name} />
        </div>
        <div>
          <Label>Display Name</Label>
          <input
            type="text"
            value={formData.display_name}
            onChange={(e) => handleChange('display_name', e.target.value)}
            className={inputCls}
            style={inputStyle}
            placeholder="e.g., Main Flow Rate"
          />
        </div>
      </div>

      <div>
        <Label required>Source Type</Label>
        <select
          value={formData.source_type}
          onChange={(e) => handleChange('source_type', e.target.value)}
          className={inputCls}
          style={inputStyle}
        >
          <option value="PLC">PLC</option>
          <option value="Formula">Formula</option>
          <option value="Mapping">Mapping</option>
          <option value="Manual">Manual</option>
        </select>
      </div>

      {formData.source_type === 'PLC' && (
        <SectionCard title="PLC Configuration" icon={Cpu}>
          <div>
            <Label required>PLC Address</Label>
            <input
              type="text"
              value={formData.plc_address}
              onChange={(e) => handleChange('plc_address', e.target.value)}
              className={`${inputCls} font-mono`}
              style={errors.plc_address ? inputErrStyle : inputStyle}
              placeholder="e.g., DB2099.0, DB499.100"
            />
            <ErrorMsg msg={errors.plc_address} />
            <Helper>Format: DB[number].[offset] or DB[number].[offset].[bit] for BOOL</Helper>
          </div>
        </SectionCard>
      )}

      {formData.source_type === 'Formula' && (
        <SectionCard title="Formula" icon={FlaskConical}>
          <div>
            <Label required>Expression</Label>
            <textarea
              value={formData.formula}
              onChange={(e) => handleChange('formula', e.target.value)}
              className={`${inputCls} font-mono`}
              style={errors.formula ? inputErrStyle : inputStyle}
              rows="3"
              placeholder="e.g., Sender1_Weight + Sender2_Weight"
            />
            <ErrorMsg msg={errors.formula} />
          </div>
        </SectionCard>
      )}

      {formData.source_type === 'Mapping' && (
        <SectionCard title="Mapping" icon={ArrowRightLeft}>
          <div>
            <Label required>Mapping Name</Label>
            <input
              type="text"
              value={formData.mapping_name}
              onChange={(e) => handleChange('mapping_name', e.target.value)}
              className={inputCls}
              style={errors.mapping_name ? inputErrStyle : inputStyle}
              placeholder="e.g., BinToMaterial"
            />
            <ErrorMsg msg={errors.mapping_name} />
          </div>
        </SectionCard>
      )}

      <div>
        <Label>Description</Label>
        <textarea
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          className={inputCls}
          style={inputStyle}
          rows="2"
          placeholder="Optional description or notes"
        />
      </div>

      <Checkbox
        checked={formData.is_active}
        onChange={(e) => handleChange('is_active', e.target.checked)}
        label="Active (Tag is enabled)"
      />
    </div>
  );

  const renderConfigTab = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label required>Data Type</Label>
          <select
            value={formData.data_type}
            onChange={(e) => handleChange('data_type', e.target.value)}
            className={inputCls}
            style={inputStyle}
          >
            <option value="BOOL">BOOL</option>
            <option value="INT">INT</option>
            <option value="DINT">DINT</option>
            <option value="REAL">REAL</option>
            <option value="STRING">STRING</option>
          </select>
        </div>
        <div>
          <Label>Unit</Label>
          <input
            type="text"
            value={formData.unit}
            onChange={(e) => handleChange('unit', e.target.value)}
            className={inputCls}
            style={inputStyle}
            placeholder="e.g., t/h, kg, %, °C"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Scaling</Label>
          <input
            type="number"
            step="any"
            value={formData.scaling}
            onChange={(e) => handleChange('scaling', e.target.value)}
            className={inputCls}
            style={inputStyle}
            placeholder="1.0"
          />
          <Helper>Multiplier applied to raw PLC value</Helper>
        </div>
        <div>
          <Label>Decimal Places</Label>
          <input
            type="number"
            min="0"
            max="6"
            value={formData.decimal_places}
            onChange={(e) => handleChange('decimal_places', parseInt(e.target.value) ?? 2)}
            className={inputCls}
            style={inputStyle}
          />
          <Helper>Display precision (0–6 digits)</Helper>
        </div>
      </div>

      <Checkbox
        checked={formData.is_counter}
        onChange={(e) => handleChange('is_counter', e.target.checked)}
        label="Cumulative Counter / Totalizer"
      />
      {formData.is_counter && (
        <Helper>Counter tags accumulate over time. Reports use delta (last − first) to show change over a period.</Helper>
      )}

      {formData.data_type === 'BOOL' && formData.source_type === 'PLC' && (
        <SectionCard title="BOOL Options" icon={ToggleLeft}>
          <div>
            <Label>Bit Position (0-7)</Label>
            <input
              type="number"
              min="0"
              max="7"
              value={formData.bit_position}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '') {
                  handleChange('bit_position', '');
                } else {
                  const numValue = parseInt(value);
                  if (!isNaN(numValue)) handleChange('bit_position', numValue);
                }
              }}
              className={inputCls}
              style={errors.bit_position ? inputErrStyle : inputStyle}
            />
            <ErrorMsg msg={errors.bit_position} />
          </div>
        </SectionCard>
      )}

      {formData.data_type === 'STRING' && formData.source_type === 'PLC' && (
        <SectionCard title="STRING Options" icon={Database}>
          <div>
            <Label required>String Length</Label>
            <input
              type="number"
              min="1"
              value={formData.string_length}
              onChange={(e) => handleChange('string_length', parseInt(e.target.value) || 40)}
              className={inputCls}
              style={errors.string_length ? inputErrStyle : inputStyle}
            />
            <ErrorMsg msg={errors.string_length} />
          </div>
        </SectionCard>
      )}

      {formData.data_type === 'REAL' && formData.source_type === 'PLC' && (
        <Checkbox
          checked={formData.byte_swap}
          onChange={(e) => handleChange('byte_swap', e.target.checked)}
          label="Byte Swap (Little-endian)"
        />
      )}

      <SectionCard title="Value Transformation" icon={Beaker}>
        <div>
          <Label>Formula <span className="text-[10px] font-normal normal-case tracking-normal" style={{ color: t.textMuted }}>(optional)</span></Label>
          <textarea
            value={formData.value_formula}
            onChange={(e) => handleChange('value_formula', e.target.value)}
            className={`${inputCls} font-mono`}
            style={inputStyle}
            rows="2"
            placeholder="e.g., value * 0.277778"
          />
          <Helper>
            Use <code className="px-1 rounded text-[10px] font-mono" style={{ background: t.codeBg }}>value</code> as
            the variable name. Examples:{' '}
            <code className="px-1 rounded text-[10px] font-mono" style={{ background: t.codeBg }}>value * 0.277778</code>{' '}
            <code className="px-1 rounded text-[10px] font-mono" style={{ background: t.codeBg }}>value / 1000</code>{' '}
            <code className="px-1 rounded text-[10px] font-mono" style={{ background: t.codeBg }}>value * 1.8 + 32</code>
          </Helper>
          {formData.value_formula && (
            <div className="mt-2 rounded-lg p-2 text-[10px]" style={{ background: t.accentBg, border: `1px solid ${t.accentBorder}`, color: t.textSecondary }}>
              <strong>Note:</strong> If formula is provided, it will be used instead of scaling multiplier.
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Bin Activation" icon={Settings2}>
        <Checkbox
          checked={formData.is_bin_tag}
          onChange={(e) => handleChange('is_bin_tag', e.target.checked)}
          label="This is a bin tag (requires activation check)"
        />
        <Helper>Enable if this tag represents a bin ID filtered by activation conditions</Helper>

        {formData.is_bin_tag && (
          <div className="space-y-3 pt-2" style={{ borderTop: `1px solid ${t.borderSubtle}` }}>
            <div>
              <Label>Activation Tag Name</Label>
              <input
                type="text"
                value={formData.activation_tag_name}
                onChange={(e) => handleChange('activation_tag_name', e.target.value)}
                placeholder="e.g., flap_1_selected"
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Condition</Label>
                <select
                  value={formData.activation_condition}
                  onChange={(e) => handleChange('activation_condition', e.target.value)}
                  className={inputCls}
                  style={inputStyle}
                >
                  <option value="equals">Equals</option>
                  <option value="not_equals">Not Equals</option>
                  <option value="true">Is True</option>
                  <option value="false">Is False</option>
                  <option value="greater_than">Greater Than</option>
                  <option value="less_than">Less Than</option>
                </select>
              </div>
              {!['true', 'false'].includes(formData.activation_condition) && (
                <div>
                  <Label>Value</Label>
                  <input
                    type="text"
                    value={formData.activation_value}
                    onChange={(e) => handleChange('activation_value', e.target.value)}
                    placeholder="e.g., 1"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(8px)' }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-xl overflow-hidden shadow-2xl max-h-[85vh] flex flex-col mx-4"
        style={{ background: t.modalBg, border: `1px solid ${t.border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: `1px solid ${t.border}` }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: t.accentBg }}>
              <Tag size={16} style={{ color: t.accent }} />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: t.text }}>{tag ? 'Edit Tag' : 'New Tag'}</h2>
              <p className="text-[10px] uppercase tracking-wider" style={{ color: t.textMuted }}>Tag Definition</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg transition-colors hover:opacity-70" style={{ color: t.textSecondary }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-6 pt-3 pb-0 flex-shrink-0">
          <div className="flex rounded-lg p-0.5" style={{ background: t.inputBg, border: `1px solid ${t.border}` }}>
            {[
              { id: TAB_GENERAL, label: 'General', icon: Tag, hasError: generalHasErrors },
              { id: TAB_CONFIG, label: 'Configuration', icon: Settings2, hasError: configHasErrors },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[11px] font-semibold transition-all"
                style={activeTab === tab.id
                  ? { background: t.modalBg, color: t.text, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
                  : { color: t.textMuted }
                }
              >
                <tab.icon size={12} />
                {tab.label}
                {tab.hasError && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.danger }} />
                )}
              </button>
            ))}
          </div>
        </div>

        <form id="tag-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 min-h-0">
          {activeTab === TAB_GENERAL ? renderGeneralTab() : renderConfigTab()}
        </form>

        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderTop: `1px solid ${t.border}` }}>
          <div>
            {formData.source_type === 'PLC' && (
              <button
                type="button"
                onClick={handleTestTag}
                className="px-3 py-2 text-[11px] font-semibold rounded-lg transition-colors"
                style={{ color: t.accent, border: `1px solid ${t.accentBorder}`, background: t.accentBg }}
              >
                <span className="flex items-center gap-1.5">
                  <Beaker size={12} />
                  Test Tag
                </span>
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium rounded-lg transition-colors"
              style={{ color: t.textSecondary }}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="tag-form"
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
              style={{ background: t.accent, color: t.btnText }}
            >
              <Save size={12} />
              {tag ? 'Save Tag' : 'Create Tag'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TagForm;
