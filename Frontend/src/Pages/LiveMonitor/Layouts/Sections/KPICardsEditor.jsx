import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLenisScroll } from '../../../../Hooks/useLenisScroll';
import { FaPlus, FaTrash, FaArrowLeft, FaSave, FaPalette } from 'react-icons/fa';
import axios from '../../../../API/axios';
import TagSelector from '../../../../Components/Shared/TagSelector';
import FormulaEditor from '../../../../Components/Shared/FormulaEditor';

const KPICardsEditor = () => {
  useLenisScroll();
  const { id, sectionId } = useParams();
  const navigate = useNavigate();
  const [layout, setLayout] = useState(null);
  const [section, setSection] = useState(null);
  const [showFormulaEditor, setShowFormulaEditor] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [tags, setTags] = useState([]); // for tag mapping dropdown (formula cards)

  useEffect(() => {
    if (id && sectionId) {
      loadData();
    }
  }, [id, sectionId]);

  useEffect(() => {
    const loadTags = async () => {
      try {
        const res = await axios.get('/api/tags', { params: { is_active: 'true' } });
        if (res.data?.status === 'success') setTags(res.data.tags || []);
      } catch (_) {
        try {
          const saved = localStorage.getItem('system_tags');
          if (saved) setTags(JSON.parse(saved).tags || []);
        } catch (__) {}
      }
    };
    loadTags();
  }, []);

  const loadData = async () => {
    try {
      const saved = localStorage.getItem('live_monitor_layouts');
      if (!saved) return;
      const data = JSON.parse(saved);
      const layoutId = typeof id === 'string' ? parseInt(id) : id;
      const found = data.layouts?.find(l => {
        const lId = typeof l.id === 'string' ? parseInt(l.id) : l.id;
        return lId === layoutId;
      });
      if (!found) {
        alert('Layout not found');
        return;
      }
      const sectionIdNum = typeof sectionId === 'string' ? parseInt(sectionId) : sectionId;
      let sectionFound = found.sections?.find(s => {
        const sId = typeof s.id === 'string' ? parseInt(s.id) : s.id;
        return sId === sectionIdNum;
      });
      if (!sectionFound) {
        alert('Section not found. Please go back and try again.');
        return;
      }

      // Prefer config from backend so saved KPI cards are shown (Report Config / DB is source of truth)
      const dbLayoutId = found.db_id ?? found.id;
      if (dbLayoutId != null) {
        try {
          const res = await axios.get(`/api/live-monitor/layouts/${dbLayoutId}/config`);
          const apiSections = res.data?.layout?.config?.sections;
          if (Array.isArray(apiSections) && apiSections.length > 0) {
            const apiSection = apiSections.find(s => {
              const sId = typeof s.id === 'string' ? parseInt(s.id) : s.id;
              return sId === sectionIdNum;
            });
            if (apiSection) {
              sectionFound = apiSection;
              found.sections = apiSections;
              // Sync to localStorage so Dynamic Report and Report Config see latest
              const updatedLayouts = data.layouts.map(l =>
                l.id === found.id ? { ...found, sections: apiSections } : l
              );
              localStorage.setItem('live_monitor_layouts', JSON.stringify({ layouts: updatedLayouts }));
            }
          }
        } catch (apiErr) {
          console.warn('Could not load config from backend, using localStorage:', apiErr?.message);
        }
      }

      if (!sectionFound.config) sectionFound.config = {};
      // DB / Report Config may store as kpi_cards; KPICardsEditor uses config.cards
      const cards = sectionFound.config.cards ?? sectionFound.config.kpi_cards ?? [];
      sectionFound.config = { ...sectionFound.config, cards };
      setLayout(found);
      setSection(sectionFound);
    } catch (e) {
      console.error('Error loading data:', e);
      alert('Error loading section: ' + e.message);
    }
  };

  const saveSection = async () => {
    try {
      const saved = localStorage.getItem('live_monitor_layouts');
      const data = saved ? JSON.parse(saved) : { layouts: [] };
      let sectionToSave = section.config?.cards != null
        ? { ...section, config: { ...section.config, cards: section.config.cards, kpi_cards: section.config.cards } }
        : section;
      const dbLayoutId = layout.db_id ?? layout.id;

      // Sync formula cards to KPI Engine API and store kpi_id on each card
      if (dbLayoutId != null && sectionToSave.config?.cards) {
        const cards = sectionToSave.config.cards;
        const updatedCards = await Promise.all(
          cards.map(async (card) => {
            const formulaStr = typeof card.formula === 'string' ? card.formula : (card.formula?.formula ?? '');
            if ((card.source_type || '').toLowerCase() !== 'formula' || !card.card_label?.trim() || !formulaStr.trim()) {
              return card;
            }
            const tag_mappings = (card.tag_mappings || [])
              .filter(m => m.alias_name?.trim() && (m.tag_id != null && m.tag_id !== ''))
              .map(m => ({ alias_name: m.alias_name.trim(), tag_id: parseInt(m.tag_id, 10) }));
            const payload = {
              kpi_name: card.card_label.trim(),
              layout_id: dbLayoutId,
              formula_expression: formulaStr.trim(),
              aggregation_type: card.aggregation_type || 'instant',
              unit: card.unit || '',
              tag_mappings
            };
            try {
              if (card.kpi_id != null && card.kpi_id !== '') {
                const res = await axios.put(`/api/kpi-config/${card.kpi_id}`, payload);
                return { ...card, kpi_id: res.data?.kpi?.id ?? card.kpi_id };
              } else {
                const res = await axios.post('/api/kpi-config', payload);
                const kpiId = res.data?.kpi?.id;
                return { ...card, kpi_id: kpiId };
              }
            } catch (apiErr) {
              console.error('KPI API sync failed for card:', card.card_label, apiErr);
              return card;
            }
          })
        );
        sectionToSave = {
          ...sectionToSave,
          config: { ...sectionToSave.config, cards: updatedCards, kpi_cards: updatedCards }
        };
      }

      const updatedSections = (layout.sections || []).map(s =>
        s.id === section.id ? sectionToSave : s
      );
      const updatedLayout = { ...layout, sections: updatedSections, last_modified: new Date().toISOString() };
      const updated = data.layouts.map(l =>
        l.id === layout.id ? updatedLayout : l
      );
      data.layouts = updated;
      localStorage.setItem('live_monitor_layouts', JSON.stringify(data));
      window.dispatchEvent(new Event('liveMonitorLayoutsUpdated'));

      if (dbLayoutId != null) {
        try {
          await axios.put(`/api/live-monitor/layouts/${dbLayoutId}/config`, {
            config: { sections: updatedSections }
          });
        } catch (apiErr) {
          console.error('Error saving section config to backend:', apiErr);
          alert('Section saved locally, but backend save failed. Cards may not appear in Dynamic Report until saved from Report Config.');
          return;
        }
      }

      setSection(sectionToSave);
      alert('Section saved successfully!');
    } catch (e) {
      console.error('Error saving section:', e);
      alert('Error saving section');
    }
  };

  const updateSectionConfig = (field, value) => {
    setSection(prev => ({
      ...prev,
      config: {
        ...prev.config,
        [field]: value
      }
    }));
  };

  const addCard = () => {
    const newCard = {
      id: Date.now(),
      card_label: '',
      source_type: 'tag',
      tag_name: '',
      formula: '',
      tag_mappings: [],
      kpi_id: null,
      unit: '',
      decimals: 2,
      icon: '',
      color: '#3B82F6'
    };
    updateSectionConfig('cards', [...(section.config?.cards || []), newCard]);
  };

  const updateCard = (cardId, field, value) => {
    const updated = (section.config?.cards || []).map(card =>
      card.id === cardId ? { ...card, [field]: value } : card
    );
    updateSectionConfig('cards', updated);
  };

  const deleteCard = (cardId) => {
    const updated = (section.config?.cards || []).filter(card => card.id !== cardId);
    updateSectionConfig('cards', updated);
  };

  const addTagMapping = (cardId) => {
    const cards = section.config?.cards || [];
    const updated = cards.map(card =>
      card.id === cardId
        ? { ...card, tag_mappings: [...(card.tag_mappings || []), { alias_name: '', tag_id: null, tag_name: '' }] }
        : card
    );
    updateSectionConfig('cards', updated);
  };

  const updateTagMapping = (cardId, idx, field, value) => {
    const cards = section.config?.cards || [];
    const updated = cards.map(card => {
      if (card.id !== cardId) return card;
      const list = [...(card.tag_mappings || [])];
      if (!list[idx]) return card;
      list[idx] = { ...list[idx], [field]: value };
      return { ...card, tag_mappings: list };
    });
    updateSectionConfig('cards', updated);
  };

  const removeTagMapping = (cardId, idx) => {
    const cards = section.config?.cards || [];
    const updated = cards.map(card =>
      card.id === cardId
        ? { ...card, tag_mappings: (card.tag_mappings || []).filter((_, i) => i !== idx) }
        : card
    );
    updateSectionConfig('cards', updated);
  };

  const setTagMappingTag = (cardId, idx, tagId) => {
    const tag = tags.find(t => t.id === tagId || t.id === parseInt(tagId, 10));
    if (!tag) return;
    const cards = section.config?.cards || [];
    const updated = cards.map(card => {
      if (card.id !== cardId) return card;
      const list = [...(card.tag_mappings || [])];
      if (!list[idx]) return card;
      list[idx] = { ...list[idx], tag_id: tag.id, tag_name: tag.tag_name };
      return { ...card, tag_mappings: list };
    });
    updateSectionConfig('cards', updated);
  };

  if (!section) {
    return (
      <div className="p-6">
        <div className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-8">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Loading section...</p>
          <button
            onClick={() => navigate(`/live-monitor/layouts/${id}`)}
            className="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-md"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const cards = section.config?.cards || [];
  const commonColors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#6366F1'
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/live-monitor/layouts/${id}`)}
            className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <FaArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-2xl font-bold dark:text-gray-100">{section.section_name}</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Configure KPI cards for live monitoring
            </p>
          </div>
        </div>
        <button
          onClick={saveSection}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md flex items-center gap-2"
        >
          <FaSave />
          Save Section
        </button>
      </div>

      {/* KPI Cards Configuration */}
      <div className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold dark:text-gray-100">KPI Cards</h3>
          <button
            onClick={addCard}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md flex items-center gap-2 text-sm"
          >
            <FaPlus />
            Add Card
          </button>
        </div>

        {cards.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No KPI cards added yet. Click "Add Card" to create one.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {cards.map((card) => (
              <div
                key={card.id}
                className="border border-gray-200 dark:border-cyan-900 rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
              >
                <div className="flex justify-between items-start mb-3">
                  <h4 className="font-medium dark:text-gray-100">Card: {card.card_label || 'Unnamed'}</h4>
                  <button
                    onClick={() => deleteCard(card.id)}
                    className="text-red-600 hover:text-red-800 dark:text-red-400"
                  >
                    <FaTrash />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card Label */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Card Label <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={card.card_label || ''}
                      onChange={(e) => updateCard(card.id, 'card_label', e.target.value)}
                      className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                      placeholder="e.g., Total Flow Rate, Average Weight"
                    />
                  </div>

                  {/* Source Type */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Source Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={card.source_type || 'tag'}
                      onChange={(e) => updateCard(card.id, 'source_type', e.target.value)}
                      className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                    >
                      <option value="tag">Tag</option>
                      <option value="formula">Formula</option>
                    </select>
                  </div>

                  {/* Tag Name (if source_type = tag) */}
                  {card.source_type === 'tag' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tag Name <span className="text-red-500">*</span>
                      </label>
                      <TagSelector
                        value={card.tag_name || ''}
                        onChange={(value) => updateCard(card.id, 'tag_name', value)}
                        placeholder="Select Tag..."
                        className="text-sm"
                      />
                    </div>
                  )}

                  {/* Formula (if source_type = formula) */}
                  {card.source_type === 'formula' && (
                    <>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Formula <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={typeof card.formula === 'string' ? card.formula : ''}
                            onChange={(e) => updateCard(card.id, 'formula', e.target.value)}
                            className="flex-1 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100 font-mono"
                            placeholder="e.g. flowrate/2 or (flour_1 / receiver_2) * 100"
                          />
                          <button
                            type="button"
                            onClick={() => { setEditingCard(card); setShowFormulaEditor(true); }}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md"
                          >
                            Editor
                          </button>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Tag mapping (optional)
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          Use tag names directly in the formula (e.g. <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">flowrate/2</code>) and leave mapping empty. Or add alias → tag rows for custom names (e.g. <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">Flour</code> → flowrate).
                        </p>
                        <div className="space-y-2">
                          {(card.tag_mappings || []).map((m, idx) => (
                            <div key={idx} className="flex gap-2 items-center">
                              <input
                                type="text"
                                value={m.alias_name || ''}
                                onChange={(e) => updateTagMapping(card.id, idx, 'alias_name', e.target.value)}
                                className="w-28 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100 font-mono"
                                placeholder="alias"
                              />
                              <span className="text-gray-500">→</span>
                              <select
                                value={m.tag_id ?? ''}
                                onChange={(e) => setTagMappingTag(card.id, idx, e.target.value)}
                                className="flex-1 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                              >
                                <option value="">Select tag...</option>
                                {tags.map(t => (
                                  <option key={t.id} value={t.id}>{t.display_name || t.tag_name} {t.unit ? `(${t.unit})` : ''}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => removeTagMapping(card.id, idx)}
                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                title="Remove mapping"
                              >
                                <FaTrash />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addTagMapping(card.id)}
                            className="text-sm text-brand hover:text-brand-hover dark:text-cyan-400"
                          >
                            + Add mapping
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Add rows to map alias names to tags, or leave empty to use tag names as variables in the formula.
                        </p>
                      </div>
                    </>
                  )}

                  {/* Unit */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Unit
                    </label>
                    <input
                      type="text"
                      value={card.unit || ''}
                      onChange={(e) => updateCard(card.id, 'unit', e.target.value)}
                      className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                      placeholder="e.g., t/h, kg, %"
                    />
                  </div>

                  {/* Decimals */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Decimals
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={card.decimals !== undefined ? card.decimals : 2}
                      onChange={(e) => updateCard(card.id, 'decimals', parseInt(e.target.value) || 0)}
                      className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  {/* Icon */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Icon (Font Awesome class)
                    </label>
                    <input
                      type="text"
                      value={card.icon || ''}
                      onChange={(e) => updateCard(card.id, 'icon', e.target.value)}
                      className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                      placeholder="e.g., fa-chart-line, fa-weight"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Font Awesome icon class name (without 'fa-' prefix)
                    </p>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Color
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={card.color || '#3B82F6'}
                        onChange={(e) => updateCard(card.id, 'color', e.target.value)}
                        className="w-12 h-10 border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer"
                      />
                      <input
                        type="text"
                        value={card.color || '#3B82F6'}
                        onChange={(e) => updateCard(card.id, 'color', e.target.value)}
                        className="flex-1 p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                        placeholder="#3B82F6"
                      />
                    </div>
                    <div className="flex gap-2 mt-2">
                      {commonColors.map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => updateCard(card.id, 'color', color)}
                          className="w-8 h-8 rounded border-2 border-gray-300 dark:border-gray-600"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Formula Editor Modal */}
      {showFormulaEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <FormulaEditor
            formula={typeof editingCard?.formula === 'string' ? editingCard.formula : ''}
            onSave={(result) => {
              if (editingCard) {
                const raw = typeof result === 'string' ? result : (result?.formula ?? '');
                const normalized = String(raw)
                  .replace(/\×/g, '*')
                  .replace(/\÷/g, '/')
                  .replace(/\u2212/g, '-')
                  .trim();
                updateCard(editingCard.id, 'formula', normalized);
              }
              setShowFormulaEditor(false);
              setEditingCard(null);
            }}
            onCancel={() => {
              setShowFormulaEditor(false);
              setEditingCard(null);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default KPICardsEditor;


