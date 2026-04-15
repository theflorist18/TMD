import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  authorizedFetch,
  intelGroupCandidatesUrl,
  intelGroupsUrl,
  intelProfilesUrl,
} from '@/api/client';
import { formatInt, esc } from '@/lib/format';
import type { IntelProfile } from '@/charts/intelCharts';
import { renderIntelCharts } from '@/charts/intelCharts';
import { IconSearch } from '@/components/Icons';

type IntelGroup = {
  id: string;
  label: string;
  member_count: number;
  total_stocks: number;
  total_pct_sum: number;
  confidence: string;
  detection_method?: string;
  members: string[];
};

export function IntelligencePage() {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<IntelProfile[] | null>(null);
  const [groups, setGroups] = useState<IntelGroup[] | null>(null);
  const [groupsFromCandidates, setGroupsFromCandidates] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [gq, setGq] = useState('');
  const [view, setView] = useState<'directory' | 'groups'>('directory');

  const typeLabel = useCallback((code: string) => t(`type_labels.${code}`) || code, [t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pResp, gResp] = await Promise.all([
          authorizedFetch(intelProfilesUrl()),
          authorizedFetch(intelGroupsUrl()),
        ]);
        if (!pResp.ok || !gResp.ok) throw new Error(t('failed_intel'));
        const p = (await pResp.json()) as IntelProfile[];
        let g = (await gResp.json()) as IntelGroup[];
        let fromCandidates = false;
        if (!Array.isArray(g) || g.length === 0) {
          const cResp = await authorizedFetch(intelGroupCandidatesUrl());
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
          .includes(qq)
    );
  }, [profiles, q]);

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
              <div className="table-scroll" style={{ maxHeight: 560 }}>
                <table>
                  <thead>
                    <tr>
                      <th>{t('tab_investor')}</th>
                      <th>{t('col_class')}</th>
                      <th>{t('col_lf')}</th>
                      <th>{t('tab_nationality')}</th>
                      <th className="num">{t('col_stocks')}</th>
                      <th className="num">{t('col_avg_pct')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProfiles.slice(0, 200).map((p) => (
                      <tr key={p.name}>
                        <td>
                          <Link
                            className="table-text-link"
                            to={`/explorer?investor=${encodeURIComponent(p.name)}`}
                          >
                            {esc(p.name)}
                          </Link>
                        </td>
                        <td>{esc(p.classification ?? '')}</td>
                        <td>
                          {p.local_foreign === 'L'
                            ? t('local')
                            : p.local_foreign === 'F'
                              ? t('foreign')
                              : '—'}
                        </td>
                        <td>{esc(p.nationality ?? '—')}</td>
                        <td className="num">{formatInt(p.portfolio_size ?? 0)}</td>
                        <td className="num">
                          {typeof p.avg_pct === 'number' ? `${p.avg_pct.toFixed(2)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
