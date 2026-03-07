import React, { useState, useEffect, useRef } from 'react';
import { useLenisScroll } from '../../../Hooks/useLenisScroll';
import { FaPlus, FaEdit, FaTrash, FaCheck, FaTimes, FaSearch, FaSpinner, FaChevronDown } from 'react-icons/fa';
import axios from '../../../API/axios';

const FALLBACK_GROUPS = [
  { id: 1, group_name: 'Process Sensors', description: 'Core process measurement sensors', is_active: true, tag_count: 4, tags: [
    { tag_name: 'Temperature_1', display_name: 'Temperature Sensor 1' },
    { tag_name: 'Pressure_1', display_name: 'Pressure Sensor 1' },
    { tag_name: 'Flow_Rate_1', display_name: 'Flow Rate' },
    { tag_name: 'Level_Tank_1', display_name: 'Tank Level' },
  ]},
  { id: 2, group_name: 'Production KPIs', description: 'Key production indicators', is_active: true, tag_count: 4, tags: [
    { tag_name: 'Mill_Throughput', display_name: 'Mill Throughput' },
    { tag_name: 'Flour_Extraction', display_name: 'Flour Extraction' },
    { tag_name: 'Bran_Extraction', display_name: 'Bran Extraction' },
    { tag_name: 'MillingLossFormula', display_name: 'Milling Loss' },
  ]},
  { id: 3, group_name: 'Utilities', description: 'Power, water, and utilities', is_active: true, tag_count: 2, tags: [
    { tag_name: 'Power_Consumption', display_name: 'Power Consumption' },
    { tag_name: 'Water_Used', display_name: 'Total Water Used' },
  ]},
  { id: 4, group_name: 'Mechanical', description: 'Motor and vibration monitoring', is_active: true, tag_count: 3, tags: [
    { tag_name: 'Motor_Speed_1', display_name: 'Motor Speed' },
    { tag_name: 'Vibration_1', display_name: 'Vibration Sensor' },
    { tag_name: 'Weight_Scale_1', display_name: 'Scale Weight' },
  ]},
];

const TagGroupManager = () => {
  useLenisScroll();
  const [tagGroups, setTagGroups] = useState([]);
  const [tags, setTags] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [formData, setFormData] = useState({
    group_name: '',
    description: '',
    tag_names: [],
    display_order: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tagsDropdownOpen, setTagsDropdownOpen] = useState(false);
  const tagsDropdownRef = useRef(null);
  const dropdownScrollRef = useRef(null);
  const autoScrollIntervalRef = useRef(null);

  // Instant: show cached or fallback (zero wait), then try API in background
  useEffect(() => {
    try {
      const saved = localStorage.getItem('system_tag_groups');
      if (saved) {
        const cached = JSON.parse(saved).tag_groups || [];
        setTagGroups(cached.length > 0 ? cached : FALLBACK_GROUPS);
      } else { setTagGroups(FALLBACK_GROUPS); }
    } catch { setTagGroups(FALLBACK_GROUPS); }
    setLoading(false);

    loadTagGroups();
    loadTags();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tagsDropdownRef.current && !tagsDropdownRef.current.contains(event.target)) {
        setTagsDropdownOpen(false);
      }
    };

    if (tagsDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
    };
  }, [tagsDropdownOpen]);

  // Handle auto-scroll on mouse move near edges
  const handleMouseMove = (e) => {
    if (!dropdownScrollRef.current) return;

    const dropdown = dropdownScrollRef.current;
    const rect = dropdown.getBoundingClientRect();
    const mouseY = e.clientY;
    const topEdge = rect.top;
    const bottomEdge = rect.bottom;
    const scrollZone = 50; // Distance from edge to trigger auto-scroll

    // Clear any existing interval
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }

    // Check if mouse is near top edge
    if (mouseY >= topEdge && mouseY <= topEdge + scrollZone) {
      autoScrollIntervalRef.current = setInterval(() => {
        if (dropdownScrollRef.current) {
          dropdownScrollRef.current.scrollTop -= 10;
        }
      }, 50);
    }
    // Check if mouse is near bottom edge
    else if (mouseY >= bottomEdge - scrollZone && mouseY <= bottomEdge) {
      autoScrollIntervalRef.current = setInterval(() => {
        if (dropdownScrollRef.current) {
          dropdownScrollRef.current.scrollTop += 10;
        }
      }, 50);
    }
  };

  const handleMouseLeave = () => {
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
  };

  const loadTagGroups = async () => {
    try {
      const response = await axios.get('/api/tag-groups', {
        params: { is_active: 'true' },
        timeout: 3000
      });
      
      if (response.data.status === 'success') {
        let groups = response.data.tag_groups || [];

        if (groups.length === 0) {
          try {
            await axios.post('/api/tags/seed', {}, { timeout: 5000 });
            const retry = await axios.get('/api/tag-groups', { params: { is_active: 'true' }, timeout: 3000 });
            if (retry.data.status === 'success' && retry.data.tag_groups?.length > 0) groups = retry.data.tag_groups;
          } catch { /* seed failed, keep fallback */ }
        }

        if (groups.length > 0) {
          setTagGroups(groups);
          localStorage.setItem('system_tag_groups', JSON.stringify({ tag_groups: groups }));
        }
      } else {
        console.warn('[TagGroupManager] API returned error status, trying localStorage fallback');
        // Fallback to localStorage
        const saved = localStorage.getItem('system_tag_groups');
        if (saved) {
          const data = JSON.parse(saved);
          setTagGroups(data.tag_groups || []);
        }
      }
    } catch (e) {
      console.error('[TagGroupManager] Error loading tag groups from API:', e);
      
      // Fallback to localStorage or demo data
      try {
        const saved = localStorage.getItem('system_tag_groups');
        if (saved) {
          const data = JSON.parse(saved);
          const groups = data.tag_groups || [];
          setTagGroups(groups.length > 0 ? groups : FALLBACK_GROUPS);
          console.log(`[TagGroupManager] Loaded ${groups.length || 0} tag groups from localStorage (fallback)`);
        } else {
          setTagGroups(FALLBACK_GROUPS);
        }
      } catch (parseError) {
        console.error('[TagGroupManager] Error parsing cached tag groups:', parseError);
        setTagGroups([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadTags = async () => {
    try {
      console.log('[TagGroupManager] Loading tags from API...');
      const response = await axios.get('/api/tags', {
        params: {
          is_active: 'true' // Explicitly request active tags
        },
        timeout: 10000 // 10 second timeout
      });
      
      if (response.data.status === 'success') {
        const loadedTags = response.data.tags || [];
        console.log(`[TagGroupManager] ✅ Loaded ${loadedTags.length} tags from API`);
        setTags(loadedTags);
        
        // Cache in localStorage
        localStorage.setItem('system_tags', JSON.stringify({ tags: loadedTags }));
      } else {
        console.warn('[TagGroupManager] API returned error status, trying localStorage fallback');
        // Fallback to localStorage
        const saved = localStorage.getItem('system_tags');
        if (saved) {
          const data = JSON.parse(saved);
          setTags(data.tags || []);
          console.log(`[TagGroupManager] Loaded ${data.tags?.length || 0} tags from localStorage (fallback)`);
        } else {
          setTags([]);
        }
      }
    } catch (e) {
      console.error('[TagGroupManager] Error loading tags from API:', e);
      if (e.response) {
        console.error('[TagGroupManager] Response data:', e.response.data);
        console.error('[TagGroupManager] Response status:', e.response.status);
      }
      
      // Fallback to localStorage if API fails
      try {
        const saved = localStorage.getItem('system_tags');
        if (saved) {
          const data = JSON.parse(saved);
          setTags(data.tags || []);
          console.log(`[TagGroupManager] Loaded ${data.tags?.length || 0} tags from localStorage (fallback after error)`);
        } else {
          setTags([]);
        }
      } catch (parseError) {
        console.error('[TagGroupManager] Error parsing cached tags:', parseError);
        setTags([]);
      }
    }
  };

  const handleAdd = async () => {
    setEditingGroup(null);
    setFormData({
      group_name: '',
      description: '',
      tag_names: [],
      display_order: 0
    });
    setTagsDropdownOpen(false);
    // Reload tags when opening the form to ensure we have the latest data
    await loadTags();
    setShowForm(true);
  };

  const handleEdit = async (group) => {
    setEditingGroup(group);
    setFormData({
      group_name: group.group_name,
      description: group.description || '',
      tag_names: group.tags ? group.tags.map(t => t.tag_name) : [],
      display_order: group.display_order || 0
    });
    setTagsDropdownOpen(false);
    // Reload tags when opening the form to ensure we have the latest data
    await loadTags();
    setShowForm(true);
  };

  const handleDelete = async (groupId) => {
    if (window.confirm('Are you sure you want to delete this tag group? This action cannot be undone.')) {
      try {
        await axios.delete(`/api/tag-groups/${groupId}`);
        await loadTagGroups();
      } catch (e) {
        console.error('Error deleting tag group:', e);
        alert('Failed to delete tag group: ' + (e.response?.data?.message || e.message));
      }
    }
  };

  const handleSave = async () => {
    try {
      if (editingGroup) {
        await axios.put(`/api/tag-groups/${editingGroup.id}`, {
          group_name: formData.group_name,
          description: formData.description,
          display_order: formData.display_order
        });
        
        // Update tags in group
        if (formData.tag_names.length > 0) {
          await axios.post(`/api/tag-groups/${editingGroup.id}/tags`, {
            tag_names: formData.tag_names
          });
        }
      } else {
        const response = await axios.post('/api/tag-groups', {
          group_name: formData.group_name,
          description: formData.description,
          display_order: formData.display_order,
          tag_names: formData.tag_names
        });
        
        if (response.data.status === 'success' && formData.tag_names.length > 0) {
          await axios.post(`/api/tag-groups/${response.data.group_id}/tags`, {
            tag_names: formData.tag_names
          });
        }
      }
      
      await loadTagGroups();
      setShowForm(false);
      setEditingGroup(null);
      setTagsDropdownOpen(false);
    } catch (e) {
      console.error('Error saving tag group:', e);
      alert('Failed to save tag group: ' + (e.response?.data?.message || e.message));
    }
  };

  const filteredGroups = tagGroups.filter(group =>
    group.group_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (group.description && group.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Filter active tags - include tags where is_active is true or undefined (for backward compatibility)
  const activeTags = tags.filter(t => t.is_active !== false);
  
  // Debug logging
  useEffect(() => {
    if (tags.length > 0) {
      console.log(`[TagGroupManager] Total tags loaded: ${tags.length}`);
      console.log(`[TagGroupManager] Active tags: ${activeTags.length}`);
      console.log(`[TagGroupManager] Sample tags:`, tags.slice(0, 3));
    } else {
      console.warn('[TagGroupManager] No tags loaded. Check API response.');
    }
  }, [tags, activeTags.length]);
  
  const allTagsSelected = activeTags.length > 0 && formData.tag_names.length === activeTags.length;
  const someTagsSelected = formData.tag_names.length > 0 && formData.tag_names.length < activeTags.length;

  const handleToggleTag = (tagName) => {
    if (formData.tag_names.includes(tagName)) {
      setFormData({ ...formData, tag_names: formData.tag_names.filter(t => t !== tagName) });
    } else {
      setFormData({ ...formData, tag_names: [...formData.tag_names, tagName] });
    }
  };

  const handleSelectAll = () => {
    if (allTagsSelected) {
      setFormData({ ...formData, tag_names: [] });
    } else {
      setFormData({ ...formData, tag_names: activeTags.map(t => t.tag_name) });
    }
  };

  return (
    <div className="p-5 min-h-screen bg-transparent">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">Tag Group Management</h2>
          <p className="text-[11px] text-[#8898aa] mt-0.5">
            Group related tags together for use in dynamic tables and live monitoring
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="bg-brand hover:bg-brand-hover text-white text-[11px] font-medium rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors"
        >
          <FaPlus size={11} />
          Add Tag Group
        </button>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-[#1e2d40] border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg p-3 mb-4">
        <div className="relative">
          <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#8898aa]" size={11} />
          <input
            type="text"
            placeholder="Search tag groups..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#081320] text-[#3a4a5c] dark:text-[#c1ccd9] focus:border-brand focus:ring-1 focus:ring-[#0e74904d] focus:outline-none placeholder:text-[#8898aa] transition-colors"
          />
        </div>
      </div>

      {/* Tag Groups List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {loading ? (
          <div className="col-span-full text-center py-8">
            <FaSpinner className="animate-spin mx-auto text-[#8898aa]" size={16} />
            <p className="mt-2 text-[12px] text-[#8898aa]">Loading tag groups...</p>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="col-span-full text-center py-8 text-[12px] text-[#8898aa]">
            {tagGroups.length === 0 ? 'No tag groups created yet. Click "Add Tag Group" to create one.' : 'No tag groups match your search.'}
          </div>
        ) : (
          filteredGroups.map((group) => (
            <div
              key={group.id}
              className="bg-white dark:bg-[#1e2d40] border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg px-4 py-2.5 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0] truncate">{group.group_name}</h3>
                  {group.description && (
                    <p className="text-[11px] text-[#8898aa] mt-0.5 line-clamp-2">{group.description}</p>
                  )}
                </div>
                <div className="flex gap-1 ml-2 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(group)}
                    className="p-1.5 rounded-lg text-[#6b7f94] hover:text-brand hover:bg-brand-subtle dark:hover:bg-[#0e74901a] transition-colors"
                    title="Edit"
                  >
                    <FaEdit size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(group.id)}
                    className="p-1.5 rounded-lg text-[#6b7f94] hover:text-[#dc2626] hover:bg-[#fef2f2] dark:hover:bg-[#dc2626]/10 transition-colors"
                    title="Delete"
                  >
                    <FaTrash size={13} />
                  </button>
                </div>
              </div>
              
              <div className="mt-2">
                <p className="text-[11px] text-[#6b7f94]">
                  Tags: <span className="font-semibold text-[#3a4a5c] dark:text-[#c1ccd9]">{group.tag_count || 0}</span>
                </p>
                {group.tags && group.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {group.tags.slice(0, 5).map((tag) => (
                      <span
                        key={tag.id}
                        className="text-[10px] font-semibold rounded px-2 py-0.5 bg-[#f5f8fb] dark:bg-[#081320] text-[#3a4a5c] dark:text-[#c1ccd9] border border-[#e3e9f0] dark:border-[#1e2d40]"
                      >
                        {tag.tag_name}
                      </span>
                    ))}
                    {group.tags.length > 5 && (
                      <span className="text-[10px] font-semibold rounded px-2 py-0.5 text-[#8898aa]">
                        +{group.tags.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-[#081320] rounded-xl border border-[#e3e9f0] dark:border-[#1e2d40] shadow-xl max-w-6xl w-full h-[85vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-white dark:bg-[#081320] border-b border-[#e3e9f0] dark:border-[#1e2d40] px-5 py-3 flex justify-between items-center flex-shrink-0">
              <h3 className="text-[14px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">
                {editingGroup ? 'Edit Tag Group' : 'Create Tag Group'}
              </h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingGroup(null);
                  setTagsDropdownOpen(false);
                }}
                className="p-1.5 rounded-lg text-[#6b7f94] hover:text-[#dc2626] hover:bg-[#fef2f2] dark:hover:bg-[#dc2626]/10 transition-colors"
              >
                <FaTimes size={13} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-5 py-4 space-y-4 flex-1 overflow-hidden flex flex-col">
              {/* Group Name */}
              <div>
                <label className="block text-[11px] font-semibold text-[#6b7f94] uppercase tracking-wide mb-1.5">
                  Group Name <span className="text-[#dc2626]">*</span>
                </label>
                <input
                  type="text"
                  value={formData.group_name}
                  onChange={(e) => setFormData({ ...formData, group_name: e.target.value })}
                  className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#081320] text-[#3a4a5c] dark:text-[#c1ccd9] focus:border-brand focus:ring-1 focus:ring-[#0e74904d] focus:outline-none placeholder:text-[#8898aa] transition-colors"
                  placeholder="e.g., Sender Sources"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-semibold text-[#6b7f94] uppercase tracking-wide mb-1.5">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#081320] text-[#3a4a5c] dark:text-[#c1ccd9] focus:border-brand focus:ring-1 focus:ring-[#0e74904d] focus:outline-none placeholder:text-[#8898aa] transition-colors resize-none"
                  rows="3"
                  placeholder="Optional description"
                />
              </div>

              {/* Tags Dropdown */}
              <div className="flex-1 flex flex-col min-h-0">
                <label className="block text-[11px] font-semibold text-[#6b7f94] uppercase tracking-wide mb-1.5 flex-shrink-0">
                  Tags
                </label>
                <div className="relative flex-1 flex flex-col min-h-0" ref={tagsDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setTagsDropdownOpen(!tagsDropdownOpen)}
                    className="w-full px-3 py-1.5 text-[12px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#081320] text-[#3a4a5c] dark:text-[#c1ccd9] flex items-center justify-between hover:border-brand focus:outline-none focus:ring-1 focus:ring-[#0e74904d] transition-colors flex-shrink-0"
                  >
                    <span>
                      {formData.tag_names.length === 0
                        ? 'Select tags...'
                        : `${formData.tag_names.length} tag${formData.tag_names.length !== 1 ? 's' : ''} selected`}
                    </span>
                    <FaChevronDown className={`text-[#8898aa] transition-transform ${tagsDropdownOpen ? 'transform rotate-180' : ''}`} size={11} />
                  </button>
                  
                  {tagsDropdownOpen && (
                    <div 
                      ref={dropdownScrollRef}
                      className="flex-1 mt-1.5 bg-white dark:bg-[#081320] border border-[#e3e9f0] dark:border-[#1e2d40] rounded-lg shadow-xl overflow-y-auto min-h-0"
                      onWheel={(e) => {
                        e.currentTarget.scrollTop += e.deltaY;
                        e.stopPropagation();
                      }}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                      style={{ scrollBehavior: 'smooth' }}
                    >
                      {/* Select All Option */}
                      <div
                        className="px-4 py-2.5 border-b border-[#e3e9f0] dark:border-[#1e2d40] hover:bg-[#f9fbfd] dark:hover:bg-[#1e2d40]/50 cursor-pointer flex items-center gap-2.5 transition-colors"
                        onClick={handleSelectAll}
                      >
                        <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-all ${
                          allTagsSelected
                            ? 'bg-brand border-brand'
                            : someTagsSelected
                            ? 'bg-brand border-brand'
                            : 'border-[#e3e9f0] dark:border-[#1e2d40]'
                        }`}>
                          {allTagsSelected && <FaCheck className="text-white" size={8} />}
                          {someTagsSelected && !allTagsSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                        </div>
                        <span className="text-[12px] font-semibold text-[#3a4a5c] dark:text-[#c1ccd9]">
                          Select All
                        </span>
                      </div>
                      
                      {/* Tag Options */}
                      {activeTags.map((tag) => {
                        const isSelected = formData.tag_names.includes(tag.tag_name);
                        return (
                          <div
                            key={tag.tag_name}
                            className="px-4 py-2.5 hover:bg-[#f9fbfd] dark:hover:bg-[#1e2d40]/50 cursor-pointer flex items-center gap-2.5 transition-colors"
                            onClick={() => handleToggleTag(tag.tag_name)}
                          >
                            <div className={`w-4 h-4 border-2 rounded flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-brand border-brand'
                                : 'border-[#e3e9f0] dark:border-[#1e2d40]'
                            }`}>
                              {isSelected && <FaCheck className="text-white" size={8} />}
                            </div>
                            <span className="text-[12px] text-[#3a4a5c] dark:text-[#c1ccd9]">
                              {tag.tag_name} {tag.display_name ? `(${tag.display_name})` : ''}
                            </span>
                          </div>
                        );
                      })}
                      
                      {activeTags.length === 0 && (
                        <div className="px-4 py-4 text-[12px] text-[#8898aa] text-center">
                          No active tags available
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {formData.tag_names.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 flex-shrink-0">
                    {formData.tag_names.slice(0, 6).map((tagName) => {
                      const tag = activeTags.find(t => t.tag_name === tagName);
                      return (
                        <span
                          key={tagName}
                          className="text-[10px] font-semibold rounded px-2 py-0.5 bg-brand-subtle dark:bg-[#0e749026] text-brand dark:text-[#6bb5e8] border border-[#0e749033] flex items-center gap-1.5"
                        >
                          {tag?.tag_name || tagName}
                          <button
                            type="button"
                            onClick={() => handleToggleTag(tagName)}
                            className="hover:text-[#dc2626] transition-colors"
                          >
                            <FaTimes size={8} />
                          </button>
                        </span>
                      );
                    })}
                    {formData.tag_names.length > 6 && (
                      <span className="text-[10px] font-semibold rounded px-2 py-0.5 text-[#8898aa]">
                        +{formData.tag_names.length - 6} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#e3e9f0] dark:border-[#1e2d40] flex-shrink-0 bg-white dark:bg-[#081320]">
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingGroup(null);
                  setTagsDropdownOpen(false);
                }}
                className="border border-[#e3e9f0] dark:border-[#1e2d40] text-[#3a4a5c] dark:text-[#c1ccd9] hover:bg-[#f5f8fb] dark:hover:bg-[#1e2d40] text-[11px] font-medium rounded-lg px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="bg-brand hover:bg-brand-hover text-white text-[11px] font-medium rounded-lg px-3 py-1.5 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TagGroupManager;
