import React from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js';
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

/**
 * DynamicLineChart - Renders a time series line chart based on configuration
 * Supports multiple series and time-based data
 */
const DynamicLineChart = ({ config, data }) => {
  const isDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (!config || !config.series || !Array.isArray(config.series)) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-gray-500 dark:text-gray-400">No chart configuration</p>
      </div>
    );
  }

  // Get data for a series
  const getSeriesData = (seriesConfig) => {
    if (!data || !seriesConfig.tag_name) return [];
    
    // Try to get data from archiveData or other sources
    const archiveData = data.archiveData || data.hourly_breakdown || [];
    
    if (!Array.isArray(archiveData)) return [];
    
    return archiveData.map((record, index) => {
      const value = record[seriesConfig.tag_name];
      const timestamp = record.archive_hour || record.created_at || index;
      
      return {
        x: timestamp,
        y: typeof value === 'number' ? value : 0,
      };
    });
  };

  // Build chart data
  const chartData = {
    datasets: config.series.map((series, index) => ({
      label: series.label || series.tag_name,
      data: getSeriesData(series),
      borderColor: series.color || `hsl(${index * 60}, 70%, 50%)`,
      backgroundColor: series.color ? `${series.color}20` : `hsl(${index * 60}, 70%, 20%)`,
      tension: 0.4,
      fill: series.fill !== false,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: config.legend_position || 'top',
        labels: {
          color: isDark ? '#E5E7EB' : '#374151',
        },
      },
      title: {
        display: !!config.title,
        text: config.title,
        color: window.matchMedia('(prefers-color-scheme: dark)').matches 
          ? '#E5E7EB' 
          : '#374151',
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'hour',
          displayFormats: {
            hour: 'MMM dd HH:mm',
          },
        },
        title: {
          display: !!config.x_axis_label,
          text: config.x_axis_label || 'Time',
        },
        grid: {
          color: isDark ? '#374151' : '#E5E7EB',
        },
        ticks: {
          color: isDark ? '#9CA3AF' : '#6B7280',
        },
      },
      y: {
        title: {
          display: !!config.y_axis_label,
          text: config.y_axis_label || 'Value',
        },
        min: config.y_min !== undefined ? config.y_min : undefined,
        max: config.y_max !== undefined ? config.y_max : undefined,
        grid: {
          color: isDark ? '#374151' : '#E5E7EB',
        },
        ticks: {
          color: isDark ? '#9CA3AF' : '#6B7280',
        },
      },
    },
  };

  return (
    <div className="bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6">
      {config.title && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {config.title}
        </h3>
      )}
      <div style={{ height: config.height || '300px' }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

export default DynamicLineChart;

