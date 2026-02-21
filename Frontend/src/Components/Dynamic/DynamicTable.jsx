import React, { useState } from 'react';

/**
 * DynamicTable - Renders a configurable data table based on configuration
 * Supports pagination, sorting, and custom column definitions
 */
const DynamicTable = ({ config, data }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');

  if (!config || !config.columns || !Array.isArray(config.columns)) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-gray-500 dark:text-gray-400">No table configuration</p>
      </div>
    );
  }

  // Get data source
  const getDataSource = () => {
    if (!config.data_source || !data) return [];
    
    // Handle nested paths like "archiveData" or "active_sources"
    const keys = config.data_source.split('.');
    let source = data;
    
    for (const key of keys) {
      if (source && typeof source === 'object' && key in source) {
        source = source[key];
      } else {
        return [];
      }
    }
    
    return Array.isArray(source) ? source : [];
  };

  let tableData = getDataSource();

  // Apply sorting
  if (sortField && config.sortable !== false) {
    tableData = [...tableData].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDirection === 'asc' 
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });
  }

  // Apply pagination
  const pageSize = config.page_size || 10;
  const totalPages = Math.ceil(tableData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = config.pagination !== false 
    ? tableData.slice(startIndex, startIndex + pageSize)
    : tableData;

  // Handle sorting
  const handleSort = (field) => {
    if (config.sortable === false) return;
    
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Format cell value
  const formatCellValue = (value, column) => {
    if (value === null || value === undefined) return 'N/A';
    
    if (typeof value === 'number') {
      const decimals = column.decimals !== undefined ? column.decimals : 2;
      let formatted = value.toFixed(decimals);
      if (column.unit) {
        formatted = `${formatted} ${column.unit}`;
      }
      return formatted;
    }
    
    return String(value);
  };

  if (tableData.length === 0) {
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-gray-500 dark:text-gray-400">No data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#121e2c] border border-gray-200 dark:border-cyan-900 rounded-lg overflow-hidden">
      {config.title && (
        <div className="px-6 py-4 border-b border-gray-200 dark:border-cyan-900">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {config.title}
          </h3>
        </div>
      )}
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              {config.columns.map((column, index) => (
                <th
                  key={index}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${
                    config.sortable !== false ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : ''
                  }`}
                  onClick={() => handleSort(column.field)}
                  style={{ width: column.width ? `${column.width}px` : 'auto' }}
                >
                  <div className="flex items-center gap-2">
                    {column.header || column.field}
                    {config.sortable !== false && sortField === column.field && (
                      <span className="text-gray-400">
                        {sortDirection === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-[#121e2c] divide-y divide-gray-200 dark:divide-cyan-900">
            {paginatedData.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                {config.columns.map((column, colIndex) => {
                  const value = row[column.field];
                  const formattedValue = formatCellValue(value, column);
                  
                  return (
                    <td
                      key={colIndex}
                      className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100`}
                      style={{ textAlign: column.align || 'left' }}
                    >
                      {formattedValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {config.pagination !== false && totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 dark:border-cyan-900 flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {startIndex + 1} to {Math.min(startIndex + pageSize, tableData.length)} of {tableData.length} entries
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-cyan-900 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-cyan-900 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DynamicTable;

