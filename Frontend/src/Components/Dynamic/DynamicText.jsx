import React from 'react';

/**
 * DynamicText - Renders static text or labels
 * Can display dynamic values from data using template strings
 */
const DynamicText = ({ config, data }) => {
  if (!config) {
    return null;
  }

  // Replace template variables like {{field}} with actual values
  const renderText = (text) => {
    if (!text || !data) return text || '';
    
    return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const keys = path.split('.');
      let value = data;
      
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return match; // Return original if path not found
        }
      }
      
      return value !== null && value !== undefined ? String(value) : match;
    });
  };

  const text = renderText(config.text || config.content || '');
  const align = config.align || 'left';
  const size = config.size || 'base';
  const weight = config.weight || 'normal';
  const color = config.color || 'text-gray-900 dark:text-white';

  const sizeClasses = {
    xs: 'text-xs',
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
  };

  const weightClasses = {
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold',
  };

  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <div
      className={`${sizeClasses[size]} ${weightClasses[weight]} ${alignClasses[align]} ${color}`}
      style={config.style}
    >
      {text}
    </div>
  );
};

export default DynamicText;

