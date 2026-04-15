import * as d3 from 'd3';
import type { HolderRow } from '@/domain/holders';
import type { IntelGroup } from '@/domain/intelGroups';
import { esc, formatInt } from '@/lib/format';
import { GRAPH_LINK_STROKE_SOFT } from '@/charts/d3common';
import {
  appendPanLayer,
  attachGraphResize,
  attachNetworkZoom,
  disposeGraph,
  graphInnerWidth,
  showTooltip,
  type GraphHost,
} from '@/charts/graphSurface';
import {
  DETAIL_CLICK_PIN_MS,
  DETAIL_PAN_CLICK_MAX_DIST,
  DETAIL_ZOOM_LABEL_K,
  EXPLORER_LEGEND_GROUP,
  EXPLORER_LEGEND_INV_STK,
  GRAPH_HOVER_CLEAR_MS,
  NETWORK_LINK_BASE_OPACITY,
  buildAdjacencyUndirected,
  explorerNetworkTooltipHintsHtml,
  focusNeighborSet,
  linkEndpointResolved,
  mountExplorerNetworkLegend,
  networkGraphLabelsVisible,
  networkLinkStrokeOpacity,
  networkLinkWidthFocusFactor,
  runForceSimulationStatic,
} from '@/charts/graphFocusCommon';

export const EXPLORER_BROWSE_CAP_INVESTORS = 50;
export const EXPLORER_BROWSE_CAP_STOCKS = 45;
export const EXPLORER_BROWSE_CAP_STOCK_NODES_BIPARTITE = 78;
export const EXPLORER_BROWSE_CAP_HOLDER_NODES_BIPARTITE = 85;
export const EXPLORER_BROWSE_CAP_EDGES_BIPARTITE = 420;
export const EXPLORER_BROWSE_CAP_GROUPS_TRIPARTITE = 10;
export const EXPLORER_BROWSE_CAP_MEMBERS_PER_GROUP = 8;
export const EXPLORER_BROWSE_CAP_STOCKS_PER_GROUP = 10;

export type ExplorerBrowseSearchMode =
  | 'investor'
  | 'stock'
  | 'nationality'
  | 'domicile'
  | 'group';

type OvKind = 'inv' | 'stk' | 'grp' | 'mem';

type OvNode = d3.SimulationNodeDatum & {
  id: string;
  name: string;
  kind: OvKind;
  w: number;
  groupId?: string;
};

type OvLink = d3.SimulationLinkDatum<OvNode> & { w: number; pct: number };

type LayoutMode = 'inv_stk' | 'stk_inv' | 'grp_mem_stk';

function invId(name: string) {
  return `inv:${encodeURIComponent(name)}`;
}
function stkId(code: string) {
  return `stk:${encodeURIComponent(code)}`;
}
function grpId(id: string) {
  return `grp:${encodeURIComponent(id)}`;
}
function memId(groupId: string, memberName: string) {
  return `mem:${encodeURIComponent(groupId)}:${encodeURIComponent(memberName)}`;
}
function stkGrpId(groupId: string, code: string) {
  return `stkgrp:${encodeURIComponent(groupId)}:${encodeURIComponent(code)}`;
}

function parseStockClickId(nodeId: string): string {
  if (nodeId.startsWith('stkgrp:')) {
    const rest = nodeId.slice('stkgrp:'.length);
    const i = rest.indexOf(':');
    return decodeURIComponent(rest.slice(i + 1));
  }
  return decodeURIComponent(nodeId.slice('stk:'.length));
}

function parseInvestorClickId(nodeId: string): string {
  if (nodeId.startsWith('inv:')) return decodeURIComponent(nodeId.slice(4));
  if (nodeId.startsWith('mem:')) {
    const rest = nodeId.slice('mem:'.length);
    const i = rest.indexOf(':');
    return decodeURIComponent(rest.slice(i + 1));
  }
  return nodeId;
}

function parseGroupClickId(nodeId: string): string {
  return decodeURIComponent(nodeId.slice('grp:'.length));
}

function buildInvestorBipartite(invMap: Map<string, HolderRow[]>) {
  const ranked = [...invMap.entries()]
    .map(([name, rw]) => ({ name, n: rw.length, shares: rw.reduce((s, r) => s + r.total_holding_shares, 0) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, EXPLORER_BROWSE_CAP_INVESTORS);
  const tickerCount = new Map<string, number>();
  for (const { name } of ranked) {
    const rw = invMap.get(name);
    if (!rw) continue;
    for (const row of rw) {
      tickerCount.set(row.share_code, (tickerCount.get(row.share_code) ?? 0) + 1);
    }
  }
  const topTickers = [...tickerCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, EXPLORER_BROWSE_CAP_STOCK_NODES_BIPARTITE)
    .map(([c]) => c);
  const tickerSet = new Set(topTickers);

  type RawL = { inv: string; code: string; pct: number };
  const raw: RawL[] = [];
  for (const { name } of ranked) {
    const rw = invMap.get(name);
    if (!rw) continue;
    for (const row of rw) {
      if (!tickerSet.has(row.share_code)) continue;
      raw.push({ inv: name, code: row.share_code, pct: Number.isFinite(row.percentage) ? row.percentage : 0 });
    }
  }
  raw.sort((a, b) => b.pct - a.pct);
  const picked = raw.slice(0, EXPLORER_BROWSE_CAP_EDGES_BIPARTITE);
  const invIn = new Set<string>();
  const stkIn = new Set<string>();
  for (const p of picked) {
    invIn.add(p.inv);
    stkIn.add(p.code);
  }
  const maxPct = d3.max(picked, (p) => p.pct) ?? 1;
  const links: OvLink[] = picked.map((p) => ({
    source: invId(p.inv),
    target: stkId(p.code),
    w: 1,
    pct: p.pct / maxPct,
  }));
  const nodes: OvNode[] = [];
  for (const { name, n, shares } of ranked) {
    if (!invIn.has(name)) continue;
    const deg = picked.filter((x) => x.inv === name).length;
    nodes.push({
      id: invId(name),
      name,
      kind: 'inv',
      w: Math.max(1, deg, Math.round(n)),
    });
  }
  for (const code of stkIn) {
    const deg = picked.filter((x) => x.code === code).length;
    nodes.push({
      id: stkId(code),
      name: code,
      kind: 'stk',
      w: Math.max(1, deg),
    });
  }
  return { nodes, links, layout: 'inv_stk' as LayoutMode };
}

function buildStockBipartite(stockMap: Map<string, { code: string; issuer: string; rows: HolderRow[] }>) {
  const ranked = [...stockMap.entries()]
    .map(([code, s]) => ({
      code,
      n: s.rows.length,
      shares: s.rows.reduce((a, r) => a + r.total_holding_shares, 0),
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, EXPLORER_BROWSE_CAP_STOCKS);
  const holderScore = new Map<string, number>();
  for (const { code } of ranked) {
    const s = stockMap.get(code);
    if (!s) continue;
    for (const row of s.rows) {
      const nm = row.investor_name;
      holderScore.set(nm, (holderScore.get(nm) ?? 0) + 1);
    }
  }
  const topHolders = [...holderScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, EXPLORER_BROWSE_CAP_HOLDER_NODES_BIPARTITE)
    .map(([n]) => n);
  const holderSet = new Set(topHolders);

  type RawL = { code: string; inv: string; pct: number };
  const raw: RawL[] = [];
  for (const { code } of ranked) {
    const s = stockMap.get(code);
    if (!s) continue;
    for (const row of s.rows) {
      if (!holderSet.has(row.investor_name)) continue;
      raw.push({
        code,
        inv: row.investor_name,
        pct: Number.isFinite(row.percentage) ? row.percentage : 0,
      });
    }
  }
  raw.sort((a, b) => b.pct - a.pct);
  const picked = raw.slice(0, EXPLORER_BROWSE_CAP_EDGES_BIPARTITE);
  const maxPct = d3.max(picked, (p) => p.pct) ?? 1;
  const links: OvLink[] = picked.map((p) => ({
    source: stkId(p.code),
    target: invId(p.inv),
    w: 1,
    pct: p.pct / maxPct,
  }));
  const stkUsed = new Set<string>();
  const invUsed = new Set<string>();
  for (const p of picked) {
    stkUsed.add(p.code);
    invUsed.add(p.inv);
  }
  const nodes: OvNode[] = [];
  for (const { code, n } of ranked) {
    if (!stkUsed.has(code)) continue;
    const deg = picked.filter((x) => x.code === code).length;
    nodes.push({ id: stkId(code), name: code, kind: 'stk', w: Math.max(1, deg, n) });
  }
  for (const inv of invUsed) {
    const deg = picked.filter((x) => x.inv === inv).length;
    nodes.push({ id: invId(inv), name: inv, kind: 'inv', w: Math.max(1, deg) });
  }
  return { nodes, links, layout: 'stk_inv' as LayoutMode };
}

function buildGroupTripartite(rows: HolderRow[], groups: IntelGroup[]) {
  const list = [...groups]
    .sort((a, b) => (b.member_count ?? 0) - (a.member_count ?? 0))
    .slice(0, EXPLORER_BROWSE_CAP_GROUPS_TRIPARTITE);
  const nodes: OvNode[] = [];
  const links: OvLink[] = [];
  let maxPct = 1e-6;

  for (const g of list) {
    const gid = g.id;
    nodes.push({
      id: grpId(gid),
      name: g.label,
      kind: 'grp',
      w: Math.max(1, g.member_count || 1, g.total_stocks || 1),
      groupId: gid,
    });
    const mems = g.members.slice(0, EXPLORER_BROWSE_CAP_MEMBERS_PER_GROUP);
    const memSet = new Set(mems);
    for (const m of mems) {
      nodes.push({
        id: memId(gid, m),
        name: m,
        kind: 'mem',
        w: 2,
        groupId: gid,
      });
      links.push({
        source: grpId(gid),
        target: memId(gid, m),
        w: 1,
        pct: 0.5,
      });
    }
    const tickers = new Set<string>();
    for (const r of rows) {
      if (memSet.has(r.investor_name)) tickers.add(r.share_code);
    }
    const tickList = [...tickers].slice(0, EXPLORER_BROWSE_CAP_STOCKS_PER_GROUP);
    for (const code of tickList) {
      const rowsFor = rows.filter((r) => r.share_code === code && memSet.has(r.investor_name));
      if (!rowsFor.length) continue;
      const bestRow = rowsFor.reduce((a, b) => (a.percentage >= b.percentage ? a : b));
      const pct = Number.isFinite(bestRow.percentage) ? bestRow.percentage : 0;
      maxPct = Math.max(maxPct, pct, 0.01);
      nodes.push({
        id: stkGrpId(gid, code),
        name: code,
        kind: 'stk',
        w: Math.max(1, rowsFor.length),
        groupId: gid,
      });
      links.push({
        source: memId(gid, bestRow.investor_name),
        target: stkGrpId(gid, code),
        w: 1,
        pct: Math.max(0.02, pct),
      });
    }
  }
  const norm = maxPct > 0 ? maxPct : 1;
  for (const l of links) {
    l.pct = l.pct / norm;
  }
  return { nodes, links, layout: 'grp_mem_stk' as LayoutMode };
}

function laneX(d: OvNode, width: number, layout: LayoutMode): number {
  if (layout === 'inv_stk') {
    if (d.kind === 'inv') return width * 0.22;
    return width * 0.78;
  }
  if (layout === 'stk_inv') {
    if (d.kind === 'stk') return width * 0.22;
    return width * 0.78;
  }
  if (d.kind === 'grp') return width * 0.12;
  if (d.kind === 'mem') return width * 0.48;
  return width * 0.82;
}

function laneY(d: OvNode, height: number, layout: LayoutMode): number {
  if (layout === 'stk_inv') {
    if (d.kind === 'stk') return height * 0.18;
    return height * 0.82;
  }
  return height * 0.5;
}

function browseGraphHeight() {
  return Math.min(820, Math.max(480, Math.round(typeof window !== 'undefined' ? window.innerHeight * 0.72 : 560)));
}

function fillForKind(kind: OvKind) {
  if (kind === 'inv') return 'var(--accent)';
  if (kind === 'stk') return 'var(--green)';
  if (kind === 'mem') return 'var(--accent-soft)';
  return 'var(--purple)';
}

function computeFitTransform(
  nodes: OvNode[],
  width: number,
  height: number,
  pad: number,
  rFn: (d: OvNode) => number
): d3.ZoomTransform {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of nodes) {
    const r = rFn(d);
    const x = d.x ?? 0;
    const y = d.y ?? 0;
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r);
    maxY = Math.max(maxY, y + r);
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return d3.zoomIdentity;
  const bw = maxX - minX;
  const bh = maxY - minY;
  const s = Math.min((width - 2 * pad) / bw, (height - 2 * pad) / bh, 1.35);
  const tx = (width - bw * s) / 2 - minX * s;
  const ty = (height - bh * s) / 2 - minY * s;
  return d3.zoomIdentity.translate(tx, ty).scale(s);
}

function truncateNodeLabel(name: string, maxLen: number) {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, Math.max(1, maxLen - 1))}…`;
}

function buildNeighborHint(
  nodes: OvNode[],
  links: Array<{ source: string | OvNode; target: string | OvNode }>
): Map<string, string> {
  const byId = new Map(nodes.map((n) => [n.id, n.name]));
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a)!.push(b);
  };
  for (const l of links) {
    const s = typeof l.source === 'string' ? l.source : (l.source as OvNode).id;
    const t = typeof l.target === 'string' ? l.target : (l.target as OvNode).id;
    add(s, t);
    add(t, s);
  }
  const out = new Map<string, string>();
  for (const [id, neigh] of adj) {
    const names = [...new Set(neigh.map((nid) => byId.get(nid) ?? nid))]
      .slice(0, 8)
      .map((n) => (n.length > 28 ? `${n.slice(0, 26)}…` : n));
    out.set(id, names.join(' · '));
  }
  return out;
}

export function renderExplorerBrowseGraph(
  mode: ExplorerBrowseSearchMode,
  container: HTMLElement,
  opts: {
    rows: HolderRow[];
    invMap: Map<string, HolderRow[]>;
    stockMap: Map<string, { code: string; issuer: string; rows: HolderRow[] }>;
    groups: IntelGroup[] | null;
    t: (k: string) => string;
    onInvestorClick: (name: string) => void;
    onStockClick: (code: string) => void;
    onGroupClick: (id: string) => void;
  }
): () => void {
  disposeGraph(container);
  container.querySelectorAll('svg').forEach((s) => s.remove());
  container.style.minHeight = '';

  if (mode === 'nationality' || mode === 'domicile') {
    const p = document.createElement('p');
    p.className = 'explorer-overview-empty';
    p.textContent = opts.t('explorer_overview_nat_dom_graph');
    container.appendChild(p);
    return () => disposeGraph(container);
  }

  if (mode === 'group' && (!opts.groups || opts.groups.length === 0)) {
    const p = document.createElement('p');
    p.className = 'explorer-overview-empty';
    p.textContent = opts.t('explorer_overview_groups_empty_graph');
    container.appendChild(p);
    return () => disposeGraph(container);
  }

  let nodes: OvNode[];
  let links: OvLink[];
  let layout: LayoutMode;

  if (mode === 'investor') {
    if (!opts.invMap.size) {
      const p = document.createElement('p');
      p.className = 'explorer-overview-empty';
      p.textContent = opts.t('explorer_overview_empty');
      container.appendChild(p);
      return () => disposeGraph(container);
    }
    const b = buildInvestorBipartite(opts.invMap);
    nodes = b.nodes;
    links = b.links;
    layout = b.layout;
  } else if (mode === 'stock') {
    if (!opts.stockMap.size) {
      const p = document.createElement('p');
      p.className = 'explorer-overview-empty';
      p.textContent = opts.t('explorer_overview_empty');
      container.appendChild(p);
      return () => disposeGraph(container);
    }
    const b = buildStockBipartite(opts.stockMap);
    nodes = b.nodes;
    links = b.links;
    layout = b.layout;
  } else {
    const b = buildGroupTripartite(opts.rows, opts.groups ?? []);
    nodes = b.nodes;
    links = b.links;
    layout = b.layout;
  }

  if (!nodes.length) {
    const p = document.createElement('p');
    p.className = 'explorer-overview-empty';
    p.textContent = opts.t('explorer_overview_empty');
    container.appendChild(p);
    return () => disposeGraph(container);
  }

  const height = browseGraphHeight();
  const width = graphInnerWidth(container);
  container.style.minHeight = `${height}px`;

  const cx = width / 2;
  const cy = height / 2;
  const maxW = d3.max(nodes, (d) => d.w) ?? 1;
  const radiusScale = d3.scaleSqrt().domain([1, maxW]).range([5, 22]);
  const linkScale = d3.scaleLinear().domain([0, 1]).range([0.28, 1.45]);
  const neighborHint = buildNeighborHint(nodes, links);
  const adj = buildAdjacencyUndirected(links);

  nodes.forEach((d, i) => {
    const ang = (nodes.length ? i / nodes.length : 0) * 2 * Math.PI - Math.PI / 2;
    const rad = Math.min(width, height) * 0.28;
    d.x = cx + Math.cos(ang) * rad;
    d.y = cy + Math.sin(ang) * rad + (layout === 'stk_inv' ? (d.kind === 'stk' ? -20 : 20) : 0);
  });

  const laneStrengthX = layout === 'grp_mem_stk' ? 0.22 : 0.18;
  const chargeStrength = layout === 'grp_mem_stk' ? -260 : -220;

  const sim = d3
    .forceSimulation(nodes)
    .velocityDecay(0.58)
    .alphaDecay(0.055)
    .alphaMin(0.001)
    .force(
      'link',
      d3
        .forceLink<OvNode, OvLink>(links)
        .id((d) => d.id)
        .distance((d) => 32 + (1 - (d.pct ?? 0.5)) * 36)
        .strength(0.62)
    )
    .force('charge', d3.forceManyBody().strength(chargeStrength))
    .force('center', d3.forceCenter(cx, cy).strength(0.02))
    .force(
      'x',
      d3
        .forceX<OvNode>((d) => laneX(d, width, layout))
        .strength(laneStrengthX)
    )
    .force(
      'y',
      d3
        .forceY<OvNode>((d) => laneY(d, height, layout))
        .strength(layout === 'stk_inv' ? 0.16 : 0.06)
    )
    .force(
      'collide',
      d3
        .forceCollide<OvNode>()
        .radius((d) => radiusScale(d.w) + 7)
        .iterations(3)
    );

  runForceSimulationStatic(sim, { maxTicks: layout === 'grp_mem_stk' ? 680 : 600 });

  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('overflow', 'hidden')
    .style('width', '100%')
    .style('height', `${height}px`)
    .style('display', 'block');

  const inner = svg.append('g').attr('class', 'tmd-graph-zoom-inner');
  appendPanLayer(inner, width, height);

  const link = inner
    .append('g')
    .attr('class', 'tmd-graph-browse-links')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', GRAPH_LINK_STROKE_SOFT)
    .attr('stroke-width', (d) => linkScale(d.pct ?? 0.5))
    .attr('stroke-opacity', NETWORK_LINK_BASE_OPACITY)
    .attr('stroke-linecap', 'round')
    .attr('pointer-events', 'none');

  const node = inner
    .append('g')
    .attr('class', 'tmd-graph-nodes')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'tmd-graph-node')
    .attr('cursor', 'pointer');

  const tt = document.getElementById('tooltip');

  let hoverId: string | null = null;
  let pinId: string | null = null;
  let currentZoomK = 1;
  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  let panPointerDown: { x: number; y: number } | null = null;
  let hoverClearTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelBrowseHoverClear() {
    if (hoverClearTimer) {
      clearTimeout(hoverClearTimer);
      hoverClearTimer = null;
    }
  }

  function scheduleBrowseHoverClear() {
    cancelBrowseHoverClear();
    hoverClearTimer = setTimeout(() => {
      hoverClearTimer = null;
      hoverId = null;
      updateVisuals();
      showTooltip(tt, '', false);
      if (tt) tt.style.maxWidth = '';
    }, GRAPH_HOVER_CLEAR_MS);
  }

  function browseLabelFontSize(d: OvNode, allLabels: boolean) {
    const r = radiusScale(d.w);
    const kBoost = Math.min(1.35, 0.88 + 0.12 * Math.min(currentZoomK, 3.5));
    if (allLabels) {
      return Math.min(10.5, Math.max(6.5, r * 0.36 * kBoost));
    }
    return Math.min(15, Math.max(7.5, r * 0.5 * kBoost));
  }

  mountExplorerNetworkLegend(
    container,
    opts.t,
    mode === 'group' ? EXPLORER_LEGEND_GROUP : EXPLORER_LEGEND_INV_STK
  );

  node.each(function (d) {
    const g = d3.select(this);
    const r = radiusScale(d.w);
    g.append('circle')
      .attr('r', r)
      .attr('fill', fillForKind(d.kind))
      .attr('stroke', d.kind === 'mem' ? 'var(--accent)' : 'none')
      .attr('stroke-width', d.kind === 'mem' ? 1.2 : 0)
      .attr('opacity', 0.9)
      .attr('pointer-events', 'all');
    g.append('title').text(d.name);
    g.append('text')
      .attr('class', 'tmd-graph-browse-label')
      .attr('text-anchor', 'middle')
      .attr('dy', (d0) => radiusScale(d0.w) + 10)
      .attr('dominant-baseline', 'hanging')
      .attr('pointer-events', 'none');
  });

  const host = container as GraphHost;

  function navigateNode(d: OvNode) {
    if (d.kind === 'grp') opts.onGroupClick(parseGroupClickId(d.id));
    else if (d.kind === 'stk') opts.onStockClick(parseStockClickId(d.id));
    else opts.onInvestorClick(parseInvestorClickId(d.id));
  }

  function updateVisuals() {
    const center = hoverId ?? pinId;
    const fs = focusNeighborSet(adj, center);
    const dim = center !== null;
    const showAllLabelsNoFocus =
      center === null && currentZoomK >= DETAIL_ZOOM_LABEL_K;
    const labelsFromZoom = currentZoomK >= DETAIL_ZOOM_LABEL_K;

    node.each(function (d) {
      const g = d3.select(this);
      const r = radiusScale(d.w);
      const inFs = fs.has(d.id);
      const isCenter = !!center && d.id === center;
      g.select('circle')
        .attr('opacity', dim ? (inFs ? 0.98 : 0.16) : 0.9)
        .attr('stroke', isCenter ? 'var(--text)' : d.kind === 'mem' ? 'var(--accent)' : 'none')
        .attr('stroke-width', isCenter ? 2.2 : d.kind === 'mem' ? 1.2 : 0);

      /** At overview zoom, purple group hubs had no text; show names so hubs stay identifiable. */
      const alwaysShowGroupHubLabel =
        mode === 'group' && d.kind === 'grp' && !labelsFromZoom && !center;
      const showLabel =
        alwaysShowGroupHubLabel || networkGraphLabelsVisible(center, inFs, labelsFromZoom);
      const neighborRing = !!(center && inFs && !isCenter);
      const fsz = browseLabelFontSize(d, (!center && showAllLabelsNoFocus) || neighborRing);
      let maxChars: number;
      if (!showLabel) {
        maxChars = 12;
      } else if (!center && showAllLabelsNoFocus) {
        maxChars = Math.min(16, 6 + Math.round(fsz * 1.55));
      } else if (isCenter) {
        maxChars = 44;
      } else if (alwaysShowGroupHubLabel) {
        maxChars = Math.min(30, 8 + Math.round(fsz * 1.65));
      } else {
        maxChars = Math.min(16, 6 + Math.round(fsz * 1.55));
      }
      g.select('text.tmd-graph-browse-label')
        .attr('opacity', showLabel ? 1 : 0)
        .attr('font-size', `${fsz}px`)
        .attr('dy', r + 10)
        .text(truncateNodeLabel(d.name, maxChars));
    });

    link
      .attr('stroke-opacity', (d) => {
        const [a, b] = linkEndpointResolved(d.source, d.target);
        return networkLinkStrokeOpacity(center, a, b, fs);
      })
      .attr('stroke-width', (d) => {
        const base = linkScale(d.pct ?? 0.5);
        const [a, b] = linkEndpointResolved(d.source, d.target);
        return base * networkLinkWidthFocusFactor(center, a, b, fs, { bright: 1.4 });
      });
  }

  const zoom = attachNetworkZoom(
    container,
    svg,
    inner,
    opts.t,
    () => host.__tmdBrowseFit ?? d3.zoomIdentity,
    (event) => {
      currentZoomK = event.transform.k;
      updateVisuals();
    }
  );

  function syncBrowseGeometry() {
    link
      .attr('x1', (d) => (d.source as OvNode).x ?? 0)
      .attr('y1', (d) => (d.source as OvNode).y ?? 0)
      .attr('x2', (d) => (d.target as OvNode).x ?? 0)
      .attr('y2', (d) => (d.target as OvNode).y ?? 0);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  }

  syncBrowseGeometry();
  const browseFit = computeFitTransform(nodes, width, height, 36, (d) => radiusScale(d.w));
  host.__tmdBrowseFit = browseFit;
  svg.call(zoom.transform, browseFit);
  currentZoomK = browseFit.k;
  updateVisuals();

  inner
    .select('.tmd-graph-pan-layer')
    .on('mousedown', (e) => {
      panPointerDown = { x: e.clientX, y: e.clientY };
    })
    .on('click', (e) => {
      if (panPointerDown == null) return;
      const dx = e.clientX - panPointerDown.x;
      const dy = e.clientY - panPointerDown.y;
      panPointerDown = null;
      if (dx * dx + dy * dy > DETAIL_PAN_CLICK_MAX_DIST * DETAIL_PAN_CLICK_MAX_DIST) return;
      e.stopPropagation();
      cancelBrowseHoverClear();
      hoverId = null;
      pinId = null;
      updateVisuals();
      showTooltip(tt, '', false);
      if (tt) tt.style.maxWidth = '';
    });
  inner.on('mouseleave.pantrack', () => {
    panPointerDown = null;
  });

  node
    .on('mouseover', (e, d) => {
      cancelBrowseHoverClear();
      hoverId = d.id;
      updateVisuals();
      const hint = neighborHint.get(d.id) ?? '';
      const edgeN = links.filter(
        (l) =>
          (typeof l.source === 'object' ? (l.source as OvNode).id : l.source) === d.id ||
          (typeof l.target === 'object' ? (l.target as OvNode).id : l.target) === d.id
      ).length;
      const sub =
        d.kind === 'stk' && !d.id.startsWith('stkgrp:')
          ? opts.stockMap.get(d.name)?.issuer ?? ''
          : d.kind === 'stk' && d.groupId
            ? opts.t('explorer_net_tt_stock_in_group')
            : '';
      showTooltip(
        tt,
        `<div class="tt-ticker">${esc(d.name)}</div>
        ${sub ? `<div class="tt-issuer">${esc(sub)}</div>` : ''}
        ${hint ? `<div class="tt-section">${esc(opts.t('explorer_net_tt_neighbors'))}</div><div class="tt-issuer">${esc(hint)}</div>` : ''}
        <div class="tt-row"><span class="tt-label">${esc(opts.t('explorer_overview_tt_edges'))}</span><span class="tt-val">${formatInt(edgeN)}</span></div>
        ${explorerNetworkTooltipHintsHtml(opts.t)}`,
        true,
        e.clientX,
        e.clientY
      );
      if (tt) tt.style.maxWidth = '380px';
    })
    .on('mousemove', (e) => showTooltip(tt, '', true, e.clientX, e.clientY))
    .on('mouseleave', () => {
      scheduleBrowseHoverClear();
    })
    .on('click', (e, d) => {
      e.stopPropagation();
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        clickTimer = null;
        pinId = pinId === d.id ? null : d.id;
        updateVisuals();
      }, DETAIL_CLICK_PIN_MS);
    })
    .on('dblclick', (e, d) => {
      e.preventDefault();
      e.stopPropagation();
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      pinId = null;
      cancelBrowseHoverClear();
      hoverId = null;
      updateVisuals();
      showTooltip(tt, '', false);
      if (tt) tt.style.maxWidth = '';
      navigateNode(d);
    });

  updateVisuals();

  host.__tmdGraphSimStop = () => {};
  attachGraphResize(container, width, () =>
    renderExplorerBrowseGraph(mode, container, opts)
  );

  return () => {
    cancelBrowseHoverClear();
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    disposeGraph(container);
  };
}
