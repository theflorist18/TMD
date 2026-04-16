import * as d3 from 'd3';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useFreeFloat } from '@/context/FreeFloatDatasetContext';
import type { FreeFloatRow } from '@/domain/freeFloat';
import { esc, formatInt, formatPct } from '@/lib/format';
import { getPaginationRange } from '@/lib/pagination';
import { IconSearch, IconSortAsc, IconSortDesc } from '@/components/Icons';

type SortKey =
  | 'share_code'
  | 'issuer_name'
  | 'free_float_pct'
  | 'free_float_shares'
  | 'free_float_holders'
  | 'compliance_status';

function compareRow(a: FreeFloatRow, b: FreeFloatRow, key: SortKey, asc: boolean): number {
  let va: string | number = a[key];
  let vb: string | number = b[key];
  const aEmpty = va === '' || va == null;
  const bEmpty = vb === '' || vb == null;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof va === 'string') va = va.toLowerCase();
  if (typeof vb === 'string') vb = String(vb).toLowerCase();
  let cmp = 0;
  if (typeof va === 'string' && typeof vb === 'string') {
    if (va < vb) cmp = -1;
    else if (va > vb) cmp = 1;
  } else if (typeof va === 'number' && typeof vb === 'number') {
    cmp = va - vb;
  }
  return asc ? cmp : -cmp;
}

export function FreeFloatPage() {
  const { t } = useTranslation();
  const { state, reload } = useFreeFloat();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: 'free_float_pct',
    asc: false,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const allRows = useMemo(
    () => (state.status === 'ready' ? state.rows : []),
    [state]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return allRows;
    return allRows.filter((r) => {
      const hay = `${r.share_code} ${r.issuer_name} ${r.compliance_status}`.toLowerCase();
      return hay.includes(s);
    });
  }, [allRows, q]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const primary = compareRow(a, b, sort.key, sort.asc);
      if (primary !== 0) return primary;
      return compareRow(a, b, 'share_code', true);
    });
  }, [filtered, sort]);

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
  }, [q, filtered.length]);

  const maxPctRaw = d3.max(filtered, (r) =>
    Number.isFinite(r.free_float_pct) ? r.free_float_pct : 0
  );
  const maxPct =
    Number.isFinite(maxPctRaw) && (maxPctRaw as number) > 0 ? (maxPctRaw as number) : 1;

  const asOf =
    state.status === 'ready' && state.payload.as_of ? state.payload.as_of : null;

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <section id="page-free-float" className="page-section page-active">
        <div className="page-content">
          <div className="widget-placeholder">
            <div className="spinner" />
          </div>
        </div>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section id="page-free-float" className="page-section page-active">
        <div className="page-content">
          <div className="error-banner" style={{ marginTop: 80 }}>
            <h3>{t('failed_load')}</h3>
            <p>{t('free_float_failed_msg')}</p>
            <p style={{ marginTop: 12, fontSize: 12, opacity: 0.6 }}>{state.message}</p>
            <p style={{ marginTop: 20 }}>
              <button type="button" className="btn btn-primary" onClick={() => void reload()}>
                {t('failed_load_retry')}
              </button>
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="page-free-float" className="page-section page-active">
      <div className="page-content">
        <div className="holdings-header">
          <div className="holdings-title-row">
            <h2 id="freeFloatTitle">{t('nav_free_float')}</h2>
          </div>
          <span className="row-count" id="freeFloatRowCount">
            {asOf ? (
              <>
                {t('free_float_as_of')} {asOf}
                {' · '}
              </>
            ) : null}
            {formatInt(slice.total)} {t('rows')}
          </span>
        </div>
        <p style={{ marginBottom: 16, opacity: 0.88, maxWidth: '52rem' }}>{t('free_float_sub')}</p>

        {state.rows.length === 0 ? (
          <div className="card" style={{ padding: 24 }}>
            <p>{t('free_float_empty')}</p>
          </div>
        ) : (
          <>
            <div className="explorer-search-section" style={{ marginBottom: 16 }}>
              <div className="search-wrap" style={{ maxWidth: 480 }}>
                <div className="search-field">
                  <span className="search-icon" aria-hidden>
                    <IconSearch />
                  </span>
                  <input
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t('free_float_search_ph')}
                    autoComplete="off"
                    aria-label={t('free_float_search_ph')}
                  />
                </div>
              </div>
            </div>

            <div className="table-card">
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {(
                        [
                          ['share_code', 'col_ticker'],
                          ['issuer_name', 'col_issuer'],
                          ['free_float_pct', 'col_free_float_pct'],
                          ['free_float_shares', 'col_free_float_shares'],
                          ['free_float_holders', 'col_free_float_holders'],
                          ['compliance_status', 'col_compliance'],
                        ] as const
                      ).map(([key, labelKey]) => (
                        <th
                          key={key}
                          className={
                            key === 'free_float_pct' ||
                            key === 'free_float_shares' ||
                            key === 'free_float_holders'
                              ? 'text-end'
                              : undefined
                          }
                          style={{ cursor: 'pointer' }}
                          data-tip={t('tip_table_sort_column')}
                          onClick={() => {
                            setSort((prev) =>
                              prev.key === key
                                ? { key, asc: !prev.asc }
                                : {
                                    key,
                                    asc:
                                      key === 'issuer_name' || key === 'compliance_status',
                                  }
                            );
                            setPage(1);
                          }}
                        >
                          <span className="th-inner">
                            <span className="th-label">{t(labelKey)}</span>
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
                  <tbody>
                    {slice.rows.map((r) => {
                      const pctW = Number.isFinite(r.free_float_pct)
                        ? Math.min(
                            100,
                            Math.max(0, (r.free_float_pct / maxPct) * 100)
                          ).toFixed(1)
                        : '0';
                      return (
                        <tr key={r.share_code}>
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
                            <div className="pct-bar-wrap">
                              <div className="pct-bar">
                                <div className="pct-bar-fill" style={{ width: `${pctW}%` }} />
                              </div>
                              <span className="pct-val">{formatPct(r.free_float_pct)}</span>
                            </div>
                          </td>
                          <td className="num">{formatInt(r.free_float_shares)}</td>
                          <td className="num">{formatInt(r.free_float_holders)}</td>
                          <td>{esc(r.compliance_status || '—')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="pagination" id="freeFloatPagination">
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
                    {[10, 15, 20, 25, 30, 50, 75, 100].map((n) => (
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
          </>
        )}
      </div>
    </section>
  );
}
