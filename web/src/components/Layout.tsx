import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setAppLanguage } from '@/i18n';
import { useAuth } from '@/auth/AuthContext';
import { devSkipAuth } from '@/api/client';
import { useHolders } from '@/context/HoldersDatasetContext';
import {
  IconBrain,
  IconCompass,
  IconHome,
  IconTable,
  IconTrending,
} from '@/components/Icons';

export function Layout() {
  const { t, i18n } = useTranslation();
  const { logout, isAuthed } = useAuth();
  const { state } = useHolders();
  const lang = i18n.language === 'id' ? 'id' : 'en';

  const dataAsOf = useMemo(() => {
    if (state.status !== 'ready' || !state.rows.length) return null;
    const dates = [...new Set(state.rows.map((r) => r.date).filter(Boolean))];
    dates.sort();
    return dates.length ? dates[dates.length - 1]! : null;
  }, [state]);

  return (
    <>
      <a href="#mainContent" className="skip-link">
        Skip to content
      </a>

      <header>
        <div className="header-inner">
          <NavLink className="logo" to="/" aria-label="Go to home page">
            <img
              className="brand-logo"
              src={`${import.meta.env.BASE_URL}assets/TMD_Logo.png`}
              alt=""
              aria-hidden
            />
            <span>{t('brand')}</span>
          </NavLink>
          <nav aria-label="Main navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <IconHome className="nav-icon" />
              {t('nav_home')}
            </NavLink>
            <NavLink
              to="/explorer"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <IconCompass className="nav-icon" />
              {t('nav_explorer')}
            </NavLink>
            <NavLink
              to="/holdings"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <IconTable className="nav-icon" />
              {t('nav_holdings')}
            </NavLink>
            <NavLink
              to="/market"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <IconTrending className="nav-icon" />
              {t('nav_market')}
            </NavLink>
            <NavLink
              to="/intelligence"
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <IconBrain className="nav-icon" />
              {t('nav_intelligence')}
            </NavLink>
          </nav>
          <div className="header-spacer" />
          <div className="badge" id="dateBadge">
            {t('data_as_of')}{' '}
            {state.status === 'loading'
              ? '…'
              : state.status === 'error'
                ? '—'
                : (dataAsOf ?? '—')}
          </div>
          <div className="lang-toggle" role="group" aria-label={t('lang_toggle_aria')}>
            <button
              type="button"
              className={`lang-btn${lang === 'en' ? ' active' : ''}`}
              aria-pressed={lang === 'en'}
              onClick={() => setAppLanguage('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={`lang-btn${lang === 'id' ? ' active' : ''}`}
              aria-pressed={lang === 'id'}
              onClick={() => setAppLanguage('id')}
            >
              ID
            </button>
          </div>
          {isAuthed && !devSkipAuth() && (
            <button
              type="button"
              className="nav-link"
              onClick={logout}
              style={{ marginLeft: 8 }}
            >
              {t('nav_logout')}
            </button>
          )}
        </div>
      </header>

      <main id="mainContent">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <span>TMD — Transparent Market Data</span>
          <span className="footer-sep">·</span>
          <span>{t('footer_data_source')}</span>
          <span className="footer-sep">·</span>
          <span>{t('footer_disclaimer')}</span>
        </div>
      </footer>

      <div className="tooltip" id="tooltip" role="tooltip" aria-live="polite" />
    </>
  );
}
