import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLenisScroll } from '../../../../Hooks/useLenisScroll';
import { FaPlus, FaTrash, FaArrowLeft, FaSave, FaChartLine, FaChartBar, FaChartArea, FaChartPie } from 'react-icons/fa';
import TagSelector from '../../../../Components/Shared/TagSelector';
import DynamicChartSection from '../../../../Components/LiveMonitor/DynamicChartSection';
import axios from '../../../../API/axios';

const LiveMonitorChartSectionEditor = () => {
  useLenisScroll();
  const { id, sectionId } = useParams();
  const navigate = useNavigate();
  const [layout, setLayout] = useState(null);
  const [section, setSection] = useState(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'dataset', id: number, name: string }
  const [tagValues, setTagValues] = useState({});
  const [allTags, setAllTags] = useState([]); // All tags from system for X-axis dropdown
  const [xAxisDropdownOpen, setXAxisDropdownOpen] = useState(false);

  useEffect(() => {
    if (id && sectionId) {
      loadData();
    }
    // Load all tags for X-axis dropdown
    loadAllTags();
  }, [id, sectionId]);

  const loadAllTags = async () => {
    try {
      const response = await axios.get('/api/tags', {
        params: {
          is_active: 'true'
        },
        timeout: 10000
      });
      
      if (response.data.status === 'success') {
        setAllTags(response.data.tags || []);
      }
    } catch (e) {
      // Fallback to localStorage if API fails
      try {
        const saved = localStorage.getItem('system_tags');
        if (saved) {
          const data = JSON.parse(saved);
          setAllTags(data.tags || []);
        }
      } catch (localError) {
        console.error('Error loading tags from localStorage:', localError);
      }
    }
  };

  const loadData = () => {
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
                chart_type: 'line',
                chart_config: {
                  datasets: []
                },
                refresh_interval: 1
              };
            }
            // Ensure chart_config structure
            if (!sectionFound.config.chart_config) {
              sectionFound.config.chart_config = {
                datasets: [],
                xAxisLabel: [],
                yAxisLabel: ''
              };
            }
            // Initialize axis labels if not present
            if (!sectionFound.config.chart_config.hasOwnProperty('xAxisLabel')) {
              sectionFound.config.chart_config.xAxisLabel = [];
            }
            // Ensure xAxisLabel is an array (for backward compatibility)
            if (!Array.isArray(sectionFound.config.chart_config.xAxisLabel)) {
              sectionFound.config.chart_config.xAxisLabel = sectionFound.config.chart_config.xAxisLabel 
                ? [sectionFound.config.chart_config.xAxisLabel] 
                : [];
            }
            if (!sectionFound.config.chart_config.hasOwnProperty('yAxisLabel')) {
              sectionFound.config.chart_config.yAxisLabel = '';
            }
            if (!sectionFound.config.chart_config.datasets) {
              sectionFound.config.chart_config.datasets = [];
            }
            setSection(sectionFound);
          } else {
            alert(`Section not found. Please go back and try again.`);
            navigate(`/live-monitor/layouts/${id}`);
          }
        } else {
          alert('Layout not found');
          navigate('/live-monitor/layouts');
        }
      }
    } catch (e) {
      console.error('Error loading data:', e);
      alert('Error loading section: ' + e.message);
    }
  };

  // Load tag values for preview
  useEffect(() => {
    if (!section) return;

    const loadTagValues = async () => {
      try {
        const chartConfig = section.config?.chart_config || {};
        const datasets = chartConfig.datasets || [];
        // Get tags from xAxisLabel (array) or fall back to datasets
        const xAxisTags = Array.isArray(chartConfig.xAxisLabel) 
          ? chartConfig.xAxisLabel 
          : (chartConfig.xAxisLabel ? [chartConfig.xAxisLabel] : []);
        const datasetTagNames = datasets.map(ds => ds.tag_name).filter(Boolean);
        const tagNames = xAxisTags.length > 0 ? xAxisTags : datasetTagNames;

        if (tagNames.length === 0) {
          setTagValues({});
          return;
        }

        // Fetch tag values from API
        const response = await axios.post('/api/tags/get-values', {
          tag_names: tagNames
        });

        if (response.data.status === 'success') {
          setTagValues(response.data.tag_values || {});
        }
      } catch (e) {
        console.error('Error loading tag values:', e);
        // Use mock data for preview if API fails
        const chartConfig = section.config?.chart_config || {};
        const datasets = chartConfig.datasets || [];
        const xAxisTags = Array.isArray(chartConfig.xAxisLabel) 
          ? chartConfig.xAxisLabel 
          : (chartConfig.xAxisLabel ? [chartConfig.xAxisLabel] : []);
        const datasetTagNames = datasets.map(ds => ds.tag_name).filter(Boolean);
        const tagNamesToUse = xAxisTags.length > 0 ? xAxisTags : datasetTagNames;
        const mockValues = {};
        tagNamesToUse.forEach(tagName => {
          mockValues[tagName] = Math.random() * 100;
        });
        setTagValues(mockValues);
      }
    };

    loadTagValues();
    
    // Refresh tag values periodically
    const refreshInterval = section.config?.refresh_interval || 1;
    const interval = setInterval(loadTagValues, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [section, section?.config?.chart_config?.xAxisLabel, section?.config?.chart_config?.datasets]);

  const saveSection = () => {
    if (!layout || !section) return;
    
    try {
      const saved = localStorage.getItem('live_monitor_layouts');
      const data = saved ? JSON.parse(saved) : { layouts: [] };
      const layoutId = typeof layout.id === 'string' ? parseInt(layout.id) : layout.id;
      
      const updated = data.layouts.map(l => {
        const lId = typeof l.id === 'string' ? parseInt(l.id) : l.id;
        if (lId === layoutId) {
          const updatedSections = (l.sections || []).map(s => {
            const sId = typeof s.id === 'string' ? parseInt(s.id) : s.id;
            const sectionIdNum = typeof sectionId === 'string' ? parseInt(sectionId) : sectionId;
            if (sId === sectionIdNum) {
              return section;
            }
            return s;
          });
          return { ...l, sections: updatedSections, last_modified: new Date().toISOString() };
        }
        return l;
      });
      
      data.layouts = updated;
      localStorage.setItem('live_monitor_layouts', JSON.stringify(data));
      window.dispatchEvent(new Event('liveMonitorLayoutsUpdated'));
      
      setShowSuccessPopup(true);
      setTimeout(() => {
        setShowSuccessPopup(false);
      }, 3000);
    } catch (e) {
      console.error('Error saving section:', e);
      alert('Error saving section: ' + e.message);
    }
  };

  const updateSectionConfig = (key, value) => {
    setSection(prev => ({
      ...prev,
      config: {
        ...prev.config,
        [key]: value
      }
    }));
  };

  const updateChartConfig = (key, value) => {
    setSection(prev => ({
      ...prev,
      config: {
        ...prev.config,
        chart_config: {
          ...prev.config.chart_config,
          [key]: value
        }
      }
    }));
  };

  const addDataset = () => {
    const newDataset = {
      id: Date.now(),
      label: '',
      tag_name: '',
      color: '#3B82F6', // Default blue color
      borderWidth: 2
    };
    updateChartConfig('datasets', [...(section.config.chart_config.datasets || []), newDataset]);
  };

  const updateDataset = (datasetId, field, value) => {
    const updatedDatasets = section.config.chart_config.datasets.map(ds => 
      ds.id === datasetId ? { ...ds, [field]: value } : ds
    );
    updateChartConfig('datasets', updatedDatasets);
  };

  const removeDataset = (datasetId) => {
    const dataset = section.config.chart_config.datasets.find(ds => ds.id === datasetId);
    setDeleteConfirm({
      type: 'dataset',
      id: datasetId,
      name: dataset?.label || `Dataset ${section.config.chart_config.datasets.findIndex(ds => ds.id === datasetId) + 1}`
    });
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;

    if (deleteConfirm.type === 'dataset') {
      const updatedDatasets = section.config.chart_config.datasets.filter(ds => ds.id !== deleteConfirm.id);
      updateChartConfig('datasets', updatedDatasets);
    }
    setDeleteConfirm(null);
  };

  const chartTypes = [
    { value: 'line', label: 'Trend Line Chart', icon: FaChartLine, description: 'Display data as a continuous line over time' },
    { value: 'bar', label: 'Bar Chart', icon: FaChartBar, description: 'Display data as vertical bars' },
    { value: 'area', label: 'Area Chart', icon: FaChartArea, description: 'Display data as filled area under the line' },
    { value: 'pie', label: 'Pie Chart', icon: FaChartPie, description: 'Display data as proportional segments' }
  ];

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
  const chartConfig = config.chart_config || { datasets: [] };
  const datasets = chartConfig.datasets || [];
  
  // Get all tag names from system for X-axis dropdown
  const availableTagNames = allTags
    .filter(tag => tag.is_active)
    .map(tag => tag.tag_name)
    .sort();

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/live-monitor/layouts/${id}`)}
            className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <FaArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-2xl font-bold dark:text-gray-100">{section.section_name || 'Chart Section'}</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Configure chart visualization settings
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

      {/* Success Modal */}
      {showSuccessPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#131b2d] rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <FaSave className="text-green-600 dark:text-green-400" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Success!</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Section saved successfully</p>
              </div>
            </div>
            <button
              onClick={() => setShowSuccessPopup(false)}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-[#131b2d] rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                <FaTrash className="text-red-600 dark:text-red-400" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Confirm Delete</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Are you sure you want to delete "{deleteConfirm.name}"? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Chart Datasets */}
        <div className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-xl font-semibold dark:text-gray-100">Chart Data</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Configure chart type, refresh interval, and tag names to display in the chart
              </p>
            </div>
            <button
              onClick={addDataset}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-md flex items-center gap-2 text-sm"
            >
              <FaPlus />
              Add Dataset
            </button>
          </div>

          {/* Chart Type and Refresh Interval - Side by Side */}
          <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Chart Type Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Chart Type <span className="text-red-500">*</span>
              </label>
              <select
                value={config.chart_type || 'line'}
                onChange={(e) => updateSectionConfig('chart_type', e.target.value)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100"
              >
                {chartTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {chartTypes.find(t => t.value === (config.chart_type || 'line'))?.description}
              </p>
            </div>

            {/* Refresh Interval */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Refresh Interval (seconds) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={config.refresh_interval || 1}
                onChange={(e) => updateSectionConfig('refresh_interval', parseFloat(e.target.value) || 1)}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                How often to update the chart data (in seconds). Minimum: 0.5 seconds.
              </p>
            </div>
          </div>

          {/* X-Axis Tags Selection */}
          <div className="mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
            {/* X-Axis Label - Tag Names Dropdown with Checkboxes */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Tag Names <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setXAxisDropdownOpen(!xAxisDropdownOpen)}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100 text-left flex items-center justify-between"
                >
                  <span className="truncate">
                    {(() => {
                      const selectedTags = Array.isArray(config.chart_config?.xAxisLabel) 
                        ? config.chart_config.xAxisLabel 
                        : (config.chart_config?.xAxisLabel ? [config.chart_config.xAxisLabel] : []);
                      if (selectedTags.length === 0) {
                        return 'Select Tag Names...';
                      } else if (selectedTags.length === 1) {
                        const tag = allTags.find(t => t.tag_name === selectedTags[0]);
                        return tag ? (tag.display_name || tag.tag_name) + (tag.unit ? ` (${tag.unit})` : '') : selectedTags[0];
                      } else {
                        return `${selectedTags.length} tags selected`;
                      }
                    })()}
                  </span>
                  <svg
                    className={`w-5 h-5 transition-transform ${xAxisDropdownOpen ? 'transform rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {xAxisDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setXAxisDropdownOpen(false)}
                    />
                    <div className="absolute z-20 w-full mt-1 max-h-60 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#0b111e] shadow-lg">
                      {availableTagNames.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 p-2">Loading tag names...</p>
                      ) : (
                        availableTagNames.map(tagName => {
                          const tag = allTags.find(t => t.tag_name === tagName);
                          const selectedTags = Array.isArray(config.chart_config?.xAxisLabel) 
                            ? config.chart_config.xAxisLabel 
                            : (config.chart_config?.xAxisLabel ? [config.chart_config.xAxisLabel] : []);
                          const isChecked = selectedTags.includes(tagName);
                          return (
                            <label
                              key={tagName}
                              className="flex items-center gap-2 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const currentTags = Array.isArray(config.chart_config?.xAxisLabel) 
                                    ? config.chart_config.xAxisLabel 
                                    : (config.chart_config?.xAxisLabel ? [config.chart_config.xAxisLabel] : []);
                                  if (e.target.checked) {
                                    updateChartConfig('xAxisLabel', [...currentTags, tagName]);
                                  } else {
                                    updateChartConfig('xAxisLabel', currentTags.filter(t => t !== tagName));
                                  }
                                }}
                                className="w-4 h-4 text-brand border-gray-300 rounded focus:ring-brand dark:bg-gray-700 dark:border-gray-600"
                              />
                              <span className="text-sm text-gray-900 dark:text-gray-100">
                                {tag ? (tag.display_name || tag.tag_name) + (tag.unit ? ` (${tag.unit})` : '') : tagName}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Select multiple tag names to display as lines on the chart
              </p>
            </div>
          </div>

          {datasets.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                No datasets added yet. Click "Add Dataset" to create one.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {datasets.map((dataset, index) => (
                <div
                  key={dataset.id}
                  className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-6 h-6 rounded border-2 border-gray-300 dark:border-gray-600"
                        style={{ backgroundColor: dataset.color }}
                      />
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        Dataset {index + 1}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeDataset(dataset.id);
                      }}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 p-2"
                    >
                      <FaTrash size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Dataset Label <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={dataset.label || ''}
                        onChange={(e) => updateDataset(dataset.id, 'label', e.target.value)}
                        placeholder="e.g., Temperature, Pressure"
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Color
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={dataset.color || '#3B82F6'}
                          onChange={(e) => updateDataset(dataset.id, 'color', e.target.value)}
                          className="w-12 h-10 border border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                        />
                        <input
                          type="text"
                          value={dataset.color || '#3B82F6'}
                          onChange={(e) => updateDataset(dataset.id, 'color', e.target.value)}
                          placeholder="#3B82F6"
                          className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Border Width
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={dataset.borderWidth || 2}
                        onChange={(e) => updateDataset(dataset.id, 'borderWidth', parseInt(e.target.value) || 2)}
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#0b111e] text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chart Preview */}
        {datasets.length > 0 && (
          <div className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-semibold dark:text-gray-100">Chart Preview</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Live preview of your chart configuration
                </p>
              </div>
            </div>
            <div className="mt-4">
              <DynamicChartSection
                section={section}
                tagValues={tagValues}
                showTitle={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveMonitorChartSectionEditor;

