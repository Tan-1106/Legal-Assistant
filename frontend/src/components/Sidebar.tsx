import { useEffect, useState } from 'react';
import { useAuth } from '../context/auth';
import { API_BASE_URL } from '../config';
import { Scale, MessageSquare, Plus, LogOut, Database, Trash2, X, LogOutIcon, Globe, Settings, User, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';
import { parseSessions } from '../utils/validation';
import { useTranslation } from 'react-i18next';

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
}

interface SidebarProps {
  currentSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  isOpen: boolean;
  onClose: () => void;
  refreshKey: number;
}

export default function Sidebar({
  currentSessionId,
  onSelectSession,
  isOpen,
  onClose,
  refreshKey,
}: SidebarProps) {
  const { t, i18n } = useTranslation();
  const { user, logout, logoutAll, apiFetch } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChatSession | null>(null);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();

    void apiFetch(`${API_BASE_URL}/sessions/`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(t('sidebar.err_load_sessions', { status: response.status }));
        return response.json();
      })
      .then(data => {
        setSessions(parseSessions(data));
        setError('');
      })
      .catch(fetchError => {
        if (!controller.signal.aborted) {
          console.error(fetchError);
          setError(t('sidebar.err_load'));
        }
      });

    return () => controller.abort();
  }, [apiFetch, currentSessionId, refreshKey]);

  const handleCreateSession = async () => {
    setIsCreating(true);
    setError('');
    try {
      const res = await apiFetch(`${API_BASE_URL}/sessions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t('sidebar.new_chat') }),
      });
      if (!res.ok) throw new Error(t('sidebar.err_create_session', { status: res.status }));

      const [newSession] = parseSessions([await res.json()]);
      setSessions(previous => [newSession, ...previous]);
      onSelectSession(newSession.id);
    } catch (createError) {
      console.error(createError);
      setError(t('sidebar.err_create'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteSession = async (id: string) => {
    setDeletingSessionId(id);
    setError('');
    try {
      const response = await apiFetch(`${API_BASE_URL}/sessions/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(t('sidebar.err_delete_session', { status: response.status }));
      setSessions(previous => previous.filter(session => session.id !== id));
      if (currentSessionId === id) onSelectSession(null);
    } catch (deleteError) {
      console.error(deleteError);
      setError(t('sidebar.err_delete'));
    } finally {
      setDeletingSessionId(null);
    }
  };

  const handleLogoutAll = async () => {
    setConfirmLogoutAll(false);
    setError('');
    try {
      await logoutAll();
    } catch (logoutError) {
      console.error(logoutError);
      setError(t('sidebar.err_logout_all'));
    }
  };

  const handleLogout = async () => {
    setError('');
    try {
      await logout();
    } catch (logoutError) {
      console.error(logoutError);
      setError(t('sidebar.err_logout'));
    }
  };



  return (
    <>
      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      {/* Mobile close */}
      <button
        type="button"
        className="sidebar-close"
        onClick={onClose}
        aria-label={t('sidebar.aria_close_menu')}
      >
        <X size={16} />
      </button>

      {/* Header / Brand */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <Scale size={18} color="#fff" strokeWidth={1.8} />
        </div>
        <div>
          <div className="sidebar-brand">{t('chat.title')}</div>
          <div className="sidebar-brand-sub">{t('sidebar.brand_sub')}</div>
        </div>
      </div>

      {/* Body */}
      <div className="sidebar-body">
        <button
          onClick={handleCreateSession}
          className="sidebar-new-btn"
          disabled={isCreating}
          id="sidebar-new-chat-btn"
        >
          <Plus size={16} />
          <span>{isCreating ? t('sidebar.creating') : t('sidebar.new_chat')}</span>
        </button>

        {error && (
          <p className="text-xs text-danger px-2" role="alert" aria-live="assertive">{error}</p>
        )}

        {sessions.length > 0 && (
          <p className="sessions-label">{t('sidebar.history')}</p>
        )}

        {sessions.map(s => (
          <div
            key={s.id}
            onClick={() => onSelectSession(s.id)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectSession(s.id);
              }
            }}
            role="button"
            tabIndex={0}
            className={`session-item ${currentSessionId === s.id ? 'active' : ''}`}
            id={`session-item-${s.id}`}
          >
            <MessageSquare size={14} className="text-faint shrink-0" />
            <span className="session-title">{s.title}</span>
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                setPendingDelete(s);
              }}
              className="session-delete-btn"
              disabled={deletingSessionId === s.id}
              aria-label={`Xóa ${s.title}`}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}

        {sessions.length === 0 && !error && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center pb-12">
            <MessageSquare size={24} className="text-faint" />
            <p className="text-xs text-faint">{t('sidebar.empty')}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        {user?.role === 'admin' && (
          <button
            onClick={() => { navigate('/admin/documents'); onClose(); }}
            className="btn btn-secondary w-full justify-start text-sm"
            id="sidebar-admin-btn"
          >
            <Database size={15} />
            <span>{t('sidebar.manage_docs')}</span>
          </button>
        )}

        <div className="account-card">
          <div className="account-profile">
            <div className="user-avatar">
              {user?.role === 'admin' ? <Shield size={16} /> : <User size={16} />}
            </div>
            <div className="user-info">
              <div className="user-name">{user?.username}</div>
              <div className="user-role">{t(`common.role_${user?.role}`)}</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost icon-button"
              title={t('sidebar.settings')}
              onClick={() => setIsSettingsOpen(true)}
              id="sidebar-settings-btn"
            >
              <Settings size={15} className="text-faint hover:text-primary transition-colors" />
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal - Moved outside aside */}
      {isSettingsOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setIsSettingsOpen(false)}>
          <section
            className="glass-panel dialog-panel settings-dialog animate-slide-up"
            role="dialog"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3 mb-2">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Settings size={18} className="text-brown-400" />
                {t('sidebar.settings_title')}
              </h3>
              <button 
                type="button" 
                className="btn btn-ghost icon-button" 
                onClick={() => setIsSettingsOpen(false)}
                title={t('sidebar.btn_close')}
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="flex flex-col gap-6 pt-2">
              {/* Language Settings */}
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-bold text-faint uppercase tracking-wider">{t('sidebar.language')}</h4>
                <div className="flex gap-2">
                  <button
                    className={`btn flex-1 justify-center py-2 ${i18n.language.startsWith('en') ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => i18n.changeLanguage('en')}
                  >
                    <Globe size={14} className="mr-1" /> English
                  </button>
                  <button
                    className={`btn flex-1 justify-center py-2 ${i18n.language.startsWith('vi') ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => i18n.changeLanguage('vi')}
                  >
                    <Globe size={14} className="mr-1" /> Tiếng Việt
                  </button>
                </div>
              </div>

              {/* Account Actions */}
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-bold text-faint uppercase tracking-wider">{t('sidebar.account_actions')}</h4>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary w-full justify-start py-2.5"
                    onClick={() => { setIsSettingsOpen(false); setConfirmLogoutAll(true); }}
                  >
                    <LogOutIcon size={14} className="mr-2" />
                    {t('sidebar.logout_all')}
                  </button>
                  <button
                    type="button"
                    className="btn w-full justify-start py-2.5 text-danger bg-[var(--danger-bg)] border border-[var(--danger-border)] hover:bg-[rgba(231,76,60,0.2)] transition-colors"
                    onClick={() => { setIsSettingsOpen(false); handleLogout(); }}
                  >
                    <LogOut size={14} className="mr-2" />
                    {t('sidebar.logout')}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

    </aside>

      {/* Settings Modal will be placed outside aside via state in a future refactor, wait we already did this above. So now we just move pendingDelete & confirmLogoutAll out of aside. Wait, I should not render them here if they are already moved... let me just close aside and render them. */}
      {pendingDelete && (
        <ConfirmDialog
          title={t('sidebar.delete_title')}
          message={t('sidebar.delete_msg', { title: pendingDelete.title })}
          confirmLabel={t('sidebar.btn_delete')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            const id = pendingDelete.id;
            setPendingDelete(null);
            void handleDeleteSession(id);
          }}
        />
      )}
      {confirmLogoutAll && (
        <ConfirmDialog
          title={t('sidebar.logout_all_title')}
          message={t('sidebar.logout_all_msg')}
          confirmLabel={t('sidebar.btn_logout_all')}
          onCancel={() => setConfirmLogoutAll(false)}
          onConfirm={() => void handleLogoutAll()}
        />
      )}
    </>
  );
}
