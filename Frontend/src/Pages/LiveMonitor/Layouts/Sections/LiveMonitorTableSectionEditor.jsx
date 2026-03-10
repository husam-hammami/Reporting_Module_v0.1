import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLenisScroll } from '../../../../Hooks/useLenisScroll';
import { FaPlus, FaTrash, FaArrowLeft, FaSave, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import TagSelector from '../../../../Components/Shared/TagSelector';
import FormulaEditor from '../../../../Components/Shared/FormulaEditor';
import axios from '../../../../API/axios';

const LiveMonitorTableSectionEditor = () => {
  useLenisScroll();
  const { id, sectionId } = useParams();
  const navigate = useNavigate();
  const [layout, setLayout] = useState(null);
  const [section, setSection] = useState(null);
  const [tagGroups, setTagGroups] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [showFormulaEditor, setShowFormulaEditor] = useState(false);
  const [editingColumn, setEditingColumn] = useState(null);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'table' | 'row' | 'column', id: number, name: string }
  const [expandedRows, setExpandedRows] = useState(new Set()); // Track which rows are expanded
  const [expandedColumns, setExpandedColumns] = useState(new Set()); // Track which columns are expanded

  useEffect(() => {
    if (id && sectionId) {
      loadData();
    }
  }, [id, sectionId]);

  // Update selectedTableId when section changes (must be before early return)
  useEffect(() => {
    if (section?.config?.tables && section.config.tables.length > 0 && !selectedTableId) {
      setSelectedTableId(section.config.tables[0].id);
    }
  }, [section, selectedTableId]);

  const loadData = () => {
    // Load layout
    try {
      const saved = localStorage.getItem('live_monitor_layouts');
      if (saved) {
        const data = JSON.parse(saved);
        const layoutId = typeof id === 'string' ? parseInt(id) : id;
        const found = data.layouts?.find(l => {
          const lId = typeof l.id === 'string' ? parseInt(l.id) : l.id;
          return lId === layoutId;
        });
        
        if (found) {
          setLayout(found);
          const sectionIdNum = typeof sectionId === 'string' ? parseInt(sectionId) : sectionId;
          const sectionFound = found.sections?.find(s => {
            const sId = typeof s.id === 'string' ? parseInt(s.id) : s.id;
            return sId === sectionIdNum;
          });
          
          if (sectionFound) {
            if (!sectionFound.config) {
              sectionFound.config = {
                row_mode: 'static',
                columns: [],
                refresh_interval: 1
              };
            }
            setSection(sectionFound);
            // selectedTableId will be initialized by useEffect when section is set
          } else {
            alert(`Section not found. Please go back and try again.`);
          }
        } else {
          alert('Layout not found');
        }
      }
    } catch (e) {
      console.error('Error loading data:', e);
      alert('Error loading section: ' + e.message);
    }

    // Load tag groups from API (with localStorage fallback)
    const loadTagGroups = async () => {
      try {
        const response = await axios.get('/api/tag-groups', {
          params: { is_active: 'true' },
          timeout: 10000
        });
        
        if (response.data.status === 'success') {
          const groups = response.data.tag_groups || [];
          setTagGroups(groups);
          console.log(`[LiveMonitorTableSectionEditor] Loaded ${groups.length} tag groups from API`);
          
          // Also update localStorage as cache
          localStorage.setItem('system_tag_groups', JSON.stringify({ tag_groups: groups }));
        } else {
          console.warn('[LiveMonitorTableSectionEditor] API returned error status, trying localStorage fallback');
          // Fallback to localStorage if API fails
          const saved = localStorage.getItem('system_tag_groups');
          if (saved) {
            const data = JSON.parse(saved);
            setTagGroups(data.tag_groups?.filter(g => g.is_active) || []);
          }
        }
      } catch (error) {
        console.error('[LiveMonitorTableSectionEditor] Error loading tag groups from API:', error);
        // Fallback to localStorage if API fails
        try {
          const saved = localStorage.getItem('system_tag_groups');
          if (saved) {
            const data = JSON.parse(saved);
            setTagGroups(data.tag_groups?.filter(g => g.is_active) || []);
            console.log('[LiveMonitorTableSectionEditor] Using cached tag groups from localStorage');
          } else {
            setTagGroups([]);
          }
        } catch (e) {
          console.error('[LiveMonitorTableSectionEditor] Error parsing cached tag groups:', e);
          setTagGroups([]);
        }
      }
    };
    
    // Call the async function
    loadTagGroups();

    // Load mappings from API
    const loadMappings = async () => {
      try {
        const res = await axios.get('/api/mappings');
        const list = (res.data?.mappings || []).filter(m => m.is_active);
        setMappings(list);
      } catch (e) {
        console.error('Error loading mappings:', e);
      }
    };
    loadMappings();
  };

  const saveSection = async () => {
    try {
      // Save to localStorage first for immediate UI update
      const saved = localStorage.getItem('live_monitor_layouts');
      const data = saved ? JSON.parse(saved) : { layouts: [] };
      const updated = data.layouts.map(l => {
        if (l.id === layout.id) {
          const updatedSections = l.sections.map(s =>
            s.id === section.id ? section : s
          );
          
          // Debug logging to verify table structure
          const savedSection = updatedSections.find(s => s.id === section.id);
          if (savedSection?.config?.tables) {
            console.log('[LiveMonitorTableSectionEditor] Saving section with tables:', {
              sectionId: savedSection.id,
              sectionName: savedSection.section_name,
              tablesCount: savedSection.config.tables.length,
              tables: savedSection.config.tables.map(t => ({
                id: t.id,
                name: t.table_name,
                columnsCount: t.columns?.length || 0,
                columns: t.columns
              }))
            });
          }
          
          return { ...l, sections: updatedSections, last_modified: new Date().toISOString() };
        }
        return l;
      });
      data.layouts = updated;
      localStorage.setItem('live_monitor_layouts', JSON.stringify(data));
      window.dispatchEvent(new Event('liveMonitorLayoutsUpdated'));
      
      // ✅ FIX: Save to database to ensure persistence
      const dbLayoutId = layout.db_id || layout.id;
      if (dbLayoutId) {
        try {
          console.log(`[LiveMonitorTableSectionEditor] Saving section config to database for layout ${layout.layout_name} (db_id: ${dbLayoutId})...`);
          await axios.put(`/api/live-monitor/layouts/${dbLayoutId}/config`, {
            config: {
              sections: updated.find(l => l.id === layout.id)?.sections || []
            }
          });
          console.log(`[LiveMonitorTableSectionEditor] ✅ Saved section config to database`);
        } catch (dbError) {
          console.error(`[LiveMonitorTableSectionEditor] ❌ Error saving to database:`, dbError);
          // Continue anyway - at least localStorage is saved
        }
      } else {
        console.warn(`[LiveMonitorTableSectionEditor] No database ID found for layout ${layout.layout_name}`);
      }
      
      setShowSuccessPopup(true);
    } catch (e) {
      console.error('Error saving section:', e);
      alert('Error saving section');
    }
  };

  const updateSectionConfig = (field, value) => {
    if (isLegacyMode) {
      // Legacy mode: update section.config directly
      setSection(prev => ({
        ...prev,
        config: {
          ...prev.config,
          [field]: value
        }
      }));
    } else {
      // Multi-table mode: update current table
      setSection(prev => {
        const updatedTables = (prev.config?.tables || []).map(table => {
          if (table.id === selectedTableId) {
            if (field === 'columns' || field === 'table_config' || field === 'table_name') {
              const updatedTable = {
                ...table,
                [field]: value
              };
              
              // Debug logging for column updates
              if (field === 'columns') {
                console.log('[LiveMonitorTableSectionEditor] Updating columns for table:', {
                  tableId: selectedTableId,
                  tableName: table.table_name,
                  columnsCount: Array.isArray(value) ? value.length : 0,
                  columns: value
                });
              }
              
              return updatedTable;
            } else {
              // Update nested table_config
              return {
                ...table,
                table_config: {
                  ...table.table_config,
                  [field]: value
                }
              };
            }
          }
          return table;
        });
        return {
          ...prev,
          config: {
            ...prev.config,
            tables: updatedTables
          }
        };
      });
    }
  };

  const addColumn = () => {
    const newColumn = {
      id: Date.now(),
      column_label: '',
      source_type: 'tag',
      tag_name: '',
      formula: '',
      mapping_name: '',
      unit: '',
      decimals: 2,
      alignment: 'left',
      display_order: columns.length + 1,
      column_type: 'data' // Default to data column
    };
    updateSectionConfig('columns', [...columns, newColumn]);
    // Auto-expand new column
    setExpandedColumns(prev => new Set([...prev, newColumn.id]));
  };

  const addHeadingColumn = () => {
    const newColumn = {
      id: Date.now(),
      column_label: '',
      column_type: 'heading', // Mark as heading column
      source_type: 'tag',
      tag_name: '',
      formula: '',
      mapping_name: '',
      unit: '',
      decimals: 2,
      alignment: 'left',
      display_order: columns.length + 1
    };
    updateSectionConfig('columns', [...columns, newColumn]);
    // Auto-expand new column
    setExpandedColumns(prev => new Set([...prev, newColumn.id]));
  };

  const updateColumn = (columnId, field, value) => {
    const updated = columns.map(col =>
      col.id === columnId ? { ...col, [field]: value } : col
    );
    updateSectionConfig('columns', updated);
  };

  const deleteColumn = (columnId) => {
    const column = columns.find(col => col.id === columnId);
    setDeleteConfirm({
      type: 'column',
      id: columnId,
      name: column?.column_label || 'Unnamed Column'
    });
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;

    if (deleteConfirm.type === 'table') {
      const updatedTables = tables.filter(t => t.id !== deleteConfirm.id);
      setSection(prev => ({
        ...prev,
        config: {
          ...prev.config,
          tables: updatedTables
        }
      }));
      if (updatedTables.length > 0) {
        setSelectedTableId(updatedTables[0].id);
      }
    } else if (deleteConfirm.type === 'row') {
      const updated = getCurrentStaticRows().filter((_, i) => i !== deleteConfirm.id);
      updateStaticRows(updated);
    } else if (deleteConfirm.type === 'column') {
      const updated = columns.filter(col => col.id !== deleteConfirm.id);
    updateSectionConfig('columns', updated);
    }
    setDeleteConfirm(null);
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

  const config = section.config || {};
  // Support multiple tables per section
  const tables = config.tables || [];
  
  // If no tables exist yet, use legacy single table structure
  const isLegacyMode = tables.length === 0;
  const currentTable = tables.find(t => t.id === selectedTableId) || null;
  
  // For legacy mode, use section.config directly
  const columns = isLegacyMode ? (config.columns || []) : (currentTable?.columns || []);
  const rowMode = isLegacyMode ? (config.row_mode || 'static') : (currentTable?.table_config?.row_mode || 'static');
  const tagGroup = isLegacyMode ? (config.tag_group || '') : (currentTable?.table_config?.tag_group || '');
  const refreshInterval = isLegacyMode ? (config.refresh_interval || 1) : (currentTable?.table_config?.refresh_interval || 1);
  
  // Helper function to get current static rows
  const getCurrentStaticRows = () => {
    return isLegacyMode 
      ? (config.static_rows || [])
      : (currentTable?.table_config?.static_rows || []);
  };
  
  // Helper function to update static rows
  const updateStaticRows = (newRows) => {
    updateSectionConfig('static_rows', newRows);
  };

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
            <h2 className="text-3xl font-bold dark:text-gray-100">{section.section_name}</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1 text-lg">
              Configure table columns and data sources for live monitoring
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

      {/* Tables Management */}
      <div className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-semibold dark:text-gray-100">Tables</h3>
          <button
            onClick={() => {
              const currentTables = section.config?.tables || [];
              
              // If this is the first table, migrate existing config
              if (currentTables.length === 0 && isLegacyMode) {
                // Migrate existing config to first table
                const newTable = {
                  id: Date.now(),
                  table_name: section.section_name || 'Table 1',
                  columns: config.columns || [],
                  table_config: {
                    row_mode: config.row_mode || 'static',
                    static_rows: config.static_rows || [],
                    refresh_interval: config.refresh_interval || 1,
                    tag_group: config.tag_group || ''
                  }
                };
                const updatedTables = [newTable];
                setSection(prev => ({
                  ...prev,
                  config: {
                    ...prev.config,
                    tables: updatedTables,
                    // Keep legacy fields for backward compatibility, but tables take precedence
                    columns: prev.config?.columns || [],
                    row_mode: prev.config?.row_mode || 'static',
                    static_rows: prev.config?.static_rows || [],
                    refresh_interval: prev.config?.refresh_interval || 1
                  }
                }));
                setSelectedTableId(newTable.id);
              } else {
                // Add a new table
                const newTable = {
                  id: Date.now(),
                  table_name: `Table ${currentTables.length + 1}`,
                  columns: [],
                  table_config: {
                    row_mode: 'static',
                    static_rows: [],
                    refresh_interval: 1
                  }
                };
                const updatedTables = [...currentTables, newTable];
                setSection(prev => ({
                  ...prev,
                  config: {
                    ...prev.config,
                    tables: updatedTables
                  }
                }));
                setSelectedTableId(newTable.id);
              }
            }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md flex items-center gap-2"
          >
            <FaPlus />
            Add Table
          </button>
        </div>
          
        {/* Table Tabs */}
        {tables.length > 0 && (
          <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
            {tables.map((table) => (
              <button
                key={table.id}
                onClick={() => setSelectedTableId(table.id)}
                className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
                  selectedTableId === table.id
                    ? 'border-brand text-brand dark:text-cyan-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {table.table_name || `Table ${tables.indexOf(table) + 1}`}
              </button>
            ))}
          </div>
        )}
        
        {/* Show message if no tables yet */}
        {tables.length === 0 && (
          <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm border-2 border-dashed border-gray-300 dark:border-gray-700 rounded mb-4">
            <p className="mb-2">No tables added yet.</p>
            <p>Click "Add Table" to create your first table. Existing configuration will be migrated to the first table.</p>
          </div>
        )}
        
        {/* Current Table Name Editor */}
        {currentTable && (
            <div className="mb-4 flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Table Name
                </label>
                <input
                  type="text"
                  value={currentTable.table_name || ''}
                  onChange={(e) => {
                    const updatedTables = tables.map(t =>
                      t.id === selectedTableId ? { ...t, table_name: e.target.value } : t
                    );
                    setSection(prev => ({
                      ...prev,
                      config: {
                        ...prev.config,
                        tables: updatedTables
                      }
                    }));
                  }}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                  placeholder="e.g., Setpoints, Sender, Receiver"
                />
              </div>
              {tables.length > 1 && (
                <button
                  onClick={() => {
                    setDeleteConfirm({
                      type: 'table',
                      id: selectedTableId,
                      name: currentTable?.table_name || 'Unnamed Table'
                    });
                  }}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md flex items-center gap-2"
                >
                  <FaTrash />
                  Delete Table
                </button>
              )}
            </div>
          )}
      </div>

      {/* Refresh Interval */}
      <div className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6 mb-6">
        <h3 className="text-2xl font-semibold dark:text-gray-100 mb-4">Refresh Settings</h3>
        <div>
          <label className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            Refresh Interval (seconds) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={refreshInterval}
            onChange={(e) => updateSectionConfig('refresh_interval', parseFloat(e.target.value) || 1)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
          />
          <p className="text-base text-gray-500 dark:text-gray-400 mt-1">
            How often to update the table data (in seconds). Minimum: 0.5 seconds.
          </p>
        </div>
      </div>

      {/* Columns Configuration - MOVED TO TOP */}
      <div className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-2xl font-semibold dark:text-gray-100">Columns</h3>
            {!isLegacyMode && currentTable && (
              <p className="text-lg text-gray-500 dark:text-gray-400 mt-1">
                Configuring columns for: <span className="font-medium text-gray-700 dark:text-gray-300">{currentTable.table_name || 'Unnamed Table'}</span>
              </p>
            )}
          </div>
          <button
            onClick={addColumn}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md flex items-center gap-2 text-sm"
          >
            <FaPlus />
            Add Column
          </button>
        </div>

        {columns.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No columns added yet. Click "Add Column" to create one.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {columns.map((column) => {
              const isExpanded = expandedColumns.has(column.id);
              const isHeading = column.column_type === 'heading';
              
              return (
                <div
                  key={column.id}
                  className={`rounded-lg overflow-hidden ${
                    isHeading 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' 
                      : 'border border-gray-200 dark:border-cyan-900 bg-gray-50 dark:bg-gray-800'
                  }`}
                >
                  {/* Collapsed Header - Always Visible */}
                  <div 
                    className="p-3 flex justify-between items-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => {
                      const newExpanded = new Set(expandedColumns);
                      if (isExpanded) {
                        newExpanded.delete(column.id);
                      } else {
                        newExpanded.add(column.id);
                      }
                      setExpandedColumns(newExpanded);
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {isExpanded ? (
                        <FaChevronUp className="text-gray-500 dark:text-gray-400" size={14} />
                      ) : (
                        <FaChevronDown className="text-gray-500 dark:text-gray-400" size={14} />
                      )}
                      <div className="flex-1">
                        <div className={`font-medium ${isHeading ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>
                          {isHeading ? '📌 ' : ''}{column.column_label || (isHeading ? 'Unnamed Heading' : 'Unnamed Column')}
                        </div>
                        {!isExpanded && !isHeading && (
                          <div className="text-base text-gray-500 dark:text-gray-400 mt-1">
                            Alignment: {column.alignment || 'left'}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteColumn(column.id);
                      }}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 p-2"
                    >
                      <FaTrash size={14} />
                    </button>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                      {/* For heading columns, only show label field */}
                      {isHeading ? (
                        <div>
                          <label className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Heading Text <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={column.column_label || ''}
                            onChange={(e) => updateColumn(column.id, 'column_label', e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full p-2 text-base border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                            placeholder="e.g., Micro Ingredient 1, Setpoint Values"
                          />
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 italic">
                            This column will be displayed as a heading row in the table, spanning all columns.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Column Name */}
                          <div>
                            <label className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Column Name <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="text"
                              value={column.column_label || ''}
                              onChange={(e) => updateColumn(column.id, 'column_label', e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                              placeholder="e.g., Bran reciver, Weight, Material"
                            />
                            <p className="text-base text-gray-500 dark:text-gray-400 mt-1">
                              Simple column name. Tag and unit are configured per row.
                            </p>
                          </div>

                          {/* Alignment */}
                          <div>
                            <label className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Alignment
                            </label>
                            <select
                              value={column.alignment || 'left'}
                              onChange={(e) => updateColumn(column.id, 'alignment', e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                            >
                              <option value="left">Left</option>
                              <option value="center">Center</option>
                              <option value="right">Right</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Row Mode Configuration */}
      <div className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6 mb-6">
        <h3 className="text-2xl font-semibold dark:text-gray-100 mb-4">Row Mode</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <input
              type="radio"
              id="static"
              name="row_mode"
              checked={rowMode === 'static'}
              onChange={() => updateSectionConfig('row_mode', 'static')}
              className="w-4 h-4"
            />
            <label htmlFor="static" className="text-gray-700 dark:text-gray-300 text-lg">
              Static Rows (Fixed number of rows, each configured individually)
            </label>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="radio"
              id="dynamic"
              name="row_mode"
              checked={rowMode === 'dynamic'}
              onChange={() => updateSectionConfig('row_mode', 'dynamic')}
              className="w-4 h-4"
            />
            <label htmlFor="dynamic" className="text-gray-700 dark:text-gray-300 text-lg">
              Dynamic Rows (From Tag Group - each tag becomes a row)
            </label>
          </div>
        </div>

        {rowMode === 'dynamic' && (
          <div className="mt-4">
            <label className="block text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tag Group <span className="text-red-500">*</span>
            </label>
            <select
              value={tagGroup}
              onChange={(e) => updateSectionConfig('tag_group', e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
            >
              <option value="">Select Tag Group...</option>
              {tagGroups.map(group => (
                <option key={group.id} value={group.group_name}>
                  {group.group_name}
                </option>
              ))}
            </select>
            <p className="text-base text-gray-500 dark:text-gray-400 mt-1">
              Each tag in this group will become a table row. Column values will come from each tag.
            </p>
          </div>
        )}
      </div>

      {/* Headings and Rows Section - Combined */}
        {rowMode === 'static' && (
        <div className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
              <div>
              <h3 className="text-2xl font-semibold dark:text-gray-100">Headings and Rows</h3>
                {!isLegacyMode && currentTable && (
                <p className="text-lg text-gray-500 dark:text-gray-400 mt-1">
                  Configure headings and rows for: <span className="font-medium text-gray-700 dark:text-gray-300">{currentTable.table_name || 'Unnamed Table'}</span>
                  </p>
                )}
              <p className="text-base text-gray-500 dark:text-gray-400 mt-1">
                Add headings to group rows, or add rows directly. Each heading can have multiple rows associated with it.
              </p>
              </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  // Create data row with cell configs for each data column
                  const dataColumns = columns.filter(col => col.column_type !== 'heading');
                  if (dataColumns.length === 0) {
                    alert('Please add columns first before adding rows.');
                    return;
                  }
                  const cellConfigs = dataColumns.map(col => ({
                    column_id: col.id,
                    tag_name: '',
                    unit: '',
                    display_type: 'value',
                    manual_name: '',
                    use_manual_name: false,
                    display_as_checkbox: false
                  }));
                  const newRow = {
                    id: Date.now(),
                    row_label: '',
                    row_type: 'data',
                    cells: cellConfigs
                  };
                  const currentRows = getCurrentStaticRows();
                  // Find the first heading index
                  const firstHeadingIndex = currentRows.findIndex(r => r.row_type === 'heading');
                  if (firstHeadingIndex === -1) {
                    // No headings, add at the end
                  updateStaticRows([...currentRows, newRow]);
                  } else {
                    // Add after the last ungrouped row (before first heading)
                    const updated = [...currentRows];
                    updated.splice(firstHeadingIndex, 0, newRow);
                    updateStaticRows(updated);
                  }
                  setExpandedRows(prev => new Set([...prev, newRow.id]));
                }}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md flex items-center gap-2 text-sm"
              >
                <FaPlus />
                Add Row
              </button>
              <button
                onClick={() => {
                  // Create heading row (no cells needed)
                  const newRow = {
                    id: Date.now(),
                    row_label: '',
                    row_type: 'heading', // Mark as heading row
                    cells: []
                  };
                  const currentRows = getCurrentStaticRows();
                  updateStaticRows([...currentRows, newRow]);
                  // Auto-expand new row
                  setExpandedRows(prev => new Set([...prev, newRow.id]));
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md flex items-center gap-2 text-sm"
              >
                <FaPlus />
                Add Heading
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {(() => {
              const allRows = getCurrentStaticRows();
              
              // Group rows: rows after a heading belong to that heading
              const groups = [];
              let currentHeading = null;
              let currentGroupRows = [];
              
              allRows.forEach((row) => {
                if (row.row_type === 'heading') {
                  // Save previous group
                  if (currentHeading) {
                    groups.push({ heading: currentHeading, rows: currentGroupRows });
                  }
                  // Start new group
                  currentHeading = row;
                  currentGroupRows = [];
                } else {
                  // Add to current group (or ungrouped if no heading)
                  if (currentHeading) {
                    currentGroupRows.push(row);
                  } else {
                    // Ungrouped row - create a group for it
                    if (currentGroupRows.length === 0) {
                      groups.push({ heading: null, rows: [row] });
                    } else {
                      currentGroupRows.push(row);
                    }
                  }
                }
              });
              
              // Add last group
              if (currentHeading) {
                groups.push({ heading: currentHeading, rows: currentGroupRows });
              }
              
              return (
                <>
                  {groups.map((group, groupIdx) => {
                    if (!group.heading) {
                      // Ungrouped rows
                      return (
                        <div key={`ungrouped-${groupIdx}`} className="space-y-4">
                          <h4 className="text-lg font-semibold dark:text-gray-200">Rows (No Heading)</h4>
                          {group.rows.map((row) => {
                            const rowIdx = allRows.findIndex(r => r.id === row.id);
                            const isExpanded = expandedRows.has(row.id);
                            const rowCells = row.cells || [];
                            const dataColumns = columns.filter(col => col.column_type !== 'heading');
                            const configuredCells = rowCells.filter(cell => cell.tag_name || cell.manual_name).length;
                            const totalColumns = dataColumns.length;
                            
                            return (
                              <div key={row.id} className="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <div 
                                  className="p-3 flex justify-between items-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                  onClick={() => {
                                    const newExpanded = new Set(expandedRows);
                                    if (isExpanded) {
                                      newExpanded.delete(row.id);
                                    } else {
                                      newExpanded.add(row.id);
                                    }
                                    setExpandedRows(newExpanded);
                                  }}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    {isExpanded ? (
                                      <FaChevronUp className="text-gray-500 dark:text-gray-400" size={14} />
                                    ) : (
                                      <FaChevronDown className="text-gray-500 dark:text-gray-400" size={14} />
                                    )}
                                    <div className="flex-1">
                                      <div className="font-medium text-gray-900 dark:text-white">
                                        {row.row_label || `Row ${rowIdx + 1}`}
                                      </div>
                                      {!isExpanded && (
                                        <div className="text-base text-gray-500 dark:text-gray-400 mt-1">
                                          {configuredCells > 0 ? `${configuredCells} of ${totalColumns} columns configured` : 'No columns configured'}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const updated = getCurrentStaticRows().filter(r => r.id !== row.id);
                                      updateStaticRows(updated);
                                    }}
                                    className="text-red-600 hover:text-red-800 dark:text-red-400 p-2"
                                  >
                                    <FaTrash size={14} />
                                  </button>
                                </div>
                                
                                {isExpanded && (
                                  <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                                    <div className="mb-3">
                    <input
                      type="text"
                      value={row.row_label || ''}
                      onChange={(e) => {
                        const updated = [...getCurrentStaticRows()];
                                          const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                          if (updatedRowIdx >= 0) {
                                            updated[updatedRowIdx].row_label = e.target.value;
                        updateStaticRows(updated);
                                          }
                      }}
                      placeholder="Row label (e.g., Bran Fine)"
                                        className="w-full p-2 text-base border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                                        onClick={(e) => e.stopPropagation()}
                                      />
                  </div>
                  
                  {/* Cell configuration for each column */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                      {dataColumns.map((column) => {
                      const cellConfig = (row.cells || []).find(c => c.column_id === column.id) || {
                        column_id: column.id,
                        tag_name: '',
                        unit: '',
                                          display_type: 'value',
                                          manual_name: ''
                      };
                      
                      return (
                        <div key={column.id} className="p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                                            <div className="text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
                            {column.column_label || 'Unnamed Column'}
                          </div>
                          <div className="space-y-2">
                            <div>
                                                <label className="block text-base text-gray-600 dark:text-gray-400 mb-1">
                                Display Type <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={cellConfig.display_type || 'value'}
                                onChange={(e) => {
                                  const updated = [...getCurrentStaticRows()];
                                                    const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                    if (updatedRowIdx >= 0) {
                                                      if (!updated[updatedRowIdx].cells) {
                                                        const dataColumns = columns.filter(col => col.column_type !== 'heading');
                                                        updated[updatedRowIdx].cells = dataColumns.map(col => ({
                                      column_id: col.id,
                                      tag_name: '',
                                      unit: '',
                                      display_type: 'value',
                                      manual_name: '',
                                      use_manual_name: false,
                                      display_as_checkbox: false
                                    }));
                                  }
                                                      const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                  if (cellIdx >= 0) {
                                                        updated[updatedRowIdx].cells[cellIdx].display_type = e.target.value;
                                    // Clear manual_name when switching away from 'name'
                                    if (e.target.value !== 'name') {
                                                          updated[updatedRowIdx].cells[cellIdx].manual_name = '';
                                                          updated[updatedRowIdx].cells[cellIdx].use_manual_name = false;
                                    }
                                  } else {
                                                        updated[updatedRowIdx].cells.push({
                                      column_id: column.id,
                                      tag_name: '',
                                      unit: '',
                                      display_type: e.target.value,
                                      manual_name: '',
                                      use_manual_name: false,
                                      display_as_checkbox: false
                                    });
                                  }
                                  updateStaticRows(updated);
                                                    }
                                }}
                                className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                                                  onClick={(e) => e.stopPropagation()}
                              >
                                <option value="name">Tag Name</option>
                                <option value="value">Tag Value</option>
                              </select>
                            </div>
                            {cellConfig.display_type === 'name' && (
                              <div>
                                                  <label className="block text-base text-gray-600 dark:text-gray-400 mb-1">
                                  Name Source
                                </label>
                                <select
                                  value={cellConfig.use_manual_name ? 'manual' : 'tag'}
                                  onChange={(e) => {
                                    const updated = [...getCurrentStaticRows()];
                                                      const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                      if (updatedRowIdx >= 0) {
                                                        if (!updated[updatedRowIdx].cells) {
                                                          const dataColumns = columns.filter(col => col.column_type !== 'heading');
                                                          updated[updatedRowIdx].cells = dataColumns.map(col => ({
                                        column_id: col.id,
                                        tag_name: '',
                                        unit: '',
                                        display_type: 'value',
                                        manual_name: '',
                                        use_manual_name: false
                                      }));
                                    }
                                                        const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                    if (cellIdx >= 0) {
                                                          updated[updatedRowIdx].cells[cellIdx].use_manual_name = e.target.value === 'manual';
                                      if (e.target.value !== 'manual') {
                                                            updated[updatedRowIdx].cells[cellIdx].manual_name = '';
                                      }
                                    } else {
                                                          updated[updatedRowIdx].cells.push({
                                        column_id: column.id,
                                        tag_name: '',
                                        unit: '',
                                        display_type: 'name',
                                        use_manual_name: e.target.value === 'manual',
                                        manual_name: e.target.value === 'manual' ? '' : undefined
                                      });
                                    }
                                    updateStaticRows(updated);
                                                      }
                                  }}
                                  className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                                                    onClick={(e) => e.stopPropagation()}
                                >
                                  <option value="tag">Use Tag Name</option>
                                  <option value="manual">Enter Manually</option>
                                </select>
                              </div>
                            )}
                            {cellConfig.display_type === 'name' && cellConfig.use_manual_name && (
                              <div>
                                                  <label className="block text-base text-gray-600 dark:text-gray-400 mb-1">
                                  Manual Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={cellConfig.manual_name || ''}
                                  onChange={(e) => {
                                    const updated = [...getCurrentStaticRows()];
                                                      const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                      if (updatedRowIdx >= 0) {
                                                        if (!updated[updatedRowIdx].cells) {
                                                          const dataColumns = columns.filter(col => col.column_type !== 'heading');
                                                          updated[updatedRowIdx].cells = dataColumns.map(col => ({
                                        column_id: col.id,
                                        tag_name: '',
                                        unit: '',
                                        display_type: 'value',
                                        manual_name: '',
                                        use_manual_name: false
                                      }));
                                    }
                                                        const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                    if (cellIdx >= 0) {
                                                          updated[updatedRowIdx].cells[cellIdx].manual_name = e.target.value;
                                    } else {
                                                          updated[updatedRowIdx].cells.push({
                                        column_id: column.id,
                                        tag_name: '',
                                        unit: '',
                                        display_type: 'name',
                                        use_manual_name: true,
                                        manual_name: e.target.value
                                      });
                                    }
                                    updateStaticRows(updated);
                                                      }
                                  }}
                                  placeholder="Enter custom name..."
                                  className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                                                    onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            )}
                            {cellConfig.display_type !== 'name' || !cellConfig.use_manual_name ? (
                              <div>
                                                  <label className="block text-base text-gray-600 dark:text-gray-400 mb-1">
                                  Tag Name {cellConfig.display_type === 'value' ? <span className="text-red-500">*</span> : ''}
                                </label>
                                <TagSelector
                                  value={cellConfig.tag_name || ''}
                                  onChange={(value) => {
                                    const updated = [...getCurrentStaticRows()];
                                                      const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                      if (updatedRowIdx >= 0) {
                                                        if (!updated[updatedRowIdx].cells) {
                                                          const dataColumns = columns.filter(col => col.column_type !== 'heading');
                                                          updated[updatedRowIdx].cells = dataColumns.map(col => ({
                                        column_id: col.id,
                                        tag_name: '',
                                        unit: '',
                                        display_type: 'value',
                                        manual_name: '',
                                        use_manual_name: false
                                      }));
                                    }
                                                        const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                    if (cellIdx >= 0) {
                                                          updated[updatedRowIdx].cells[cellIdx].tag_name = value;
                                    } else {
                                                          updated[updatedRowIdx].cells.push({
                                        column_id: column.id,
                                        tag_name: value,
                                        unit: '',
                                        display_type: cellConfig.display_type || 'value',
                                        manual_name: '',
                                        use_manual_name: false
                                      });
                                    }
                                    updateStaticRows(updated);
                                                      }
                                  }}
                                  placeholder="Select Tag..."
                                  className="text-sm"
                                />
                              </div>
                            ) : null}
                            {cellConfig.display_type === 'value' && (
                              <div>
                                                  <label className="flex items-center gap-2 text-base text-gray-600 dark:text-gray-400 mb-1">
                                  <input
                                    type="checkbox"
                                    checked={cellConfig.display_as_checkbox || false}
                                    onChange={(e) => {
                                      const updated = [...getCurrentStaticRows()];
                                                        const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                        if (updatedRowIdx >= 0) {
                                                          if (!updated[updatedRowIdx].cells) {
                                                            updated[updatedRowIdx].cells = columns.map(col => ({
                                          column_id: col.id,
                                          tag_name: '',
                                          unit: '',
                                          display_type: 'value',
                                          manual_name: '',
                                          use_manual_name: false,
                                          display_as_checkbox: false
                                        }));
                                      }
                                                          const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                      if (cellIdx >= 0) {
                                                            updated[updatedRowIdx].cells[cellIdx].display_as_checkbox = e.target.checked;
                                        // Clear unit when checkbox is enabled (not needed for checkboxes)
                                        if (e.target.checked) {
                                                              updated[updatedRowIdx].cells[cellIdx].unit = '';
                                        }
                                      } else {
                                                            updated[updatedRowIdx].cells.push({
                                          column_id: column.id,
                                          tag_name: '',
                                          unit: '',
                                          display_type: 'value',
                                          manual_name: '',
                                          use_manual_name: false,
                                          display_as_checkbox: e.target.checked
                                        });
                                      }
                                      updateStaticRows(updated);
                                                        }
                                    }}
                                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                                      onClick={(e) => e.stopPropagation()}
                                  />
                                  <span>Display as Checkbox (for boolean values)</span>
                                </label>
                                                  <p className="text-base text-gray-500 dark:text-gray-400 mt-1">
                                  When enabled, 1 = checked, 0 = unchecked
                                </p>
                              </div>
                            )}
                            {!cellConfig.display_as_checkbox && (
                              <div>
                                                  <label className="block text-base text-gray-600 dark:text-gray-400 mb-1">
                                  Unit
                                </label>
                                <input
                                  type="text"
                                  value={cellConfig.unit || ''}
                                  onChange={(e) => {
                                    const updated = [...getCurrentStaticRows()];
                                                      const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                      if (updatedRowIdx >= 0) {
                                                        if (!updated[updatedRowIdx].cells) {
                                                          updated[updatedRowIdx].cells = [];
                                    }
                                                        const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                    if (cellIdx >= 0) {
                                                          updated[updatedRowIdx].cells[cellIdx].unit = e.target.value;
                                    } else {
                                                          updated[updatedRowIdx].cells.push({
                                        column_id: column.id,
                                        tag_name: '',
                                        unit: e.target.value,
                                        display_type: 'value',
                                        manual_name: '',
                                        use_manual_name: false,
                                        display_as_checkbox: false
                                      });
                                    }
                                    updateStaticRows(updated);
                                                      }
                                  }}
                                  placeholder="e.g., kg, t/h, %"
                                  className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                                                    onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
                            );
                          })}
                          <button
                            onClick={() => {
                              const dataColumns = columns.filter(col => col.column_type !== 'heading');
                              const cellConfigs = dataColumns.map(col => ({
                                column_id: col.id,
                                tag_name: '',
                                unit: '',
                                display_type: 'value',
                                manual_name: '',
                                use_manual_name: false,
                                display_as_checkbox: false
                              }));
                              const newRow = {
                                id: Date.now(),
                                row_label: '',
                                row_type: 'data',
                                cells: cellConfigs
                              };
                              const currentRows = getCurrentStaticRows();
                              // Find the first heading index
                              const firstHeadingIndex = currentRows.findIndex(r => r.row_type === 'heading');
                              if (firstHeadingIndex === -1) {
                                // No headings, add at the end
                                updateStaticRows([...currentRows, newRow]);
                              } else {
                                // Add before first heading (after all ungrouped rows)
                                const updated = [...currentRows];
                                updated.splice(firstHeadingIndex, 0, newRow);
                                updateStaticRows(updated);
                              }
                              setExpandedRows(prev => new Set([...prev, newRow.id]));
                            }}
                            className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md flex items-center justify-center gap-2"
                          >
                            <FaPlus size={12} />
                            Add Row (No Heading)
                          </button>
          </div>
                      );
                    }
                    
                    // Heading with rows
                    const isHeadingExpanded = expandedRows.has(group.heading.id);
                    const headingIndex = allRows.findIndex(r => r.id === group.heading.id);
                    
                    return (
                      <div key={group.heading.id} className="border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
                        {/* Heading Card */}
                        <div className="bg-blue-50 dark:bg-blue-900/20">
                          <div 
                            className="p-3 flex justify-between items-center cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                            onClick={() => {
                              const newExpanded = new Set(expandedRows);
                              if (isHeadingExpanded) {
                                newExpanded.delete(group.heading.id);
                              } else {
                                newExpanded.add(group.heading.id);
                              }
                              setExpandedRows(newExpanded);
                            }}
                          >
                            <div className="flex items-center gap-3 flex-1">
                              {isHeadingExpanded ? (
                                <FaChevronUp className="text-blue-600 dark:text-blue-400" size={14} />
                              ) : (
                                <FaChevronDown className="text-blue-600 dark:text-blue-400" size={14} />
                              )}
                              <div className="flex-1">
                                <div className="font-medium text-blue-700 dark:text-blue-300">
                                  📌 {group.heading.row_label || `Heading ${groupIdx + 1}`}
      </div>
                                {!isHeadingExpanded && (
                                  <div className="text-base text-blue-600 dark:text-blue-400 mt-1">
                                    {group.rows.length} row(s) under this heading
                                  </div>
            )}
                              </div>
          </div>
          <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const updated = getCurrentStaticRows().filter(r => r.id !== group.heading.id);
                                updateStaticRows(updated);
                              }}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 p-2"
          >
                              <FaTrash size={14} />
          </button>
        </div>

                          {isHeadingExpanded && (
                            <div className="p-4 border-t border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800">
                              <input
                                type="text"
                                value={group.heading.row_label || ''}
                                onChange={(e) => {
                                  const updated = [...getCurrentStaticRows()];
                                  const rowIndex = updated.findIndex(r => r.id === group.heading.id);
                                  if (rowIndex >= 0) {
                                    updated[rowIndex].row_label = e.target.value;
                                    updateStaticRows(updated);
                                  }
                                }}
                                placeholder="Heading text (e.g., Micro Ingredient 1)"
                                className="w-full p-2 text-base border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          )}
                        </div>
                        
                        {/* Rows under this heading */}
                        <div className="bg-white dark:bg-gray-800 p-4 space-y-3">
                          {group.rows.length === 0 ? (
                            <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm border-2 border-dashed border-gray-300 dark:border-gray-700 rounded">
                              <p>No rows under this heading yet.</p>
          </div>
        ) : (
                            group.rows.map((row) => {
                              const rowIdx = allRows.findIndex(r => r.id === row.id);
                              const isRowExpanded = expandedRows.has(row.id);
                              const rowCells = row.cells || [];
                              const dataColumns = columns.filter(col => col.column_type !== 'heading');
                              const configuredCells = rowCells.filter(cell => cell.tag_name || cell.manual_name).length;
                              const totalColumns = dataColumns.length;
                              
                              return (
                                <div key={row.id} className="bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
                                  <div 
                                    className="p-3 flex justify-between items-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    onClick={() => {
                                      const newExpanded = new Set(expandedRows);
                                      if (isRowExpanded) {
                                        newExpanded.delete(row.id);
                                      } else {
                                        newExpanded.add(row.id);
                                      }
                                      setExpandedRows(newExpanded);
                                    }}
              >
                                    <div className="flex items-center gap-3 flex-1">
                                      {isRowExpanded ? (
                                        <FaChevronUp className="text-gray-500 dark:text-gray-400" size={14} />
                                      ) : (
                                        <FaChevronDown className="text-gray-500 dark:text-gray-400" size={14} />
                                      )}
                                      <div className="flex-1">
                                        <div className="font-medium text-gray-900 dark:text-white">
                                          {row.row_label || `Row ${rowIdx + 1}`}
                                        </div>
                                        {!isRowExpanded && (
                                          <div className="text-base text-gray-500 dark:text-gray-400 mt-1">
                                            {configuredCells > 0 ? `${configuredCells} of ${totalColumns} columns configured` : 'No columns configured'}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                  <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const updated = getCurrentStaticRows().filter(r => r.id !== row.id);
                                        updateStaticRows(updated);
                                      }}
                                      className="text-red-600 hover:text-red-800 dark:text-red-400 p-2"
                  >
                                      <FaTrash size={14} />
                  </button>
                </div>

                                  {isRowExpanded && (
                                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                                      <div className="mb-3">
                    <input
                      type="text"
                                          value={row.row_label || ''}
                                          onChange={(e) => {
                                            const updated = [...getCurrentStaticRows()];
                                            const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                            if (updatedRowIdx >= 0) {
                                              updated[updatedRowIdx].row_label = e.target.value;
                                              updateStaticRows(updated);
                                            }
                                          }}
                                          placeholder="Row label (e.g., Bran Fine)"
                                          className="w-full p-2 text-base border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                  </div>

                                      {/* Cell configuration - simplified */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {dataColumns.map((column) => {
                                          const cellConfig = (row.cells || []).find(c => c.column_id === column.id) || {
                                            column_id: column.id,
                                            tag_name: '',
                                            unit: '',
                                            display_type: 'value',
                                            manual_name: ''
                                          };
                                          
                                          return (
                                            <div key={column.id} className="p-3 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700">
                                              <div className="text-base font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                {column.column_label || 'Unnamed Column'}
                                              </div>
                                              <div className="space-y-2">
                  <div>
                                                  <label className="block text-base text-gray-600 dark:text-gray-400 mb-1">
                                                    Display Type <span className="text-red-500">*</span>
                    </label>
                    <select
                                                    value={cellConfig.display_type || 'value'}
                                                    onChange={(e) => {
                                                      const updated = [...getCurrentStaticRows()];
                                                      const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                      if (updatedRowIdx >= 0) {
                                                        if (!updated[updatedRowIdx].cells) {
                                                          const dataColumns = columns.filter(col => col.column_type !== 'heading');
                                                          updated[updatedRowIdx].cells = dataColumns.map(col => ({
                                                            column_id: col.id,
                                                            tag_name: '',
                                                            unit: '',
                                                            display_type: 'value',
                                                            manual_name: '',
                                                            use_manual_name: false,
                                                            display_as_checkbox: false
                                                          }));
                                                        }
                                                        const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                                        if (cellIdx >= 0) {
                                                          updated[updatedRowIdx].cells[cellIdx].display_type = e.target.value;
                                                          if (e.target.value !== 'name') {
                                                            updated[updatedRowIdx].cells[cellIdx].manual_name = '';
                                                            updated[updatedRowIdx].cells[cellIdx].use_manual_name = false;
                                                          }
                                                        } else {
                                                          updated[updatedRowIdx].cells.push({
                                                            column_id: column.id,
                                                            tag_name: '',
                                                            unit: '',
                                                            display_type: e.target.value,
                                                            manual_name: '',
                                                            use_manual_name: false,
                                                            display_as_checkbox: false
                                                          });
                                                        }
                                                        updateStaticRows(updated);
                                                      }
                                                    }}
                      className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                                                    onClick={(e) => e.stopPropagation()}
                    >
                                                    <option value="name">Tag Name</option>
                                                    <option value="value">Tag Value</option>
                    </select>
                  </div>
                                                {cellConfig.display_type === 'name' && (
                                                  <div>
                                                    <label className="block text-base text-gray-600 dark:text-gray-400 mb-1">
                                                      Name Source
                                                    </label>
                                                    <select
                                                      value={cellConfig.use_manual_name ? 'manual' : 'tag'}
                                                      onChange={(e) => {
                                                        const updated = [...getCurrentStaticRows()];
                                                        const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                        if (updatedRowIdx >= 0) {
                                                          if (!updated[updatedRowIdx].cells) {
                                                            const dataColumns = columns.filter(col => col.column_type !== 'heading');
                                                            updated[updatedRowIdx].cells = dataColumns.map(col => ({
                                                              column_id: col.id,
                                                              tag_name: '',
                                                              unit: '',
                                                              display_type: 'value',
                                                              manual_name: '',
                                                              use_manual_name: false
                                                            }));
                                                          }
                                                          const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                                          if (cellIdx >= 0) {
                                                            updated[updatedRowIdx].cells[cellIdx].use_manual_name = e.target.value === 'manual';
                                                            if (e.target.value !== 'manual') {
                                                              updated[updatedRowIdx].cells[cellIdx].manual_name = '';
                                                            }
                                                          } else {
                                                            updated[updatedRowIdx].cells.push({
                                                              column_id: column.id,
                                                              tag_name: '',
                                                              unit: '',
                                                              display_type: 'name',
                                                              use_manual_name: e.target.value === 'manual',
                                                              manual_name: e.target.value === 'manual' ? '' : undefined
                                                            });
                                                          }
                                                          updateStaticRows(updated);
                                                        }
                                                      }}
                                                      className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                                                      onClick={(e) => e.stopPropagation()}
                                                    >
                                                      <option value="tag">Use Tag Name</option>
                                                      <option value="manual">Enter Manually</option>
                                                    </select>
                </div>
                                                )}
                                                {cellConfig.display_type === 'name' && cellConfig.use_manual_name && (
                                                  <div>
                                                    <label className="block text-base text-gray-600 dark:text-gray-400 mb-1">
                                                      Manual Name <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                      type="text"
                                                      value={cellConfig.manual_name || ''}
                                                      onChange={(e) => {
                                                        const updated = [...getCurrentStaticRows()];
                                                        const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                        if (updatedRowIdx >= 0) {
                                                          if (!updated[updatedRowIdx].cells) {
                                                            const dataColumns = columns.filter(col => col.column_type !== 'heading');
                                                            updated[updatedRowIdx].cells = dataColumns.map(col => ({
                                                              column_id: col.id,
                                                              tag_name: '',
                                                              unit: '',
                                                              display_type: 'value',
                                                              manual_name: '',
                                                              use_manual_name: false
                                                            }));
                                                          }
                                                          const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                                          if (cellIdx >= 0) {
                                                            updated[updatedRowIdx].cells[cellIdx].manual_name = e.target.value;
                                                          } else {
                                                            updated[updatedRowIdx].cells.push({
                                                              column_id: column.id,
                                                              tag_name: '',
                                                              unit: '',
                                                              display_type: 'name',
                                                              use_manual_name: true,
                                                              manual_name: e.target.value
                                                            });
                                                          }
                                                          updateStaticRows(updated);
                                                        }
                                                      }}
                                                      placeholder="Enter custom name..."
                                                      className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                                                      onClick={(e) => e.stopPropagation()}
                                                    />
              </div>
                                                )}
                                                {cellConfig.display_type !== 'name' || !cellConfig.use_manual_name ? (
                                                  <div>
                                                    <label className="block text-base text-gray-600 dark:text-gray-400 mb-1">
                                                      Tag Name {cellConfig.display_type === 'value' ? <span className="text-red-500">*</span> : ''}
                                                    </label>
                                                    <TagSelector
                                                      value={cellConfig.tag_name || ''}
                                                      onChange={(value) => {
                                                        const updated = [...getCurrentStaticRows()];
                                                        const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                        if (updatedRowIdx >= 0) {
                                                          if (!updated[updatedRowIdx].cells) {
                                                            const dataColumns = columns.filter(col => col.column_type !== 'heading');
                                                            updated[updatedRowIdx].cells = dataColumns.map(col => ({
                                                              column_id: col.id,
                                                              tag_name: '',
                                                              unit: '',
                                                              display_type: 'value',
                                                              manual_name: '',
                                                              use_manual_name: false
                                                            }));
                                                          }
                                                          const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                                          if (cellIdx >= 0) {
                                                            updated[updatedRowIdx].cells[cellIdx].tag_name = value;
                                                          } else {
                                                            updated[updatedRowIdx].cells.push({
                                                              column_id: column.id,
                                                              tag_name: value,
                                                              unit: '',
                                                              display_type: cellConfig.display_type || 'value',
                                                              manual_name: '',
                                                              use_manual_name: false
                                                            });
                                                          }
                                                          updateStaticRows(updated);
                                                        }
                                                      }}
                                                      placeholder="Select Tag..."
                                                      className="text-sm"
                                                    />
                                                  </div>
                                                ) : null}
                                                {cellConfig.display_type === 'value' && (
                                                  <div>
                                                    <label className="flex items-center gap-2 text-base text-gray-600 dark:text-gray-400 mb-1">
                                                      <input
                                                        type="checkbox"
                                                        checked={cellConfig.display_as_checkbox || false}
                                                        onChange={(e) => {
                                                          const updated = [...getCurrentStaticRows()];
                                                          const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                          if (updatedRowIdx >= 0) {
                                                            if (!updated[updatedRowIdx].cells) {
                                                              updated[updatedRowIdx].cells = columns.map(col => ({
                                                                column_id: col.id,
                                                                tag_name: '',
                                                                unit: '',
                                                                display_type: 'value',
                                                                manual_name: '',
                                                                use_manual_name: false,
                                                                display_as_checkbox: false
                                                              }));
                                                            }
                                                            const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                                            if (cellIdx >= 0) {
                                                              updated[updatedRowIdx].cells[cellIdx].display_as_checkbox = e.target.checked;
                                                              if (e.target.checked) {
                                                                updated[updatedRowIdx].cells[cellIdx].unit = '';
                                                              }
                                                            } else {
                                                              updated[updatedRowIdx].cells.push({
                                                                column_id: column.id,
                                                                tag_name: '',
                                                                unit: '',
                                                                display_type: 'value',
                                                                manual_name: '',
                                                                use_manual_name: false,
                                                                display_as_checkbox: e.target.checked
                                                              });
                                                            }
                                                            updateStaticRows(updated);
                                                          }
                                                        }}
                                                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                                        onClick={(e) => e.stopPropagation()}
                                                      />
                                                      <span>Display as Checkbox (for boolean values)</span>
                                                    </label>
                                                    <p className="text-base text-gray-500 dark:text-gray-400 mt-1">
                                                      When enabled, 1 = checked, 0 = unchecked
                                                    </p>
          </div>
        )}
                                                {!cellConfig.display_as_checkbox && (
                                                  <div>
                                                    <label className="block text-base text-gray-600 dark:text-gray-400 mb-1">
                                                      Unit
                                                    </label>
                                                    <input
                                                      type="text"
                                                      value={cellConfig.unit || ''}
                                                      onChange={(e) => {
                                                        const updated = [...getCurrentStaticRows()];
                                                        const updatedRowIdx = updated.findIndex(r => r.id === row.id);
                                                        if (updatedRowIdx >= 0) {
                                                          if (!updated[updatedRowIdx].cells) {
                                                            updated[updatedRowIdx].cells = [];
                                                          }
                                                          const cellIdx = updated[updatedRowIdx].cells.findIndex(c => c.column_id === column.id);
                                                          if (cellIdx >= 0) {
                                                            updated[updatedRowIdx].cells[cellIdx].unit = e.target.value;
                                                          } else {
                                                            updated[updatedRowIdx].cells.push({
                                                              column_id: column.id,
                                                              tag_name: '',
                                                              unit: e.target.value,
                                                              display_type: 'value',
                                                              manual_name: '',
                                                              use_manual_name: false,
                                                              display_as_checkbox: false
                                                            });
                                                          }
                                                          updateStaticRows(updated);
                                                        }
                                                      }}
                                                      placeholder="e.g., kg, t/h, %"
                                                      className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                                                      onClick={(e) => e.stopPropagation()}
                                                    />
      </div>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                          
                          {/* Add Row button for this heading */}
                          <button
                            onClick={() => {
                              const dataColumns = columns.filter(col => col.column_type !== 'heading');
                              const cellConfigs = dataColumns.map(col => ({
                                column_id: col.id,
                                tag_name: '',
                                unit: '',
                                display_type: 'value',
                                manual_name: '',
                                use_manual_name: false,
                                display_as_checkbox: false
                              }));
                              const newRow = {
                                id: Date.now(),
                                row_label: '',
                                row_type: 'data',
                                cells: cellConfigs
                              };
                              const currentRows = getCurrentStaticRows();
                              // Insert after the heading and its existing rows
                              const headingIndex = currentRows.findIndex(r => r.id === group.heading.id);
                              const updated = [...currentRows];
                              updated.splice(headingIndex + 1 + group.rows.length, 0, newRow);
                              updateStaticRows(updated);
                              setExpandedRows(prev => new Set([...prev, newRow.id]));
                            }}
                            className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md flex items-center justify-center gap-2"
                          >
                            <FaPlus size={12} />
                            Add Row to This Heading
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Show message if no headings and no rows */}
                  {groups.length === 0 && (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm border-2 border-dashed border-gray-300 dark:border-gray-700 rounded">
                      <p className="mb-2">No headings or rows added.</p>
                      <p className="text-xs mb-4">Click "Add Row" to add a row directly, or "Add Heading" to create a heading group.</p>
                      <button
                        onClick={() => {
                          // Create data row with cell configs for each data column
                          const dataColumns = columns.filter(col => col.column_type !== 'heading');
                          if (dataColumns.length === 0) {
                            alert('Please add columns first before adding rows.');
                            return;
                          }
                          const cellConfigs = dataColumns.map(col => ({
                            column_id: col.id,
                            tag_name: '',
                            unit: '',
                            display_type: 'value',
                            manual_name: '',
                            use_manual_name: false,
                            display_as_checkbox: false
                          }));
                          const newRow = {
                            id: Date.now(),
                            row_label: '',
                            row_type: 'data',
                            cells: cellConfigs
                          };
                          const currentRows = getCurrentStaticRows();
                          // Find the first heading index
                          const firstHeadingIndex = currentRows.findIndex(r => r.row_type === 'heading');
                          if (firstHeadingIndex === -1) {
                            // No headings, add at the end
                            updateStaticRows([...currentRows, newRow]);
                          } else {
                            // Add before first heading (after all ungrouped rows)
                            const updated = [...currentRows];
                            updated.splice(firstHeadingIndex, 0, newRow);
                            updateStaticRows(updated);
                          }
                          setExpandedRows(prev => new Set([...prev, newRow.id]));
                        }}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md flex items-center gap-2 text-sm mx-auto"
                      >
                        <FaPlus />
                        Add Row
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Formula Editor Modal */}
      {showFormulaEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <FormulaEditor
            formula={editingColumn?.formula || ''}
            onSave={(formula) => {
              if (editingColumn) {
                updateColumn(editingColumn.id, 'formula', formula);
              }
              setShowFormulaEditor(false);
              setEditingColumn(null);
            }}
            onCancel={() => {
              setShowFormulaEditor(false);
              setEditingColumn(null);
            }}
          />
        </div>
      )}

      {/* Success Popup */}
      {showSuccessPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#121e2c] rounded-lg p-6 w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30">
                <FaSave className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Section Saved Successfully!
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Your section configuration has been saved and is now active.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowSuccessPopup(false)}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#121e2c] rounded-lg p-6 w-full max-w-md shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30">
                <FaTrash className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Delete {deleteConfirm.type === 'table' ? 'Table' : deleteConfirm.type === 'row' ? 'Row' : 'Column'}?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Are you sure you want to delete <span className="font-medium text-gray-900 dark:text-white">"{deleteConfirm.name}"</span>?
                {deleteConfirm.type === 'table' && (
                  <span className="block mt-2 text-red-600 dark:text-red-400">
                    This action cannot be undone.
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-medium rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md transition-colors flex items-center gap-2"
              >
                <FaTrash />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveMonitorTableSectionEditor;

