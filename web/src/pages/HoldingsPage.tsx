import * as d3 from 'd3';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useHolders } from '@/context/HoldersDatasetContext';
import type { HolderRow } from '@/domain/holders';
import { formatInt, esc, formatPct } from '@/lib/format';
import { getPaginationRange } from '@/lib/pagination';
import { TYPE_COLORS } from '@/charts/d3common';
import { IconSortAsc, IconSortDesc } from '@/components/Icons';

const ALL_KEYS = [
  'share_code',
  'issuer_name',
  'investor_name',
  'investor_type',
  'local_foreign',
  'nationality',
  'total_holding_shares',
  'percentage',
] as const;

export function HoldingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loc = useLocation();
  const { state } = useHolders();

  const [sort, setSort] = useState<{ key: string; asc: boolean }>({
    key: 'share_code',
    asc: true,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const baseRows = useMemo(() => {
    if (state.status !== 'ready') return [];
    const st = loc.state as
      | { filterNationality?: string; filterDomicile?: string }
      | undefined;
    if (st?.filterNationality) {
      return state.rows.filter((r) => r.nationality === st.filterNationality);
    }
    if (st?.filterDomicile) {
      return state.rows.filter((r) => r.domicile === st.filterDomicile);
    }
    return state.rows;
  }, [state, loc.state]);

  const sorted = useMemo(() => {
    const s = [...baseRows].sort((a, b) => {
      const va = a[sort.key as keyof HolderRow];
      const vb = b[sort.key as keyof HolderRow];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === 'string'
          ? va.localeCompare(String(vb))
          : (va as number) - (vb as number);
      return sort.asc ? cmp : -cmp;
    });
    return s;
  }, [baseRows, sort]);

  const slice = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const p = Math.min(page, totalPages);
    const start = (p - 1) * pageSize;
    return {
      page: p,
      totalPages,
      start,
      rows: sorted.slice(start, start + pageSize),
      total: sorted.length,
    };
  }, [sorted, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [loc.state, baseRows.length]);

  if (state.status !== 'ready') {
    return (
      <section className="page-section page-active">
        <div className="page-content">
          <div className="widget-placeholder">
            <div className="spinner" />
          </div>
        </div>
      </section>
    );
  }

  const maxPct = d3.max(baseRows, (r) => r.percentage) || 1;

  return (
    <section id="page-holdings" className="page-section page-active">
      <div className="page-content">
        <div className="holdings-header">
          <div className="holdings-title-row">
            <h2 id="holdingsTitle" data-tip={t('tip_holdings_browse')}>
              {t('all_holdings')}
            </h2>
            {(loc.state as { filterNationality?: string })?.filterNationality ||
            (loc.state as { filterDomicile?: string })?.filterDomicile ? (
              <button
                type="button"
                className="investor-back"
                onClick={() => navigate('/holdings', { replace: true, state: {} })}
              >
                {t('show_all')}
              </button>
            ) : null}
          </div>
          <div className="holdings-header-right">
            <span className="row-count" id="allRowCount" data-tip={t('tip_holdings_row_count')}>
              {formatInt(slice.total)} {t('rows')}
            </span>
          </div>
        </div>

        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead id="allTableHead">
                <tr>
                  {ALL_KEYS.map((key) => (
                    <th
                      key={key}
                      className={
                        key === 'total_holding_shares' || key === 'percentage'
                          ? 'text-end'
                          : undefined
                      }
                      style={{ cursor: 'pointer' }}
                      data-tip={t('tip_table_sort_column')}
                      onClick={() => {
                        setSort((prev) =>
                          prev.key === key
                            ? { key, asc: !prev.asc }
                            : { key, asc: key === 'percentage' ? false : true }
                        );
                        setPage(1);
                      }}
                    >
                      <span className="th-inner">
                        <span className="th-label">
                          {t(
                            key === 'share_code'
                              ? 'col_ticker'
                              : key === 'issuer_name'
                                ? 'col_issuer'
                                : key === 'investor_name'
                                  ? 'tab_investor'
                                  : key === 'investor_type'
                                    ? 'col_type'
                                    : key === 'local_foreign'
                                      ? 'col_lf'
                                      : key === 'nationality'
                                        ? 'col_nationality'
                                        : key === 'total_holding_shares'
                                          ? 'col_total_shares'
                                          : 'col_stake_pct'
                          )}
                        </span>
                        {sort.key === key ? (
                          <span className="th-sort" aria-hidden>
                            {sort.asc ? <IconSortAsc /> : <IconSortDesc />}
                          </span>
                        ) : null}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody id="allTableBody">
                {slice.rows.map((r, idx) => (
                  <tr key={`${r.share_code}-${r.investor_name}-${idx}`}>
                    <td>
                      <Link
                        className="table-text-link td-ticker"
                        to={`/explorer?stock=${encodeURIComponent(r.share_code)}`}
                      >
                        {esc(r.share_code)}
                      </Link>
                    </td>
                    <td title={r.issuer_name}>{esc(r.issuer_name)}</td>
                    <td>
                      <button
                        type="button"
                        className="linkish"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'inherit',
                          cursor: 'pointer',
                          textAlign: 'left',
                          padding: 0,
                          font: 'inherit',
                        }}
                        onClick={() =>
                          navigate(`/explorer?investor=${encodeURIComponent(r.investor_name)}`)
                        }
                      >
                        {esc(r.investor_name)}
                      </button>
                    </td>
                    <td>
                      {r.investor_type ? (
                        <span
                          className="type-badge"
                          style={{
                            background: `${TYPE_COLORS[r.investor_type] ?? '#444'}22`,
                            color: TYPE_COLORS[r.investor_type] ?? '#888',
                          }}
                        >
                          {r.investor_type}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {r.local_foreign === 'L'
                        ? t('local')
                        : r.local_foreign === 'F'
                          ? t('foreign')
                          : '—'}
                    </td>
                    <td>{esc(r.nationality || '—')}</td>
                    <td className="num">{formatInt(r.total_holding_shares)}</td>
                    <td>
                      <div className="pct-bar-wrap">
                        <div className="pct-bar">
                          <div
                            className="pct-bar-fill"
                            style={{
                              width: `${((r.percentage / maxPct) * 100).toFixed(1)}%`,
                            }}
                          />
                        </div>
                        <span className="pct-val">{formatPct(r.percentage)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination" id="allPagination">
            <span className="page-info">
              {slice.total === 0
                ? t('no_results')
                : `${t('showing')} ${formatInt(slice.start + 1)}–${formatInt(slice.start + slice.rows.length)} ${t('of')} ${formatInt(slice.total)}`}
            </span>
            <div className="page-size-wrap">
              <label>{t('rows_label')}</label>
              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 15, 20, 30, 50, 75, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div className="page-buttons">
              <button
                type="button"
                disabled={slice.page <= 1}
                onClick={() => setPage(slice.page - 1)}
              >
                « {t('prev')}
              </button>
              {getPaginationRange(slice.page, slice.totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`e${i}`} className="page-ellipsis">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={p === slice.page ? 'active' : ''}
                    onClick={() => setPage(p as number)}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                type="button"
                disabled={slice.page >= slice.totalPages}
                onClick={() => setPage(slice.page + 1)}
              >
                {t('next')} »
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
