import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/auth';
import { API_BASE_URL } from '../../config';
import { useTranslation } from 'react-i18next';
import { Shield, Key, Trash2, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';

interface AdminUser {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
}

export default function UsersTab() {
  const { t } = useTranslation();
  const { apiFetch } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [passwordModalOpen, setPasswordModalOpen] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deletingUser, setDeletingUser] = useState<number | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const skip = (page - 1) * pageSize;
      const res = await apiFetch(`${API_BASE_URL}/admin/users?skip=${skip}&limit=${pageSize}`);
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json() as { users: AdminUser[], total: number };
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, page, pageSize]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleUpdateRole = async (userId: number, currentRole: string) => {
    try {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      const res = await apiFetch(`${API_BASE_URL}/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('Failed to update role');
      void loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleUpdateStatus = async (userId: number, currentStatus: boolean) => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/users/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      void loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const handleDeleteUser = async () => {
    if (deletingUser === null) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/users/${deletingUser}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete user');
      void loadUsers();
      setDeletingUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setDeletingUser(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalOpen || !newPassword) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/users/${passwordModalOpen}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword }),
      });
      if (!res.ok) throw new Error('Failed to reset password');
      alert('Password reset successfully');
      setPasswordModalOpen(null);
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t('admin.users_title')}</h2>
          <p className="admin-page-subtitle">{t('admin.users_subtitle')}</p>
        </div>
      </div>
      
      <div className="admin-page-body">
        {/* Quick Stats */}
        <div className="admin-stats-grid cols-md-3">
          <div className="glass-panel p-6 flex flex-col justify-center items-center">
            <span className="text-3xl font-bold text-primary">{total}</span>
            <span className="text-sm text-faint uppercase tracking-wider mt-1">{t('admin.tab_users')}</span>
          </div>
          <div className="glass-panel p-6 flex flex-col justify-center items-center opacity-70">
            <span className="text-3xl font-bold text-success">{users.filter(u => u.is_active).length}</span>
            <span className="text-sm text-faint uppercase tracking-wider mt-1">Active (Page)</span>
          </div>
          <div className="glass-panel p-6 flex flex-col justify-center items-center opacity-70">
            <span className="text-3xl font-bold text-danger">{users.filter(u => !u.is_active).length}</span>
            <span className="text-sm text-faint uppercase tracking-wider mt-1">Banned (Page)</span>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t('admin.col_username')}</th>
                <th>{t('admin.col_role')}</th>
                <th>{t('admin.col_status')}</th>
                <th className="text-right">{t('admin.col_action')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <Loader2 size={24} className="spin mx-auto text-muted" />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted">{t('admin.no_users')}</td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u.id}>
                    <td className="text-faint font-mono text-sm">{u.id}</td>
                    <td className="font-bold">{u.username}</td>
                    <td>
                      <button 
                        onClick={() => void handleUpdateRole(u.id, u.role)}
                        className={u.role === 'admin' ? 'badge-admin cursor-pointer' : 'badge-neutral cursor-pointer'}
                        title="Click to toggle role"
                      >
                        {u.role === 'admin' && <Shield size={10} className="mr-1" />}
                        {u.role.toUpperCase()}
                      </button>
                    </td>
                    <td>
                      <button 
                        onClick={() => void handleUpdateStatus(u.id, u.is_active)}
                        className={u.is_active ? 'badge-success cursor-pointer' : 'badge-danger cursor-pointer'}
                        title="Click to toggle status"
                      >
                        {u.is_active ? 'ACTIVE' : 'BANNED'}
                      </button>
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button className="btn btn-secondary py-1 px-2 text-xs" onClick={() => { setPasswordModalOpen(u.id); setNewPassword(''); }} title={t('admin.reset_pwd')}>
                          <Key size={14} />
                        </button>
                        <button className="btn btn-danger py-1 px-2 text-xs" onClick={() => setDeletingUser(u.id)} title={t('admin.btn_delete')}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-2">
            <button 
              className="btn btn-secondary px-3 py-1"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium text-muted">{t('admin.page_of', { page, total: totalPages })}</span>
            <button 
              className="btn btn-secondary px-3 py-1"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Reset Password Modal */}
      {passwordModalOpen !== null && (
        <div className="dialog-backdrop" onClick={() => setPasswordModalOpen(null)}>
          <div className="glass-panel dialog-panel" onClick={e => e.stopPropagation()}>
            <h3 className="dialog-title mb-2">{t('admin.reset_pwd')}</h3>
            <form onSubmit={handleResetPassword}>
              <div className="mb-4">
                <label className="input-label">{t('admin.new_pwd')}</label>
                <input 
                  type="password" 
                  className="input" 
                  required 
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPasswordModalOpen(null)}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-primary">{t('admin.save_pwd')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete User */}
      {deletingUser !== null && (
        <ConfirmDialog
          title={t('admin.confirm_delete_user_title', 'Delete User')}
          message={t('admin.confirm_delete_user_desc', 'Are you sure you want to delete this user? This action cannot be undone.')}
          onConfirm={handleDeleteUser}
          onCancel={() => setDeletingUser(null)}
          confirmLabel={t('admin.btn_delete')}
        />
      )}
    </>
  );
}
