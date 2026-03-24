import React, { useState, useEffect, useCallback } from 'react';
import { FaKey, FaCheck, FaTimes, FaTrash, FaSync, FaCalendarPlus, FaEdit, FaDesktop } from 'react-icons/fa';
import axios from '../../../API/axios';
import endpoints from '../../../API/endpoints';
import { toast } from 'react-toastify';

const STATUS_BADGE = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  denied: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const FILTER_OPTIONS = ['all', 'pending', 'approved', 'denied'];

export default function LicenseActivations() {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [extendId, setExtendId] = useState(null);
  const [extendDate, setExtendDate] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [editLabelId, setEditLabelId] = useState(null);
  const [editLabelValue, setEditLabelValue] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const fetchLicenses = useCallback(() => {
    setLoading(true);
    const url = filter === 'all' ? endpoints.licenses.list : `${endpoints.licenses.list}?status=${filter}`;
    axios.get(url)
      .then(res => { setLicenses(res.data || []); })
      .catch(err => {
        const detail = err.response?.data?.detail || err.response?.data?.error || err.message || '';
        toast.error('Failed to load licenses' + (detail ? `: ${detail}` : ''));
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
      toast.success('License approved (15-day default)');
      fetchLicenses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to approve');
    }
  };

  const handleDeny = async (id) => {
    try {
      await axios.patch(endpoints.licenses.update(id), { status: 'denied' });
      toast.success('License denied');
      fetchLicenses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to deny');
    }
  };

  const handleQuickExtend = async (id, days) => {
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + days);
    const expiryStr = newExpiry.toISOString().split('T')[0];
    try {
      await axios.patch(endpoints.licenses.update(id), { expiry: expiryStr });
      toast.success(`Extended by ${days} days (until ${expiryStr})`);
      fetchLicenses();
      setExtendId(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to extend');
    }
  };

  const handleCustomExtend = async () => {
    if (!extendDate) { toast.error('Select a date'); return; }
    try {
      await axios.patch(endpoints.licenses.update(extendId), { expiry: extendDate });
      toast.success(`Expiry set to ${extendDate}`);
      fetchLicenses();
      setExtendId(null);
      setExtendDate('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to set expiry');
    }
  };

  const handleSaveLabel = async (id) => {
    try {
      await axios.patch(endpoints.licenses.update(id), { label: editLabelValue });
      toast.success('Label saved');
      setEditLabelId(null);
      setEditLabelValue('');
      fetchLicenses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save label');
    }
  };

  const handleDelete = async () => {
    try {
      await axios.delete(endpoints.licenses.remove(deleteId));
      toast.success('License record deleted');
      setDeleteId(null);
      fetchLicenses();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete');
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
              License Activations
            </h3>
            <span className="text-[10px] text-[#8898aa] ml-2">
              {licenses.length} record{licenses.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button onClick={fetchLicenses}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-md border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825] transition-colors">
            <FaSync size={9} className={loading ? 'animate-spin' : ''} />
            Refresh
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
          <p className="text-[12px] text-[#8898aa]">Loading...</p>
        ) : licenses.length === 0 ? (
          <p className="text-[12px] text-[#8898aa] py-8 text-center">No license records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[#e3e9f0] dark:border-[#1e2d40]">
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">Label / Machine</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">Hostname</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">Status</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">Expiry</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">Last Seen</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">Info</th>
                  <th className="text-left py-2 px-3 text-[10px] font-semibold uppercase text-[#6b7f94]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map(lic => (
                  <React.Fragment key={lic.id}>
                    <tr className="border-b border-[#e3e9f0] dark:border-[#1e2d40] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]">
                      {/* Label / Machine ID */}
                      <td className="py-2.5 px-3">
                        {editLabelId === lic.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={editLabelValue}
                              onChange={e => setEditLabelValue(e.target.value)}
                              placeholder="e.g. Al-Jahra Cement - Line 2"
                              className="px-2 py-0.5 text-[11px] rounded border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] w-48"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveLabel(lic.id); if (e.key === 'Escape') setEditLabelId(null); }}
                            />
                            <button onClick={() => handleSaveLabel(lic.id)} className={`${smallBtnClass} bg-emerald-600 text-white hover:bg-emerald-700`}>
                              <FaCheck size={9} />
                            </button>
                            <button onClick={() => setEditLabelId(null)} className={`${smallBtnClass} bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300`}>
                              <FaTimes size={9} />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[#2a3545] dark:text-[#e1e8f0] font-medium">
                                {lic.label || '(unlabeled)'}
                              </span>
                              <button
                                onClick={() => { setEditLabelId(lic.id); setEditLabelValue(lic.label || ''); }}
                                className="text-[#8898aa] hover:text-brand"
                                title="Edit label"
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
                          <span className="ml-1 text-[9px] text-red-400">expired</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[#8898aa]">{formatDate(lic.last_seen_at)}</td>
                      <td className="py-2.5 px-3">
                        <button
                          onClick={() => setExpandedId(expandedId === lic.id ? null : lic.id)}
                          className={`${smallBtnClass} border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]`}
                          title="Machine details"
                        >
                          <FaDesktop size={9} />
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        {deleteId === lic.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-red-500 mr-1">Delete?</span>
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
                              <button onClick={() => handleApprove(lic.id)} title="Approve (15-day default)"
                                className={`${smallBtnClass} bg-emerald-600 text-white hover:bg-emerald-700`}>
                                <FaCheck size={9} />
                              </button>
                            )}
                            {lic.status !== 'denied' && (
                              <button onClick={() => handleDeny(lic.id)} title="Deny"
                                className={`${smallBtnClass} border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20`}>
                                <FaTimes size={9} />
                              </button>
                            )}
                            {lic.status === 'approved' && (
                              <button onClick={() => setExtendId(lic.id)} title="Extend expiry"
                                className={`${smallBtnClass} border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]`}>
                                <FaCalendarPlus size={9} />
                              </button>
                            )}
                            <button onClick={() => setDeleteId(lic.id)} title="Delete"
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
                        <td colSpan={7} className="py-3 px-6">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-[11px]">
                            <div>
                              <span className="text-[#8898aa]">MAC: </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0] font-mono">{lic.mac_address || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">IP: </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0] font-mono">{lic.ip_address || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">OS: </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0]">{lic.os_version || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">CPU: </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0]">{lic.cpu_info || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">RAM: </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0]">{lic.ram_gb ? `${lic.ram_gb} GB` : '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">Disk Serial: </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0] font-mono">{lic.disk_serial || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">User: </span>
                              <span className="text-[#2a3545] dark:text-[#e1e8f0]">{lic.user_id || '—'}</span>
                            </div>
                            <div>
                              <span className="text-[#8898aa]">Created: </span>
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
