import React from 'react';

/**
 * DynamicGauge - Renders a circular gauge meter for displaying single values
 * Shows value with min/max range and color thresholds
 */
const DynamicGauge = ({ config, data }) => {
  if (!config || !config.tag_name) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-gray-500 dark:text-gray-400">No gauge configuration</p>
      </div>
    );
  }

  // Get value from data
  const getValue = () => {
    if (!data) return null;
    
    // Handle nested paths
    const keys = config.tag_name.split('.');
    let value = data;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    
    return typeof value === 'number' ? value : null;
  };

  const value = getValue();
  const min = config.min || 0;
  const max = config.max || 100;
  const unit = config.unit || '';
  
  // Calculate percentage for gauge fill
  const percentage = value !== null 
    ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
    : 0;

  // Determine color based on thresholds
  const getColor = () => {
    if (value === null) return '#6B7280'; // gray
    
    if (config.thresholds && Array.isArray(config.thresholds)) {
      // Sort thresholds by value (descending)
      const sorted = [...config.thresholds].sort((a, b) => b.value - a.value);
      
      for (const threshold of sorted) {
        if (value >= threshold.value) {
          return threshold.color || '#10B981'; // green
        }
      }
    }
    
    // Default color based on percentage
    if (percentage >= 80) return '#10B981'; // green
    if (percentage >= 50) return '#F59E0B'; // yellow
    return '#EF4444'; // red
  };

  const color = getColor();

  // Calculate gauge arc
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6">
      {config.title && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">
          {config.title}
        </h3>
      )}
      
      <div className="flex flex-col items-center justify-center">
        <div className="relative">
          <svg width="200" height="120" className="transform -rotate-90">
            {/* Background arc */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="12"
              className="dark:stroke-gray-700"
            />
            {/* Value arc */}
            <circle
              cx="100"
              cy="100"
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          
          {/* Value display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-3xl font-bold" style={{ color }}>
              {value !== null ? value.toFixed(config.decimals || 2) : 'N/A'}
            </div>
            {unit && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {unit}
              </div>
            )}
          </div>
        </div>
        
        {/* Min/Max labels */}
        <div className="flex justify-between w-full mt-4 text-xs text-gray-500 dark:text-gray-400">
          <span>{min} {unit}</span>
          <span>{max} {unit}</span>
        </div>
      </div>
    </div>
  );
};

export default DynamicGauge;

