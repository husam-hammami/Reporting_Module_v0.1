import React, { useState, useContext } from 'react';
import { FaUser, FaKey, FaSave } from 'react-icons/fa';
import axios from '../../API/axios';
import endpoints from '../../API/endpoints';
import { AuthContext } from '../../Context/AuthProvider';
import { toast } from 'react-toastify';
import { useLanguage } from '../../Hooks/useLanguage';

const ROLE_BADGE = {
  superadmin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  manager: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  operator: 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400',
};

export default function MyAccount() {
  const { auth } = useContext(AuthContext);
  const { t } = useLanguage();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changing, setChanging] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) { toast.error(t('users.passwordsNoMatch')); return; }
    if (newPassword.length < 2) { toast.error(t('users.passwordMinLength')); return; }
    setChanging(true);
    try {
      await axios.post(endpoints.users.changeOwnPassword, { current_password: currentPassword, new_password: newPassword });
      toast.success(t('users.passwordChanged'));
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      toast.error(err.response?.data?.error || t('users.failedChangePassword'));
    } finally {
      setChanging(false);
    }
  };

  const inputClass = "w-full px-3 py-2 text-[13px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:ring-2 focus:ring-brand focus:border-transparent outline-none";
  const labelClass = "block text-[11px] font-medium text-[#6b7f94] mb-1.5";

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* ── Account Info ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FaUser className="text-brand" size={13} />
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7f94]">{t('profile.accountInfo')}</h3>
          </div>
          <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-[#f5f8fb] dark:bg-[#0d1825] border border-[#e3e9f0] dark:border-[#1e2d40] flex items-center justify-center">
                <FaUser className="text-[#8898aa]" size={22} />
              </div>
              <div>
                <p className="text-[16px] font-bold text-[#2a3545] dark:text-[#e1e8f0]">{auth?.username}</p>
                <span className={`inline-block mt-1 px-2.5 py-0.5 text-[10px] font-semibold rounded-full ${ROLE_BADGE[auth?.role] || ROLE_BADGE.operator}`}>
                  {auth?.role}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Change Password ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <FaKey className="text-brand" size={11} />
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7f94]">{t('users.changeMyPassword')}</h3>
          </div>
          <div className="bg-white dark:bg-[#131b2d] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className={labelClass}>{t('users.currentPassword')}</label>
                <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                  placeholder={t('users.currentPasswordPlaceholder')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t('users.newPassword')}</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder={t('users.newPasswordPlaceholder')} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>{t('users.confirmPassword')}</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder={t('users.confirmPasswordPlaceholder')} className={inputClass} />
              </div>
            </div>
            <div className="mt-4">
              <button onClick={handleChangePassword} disabled={changing}
                className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50">
                <FaSave size={10} />
                {changing ? t('users.changing') : t('users.changePassword')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
