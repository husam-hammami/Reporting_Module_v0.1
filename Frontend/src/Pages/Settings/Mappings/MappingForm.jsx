import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaPlus, FaTrash, FaTimes } from 'react-icons/fa';
import axios from '../../../API/axios';
import { useLanguage } from '../../../Hooks/useLanguage';

const TAGS_TIMEOUT_MS = 18000; // production / live PLC can be slow

export default function MappingForm({ mapping, onSave, onCancel }) {
  const { t } = useLanguage();
  const isEdit = !!mapping;

  const [name, setName] = useState(mapping?.name || '');
  const [inputTag, setInputTag] = useState(mapping?.input_tag || '');
  const [outputTagName, setOutputTagName] = useState(mapping?.output_tag_name || '');
  const [description, setDescription] = useState(mapping?.description || '');
  const [fallback, setFallback] = useState(mapping?.fallback || 'Unknown');
  const [outputType, setOutputType] = useState(mapping?.output_type || 'text');
  const [entries, setEntries] = useState(() => {
    if (mapping?.lookup) return Object.entries(mapping.lookup).map(([k, v]) => ({ input: k, output: v }));
    return [{ input: '', output: '' }];
  });
  const [error, setError] = useState('');
  const [tags, setTags] = useState([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsError, setTagsError] = useState(false);
  const retryCountRef = useRef(0);
  const willRetryRef = useRef(false);

  const loadTags = useCallback(() => {
    setTagsError(false);
    setTagsLoading(true);
    willRetryRef.current = false;
    axios.get('/api/tags', { params: { is_active: 'true' }, timeout: TAGS_TIMEOUT_MS })
      .then(res => {
        const list = res.data?.tags ?? res.data ?? [];
        setTags(Array.isArray(list) ? list : []);
        setTagsError(false);
      })
      .catch(() => {
        const retried = retryCountRef.current > 0;
        if (!retried) {
          retryCountRef.current = 1;
          willRetryRef.current = true;
          axios.get('/api/tags', { params: { is_active: 'true' }, timeout: TAGS_TIMEOUT_MS })
            .then(res => {
              const list = res.data?.tags ?? res.data ?? [];
              setTags(Array.isArray(list) ? list : []);
              setTagsError(false);
            })
            .catch(() => {
              setTags(prev => (prev.length ? prev : []));
              setTagsError(true);
            })
            .finally(() => {
              setTagsLoading(false);
              willRetryRef.current = false;
            });
          return;
        }
        setTags(prev => (prev.length ? prev : []));
        setTagsError(true);
      })
      .finally(() => {
        if (!willRetryRef.current) setTagsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleInputTagChange = (tagName) => {
    setInputTag(tagName);
    if (!isEdit && tagName && !outputTagName.trim()) {
      setOutputTagName(tagName.replace(/\s+/g, '_') + '_Mapped');
    }
  };

  const addEntry = () => setEntries([...entries, { input: '', output: '' }]);
  const removeEntry = (i) => setEntries(entries.filter((_, j) => j !== i));
  const updateEntry = (i, field, value) => setEntries(entries.map((e, j) => j === i ? { ...e, [field]: value } : e));

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError(t('mappings.nameRequired')); return; }
    if (!inputTag.trim()) { setError(t('mappings.inputTagRequired')); return; }
    if (!outputTagName.trim()) { setError(t('mappings.outputTagRequired')); return; }
    const validEntries = entries.filter(e => e.input.trim() && e.output.trim());
    if (validEntries.length === 0) { setError(t('mappings.lookupRequired')); return; }

    const lookup = {};
    for (const e of validEntries) {
      if (lookup[e.input.trim()]) { setError(`${t('mappings.duplicateInput')} ${e.input.trim()}`); return; }
      lookup[e.input.trim()] = e.output.trim();
    }

    onSave({ name: name.trim(), input_tag: inputTag.trim(), output_tag_name: outputTagName.trim(), description: description.trim(), fallback: fallback.trim(), lookup, is_active: mapping?.is_active ?? true, output_type: outputType });
  };

  const inputCls = 'w-full text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] text-[#3a4a5c] dark:text-[#c1ccd9] placeholder-[#8898aa] px-3 py-2 focus:outline-none focus:border-brand focus:ring-1 focus:ring-[#0e74904d] transition-colors';
  const labelCls = 'text-[11px] font-medium text-[#6b7f94] mb-1.5 block';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#131b2d] rounded-xl border border-[#e3e9f0] dark:border-[#1e2d40] shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e3e9f0] dark:border-[#1e2d40] flex items-center justify-between flex-shrink-0">
          <h2 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">{isEdit ? t('mappings.editMapping') : t('mappings.newMapping')}</h2>
          <button onClick={onCancel} className="p-1.5 rounded-md text-[#6b7f94] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors"><FaTimes size={13} /></button>
        </div>

        {/* Body */}
        <form id="mapping-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className={labelCls}>{t('mappings.mappingName')}</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. Bin → Material" />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>{t('common.description')} <span className="text-[#8898aa] font-normal">{t('mappings.optional')}</span></label>
            <input value={description} onChange={e => setDescription(e.target.value)} className={inputCls} placeholder={t('mappings.descriptionPlaceholder')} />
          </div>

          {/* Input tag + output tag */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('mappings.inputTag')} <span className="text-[#dc2626]">*</span></label>
              <select
                value={inputTag}
                onChange={e => handleInputTagChange(e.target.value)}
                className={inputCls + ' font-mono'}
                disabled={tagsLoading}
              >
                <option value="">{tagsLoading ? t('mappings.loadingTags') : t('mappings.selectTag')}</option>
                {tags.map(tag => (
                  <option key={tag.id || tag.tag_name} value={tag.tag_name}>
                    {tag.display_name || tag.tag_name}
                  </option>
                ))}
                {inputTag && !tags.some(tag => tag.tag_name === inputTag) && (
                  <option value={inputTag}>{inputTag}</option>
                )}
              </select>
              <p className="text-[10px] text-[#8898aa] mt-1">{t('mappings.inputTagHelp')}</p>
              {tagsError && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                  {t('mappings.tagsLoadingSlow')}
                  <button type="button" onClick={() => { retryCountRef.current = 0; loadTags(); }} className="ml-1.5 font-medium underline hover:no-underline">
                    {t('common.retry')}
                  </button>
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>{t('mappings.outputTagName')} <span className="text-[#dc2626]">*</span></label>
              <input value={outputTagName} onChange={e => setOutputTagName(e.target.value)} className={inputCls + ' font-mono'} placeholder="e.g. Sender1_Material" />
              <p className="text-[10px] text-[#8898aa] mt-1">{t('mappings.outputTagHelp')}</p>
            </div>
          </div>

          {/* Output Type */}
          <div>
            <label className={labelCls}>{t('mappings.outputType')}</label>
            <select value={outputType} onChange={e => setOutputType(e.target.value)} className={inputCls}>
              <option value="text">{t('mappings.displayText')}</option>
              <option value="tag_value">{t('mappings.tagValue')}</option>
            </select>
            <p className="text-[10px] text-[#8898aa] mt-1">
              {outputType === 'tag_value' ? t('mappings.outputTypeHelpTag') : t('mappings.outputTypeHelpText')}
            </p>
          </div>

          {/* Fallback */}
          <div>
            <label className={labelCls}>{t('mappings.fallbackValue')}</label>
            <input value={fallback} onChange={e => setFallback(e.target.value)} className={inputCls} placeholder={t('mappings.fallbackPlaceholder')} />
          </div>

          {/* Lookup table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelCls + ' mb-0'}>{t('mappings.lookupTable')} <span className="text-[#dc2626]">*</span></label>
              <button type="button" onClick={addEntry} className="inline-flex items-center gap-1 text-[10px] font-medium text-brand hover:underline">
                <FaPlus size={8} /> {t('mappings.addRow')}
              </button>
            </div>
            <div className="border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_10px_1fr_32px] gap-2 px-3 py-2.5 bg-[#f5f8fb] dark:bg-[#0d1825] text-[10px] font-semibold text-[#6b7f94] uppercase tracking-wide">
                <span>{t('mappings.whenValueEquals')}</span>
                <span></span>
                <span>{outputType === 'tag_value' ? t('mappings.outputTag') : t('mappings.output')}</span>
                <span></span>
              </div>
              {/* Rows */}
              <div className="divide-y divide-[#e3e9f0] dark:divide-[#1e2d40] max-h-48 overflow-y-auto">
                {entries.map((entry, i) => (
                  <div key={i} className="grid grid-cols-[1fr_10px_1fr_32px] gap-2 px-3 py-2 items-center">
                    <input
                      value={entry.input}
                      onChange={e => updateEntry(i, 'input', e.target.value)}
                      className="text-[12px] font-mono rounded border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] px-2 py-1.5 text-[#3a4a5c] dark:text-[#c1ccd9] focus:outline-none focus:border-brand transition-colors"
                      placeholder="21"
                    />
                    <span className="text-[#8898aa] text-center text-[10px]">→</span>
                    {outputType === 'tag_value' ? (
                      <select
                        value={entry.output}
                        onChange={e => updateEntry(i, 'output', e.target.value)}
                        className="text-[12px] font-mono rounded border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] px-2 py-1.5 text-[#3a4a5c] dark:text-[#c1ccd9] focus:outline-none focus:border-brand transition-colors"
                      >
                        <option value="">{t('mappings.selectTagLookup')}</option>
                        {tags.map(tag => (
                          <option key={tag.id || tag.tag_name} value={tag.tag_name}>
                            {tag.display_name || tag.tag_name}
                          </option>
                        ))}
                        {entry.output && !tags.some(tag => tag.tag_name === entry.output) && (
                          <option value={entry.output}>{entry.output}</option>
                        )}
                      </select>
                    ) : (
                      <input
                        value={entry.output}
                        onChange={e => updateEntry(i, 'output', e.target.value)}
                        className="text-[12px] rounded border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#131b2d] px-2 py-1.5 text-[#3a4a5c] dark:text-[#c1ccd9] focus:outline-none focus:border-brand transition-colors"
                        placeholder="Wheat (Hard Red)"
                      />
                    )}
                    <button type="button" onClick={() => removeEntry(i)} className="p-1 rounded text-[#8898aa] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-colors">
                      <FaTrash size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error && <p className="text-[10px] text-[#dc2626]">{error}</p>}
        </form>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#e3e9f0] dark:border-[#1e2d40] flex justify-end gap-2 flex-shrink-0">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-[11px] font-medium rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#131b2d] transition-colors">
            {t('common.cancel')}
          </button>
          <button type="submit" form="mapping-form" className="px-4 py-2 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors">
            {isEdit ? t('mappings.saveChanges') : t('mappings.createMapping')}
          </button>
        </div>
      </div>
    </div>
  );
}
