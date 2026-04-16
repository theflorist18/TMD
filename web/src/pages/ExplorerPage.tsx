import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { buildInvestorMap, buildStockMap, type HolderRow } from '@/domain/holders';
import type { IntelGroup } from '@/domain/intelGroups';
import { useHolders } from '@/context/HoldersDatasetContext';
import { useFreeFloat } from '@/context/FreeFloatDatasetContext';
import { formatInt, esc, formatPct } from '@/lib/format';
import { getPaginationRange } from '@/lib/pagination';
import {
  fetchDataset,
  intelGroupCandidatesUrl,
  intelGroupsUrl,
} from '@/api/client';
import { renderExplorerBrowseGraph } from '@/charts/explorerBrowseGraph';
import { renderGroupNetwork, renderInvestorNetwork, renderStockNetwork } from '@/charts/forceNetwork';
import { renderGroupPie, renderInvestorPie, renderStockPie } from '@/charts/pieDonut';
import { injectAdvancedChart } from '@/lib/tradingview';
import { IconSearch, IconSortAsc, IconSortDesc } from '@/components/Icons';
import { TYPE_COLORS } from '@/charts/d3common';

const BROWSE_PAGE_SIZE = 15;

type SearchMode = 'investor' | 'stock' | 'nationality' | 'domicile' | 'group';

const explorerNetTitleKey: Record<SearchMode, string> = {
  investor: 'explorer_net_investor_title',
  stock: 'explorer_net_stock_title',
  nationality: 'explorer_net_nationality_title',
  domicile: 'explorer_net_domicile_title',
  group: 'explorer_net_group_title',
};

export function ExplorerPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { state, reload } = useHolders();
  const { state: ffState } = useFreeFloat();

  const [searchMode, setSearchMode] = useState<SearchMode>('investor');
  const [q, setQ] = useState('');
  const [browsePage, setBrowsePage] = useState(1);
  const [browseSort, setBrowseSort] = useState<{ key: string; asc: boolean }>({
    key: 'totalShares',
    asc: false,
  });

  const [selectedInvestor, setSelectedInvestor] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<IntelGroup[] | null>(null);

  /** Graph focus → filter rows in the detail table below (same behavior as browse overview graph). */
  const [detailStockHolderKey, setDetailStockHolderKey] = useState<string | null>(null);
  const [detailInvestorStockKey, setDetailInvestorStockKey] = useState<string | null>(null);
  const [detailGroupTableFilter, setDetailGroupTableFilter] = useState<{
    memberName?: string;
    shareCode?: string;
  } | null>(null);

  const graphInvRef = useRef<HTMLDivElement>(null);
  const pieInvRef = useRef<HTMLDivElement>(null);
  const graphStRef = useRef<HTMLDivElement>(null);
  const pieStRef = useRef<HTMLDivElement>(null);
  const chartStRef = useRef<HTMLDivElement>(null);
  const graphGrpRef = useRef<HTMLDivElement>(null);
  const pieGrpRef = useRef<HTMLDivElement>(null);
  const groupLegendRef = useRef<HTMLDivElement>(null);
  const browseOverviewRef = useRef<HTMLDivElement>(null);
  const stopBrowseOverview = useRef<(() => void) | null>(null);
  const stopSim = useRef<(() => void) | null>(null);

  const typeLabel = useCallback((tp: string) => t(`type_labels.${tp}`) || tp, [t]);

  const onBrowseOverviewStock = useCallback((code: string) => {
    setSp(new URLSearchParams({ stock: code }));
    setSelectedStock(code);
    setSelectedInvestor(null);
    setSelectedGroupId(null);
  }, [setSp]);

  const onBrowseOverviewInvestor = useCallback(
    (name: string) => {
      setSp(new URLSearchParams({ investor: name }));
      setSelectedInvestor(name);
      setSelectedStock(null);
      setSelectedGroupId(null);
    },
    [setSp]
  );

  const onBrowseOverviewGroup = useCallback(
    (id: string) => {
      setSp(new URLSearchParams({ group: id }));
      setSelectedGroupId(id);
      setSelectedInvestor(null);
      setSelectedStock(null);
    },
    [setSp]
  );

  useEffect(() => {
    const inv = sp.get('investor');
    const stk = sp.get('stock');
    const grp = sp.get('group');
    if (inv) {
      setSelectedInvestor(inv);
      setSelectedStock(null);
      setSelectedGroupId(null);
    } else if (stk) {
      setSelectedStock(stk);
      setSelectedInvestor(null);
      setSelectedGroupId(null);
    } else if (grp) {
      setSelectedGroupId(grp);
      setSelectedInvestor(null);
      setSelectedStock(null);
    } else {
      setSelectedInvestor(null);
      setSelectedStock(null);
      setSelectedGroupId(null);
    }
  }, [sp]);

  useEffect(() => {
    setDetailStockHolderKey(null);
  }, [selectedStock]);

  useEffect(() => {
    setDetailInvestorStockKey(null);
  }, [selectedInvestor]);

  useEffect(() => {
    setDetailGroupTableFilter(null);
  }, [selectedGroupId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const gResp = await fetchDataset(intelGroupsUrl());
        let g: IntelGroup[] = [];
        if (gResp.ok) {
          const parsed = (await gResp.json()) as IntelGroup[];
          if (Array.isArray(parsed)) g = parsed;
        }
        if ((!g.length || !Array.isArray(g)) && !cancelled) {
          const cResp = await fetchDataset(intelGroupCandidatesUrl());
          if (cResp.ok) {
            const cg = (await cResp.json()) as IntelGroup[];
            if (Array.isArray(cg) && cg.length > 0) g = cg;
          }
        }
        if (!cancelled) setGroups(Array.isArray(g) ? g : []);
      } catch {
        if (!cancelled) setGroups([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = state.status === 'ready' ? state.rows : [];
  const invMap = useMemo(() => buildInvestorMap(rows), [rows]);
  const stockMap = useMemo(() => buildStockMap(rows), [rows]);

  const investorRows = selectedInvestor ? invMap.get(selectedInvestor) ?? [] : [];
  const stockRows = selectedStock ? stockMap.get(selectedStock)?.rows ?? [] : [];

  const selectedGroupMeta = useMemo(() => {
    if (!selectedGroupId || !groups?.length) return null;
    return groups.find((g) => g.id === selectedGroupId) ?? null;
  }, [groups, selectedGroupId]);

  const groupRows = useMemo(() => {
    if (!selectedGroupMeta) return [];
    const memberSet = new Set(selectedGroupMeta.members);
    return rows.filter((r) => memberSet.has(r.investor_name));
  }, [rows, selectedGroupMeta]);

  const stockTableRows = useMemo(() => {
    if (!detailStockHolderKey) return stockRows;
    return stockRows.filter((r) => r.investor_name === detailStockHolderKey);
  }, [stockRows, detailStockHolderKey]);

  const investorTableRows = useMemo(() => {
    if (!detailInvestorStockKey) return investorRows;
    return investorRows.filter((r) => r.share_code === detailInvestorStockKey);
  }, [investorRows, detailInvestorStockKey]);

  const groupTableRows = useMemo(() => {
    if (!detailGroupTableFilter) return groupRows;
    return groupRows.filter((r) => {
      if (detailGroupTableFilter.memberName && r.investor_name !== detailGroupTableFilter.memberName) {
        return false;
      }
      if (detailGroupTableFilter.shareCode && r.share_code !== detailGroupTableFilter.shareCode) {
        return false;
      }
      return true;
    });
  }, [groupRows, detailGroupTableFilter]);

  /** Single owner: the stock and investor layout effects previously disposed each other's sim on every paint. */
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
          onStockClick: onBrowseOverviewStock,
          onInvestorHubClick: onBrowseOverviewInvestor,
          onTableFocusChange: setDetailInvestorStockKey,
        }
      );
      renderInvestorPie(pieInvRef.current, investorRows, {
        t,
        onStockClick: onBrowseOverviewStock,
      });
    } else if (selectedStock && graphStRef.current && pieStRef.current && chartStRef.current) {
      stopSim.current = renderStockNetwork(graphStRef.current, stockRows, selectedStock, {
        typeLabel,
        t,
        onInvestorClick: onBrowseOverviewInvestor,
        onStockClick: onBrowseOverviewStock,
        onTableFocusChange: setDetailStockHolderKey,
      });
      renderStockPie(pieStRef.current, stockRows, {
        t,
        onInvestorClick: onBrowseOverviewInvestor,
      });
      injectAdvancedChart(chartStRef.current, `IDX:${selectedStock}`, 420);
    } else if (
      selectedGroupId &&
      selectedGroupMeta &&
      graphGrpRef.current &&
      pieGrpRef.current
    ) {
      stopSim.current = renderGroupNetwork(graphGrpRef.current, {
        groupLabel: selectedGroupMeta.label,
        members: selectedGroupMeta.members,
        groupRows,
        allRows: rows,
        typeLabel,
        t,
        onInvestorClick: (name) => {
          setSp(new URLSearchParams({ investor: name }));
          setSelectedInvestor(name);
          setSelectedStock(null);
          setSelectedGroupId(null);
        },
        onStockClick: (code) => {
          setSp(new URLSearchParams({ stock: code }));
          setSelectedStock(code);
          setSelectedInvestor(null);
          setSelectedGroupId(null);
        },
        onGroupHubClick: () => {
          if (selectedGroupId) onBrowseOverviewGroup(selectedGroupId);
        },
        onTableFocusChange: setDetailGroupTableFilter,
      });
      renderGroupPie(pieGrpRef.current, groupRows, {
        t,
        onStockClick: (code) => {
          setSp(new URLSearchParams({ stock: code }));
          setSelectedStock(code);
          setSelectedInvestor(null);
          setSelectedGroupId(null);
        },
      });
    }

    return () => {
      stopSim.current?.();
      stopSim.current = null;
    };
  }, [
    selectedInvestor,
    selectedStock,
    selectedGroupId,
    selectedGroupMeta,
    groupRows,
    state.status,
    investorRows,
    stockRows,
    rows,
    typeLabel,
    t,
    setSp,
    onBrowseOverviewStock,
    onBrowseOverviewInvestor,
    onBrowseOverviewGroup,
  ]);

  useLayoutEffect(() => {
    stopBrowseOverview.current?.();
    stopBrowseOverview.current = null;
    if (state.status !== 'ready') return;
    if (selectedInvestor || selectedStock || selectedGroupId) return;
    const el = browseOverviewRef.current;
    if (!el) return;
    stopBrowseOverview.current = renderExplorerBrowseGraph(searchMode, el, {
      rows,
      invMap,
      stockMap,
      groups,
      t,
      onInvestorClick: onBrowseOverviewInvestor,
      onStockClick: onBrowseOverviewStock,
      onGroupClick: onBrowseOverviewGroup,
    });
    return () => {
      stopBrowseOverview.current?.();
      stopBrowseOverview.current = null;
    };
  }, [
    state.status,
    rows,
    invMap,
    stockMap,
    groups,
    searchMode,
    selectedInvestor,
    selectedStock,
    selectedGroupId,
    t,
    onBrowseOverviewStock,
    onBrowseOverviewInvestor,
    onBrowseOverviewGroup,
  ]);

  useLayoutEffect(() => {
    const leg = groupLegendRef.current;
    if (!leg) return;
    if (!selectedGroupId || !selectedGroupMeta) {
      leg.innerHTML = '';
      return;
    }
    leg.innerHTML = `<div class="network-legend"><strong>${esc(t('group_net_legend_title'))}</strong>
<div class="network-legend-line"><span class="swatch hub" aria-hidden="true"></span><span>${esc(t('group_net_legend_hub'))}</span></div>
<div class="network-legend-line"><span class="swatch member" aria-hidden="true"></span><span>${esc(t('group_net_legend_member'))}</span></div>
<div class="network-legend-line"><span class="swatch stock" aria-hidden="true"></span><span>${esc(t('group_net_legend_stock'))}</span></div>
<div class="network-legend-line"><span style="flex-shrink:0;width:12px"></span><span>${esc(t('group_net_legend_links'))}</span></div></div>`;
    return () => {
      leg.innerHTML = '';
    };
  }, [selectedGroupId, selectedGroupMeta, t]);

  const browseData = useMemo(() => {
    if (state.status !== 'ready') return [];
    if (searchMode === 'group') {
      if (!groups?.length) return [];
      return groups.map((g) => ({
        key: g.id,
        label: g.label,
        member_count: g.member_count,
        total_stocks: g.total_stocks,
        confidence: g.confidence ?? '—',
      }));
    }
    if (searchMode === 'investor') {
      return [...invMap.entries()].map(([name, rws]) => {
        const sortedPct = [...rws].sort((a, b) => b.percentage - a.percentage);
        const top = sortedPct[0];
        const topLines = sortedPct.slice(0, 4).map((r) => `${r.share_code}: ${formatPct(r.percentage)}`);
        let otherBlock = '';
        if (top) {
          const others =
            stockMap
              .get(top.share_code)
              ?.rows.filter((r) => r.investor_name !== name)
              .sort((a, b) => b.percentage - a.percentage)
              .slice(0, 5) ?? [];
          if (others.length) {
            otherBlock = `\n${t('browse_tt_other_holders')}\n${others
              .map((o) => {
                const nm =
                  o.investor_name.length > 46 ? `${o.investor_name.slice(0, 44)}…` : o.investor_name;
                return `${nm}: ${formatPct(o.percentage)}`;
              })
              .join('\n')}`;
          }
        }
        const totalShares = rws.reduce((s, r) => s + r.total_holding_shares, 0);
        const browseRowHint = [
          name,
          `${t('col_stocks')}: ${rws.length}`,
          `${t('col_total_shares')}: ${formatInt(totalShares)}`,
          top ? `${t('browse_tt_largest')}: ${top.share_code} (${formatPct(top.percentage)})` : '',
          topLines.length ? `${t('browse_tt_top_positions')}:\n${topLines.join('\n')}` : '',
          otherBlock,
        ]
          .filter(Boolean)
          .join('\n');
        return {
          key: name,
          name,
          stocks: rws.length,
          totalShares,
          type: [...new Set(rws.map((r) => r.investor_type).filter(Boolean))].join(', '),
          localForeign: [
            ...new Set(rws.map((r) => r.local_foreign).filter(Boolean)),
          ]
            .map((v) => (v === 'L' ? 'Local' : 'Foreign'))
            .join(', '),
          browseRowHint,
        };
      });
    }
    if (searchMode === 'stock') {
      return [...stockMap.entries()].map(([code, s]) => {
        const sorted = [...s.rows].sort((a, b) => b.percentage - a.percentage);
        const th = sorted[0];
        const topLines = sorted.slice(0, 6).map((r) => {
          const nm =
            r.investor_name.length > 42 ? `${r.investor_name.slice(0, 40)}…` : r.investor_name;
          return `${nm}: ${formatPct(r.percentage)}`;
        });
        const totalShares = s.rows.reduce((sum, r) => sum + r.total_holding_shares, 0);
        const browseRowHint = [
          `${code} — ${s.issuer}`,
          `${t('stat_major_holders')}: ${s.rows.length}`,
          `${t('col_total_shares')}: ${formatInt(totalShares)}`,
          th ? `${t('stat_largest_holder')}: ${th.investor_name} (${formatPct(th.percentage)})` : '',
          sorted.length ? `${t('browse_tt_top_holders')}:\n${topLines.join('\n')}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        return {
          key: code,
          code,
          issuer: s.issuer,
          holders: s.rows.length,
          totalShares,
          topHolder: s.rows.reduce((a, b) => (a.percentage > b.percentage ? a : b)).investor_name,
          browseRowHint,
        };
      });
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
  }, [state.status, rows, invMap, stockMap, searchMode, groups, t]);

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
    if (searchMode === 'group') {
      return browseData.filter((r) => {
        const row = r as { label?: string; key?: string };
        return (
          String(row.label ?? '')
            .toLowerCase()
            .includes(qq) ||
          String(row.key ?? '')
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
    if (searchMode === 'group') {
      return (groups ?? [])
        .filter((g) => g.label.toLowerCase().includes(qq) || g.id.toLowerCase().includes(qq))
        .slice(0, 12)
        .map((g) => g.id);
    }
    return state.status === 'ready'
      ? state.domicileList.filter((n) => n.toLowerCase().includes(qq)).slice(0, 12)
      : [];
  }, [q, searchMode, state, stockMap, groups]);

  function clearDetail() {
    setSelectedInvestor(null);
    setSelectedStock(null);
    setSelectedGroupId(null);
    setDetailStockHolderKey(null);
    setDetailInvestorStockKey(null);
    setDetailGroupTableFilter(null);
    setSp(new URLSearchParams());
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <section id="page-explorer" className="page-section page-active">
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
      <section id="page-explorer" className="page-section page-active">
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

  if (selectedGroupId && groups === null) {
    return (
      <section id="page-explorer" className="page-section page-active">
        <div className="page-content">
          <div className="widget-placeholder">
            <div className="spinner" />
            <p style={{ marginTop: 12, color: 'var(--text-muted)' }}>{t('group_loading')}</p>
          </div>
        </div>
      </section>
    );
  }

  if (selectedGroupId && groups && !selectedGroupMeta) {
    return (
      <section id="page-explorer" className="page-section page-active">
        <div className="page-content">
          <button type="button" className="investor-back" onClick={clearDetail}>
            {t('back_to_search')}
          </button>
          <p style={{ marginTop: 24, color: 'var(--text-muted)' }}>{t('group_not_found')}</p>
        </div>
      </section>
    );
  }

  if (selectedGroupId && selectedGroupMeta) {
    return (
      <section id="page-explorer" className="page-section page-active">
        <div className="page-content">
          <div className="dashboard visible" id="dashboard-group">
            <button type="button" className="investor-back" onClick={clearDetail}>
              {t('back_to_search')}
            </button>
            <div className="investor-header">
              <div className="stock-logo-wrap">
                <div className="investor-avatar">{selectedGroupMeta.label.slice(0, 2).toUpperCase()}</div>
                <div>
                  <h2>{esc(selectedGroupMeta.label)}</h2>
                  {selectedGroupMeta.confidence ? (
                    <div className="sub">
                      <span className={`confidence ${selectedGroupMeta.confidence}`}>
                        {selectedGroupMeta.confidence}
                      </span>
                      {' · '}
                      {formatInt(selectedGroupMeta.member_count)} {t('members')} ·{' '}
                      {formatInt(selectedGroupMeta.total_stocks)} {t('stocks')}
                    </div>
                  ) : (
                    <div className="sub">
                      {formatInt(selectedGroupMeta.member_count)} {t('members')} ·{' '}
                      {formatInt(selectedGroupMeta.total_stocks)} {t('stocks')}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="top-row top-row--explorer-graph-full">
              <div className="card card--graph">
                <div className="card-title">{t('group_network_title')}</div>
                <div id="group-graph-container" ref={graphGrpRef} style={{ minHeight: 'min(92vh, 940px)' }} />
                <div className="legend" id="group-legend" ref={groupLegendRef} />
              </div>
              <div className="card">
                <div className="card-title">{t('group_portfolio_alloc')}</div>
                <div className="pie-inner" id="group-pie-container" ref={pieGrpRef} />
              </div>
            </div>
            <InvestorHoldingsTable rows={groupTableRows} t={t} typeLabel={typeLabel} showHolderColumn />
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
            <div className="top-row top-row--explorer-graph-full">
              <div className="card card--graph">
                <div className="card-title">{t('ownership_network')}</div>
                <div id="graph-container" ref={graphInvRef} style={{ minHeight: 680 }} />
                <div className="legend" id="legend" />
              </div>
              <div className="card">
                <div className="card-title">{t('portfolio_alloc')}</div>
                <div className="pie-inner" id="pie-container" ref={pieInvRef} />
              </div>
            </div>
            <InvestorHoldingsTable rows={investorTableRows} t={t} typeLabel={typeLabel} />
          </div>
        </div>
      </section>
    );
  }

  if (selectedStock) {
    const meta = stockMap.get(selectedStock);
    const ffRow =
      ffState.status === 'ready' ? ffState.byCode.get(selectedStock) : undefined;
    const ffAsOf = ffState.status === 'ready' ? ffState.payload.as_of : null;
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
            <div
              className="card explorer-free-float-card"
              style={{ marginBottom: 20 }}
              data-tip={t('tip_free_float_card')}
            >
              <div className="card-title">{t('explorer_free_float_title')}</div>
              {ffState.status === 'loading' || ffState.status === 'idle' ? (
                <div className="widget-placeholder" style={{ minHeight: 48 }}>
                  <div className="spinner" />
                </div>
              ) : ffState.status === 'error' ? (
                <p style={{ opacity: 0.85, fontSize: 14 }}>{t('free_float_failed_msg')}</p>
              ) : !ffRow ? (
                <p style={{ opacity: 0.85, fontSize: 14 }}>{t('explorer_free_float_no_row')}</p>
              ) : (
                <div className="explorer-free-float-grid">
                  <div>
                    <div className="explorer-ff-label">{t('col_free_float_pct')}</div>
                    <div className="explorer-ff-value">{formatPct(ffRow.free_float_pct)}</div>
                  </div>
                  <div>
                    <div className="explorer-ff-label">{t('col_free_float_shares')}</div>
                    <div className="explorer-ff-value">{formatInt(ffRow.free_float_shares)}</div>
                  </div>
                  <div>
                    <div className="explorer-ff-label">{t('col_free_float_holders')}</div>
                    <div className="explorer-ff-value">{formatInt(ffRow.free_float_holders)}</div>
                  </div>
                  <div>
                    <div className="explorer-ff-label">{t('col_compliance')}</div>
                    <div className="explorer-ff-value">{esc(ffRow.compliance_status || '—')}</div>
                  </div>
                  {ffAsOf ? (
                    <div className="explorer-ff-asof">
                      {t('free_float_as_of')} {ffAsOf}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="top-row top-row--explorer-graph-full">
              <div className="card card--graph">
                <div className="card-title">{t('holder_network')}</div>
                <div id="stock-graph-container" ref={graphStRef} style={{ minHeight: 680 }} />
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
            <StockHoldersTable rows={stockTableRows} t={t} typeLabel={typeLabel} />
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
                        : searchMode === 'domicile'
                          ? t('search_domicile')
                          : t('search_group')
                }
                autoComplete="off"
                aria-label="Search"
              />
            </div>
            <div className="search-tabs" role="tablist">
              {(['investor', 'stock', 'nationality', 'domicile', 'group'] as const).map((m) => (
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
                    else if (m === 'group') setBrowseSort({ key: 'member_count', asc: false });
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
                      } else if (searchMode === 'group') {
                        setSp(new URLSearchParams({ group: item }));
                        setSelectedGroupId(item);
                      } else if (searchMode === 'nationality') {
                        navigate('/holdings', { state: { filterNationality: item } });
                      } else {
                        navigate('/holdings', { state: { filterDomicile: item } });
                      }
                      setQ('');
                    }}
                  >
                    {searchMode === 'group'
                      ? groups?.find((g) => g.id === item)?.label ?? item
                      : item}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="card card--graph explorer-browse-overview" aria-labelledby="explorer-overview-title">
          <div className="explorer-browse-overview-head">
            <h3 id="explorer-overview-title" className="explorer-browse-overview-title">
              {t(explorerNetTitleKey[searchMode])}
            </h3>
          </div>
          <div
            className="explorer-browse-overview-graph"
            ref={browseOverviewRef}
            role="img"
            aria-label={t(explorerNetTitleKey[searchMode])}
          />
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
                      : searchMode === 'domicile'
                        ? t('browse_domiciles')
                        : t('browse_groups')}
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
              onPickGroup={(id) => {
                setSp(new URLSearchParams({ group: id }));
                setSelectedGroupId(id);
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
  onPickGroup,
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
  onPickGroup: (id: string) => void;
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
        : mode === 'group'
          ? [
              { key: 'label', label: t('col_group'), num: false },
              { key: 'member_count', label: t('members'), num: true },
              { key: 'total_stocks', label: t('col_stocks'), num: true },
              { key: 'confidence', label: t('col_confidence'), num: false },
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
                  title={
                    (mode === 'investor' || mode === 'stock') &&
                    typeof (row as { browseRowHint?: string }).browseRowHint === 'string'
                      ? (row as { browseRowHint: string }).browseRowHint
                      : undefined
                  }
                  onClick={() => {
                    if (mode === 'investor') onPickInvestor(String(row.name));
                    else if (mode === 'stock') onPickStock(String(row.code));
                    else if (mode === 'group') onPickGroup(String(row.key));
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
                    if (mode === 'group' && c.key === 'label') {
                      return (
                        <td key={c.key} title={String(row.key ?? '')}>
                          {String(v ?? '—')}
                        </td>
                      );
                    }
                    if (mode === 'investor' && c.key === 'type') {
                      const raw = String(v ?? '—');
                      const parts = raw === '—' ? [] : raw.split(',').map((s) => s.trim()).filter(Boolean);
                      return (
                        <td key={c.key} className="cell-types" title={raw}>
                          <div className="explorer-type-cell">
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
                          </div>
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

const INV_HOLDER_COL = {
  key: 'investor_name' as const,
  lk: 'col_investor_name' as const,
  tip: 'investor_name' as const,
  numeric: false as const,
};

const INV_DETAIL_COLS_BASE = [
  { key: 'share_code' as const, lk: 'col_ticker' as const, tip: 'share_code', numeric: false },
  { key: 'issuer_name' as const, lk: 'col_issuer' as const, tip: 'issuer_name', numeric: false },
  { key: 'investor_type' as const, lk: 'col_type' as const, tip: 'investor_type', numeric: false },
  { key: 'local_foreign' as const, lk: 'col_lf' as const, tip: 'local_foreign', numeric: false },
  { key: 'total_holding_shares' as const, lk: 'col_total_shares' as const, tip: 'total_holding_shares', numeric: true },
  { key: 'percentage' as const, lk: 'col_stake_pct' as const, tip: 'percentage', numeric: true },
];

function InvestorHoldingsTable({
  rows,
  t,
  typeLabel,
  showHolderColumn,
}: {
  rows: HolderRow[];
  t: (k: string) => string;
  typeLabel: (tp: string) => string;
  showHolderColumn?: boolean;
}) {
  const [sort, setSort] = useState<{ key: keyof HolderRow; asc: boolean }>({
    key: 'percentage',
    asc: false,
  });
  const detailCols = useMemo(
    () => (showHolderColumn ? [INV_HOLDER_COL, ...INV_DETAIL_COLS_BASE] : INV_DETAIL_COLS_BASE),
    [showHolderColumn]
  );
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      const aEmpty = va === '' || va == null;
      const bEmpty = vb === '' || vb == null;
      let cmp = 0;
      if (aEmpty && bEmpty) cmp = 0;
      else if (aEmpty) cmp = 1;
      else if (bEmpty) cmp = -1;
      else if (typeof va === 'string' && typeof vb === 'string') {
        cmp = va.localeCompare(vb);
      } else {
        cmp = (Number(va) || 0) - (Number(vb) || 0);
      }
      const primary = sort.asc ? cmp : -cmp;
      if (primary !== 0) return primary;
      const sc = a.share_code.localeCompare(b.share_code);
      if (sc !== 0) return sc;
      return a.investor_name.localeCompare(b.investor_name);
    });
  }, [rows, sort]);
  return (
    <div className="table-card">
      <div className="card-title">{t('holdings_detail')}</div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {detailCols.map((c) => (
                <th
                  key={c.key}
                  className={c.numeric ? 'num' : undefined}
                  style={{ cursor: 'pointer' }}
                  data-tip={t(`col_tips.${c.tip}`, { defaultValue: '' }) || t('tip_table_sort_column')}
                  onClick={() =>
                    setSort((prev) =>
                      prev.key === c.key
                        ? { key: c.key, asc: !prev.asc }
                        : { key: c.key, asc: c.numeric ? false : true }
                    )
                  }
                >
                  <span className="th-inner">
                    <span className="th-label">{t(c.lk)}</span>
                    {sort.key === c.key ? (
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
            {sorted.map((r) => {
              const typeTip = r.investor_type
                ? t(`type_tips.${r.investor_type}`, { defaultValue: '' })
                : '';
              return (
                <tr key={`${r.investor_name}::${r.share_code}`}>
                  {showHolderColumn ? (
                    <td>
                      <Link
                        className="table-text-link"
                        to={`/explorer?investor=${encodeURIComponent(r.investor_name)}`}
                      >
                        {esc(r.investor_name)}
                      </Link>
                    </td>
                  ) : null}
                  <td>
                    <Link
                      className="table-text-link td-ticker"
                      to={`/explorer?stock=${encodeURIComponent(r.share_code)}`}
                    >
                      {esc(r.share_code)}
                    </Link>
                  </td>
                  <td>{esc(r.issuer_name)}</td>
                  <td>
                    {r.investor_type ? (
                      <span
                        className="type-badge"
                        data-tip={typeTip || undefined}
                        style={{
                          background: `${TYPE_COLORS[r.investor_type] ?? '#444'}22`,
                          color: TYPE_COLORS[r.investor_type] ?? '#888',
                        }}
                      >
                        {typeLabel(r.investor_type) || r.investor_type}
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
                  <td className="num">{formatInt(r.total_holding_shares)}</td>
                  <td className="num">{formatPct(r.percentage)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const STOCK_HOLDER_COLS = [
  { key: 'investor_name' as const, lk: 'col_investor_name' as const, tip: 'investor_name', numeric: false },
  { key: 'investor_type' as const, lk: 'col_type' as const, tip: 'investor_type', numeric: false },
  { key: 'local_foreign' as const, lk: 'col_lf' as const, tip: 'local_foreign', numeric: false },
  { key: 'total_holding_shares' as const, lk: 'col_total_shares' as const, tip: 'total_holding_shares', numeric: true },
  { key: 'percentage' as const, lk: 'col_stake_pct' as const, tip: 'percentage', numeric: true },
];

function StockHoldersTable({
  rows,
  t,
  typeLabel,
}: {
  rows: HolderRow[];
  t: (k: string) => string;
  typeLabel: (tp: string) => string;
}) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: keyof HolderRow; asc: boolean }>({
    key: 'percentage',
    asc: false,
  });
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      const aEmpty = va === '' || va == null;
      const bEmpty = vb === '' || vb == null;
      let cmp = 0;
      if (aEmpty && bEmpty) cmp = 0;
      else if (aEmpty) cmp = 1;
      else if (bEmpty) cmp = -1;
      else if (typeof va === 'string' && typeof vb === 'string') {
        cmp = va.localeCompare(vb);
      } else {
        cmp = (Number(va) || 0) - (Number(vb) || 0);
      }
      const primary = sort.asc ? cmp : -cmp;
      if (primary !== 0) return primary;
      return a.investor_name.localeCompare(b.investor_name);
    });
  }, [rows, sort]);
  return (
    <div className="table-card">
      <div className="card-title">{t('major_shareholders')}</div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {STOCK_HOLDER_COLS.map((c) => (
                <th
                  key={c.key}
                  className={c.numeric ? 'num' : undefined}
                  style={{ cursor: 'pointer' }}
                  data-tip={t(`col_tips.${c.tip}`, { defaultValue: '' }) || t('tip_table_sort_column')}
                  onClick={() =>
                    setSort((prev) =>
                      prev.key === c.key
                        ? { key: c.key, asc: !prev.asc }
                        : { key: c.key, asc: c.numeric ? false : true }
                    )
                  }
                >
                  <span className="th-inner">
                    <span className="th-label">{t(c.lk)}</span>
                    {sort.key === c.key ? (
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
            {sorted.map((r) => {
              const typeTip = r.investor_type
                ? t(`type_tips.${r.investor_type}`, { defaultValue: '' })
                : '';
              return (
                <tr key={r.investor_name}>
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
                        data-tip={typeTip || undefined}
                        style={{
                          background: `${TYPE_COLORS[r.investor_type] ?? '#444'}22`,
                          color: TYPE_COLORS[r.investor_type] ?? '#888',
                        }}
                      >
                        {typeLabel(r.investor_type) || r.investor_type}
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
                  <td className="num">{formatInt(r.total_holding_shares)}</td>
                  <td className="num">{formatPct(r.percentage)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
