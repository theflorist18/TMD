import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useHolders } from '@/context/HoldersDatasetContext';
import type { HolderRow } from '@/domain/holders';
import { formatInt, esc, formatPct } from '@/lib/format';
import {
  applyHoldingsFilters,
  countHoldingsFilterKeys,
  parseHoldingsFilterNum,
  type HoldingsColumnFilters,
  type RangeOp,
} from '@/lib/holdingsFilters';
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

type PanelState = {
  types: string[];
  lf: string[];
  nationality: string[];
  domicile: string[];
  pctOp: RangeOp;
  pct1: string;
  pct2: string;
  shOp: RangeOp;
  sh1: string;
  sh2: string;
};

function emptyPanel(): PanelState {
  return {
    types: [],
    lf: [],
    nationality: [],
    domicile: [],
    pctOp: 'gte',
    pct1: '',
    pct2: '',
    shOp: 'gte',
    sh1: '',
    sh2: '',
  };
}

function panelFromApplied(ap: HoldingsColumnFilters): PanelState {
  return {
    types: [...(ap.investor_type ?? [])],
    lf: [...(ap.local_foreign ?? [])],
    nationality: [...(ap.nationality ?? [])],
    domicile: [...(ap.domicile ?? [])],
    pctOp: ap.percentage?.op ?? 'gte',
    pct1: ap.percentage != null ? String(ap.percentage.v1) : '',
    pct2: ap.percentage?.v2 != null ? String(ap.percentage.v2) : '',
    shOp: ap.total_holding_shares?.op ?? 'gte',
    sh1: ap.total_holding_shares != null ? String(ap.total_holding_shares.v1) : '',
    sh2: ap.total_holding_shares?.v2 != null ? String(ap.total_holding_shares.v2) : '',
  };
}

function appliedFromPanel(p: PanelState): HoldingsColumnFilters {
  const out: HoldingsColumnFilters = {};
  if (p.types.length) out.investor_type = [...p.types];
  if (p.lf.length) out.local_foreign = [...p.lf];
  if (p.nationality.length) out.nationality = [...p.nationality];
  if (p.domicile.length) out.domicile = [...p.domicile];

  const pv1 = parseHoldingsFilterNum(p.pct1);
  if (Number.isFinite(pv1)) {
    const pv2 = parseHoldingsFilterNum(p.pct2);
    out.percentage = {
      op: p.pctOp,
      v1: pv1,
      v2: p.pctOp === 'between' && Number.isFinite(pv2) ? pv2 : null,
    };
  }
  const sv1 = parseHoldingsFilterNum(p.sh1);
  if (Number.isFinite(sv1)) {
    const sv2 = parseHoldingsFilterNum(p.sh2);
    out.total_holding_shares = {
      op: p.shOp,
      v1: sv1,
      v2: p.shOp === 'between' && Number.isFinite(sv2) ? sv2 : null,
    };
  }
  return out;
}

function stableCompare(
  a: HolderRow,
  b: HolderRow,
  key: keyof HolderRow,
  asc: boolean
): number {
  let va = a[key];
  let vb = b[key];
  const aEmpty = va === '' || va == null;
  const bEmpty = vb === '' || vb == null;
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof va === 'string') {
    va = va.toLowerCase();
    vb = String(vb).toLowerCase();
  }
  let cmp = 0;
  if (typeof va === 'string' && typeof vb === 'string') {
    if (va < vb) cmp = -1;
    else if (va > vb) cmp = 1;
  } else if (typeof va === 'number' && typeof vb === 'number') {
    cmp = va - vb;
  }
  return asc ? cmp : -cmp;
}

function toggleStr(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function HoldingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loc = useLocation();
  const { state, reload } = useHolders();

  const [sort, setSort] = useState<{ key: string; asc: boolean }>({
    key: 'share_code',
    asc: true,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [applied, setApplied] = useState<HoldingsColumnFilters>({});
  const [panel, setPanel] = useState<PanelState>(emptyPanel());
  const [filterOpen, setFilterOpen] = useState(false);
  const seedRef = useRef<string | null>(null);

  const allRows = useMemo(
    () => (state.status === 'ready' ? state.rows : []),
    [state]
  );

  useEffect(() => {
    if (state.status !== 'ready') return;
    const st = loc.state as
      | { filterNationality?: string; filterDomicile?: string }
      | undefined;
    if (!st?.filterNationality && !st?.filterDomicile) {
      seedRef.current = null;
      return;
    }
    const key = st.filterNationality
      ? `n:${st.filterNationality}`
      : `d:${st.filterDomicile}`;
    if (seedRef.current === key) return;
    seedRef.current = key;
    const next: HoldingsColumnFilters = {};
    if (st.filterNationality) next.nationality = [st.filterNationality];
    if (st.filterDomicile) next.domicile = [st.filterDomicile];
    setApplied(next);
    setPanel(panelFromApplied(next));
    setPage(1);
  }, [loc.state, state.status]);

  const prevFilterOpen = useRef(false);
  useEffect(() => {
    if (filterOpen && !prevFilterOpen.current) {
      setPanel(panelFromApplied(applied));
    }
    prevFilterOpen.current = filterOpen;
  }, [filterOpen, applied]);

  const typeValues = useMemo(
    () => [...new Set(allRows.map((r) => r.investor_type).filter(Boolean))].sort(),
    [allRows]
  );
  const nationalityList = useMemo(
    () => [...new Set(allRows.map((r) => r.nationality).filter(Boolean))].sort() as string[],
    [allRows]
  );
  const domicileList = useMemo(
    () => [...new Set(allRows.map((r) => r.domicile).filter(Boolean))].sort() as string[],
    [allRows]
  );

  const filteredRows = useMemo(
    () => applyHoldingsFilters(allRows, applied),
    [allRows, applied]
  );

  const filterCount = countHoldingsFilterKeys(applied);
  const hasExplorerFilter = Boolean(
    (loc.state as { filterNationality?: string })?.filterNationality ||
      (loc.state as { filterDomicile?: string })?.filterDomicile
  );
  const showReset = hasExplorerFilter || filterCount > 0;

  const sorted = useMemo(() => {
    const key = sort.key as keyof HolderRow;
    return [...filteredRows].sort((a, b) => {
      const primary = stableCompare(a, b, key, sort.asc);
      if (primary !== 0) return primary;
      const byCode = stableCompare(a, b, 'share_code', true);
      if (byCode !== 0) return byCode;
      return stableCompare(a, b, 'investor_name', true);
    });
  }, [filteredRows, sort]);

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
  }, [loc.state, applied, filteredRows.length]);

  const maxPctRaw = d3.max(filteredRows, (r) =>
    Number.isFinite(r.percentage) ? r.percentage : 0
  );
  const maxPct =
    Number.isFinite(maxPctRaw) && (maxPctRaw as number) > 0 ? (maxPctRaw as number) : 1;

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <section id="page-holdings" className="page-section page-active">
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
      <section id="page-holdings" className="page-section page-active">
        <div className="page-content">
          <div className="error-banner" style={{ marginTop: 80 }}>
            <h3>{t('failed_load')}</h3>
            <p>{t('failed_load_msg')}</p>
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

  const stockCount = new Set(allRows.map((r) => r.share_code)).size;
  const investorCount = new Set(allRows.map((r) => r.investor_name)).size;

  return (
    <section id="page-holdings" className="page-section page-active">
      <div className="page-content">
        <div className="holdings-header">
          <div className="holdings-title-row">
            <h2 id="holdingsTitle" data-tip={t('tip_holdings_browse')}>
              {t('all_holdings')}
            </h2>
            {showReset ? (
              <button
                type="button"
                className="investor-back"
                onClick={() => {
                  navigate('/holdings', { replace: true, state: {} });
                  setApplied({});
                  setPanel(emptyPanel());
                  setPage(1);
                  seedRef.current = null;
                }}
              >
                {t('show_all')}
              </button>
            ) : null}
          </div>
          <div className="holdings-header-right">
            <button
              type="button"
              id="filterToggle"
              className={`filter-toggle${filterCount > 0 ? ' has-filters' : ''}`}
              aria-expanded={filterOpen}
              onClick={() => setFilterOpen((o) => !o)}
            >
              {t('filters')}
              <span className="filter-count" id="filterCount">
                {filterCount}
              </span>
            </button>
            <span className="row-count" id="allRowCount" data-tip={t('tip_holdings_row_count')}>
              {formatInt(slice.total)} {t('rows')}
              {!hasExplorerFilter && filterCount === 0 ? (
                <>
                  {' '}
                  · {formatInt(investorCount)} {t('investors')} · {formatInt(stockCount)}{' '}
                  {t('stocks')}
                </>
              ) : null}
            </span>
          </div>
        </div>

        <div id="filterPanel" className={`filter-panel${filterOpen ? ' open' : ''}`}>
          <div className="filter-section">
            <div className="filter-section-title">{t('category_filters')}</div>
            <div className="filter-row">
              <div className="filter-group">
                <h3>{t('filter_investor_type')}</h3>
                <div className="filter-checks scrollable" id="filterInvestorType">
                  {typeValues.map((tp) => (
                    <label
                      key={tp}
                      className={`filter-chip${panel.types.includes(tp) ? ' checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={panel.types.includes(tp)}
                        onChange={() =>
                          setPanel((prev) => ({ ...prev, types: toggleStr(prev.types, tp) }))
                        }
                        value={tp}
                      />{' '}
                      {tp} — {t(`type_labels.${tp}`, { defaultValue: tp })}
                    </label>
                  ))}
                </div>
              </div>
              <div className="filter-group">
                <h3>{t('filter_lf')}</h3>
                <div className="filter-checks" id="filterLocalForeign">
                  {(['L', 'F'] as const).map((v) => (
                    <label
                      key={v}
                      className={`filter-chip${panel.lf.includes(v) ? ' checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={panel.lf.includes(v)}
                        onChange={() =>
                          setPanel((prev) => ({ ...prev, lf: toggleStr(prev.lf, v) }))
                        }
                        value={v}
                      />{' '}
                      {v === 'L' ? t('local') : t('foreign')}
                    </label>
                  ))}
                </div>
              </div>
              <div className="filter-group">
                <h3>{t('tab_nationality')}</h3>
                <div className="filter-checks scrollable" id="filterNationality">
                  {nationalityList.map((n) => (
                    <label
                      key={n}
                      className={`filter-chip${panel.nationality.includes(n) ? ' checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={panel.nationality.includes(n)}
                        onChange={() =>
                          setPanel((prev) => ({
                            ...prev,
                            nationality: toggleStr(prev.nationality, n),
                          }))
                        }
                        value={n}
                      />{' '}
                      {esc(n)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="filter-group">
                <h3>{t('tab_domicile')}</h3>
                <div className="filter-checks scrollable" id="filterDomicile">
                  {domicileList.map((n) => (
                    <label
                      key={n}
                      className={`filter-chip${panel.domicile.includes(n) ? ' checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={panel.domicile.includes(n)}
                        onChange={() =>
                          setPanel((prev) => ({
                            ...prev,
                            domicile: toggleStr(prev.domicile, n),
                          }))
                        }
                        value={n}
                      />{' '}
                      {esc(n)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="filter-section">
            <div className="filter-section-title">{t('numeric_filters')}</div>
            <div className="filter-range-row">
              <div className="filter-range-item" data-field="percentage">
                <label>{t('col_stake_pct')}</label>
                <div className="filter-range">
                  <select
                    value={panel.pctOp}
                    onChange={(e) =>
                      setPanel((prev) => ({ ...prev, pctOp: e.target.value as RangeOp }))
                    }
                  >
                    <option value="gte">{t('filter_op_gte')}</option>
                    <option value="lte">{t('filter_op_lte')}</option>
                    <option value="eq">{t('filter_op_eq')}</option>
                    <option value="between">{t('filter_op_between')}</option>
                  </select>
                  <input
                    className="range-val1"
                    type="text"
                    inputMode="decimal"
                    value={panel.pct1}
                    onChange={(e) => setPanel((prev) => ({ ...prev, pct1: e.target.value }))}
                    placeholder="0"
                  />
                  <input
                    className="range-val2"
                    type="text"
                    inputMode="decimal"
                    value={panel.pct2}
                    onChange={(e) => setPanel((prev) => ({ ...prev, pct2: e.target.value }))}
                    placeholder="0"
                    style={{ display: panel.pctOp === 'between' ? '' : 'none' }}
                  />
                </div>
              </div>
              <div className="filter-range-item" data-field="total_holding_shares">
                <label>{t('col_total_shares')}</label>
                <div className="filter-range">
                  <select
                    value={panel.shOp}
                    onChange={(e) =>
                      setPanel((prev) => ({ ...prev, shOp: e.target.value as RangeOp }))
                    }
                  >
                    <option value="gte">{t('filter_op_gte')}</option>
                    <option value="lte">{t('filter_op_lte')}</option>
                    <option value="eq">{t('filter_op_eq')}</option>
                    <option value="between">{t('filter_op_between')}</option>
                  </select>
                  <input
                    className="range-val1"
                    type="text"
                    inputMode="decimal"
                    value={panel.sh1}
                    onChange={(e) => setPanel((prev) => ({ ...prev, sh1: e.target.value }))}
                    placeholder="0"
                  />
                  <input
                    className="range-val2"
                    type="text"
                    inputMode="decimal"
                    value={panel.sh2}
                    onChange={(e) => setPanel((prev) => ({ ...prev, sh2: e.target.value }))}
                    placeholder="0"
                    style={{ display: panel.shOp === 'between' ? '' : 'none' }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="filter-actions">
            <button
              type="button"
              id="filterApply"
              className="btn-apply"
              onClick={() => {
                const next = appliedFromPanel(panel);
                setApplied(next);
                setPage(1);
              }}
            >
              {t('apply_filters')}
            </button>
            <button
              type="button"
              id="filterClear"
              className="btn-clear"
              onClick={() => {
                setPanel(emptyPanel());
                setApplied({});
                setPage(1);
              }}
            >
              {t('clear_all')}
            </button>
            <span className="spacer" />
          </div>
        </div>

        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead id="allTableHead">
                <tr>
                  {ALL_KEYS.map((key) => {
                    const colTip =
                      t(`col_tips.${key}`, { defaultValue: '' }) || t('tip_table_sort_column');
                    return (
                      <th
                        key={key}
                        className={
                          key === 'total_holding_shares' || key === 'percentage'
                            ? 'text-end'
                            : undefined
                        }
                        style={{ cursor: 'pointer' }}
                        data-tip={colTip}
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
                    );
                  })}
                </tr>
              </thead>
              <tbody id="allTableBody">
                {slice.rows.map((r, idx) => {
                  const typeTipSafe = r.investor_type
                    ? t(`type_tips.${r.investor_type}`, { defaultValue: '' })
                    : '';
                  const pctW = Number.isFinite(r.percentage)
                    ? Math.min(100, Math.max(0, (r.percentage / maxPct) * 100)).toFixed(1)
                    : '0';
                  return (
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
                            data-tip={typeTipSafe || undefined}
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
                        {r.local_foreign === 'L' ? (
                          <span data-tip={t('tip_local')}>{t('local')}</span>
                        ) : r.local_foreign === 'F' ? (
                          <span data-tip={t('tip_foreign')}>{t('foreign')}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{esc(r.nationality || '—')}</td>
                      <td className="num">{formatInt(r.total_holding_shares)}</td>
                      <td>
                        <div className="pct-bar-wrap">
                          <div className="pct-bar">
                            <div className="pct-bar-fill" style={{ width: `${pctW}%` }} />
                          </div>
                          <span className="pct-val">{formatPct(r.percentage)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
