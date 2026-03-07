import React, { useState, useEffect } from 'react';
import { useLenisScroll } from '../../Hooks/useLenisScroll';
import { FaPlus, FaEdit, FaTrash, FaSpinner, FaEye } from 'react-icons/fa';
import axios from '../../API/axios';
import { useNavigate } from 'react-router-dom';

const LayoutManager = () => {
  useLenisScroll();
  const navigate = useNavigate();
  const [layouts, setLayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLayout, setEditingLayout] = useState(null);
  const [formData, setFormData] = useState({
    layout_name: '',
    description: '',
    is_default: false
  });

  useEffect(() => {
    loadLayouts();
  }, []);

  const loadLayouts = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/live-monitor/layouts');
      if (response.data.status === 'success') {
        setLayouts(response.data.layouts || []);
      }
    } catch (e) {
      console.error('Error loading layouts:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingLayout(null);
    setFormData({
      layout_name: '',
      description: '',
      is_default: false
    });
    setShowForm(true);
  };

  const handleEdit = (layout) => {
    setEditingLayout(layout);
    setFormData({
      layout_name: layout.layout_name,
      description: layout.description || '',
      is_default: layout.is_default || false
    });
    setShowForm(true);
  };

  const handleDelete = async (layoutId) => {
    if (window.confirm('Are you sure you want to delete this layout? This action cannot be undone.')) {
      try {
        await axios.delete(`/api/live-monitor/layouts/${layoutId}`);
        await loadLayouts();
      } catch (e) {
        console.error('Error deleting layout:', e);
        alert('Failed to delete layout: ' + (e.response?.data?.message || e.message));
      }
    }
  };

  const handleSave = async () => {
    try {
      if (editingLayout) {
        await axios.put(`/api/live-monitor/layouts/${editingLayout.id}`, formData);
      } else {
        await axios.post('/api/live-monitor/layouts', formData);
      }
      await loadLayouts();
      setShowForm(false);
      setEditingLayout(null);
    } catch (e) {
      console.error('Error saving layout:', e);
      alert('Failed to save layout: ' + (e.response?.data?.message || e.message));
    }
  };

  const handlePreview = (layoutId) => {
    navigate(`/live-monitor/dynamic?layout_id=${layoutId}`);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold dark:text-gray-100">Live Monitor Layouts</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Create and manage layouts for dynamic live monitoring
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-md flex items-center gap-2"
        >
          <FaPlus />
          Create Layout
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <FaSpinner className="animate-spin text-4xl text-brand mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading layouts...</p>
        </div>
      ) : layouts.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="mb-4">No layouts created yet.</p>
          <button
            onClick={handleAdd}
            className="text-brand hover:text-brand-hover dark:text-cyan-400"
          >
            Create your first layout
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {layouts.map((layout) => (
            <div
              key={layout.id}
              className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-semibold dark:text-gray-100 flex items-center gap-2">
                    {layout.layout_name}
                    {layout.is_default && (
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs rounded">
                        Default
                      </span>
                    )}
                  </h3>
                  {layout.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{layout.description}</p>
                  )}
                </div>
              </div>
              
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handlePreview(layout.id)}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md flex items-center justify-center gap-2"
                >
                  <FaEye />
                  Preview
                </button>
                <button
                  onClick={() => handleEdit(layout)}
                  className="px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded-md"
                >
                  <FaEdit />
                </button>
                <button
                  onClick={() => handleDelete(layout.id)}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-md"
                >
                  <FaTrash />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:!bg-[#131b2d] rounded-xl shadow-xl max-w-md w-full">
            <div className="border-b border-gray-200 dark:border-gray-700 p-6 flex justify-between items-center">
              <h3 className="text-2xl font-bold dark:text-gray-100">
                {editingLayout ? 'Edit Layout' : 'Create Layout'}
              </h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingLayout(null);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Layout Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.layout_name}
                  onChange={(e) => setFormData({ ...formData, layout_name: e.target.value })}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                  placeholder="e.g., FCL Live Monitor"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
                  rows="3"
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Set as default layout
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingLayout(null);
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-md"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LayoutManager;

