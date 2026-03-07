import React, { useState, useEffect } from 'react';
import { FaTimes, FaSave, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import TagSelector from './TagSelector';

const FormulaEditor = ({ value = '', onChange, onSave, onCancel, formulaName = '', showNameInput = false }) => {
  const [formula, setFormula] = useState(value);
  const [name, setName] = useState(formulaName);
  const [tags, setTags] = useState([]);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testValues, setTestValues] = useState({});

  useEffect(() => {
    setFormula(value);
  }, [value]);

  useEffect(() => {
    setName(formulaName);
  }, [formulaName]);

  useEffect(() => {
    // Load tags for selection
    const loadTags = () => {
      try {
        const saved = localStorage.getItem('system_tags');
        if (saved) {
          const data = JSON.parse(saved);
          setTags(data.tags?.filter(t => t.is_active) || []);
        }
      } catch (e) {
        console.error('Error loading tags:', e);
      }
    };

    loadTags();
    window.addEventListener('tagsUpdated', loadTags);
    return () => window.removeEventListener('tagsUpdated', loadTags);
  }, []);

  const insertTag = (tagName) => {
    const cursorPos = document.activeElement?.selectionStart || formula.length;
    const newFormula = formula.slice(0, cursorPos) + tagName + formula.slice(cursorPos);
    setFormula(newFormula);
    setError('');
    if (onChange) onChange(newFormula);
  };

  const insertOperator = (op) => {
    const cursorPos = document.activeElement?.selectionStart || formula.length;
    const newFormula = formula.slice(0, cursorPos) + ` ${op} ` + formula.slice(cursorPos);
    setFormula(newFormula);
    setError('');
    if (onChange) onChange(newFormula);
  };

  const insertFunction = (func) => {
    const cursorPos = document.activeElement?.selectionStart || formula.length;
    let insertText = '';
    if (func === 'IF') {
      insertText = 'IF(condition, value_if_true, value_if_false)';
    } else {
      insertText = `${func}(`;
    }
    const newFormula = formula.slice(0, cursorPos) + insertText + formula.slice(cursorPos);
    setFormula(newFormula);
    setError('');
    if (onChange) onChange(newFormula);
  };

  const validateFormula = () => {
    if (!formula.trim()) {
      setError('Formula cannot be empty');
      return false;
    }

    // Check for balanced parentheses
    const openParens = (formula.match(/\(/g) || []).length;
    const closeParens = (formula.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      setError('Unbalanced parentheses');
      return false;
    }

    // Check for valid tag names
    const tagNames = tags.map(t => t.tag_name);
    const formulaTags = formula.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
    const invalidTags = formulaTags.filter(tag => 
      !['IF', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'ABS', 'AND', 'OR', 'NOT'].includes(tag.toUpperCase()) &&
      !tagNames.includes(tag)
    );

    if (invalidTags.length > 0) {
      setError(`Unknown tags or functions: ${invalidTags.join(', ')}`);
      return false;
    }

    setError('');
    return true;
  };

  const testFormula = () => {
    if (!validateFormula()) return;

    // Simple formula evaluation with test values
    try {
      // Normalize Unicode operators to ASCII for eval
      let testFormula = formula
        .replace(/\×/g, '*')
        .replace(/\÷/g, '/')
        .replace(/\u2212/g, '-');
      // Replace tag names with test values
      const tagNames = tags.map(t => t.tag_name);
      
      tagNames.forEach(tagName => {
        const testValue = testValues[tagName] || 0;
        // Replace whole word matches only
        testFormula = testFormula.replace(new RegExp(`\\b${tagName}\\b`, 'g'), testValue);
      });

      // Replace function calls with JavaScript equivalents
      testFormula = testFormula
        .replace(/\bSUM\(/g, 'Math.sum(')
        .replace(/\bAVG\(/g, 'Math.avg(')
        .replace(/\bMIN\(/g, 'Math.min(')
        .replace(/\bMAX\(/g, 'Math.max(')
        .replace(/\bROUND\(/g, 'Math.round(')
        .replace(/\bABS\(/g, 'Math.abs(');

      // For demo, use eval (in production, use a proper formula parser)
      // eslint-disable-next-line no-eval
      const result = eval(testFormula);
      setTestResult({ success: true, value: result });
    } catch (e) {
      setTestResult({ success: false, error: e.message });
    }
  };

  const handleSave = () => {
    if (!validateFormula()) return;

    if (showNameInput && !name.trim()) {
      setError('Formula name is required');
      return;
    }

    if (onSave) {
      onSave({
        formula: formula.trim(),
        name: name.trim() || `Formula_${Date.now()}`,
        source_type: 'Formula',
        data_type: 'REAL', // Default, can be configured
        is_active: true
      });
    } else if (onChange) {
      onChange(formula.trim());
    }
  };

  const availableTags = tags.filter(t => t.is_active);

  return (
    <div className="bg-white dark:!bg-[#131b2d] rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 max-w-4xl w-full">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-2xl font-bold dark:text-gray-100">Formula Editor</h3>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <FaTimes size={24} />
          </button>
        )}
      </div>

      {/* Formula Name (if creating new formula) */}
      {showNameInput && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Formula Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100"
            placeholder="e.g., Total_Produced, Efficiency_Percentage"
          />
        </div>
      )}

      {/* Formula Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Formula <span className="text-red-500">*</span>
        </label>
        <textarea
          value={formula}
          onChange={(e) => {
            setFormula(e.target.value);
            setError('');
            if (onChange) onChange(e.target.value);
          }}
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:!bg-[#081320] text-gray-900 dark:text-gray-100 font-mono text-sm"
          rows="4"
          placeholder="e.g., Sender1_Weight + Sender2_Weight"
        />
        {error && (
          <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded text-sm text-red-800 dark:text-red-200 flex items-center gap-2">
            <FaExclamationTriangle />
            {error}
          </div>
        )}
      </div>

      {/* Available Tags */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Available Tags
        </label>
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-gray-50 dark:bg-[#081320] rounded-md border border-gray-200 dark:border-gray-700">
          {availableTags.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No tags available. Create tags in Settings → Tags.</p>
          ) : (
            availableTags.map(tag => (
              <button
                key={tag.id}
                onClick={() => insertTag(tag.tag_name)}
                className="px-3 py-1 bg-brand-subtle dark:bg-cyan-900 text-brand dark:text-cyan-200 rounded-md text-sm font-medium hover:bg-cyan-200 dark:hover:bg-cyan-800 transition-colors"
                title={tag.display_name || tag.tag_name}
              >
                {tag.display_name || tag.tag_name}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Operators */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Operators
        </label>
        <div className="flex flex-wrap gap-2">
          {['+', '-', '*', '/', '(', ')', '='].map(op => (
            <button
              key={op}
              onClick={() => insertOperator(op)}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {op}
            </button>
          ))}
        </div>
      </div>

      {/* Functions */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Functions
        </label>
        <div className="flex flex-wrap gap-2">
          {['SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'ABS', 'IF'].map(func => (
            <button
              key={func}
              onClick={() => insertFunction(func)}
              className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-md text-sm font-medium hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
            >
              {func}
            </button>
          ))}
        </div>
      </div>

      {/* Test Formula */}
      <div className="mb-4 p-4 bg-gray-50 dark:bg-[#081320] rounded-md border border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Test Formula (Enter test values for tags)
        </label>
        <div className="space-y-2 mb-3">
          {availableTags.slice(0, 5).map(tag => (
            <div key={tag.id} className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-gray-400 w-32">{tag.tag_name}:</span>
              <input
                type="number"
                step="0.1"
                value={testValues[tag.tag_name] || ''}
                onChange={(e) => setTestValues({ ...testValues, [tag.tag_name]: parseFloat(e.target.value) || 0 })}
                className="flex-1 p-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:!bg-[#131b2d] text-gray-900 dark:text-gray-100 text-sm"
                placeholder="0"
              />
            </div>
          ))}
        </div>
        <button
          onClick={testFormula}
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-md text-sm flex items-center gap-2"
        >
          <FaCheckCircle />
          Test Formula
        </button>
        {testResult && (
          <div className={`mt-2 p-2 rounded text-sm ${
            testResult.success
              ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-200'
              : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-200'
          }`}>
            {testResult.success ? (
              <>Result: <strong>{testResult.value}</strong></>
            ) : (
              <>Error: {testResult.error}</>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-medium rounded-md"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-md flex items-center gap-2"
        >
          <FaSave />
          {showNameInput ? 'Save Formula' : 'Apply Formula'}
        </button>
      </div>
    </div>
  );
};

export default FormulaEditor;

