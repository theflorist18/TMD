import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { buildInvestorMap, buildStockMap, type HolderRow } from '@/domain/holders';
import { useHolders } from '@/context/HoldersDatasetContext';
import { formatInt, esc, formatPct } from '@/lib/format';
import { getPaginationRange } from '@/lib/pagination';
import { renderInvestorNetwork, renderStockNetwork } from '@/charts/forceNetwork';
import { renderInvestorPie, renderStockPie } from '@/charts/pieDonut';
import { injectAdvancedChart } from '@/lib/tradingview';
import { IconSearch, IconSortAsc, IconSortDesc } from '@/components/Icons';
import { TYPE_COLORS } from '@/charts/d3common';

const BROWSE_PAGE_SIZE = 15;

type SearchMode = 'investor' | 'stock' | 'nationality' | 'domicile';

export function ExplorerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { state } = useHolders();

  const [searchMode, setSearchMode] = useState<SearchMode>('investor');
  const [q, setQ] = useState('');
  const [browsePage, setBrowsePage] = useState(1);
  const [browseSort, setBrowseSort] = useState<{ key: string; asc: boolean }>({
    key: 'totalShares',
    asc: false,
  });

  const [selectedInvestor, setSelectedInvestor] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);

  const graphInvRef = useRef<HTMLDivElement>(null);
  const pieInvRef = useRef<HTMLDivElement>(null);
  const graphStRef = useRef<HTMLDivElement>(null);
  const pieStRef = useRef<HTMLDivElement>(null);
  const chartStRef = useRef<HTMLDivElement>(null);
  const stopSim = useRef<(() => void) | null>(null);

  const typeLabel = useCallback((tp: string) => t(`type_labels.${tp}`) || tp, [t]);

  useEffect(() => {
    const inv = sp.get('investor');
    const stk = sp.get('stock');
    if (inv) {
      setSelectedInvestor(inv);
      setSelectedStock(null);
    } else if (stk) {
      setSelectedStock(stk);
      setSelectedInvestor(null);
    }
  }, [sp]);

  const rows = state.status === 'ready' ? state.rows : [];
  const invMap = useMemo(() => buildInvestorMap(rows), [rows]);
  const stockMap = useMemo(() => buildStockMap(rows), [rows]);

  const investorRows = selectedInvestor ? invMap.get(selectedInvestor) ?? [] : [];
  const stockRows = selectedStock ? stockMap.get(selectedStock)?.rows ?? [] : [];

  useLayoutEffect(() => {
    stopSim.current?.();
    stopSim.current = null;
    if (state.status !== 'ready') return;
    if (selectedInvestor && graphInvRef.current && pieInvRef.current) {
      stopSim.current = renderInvestorNetwork(
        graphInvRef.current,
        investorRows,
        selectedInvestor,
        {
          typeLabel,
          t,
          onStockClick: (code) => {
            setSp(new URLSearchParams({ stock: code }));
            setSelectedStock(code);
            setSelectedInvestor(null);
          },
        }
      );
      renderInvestorPie(pieInvRef.current, investorRows, {
        t,
        onStockClick: (code) => {
          setSp(new URLSearchParams({ stock: code }));
          setSelectedStock(code);
          setSelectedInvestor(null);
        },
      });
    }
    return () => {
      stopSim.current?.();
      stopSim.current = null;
    };
  }, [selectedInvestor, state.status, investorRows, typeLabel, t, setSp]);

  useLayoutEffect(() => {
    stopSim.current?.();
    stopSim.current = null;
    if (state.status !== 'ready') return;
    if (selectedStock && graphStRef.current && pieStRef.current && chartStRef.current) {
      stopSim.current = renderStockNetwork(graphStRef.current, stockRows, selectedStock, {
        typeLabel,
        t,
        onInvestorClick: (name) => {
          setSp(new URLSearchParams({ investor: name }));
          setSelectedInvestor(name);
          setSelectedStock(null);
        },
      });
      renderStockPie(pieStRef.current, stockRows, {
        t,
        onInvestorClick: (name) => {
          setSp(new URLSearchParams({ investor: name }));
          setSelectedInvestor(name);
          setSelectedStock(null);
        },
      });
      injectAdvancedChart(chartStRef.current, `IDX:${selectedStock}`, 420);
    }
    return () => {
      stopSim.current?.();
      stopSim.current = null;
    };
  }, [selectedStock, state.status, stockRows, typeLabel, t, setSp]);

  const browseData = useMemo(() => {
    if (state.status !== 'ready') return [];
    if (searchMode === 'investor') {
      return [...invMap.entries()].map(([name, rws]) => ({
        key: name,
        name,
        stocks: rws.length,
        totalShares: rws.reduce((s, r) => s + r.total_holding_shares, 0),
        type: [...new Set(rws.map((r) => r.investor_type).filter(Boolean))].join(', '),
        localForeign: [
          ...new Set(rws.map((r) => r.local_foreign).filter(Boolean)),
        ]
          .map((v) => (v === 'L' ? 'Local' : 'Foreign'))
          .join(', '),
      }));
    }
    if (searchMode === 'stock') {
      return [...stockMap.entries()].map(([code, s]) => ({
        key: code,
        code,
        issuer: s.issuer,
        holders: s.rows.length,
        totalShares: s.rows.reduce((sum, r) => sum + r.total_holding_shares, 0),
        topHolder: s.rows.reduce((a, b) => (a.percentage > b.percentage ? a : b)).investor_name,
      }));
    }
    if (searchMode === 'nationality') {
      const natMap = new Map<
        string,
        { name: string; rows: number; investors: Set<string>; stocks: Set<string> }
      >();
      rows.forEach((r) => {
        const n = r.nationality || '—';
        if (!natMap.has(n))
          natMap.set(n, { name: n, rows: 0, investors: new Set(), stocks: new Set() });
        const e = natMap.get(n)!;
        e.rows++;
        e.investors.add(r.investor_name);
        e.stocks.add(r.share_code);
      });
      return [...natMap.values()].map((e) => ({
        key: e.name,
        name: e.name,
        investors: e.investors.size,
        stocks: e.stocks.size,
        rows: e.rows,
      }));
    }
    const domMap = new Map<
      string,
      { name: string; rows: number; investors: Set<string>; stocks: Set<string> }
    >();
    rows.forEach((r) => {
      const n = r.domicile || '—';
      if (!domMap.has(n))
        domMap.set(n, { name: n, rows: 0, investors: new Set(), stocks: new Set() });
      const e = domMap.get(n)!;
      e.rows++;
      e.investors.add(r.investor_name);
      e.stocks.add(r.share_code);
    });
    return [...domMap.values()].map((e) => ({
      key: e.name,
      name: e.name,
      investors: e.investors.size,
      stocks: e.stocks.size,
      rows: e.rows,
    }));
  }, [state.status, rows, invMap, stockMap, searchMode]);

  const browseFiltered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return browseData;
    if (searchMode === 'investor') {
      return browseData.filter((r) =>
        String((r as { name?: string }).name ?? '')
          .toLowerCase()
          .includes(qq)
      );
    }
    if (searchMode === 'stock') {
      return browseData.filter((r) => {
        const row = r as { code?: string; issuer?: string };
        return (
          String(row.code ?? '')
            .toLowerCase()
            .includes(qq) ||
          String(row.issuer ?? '')
            .toLowerCase()
            .includes(qq)
        );
      });
    }
    return browseData.filter((r) =>
      String((r as { name?: string }).name ?? '')
        .toLowerCase()
        .includes(qq)
    );
  }, [browseData, q, searchMode]);

  useEffect(() => {
    setBrowsePage(1);
  }, [q, searchMode, browseFiltered.length]);

  const sortedBrowse = useMemo(() => {
    const sorted = [...browseFiltered].sort((a, b) => {
      const va = (a as Record<string, unknown>)[browseSort.key];
      const vb = (b as Record<string, unknown>)[browseSort.key];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp =
        typeof va === 'string'
          ? (va as string).localeCompare(String(vb))
          : (va as number) - (vb as number);
      return browseSort.asc ? cmp : -cmp;
    });
    return sorted;
  }, [browseFiltered, browseSort]);

  const browseSlice = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(sortedBrowse.length / BROWSE_PAGE_SIZE));
    const page = Math.min(browsePage, totalPages);
    const start = (page - 1) * BROWSE_PAGE_SIZE;
    return {
      page,
      totalPages,
      start,
      slice: sortedBrowse.slice(start, start + BROWSE_PAGE_SIZE),
      total: sortedBrowse.length,
    };
  }, [sortedBrowse, browsePage]);

  const searchResults = useMemo(() => {
    if (!q.trim()) return [];
    const qq = q.toLowerCase();
    if (searchMode === 'investor') {
      return state.status === 'ready'
        ? state.investorNames.filter((n) => n.toLowerCase().includes(qq)).slice(0, 12)
        : [];
    }
    if (searchMode === 'stock') {
      return state.status === 'ready'
        ? state.stockNames
            .filter(
              (c) =>
                c.toLowerCase().includes(qq) ||
                (stockMap.get(c)?.issuer.toLowerCase().includes(qq) ?? false)
            )
            .slice(0, 12)
        : [];
    }
    if (searchMode === 'nationality') {
      return state.status === 'ready'
        ? state.nationalityList.filter((n) => n.toLowerCase().includes(qq)).slice(0, 12)
        : [];
    }
    return state.status === 'ready'
      ? state.domicileList.filter((n) => n.toLowerCase().includes(qq)).slice(0, 12)
      : [];
  }, [q, searchMode, state, stockMap]);

  function clearDetail() {
    setSelectedInvestor(null);
    setSelectedStock(null);
    setSp(new URLSearchParams());
  }

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

  if (selectedInvestor) {
    return (
      <section id="page-explorer" className="page-section page-active">
        <div className="page-content">
          <div className="dashboard visible" id="dashboard">
            <button type="button" className="investor-back" onClick={clearDetail}>
              {t('back_to_search')}
            </button>
            <div className="investor-header">
              <div className="stock-logo-wrap">
                <div className="investor-avatar">{selectedInvestor.slice(0, 2).toUpperCase()}</div>
                <div>
                  <h2>{esc(selectedInvestor)}</h2>
                </div>
              </div>
            </div>
            <div className="top-row">
              <div className="card card--graph">
                <div className="card-title">{t('ownership_network')}</div>
                <div id="graph-container" ref={graphInvRef} style={{ minHeight: 520 }} />
                <div className="legend" id="legend" />
              </div>
              <div className="card">
                <div className="card-title">{t('portfolio_alloc')}</div>
                <div className="pie-inner" id="pie-container" ref={pieInvRef} />
              </div>
            </div>
            <InvestorHoldingsTable rows={investorRows} t={t} typeLabel={typeLabel} />
          </div>
        </div>
      </section>
    );
  }

  if (selectedStock) {
    const meta = stockMap.get(selectedStock);
    return (
      <section id="page-explorer" className="page-section page-active">
        <div className="page-content">
          <div id="stockDetail" style={{ display: 'block' }}>
            <button type="button" className="investor-back" onClick={clearDetail}>
              {t('back_to_search')}
            </button>
            <div className="investor-header">
              <div className="stock-logo-wrap">
                <div className="stock-logo-fallback">{selectedStock.slice(0, 2)}</div>
                <div>
                  <h2>{esc(selectedStock)}</h2>
                  <div className="sub">{esc(meta?.issuer ?? '')}</div>
                </div>
              </div>
            </div>
            <div className="top-row">
              <div className="card card--graph">
                <div className="card-title">{t('holder_network')}</div>
                <div id="stock-graph-container" ref={graphStRef} style={{ minHeight: 520 }} />
                <div className="legend" id="stock-legend" />
              </div>
              <div className="card">
                <div className="card-title">{t('ownership_breakdown')}</div>
                <div className="pie-inner" id="stock-pie-container" ref={pieStRef} />
              </div>
            </div>
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-title">{t('live_performance')}</div>
              <div className="explorer-stock-chart-body" style={{ height: 420 }} ref={chartStRef}>
                <div className="widget-placeholder">
                  <div className="spinner" />
                </div>
              </div>
            </div>
            <StockHoldersTable rows={stockRows} t={t} typeLabel={typeLabel} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="page-explorer" className="page-section page-active">
      <div className="page-content">
        <div className="explorer-search-section">
          <h2>{t('explorer_title')}</h2>
          <div className="search-wrap">
            <div className="search-field">
              <span className="search-icon" aria-hidden>
                <IconSearch />
              </span>
              <input
                id="search"
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  searchMode === 'investor'
                    ? t('search_investor')
                    : searchMode === 'stock'
                      ? t('search_stock')
                      : searchMode === 'nationality'
                        ? t('search_nationality')
                        : t('search_domicile')
                }
                autoComplete="off"
                aria-label="Search"
              />
            </div>
            <div className="search-tabs" role="tablist">
              {(['investor', 'stock', 'nationality', 'domicile'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  className={`search-tab${searchMode === m ? ' active' : ''}`}
                  onClick={() => {
                    setSearchMode(m);
                    setBrowsePage(1);
                    setQ('');
                    if (m === 'investor') setBrowseSort({ key: 'totalShares', asc: false });
                    else if (m === 'stock') setBrowseSort({ key: 'holders', asc: false });
                    else setBrowseSort({ key: 'rows', asc: false });
                  }}
                >
                  {t(`tab_${m}`)}
                </button>
              ))}
            </div>
            {q.trim() ? (
              <div className="autocomplete show" role="listbox">
                {searchResults.length === 0 ? (
                  <div className="autocomplete-empty">{t('no_results')}</div>
                ) : null}
                {searchResults.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className="autocomplete-item"
                    onClick={() => {
                      if (searchMode === 'investor') {
                        setSp(new URLSearchParams({ investor: item }));
                        setSelectedInvestor(item);
                      } else if (searchMode === 'stock') {
                        setSp(new URLSearchParams({ stock: item }));
                        setSelectedStock(item);
                      } else if (searchMode === 'nationality') {
                        navigate('/holdings', { state: { filterNationality: item } });
                      } else {
                        navigate('/holdings', { state: { filterDomicile: item } });
                      }
                      setQ('');
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div id="explorerEmpty">
          <div id="browsePanel">
            <div className="browse-header">
              <h3 id="browseTitle" data-tip={t('tip_explorer_browse')}>
                {searchMode === 'investor'
                  ? t('browse_investors')
                  : searchMode === 'stock'
                    ? t('browse_stocks')
                    : searchMode === 'nationality'
                      ? t('browse_nationalities')
                      : t('browse_domiciles')}
              </h3>
              <span className="browse-count" id="browseCount">
                {formatInt(browseSlice.total)} {t('items')}
              </span>
            </div>
            <BrowseTable
              mode={searchMode}
              slice={browseSlice.slice}
              filterActive={Boolean(q.trim())}
              browseSort={browseSort}
              setBrowseSort={setBrowseSort}
              onPickInvestor={(name) => {
                setSp(new URLSearchParams({ investor: name }));
                setSelectedInvestor(name);
              }}
              onPickStock={(code) => {
                setSp(new URLSearchParams({ stock: code }));
                setSelectedStock(code);
              }}
              onNatDom={(mode, name) => {
                if (mode === 'nationality')
                  navigate('/holdings', { state: { filterNationality: name } });
                else navigate('/holdings', { state: { filterDomicile: name } });
              }}
              t={t}
              setBrowsePage={setBrowsePage}
              browseSlice={browseSlice}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function BrowseTable({
  mode,
  slice,
  filterActive,
  browseSort,
  setBrowseSort,
  onPickInvestor,
  onPickStock,
  onNatDom,
  t,
  setBrowsePage,
  browseSlice,
}: {
  mode: SearchMode;
  slice: Record<string, unknown>[];
  filterActive: boolean;
  browseSort: { key: string; asc: boolean };
  setBrowseSort: (s: { key: string; asc: boolean }) => void;
  onPickInvestor: (n: string) => void;
  onPickStock: (c: string) => void;
  onNatDom: (m: 'nationality' | 'domicile', name: string) => void;
  t: (k: string) => string;
  setBrowsePage: (n: number) => void;
  browseSlice: {
    page: number;
    totalPages: number;
    start: number;
    slice: Record<string, unknown>[];
    total: number;
  };
}) {
  const cols =
    mode === 'investor'
      ? [
          { key: 'name', label: t('col_investor_name'), num: false },
          { key: 'type', label: t('col_type'), num: false },
          { key: 'localForeign', label: t('filter_lf'), num: false },
          { key: 'stocks', label: t('col_stocks'), num: true },
          { key: 'totalShares', label: t('col_total_shares'), num: true },
        ]
      : mode === 'stock'
        ? [
            { key: 'code', label: t('col_ticker'), num: false },
            { key: 'issuer', label: t('col_issuer_name'), num: false },
            { key: 'holders', label: t('stat_major_holders'), num: true },
            { key: 'totalShares', label: t('col_total_shares'), num: true },
            { key: 'topHolder', label: t('stat_largest_holder'), num: false },
          ]
        : [
            { key: 'name', label: t(`tab_${mode}`), num: false },
            { key: 'investors', label: t('investors'), num: true },
            { key: 'stocks', label: t('col_stocks'), num: true },
            { key: 'rows', label: t('rows'), num: true },
          ];

  return (
    <div className="table-card">
      <div className="table-scroll" style={{ maxHeight: 520 }}>
        <table className="explorer-browse-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={c.num ? 'text-end' : undefined}
                  style={{ cursor: 'pointer' }}
                  data-tip={t('tip_table_sort_column')}
                  onClick={() => {
                    setBrowseSort({
                      key: c.key,
                      asc: browseSort.key === c.key ? !browseSort.asc : !c.num,
                    });
                    setBrowsePage(1);
                  }}
                >
                  <span className="th-inner">
                    <span className="th-label">{c.label}</span>
                    {browseSort.key === c.key ? (
                      <span className="th-sort" aria-hidden>
                        {browseSort.asc ? <IconSortAsc /> : <IconSortDesc />}
                      </span>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 ? (
              <tr>
                <td colSpan={cols.length} className="browse-empty">
                  {t('no_results')}
                </td>
              </tr>
            ) : (
              slice.map((row) => (
                <tr
                  key={String(row.key)}
                  onClick={() => {
                    if (mode === 'investor') onPickInvestor(String(row.name));
                    else if (mode === 'stock') onPickStock(String(row.code));
                    else if (mode === 'nationality') onNatDom('nationality', String(row.name));
                    else onNatDom('domicile', String(row.name));
                  }}
                >
                  {cols.map((c) => {
                    const v = row[c.key];
                    if (c.num && (c.key === 'totalShares' || c.key === 'rows'))
                      return (
                        <td key={c.key} className="num">
                          {formatInt(Number(v))}
                        </td>
                      );
                    if (c.num)
                      return (
                        <td key={c.key} className="num">
                          {typeof v === 'number' ? formatInt(v) : String(v ?? '—')}
                        </td>
                      );
                    if (mode === 'investor' && c.key === 'type') {
                      const raw = String(v ?? '—');
                      const parts = raw === '—' ? [] : raw.split(',').map((s) => s.trim()).filter(Boolean);
                      return (
                        <td key={c.key} title={raw}>
                          {parts.length
                            ? parts.map((tp) => (
                                <span
                                  key={tp}
                                  className="explorer-type-chip"
                                  style={{
                                    background: `${TYPE_COLORS[tp] ?? '#888'}28`,
                                    color: TYPE_COLORS[tp] ?? '#aaa',
                                  }}
                                >
                                  {tp}
                                </span>
                              ))
                            : '—'}
                        </td>
                      );
                    }
                    if (mode === 'investor' && c.key === 'localForeign') {
                      return (
                        <td key={c.key} className="cell-lf" title={String(v ?? '')}>
                          {String(v ?? '—')}
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} title={String(v ?? '')}>
                        {String(v ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        {browseSlice.totalPages <= 1 ? (
          <span className="page-info">
            {t('showing_all')} {formatInt(browseSlice.total)} {t('items')}
          </span>
        ) : (
          <>
            <span className="page-info">
              {t('showing')} {formatInt(browseSlice.start + 1)}–
              {formatInt(browseSlice.start + slice.length)} {t('of')}{' '}
              {formatInt(browseSlice.total)}
            </span>
            <div className="page-buttons">
              <button
                type="button"
                disabled={browseSlice.page <= 1}
                onClick={() => setBrowsePage(browseSlice.page - 1)}
              >
                « {t('prev')}
              </button>
              {getPaginationRange(browseSlice.page, browseSlice.totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`e${i}`} className="page-ellipsis">
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={p === browseSlice.page ? 'active' : ''}
                    onClick={() => setBrowsePage(p as number)}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                type="button"
                disabled={browseSlice.page >= browseSlice.totalPages}
                onClick={() => setBrowsePage(browseSlice.page + 1)}
              >
                {t('next')} »
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InvestorHoldingsTable({
  rows,
  t,
  typeLabel,
}: {
  rows: HolderRow[];
  t: (k: string) => string;
  typeLabel: (tp: string) => string;
}) {
  const sorted = [...rows].sort((a, b) => b.percentage - a.percentage);
  return (
    <div className="table-card">
      <div className="card-title">{t('holdings_detail')}</div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('col_ticker')}</th>
              <th>{t('col_issuer')}</th>
              <th>{t('col_type')}</th>
              <th>{t('col_lf')}</th>
              <th className="num">{t('col_total_shares')}</th>
              <th className="num">{t('col_stake_pct')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.share_code}>
                <td>{esc(r.share_code)}</td>
                <td>{esc(r.issuer_name)}</td>
                <td>{typeLabel(r.investor_type) || r.investor_type}</td>
                <td>{r.local_foreign === 'L' ? t('local') : r.local_foreign === 'F' ? t('foreign') : '—'}</td>
                <td className="num">{formatInt(r.total_holding_shares)}</td>
                <td className="num">{formatPct(r.percentage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StockHoldersTable({
  rows,
  t,
  typeLabel,
}: {
  rows: HolderRow[];
  t: (k: string) => string;
  typeLabel: (tp: string) => string;
}) {
  const sorted = [...rows].sort((a, b) => b.percentage - a.percentage);
  return (
    <div className="table-card">
      <div className="card-title">{t('major_shareholders')}</div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>{t('col_investor_name')}</th>
              <th>{t('col_type')}</th>
              <th>{t('col_lf')}</th>
              <th className="num">{t('col_total_shares')}</th>
              <th className="num">{t('col_stake_pct')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.investor_name}>
                <td>{esc(r.investor_name)}</td>
                <td>{typeLabel(r.investor_type) || r.investor_type}</td>
                <td>{r.local_foreign === 'L' ? t('local') : r.local_foreign === 'F' ? t('foreign') : '—'}</td>
                <td className="num">{formatInt(r.total_holding_shares)}</td>
                <td className="num">{formatPct(r.percentage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
