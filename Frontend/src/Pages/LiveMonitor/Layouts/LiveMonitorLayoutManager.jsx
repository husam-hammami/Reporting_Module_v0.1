import React, { useState, useEffect } from 'react';
import { useLenisScroll } from '../../../Hooks/useLenisScroll';
import { FaPlus, FaEdit, FaTrash, FaCopy, FaEye, FaDownload, FaUpload, FaCheck, FaTimes } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import LiveMonitorLayoutForm from './LiveMonitorLayoutForm';

const LiveMonitorLayoutManager = () => {
  useLenisScroll();
  const navigate = useNavigate();
  const [layouts, setLayouts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingLayout, setEditingLayout] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadLayouts();
    // Listen for updates
    const handleUpdate = () => loadLayouts();
    window.addEventListener('liveMonitorLayoutsUpdated', handleUpdate);
    return () => window.removeEventListener('liveMonitorLayoutsUpdated', handleUpdate);
  }, []);

  const loadLayouts = () => {
    try {
      const saved = localStorage.getItem('live_monitor_layouts');
      if (saved) {
        const data = JSON.parse(saved);
        setLayouts(data.layouts || []);
      } else {
        setLayouts([]);
      }
    } catch (e) {
      console.error('Error loading layouts:', e);
      setLayouts([]);
    }
  };

  const saveLayouts = (updatedLayouts) => {
    const data = { layouts: updatedLayouts };
    localStorage.setItem('live_monitor_layouts', JSON.stringify(data));
    setLayouts(updatedLayouts);
    window.dispatchEvent(new Event('liveMonitorLayoutsUpdated'));
  };

  const handleAdd = () => {
    setEditingLayout(null);
    setShowForm(true);
  };

  const handleEdit = (layout) => {
    setEditingLayout(layout);
    setShowForm(true);
  };

  const handleDelete = (layoutId) => {
    if (window.confirm('Are you sure you want to delete this layout? This action cannot be undone.')) {
      const updated = layouts.filter(l => l.id !== layoutId);
      saveLayouts(updated);
    }
  };

  const handleCopy = (layout) => {
    const newLayout = {
      ...layout,
      id: Date.now(),
      layout_name: `${layout.layout_name} (Copy)`,
      created_at: new Date().toISOString(),
      is_default: false
    };
    const updated = [...layouts, newLayout];
    saveLayouts(updated);
  };

  const handleToggleActive = (layoutId) => {
    const updated = layouts.map(l =>
      l.id === layoutId ? { ...l, is_active: !l.is_active } : l
    );
    saveLayouts(updated);
  };

  const handleSetDefault = (layoutId) => {
    const updated = layouts.map(l => ({
      ...l,
      is_default: l.id === layoutId
    }));
    saveLayouts(updated);
  };

  const handleSave = (layoutData) => {
    let updated;
    if (editingLayout) {
      updated = layouts.map(l => 
        l.id === editingLayout.id 
          ? { ...layoutData, id: editingLayout.id, last_modified: new Date().toISOString() }
          : l
      );
    } else {
      const newLayout = {
        ...layoutData,
        id: Date.now(),
        created_at: new Date().toISOString(),
        last_modified: new Date().toISOString(),
        created_by: 'Admin', // TODO: Get from auth context
        sections: []
      };
      updated = [...layouts, newLayout];
    }
    saveLayouts(updated);
    setShowForm(false);
    setEditingLayout(null);
  };

  const handleExport = (layout) => {
    const dataStr = JSON.stringify(layout, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${layout.layout_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        if (imported.layout_name) {
          const newLayout = {
            ...imported,
            id: Date.now(),
            layout_name: imported.layout_name + ' (Imported)',
            created_at: new Date().toISOString(),
            is_default: false
          };
          const updated = [...layouts, newLayout];
          saveLayouts(updated);
          alert('Layout imported successfully');
        } else {
          alert('Invalid layout file format');
        }
      } catch (e) {
        alert('Error importing file: ' + e.message);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const filteredLayouts = layouts.filter(l =>
    l.layout_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (l.description && l.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold dark:text-gray-100">Live Monitor Layouts</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Create and manage live monitor layouts for real-time data display
          </p>
        </div>
        <div className="flex gap-3">
          <label className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md cursor-pointer flex items-center gap-2">
            <FaUpload />
            Import
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-md flex items-center gap-2"
          >
            <FaPlus />
            Create Layout
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search layouts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
        />
      </div>

      {/* Layouts List */}
      <div className="space-y-4">
        {filteredLayouts.length === 0 ? (
          <div className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              {layouts.length === 0 
                ? 'No live monitor layouts created yet. Click "Create Layout" to get started.'
                : 'No layouts match your search.'}
            </p>
          </div>
        ) : (
          filteredLayouts.map((layout) => (
            <div
              key={layout.id}
              className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold dark:text-gray-100">{layout.layout_name}</h3>
                    {layout.is_default && (
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs font-medium">
                        Default
                      </span>
                    )}
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      layout.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                      {layout.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {layout.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{layout.description}</p>
                  )}
                  <div className="flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                    {layout.created_at && (
                      <span>Created: {new Date(layout.created_at).toLocaleDateString()}</span>
                    )}
                    {layout.last_modified && (
                      <span>Modified: {new Date(layout.last_modified).toLocaleDateString()}</span>
                    )}
                    {layout.sections && (
                      <span>{layout.sections.length} section(s)</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleActive(layout.id)}
                    className={`px-3 py-1 rounded text-sm ${
                      layout.is_active
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}
                    title={layout.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {layout.is_active ? <FaCheck /> : <FaTimes />}
                  </button>
                  <button
                    onClick={() => navigate(`/live-monitor/layouts/${layout.id}`)}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-3 py-1"
                    title="Edit Sections"
                  >
                    <FaEdit />
                  </button>
                  <button
                    onClick={() => handleCopy(layout)}
                    className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 px-3 py-1"
                    title="Copy"
                  >
                    <FaCopy />
                  </button>
                  <button
                    onClick={() => handleExport(layout)}
                    className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 px-3 py-1"
                    title="Export"
                  >
                    <FaDownload />
                  </button>
                  <button
                    onClick={() => handleSetDefault(layout.id)}
                    className="text-yellow-600 hover:text-yellow-800 dark:text-yellow-400 dark:hover:text-yellow-300 px-3 py-1"
                    title="Set as Default"
                  >
                    ⭐
                  </button>
                  <button
                    onClick={() => handleDelete(layout.id)}
                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 px-3 py-1"
                    title="Delete"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Layout Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <LiveMonitorLayoutForm
            layout={editingLayout}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setEditingLayout(null);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default LiveMonitorLayoutManager;


