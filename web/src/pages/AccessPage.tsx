import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loginWithSubscriberToken } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';

export function AccessPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loc = useLocation();
  const { setSession } = useAuth();
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const from = (loc.state as { from?: string } | null)?.from || '/';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    if (!token.trim()) {
      setErr(t('access_error_empty'));
      return;
    }
    setBusy(true);
    try {
      await loginWithSubscriberToken(token);
      const access = sessionStorage.getItem('tmd_jwt_access');
      const refresh = sessionStorage.getItem('tmd_jwt_refresh');
      if (access && refresh) setSession(access, refresh);
      navigate(from, { replace: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '';
      if (import.meta.env.DEV && msg.includes('not configured')) {
        setErr(t('access_error_not_configured'));
      } else if (e instanceof TypeError) {
        setErr(t('access_error_network'));
      } else if (msg.includes('subscriber_expired')) {
        setErr(t('access_error_expired'));
      } else {
        setErr(t('access_error_rejected'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="access-gate" style={{ position: 'fixed', inset: 0, zIndex: 10050 }}>
      <div
        className="access-gate-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="accessGateTitle"
      >
        <h1 id="accessGateTitle">{t('access_title')}</h1>
        <p className="access-sub">{t('access_sub')}</p>
        <form onSubmit={onSubmit} autoComplete="off">
          <label htmlFor="accessGateInput">{t('access_token_label')}</label>
          <input
            id="accessGateInput"
            name="token"
            type="text"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t('access_token_placeholder')}
            aria-required
          />
          <div className="access-gate-actions">
            <button type="submit" className="btn-access" disabled={busy}>
              {busy ? t('access_working') : t('access_submit')}
            </button>
          </div>
          {err ? (
            <div className="access-gate-error" role="alert">
              {err}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
