import React, { useState, useEffect } from 'react';
import { useLenisScroll } from '../../Hooks/useLenisScroll';
import { useSocket } from '../../Context/SocketContext';
import { useNavigate } from 'react-router-dom';
import { FaSpinner, FaExclamationTriangle, FaEdit, FaPlus, FaList, FaSync } from 'react-icons/fa';
import axios from '../../API/axios';
import DynamicTableSection from '../../Components/LiveMonitor/DynamicTableSection';
import DynamicKPISection from '../../Components/LiveMonitor/DynamicKPISection';

const DB_LABELS = {
  DB199: 'DB199 (FCL)',
  DB2099: 'DB2099 (Report/Flows/MIL-A)',
  DB299: 'DB299 (SCL)',
  DB499: 'DB499 (MIL-A)',
};

const DynamicLiveMonitor = () => {
  useLenisScroll();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [layout, setLayout] = useState(null);
  const [tagValues, setTagValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [layoutId, setLayoutId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [draggedSectionId, setDraggedSectionId] = useState(null);
  const [draggedOverSectionId, setDraggedOverSectionId] = useState(null);
  // Predefined report: hardcoded integrated offsets when no layouts exist
  const [usePredefinedReport, setUsePredefinedReport] = useState(false);
  const [predefinedOffsets, setPredefinedOffsets] = useState({ DB199: [], DB2099: [], DB299: [], DB499: [] });

  // Load default layout or get from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('layout_id');
    setLayoutId(id ? parseInt(id) : null);
  }, []);

  // Load layout configuration
  useEffect(() => {
    const loadLayout = async () => {
      try {
        setLoading(true);
        setError(null);
        setUsePredefinedReport(false);

        let layoutData;
        if (layoutId) {
          // Load specific layout
          const response = await axios.get(`/api/live-monitor/layouts/${layoutId}`);
          if (response.data.status === 'success') {
            layoutData = response.data.layout;
          } else {
            throw new Error(response.data.message || 'Failed to load layout');
          }
        } else {
          // Load default layout
          const response = await axios.get('/api/live-monitor/layouts?is_active=true');
          if (response.data.status === 'success' && response.data.layouts.length > 0) {
            const defaultLayout = response.data.layouts.find(l => l.is_default) || response.data.layouts[0];
            const layoutResponse = await axios.get(`/api/live-monitor/layouts/${defaultLayout.id}`);
            if (layoutResponse.data.status === 'success') {
              layoutData = layoutResponse.data.layout;
            }
          } else {
            // No active layouts — show predefined report (hardcoded integrated offsets)
            setLayout(null);
            setUsePredefinedReport(true);
            setLoading(false);
            return;
          }
        }

        setLayout(layoutData);
      } catch (e) {
        console.error('Error loading layout:', e);
        setError(e.response?.data?.message || e.message || 'Failed to load layout');
      } finally {
        setLoading(false);
      }
    };

    loadLayout();
  }, [layoutId]);

  // Predefined report: poll integrated offsets when no layouts
  useEffect(() => {
    if (!usePredefinedReport) return;
    const fetchPredefined = () => {
      axios.get('/api/live-monitor/predefined', { withCredentials: true })
        .then((res) => {
          if (res.data && typeof res.data === 'object') setPredefinedOffsets(res.data);
        })
        .catch(() => {});
    };
    fetchPredefined();
    const t = setInterval(fetchPredefined, 2500);
    return () => clearInterval(t);
  }, [usePredefinedReport]);

  // Subscribe to WebSocket for live updates
  useEffect(() => {
    if (!socket || !layout) return;

    const handleLiveData = (data) => {
      if (data.tag_values) {
        setTagValues(prev => ({ ...prev, ...data.tag_values }));
      }
    };

    socket.on('live_tag_data', handleLiveData);

    return () => {
      socket.off('live_tag_data', handleLiveData);
    };
  }, [socket, layout]);

  // Initial load of tag values via REST API
  useEffect(() => {
    if (!layout) return;

    const loadInitialValues = async () => {
      try {
        // Get all tag names used in layout
        const tagNames = new Set();
        if (layout.sections) {
          layout.sections.forEach(section => {
            if (section.section_type === 'Table' && section.columns) {
              section.columns.forEach(col => {
                if (col.source_type === 'Tag' && col.tag_name) {
                  tagNames.add(col.tag_name);
                }
              });
              // Add tags from tag group
              if (section.table_config && section.table_config.tag_group_id) {
                // Tags will be loaded when rendering table section
              }
            } else if (section.section_type === 'KPI' && section.kpi_cards) {
              section.kpi_cards.forEach(kpi => {
                if (kpi.source_type === 'Tag' && kpi.tag_name) {
                  tagNames.add(kpi.tag_name);
                }
              });
            }
          });
        }

        const response = await axios.get('/api/live-monitor/tags', {
          params: { tags: Array.from(tagNames).join(',') }
        });

        if (response.data.status === 'success') {
          setTagValues(prev => ({ ...prev, ...(response.data.tag_values || {}) }));
        }
      } catch (e) {
        console.error('Error loading initial tag values:', e);
      }
    };

    loadInitialValues();
  }, [layout]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <FaSpinner className="animate-spin text-4xl text-brand mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading live monitor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center max-w-md">
          <FaExclamationTriangle className="text-4xl text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Error Loading Layout</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <a
            href="/live-monitor/layouts"
            className="text-brand hover:text-brand-hover dark:text-cyan-400"
          >
            Go to Layout Manager
          </a>
        </div>
      </div>
    );
  }

  // Predefined report: hardcoded integrated offsets (no DB layout)
  if (usePredefinedReport) {
    return (
      <div className="p-6">
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold dark:text-gray-100">Live Monitor — Predefined Report</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Integrated offsets (same as PLC). Values update every few seconds. Create a layout for custom views.
            </p>
          </div>
          <button
            onClick={() => navigate('/live-monitor/layouts')}
            className="px-4 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-md flex items-center gap-2"
          >
            <FaPlus />
            Create Layout
          </button>
        </div>
        <div className="space-y-6">
          {['DB199', 'DB2099', 'DB299', 'DB499'].map((dbKey) => (
            <div key={dbKey} className="bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6">
              <h2 className="text-xl font-semibold dark:text-gray-100 mb-4">{DB_LABELS[dbKey]}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {(predefinedOffsets[dbKey] || []).map((item, idx) => (
                  <div
                    key={`${dbKey}-${item.offset}-${idx}`}
                    className="p-3 rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50/30 dark:bg-cyan-900/10"
                  >
                    <div className="font-mono text-xs text-gray-600 dark:text-gray-400">{item.label || `off ${item.offset}`}</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">
                      {typeof item.value === 'number' && item.value % 1 !== 0 ? item.value.toFixed(4) : String(item.value)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{item.type} @ {item.offset}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">No layout configured</p>
          <a
            href="/live-monitor/layouts"
            className="text-brand hover:text-brand-hover dark:text-cyan-400"
          >
            Create a Layout
          </a>
        </div>
      </div>
    );
  }

  const handleDragStart = (e, sectionId) => {
    setDraggedSectionId(sectionId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', sectionId);
  };

  const handleDragOver = (e, sectionId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (sectionId !== draggedSectionId) {
      setDraggedOverSectionId(sectionId);
    }
  };

  const handleDragLeave = () => {
    setDraggedOverSectionId(null);
  };

  const handleDrop = (e, targetSectionId) => {
    e.preventDefault();
    setDraggedOverSectionId(null);

    if (!draggedSectionId || draggedSectionId === targetSectionId || !layout) {
      setDraggedSectionId(null);
      return;
    }

    const sections = [...(layout.sections || [])];
    const draggedIndex = sections.findIndex(s => s.id === draggedSectionId);
    const targetIndex = sections.findIndex(s => s.id === targetSectionId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedSectionId(null);
      return;
    }

    // Remove dragged section from its current position
    const [draggedSection] = sections.splice(draggedIndex, 1);
    // Insert at target position
    sections.splice(targetIndex, 0, draggedSection);

    // Update display_order
    sections.forEach((section, index) => {
      section.display_order = index + 1;
    });

    // Update layout with reordered sections
    const updatedLayout = {
      ...layout,
      sections: sections,
      last_modified: new Date().toISOString()
    };

    // Save to localStorage
    try {
      const saved = localStorage.getItem('live_monitor_layouts');
      const data = saved ? JSON.parse(saved) : { layouts: [] };
      const updated = data.layouts.map(l =>
        l.id === layout.id ? updatedLayout : l
      );
      data.layouts = updated;
      localStorage.setItem('live_monitor_layouts', JSON.stringify(data));
      window.dispatchEvent(new Event('liveMonitorLayoutsUpdated'));
      
      // Update state
      setLayout(updatedLayout);
    } catch (e) {
      console.error('Error saving section order:', e);
    }

    setDraggedSectionId(null);
  };

  const handleDragEnd = () => {
    setDraggedSectionId(null);
    setDraggedOverSectionId(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Reload layout
      if (layoutId) {
        const response = await axios.get(`/api/live-monitor/layouts/${layoutId}`);
        if (response.data.status === 'success') {
          setLayout(response.data.layout);
        }
      } else {
        // Reload default layout
        const response = await axios.get('/api/live-monitor/layouts?is_active=true');
        if (response.data.status === 'success' && response.data.layouts.length > 0) {
          const defaultLayout = response.data.layouts.find(l => l.is_default) || response.data.layouts[0];
          const layoutResponse = await axios.get(`/api/live-monitor/layouts/${defaultLayout.id}`);
          if (layoutResponse.data.status === 'success') {
            setLayout(layoutResponse.data.layout);
          }
        }
      }
      
      // Reload tag values
      if (layout) {
        const tagNames = new Set();
        if (layout.sections) {
          layout.sections.forEach(section => {
            if (section.section_type === 'Table' && section.columns) {
              section.columns.forEach(col => {
                if (col.source_type === 'Tag' && col.tag_name) {
                  tagNames.add(col.tag_name);
                }
              });
            } else if (section.section_type === 'KPI' && section.kpi_cards) {
              section.kpi_cards.forEach(kpi => {
                if (kpi.source_type === 'Tag' && kpi.tag_name) {
                  tagNames.add(kpi.tag_name);
                }
              });
            }
          });
        }
        
        if (tagNames.size > 0) {
          const response = await axios.get('/api/live-monitor/tags', {
            params: { tags: Array.from(tagNames).join(',') }
          });
          if (response.data.status === 'success') {
            setTagValues(response.data.tag_values || {});
          }
        }
      }
    } catch (e) {
      console.error('Error refreshing:', e);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold dark:text-gray-100">{layout.layout_name}</h1>
          {layout.description && (
            <p className="text-gray-600 dark:text-gray-400 mt-2">{layout.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white font-medium rounded-md flex items-center gap-2"
            title="Refresh Data"
          >
            <FaSync className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => navigate(`/live-monitor/layouts/${layout.id}`)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md flex items-center gap-2"
            title="Edit Layout"
          >
            <FaEdit />
            Edit Layout
          </button>
          <button
            onClick={() => navigate('/live-monitor/layouts')}
            className="px-4 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-md flex items-center gap-2"
            title="Create New Layout"
          >
            <FaPlus />
            New Layout
          </button>
          <button
            onClick={() => navigate('/live-monitor/layouts')}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-md flex items-center gap-2"
            title="View All Layouts"
          >
            <FaList />
            All Layouts
          </button>
        </div>
      </div>

      {layout.sections && layout.sections.length > 0 ? (
        <div className="space-y-6">
          {layout.sections
            .filter(section => section.is_active)
            .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
            .map((section) => (
              <div
                key={section.id}
                draggable
                onDragStart={(e) => handleDragStart(e, section.id)}
                onDragOver={(e) => handleDragOver(e, section.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, section.id)}
                onDragEnd={handleDragEnd}
                className={`bg-white dark:!bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6 cursor-move transition-all ${
                  draggedSectionId === section.id
                    ? 'opacity-50 scale-95'
                    : draggedOverSectionId === section.id
                    ? 'border-brand border-2 scale-105'
                    : 'hover:shadow-lg'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold dark:text-gray-100">{section.section_name}</h2>
                  <div className="text-gray-400 dark:text-gray-500 cursor-move">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                  </div>
                </div>
                
                {section.section_type === 'Table' && (
                  <DynamicTableSection
                    section={section}
                    tagValues={tagValues}
                  />
                )}
                
                {section.section_type === 'KPI' && (
                  <DynamicKPISection
                    section={section}
                    tagValues={tagValues}
                  />
                )}
              </div>
            ))}
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p>No sections configured for this layout.</p>
          <a
            href="/live-monitor/layouts"
            className="text-brand hover:text-brand-hover dark:text-cyan-400 mt-2 inline-block"
          >
            Edit Layout
          </a>
        </div>
      )}
    </div>
  );
};

export default DynamicLiveMonitor;

