import React from 'react';
import DynamicTable from './DynamicTable';
import DynamicGauge from './DynamicGauge';
import DynamicLineChart from './DynamicLineChart';
import DynamicBarChart from './DynamicBarChart';
import DynamicStatusGrid from './DynamicStatusGrid';
import DynamicSummaryCards from './DynamicSummaryCards';
import DynamicKPICards from './DynamicKPICards';
import DynamicText from './DynamicText';

/**
 * SectionRenderer - Routes to the correct dynamic component based on section type
 * This is the main router component that renders sections dynamically based on layout config
 */
const SectionRenderer = ({ section, data }) => {
  if (!section || !section.type) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
        <p className="text-red-600 dark:text-red-400">Invalid section configuration</p>
      </div>
    );
  }

  // Route to appropriate component based on section type
  switch (section.type) {
    case 'table':
      return <DynamicTable config={section.config} data={data} />;
    
    case 'gauge':
      return <DynamicGauge config={section.config} data={data} />;
    
    case 'line_chart':
      return <DynamicLineChart config={section.config} data={data} />;
    
    case 'bar_chart':
      return <DynamicBarChart config={section.config} data={data} />;
    
    case 'status_grid':
      return <DynamicStatusGrid config={section.config} data={data} />;
    
    case 'summary_cards':
      return <DynamicSummaryCards config={section.config} data={data} />;
    
    case 'kpi_cards':
      return <DynamicKPICards config={section.config} data={data} />;
    
    case 'text':
      return <DynamicText config={section.config} data={data} />;
    
    default:
      return (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
          <p className="text-yellow-600 dark:text-yellow-400">
            Unknown section type: {section.type}
          </p>
        </div>
      );
  }
};

export default SectionRenderer;

