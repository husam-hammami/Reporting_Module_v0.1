import React, { useState, useEffect } from 'react';
import { FaEnvelope, FaSave, FaPaperPlane, FaEye, FaEyeSlash, FaChevronDown, FaChevronRight } from 'react-icons/fa';
import axios from '../../../API/axios';
import { toast } from 'react-toastify';
import { useLanguage } from '../../../Hooks/useLanguage';

export default function SmtpSection() {
  const [open, setOpen] = useState(false);
  const [smtpServer, setSmtpServer] = useState('');
  const [smtpPort, setSmtpPort] = useState(465);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tls, setTls] = useState(true);
  const [fromAddress, setFromAddress] = useState('');
  const [recipient, setRecipient] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const { t } = useLanguage();

  useEffect(() => {
    axios.get('/api/settings/smtp-config')
      .then(res => {
        const d = res.data;
        setSmtpServer(d.smtp_server || '');
        setSmtpPort(d.smtp_port || 465);
        setUsername(d.username || '');
        setPassword(d.password || '');
        setTls(d.tls !== false);
        setFromAddress(d.from_address || '');
        setRecipient(d.recipient || '');
      })
      .catch(() => toast.error(t('smtp.failedLoad')));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post('/api/settings/smtp-config', {
        smtp_server: smtpServer,
        smtp_port: Number(smtpPort),
        username,
        password,
        tls,
        from_address: fromAddress,
        recipient,
      });
      toast.success(t('smtp.saved'));
    } catch {
      toast.error(t('smtp.failedSave'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post('/api/settings/smtp-test', { to_email: recipient || undefined });
      if (res.data?.success) {
        setTestResult({ ok: true, msg: t('smtp.testSuccess') });
      } else {
        setTestResult({ ok: false, msg: res.data?.error || 'Test failed' });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err.response?.data?.error || 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const inputClass = "w-full px-3 py-2 text-[13px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:ring-2 focus:ring-brand focus:border-transparent outline-none";
  const labelClass = "block text-[11px] font-medium text-[#6b7f94] mb-1.5";

  return (
    <div className="bg-white dark:bg-[#131b2d] rounded-xl border border-[#e3e9f0] dark:border-[#1e2d40]">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-[#f5f8fb] dark:hover:bg-[#0f1829] transition-colors rounded-xl"
      >
        <div className="flex items-center gap-2">
          <FaEnvelope className="text-brand" size={13} />
          <span className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7f94]">
            {t('smtp.title')}
          </span>
        </div>
        {open ? <FaChevronDown size={11} className="text-[#8898aa]" /> : <FaChevronRight size={11} className="text-[#8898aa]" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          <p className="text-[11px] text-[#8898aa]">
            {t('smtp.description')}
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t('smtp.server')}</label>
              <input type="text" value={smtpServer} onChange={e => setSmtpServer(e.target.value)}
                placeholder="smtp.gmail.com" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t('smtp.port')}</label>
              <input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                placeholder="465" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t('smtp.username')}</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="user@example.com" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t('smtp.password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('smtp.passwordPlaceholder')}
                  className={inputClass + ' pr-10'}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8898aa] hover:text-brand">
                  {showPassword ? <FaEyeSlash size={13} /> : <FaEye size={13} />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>{t('smtp.fromAddress')}</label>
              <input type="email" value={fromAddress} onChange={e => setFromAddress(e.target.value)}
                placeholder="noreply@company.com" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>{t('smtp.defaultRecipient')}</label>
              <input type="email" value={recipient} onChange={e => setRecipient(e.target.value)}
                placeholder="reports@company.com" className={inputClass} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={tls} onChange={e => setTls(e.target.checked)}
                className="sr-only peer" />
              <div className="w-9 h-5 bg-gray-300 peer-focus:ring-2 peer-focus:ring-brand rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
            </label>
            <span className="text-[12px] text-[#6b7f94]">{t('smtp.useTls')}</span>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50">
              <FaSave size={10} />
              {saving ? t('common.saving') : t('common.save')}
            </button>
            <button onClick={handleTest} disabled={testing}
              className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-medium rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:text-[#3a4a5c] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825] transition-colors disabled:opacity-50">
              <FaPaperPlane size={10} />
              {testing ? t('smtp.sending') : t('smtp.test')}
            </button>
            {testResult && (
              <span className={`text-[11px] font-medium ${testResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                {testResult.msg}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
