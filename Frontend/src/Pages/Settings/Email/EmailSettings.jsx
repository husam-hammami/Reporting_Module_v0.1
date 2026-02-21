import React, { useState, useEffect } from 'react';
import { FaEnvelope, FaSave, FaPaperPlane, FaEye, FaEyeSlash } from 'react-icons/fa';
import axios from '../../../API/axios';
import { toast } from 'react-toastify';

export default function EmailSettings() {
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
      .catch(() => toast.error('Failed to load SMTP config'));
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
      toast.success('SMTP configuration saved');
    } catch {
      toast.error('Failed to save SMTP configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post('/api/settings/smtp-test');
      if (res.data?.success) {
        setTestResult({ ok: true, msg: 'Test email sent successfully' });
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
    <div className="p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Section header */}
        <div className="flex items-center gap-2 mb-1">
          <FaEnvelope className="text-brand" size={13} />
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7f94] dark:text-[#6b7f94]">
            Email / SMTP Configuration
          </h3>
        </div>
        <p className="text-[11px] text-[#8898aa] -mt-4">
          Configure the SMTP server used for sending report emails.
        </p>

        {/* Row 1: Server + Port */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>SMTP Server</label>
            <input type="text" value={smtpServer} onChange={e => setSmtpServer(e.target.value)}
              placeholder="smtp.gmail.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Port</label>
            <input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
              placeholder="465" className={inputClass} />
          </div>
        </div>

        {/* Row 2: Username + Password */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="user@example.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="App password"
                className={inputClass + ' pr-10'}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8898aa] hover:text-brand">
                {showPassword ? <FaEyeSlash size={13} /> : <FaEye size={13} />}
              </button>
            </div>
          </div>
        </div>

        {/* Row 3: From + Recipient */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>From Address</label>
            <input type="email" value={fromAddress} onChange={e => setFromAddress(e.target.value)}
              placeholder="noreply@company.com" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Recipient</label>
            <input type="email" value={recipient} onChange={e => setRecipient(e.target.value)}
              placeholder="reports@company.com" className={inputClass} />
          </div>
        </div>

        {/* Row 4: TLS */}
        <div className="flex items-center gap-3">
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={tls} onChange={e => setTls(e.target.checked)}
              className="sr-only peer" />
            <div className="w-9 h-5 bg-gray-300 peer-focus:ring-2 peer-focus:ring-brand rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand"></div>
          </label>
          <span className="text-[12px] text-[#6b7f94]">Use TLS / SSL</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50">
            <FaSave size={10} />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
          <button onClick={handleTest} disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-medium rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:text-[#3a4a5c] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825] transition-colors disabled:opacity-50">
            <FaPaperPlane size={10} />
            {testing ? 'Sending...' : 'Send Test Email'}
          </button>
          {testResult && (
            <span className={`text-[11px] font-medium ${testResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
              {testResult.msg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
