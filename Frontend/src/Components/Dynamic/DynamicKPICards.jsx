import React from 'react';

/**
 * DynamicKPICards - Renders KPI cards for Live Monitor
 * Supports Tag and Formula sources, with real-time updates
 */
const DynamicKPICards = ({ config, data }) => {
  const { socket, isConnected } = useSocket();
  const [tagValues, setTagValues] = useState({});
  const [formulaValues, setFormulaValues] = useState({});

  if (!config || !config.cards || !Array.isArray(config.cards)) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-gray-500 dark:text-gray-400">No KPI cards configured</p>
      </div>
    );
  }

  // Helper: Get tag value from live data
  const getTagValue = (tagName, liveData) => {
    if (!tagName || !liveData) return null;
    
    // Try direct access first
    if (tagName in liveData) {
      return liveData[tagName];
    }
    
    // Try nested path
    const keys = tagName.split('.');
    let value = liveData;
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    return value;
  };

  // Helper: Evaluate formula (simplified - in production, use a proper formula evaluator)
  const evaluateFormula = (formula, liveData) => {
    if (!formula || !liveData) return null;
    
    try {
      // Replace tag names with their values
      let expression = formula;
      const tagMatches = formula.match(/\b[A-Za-z_][A-Za-z0-9_.]*\b/g);
      if (tagMatches) {
        tagMatches.forEach(tagName => {
          const value = getTagValue(tagName, liveData);
          if (value !== null && value !== undefined) {
            expression = expression.replace(new RegExp(`\\b${tagName}\\b`, 'g'), value);
          }
        });
      }
      
      // Evaluate the expression (use Function constructor for safety)
      // Note: In production, use a proper formula parser/evaluator
      const result = Function(`"use strict"; return (${expression})`)();
      return typeof result === 'number' ? result : null;
    } catch (e) {
      console.error('Error evaluating formula:', e);
      return null;
    }
  };

  // Helper: Format value
  const formatValue = (value, unit, decimals = 2) => {
    if (value === null || value === undefined) return 'N/A';
    
    if (typeof value === 'number') {
      const formatted = value.toFixed(decimals);
      return unit ? `${formatted} ${unit}` : formatted;
    }
    
    return String(value);
  };

  // Get icon component (simplified - just display icon class name)
  const renderIcon = (iconClass) => {
    if (!iconClass) return null;
    // In production, use react-icons or similar
    return <span className={`fa ${iconClass}`} style={{ fontSize: '1.5rem' }} />;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {config.cards.map((card, index) => {
        let value = null;
        
        if (card.source_type === 'tag' && card.tag_name) {
          value = getTagValue(card.tag_name, data);
        } else if (card.source_type === 'formula' && card.formula) {
          value = evaluateFormula(card.formula, data);
        }
        
        const formattedValue = formatValue(value, card.unit, card.decimals || 2);
        const cardColor = card.color || '#3B82F6';

        return (
          <div
            key={card.id || index}
            className="bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
            style={{
              borderLeft: `4px solid ${cardColor}`
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                {card.card_label || 'Unnamed Card'}
              </h3>
              {card.icon && (
                <div style={{ color: cardColor }}>
                  {renderIcon(card.icon)}
                </div>
              )}
            </div>
            <div className="mt-2">
              <p 
                className="text-2xl font-bold text-gray-900 dark:text-white"
                style={{ color: cardColor }}
              >
                {formattedValue}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default DynamicKPICards;

