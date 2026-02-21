import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLenisScroll } from '../../../Hooks/useLenisScroll';
import { FaPlus, FaEdit, FaTrash, FaArrowLeft, FaGripVertical, FaSave } from 'react-icons/fa';
import LiveMonitorSectionBuilder from './Sections/LiveMonitorSectionBuilder';

const LiveMonitorSectionEditor = () => {
  useLenisScroll();
  const { id } = useParams();
  const navigate = useNavigate();
  const [layout, setLayout] = useState(null);
  const [sections, setSections] = useState([]);
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [editingSection, setEditingSection] = useState(null);

  useEffect(() => {
    loadLayout();
  }, [id]);

  const loadLayout = () => {
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
          // Ensure sections have proper structure
          const sectionsWithConfig = (found.sections || []).map(s => ({
            ...s,
            config: s.config || (s.section_type === 'table' ? { row_mode: 'static', columns: [], refresh_interval: 1 } : s.section_type === 'kpi_cards' ? { cards: [] } : {})
          }));
          setSections(sectionsWithConfig);
        } else {
          alert('Layout not found');
          navigate('/live-monitor/layouts');
        }
      }
    } catch (e) {
      console.error('Error loading layout:', e);
    }
  };

  const saveLayout = (showAlert = true) => {
    if (!layout) return;
    
    try {
      const saved = localStorage.getItem('live_monitor_layouts');
      const data = saved ? JSON.parse(saved) : { layouts: [] };
      const layoutId = typeof layout.id === 'string' ? parseInt(layout.id) : layout.id;
      const updated = data.layouts.map(l => {
        const lId = typeof l.id === 'string' ? parseInt(l.id) : l.id;
        if (lId === layoutId) {
          return { ...layout, sections, last_modified: new Date().toISOString() };
        }
        return l;
      });
      data.layouts = updated;
      localStorage.setItem('live_monitor_layouts', JSON.stringify(data));
      window.dispatchEvent(new Event('liveMonitorLayoutsUpdated'));
      if (showAlert) {
        alert('Layout saved successfully!');
      }
    } catch (e) {
      console.error('Error saving layout:', e);
      if (showAlert) {
        alert('Error saving layout: ' + e.message);
      }
    }
  };

  const handleAddSection = () => {
    setEditingSection(null);
    setShowSectionForm(true);
  };

  const handleEditSection = (section) => {
    setEditingSection(section);
    setShowSectionForm(true);
  };

  const handleDeleteSection = (sectionId) => {
    if (window.confirm('Are you sure you want to delete this section?')) {
      const updated = sections.filter(s => s.id !== sectionId);
      setSections(updated);
    }
  };

  const handleSaveSection = (sectionData) => {
    let updated;
    if (editingSection) {
      const editId = typeof editingSection.id === 'string' ? parseInt(editingSection.id) : editingSection.id;
      updated = sections.map(s => {
        const sId = typeof s.id === 'string' ? parseInt(s.id) : s.id;
        if (sId === editId) {
          return { 
            ...sectionData, 
            id: editingSection.id,
            config: sectionData.config || (sectionData.section_type === 'table' ? { row_mode: 'static', columns: [], refresh_interval: 1 } : sectionData.section_type === 'kpi_cards' ? { cards: [] } : {})
          };
        }
        return s;
      });
    } else {
      const newSection = {
        ...sectionData,
        id: Date.now(),
        display_order: sections.length + 1,
        // Initialize config based on section type
        config: sectionData.section_type === 'table' 
          ? { row_mode: 'static', columns: [], refresh_interval: 1 }
          : sectionData.section_type === 'kpi_cards'
          ? { cards: [] }
          : sectionData.config || {}
      };
      updated = [...sections, newSection];
    }
    setSections(updated);
    // Update layout state immediately
    const updatedLayout = { ...layout, sections: updated };
    setLayout(updatedLayout);
    // Save to localStorage immediately (silently)
    saveLayout(false);
    setShowSectionForm(false);
    setEditingSection(null);
  };

  const handleReorder = (fromIndex, toIndex) => {
    const updated = [...sections];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    updated.forEach((s, idx) => {
      s.display_order = idx + 1;
    });
    setSections(updated);
  };

  if (!layout) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">Loading layout...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/live-monitor/layouts')}
            className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <FaArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-2xl font-bold dark:text-gray-100">{layout.layout_name}</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Configure sections for this live monitor layout
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={saveLayout}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md flex items-center gap-2"
          >
            <FaSave />
            Save Layout
          </button>
          <button
            onClick={handleAddSection}
            className="px-4 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-md flex items-center gap-2"
          >
            <FaPlus />
            Add Section
          </button>
        </div>
      </div>

      {/* Sections List */}
      <div className="space-y-4">
        {sections.length === 0 ? (
          <div className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No sections added yet. Click "Add Section" to create one.
            </p>
          </div>
        ) : (
          sections
            .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
            .map((section, index) => (
              <div
                key={section.id}
                className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3 flex-1">
                    <FaGripVertical className="text-gray-400 cursor-move" />
                    <div>
                      <h3 className="text-lg font-semibold dark:text-gray-100">
                        {section.section_name}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Type: {section.section_type} | Order: {section.display_order || index + 1}
                      </p>
                    </div>
                    {!section.is_active && (
                      <span className="px-2 py-1 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded text-xs">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        // Ensure layout is saved before navigating
                        saveLayout(false);
                        // Navigate to section editor based on type
                        if (section.section_type === 'Table' || section.section_type === 'table') {
                          navigate(`/live-monitor/layouts/${id}/sections/${section.id}`);
                        } else if (section.section_type === 'KPI' || section.section_type === 'kpi_cards') {
                          navigate(`/live-monitor/layouts/${id}/sections/${section.id}/kpi`);
                        } else if (section.section_type === 'Chart' || section.section_type === 'chart') {
                          navigate(`/live-monitor/layouts/${id}/sections/${section.id}/chart`);
                        } else {
                          alert(`${section.section_type} section editor coming soon!`);
                        }
                      }}
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-3 py-1"
                      title="Edit Section"
                    >
                      <FaEdit />
                    </button>
                    <button
                      onClick={() => handleDeleteSection(section.id)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 px-3 py-1"
                      title="Delete Section"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
              </div>
            ))
        )}
      </div>

      {/* Section Form Modal */}
      {showSectionForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <LiveMonitorSectionBuilder
            section={editingSection}
            onSave={handleSaveSection}
            onCancel={() => {
              setShowSectionForm(false);
              setEditingSection(null);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default LiveMonitorSectionEditor;

