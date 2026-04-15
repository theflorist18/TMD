import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  fetchDataset,
  intelGroupCandidatesUrl,
  intelGroupsUrl,
  intelProfilesUrl,
} from '@/api/client';
import { formatInt, esc, formatPct } from '@/lib/format';
import type { IntelGroup } from '@/domain/intelGroups';
import { getPaginationRange } from '@/lib/pagination';
import type { IntelProfile } from '@/charts/intelCharts';
import { renderIntelCharts } from '@/charts/intelCharts';
import { IconSearch, IconSortAsc, IconSortDesc } from '@/components/Icons';

const INTEL_DIR_COLS = [
  { key: 'name', lk: 'tab_investor', tk: 'investor', numeric: false },
  { key: 'classification', lk: 'col_class', tk: 'classification', numeric: false },
  { key: 'local_foreign', lk: 'col_lf', tk: 'lf', numeric: false },
  { key: 'nationality', lk: 'tab_nationality', tk: 'nat', numeric: false },
  { key: 'portfolio_size', lk: 'col_stocks', tk: 'portfolio_size', numeric: true },
  { key: 'avg_pct', lk: 'col_avg_pct', tk: 'avg_pct', numeric: true },
  { key: 'group_id', lk: 'col_group', tk: 'group_id', numeric: false },
] as const;

function classificationSlug(classification?: string): string {
  const s = (classification || 'other').trim().toLowerCase().replace(/\s+/g, '_');
  return s.replace(/[^a-z0-9_]/g, '') || 'other';
}

function groupLabelFor(groups: IntelGroup[], gid?: string): string {
  if (!gid) return '';
  const g = groups.find((x) => x.id === gid);
  return g?.label ?? gid;
}

export function IntelligencePage() {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<IntelProfile[] | null>(null);
  const [groups, setGroups] = useState<IntelGroup[] | null>(null);
  const [groupsFromCandidates, setGroupsFromCandidates] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [gq, setGq] = useState('');
  const [view, setView] = useState<'directory' | 'groups'>('directory');
  const [dirSort, setDirSort] = useState<{ key: string; asc: boolean }>({
    key: 'portfolio_size',
    asc: false,
  });
  const [dirPage, setDirPage] = useState(1);
  const [dirPageSize, setDirPageSize] = useState(25);

  const typeLabel = useCallback((code: string) => t(`type_labels.${code}`) || code, [t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pResp, gResp] = await Promise.all([
          fetchDataset(intelProfilesUrl()),
          fetchDataset(intelGroupsUrl()),
        ]);
        if (!pResp.ok || !gResp.ok) throw new Error(t('failed_intel'));
        const p = (await pResp.json()) as IntelProfile[];
        let g = (await gResp.json()) as IntelGroup[];
        let fromCandidates = false;
        if (!Array.isArray(g) || g.length === 0) {
          const cResp = await fetchDataset(intelGroupCandidatesUrl());
          if (cResp.ok) {
            const cg = (await cResp.json()) as IntelGroup[];
            if (Array.isArray(cg) && cg.length > 0) {
              g = cg;
              fromCandidates = true;
            }
          }
        }
        if (!cancelled) {
          setProfiles(p);
          setGroups(g);
          setGroupsFromCandidates(fromCandidates);
        }
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!profiles?.length) return;
    ['intelChartType', 'intelChartLF', 'intelChartNat'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
    renderIntelCharts(profiles, { t, typeLabel });
  }, [profiles, t, typeLabel]);

  const stats = useMemo(() => {
    if (!profiles?.length) return null;
    const total = profiles.length;
    const gct = groups?.length ?? 0;
    const avgPort =
      total > 0
        ? (profiles.reduce((s, p) => s + (p.portfolio_size ?? 0), 0) / total).toFixed(1)
        : '0';
    const natCounts: Record<string, number> = {};
    profiles.forEach((p) => {
      if (p.nationality) natCounts[p.nationality] = (natCounts[p.nationality] || 0) + 1;
    });
    const topNat = Object.entries(natCounts).sort((a, b) => b[1] - a[1])[0];
    return { total, gct, avgPort, topNat };
  }, [profiles, groups]);

  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    const qq = q.trim().toLowerCase();
    if (!qq) return profiles;
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(qq) ||
        (p.nationality ?? '').toLowerCase().includes(qq) ||
        String(p.domicile ?? '')
          .toLowerCase()
          .includes(qq) ||
        (p.group_id ?? '').toLowerCase().includes(qq)
    );
  }, [profiles, q]);

  const dirSorted = useMemo(() => {
    const col = INTEL_DIR_COLS.find((c) => c.key === dirSort.key) ?? INTEL_DIR_COLS[4];
    const { key, asc } = dirSort;
    return [...filteredProfiles].sort((a, b) => {
      let va: string | number = (a as Record<string, string | number | undefined>)[key] as never;
      let vb: string | number = (b as Record<string, string | number | undefined>)[key] as never;
      if (va == null || va === '') va = col.numeric ? -Infinity : 'zzz';
      if (vb == null || vb === '') vb = col.numeric ? -Infinity : 'zzz';
      const cmp = col.numeric
        ? (Number(va) || 0) - (Number(vb) || 0)
        : String(va).localeCompare(String(vb));
      return asc ? cmp : -cmp;
    });
  }, [filteredProfiles, dirSort]);

  const dirSlice = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(dirSorted.length / dirPageSize));
    const p = Math.min(dirPage, totalPages);
    const start = (p - 1) * dirPageSize;
    return {
      page: p,
      totalPages,
      start,
      rows: dirSorted.slice(start, start + dirPageSize),
      total: dirSorted.length,
    };
  }, [dirSorted, dirPage, dirPageSize]);

  useEffect(() => {
    setDirPage(1);
  }, [q]);

  useEffect(() => {
    setDirPage(1);
  }, [dirSort]);

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    const qq = gq.trim().toLowerCase();
    if (!qq) return groups;
    return groups.filter((g) => g.label.toLowerCase().includes(qq));
  }, [groups, gq]);

  if (err) {
    return (
      <section id="page-intelligence" className="page-section page-active">
        <div className="page-content">
          <div className="error-banner">
            <h3>{t('failed_intel')}</h3>
            <p>{esc(err)}</p>
          </div>
        </div>
      </section>
    );
  }

  if (!profiles || !groups) {
    return (
      <section id="page-intelligence" className="page-section page-active">
        <div className="page-content">
          <div className="widget-placeholder">
            <div className="spinner" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="page-intelligence" className="page-section page-active">
      <div className="page-content">
        <div className="intel-header">
          <h2>{t('intel_title')}</h2>
          <p>{t('intel_sub')}</p>
        </div>

        {groupsFromCandidates ? (
          <div className="intel-notice" role="status">
            {t('intel_groups_heuristic_notice')}
          </div>
        ) : null}

        {stats ? (
          <div className="intel-stats" id="intelStats">
            <div className="intel-stat-card">
              <div className="stat-label">{t('stat_total_investors')}</div>
              <div className="stat-value">{formatInt(stats.total)}</div>
              <div className="stat-sub">{t('sub_unique_gt1')}</div>
            </div>
            <div className="intel-stat-card">
              <div className="stat-label">{t('stat_groups_detected')}</div>
              <div className="stat-value">{formatInt(stats.gct)}</div>
              <div className="stat-sub">{t('sub_conglomerates')}</div>
            </div>
            <div className="intel-stat-card">
              <div className="stat-label">{t('stat_avg_portfolio')}</div>
              <div className="stat-value">{stats.avgPort}</div>
              <div className="stat-sub">{t('sub_stocks_per')}</div>
            </div>
            <div className="intel-stat-card">
              <div className="stat-label">{t('stat_top_nat')}</div>
              <div className="stat-value" style={{ fontSize: 20, letterSpacing: 0 }}>
                {stats.topNat ? esc(stats.topNat[0]) : 'N/A'}
              </div>
              <div className="stat-sub">
                {stats.topNat ? `${formatInt(stats.topNat[1])} ${t('investors')}` : ''}
              </div>
            </div>
          </div>
        ) : null}

        <div className="intel-charts-row">
          <div className="intel-chart-card">
            <div className="card-title">{t('by_investor_type')}</div>
            <div className="intel-chart-body" id="intelChartType" />
          </div>
          <div className="intel-chart-card">
            <div className="card-title">{t('local_vs_foreign')}</div>
            <div className="intel-chart-body" id="intelChartLF" />
          </div>
          <div className="intel-chart-card">
            <div className="card-title">{t('top_nationalities')}</div>
            <div className="intel-chart-body" id="intelChartNat" />
          </div>
        </div>

        <div className="intel-view-toggle" role="tablist">
          <button
            type="button"
            className={`intel-view-btn${view === 'directory' ? ' active' : ''}`}
            onClick={() => setView('directory')}
          >
            {t('investor_directory')}
          </button>
          <button
            type="button"
            className={`intel-view-btn${view === 'groups' ? ' active' : ''}`}
            onClick={() => setView('groups')}
          >
            {t('group_analysis')}
          </button>
        </div>

        {view === 'directory' ? (
          <>
            <div className="intel-search-bar">
              <div className="search-field">
                <span className="search-icon" aria-hidden>
                  <IconSearch />
                </span>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('search_intel')}
                  aria-label="Search investors"
                />
              </div>
            </div>
            <div className="table-card">
              <div className="table-scroll">
                <table>
                  <thead id="intelDirectoryHead">
                    <tr>
                      {INTEL_DIR_COLS.map((col) => {
                        const tip = t(`col_tips.${col.tk}`, { defaultValue: '' });
                        return (
                          <th
                            key={col.key}
                            data-col={col.key}
                            data-tip={tip || undefined}
                            className={col.numeric ? 'num' : undefined}
                            style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                            onClick={() => {
                              setDirSort((prev) =>
                                prev.key === col.key
                                  ? { key: col.key, asc: !prev.asc }
                                  : { key: col.key, asc: col.numeric ? false : true }
                              );
                            }}
                          >
                            <span className="th-inner">
                              <span className="th-label">{t(col.lk)}</span>
                              {dirSort.key === col.key ? (
                                <span className="th-sort" aria-hidden>
                                  {dirSort.asc ? <IconSortAsc /> : <IconSortDesc />}
                                </span>
                              ) : null}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody id="intelDirectoryBody">
                    {dirSlice.total === 0 ? (
                      <tr>
                        <td colSpan={INTEL_DIR_COLS.length} style={{ textAlign: 'center', padding: 40 }}>
                          {t('no_investors_match')}
                        </td>
                      </tr>
                    ) : (
                      dirSlice.rows.map((p) => {
                        const slug = classificationSlug(p.classification);
                        const clsTip = t(`class_tips.${slug}`, { defaultValue: '' });
                        const clsTranslated = t(`class_labels.${slug}`, { defaultValue: '' });
                        const clsLabel =
                          clsTranslated ||
                          esc((p.classification || '').replace(/_/g, ' ') || '—');
                        const gLabel = groupLabelFor(groups, p.group_id);
                        return (
                          <tr key={p.name}>
                            <td>
                              <Link
                                className="table-text-link"
                                to={`/explorer?investor=${encodeURIComponent(p.name)}`}
                              >
                                {esc(p.name)}
                              </Link>
                            </td>
                            <td>
                              <span
                                className={`classification-badge ${slug}`}
                                data-tip={clsTip || undefined}
                              >
                                {clsLabel}
                              </span>
                            </td>
                            <td style={{ fontSize: 12 }}>
                              {p.local_foreign === 'L' ? (
                                <span data-tip={t('tip_local')}>{t('local')}</span>
                              ) : p.local_foreign === 'F' ? (
                                <span data-tip={t('tip_foreign')}>{t('foreign')}</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td style={{ fontSize: 12 }}>{esc(p.nationality ?? '—')}</td>
                            <td className="num">{formatInt(p.portfolio_size ?? 0)}</td>
                            <td className="num">{formatPct(typeof p.avg_pct === 'number' ? p.avg_pct : NaN)}</td>
                            <td style={{ whiteSpace: 'normal', minWidth: 140 }} title={gLabel}>
                              {gLabel ? (
                                <span className="group-tag" data-tip={t('tip_group_tag')}>
                                  {esc(gLabel)}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="pagination" id="intelPagination">
                <span className="page-info">
                  {dirSlice.total === 0
                    ? ''
                    : `${t('showing')} ${formatInt(dirSlice.start + 1)}–${formatInt(dirSlice.start + dirSlice.rows.length)} ${t('of')} ${formatInt(dirSlice.total)}`}
                </span>
                <div className="page-size-wrap">
                  <label>{t('rows_label')}</label>
                  <select
                    aria-label="Rows per page"
                    value={dirPageSize}
                    onChange={(e) => {
                      setDirPageSize(Number(e.target.value));
                      setDirPage(1);
                    }}
                  >
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="page-buttons">
                  <button
                    type="button"
                    disabled={dirSlice.page <= 1}
                    onClick={() => setDirPage(dirSlice.page - 1)}
                  >
                    « {t('prev')}
                  </button>
                  {getPaginationRange(dirSlice.page, dirSlice.totalPages).map((pg, i) =>
                    pg === '...' ? (
                      <span key={`e${i}`} className="page-ellipsis">
                        ...
                      </span>
                    ) : (
                      <button
                        key={pg}
                        type="button"
                        className={pg === dirSlice.page ? 'active' : ''}
                        onClick={() => setDirPage(pg as number)}
                      >
                        {pg}
                      </button>
                    )
                  )}
                  <button
                    type="button"
                    disabled={dirSlice.page >= dirSlice.totalPages}
                    onClick={() => setDirPage(dirSlice.page + 1)}
                  >
                    {t('next')} »
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="intel-search-bar">
              <div className="search-field">
                <span className="search-icon" aria-hidden>
                  <IconSearch />
                </span>
                <input
                  type="search"
                  value={gq}
                  onChange={(e) => setGq(e.target.value)}
                  placeholder={t('search_groups')}
                  aria-label="Search groups"
                />
              </div>
            </div>
            <h3 className="intel-section-title">
              {t('detected_groups')}{' '}
              <span className="count-badge">{filteredGroups.length}</span>
            </h3>
            <div className="intel-groups-grid">
              {filteredGroups.map((g) => (
                <div key={g.id} className="intel-group-card">
                  <div className="intel-group-card-header">
                    <h4>{esc(g.label)}</h4>
                    <span className={`confidence ${g.confidence}`}>{g.confidence}</span>
                  </div>
                  <div className="intel-group-card-stats">
                    <span>
                      <strong>{g.member_count}</strong> {t('members')}
                    </span>
                    <span>
                      <strong>{g.total_stocks}</strong> {t('stocks')}
                    </span>
                  </div>
                  <div className="intel-group-members">
                    {g.members.slice(0, 12).map((m) => (
                      <Link key={m} className="intel-group-member-chip" to={`/explorer?investor=${encodeURIComponent(m)}`}>
                        {esc(m)}
                      </Link>
                    ))}
                    {g.members.length > 12 ? <span>…</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
