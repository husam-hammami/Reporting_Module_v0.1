import React from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

/**
 * DynamicBarChart - Renders a bar chart based on configuration
 * Used for comparing values across categories
 */
const DynamicBarChart = ({ config, data }) => {
  if (!config || !config.series || !Array.isArray(config.series)) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-gray-500 dark:text-gray-400">No chart configuration</p>
      </div>
    );
  }

  // Get categories (e.g., bin IDs, material names)
  const getCategories = () => {
    if (config.categories) {
      return config.categories;
    }
    
    // Try to extract from per_bin_totals
    const perBinTotals = data.per_bin_totals || [];
    return perBinTotals.map(item => 
      item.material_name || `Bin ${item.bin_id}`
    );
  };

  // Get data for a series
  const getSeriesData = (seriesConfig) => {
    if (!data) return [];
    
    const perBinTotals = data.per_bin_totals || [];
    
    return perBinTotals.map(item => {
      const value = item[seriesConfig.field] || item.total_weight || 0;
      return typeof value === 'number' ? value : 0;
    });
  };

  const categories = getCategories();

  const chartData = {
    labels: categories,
    datasets: config.series.map((series, index) => ({
      label: series.label || series.field,
      data: getSeriesData(series),
      backgroundColor: series.color || `hsl(${index * 60}, 70%, 50%)`,
      borderColor: series.borderColor || series.color || `hsl(${index * 60}, 70%, 50%)`,
      borderWidth: 1,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: config.legend_position || 'top',
        labels: {
          color: window.matchMedia('(prefers-color-scheme: dark)').matches 
            ? '#E5E7EB' 
            : '#374151',
        },
      },
      title: {
        display: !!config.title,
        text: config.title,
        color: window.matchMedia('(prefers-color-scheme: dark)').matches 
          ? '#E5E7EB' 
          : '#374151',
      },
    },
    scales: {
      x: {
        grid: {
          color: window.matchMedia('(prefers-color-scheme: dark)').matches 
            ? '#374151' 
            : '#E5E7EB',
        },
        ticks: {
          color: window.matchMedia('(prefers-color-scheme: dark)').matches 
            ? '#9CA3AF' 
            : '#6B7280',
        },
      },
      y: {
        title: {
          display: !!config.y_axis_label,
          text: config.y_axis_label || 'Value',
        },
        grid: {
          color: window.matchMedia('(prefers-color-scheme: dark)').matches 
            ? '#374151' 
            : '#E5E7EB',
        },
        ticks: {
          color: window.matchMedia('(prefers-color-scheme: dark)').matches 
            ? '#9CA3AF' 
            : '#6B7280',
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
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
};

export default DynamicBarChart;

