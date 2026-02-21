import React from 'react';

/**
 * DynamicSummaryCards - Renders KPI summary cards based on configuration
 * Used for displaying key metrics in report summaries
 */
const DynamicSummaryCards = ({ config, data }) => {
  if (!config || !config.cards || !Array.isArray(config.cards)) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-gray-500 dark:text-gray-400">No cards configured</p>
      </div>
    );
  }

  // Helper function to get value from nested data path
  const getValue = (field, data) => {
    if (!field || !data) return null;
    
    // Handle nested paths like "summary.total_produced_kg"
    const keys = field.split('.');
    let value = data;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    
    return value;
  };

  // Helper function to format value
  const formatValue = (value, format, unit, decimals = 2) => {
    if (value === null || value === undefined) return 'N/A';
    
    let formatted = value;
    
    if (typeof value === 'number') {
      formatted = value.toFixed(decimals);
      
      if (format === 'percent') {
        formatted = `${formatted}%`;
      } else if (format === 'duration') {
        // Convert seconds to hours:minutes:seconds
        const hours = Math.floor(value / 3600);
        const minutes = Math.floor((value % 3600) / 60);
        const secs = Math.floor(value % 60);
        formatted = `${hours}h ${minutes}m ${secs}s`;
      } else if (unit) {
        formatted = `${formatted} ${unit}`;
      }
    }
    
    return formatted;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {config.cards.map((card, index) => {
        const value = getValue(card.field, data);
        const formattedValue = formatValue(
          value,
          card.format || 'number',
          card.unit,
          card.decimals || 2
        );

        return (
          <div
            key={index}
            className="bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {card.label || card.field}
              </h3>
              {card.icon && (
                <div className="text-2xl">{card.icon}</div>
              )}
            </div>
            <div className="mt-2">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {formattedValue}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DynamicSummaryCards;

