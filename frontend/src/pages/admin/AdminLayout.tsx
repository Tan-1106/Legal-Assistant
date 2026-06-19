
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { useTranslation } from 'react-i18next';
import { Database, Users, MessageSquare, ArrowLeft, ShieldAlert, Shield } from 'lucide-react';

export default function AdminLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user?.role !== 'admin') {
    return (
      <div className="welcome-state h-screen bg-background">
        <ShieldAlert size={48} className="text-danger mb-4" />
        <h2 className="text-xl font-bold">{t('admin.err_unauthorized', 'Unauthorized')}</h2>
        <button className="btn btn-primary mt-4" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> {t('admin.aria_back', 'Go Back')}
        </button>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="admin-sidebar-nav">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <ShieldAlert size={18} color="#fff" strokeWidth={1.8} />
          </div>
          <div>
            <div className="sidebar-brand">{t('sidebar.manage_docs')}</div>
            <div className="sidebar-brand-sub">{t('admin.menu_label')}</div>
          </div>
        </div>

        <div className="sidebar-body">
          <NavLink to="/admin/documents" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Database size={16} className="shrink-0" />
            <span>{t('admin.tab_documents')}</span>
          </NavLink>
          <NavLink to="/admin/users" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <Users size={16} className="shrink-0" />
            <span>{t('admin.tab_users')}</span>
          </NavLink>
          <NavLink to="/admin/chats" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
            <MessageSquare size={16} className="shrink-0" />
            <span>{t('admin.tab_chats')}</span>
          </NavLink>
        </div>

        <div className="sidebar-footer">
          <button
            onClick={() => navigate('/')}
            className="btn btn-secondary w-full justify-start text-sm"
          >
            <ArrowLeft size={15} />
            <span>{t('admin.aria_back')}</span>
          </button>
          <div className="account-card">
            <div className="account-profile">
              <div className="user-avatar">
                <Shield size={16} />
              </div>
              <div className="user-info">
                <div className="user-name">{user?.username}</div>
                <div className="user-role">{t(`common.role_${user?.role}`)}</div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="admin-content-area">
        <Outlet />
      </div>
    </div>
  );
}
