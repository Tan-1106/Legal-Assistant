import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/auth';
import { API_BASE_URL } from '../../config';
import { useTranslation } from 'react-i18next';
import { Trash2, Loader2, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import ConfirmDialog from '../../components/ConfirmDialog';

interface ChatSessionAdmin {
  id: string;
  user_id: number;
  username: string;
  title: string;
  created_at: string;
}

interface ChatMessageAdmin {
  id: number;
  role: string;
  content: string;
  sources: string | null;
  created_at: string;
}

export default function ChatsTab() {
  const { t } = useTranslation();
  const { apiFetch } = useAuth();
  const [sessions, setSessions] = useState<ChatSessionAdmin[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [viewSessionId, setViewSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageAdmin[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const skip = (page - 1) * pageSize;
      const res = await apiFetch(`${API_BASE_URL}/admin/chats/sessions?skip=${skip}&limit=${pageSize}`);
      if (!res.ok) throw new Error('Failed to load sessions');
      const data = await res.json() as { sessions: ChatSessionAdmin[], total: number };
      setSessions(data.sessions);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch, page, pageSize]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleDeleteSession = async () => {
    if (!deletingSession) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/chats/sessions/${deletingSession}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete session');
      void loadSessions();
      setDeletingSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setDeletingSession(null);
    }
  };

  const handleViewSession = async (sessionId: string) => {
    setViewSessionId(sessionId);
    setLoadingMessages(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/chats/sessions/${sessionId}/messages`);
      if (!res.ok) throw new Error('Failed to load messages');
      const data = await res.json() as ChatMessageAdmin[];
      setMessages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setViewSessionId(null);
    } finally {
      setLoadingMessages(false);
    }
  };

  const [passwordModal, setPasswordModal] = useState(false);
  const handleDeleteAllSessions = async (password: string) => {
    const res = await apiFetch(`${API_BASE_URL}/sessions/all`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as any;
      throw new Error(body.detail ?? 'Error');
    }
    setSessions([]);
    setTotal(0);
    setPasswordModal(false);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">{t('admin.chats_title')}</h2>
          <p className="admin-page-subtitle">{t('admin.chats_subtitle')}</p>
        </div>
      </div>

      <div className="admin-page-body">
        {/* Quick Stats */}
        <div className="admin-stats-grid cols-md-2">
          <div className="glass-panel p-6 flex flex-col justify-center items-center">
            <span className="text-3xl font-bold text-primary">{total}</span>
            <span className="text-sm text-faint uppercase tracking-wider mt-1">{t('admin.tab_chats')}</span>
          </div>
          <div className="glass-panel p-6 flex flex-col justify-center items-center opacity-70">
            <span className="text-3xl font-bold text-text">{new Set(sessions.map(s => s.username)).size}</span>
            <span className="text-sm text-faint uppercase tracking-wider mt-1">{t('admin.tab_users')} (Page)</span>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                <th>{t('admin.col_date')}</th>
                <th>{t('admin.col_username')}</th>
                <th>{t('admin.col_title')}</th>
                <th className="text-right">{t('admin.col_action')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="text-center py-8">
                    <Loader2 size={24} className="spin mx-auto text-muted" />
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-muted">{t('admin.no_sessions')}</td>
                </tr>
              ) : (
                sessions.map(s => (
                  <tr key={s.id}>
                    <td className="text-sm text-faint font-mono">{new Date(s.created_at).toLocaleString()}</td>
                    <td className="font-bold">{s.username}</td>
                    <td className="text-muted truncate max-w-sm">{s.title}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-2">
                        <button className="btn btn-secondary py-1 px-2 text-xs" onClick={() => void handleViewSession(s.id)} title={t('admin.preview')}>
                          <Eye size={14} />
                        </button>
                        <button className="btn btn-danger py-1 px-2 text-xs" onClick={() => setDeletingSession(s.id)} title={t('admin.btn_delete')}>
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

        <div className="danger-zone mt-8">
          <div className="danger-zone-header">
            <span className="danger-zone-title text-danger">{t('admin.danger_zone', 'Danger Zone')}</span>
          </div>
          <div className="danger-zone-body">
            <div className="danger-zone-item">
              <div className="danger-zone-item-info">
                <p className="danger-zone-item-title">{t('admin.delete_all_chats')}</p>
                <p className="danger-zone-item-desc">{t('admin.delete_all_chats_desc')}</p>
              </div>
              <button className="btn btn-danger shrink-0" onClick={() => setPasswordModal(true)}>
                <Trash2 size={14} /> {t('admin.btn_delete_all_chats')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Viewer Modal */}
      {viewSessionId && (
        <div className="dialog-backdrop" onClick={() => setViewSessionId(null)}>
          <div className="glass-panel w-full max-w-3xl h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-default flex justify-between items-center">
              <h3 className="font-bold text-lg">{t('admin.conversation_history')}</h3>
              <button className="btn btn-ghost px-3 py-1 text-sm" onClick={() => setViewSessionId(null)}>{t('sidebar.btn_close')}</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loadingMessages ? (
                <div className="flex justify-center py-8"><Loader2 size={28} className="spin text-primary" /></div>
              ) : messages.length === 0 ? (
                <div className="text-center text-muted">{t('admin.no_messages')}</div>
              ) : (
                messages.map(m => (
                  <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`message-bubble ${m.role === 'user' ? 'user-message' : 'ai-message'}`}>
                      <div className="font-bold text-xs mb-2 opacity-60 uppercase tracking-wider">{m.role}</div>
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {passwordModal && (
        <div className="dialog-backdrop" onClick={() => setPasswordModal(false)}>
          <div className="glass-panel dialog-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-2">
              <h3 className="dialog-title text-danger">{t('admin.confirm_delete_all_chats_title')}</h3>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              handleDeleteAllSessions(fd.get('password') as string).catch(err => alert(err.message));
            }}>
              <div className="mb-4">
                <label className="input-label">{t('admin.admin_pwd')}</label>
                <input type="password" name="password" className="input" required />
              </div>
              <div className="dialog-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPasswordModal(false)}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-danger">{t('common.confirm')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Session */}
      {deletingSession !== null && (
        <ConfirmDialog
          title={t('admin.confirm_delete_chat_title', 'Delete Chat Session')}
          message={t('admin.confirm_delete_chat_desc', 'Are you sure you want to delete this chat session? This action cannot be undone.')}
          onConfirm={handleDeleteSession}
          onCancel={() => setDeletingSession(null)}
          confirmLabel={t('admin.btn_delete')}
        />
      )}
    </>
  );
}
