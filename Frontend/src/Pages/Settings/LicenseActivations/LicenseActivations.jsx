import React, { useState, useEffect, useCallback } from 'react';
import { FaKey, FaCheck, FaTimes, FaTrash, FaSync, FaCalendarPlus, FaEdit, FaDesktop } from 'react-icons/fa';
import axios from '../../../API/axios';
import endpoints from '../../../API/endpoints';
import { toast } from 'react-toastify';
import { useLanguage } from '../../../Hooks/useLanguage';

const STATUS_BADGE = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  denied: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const FILTER_OPTIONS = ['all', 'pending', 'approved', 'denied'];

export default function LicenseActivations() {
  const { t } = useLanguage();
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [extendId, setExtendId] = useState(null);
  const [extendDate, setExtendDate] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [editField, setEditField] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const fetchLicenses = useCallback(() => {
    setLoading(true);
    const url = filter === 'all' ? endpoints.licenses.list : `${endpoints.licenses.list}?status=${filter}`;
    axios.get(url)
      .then(res => { setLicenses(res.data || []); })
      .catch(err => {
        const detail = err.response?.data?.detail || err.response?.data?.error || err.message || '';
        toast.error(t('licenses.failedLoad') + (detail ? `: ${detail}` : ''));
      })
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { fetchLicenses(); }, [fetchLicenses]);

  useEffect(() => {
    const interval = setInterval(fetchLicenses, 30000);
    return () => clearInterval(interval);
  }, [fetchLicenses]);

  const handleApprove = async (id) => {
    try {
      await axios.patch(endpoints.licenses.update(id), { status: 'approved' });
      toast.success(t('licenses.approvedMsg'));
      fetchLicenses();
    } catch (err) {
      toast.error(err.response?.data?.error || t('licenses.failedApprove'));
    }
  };

  const handleDeny = async (id) => {
    try {
      await axios.patch(endpoints.licenses.update(id), { status: 'denied' });
      toast.success(t('licenses.deniedMsg'));
      fetchLicenses();
    } catch (err) {
      toast.error(err.response?.data?.error || t('licenses.failedDeny'));
    }
  };

  const handleQuickExtend = async (id, days) => {
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + days);
    const expiryStr = newExpiry.toISOString().split('T')[0];
    try {
      await axios.patch(endpoints.licenses.update(id), { expiry: expiryStr });
      toast.success(t('licenses.extendedMsg').replace('{days}', days).replace('{date}', expiryStr));
      fetchLicenses();
      setExtendId(null);
    } catch (err) {
      toast.error(err.response?.data?.error || t('licenses.failedExtend'));
    }
  };

  const handleCustomExtend = async () => {
    if (!extendDate) { toast.error(t('licenses.selectDate')); return; }
    try {
      await axios.patch(endpoints.licenses.update(extendId), { expiry: extendDate });
      toast.success(t('licenses.expirySetMsg').replace('{date}', extendDate));
      fetchLicenses();
      setExtendId(null);
      setExtendDate('');
    } catch (err) {
      toast.error(err.response?.data?.error || t('licenses.failedSetExpiry'));
    }
  };

  const FIELD_LABELS = { label: t('licenses.label'), site_name: t('licenses.siteName'), license_name: t('licenses.licenseName') };

  const handleSaveField = async () => {
    if (!editField) return;
    try {
      await axios.patch(endpoints.licenses.update(editField.id), { [editField.field]: editField.value });
      toast.success(`${FIELD_LABELS[editField.field] || editField.field} saved`);
      setEditField(null);
      fetchLicenses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(endpoints.licenses.remove(deleteId));
      toast.success(t('licenses.deletedMsg'));
      setDeleteId(null);
      fetchLicenses();
    } catch (err) {
      toast.error(err.response?.data?.error || t('licenses.failedDelete'));
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return iso; }
  };

  const isExpired = (expiry) => {
    if (!expiry) return false;
    try { return new Date(expiry) < new Date(); } catch { return false; }
  };

  const smallBtnClass = 'px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors';

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FaKey className="text-brand" size={13} />
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7f94]">
              {t('licenses.title')}
            </h3>
            <span className="text-[10px] text-[#8898aa] ml-2">
              {licenses.length} {licenses.length !== 1 ? t('licenses.records') : t('licenses.record')}
            </span>
          </div>
          <button onClick={fetchLicenses}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-md border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825] transition-colors">
            <FaSync size={9} className={loading ? 'animate-spin' : ''} />
            {t('licenses.refresh')}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-1.5">
          {FILTER_OPTIONS.map(opt => (
            <button key={opt} onClick={() => setFilter(opt)}
              className={`px-3 py-1 text-[10px] font-medium rounded-md capitalize transition-colors ${
                filter === opt
                  ? 'bg-brand text-white'
                  : 'border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]'
              }`}>
              {opt}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-[12px] text-[#8898aa]">{t('common.loading')}</p>
        ) : licenses.length === 0 ? (
          <p className="text-[12px] text-[#8898aa] py-8 text-center">{t('licenses.noRecords')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#e3e9f0] dark:border-[#1e2d40]">
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">{t('licenses.labelMachine')}</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">{t('licenses.siteName')}</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">{t('licenses.licenseName')}</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">{t('licenses.hostname')}</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">{t('licenses.status')}</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">{t('licenses.expiry')}</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">{t('licenses.lastSeen')}</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">{t('licenses.info')}</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map(lic => (
                  <React.Fragment key={lic.id}>
                    <tr className="border-b border-[#e3e9f0] dark:border-[#1e2d40] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]">
                      {/* Label / Machine ID */}
                      <td className="py-2.5 px-3">
                        {editField?.id === lic.id && editField.field === 'label' ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editField.value}
                              onChange={e => setEditField({ ...editField, value: e.target.value })}
                              placeholder="e.g. Al-Jahra Cement - Line 2"
                              className="px-2 py-0.5 text-[11px] rounded border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] w-48"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveField(); if (e.key === 'Escape') setEditField(null); }}
                            />
                            <button onClick={handleSaveField} className={`${smallBtnClass} bg-emerald-600 text-white hover:bg-emerald-700`}>
                              <FaCheck size={9} />
                            </button>
                            <button onClick={() => setEditField(null)} className={`${smallBtnClass} bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300`}>
                              <FaTimes size={9} />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[#2a3545] dark:text-[#e1e8f0] font-medium">
                                {lic.label || t('licenses.unlabeled')}
                              </span>
                              <button
                                onClick={() => setEditField({ id: lic.id, field: 'label', value: lic.label || '' })}
                                className="text-[#8898aa] hover:text-brand"
                                title={t('licenses.editLabel')}
                              >
                                <FaEdit size={9} />
                              </button>
                            </div>
                            <div className="font-mono text-[10px] text-[#8898aa] mt-0.5 truncate max-w-[180px]" title={lic.machine_id}>
                              {lic.machine_id}
                            </div>
                          </div>
                        )}
                      </td>
                      {/* Site Name */}
                      <td className="py-2.5 px-3">
                        {editField?.id === lic.id && editField.field === 'site_name' ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editField.value}
                              onChange={e => setEditField({ ...editField, value: e.target.value })}
                              placeholder="e.g. Al-Jahra Plant"
                              className="px-2 py-0.5 text-[11px] rounded border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] w-40"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveField(); if (e.key === 'Escape') setEditField(null); }}
                            />
                            <button onClick={handleSaveField} className={`${smallBtnClass} bg-emerald-600 text-white hover:bg-emerald-700`}>
                              <FaCheck size={9} />
                            </button>
                            <button onClick={() => setEditField(null)} className={`${smallBtnClass} bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300`}>
                              <FaTimes size={9} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#2a3545] dark:text-[#e1e8f0]">
                              {lic.site_name || '—'}
                            </span>
                            <button
                              onClick={() => setEditField({ id: lic.id, field: 'site_name', value: lic.site_name || '' })}
                              className="text-[#8898aa] hover:text-brand"
                              title={t('licenses.editSiteName')}
                            >
                              <FaEdit size={9} />
                            </button>
                          </div>
                        )}
                      </td>
                      {/* License Name */}
                      <td className="py-2.5 px-3">
                        {editField?.id === lic.id && editField.field === 'license_name' ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editField.value}
                              onChange={e => setEditField({ ...editField, value: e.target.value })}
                              placeholder="e.g. Production Line 2"
                              className="px-2 py-0.5 text-[11px] rounded border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] w-40"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveField(); if (e.key === 'Escape') setEditField(null); }}
                            />
                            <button onClick={handleSaveField} className={`${smallBtnClass} bg-emerald-600 text-white hover:bg-emerald-700`}>
                              <FaCheck size={9} />
                            </button>
                            <button onClick={() => setEditField(null)} className={`${smallBtnClass} bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300`}>
                              <FaTimes size={9} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[#2a3545] dark:text-[#e1e8f0]">
                              {lic.license_name || '—'}
                            </span>
                            <button
                              onClick={() => setEditField({ id: lic.id, field: 'license_name', value: lic.license_name || '' })}
                              className="text-[#8898aa] hover:text-brand"
                              title={t('licenses.editLicenseName')}
                            >
                              <FaEdit size={9} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[#2a3545] dark:text-[#e1e8f0]">
                        {lic.hostname || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${STATUS_BADGE[lic.status] || STATUS_BADGE.pending}`}>
                          {lic.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={isExpired(lic.expiry) ? 'text-red-500 font-medium' : 'text-[#2a3545] dark:text-[#e1e8f0]'}>
                          {formatDate(lic.expiry)}
                        </span>
                        {isExpired(lic.expiry) && (
                          <span className="ml-1 text-[9px] text-red-400">{t('licenses.expired')}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[#8898aa]">{formatDate(lic.last_seen_at)}</td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => setExpandedId(expandedId === lic.id ? null : lic.id)}
                          className={`${smallBtnClass} border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]`}
                          title={t('licenses.machineDetails')}
                        >
                          <FaDesktop size={9} />
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        {deleteId === lic.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-red-500 mr-1">{t('licenses.deleteConfirm')}</span>
                            <button onClick={handleDelete} className={`${smallBtnClass} bg-red-600 text-white hover:bg-red-700`}>
                              <FaCheck size={9} />
                            </button>
                            <button onClick={() => setDeleteId(null)} className={`${smallBtnClass} bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300`}>
                              <FaTimes size={9} />
                            </button>
                          </div>
                        ) : extendId === lic.id ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            <button onClick={() => handleQuickExtend(lic.id, 15)} className={`${smallBtnClass} bg-brand text-white hover:bg-brand-hover`}>+15d</button>
                            <button onClick={() => handleQuickExtend(lic.id, 30)} className={`${smallBtnClass} bg-brand text-white hover:bg-brand-hover`}>+30d</button>
                            <button onClick={() => handleQuickExtend(lic.id, 90)} className={`${smallBtnClass} bg-brand text-white hover:bg-brand-hover`}>+90d</button>
                            <input type="date" value={extendDate} onChange={e => setExtendDate(e.target.value)}
                              className="px-1.5 py-0.5 text-[10px] rounded border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0]" />
                            <button onClick={handleCustomExtend} className={`${smallBtnClass} bg-emerald-600 text-white hover:bg-emerald-700`}>
                              <FaCheck size={9} />
                            </button>
                            <button onClick={() => { setExtendId(null); setExtendDate(''); }} className={`${smallBtnClass} bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300`}>
                              <FaTimes size={9} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            {lic.status !== 'approved' && (
                              <button onClick={() => handleApprove(lic.id)} title={t('licenses.approveDefault')}
                                className={`${smallBtnClass} bg-emerald-600 text-white hover:bg-emerald-700`}>
                                <FaCheck size={9} />
                              </button>
                            )}
                            {lic.status !== 'denied' && (
                              <button onClick={() => handleDeny(lic.id)} title={t('licenses.deny')}
                                className={`${smallBtnClass} border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20`}>
                                <FaTimes size={9} />
                              </button>
                            )}
                            {lic.status === 'approved' && (
                              <button onClick={() => setExtendId(lic.id)} title={t('licenses.extendExpiry')}
                                className={`${smallBtnClass} border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]`}>
                                <FaCalendarPlus size={9} />
                              </button>
                            )}
                            <button onClick={() => setDeleteId(lic.id)} title={t('common.delete')}
                              className={`${smallBtnClass} border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20`}>
                              <FaTrash size={9} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {/* Expanded machine info row */}
                    {expandedId === lic.id && (
                      <tr className="bg-[#f8fafc] dark:bg-[#0a1018]">
                        <td colSpan={9} className="py-3 px-6">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-[11px]">
                            <div>
                              <span className="text-[#8898aa]">{t('licenses.mac')} </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0] font-mono">{lic.mac_address || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">{t('licenses.ip')} </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0] font-mono">{lic.ip_address || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">{t('licenses.os')} </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0]">{lic.os_version || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">{t('licenses.cpu')} </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0]">{lic.cpu_info || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">{t('licenses.ram')} </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0]">{lic.ram_gb ? `${lic.ram_gb} GB` : '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">{t('licenses.diskSerial')} </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0] font-mono">{lic.disk_serial || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">{t('licenses.user')} </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0]">{lic.user_id || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">{t('licenses.created')} </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0]">{formatDate(lic.created_at)}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
