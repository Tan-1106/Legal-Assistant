import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, type User } from '../context/auth';
import { API_BASE_URL } from '../config';
import { Scale, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { fetchWithTimeout } from '../utils/api';
import { parseUser } from '../utils/validation';
import { useTranslation } from 'react-i18next';

export default function AuthPage() {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreedToPrivacy, setAgreedToPrivacy] = useState(false);
  const { user, login } = useAuth();

  useEffect(() => {
    document.title = isLogin ? t('auth.login_title') : t('auth.register_title');
  }, [isLogin, t]);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSuccess(false);
    setIsSubmitting(true);

    try {
      if (!isLogin && !agreedToPrivacy) {
        throw new Error(t('auth.err_privacy'));
      }

      if (isLogin) {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const res = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
          credentials: 'include',
        });

        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          throw new Error(t('auth.retry_wait', { time: retryAfter ?? '10' }));
        }
        if (!res.ok) throw new Error(t('auth.err_wrong_creds'));
        const userData: User = parseUser(await res.json());
        const csrfToken = res.headers.get('X-CSRF-Token');
        if (!csrfToken) throw new Error(t('auth.err_no_csrf'));
        login(userData, csrfToken);
      } else {
        const res = await fetchWithTimeout(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          credentials: 'include',
        });

        if (res.status === 429) {
          const retryAfter = res.headers.get('Retry-After');
          throw new Error(t('auth.retry_wait', { time: retryAfter ?? '10' }));
        }
        if (!res.ok) throw new Error(t('auth.err_exists'));

        setIsLogin(true);
        setIsSuccess(true);
        setError(t('auth.success_register'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('auth.err_general'));
      setIsSuccess(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="glass-panel auth-card animate-slide-up">
        {/* Logo */}
        <div className="auth-logo-wrap">
          <div className="auth-logo">
            <Scale size={28} color="#fff" strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="auth-title">
              {isLogin ? t('auth.login_heading') : t('auth.register_heading')}
            </h1>
            <p className="auth-subtitle">{t('auth.subtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="auth-form" id="auth-form">
          <div className="auth-field">
            <label htmlFor="auth-username" className="input-label">{t('auth.username')}</label>
            <input
              id="auth-username"
              className="input"
              type="text"
              required
              minLength={3}
              maxLength={50}
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={t('auth.username_placeholder')}
              disabled={isSubmitting}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password" className="input-label">{t('auth.password')}</label>
            <div className="auth-password-wrap">
              <input
                id="auth-password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={isLogin ? undefined : 6}
                maxLength={128}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={t('auth.password_placeholder')}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="auth-eye-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t('auth.hide_password') : t('auth.show_password')}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {!isLogin && (
            <div className="auth-field" style={{ marginTop: '0.5rem' }}>
              <label className="flex items-start gap-2" style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text)' }}>
                <input
                  type="checkbox"
                  checked={agreedToPrivacy}
                  onChange={e => setAgreedToPrivacy(e.target.checked)}
                  disabled={isSubmitting}
                  style={{ marginTop: '0.2rem' }}
                />
                <div style={{ flex: 1, lineHeight: '1.4' }}>
                  <span style={{ fontWeight: '500' }}>{t('auth.privacy_agree')}</span>
                  <p className="text-faint mt-1" style={{ fontSize: '0.75rem' }}>
                    {t('auth.privacy_warning')}
                  </p>
                </div>
              </label>
            </div>
          )}

          {error && (
            <div
              className={`auth-error ${isSuccess ? 'success' : 'error'}`}
              role="status"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={isSubmitting}
            id="auth-submit-btn"
          >
            {isSubmitting ? (
              <><Loader2 size={16} className="spin" /> {t('auth.processing')}</>
            ) : (
              <>{isLogin ? t('auth.btn_login') : t('auth.btn_register')} <ArrowRight size={16} /></>
            )}
          </button>
        </form>

        <div className="auth-switch">
          <button
            type="button"
            className="auth-switch-btn"
            disabled={isSubmitting}
            onClick={() => { setIsLogin(!isLogin); setError(''); setIsSuccess(false); setShowPassword(false); }}
          >
            {isLogin ? t('auth.no_account') : t('auth.has_account')}
          </button>
        </div>
      </div>
    </div>
  );
}
