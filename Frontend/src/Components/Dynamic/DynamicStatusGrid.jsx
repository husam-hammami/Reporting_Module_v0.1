import React from 'react';

/**
 * DynamicStatusGrid - Renders a grid of status indicators (boolean values)
 * Shows on/off states with configurable colors
 */
const DynamicStatusGrid = ({ config, data }) => {
  if (!config || !config.indicators || !Array.isArray(config.indicators)) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-gray-500 dark:text-gray-400">No status indicators configured</p>
      </div>
    );
  }

  // Get value for an indicator
  const getValue = (tagName) => {
    if (!data || !tagName) return false;
    
    // Handle nested paths
    const keys = tagName.split('.');
    let value = data;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return false;
      }
    }
    
    // Convert to boolean
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1';
    return false;
  };

  return (
    <div className="bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6">
      {config.title && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {config.title}
        </h3>
      )}
      
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {config.indicators.map((indicator, index) => {
          const isActive = getValue(indicator.tag_name);
          const bgColor = isActive 
            ? (indicator.on_color || '#10B981')
            : (indicator.off_color || '#6B7280');
          
          return (
            <div
              key={index}
              className="flex flex-col items-center justify-center p-4 rounded-lg border border-gray-200 dark:border-cyan-900"
              style={{ backgroundColor: `${bgColor}20` }}
            >
              <div
                className="w-4 h-4 rounded-full mb-2"
                style={{ backgroundColor: bgColor }}
              />
              <span className="text-sm font-medium text-gray-900 dark:text-white text-center">
                {indicator.label || indicator.tag_name}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DynamicStatusGrid;

