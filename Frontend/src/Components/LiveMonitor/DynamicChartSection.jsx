import React, { useState, useEffect, useMemo } from 'react';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const DynamicChartSection = ({ section, tagValues, showTitle = true }) => {
  const [chartData, setChartData] = useState(null);
  const [timeLabels, setTimeLabels] = useState([]);

  const config = section.config || {};
  const chartType = config.chart_type || 'line';
  const chartConfig = config.chart_config || {};
  const datasets = chartConfig.datasets || [];
  
  // Memoize datasets to prevent infinite loops - use JSON.stringify for deep comparison
  const datasetsMemo = useMemo(() => datasets, [JSON.stringify(datasets)]);
  
  // Get the selected tag names (array) for X-axis - memoize to prevent infinite loops
  const xAxisTags = useMemo(() => {
    return Array.isArray(chartConfig.xAxisLabel) 
      ? chartConfig.xAxisLabel 
      : (chartConfig.xAxisLabel ? [chartConfig.xAxisLabel] : []);
  }, [JSON.stringify(chartConfig.xAxisLabel)]);
  
  const yAxisLabel = chartConfig.yAxisLabel || '';
  
  // Memoize tag names from datasets
  const datasetTagNames = useMemo(() => {
    return datasetsMemo.map(ds => ds.tag_name).filter(Boolean);
  }, [datasetsMemo]);

  useEffect(() => {
    // Use xAxisTags if available, otherwise fall back to datasets
    const tagsToUse = xAxisTags.length > 0 ? xAxisTags : datasetTagNames;
    
    if (tagsToUse.length === 0) {
      setChartData(null);
      return;
    }

    // Generate time labels (last 20 data points for preview)
    const labels = Array.from({ length: 20 }, (_, i) => {
      const date = new Date();
      date.setSeconds(date.getSeconds() - (19 - i) * 1); // 1-second intervals
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    });
    setTimeLabels(labels);

    // Prepare chart data based on type
    if (chartType === 'pie' || chartType === 'doughnut') {
      // For pie charts, use current values
      const data = tagsToUse.map(tagName => {
        const value = tagValues[tagName];
        return typeof value === 'number' ? value : 0;
      });
      
      setChartData({
        labels: tagsToUse,
        datasets: [{
          label: 'Values',
          data: data,
          backgroundColor: tagsToUse.map((_, i) => {
            const ds = datasetsMemo.find(d => d.tag_name === tagsToUse[i]);
            return ds?.color || `hsl(${(i * 360) / tagsToUse.length}, 70%, 50%)`;
          }),
          borderColor: tagsToUse.map((_, i) => {
            const ds = datasetsMemo.find(d => d.tag_name === tagsToUse[i]);
            return ds?.color || `hsl(${(i * 360) / tagsToUse.length}, 70%, 50%)`;
          }),
          borderWidth: 2,
        }],
      });
    } else {
      // For line, bar, area charts - use time series data
      const chartDatasets = tagsToUse.map((tagName, index) => {
        // Find dataset config for this tag if it exists
        const ds = datasetsMemo.find(d => d.tag_name === tagName);
        
        // Get current tag value
        const currentValue = tagValues[tagName];
        const baseValue = typeof currentValue === 'number' ? currentValue : 0;
        
        // Generate data points - use current value with slight variation for preview
        // In production, this would use actual historical data from the API
        const data = labels.map((_, idx) => {
          // Create a trend from past to present
          const progress = idx / (labels.length - 1);
          // Add slight variation to show trend
          const variation = (Math.random() - 0.5) * (baseValue * 0.1 || 5);
          return Math.max(0, baseValue + variation * (1 - progress * 0.5));
        });

        // Generate color if not in dataset config
        const defaultColor = ds?.color || `hsl(${(index * 360) / tagsToUse.length}, 70%, 50%)`;

        const datasetConfig = {
          label: ds?.label || tagName,
          data: data,
          borderColor: defaultColor,
          backgroundColor: chartType === 'area' 
            ? `${defaultColor}40` 
            : defaultColor,
          borderWidth: ds?.borderWidth || 2,
        };

        if (chartType === 'line' || chartType === 'area') {
          datasetConfig.tension = 0.4;
          datasetConfig.fill = chartType === 'area';
        }

        return datasetConfig;
      });

      setChartData({
        labels: labels,
        datasets: chartDatasets,
      });
    }
  }, [xAxisTags, datasetTagNames, datasetsMemo, chartType, tagValues]);

  const tagsToUse = xAxisTags.length > 0 ? xAxisTags : datasetTagNames;
  
  if (!chartData || tagsToUse.length === 0) {
    return (
      <div className="bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No chart data configured. Please select tags in the section configuration.
        </p>
      </div>
    );
  }

  // Detect dark mode
  const isDarkMode = typeof document !== 'undefined' && 
    (document.documentElement.classList.contains('dark') || 
     window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Get dataset labels for Y-axis
  const getYAxisLabel = () => {
    // If there are datasets with labels, use the first dataset's label
    if (datasets.length > 0) {
      const firstDatasetWithLabel = datasets.find(ds => ds.label && ds.label.trim() !== '');
      if (firstDatasetWithLabel) {
        // If only one dataset, show its label; if multiple, show first one
        if (datasetsMemo.length === 1) {
          return firstDatasetWithLabel.label;
        } else {
          // For multiple datasets, show the first label
          const labels = datasetsMemo.filter(ds => ds.label && ds.label.trim() !== '').map(ds => ds.label);
          if (labels.length === 1) {
            return labels[0];
          } else if (labels.length > 1) {
            return labels[0]; // Show first label
          }
        }
      }
    }
    // Fallback to yAxisLabel config or default
    return yAxisLabel || 'Tag Names';
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: isDarkMode ? '#e5e7eb' : '#374151',
          padding: 15,
          usePointStyle: true,
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
      },
    },
    scales: chartType !== 'pie' && chartType !== 'doughnut' ? {
      x: {
        title: {
          display: true,
          text: xAxisTags.length > 0 ? (xAxisTags.length === 1 ? xAxisTags[0] : `${xAxisTags.length} Tags`) : 'Tag Values',
          color: isDarkMode ? '#9ca3af' : '#6b7280',
          font: {
            size: 12,
            weight: 'bold',
          },
          padding: { top: 10, bottom: 0 },
        },
        grid: {
          color: isDarkMode 
            ? 'rgba(255, 255, 255, 0.1)' 
            : 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          color: isDarkMode ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
      },
      y: {
        title: {
          display: true,
          text: getYAxisLabel(),
          color: isDarkMode ? '#9ca3af' : '#6b7280',
          font: {
            size: 12,
            weight: 'bold',
          },
          padding: { top: 0, bottom: 10 },
        },
        beginAtZero: true,
        grid: {
          color: isDarkMode 
            ? 'rgba(255, 255, 255, 0.1)' 
            : 'rgba(0, 0, 0, 0.05)',
        },
        ticks: {
          color: isDarkMode ? '#9ca3af' : '#6b7280',
          font: {
            size: 11,
          },
        },
      },
    } : undefined,
  };

  const renderChart = () => {
    switch (chartType) {
      case 'line':
        return <Line data={chartData} options={options} />;
      case 'bar':
        return <Bar data={chartData} options={options} />;
      case 'area':
        return <Line data={chartData} options={options} />;
      case 'pie':
        return <Pie data={chartData} options={options} />;
      case 'doughnut':
        return <Doughnut data={chartData} options={options} />;
      default:
        return <Line data={chartData} options={options} />;
    }
  };

  return (
    <div className="bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6">
      {showTitle && section.section_name && (
        <div className="mb-4">
          <h3 className="text-xl font-semibold dark:text-gray-100">{section.section_name}</h3>
        </div>
      )}
      <div style={{ height: '400px', position: 'relative' }}>
        {renderChart()}
      </div>
    </div>
  );
};

export default DynamicChartSection;

