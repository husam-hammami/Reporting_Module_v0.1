import React, { useState, useEffect, useContext } from 'react';
import { FaUsers, FaSave, FaEdit, FaKey, FaTrash, FaTimes, FaCheck, FaPlus } from 'react-icons/fa';
import axios from '../../../API/axios';
import endpoints from '../../../API/endpoints';
import { AuthContext } from '../../../Context/AuthProvider';
import { toast } from 'react-toastify';

const ROLE_BADGE = {
  admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  manager: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  operator: 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400',
};

export default function UserManagement() {
  const { auth } = useContext(AuthContext);
  const isAdmin = auth?.role === 'admin';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Inline edit
  const [editingId, setEditingId] = useState(null);
  const [editUsername, setEditUsername] = useState('');
  const [editRole, setEditRole] = useState('');

  // Reset password
  const [resetId, setResetId] = useState(null);
  const [resetPassword, setResetPassword] = useState('');

  // Delete confirmation
  const [deleteId, setDeleteId] = useState(null);

  // Add user form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [addingUser, setAddingUser] = useState(false);

  // Change own password
  const [currentPassword, setCurrentPassword] = useState('');
  const [ownNewPassword, setOwnNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingOwn, setChangingOwn] = useState(false);

  const fetchUsers = () => {
    axios.get(endpoints.users.list)
      .then(res => { setUsers(res.data || []); setLoading(false); })
      .catch(() => { toast.error('Failed to load users'); setLoading(false); });
  };

  useEffect(() => { fetchUsers(); }, []);

  // ── Edit user ──
  const startEdit = (user) => {
    setEditingId(user.id);
    setEditUsername(user.username);
    setEditRole(user.role);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async () => {
    try {
      await axios.put(endpoints.users.update(editingId), { username: editUsername, role: editRole });
      toast.success('User updated');
      setEditingId(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user');
    }
  };

  // ── Reset password ──
  const saveResetPassword = async () => {
    if (resetPassword.length < 2) { toast.error('Password must be at least 2 characters'); return; }
    try {
      await axios.post(endpoints.users.changePassword(resetId), { new_password: resetPassword });
      toast.success('Password reset');
      setResetId(null);
      setResetPassword('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    }
  };

  // ── Delete user ──
  const confirmDelete = async () => {
    try {
      await axios.delete(endpoints.users.delete(deleteId));
      toast.success('User deleted');
      setDeleteId(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete user');
    }
  };

  // ── Add user ──
  const handleAddUser = async () => {
    if (!newUsername || !newPassword || !newRole) { toast.error('All fields required'); return; }
    setAddingUser(true);
    try {
      await axios.post(endpoints.users.create, { username: newUsername, password: newPassword, role: newRole });
      toast.success('User created');
      setNewUsername(''); setNewPassword(''); setNewRole('operator');
      fetchUsers();
    } catch (err) {
      const msg = err.response?.data?.error === 'duplicate' ? 'Username already exists' : (err.response?.data?.error || 'Failed to create user');
      toast.error(msg);
    } finally {
      setAddingUser(false);
    }
  };

  // ── Change own password ──
  const handleChangeOwnPassword = async () => {
    if (ownNewPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (ownNewPassword.length < 2) { toast.error('Password must be at least 2 characters'); return; }
    setChangingOwn(true);
    try {
      await axios.post(endpoints.users.changeOwnPassword, { current_password: currentPassword, new_password: ownNewPassword });
      toast.success('Password changed');
      setCurrentPassword(''); setOwnNewPassword(''); setConfirmPassword('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setChangingOwn(false);
    }
  };

  const inputClass = "w-full px-3 py-2 text-[13px] rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] bg-white dark:bg-[#0d1825] text-[#2a3545] dark:text-[#e1e8f0] focus:ring-2 focus:ring-brand focus:border-transparent outline-none";
  const labelClass = "block text-[11px] font-medium text-[#6b7f94] mb-1.5";
  const smallBtnClass = "px-2.5 py-1 text-[10px] font-medium rounded-md transition-colors";

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* ── Section 1: User Accounts ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FaUsers className="text-brand" size={13} />
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7f94]">User Accounts</h3>
          </div>

          {loading ? (
            <p className="text-[12px] text-[#8898aa]">Loading...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#e3e9f0] dark:border-[#1e2d40]">
                    <th className="text-left py-2 px-3 text-[11px] font-semibold uppercase text-[#6b7f94]">Username</th>
                    <th className="text-left py-2 px-3 text-[11px] font-semibold uppercase text-[#6b7f94]">Role</th>
                    {isAdmin && <th className="text-left py-2 px-3 text-[11px] font-semibold uppercase text-[#6b7f94]">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b border-[#e3e9f0] dark:border-[#1e2d40] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]">
                      <td className="py-2.5 px-3 text-[#2a3545] dark:text-[#e1e8f0]">
                        {editingId === user.id ? (
                          <input value={editUsername} onChange={e => setEditUsername(e.target.value)} className={inputClass + ' !py-1'} />
                        ) : user.username}
                      </td>
                      <td className="py-2.5 px-3">
                        {editingId === user.id ? (
                          <select value={editRole} onChange={e => setEditRole(e.target.value)}
                            className={inputClass + ' !py-1 !w-32'}>
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="operator">Operator</option>
                          </select>
                        ) : (
                          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${ROLE_BADGE[user.role] || ROLE_BADGE.operator}`}>
                            {user.role}
                          </span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-2.5 px-3">
                          {editingId === user.id ? (
                            <div className="flex gap-1">
                              <button onClick={saveEdit} className={`${smallBtnClass} bg-emerald-600 text-white hover:bg-emerald-700`}><FaCheck size={9} /></button>
                              <button onClick={cancelEdit} className={`${smallBtnClass} bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300`}><FaTimes size={9} /></button>
                            </div>
                          ) : resetId === user.id ? (
                            <div className="flex items-center gap-1">
                              <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)}
                                placeholder="New password" className={inputClass + ' !py-1 !w-32 !text-[11px]'} />
                              <button onClick={saveResetPassword} className={`${smallBtnClass} bg-brand text-white hover:bg-brand-hover`}><FaCheck size={9} /></button>
                              <button onClick={() => { setResetId(null); setResetPassword(''); }} className={`${smallBtnClass} bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300`}><FaTimes size={9} /></button>
                            </div>
                          ) : deleteId === user.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-red-500 mr-1">Delete?</span>
                              <button onClick={confirmDelete} className={`${smallBtnClass} bg-red-600 text-white hover:bg-red-700`}><FaCheck size={9} /></button>
                              <button onClick={() => setDeleteId(null)} className={`${smallBtnClass} bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300`}><FaTimes size={9} /></button>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <button onClick={() => startEdit(user)} className={`${smallBtnClass} border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]`} title="Edit">
                                <FaEdit size={9} />
                              </button>
                              <button onClick={() => setResetId(user.id)} className={`${smallBtnClass} border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#0d1825]`} title="Reset Password">
                                <FaKey size={9} />
                              </button>
                              <button onClick={() => setDeleteId(user.id)} className={`${smallBtnClass} border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20`} title="Delete">
                                <FaTrash size={9} />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Section 2: Add New User (admin only) ── */}
        {isAdmin && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FaPlus className="text-brand" size={11} />
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7f94]">Add New User</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className={labelClass}>Username</label>
                <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)}
                  placeholder="username" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="password" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Role</label>
                <select value={newRole} onChange={e => setNewRole(e.target.value)} className={inputClass}>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="operator">Operator</option>
                </select>
              </div>
              <button onClick={handleAddUser} disabled={addingUser}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50">
                <FaPlus size={9} />
                {addingUser ? 'Adding...' : 'Add User'}
              </button>
            </div>
          </div>
        )}

        {/* ── Section 3: Change My Password (all roles) ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <FaKey className="text-brand" size={11} />
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#6b7f94]">Change My Password</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className={labelClass}>Current Password</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Current password" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>New Password</label>
              <input type="password" value={ownNewPassword} onChange={e => setOwnNewPassword(e.target.value)}
                placeholder="New password" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password" className={inputClass} />
            </div>
          </div>
          <div className="mt-3">
            <button onClick={handleChangeOwnPassword} disabled={changingOwn}
              className="inline-flex items-center gap-2 px-4 py-2 text-[11px] font-medium rounded-lg bg-brand hover:bg-brand-hover text-white transition-colors disabled:opacity-50">
              <FaSave size={10} />
              {changingOwn ? 'Changing...' : 'Change Password'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
