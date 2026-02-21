/**
 * KPI Config — Create/Edit form placeholder (Phase 1.2 will implement full form)
 */

import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLenisScroll } from '../../Hooks/useLenisScroll';
import { FaArrowLeft } from 'react-icons/fa';

const KpiConfigForm = () => {
  useLenisScroll();
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id || id === 'new';

  return (
    <div className="p-6 text-zinc-800 dark:text-zinc-200">
      <button
        type="button"
        onClick={() => navigate('/admin/kpi-config')}
        className="mb-4 flex items-center gap-2 text-brand hover:text-brand-hover dark:text-cyan-400"
      >
        <FaArrowLeft /> Back to KPI list
      </button>
      <div className="bg-white dark:!bg-[#131b2d] rounded-xl shadow-md border border-gray-200 dark:!border-gray-700 p-8 text-center">
        <h2 className="text-xl font-semibold dark:text-gray-100 mb-2">
          {isNew ? 'Create KPI' : 'Edit KPI'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          KPI create/edit form will be implemented in Phase 1.2 (KPI_ENGINE_PLAN.md).
        </p>
      </div>
    </div>
  );
};

export default KpiConfigForm;
