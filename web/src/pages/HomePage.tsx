import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { buildInvestorMap, buildStockMap } from '@/domain/holders';
import { useHolders } from '@/context/HoldersDatasetContext';
import { formatInt, esc } from '@/lib/format';
import { injectAdvancedChart } from '@/lib/tradingview';

const INDEX_OPTIONS = [
  { symbol: 'IDX:COMPOSITE', label: 'IHSG' },
  { symbol: 'IDX:LQ45', label: 'LQ45' },
  { symbol: 'IDX:IDX30', label: 'IDX30' },
  { symbol: 'IDX:KOMPAS100', label: 'Kompas100' },
  { symbol: 'IDX:ISSI', label: 'ISSI' },
  { symbol: 'IDX:IDXFINANCE', label: 'Finance' },
];

export function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { state } = useHolders();
  const chartRef = useRef<HTMLDivElement>(null);
  const picksRef = useRef<HTMLDivElement>(null);
  const [indexSymbol, setIndexSymbol] = useState('IDX:COMPOSITE');
  const chartInit = useRef(false);

  useEffect(() => {
    if (!chartRef.current || state.status !== 'ready') return;
    if (!chartInit.current) {
      chartInit.current = true;
      injectAdvancedChart(chartRef.current, indexSymbol, 420);
    } else {
      injectAdvancedChart(chartRef.current, indexSymbol, 420);
    }
  }, [indexSymbol, state.status]);

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="loading-overlay" id="loader">
        <div className="spinner" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="page-content">
        <div className="error-banner" style={{ marginTop: 80 }}>
          <h3>{t('failed_load')}</h3>
          <p>{t('failed_load_msg')}</p>
          <p style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>{state.message}</p>
        </div>
      </div>
    );
  }

  const { rows } = state;
  const invMap = buildInvestorMap(rows);
  const stockMap = buildStockMap(rows);
  const totalRows = rows.length;
  const uniqueInvestors = state.investorNames.length;
  const uniqueStocks = state.stockNames.length;
  const reportDate = rows.length ? rows[0].date : '—';

  const topInvestors = [...invMap.entries()]
    .map(([name, rws]) => ({
      name,
      stocks: rws.length,
      totalShares: rws.reduce((s, r) => s + r.total_holding_shares, 0),
    }))
    .sort((a, b) => b.totalShares - a.totalShares)
    .slice(0, 10);

  const topStocks = [...stockMap.entries()]
    .map(([code, s]) => ({ code, issuer: s.issuer, holders: s.rows.length }))
    .sort((a, b) => b.holders - a.holders)
    .slice(0, 10);

  return (
    <section id="page-home" className="page-section page-active">
      <div className="page-content">
        <div className="home-hero">
          <h1>{t('hero_title')}</h1>
          <p>{t('hero_sub')}</p>
        </div>

        <div className="home-chart-section">
          <div className="market-chart-card">
            <div className="home-chart-header">
              <span className="home-card-title">{t('home_live_index')}</span>
              <div className="market-stock-picks" ref={picksRef}>
                {INDEX_OPTIONS.map((o) => (
                  <button
                    key={o.symbol}
                    type="button"
                    className={`stock-pick-btn${o.symbol === indexSymbol ? ' active' : ''}`}
                    onClick={() => setIndexSymbol(o.symbol)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="market-chart-body" style={{ height: 420 }} ref={chartRef}>
              <div className="widget-placeholder">
                <div className="spinner" /> {t('loading_chart')}
              </div>
            </div>
          </div>
        </div>

        <div className="home-stats">
          <StatCard
            label={t('stat_total_records')}
            value={formatInt(totalRows)}
            sub={t('sub_ownership_entries')}
          />
          <StatCard
            label={t('stat_unique_investors')}
            value={formatInt(uniqueInvestors)}
            sub={t('sub_distinct_shareholders')}
          />
          <StatCard
            label={t('stat_unique_stocks')}
            value={formatInt(uniqueStocks)}
            sub={t('sub_listed_companies')}
          />
          <StatCard
            label={t('stat_report_date')}
            value={reportDate}
            sub={t('sub_idx_snapshot')}
            animate={false}
          />
        </div>

        <div className="home-grid">
          <div className="home-card">
            <div className="home-card-header">
              <span className="home-card-title">{t('home_top_investors')}</span>
              <span className="home-card-badge">Top 10</span>
            </div>
            <table className="mini-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>{t('col_investor_name')}</th>
                  <th className="num">{t('col_stocks')}</th>
                  <th className="num">{t('col_total_shares')}</th>
                </tr>
              </thead>
              <tbody>
                {topInvestors.map((inv, i) => (
                  <tr
                    key={inv.name}
                    tabIndex={0}
                    role="link"
                    onClick={() =>
                      navigate(`/explorer?investor=${encodeURIComponent(inv.name)}`)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/explorer?investor=${encodeURIComponent(inv.name)}`);
                      }
                    }}
                  >
                    <td className="mini-rank">{i + 1}</td>
                    <td className="mini-name">
                      <span className="mini-name-link">{inv.name}</span>
                    </td>
                    <td className="num">{inv.stocks}</td>
                    <td className="num">{formatInt(inv.totalShares)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="home-card">
            <div className="home-card-header">
              <span className="home-card-title">{t('home_top_stocks')}</span>
              <span className="home-card-badge">Top 10</span>
            </div>
            <table className="mini-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>{t('col_ticker')}</th>
                  <th>{t('col_issuer_name')}</th>
                  <th className="num">{t('col_holders')}</th>
                </tr>
              </thead>
              <tbody>
                {topStocks.map((stk, i) => (
                  <tr
                    key={stk.code}
                    tabIndex={0}
                    role="link"
                    onClick={() => navigate(`/explorer?stock=${encodeURIComponent(stk.code)}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/explorer?stock=${encodeURIComponent(stk.code)}`);
                      }
                    }}
                  >
                    <td className="mini-rank">{i + 1}</td>
                    <td>
                      <span className="mini-ticker">{esc(stk.code)}</span>
                    </td>
                    <td className="mini-name" title={stk.issuer}>
                      {esc(stk.issuer)}
                    </td>
                    <td className="num">{stk.holders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="home-cta-row">
          <Link className="btn btn-primary" to="/explorer">
            {t('cta_explore')}
          </Link>
          <Link className="btn btn-secondary" to="/holdings">
            {t('cta_holdings')}
          </Link>
          <Link className="btn btn-secondary" to="/market">
            {t('cta_market')}
          </Link>
          <Link className="btn btn-secondary" to="/intelligence">
            {t('cta_intel')}
          </Link>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  animate = true,
}: {
  label: string;
  value: string;
  sub: string;
  animate?: boolean;
}) {
  const [display, setDisplay] = useState(animate ? '0' : value);
  useEffect(() => {
    if (!animate) return;
    const num = parseInt(value.replace(/\D/g, ''), 10);
    if (Number.isNaN(num) || num === 0) {
      setDisplay(value);
      return;
    }
    const duration = 800;
    const start = performance.now();
    function step(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const ease = 1 - (1 - progress) ** 3;
      const current = Math.floor(num * ease);
      setDisplay(progress >= 1 ? value : formatInt(current));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }, [value, animate]);

  return (
    <div className="home-stat-card">
      <div className="home-stat-label">{label}</div>
      <div className="home-stat-value">{display}</div>
      <div className="home-stat-sub">{sub}</div>
    </div>
  );
}
