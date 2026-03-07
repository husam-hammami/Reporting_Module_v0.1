/**
 * KPI Config — KPI list page (Phase 1.1, KPI_ENGINE_PLAN.md)
 * Mock data only; backend integration in Phase 3.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLenisScroll } from '../../Hooks/useLenisScroll';
import { FaPlus, FaEdit, FaTrash, FaCalculator } from 'react-icons/fa';

// Mock data (Phase 1 — replace with API in Phase 3)
const MOCK_KPI_LIST = [
  {
    id: 1,
    kpi_name: 'Flour Extraction',
    layout_id: 1,
    layout_name: 'Mil-A',
    formula_expression: '(flour_1 / receiver_2) * 100',
    aggregation_type: 'ratio',
    unit: '%',
    tag_mappings: [
      { alias_name: 'flour_1', tag_id: 1, tag_name: 'Sender1Weight' },
      { alias_name: 'receiver_2', tag_id: 2, tag_name: 'Receiver2Weight' },
    ],
  },
  {
    id: 2,
    kpi_name: 'Bran Extraction',
    layout_id: 1,
    layout_name: 'Mil-A',
    formula_expression: '((bran_coarse + bran_fine) / receiver_2) * 100',
    aggregation_type: 'ratio',
    unit: '%',
    tag_mappings: [],
  },
  {
    id: 3,
    kpi_name: 'Water Ratio',
    layout_id: null,
    layout_name: 'Plant-wide',
    formula_expression: 'water_flow / receiver_2',
    aggregation_type: 'ratio',
    unit: '',
    tag_mappings: [],
  },
];

const KpiConfig = () => {
  useLenisScroll();
  const navigate = useNavigate();
  const [kpis, setKpis] = useState(MOCK_KPI_LIST);

  const handleAdd = () => {
    navigate('/admin/kpi-config/new');
  };

  const handleEdit = (kpi) => {
    navigate(`/admin/kpi-config/${kpi.id}/edit`);
  };

  const handleDelete = (kpi) => {
    if (window.confirm(`Delete KPI "${kpi.kpi_name}"? This action cannot be undone.`)) {
      setKpis((prev) => prev.filter((k) => k.id !== kpi.id));
    }
  };

  return (
    <div className="p-6 text-zinc-800 dark:text-zinc-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-4xl font-bold dark:text-gray-100 flex items-center gap-3">
            <FaCalculator className="text-brand" />
            KPI Config
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1 text-base">
            Define historian-based KPIs with formulas and tag mapping (Phase 1 — mock data)
          </p>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="px-4 py-2 bg-brand hover:bg-brand-hover text-white font-medium rounded-lg flex items-center gap-2"
        >
          <FaPlus /> Add KPI
        </button>
      </div>

      <div className="bg-white dark:!bg-[#131b2d] rounded-xl shadow-md border border-gray-200 dark:!border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 dark:!bg-[#081320] border-b border-gray-200 dark:!border-gray-700">
                <th className="text-left py-3 px-4 font-semibold dark:text-gray-100">KPI Name</th>
                <th className="text-left py-3 px-4 font-semibold dark:text-gray-100">Layout</th>
                <th className="text-left py-3 px-4 font-semibold dark:text-gray-100">Formula</th>
                <th className="text-left py-3 px-4 font-semibold dark:text-gray-100">Unit</th>
                <th className="text-left py-3 px-4 font-semibold dark:text-gray-100">Aggregation</th>
                <th className="text-right py-3 px-4 font-semibold dark:text-gray-100">Actions</th>
              </tr>
            </thead>
            <tbody>
              {kpis.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    No KPIs defined. Click &quot;Add KPI&quot; to create one.
                  </td>
                </tr>
              ) : (
                kpis.map((kpi) => (
                  <tr
                    key={kpi.id}
                    className="border-b border-gray-200 dark:!border-gray-700 hover:bg-gray-50 dark:hover:!bg-[#081320]/50"
                  >
                    <td className="py-3 px-4 font-medium dark:text-gray-200">{kpi.kpi_name}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{kpi.layout_name ?? '—'}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 font-mono text-sm max-w-xs truncate" title={kpi.formula_expression}>
                      {kpi.formula_expression}
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{kpi.unit || '—'}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{kpi.aggregation_type}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleEdit(kpi)}
                        className="p-2 text-brand hover:bg-brand-subtle dark:hover:bg-cyan-900/20 rounded-lg mr-1"
                        title="Edit"
                      >
                        <FaEdit />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(kpi)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                        title="Delete"
                      >
                        <FaTrash />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default KpiConfig;
