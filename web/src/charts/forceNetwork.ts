import * as d3 from 'd3';
import type { HolderRow } from '@/domain/holders';
import { formatInt, formatPct, esc } from '@/lib/format';
import { GRAPH_LINK_STROKE_SOFT, graphNodeFillForType, graphNodeStrokeForFill } from '@/charts/d3common';
import {
  appendPanLayer,
  attachGraphResize,
  attachNetworkZoom,
  computeFitTransformFromBounds,
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
  EXPLORER_LEGEND_STK_INV,
  GRAPH_HOVER_CLEAR_MS,
  GRAPH_TABLE_FOCUS_DEBOUNCE_MS,
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

type SimNode = d3.SimulationNodeDatum & {
  id: string;
  name?: string;
  issuer?: string;
  pct?: number;
  shares?: number;
  investorType?: string;
  localForeign?: string;
  /** Group graph: member who owns the stock edge (legacy single-edge; prefer groupStockLines). */
  memberName?: string;
  /** Group graph: all members from this group linked to the same ticker node. */
  groupStockLines?: Array<{ member: string; pct: number; shares: number }>;
  type: string;
};

type SimLink = d3.SimulationLinkDatum<SimNode> & { pct: number };

/** Extra vertical room so forceCollide clears subtitle lines under nodes. */
const NODE_SUBTITLE_PAD = 22;

function truncatedLine(s: string, maxChars: number): string {
  const t = (s ?? '').trim();
  if (!t) return '';
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(1, maxChars - 1))}…`;
}

/** Second line under a node (issuer, counts, type, etc.). */
function appendNodeSubtitle(
  g: d3.Selection<SVGGElement, unknown, SVGGElement, unknown>,
  subtitle: string,
  yBelowCenter: number,
  fontPx = 9,
  extraClass = ''
) {
  const line = truncatedLine(subtitle, 44);
  if (!line) return;
  g.append('text')
    .attr('class', 'tmd-graph-node-sub' + (extraClass ? ` ${extraClass}` : ''))
    .attr('text-anchor', 'middle')
    .attr('y', yBelowCenter)
    .attr('fill', 'var(--text-muted)')
    .attr('font-size', `${fontPx}px`)
    .attr('font-weight', '500')
    .attr('pointer-events', 'none')
    .text(line);
}

/** Primary name under the circle (ggraph-style external labels). */
function appendNodeNameBelow(
  g: d3.Selection<SVGGElement, unknown, SVGGElement, unknown>,
  name: string,
  yBelowCenter: number,
  fontPx = 10,
  extraClass = ''
) {
  const line = truncatedLine(name, 48);
  if (!line) return;
  g.append('text')
    .attr('class', 'tmd-graph-node-name' + (extraClass ? ` ${extraClass}` : ''))
    .attr('text-anchor', 'middle')
    .attr('y', yBelowCenter)
    .attr('fill', 'var(--accent-bright)')
    .attr('font-size', `${fontPx}px`)
    .attr('font-weight', '600')
    .attr('pointer-events', 'none')
    .text(line);
}

function appendNativeTitle(
  g: d3.Selection<SVGGElement, unknown, SVGGElement, unknown>,
  lines: string[]
) {
  const body = lines.map((x) => (x ?? '').trim()).filter(Boolean).join('\n');
  if (body) g.append('title').text(body);
}

export function renderInvestorNetwork(
  container: HTMLElement,
  rows: HolderRow[],
  investorName: string,
  opts: {
    typeLabel: (tp: string) => string;
    t: (k: string) => string;
    onStockClick: (code: string) => void;
    /** Double-click center hub: open investor in Explorer (URL + state). */
    onInvestorHubClick?: (name: string) => void;
    /** When focus is on a stock node, pass its share code; when hub or cleared, null. */
    onTableFocusChange?: (shareCode: string | null) => void;
  }
) {
  disposeGraph(container);
  container.querySelectorAll('svg').forEach((s) => s.remove());
  container.style.minHeight = '680px';
  const hostInv = container as GraphHost;
  const width = graphInnerWidth(container);
  const height = 680;
  const investorNode: SimNode = {
    id: '__investor__',
    name: investorName,
    type: 'investor',
  };
  const stockNodes: SimNode[] = rows.map((r) => ({
    id: r.share_code,
    name: r.share_code,
    issuer: r.issuer_name,
    pct: Number.isFinite(r.percentage) ? r.percentage : 0,
    shares: r.total_holding_shares,
    investorType: r.investor_type,
    type: 'stock',
  }));
  const nodes = [investorNode, ...stockNodes];
  const links: SimLink[] = stockNodes.map((s) => ({
    source: '__investor__',
    target: s.id,
    pct: Number.isFinite(s.pct) ? (s.pct as number) : 0,
  }));

  const adjInv = buildAdjacencyUndirected(links);

  const rawMax = d3.max(rows, (r) =>
    Number.isFinite(r.percentage) ? r.percentage : 0
  );
  const maxPct = Number.isFinite(rawMax) && (rawMax as number) > 0 ? (rawMax as number) : 1;
  const radiusScale = d3.scaleSqrt().domain([0, maxPct]).range([22, 48]);
  const linkScale = d3.scaleLinear().domain([0, maxPct]).range([1.5, 7]);
  const cx = width / 2;
  const cy = height / 2;
  investorNode.x = cx;
  investorNode.y = cy;
  investorNode.fx = cx;
  investorNode.fy = cy;
  stockNodes.forEach((d, i) => {
    const ang = (stockNodes.length ? i / stockNodes.length : 0) * 2 * Math.PI - Math.PI / 2;
    const rad = Math.min(width, height) * 0.32;
    d.x = cx + Math.cos(ang) * rad;
    d.y = cy + Math.sin(ang) * rad;
  });

  const simInv = d3
    .forceSimulation(nodes)
    .velocityDecay(0.66)
    .alphaDecay(0.05)
    .alphaMin(0.001)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d: SimNode) => d.id)
        .distance((d) => 82 + (1 - (d as SimLink).pct / maxPct) * 34)
        .strength(0.96)
    )
    .force('charge', d3.forceManyBody().strength(-260))
    .force('center', d3.forceCenter(cx, cy).strength(0.035))
    .force('x', d3.forceX(cx).strength(0.018))
    .force('y', d3.forceY(cy).strength(0.018))
    .force(
      'collide',
      d3
        .forceCollide<SimNode>()
        .radius((d) => {
          if (d.type === 'investor') return 48 + NODE_SUBTITLE_PAD * 2;
          const r = radiusScale(d.pct ?? 0);
          return r + 36 + NODE_SUBTITLE_PAD;
        })
        .iterations(2)
    );

  runForceSimulationStatic(simInv, {
    maxTicks: 520,
    beforeTick: () => {
      for (const d of nodes) {
        if (d.type === 'investor') {
          d.fx = cx;
          d.fy = cy;
        }
      }
    },
  });

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
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', GRAPH_LINK_STROKE_SOFT)
    .attr('stroke-width', (d) => 0.35 + linkScale(d.pct) * 0.32)
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
  node.each(function (d) {
    const g = d3.select(this);
    if (d.type === 'investor') {
      const hubR = 40;
      g.append('circle')
        .attr('r', hubR)
        .attr('fill', 'var(--accent)')
        .attr('opacity', 0.95)
        .attr('pointer-events', 'all')
        .attr('stroke', 'none')
        .attr('stroke-width', 0);
      g.append('text')
        .attr('class', 'tmd-graph-hub-code')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', '11px')
        .attr('font-weight', '800')
        .attr('pointer-events', 'none')
        .text('◎');
      appendNodeNameBelow(g, d.name ?? '', hubR + 12, 10);
      appendNodeSubtitle(
        g,
        `${formatInt(rows.length)} ${opts.t('col_stocks')}`,
        hubR + 26,
        9
      );
      appendNativeTitle(g, [
        d.name ?? '',
        `${formatInt(rows.length)} ${opts.t('col_stocks')}`,
        opts.t('graph_native_hub_investor_hint'),
      ]);
    } else {
      const r = radiusScale(d.pct ?? 0);
      const fill = graphNodeFillForType(d.investorType ?? '');
      const ring = graphNodeStrokeForFill(fill);
      g.append('circle')
        .attr('r', r)
        .attr('fill', fill)
        .attr('stroke', ring || 'none')
        .attr('stroke-width', ring ? 1.5 : 0)
        .attr('pointer-events', 'all');
      g.append('text')
        .attr('class', 'tmd-graph-stock-ticker')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', Math.min(14, 9 + r * 0.22) + 'px')
        .attr('font-weight', '800')
        .attr('pointer-events', 'none')
        .text(d.id);
      appendNodeSubtitle(g, d.issuer ?? '', r + 11, 8);
      appendNativeTitle(g, [
        d.id,
        d.issuer ?? '',
        `${opts.t('col_stake_pct')}: ${formatPct(d.pct ?? 0)}`,
        `${opts.t('col_total_shares')}: ${formatInt(d.shares ?? 0)}`,
      ]);
    }
  });

  mountExplorerNetworkLegend(container, opts.t, EXPLORER_LEGEND_INV_STK);

  let hoverIdInv: string | null = null;
  let pinIdInv: string | null = null;
  let currentZoomKInv = 1;
  let clickTimerInv: ReturnType<typeof setTimeout> | null = null;
  let panPointerDownInv: { x: number; y: number } | null = null;
  let hoverClearTimerInv: ReturnType<typeof setTimeout> | null = null;
  let lastEmittedShare: string | null | undefined = undefined;
  let tableFocusTimerInv: ReturnType<typeof setTimeout> | null = null;
  let tableFocusPendingCodeInv: string | null | undefined = undefined;

  function cancelInvestorTableFocusDebounce() {
    if (tableFocusTimerInv) {
      clearTimeout(tableFocusTimerInv);
      tableFocusTimerInv = null;
    }
    tableFocusPendingCodeInv = undefined;
  }

  function computeInvestorTableCode(): string | null {
    const c = hoverIdInv ?? pinIdInv;
    return !c || c === '__investor__' ? null : c;
  }

  function cancelInvestorHoverClear() {
    if (hoverClearTimerInv) {
      clearTimeout(hoverClearTimerInv);
      hoverClearTimerInv = null;
    }
  }

  function scheduleInvestorHoverClear() {
    cancelInvestorHoverClear();
    hoverClearTimerInv = setTimeout(() => {
      hoverClearTimerInv = null;
      hoverIdInv = null;
      updateVisualsInv();
      showTooltip(tt, '', false);
    }, GRAPH_HOVER_CLEAR_MS);
  }

  function queueInvestorTableFocusEmit() {
    if (!opts.onTableFocusChange) return;
    const code = computeInvestorTableCode();
    if (hoverIdInv == null) {
      cancelInvestorTableFocusDebounce();
      if (lastEmittedShare !== code) {
        lastEmittedShare = code;
        opts.onTableFocusChange(code);
      }
      return;
    }
    if (tableFocusTimerInv != null && tableFocusPendingCodeInv === code) {
      return;
    }
    tableFocusPendingCodeInv = code;
    if (tableFocusTimerInv) clearTimeout(tableFocusTimerInv);
    tableFocusTimerInv = setTimeout(() => {
      tableFocusTimerInv = null;
      tableFocusPendingCodeInv = undefined;
      const finalCode = computeInvestorTableCode();
      if (lastEmittedShare !== finalCode) {
        lastEmittedShare = finalCode;
        opts.onTableFocusChange(finalCode);
      }
    }, GRAPH_TABLE_FOCUS_DEBOUNCE_MS);
  }

  function updateVisualsInv() {
    const center = hoverIdInv ?? pinIdInv;
    const fs = focusNeighborSet(adjInv, center);
    const showAllLabels = currentZoomKInv >= DETAIL_ZOOM_LABEL_K;
    const dim = center !== null && !showAllLabels;

    node.each(function (d) {
      const g = d3.select(this);
      const inFs = fs.has(d.id);
      const isCenter = !!center && d.id === center;
      g.style('opacity', dim ? (inFs ? 1 : 0.16) : 1);
      g.select('circle').each(function () {
        const el = d3.select(this);
        if (isCenter) {
          el.attr('stroke', 'var(--text)').attr('stroke-width', 2.2);
        } else if (d.type === 'stock') {
          const fill = graphNodeFillForType(d.investorType ?? '');
          const ring = graphNodeStrokeForFill(fill);
          el.attr('stroke', ring || 'none').attr('stroke-width', ring ? 1.5 : 0);
        } else {
          el.attr('stroke', 'none').attr('stroke-width', 0);
        }
      });

      const baseShow = networkGraphLabelsVisible(center, inFs, showAllLabels);
      if (d.type === 'investor') {
        g.selectAll('.tmd-graph-node-name, .tmd-graph-node-sub, .tmd-graph-hub-code').attr('opacity', 1);
      } else if (d.type === 'stock') {
        g.selectAll('.tmd-graph-stock-ticker').attr('opacity', 1);
        g.selectAll('.tmd-graph-node-sub').attr('opacity', baseShow ? 1 : 0);
      }
    });

    link
      .attr('stroke-opacity', (d) => {
        const [a, b] = linkEndpointResolved(d.source, d.target);
        return networkLinkStrokeOpacity(center, a, b, fs);
      })
      .attr('stroke-width', (d) => {
        const base = 0.35 + linkScale(d.pct) * 0.32;
        const [a, b] = linkEndpointResolved(d.source, d.target);
        return base * networkLinkWidthFocusFactor(center, a, b, fs);
      });
    queueInvestorTableFocusEmit();
  }

  inner
    .select('.tmd-graph-pan-layer')
    .on('mousedown', (e) => {
      panPointerDownInv = { x: e.clientX, y: e.clientY };
    })
    .on('click', (e) => {
      if (panPointerDownInv == null) return;
      const dx = e.clientX - panPointerDownInv.x;
      const dy = e.clientY - panPointerDownInv.y;
      panPointerDownInv = null;
      if (dx * dx + dy * dy > DETAIL_PAN_CLICK_MAX_DIST * DETAIL_PAN_CLICK_MAX_DIST) return;
      e.stopPropagation();
      cancelInvestorHoverClear();
      hoverIdInv = null;
      pinIdInv = null;
      updateVisualsInv();
      showTooltip(tt, '', false);
    });
  inner.on('mouseleave.pantrackInv', () => {
    panPointerDownInv = null;
  });

  node
    .filter((d) => d.type === 'investor')
    .on('mouseover', (e, d) => {
      cancelInvestorHoverClear();
      hoverIdInv = d.id;
      updateVisualsInv();
      showTooltip(
        tt,
        `<div class="tt-ticker">${esc(d.name ?? '')}</div>
        ${explorerNetworkTooltipHintsHtml(opts.t)}`,
        true,
        e.clientX,
        e.clientY
      );
    })
    .on('mousemove', (e) => showTooltip(tt, '', true, e.clientX, e.clientY))
    .on('mouseleave', () => {
      scheduleInvestorHoverClear();
    })
    .on('click', (e) => {
      e.stopPropagation();
      if (clickTimerInv) clearTimeout(clickTimerInv);
      clickTimerInv = setTimeout(() => {
        clickTimerInv = null;
        pinIdInv = pinIdInv === '__investor__' ? null : '__investor__';
        updateVisualsInv();
      }, DETAIL_CLICK_PIN_MS);
    })
    .on('dblclick', (e, d) => {
      e.preventDefault();
      e.stopPropagation();
      if (clickTimerInv) {
        clearTimeout(clickTimerInv);
        clickTimerInv = null;
      }
      pinIdInv = null;
      cancelInvestorHoverClear();
      hoverIdInv = null;
      updateVisualsInv();
      showTooltip(tt, '', false);
      opts.onInvestorHubClick?.(d.name ?? investorName);
    });

  node
    .filter((d) => d.type === 'stock')
    .on('mouseover', (e, d) => {
      cancelInvestorHoverClear();
      hoverIdInv = d.id;
      updateVisualsInv();
      showTooltip(
        tt,
        `<div class="tt-ticker">${esc(d.id)}</div>
        <div class="tt-issuer">${esc(d.issuer ?? '')}</div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_stake_pct')}</span><span class="tt-val">${formatPct(d.pct ?? 0)}</span></div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_total_shares')}</span><span class="tt-val">${formatInt(d.shares ?? 0)}</span></div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_type')}</span><span class="tt-val">${esc(opts.typeLabel(d.investorType ?? '') || 'N/A')}</span></div>
        ${explorerNetworkTooltipHintsHtml(opts.t)}`,
        true,
        e.clientX,
        e.clientY
      );
    })
    .on('mousemove', (e) => showTooltip(tt, '', true, e.clientX, e.clientY))
    .on('mouseleave', () => {
      scheduleInvestorHoverClear();
    })
    .on('click', (e, d) => {
      e.stopPropagation();
      if (clickTimerInv) clearTimeout(clickTimerInv);
      clickTimerInv = setTimeout(() => {
        clickTimerInv = null;
        pinIdInv = pinIdInv === d.id ? null : d.id;
        updateVisualsInv();
      }, DETAIL_CLICK_PIN_MS);
    })
    .on('dblclick', (e, d) => {
      e.preventDefault();
      e.stopPropagation();
      if (clickTimerInv) {
        clearTimeout(clickTimerInv);
        clickTimerInv = null;
      }
      pinIdInv = null;
      cancelInvestorHoverClear();
      hoverIdInv = null;
      updateVisualsInv();
      showTooltip(tt, '', false);
      opts.onStockClick(d.id);
    });

  const zoomInv = attachNetworkZoom(
    container,
    svg,
    inner,
    opts.t,
    () => hostInv.__tmdBrowseFit ?? d3.zoomIdentity,
    (event) => {
      currentZoomKInv = event.transform.k;
      updateVisualsInv();
    }
  );

  function applyInvestorFitTransform() {
    const pad = 56;
    const hubPad = 40 + NODE_SUBTITLE_PAD * 2 + 56;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of nodes) {
      const x = d.x ?? 0;
      const y = d.y ?? 0;
      const er = d.type === 'investor' ? hubPad : radiusScale(d.pct ?? 0) + NODE_SUBTITLE_PAD + 44;
      const lx = 32;
      minX = Math.min(minX, x - er - lx);
      maxX = Math.max(maxX, x + er + lx);
      minY = Math.min(minY, y - er);
      maxY = Math.max(maxY, y + er);
    }
    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return;
    const t = computeFitTransformFromBounds(minX, minY, maxX, maxY, width, height, pad, 1);
    hostInv.__tmdBrowseFit = t;
    svg.call(zoomInv.transform, t);
    currentZoomKInv = t.k;
    updateVisualsInv();
  }

  function syncInvestorGeometry() {
    link
      .attr('x1', (d) => (d.source as SimNode).x ?? 0)
      .attr('y1', (d) => (d.source as SimNode).y ?? 0)
      .attr('x2', (d) => (d.target as SimNode).x ?? 0)
      .attr('y2', (d) => (d.target as SimNode).y ?? 0);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  }

  syncInvestorGeometry();
  applyInvestorFitTransform();

  hostInv.__tmdGraphSimStop = () => {};
  attachGraphResize(container, width, () =>
    renderInvestorNetwork(container, rows, investorName, opts)
  );

  updateVisualsInv();

  return () => {
    cancelInvestorHoverClear();
    cancelInvestorTableFocusDebounce();
    if (clickTimerInv) {
      clearTimeout(clickTimerInv);
      clickTimerInv = null;
    }
    disposeGraph(container);
  };
}

export function renderStockNetwork(
  container: HTMLElement,
  rows: HolderRow[],
  code: string,
  opts: {
    typeLabel: (tp: string) => string;
    t: (k: string) => string;
    onInvestorClick: (name: string) => void;
    /** Double-click stock hub: open stock in Explorer (same as ticker elsewhere). */
    onStockClick?: (code: string) => void;
    /** When focus is on a holder node, pass their name; when hub or cleared, null. */
    onTableFocusChange?: (investorName: string | null) => void;
  }
) {
  disposeGraph(container);
  container.querySelectorAll('svg').forEach((s) => s.remove());
  container.style.minHeight = '680px';
  const host = container as GraphHost;
  const width = graphInnerWidth(container);
  const height = 680;
  const hubIssuer = rows[0]?.issuer_name ?? '';
  const stockNode: SimNode = {
    id: '__stock__',
    name: code,
    issuer: hubIssuer,
    type: 'stock-center',
  };
  const holderNodes: SimNode[] = rows.map((r) => ({
    id: r.investor_name,
    name: r.investor_name,
    pct: Number.isFinite(r.percentage) ? r.percentage : 0,
    shares: r.total_holding_shares,
    investorType: r.investor_type,
    localForeign: r.local_foreign,
    type: 'holder',
  }));
  const nodes = [stockNode, ...holderNodes];
  const links: SimLink[] = holderNodes.map((h) => ({
    source: '__stock__',
    target: h.id,
    pct: Number.isFinite(h.pct) ? (h.pct as number) : 0,
  }));

  const adj = buildAdjacencyUndirected(links);

  const rawMaxS = d3.max(rows, (r) =>
    Number.isFinite(r.percentage) ? r.percentage : 0
  );
  const maxPct =
    Number.isFinite(rawMaxS) && (rawMaxS as number) > 0 ? (rawMaxS as number) : 1;
  const radiusScale = d3.scaleSqrt().domain([0, maxPct]).range([20, 44]);
  const linkScale = d3.scaleLinear().domain([0, maxPct]).range([1.5, 7]);
  const cx = width / 2;
  const cy = height / 2;
  stockNode.x = cx;
  stockNode.y = cy;
  stockNode.fx = cx;
  stockNode.fy = cy;
  holderNodes.forEach((d, i) => {
    const ang = (holderNodes.length ? i / holderNodes.length : 0) * 2 * Math.PI - Math.PI / 2;
    const rad = Math.min(width, height) * 0.32;
    d.x = cx + Math.cos(ang) * rad;
    d.y = cy + Math.sin(ang) * rad;
  });

  const simSt = d3
    .forceSimulation(nodes)
    .velocityDecay(0.66)
    .alphaDecay(0.05)
    .alphaMin(0.001)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d: SimNode) => d.id)
        .distance((d) => 82 + (1 - (d as SimLink).pct / maxPct) * 34)
        .strength(0.96)
    )
    .force('charge', d3.forceManyBody().strength(-260))
    .force('center', d3.forceCenter(cx, cy).strength(0.035))
    .force('x', d3.forceX(cx).strength(0.018))
    .force('y', d3.forceY(cy).strength(0.018))
    .force(
      'collide',
      d3
        .forceCollide<SimNode>()
        .radius((d) => {
          if (d.type === 'stock-center') return 46 + NODE_SUBTITLE_PAD * 2;
          const r = radiusScale(d.pct ?? 0);
          return r + 34 + NODE_SUBTITLE_PAD * 2;
        })
        .iterations(2)
    );

  runForceSimulationStatic(simSt, {
    maxTicks: 520,
    beforeTick: () => {
      for (const d of nodes) {
        if (d.type === 'stock-center') {
          d.fx = cx;
          d.fy = cy;
        }
      }
    },
  });

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
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', GRAPH_LINK_STROKE_SOFT)
    .attr('stroke-width', (d) => 0.35 + linkScale(d.pct) * 0.32)
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

  mountExplorerNetworkLegend(container, opts.t, EXPLORER_LEGEND_STK_INV);

  let hoverId: string | null = null;
  let pinId: string | null = null;
  let currentZoomK = 1;
  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  let panPointerDown: { x: number; y: number } | null = null;
  let hoverClearTimerSt: ReturnType<typeof setTimeout> | null = null;
  let lastEmittedHolder: string | null | undefined = undefined;
  let tableFocusTimerSt: ReturnType<typeof setTimeout> | null = null;
  let tableFocusPendingHolder: string | null | undefined = undefined;

  function cancelStockTableFocusDebounce() {
    if (tableFocusTimerSt) {
      clearTimeout(tableFocusTimerSt);
      tableFocusTimerSt = null;
    }
    tableFocusPendingHolder = undefined;
  }

  function computeStockTableHolder(): string | null {
    const c = hoverId ?? pinId;
    return !c || c === '__stock__' ? null : c;
  }

  function cancelStockHoverClear() {
    if (hoverClearTimerSt) {
      clearTimeout(hoverClearTimerSt);
      hoverClearTimerSt = null;
    }
  }

  function scheduleStockHoverClear() {
    cancelStockHoverClear();
    hoverClearTimerSt = setTimeout(() => {
      hoverClearTimerSt = null;
      hoverId = null;
      updateVisuals();
      showTooltip(tt, '', false);
    }, GRAPH_HOVER_CLEAR_MS);
  }

  function queueStockTableFocusEmit() {
    if (!opts.onTableFocusChange) return;
    const name = computeStockTableHolder();
    if (hoverId == null) {
      cancelStockTableFocusDebounce();
      if (lastEmittedHolder !== name) {
        lastEmittedHolder = name;
        opts.onTableFocusChange(name);
      }
      return;
    }
    if (tableFocusTimerSt != null && tableFocusPendingHolder === name) {
      return;
    }
    tableFocusPendingHolder = name;
    if (tableFocusTimerSt) clearTimeout(tableFocusTimerSt);
    tableFocusTimerSt = setTimeout(() => {
      tableFocusTimerSt = null;
      tableFocusPendingHolder = undefined;
      const finalName = computeStockTableHolder();
      if (lastEmittedHolder !== finalName) {
        lastEmittedHolder = finalName;
        opts.onTableFocusChange(finalName);
      }
    }, GRAPH_TABLE_FOCUS_DEBOUNCE_MS);
  }

  node.each(function (d) {
    const g = d3.select(this);
    if (d.type === 'stock-center') {
      const hubR = 42;
      g.append('circle')
        .attr('r', hubR)
        .attr('fill', 'var(--green)')
        .attr('opacity', 0.95)
        .attr('pointer-events', 'all')
        .attr('stroke', 'none')
        .attr('stroke-width', 0);
      g.append('text')
        .attr('class', 'tmd-graph-hub-code')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', '14px')
        .attr('font-weight', '800')
        .attr('pointer-events', 'none')
        .text(d.name ?? '');
      appendNodeSubtitle(g, hubIssuer, hubR + 12, 8);
      appendNativeTitle(g, [
        d.name ?? '',
        hubIssuer,
        opts.t('graph_native_hub_stock_hint'),
      ]);
    } else {
      const r = radiusScale(d.pct ?? 0);
      const fill = graphNodeFillForType(d.investorType ?? '');
      const ring = graphNodeStrokeForFill(fill);
      g.append('circle')
        .attr('r', r)
        .attr('fill', fill)
        .attr('stroke', ring || 'none')
        .attr('stroke-width', ring ? 1.5 : 0)
        .attr('pointer-events', 'all');
      g.append('text')
        .attr('class', 'tmd-graph-pct-label')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', `${Math.min(11, Math.max(8, 6 + r * 0.22))}px`)
        .attr('font-weight', '800')
        .attr('pointer-events', 'none')
        .text(formatPct(d.pct ?? 0));
      const lf =
        d.localForeign === 'L'
          ? opts.t('local')
          : d.localForeign === 'F'
            ? opts.t('foreign')
            : '—';
      appendNodeNameBelow(g, d.name ?? '', r + 11, 9);
      appendNodeSubtitle(
        g,
        `${opts.typeLabel(d.investorType ?? '') || '—'} · ${lf}`,
        r + 24,
        8
      );
      appendNativeTitle(g, [
        d.name ?? '',
        `${opts.typeLabel(d.investorType ?? '') || '—'} · ${lf}`,
        `${opts.t('col_stake_pct')}: ${formatPct(d.pct ?? 0)}`,
        `${opts.t('col_total_shares')}: ${formatInt(d.shares ?? 0)}`,
      ]);
    }
  });

  function updateVisuals() {
    const center = hoverId ?? pinId;
    const fs = focusNeighborSet(adj, center);
    const showAllLabels = currentZoomK >= DETAIL_ZOOM_LABEL_K;
    const dim = center !== null && !showAllLabels;

    node.each(function (d) {
      const g = d3.select(this);
      const inFs = fs.has(d.id);
      const isCenter = !!center && d.id === center;
      g.style('opacity', dim ? (inFs ? 1 : 0.16) : 1);
      g.select('circle').each(function () {
        const el = d3.select(this);
        if (isCenter) {
          el.attr('stroke', 'var(--text)').attr('stroke-width', 2.2);
        } else if (d.type === 'holder') {
          const fill = graphNodeFillForType(d.investorType ?? '');
          const ring = graphNodeStrokeForFill(fill);
          el.attr('stroke', ring || 'none').attr('stroke-width', ring ? 1.5 : 0);
        } else {
          el.attr('stroke', 'none').attr('stroke-width', 0);
        }
      });

      const baseShow = networkGraphLabelsVisible(center, inFs, showAllLabels);
      if (d.type === 'stock-center') {
        g.selectAll('.tmd-graph-hub-code, .tmd-graph-node-sub').attr('opacity', 1);
      } else {
        g.selectAll('.tmd-graph-node-name, .tmd-graph-node-sub, .tmd-graph-pct-label').attr(
          'opacity',
          baseShow ? 1 : 0
        );
      }
    });

    link
      .attr('stroke-opacity', (d) => {
        const [a, b] = linkEndpointResolved(d.source, d.target);
        return networkLinkStrokeOpacity(center, a, b, fs);
      })
      .attr('stroke-width', (d) => {
        const base = 0.35 + linkScale(d.pct) * 0.32;
        const [a, b] = linkEndpointResolved(d.source, d.target);
        return base * networkLinkWidthFocusFactor(center, a, b, fs);
      });
    queueStockTableFocusEmit();
  }

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
      cancelStockHoverClear();
      hoverId = null;
      pinId = null;
      updateVisuals();
      showTooltip(tt, '', false);
    });
  inner.on('mouseleave.pantrack', () => {
    panPointerDown = null;
  });

  node
    .filter((d) => d.type === 'stock-center')
    .on('mouseover', (e, d) => {
      cancelStockHoverClear();
      hoverId = d.id;
      updateVisuals();
      showTooltip(
        tt,
        `<div class="tt-ticker">${esc(d.name ?? '')}</div>
        <div class="tt-issuer">${esc(hubIssuer)}</div>
        ${explorerNetworkTooltipHintsHtml(opts.t)}`,
        true,
        e.clientX,
        e.clientY
      );
    })
    .on('mousemove', (e) => showTooltip(tt, '', true, e.clientX, e.clientY))
    .on('mouseleave', () => {
      scheduleStockHoverClear();
    })
    .on('click', (e) => {
      e.stopPropagation();
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        clickTimer = null;
        pinId = pinId === '__stock__' ? null : '__stock__';
        updateVisuals();
      }, DETAIL_CLICK_PIN_MS);
    })
    .on('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      pinId = null;
      cancelStockHoverClear();
      hoverId = null;
      updateVisuals();
      showTooltip(tt, '', false);
      opts.onStockClick?.(code);
    });

  node
    .filter((d) => d.type === 'holder')
    .on('mouseover', (e, d) => {
      cancelStockHoverClear();
      hoverId = d.id;
      updateVisuals();
      const lf =
        d.localForeign === 'L'
          ? opts.t('local')
          : d.localForeign === 'F'
            ? opts.t('foreign')
            : '—';
      showTooltip(
        tt,
        `<div class="tt-ticker">${esc(d.name ?? '')}</div>
        <div class="tt-issuer">${esc(opts.typeLabel(d.investorType ?? '') || 'N/A')} · ${lf}</div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_stake_pct')}</span><span class="tt-val">${formatPct(d.pct ?? 0)}</span></div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_total_shares')}</span><span class="tt-val">${formatInt(d.shares ?? 0)}</span></div>
        ${explorerNetworkTooltipHintsHtml(opts.t)}`,
        true,
        e.clientX,
        e.clientY
      );
    })
    .on('mousemove', (e) => showTooltip(tt, '', true, e.clientX, e.clientY))
    .on('mouseleave', () => {
      scheduleStockHoverClear();
    })
    .on('click', (e, d) => {
      e.stopPropagation();
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => {
        clickTimer = null;
        const id = d.id;
        pinId = pinId === id ? null : id;
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
      cancelStockHoverClear();
      hoverId = null;
      updateVisuals();
      showTooltip(tt, '', false);
      opts.onInvestorClick(d.name ?? '');
    });

  const zoomSt = attachNetworkZoom(
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

  function applyStockFitTransform() {
    const pad = 56;
    const hubPad = 46 + NODE_SUBTITLE_PAD * 2 + 48;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of nodes) {
      const x = d.x ?? 0;
      const y = d.y ?? 0;
      const er =
        d.type === 'stock-center' ? hubPad : radiusScale(d.pct ?? 0) + NODE_SUBTITLE_PAD * 2 + 36;
      const lx = 28;
      minX = Math.min(minX, x - er - lx);
      maxX = Math.max(maxX, x + er + lx);
      minY = Math.min(minY, y - er);
      maxY = Math.max(maxY, y + er);
    }
    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return;
    const t = computeFitTransformFromBounds(minX, minY, maxX, maxY, width, height, pad, 1);
    host.__tmdBrowseFit = t;
    svg.call(zoomSt.transform, t);
    currentZoomK = t.k;
    updateVisuals();
  }

  function syncStockGeometry() {
    link
      .attr('x1', (d) => (d.source as SimNode).x ?? 0)
      .attr('y1', (d) => (d.source as SimNode).y ?? 0)
      .attr('x2', (d) => (d.target as SimNode).x ?? 0)
      .attr('y2', (d) => (d.target as SimNode).y ?? 0);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  }

  syncStockGeometry();
  applyStockFitTransform();

  host.__tmdGraphSimStop = () => {};
  attachGraphResize(container, width, () =>
    renderStockNetwork(container, rows, code, opts)
  );

  updateVisuals();

  return () => {
    cancelStockHoverClear();
    cancelStockTableFocusDebounce();
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    disposeGraph(container);
  };
}

/** Max stocks per member in the group graph (fewer = less crowding). */
const GROUP_GRAPH_STOCKS_PER_MEMBER = 5;

/** Detail group network: tall enough to read; cap for laptop screens. */
function groupDetailGraphHeight(): number {
  if (typeof window === 'undefined') return 760;
  return Math.min(940, Math.max(600, Math.round(window.innerHeight * 0.8)));
}

function otherHoldersBlock(
  allRows: HolderRow[],
  shareCode: string,
  excludeInvestors: string | Set<string>,
  label: string,
  limit: number
): string {
  const excluded = (name: string) =>
    typeof excludeInvestors === 'string'
      ? excludeInvestors === name
      : excludeInvestors.has(name);
  const list = allRows
    .filter((r) => r.share_code === shareCode && !excluded(r.investor_name))
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, limit);
  if (!list.length) return '';
  const lines = list
    .map((r) => {
      const nm = r.investor_name.length > 42 ? `${r.investor_name.slice(0, 40)}…` : r.investor_name;
      return `<div class="tt-row"><span class="tt-label">${esc(nm)}</span><span class="tt-val">${formatPct(r.percentage)}</span></div>`;
    })
    .join('');
  return `<div class="tt-section">${esc(label)}</div>${lines}`;
}

function memberTopPositionsBlock(rows: HolderRow[], memberName: string, label: string, limit: number): string {
  const list = rows
    .filter((r) => r.investor_name === memberName)
    .sort((a, b) => b.percentage - a.percentage)
    .slice(0, limit);
  if (!list.length) return '';
  const lines = list
    .map(
      (r) =>
        `<div class="tt-row"><span class="tt-label">${esc(r.share_code)}</span><span class="tt-val">${formatPct(r.percentage)}</span></div>`
    )
    .join('');
  return `<div class="tt-section">${esc(label)}</div>${lines}`;
}

/**
 * Hub = group label, ring1 = members, ring2 = each member’s top holdings (by shares).
 */
export function renderGroupNetwork(
  container: HTMLElement,
  opts: {
    groupLabel: string;
    members: string[];
    groupRows: HolderRow[];
    /** Full dataset: used to list other holders on the same ticker. */
    allRows?: HolderRow[];
    typeLabel: (tp: string) => string;
    t: (k: string) => string;
    onInvestorClick: (name: string) => void;
    onStockClick: (code: string) => void;
    /** Double-click group hub: open group in Explorer (URL + state). */
    onGroupHubClick?: () => void;
    /** Table filter: member row and/or stock row in the portfolio table below. */
    onTableFocusChange?: (f: null | { memberName?: string; shareCode?: string }) => void;
  }
) {
  disposeGraph(container);
  container.querySelectorAll('svg').forEach((s) => s.remove());

  const membersListed = opts.members.filter((m) =>
    opts.groupRows.some((r) => r.investor_name === m)
  );
  if (!membersListed.length) {
    const p = document.createElement('p');
    p.className = 'explorer-empty-graph';
    p.style.cssText =
      'padding:24px;color:var(--text-muted);font-size:14px;text-align:center;margin:0';
    p.textContent = opts.t('group_graph_no_members');
    container.appendChild(p);
    return () => {
      container.innerHTML = '';
    };
  }

  const width = graphInnerWidth(container);
  const height = groupDetailGraphHeight();
  container.style.minHeight = `${height}px`;
  const hostGrp = container as GraphHost;
  const hubId = '__group__';
  const hubNode: SimNode = {
    id: hubId,
    name: opts.groupLabel,
    type: 'group-hub',
  };
  const memberNodes: SimNode[] = membersListed.map((name, i) => ({
    id: `m${i}`,
    name,
    type: 'group-member',
  }));
  const links: SimLink[] = [];

  type MemEdge = { memberId: string; memberName: string; row: HolderRow };
  const edges: MemEdge[] = [];
  const pairSeen = new Set<string>();

  memberNodes.forEach((mem) => {
    links.push({ source: hubId, target: mem.id, pct: 1 });
    const mrows = opts.groupRows
      .filter((r) => r.investor_name === mem.name)
      .sort((a, b) => b.total_holding_shares - a.total_holding_shares)
      .slice(0, GROUP_GRAPH_STOCKS_PER_MEMBER);
    mrows.forEach((r) => {
      const pk = `${mem.id}|${r.share_code}`;
      if (pairSeen.has(pk)) return;
      pairSeen.add(pk);
      edges.push({ memberId: mem.id, memberName: mem.name ?? '', row: r });
      links.push({
        source: mem.id,
        target: `stk_${r.share_code}`,
        pct: Number.isFinite(r.percentage) ? r.percentage : 0,
      });
    });
  });

  const byTicker = new Map<
    string,
    { rows: HolderRow[]; lines: Array<{ member: string; pct: number; shares: number }> }
  >();
  for (const e of edges) {
    const code = e.row.share_code;
    if (!byTicker.has(code)) {
      byTicker.set(code, { rows: [], lines: [] });
    }
    const b = byTicker.get(code)!;
    b.rows.push(e.row);
    b.lines.push({
      member: e.memberName,
      pct: Number.isFinite(e.row.percentage) ? e.row.percentage : 0,
      shares: e.row.total_holding_shares,
    });
  }

  const stockNodes: SimNode[] = [];
  for (const [code, agg] of byTicker) {
    const lines = [...agg.lines].sort((a, b) => b.pct - a.pct);
    const maxPct = lines.length ? Math.max(...lines.map((l) => l.pct)) : 0;
    const sumShares = lines.reduce((s, l) => s + l.shares, 0);
    const topRow = agg.rows.reduce((a, b) => (a.percentage >= b.percentage ? a : b));
    stockNodes.push({
      id: `stk_${code}`,
      name: code,
      issuer: topRow.issuer_name,
      pct: maxPct,
      shares: sumShares,
      investorType: topRow.investor_type,
      type: 'group-stock',
      groupStockLines: lines,
    });
  }

  const nodes = [hubNode, ...memberNodes, ...stockNodes];
  const adjGrp = buildAdjacencyUndirected(links);
  const rawMax = d3.max(stockNodes, (d) => (Number.isFinite(d.pct) ? (d.pct as number) : 0)) ?? 0;
  const maxPct = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 1;
  const radiusScale = d3.scaleSqrt().domain([0, maxPct]).range([16, 40]);
  const linkScale = d3.scaleLinear().domain([0, maxPct]).range([1, 5]);
  const maxStockDeg = Math.max(1, ...stockNodes.map((s) => s.groupStockLines?.length ?? 1));
  const groupStockR = (d: SimNode) => {
    if (d.type !== 'group-stock') return radiusScale(d.pct ?? 0);
    const deg = d.groupStockLines?.length ?? 1;
    const boost = d3.scaleSqrt().domain([1, maxStockDeg]).range([0, 11])(deg);
    return radiusScale(d.pct ?? 0) + boost;
  };
  const cx = width / 2;
  const cy = height / 2;
  hubNode.x = cx;
  hubNode.y = cy;
  hubNode.fx = cx;
  hubNode.fy = cy;

  const nMem = memberNodes.length;
  const baseR = Math.min(width, height);
  memberNodes.forEach((d, i) => {
    const ang = (nMem ? i / nMem : 0) * 2 * Math.PI - Math.PI / 2;
    const rad = baseR * 0.2;
    d.x = cx + Math.cos(ang) * rad;
    d.y = cy + Math.sin(ang) * rad;
  });

  const stockIdToMemberIds = new Map<string, string[]>();
  for (const e of edges) {
    const sid = `stk_${e.row.share_code}`;
    if (!stockIdToMemberIds.has(sid)) stockIdToMemberIds.set(sid, []);
    stockIdToMemberIds.get(sid)!.push(e.memberId);
  }
  stockNodes.forEach((d) => {
    const mids = stockIdToMemberIds.get(d.id) ?? [];
    let ang = -Math.PI / 2;
    if (mids.length) {
      const angles = mids.map((mid) => {
        const m = memberNodes.find((x) => x.id === mid);
        return Math.atan2((m?.y ?? cy) - cy, (m?.x ?? cx) - cx);
      });
      ang = angles.reduce((a, b) => a + b, 0) / angles.length;
    }
    const rad = baseR * 0.33;
    d.x = cx + Math.cos(ang) * rad;
    d.y = cy + Math.sin(ang) * rad;
  });

  const simGrp = d3
    .forceSimulation(nodes)
    .velocityDecay(0.55)
    .alphaDecay(0.06)
    .alphaMin(0.001)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d: SimNode) => d.id)
        .distance((d) => {
          const s = (d.source as SimNode).type;
          if (s === 'group-hub') return 58;
          return 46 + (1 - ((d as SimLink).pct ?? 0) / maxPct) * 26;
        })
        .strength((d) => ((d.source as SimNode).type === 'group-hub' ? 0.88 : 0.68))
    )
    .force('charge', d3.forceManyBody().strength(-240))
    .force('center', d3.forceCenter(cx, cy).strength(0.03))
    .force('x', d3.forceX(cx).strength(0.016))
    .force('y', d3.forceY(cy).strength(0.016))
    .force(
      'collide',
      d3
        .forceCollide<SimNode>()
        .radius((d) => {
          if (d.type === 'group-hub') return 58 + NODE_SUBTITLE_PAD * 2;
          if (d.type === 'group-member') return 40 + NODE_SUBTITLE_PAD * 2;
          return groupStockR(d) + 26 + NODE_SUBTITLE_PAD * 2;
        })
        .iterations(3)
    );

  runForceSimulationStatic(simGrp, {
    maxTicks: 560,
    beforeTick: () => {
      for (const d of nodes) {
        if (d.type === 'group-hub') {
          d.fx = cx;
          d.fy = cy;
        }
      }
    },
  });

  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('overflow', 'hidden')
    .style('width', '100%')
    .style('height', `${height}px`)
    .style('display', 'block');

  container.style.minHeight = `${height}px`;

  const inner = svg.append('g').attr('class', 'tmd-graph-zoom-inner');
  appendPanLayer(inner, width, height);

  const link = inner
    .append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', GRAPH_LINK_STROKE_SOFT)
    .attr('stroke-width', (d) =>
      (d.source as SimNode).type === 'group-hub' ? 0.7 : 0.35 + linkScale((d as SimLink).pct) * 0.28
    )
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
  const allRows = opts.allRows ?? opts.groupRows;
  node.each(function (d) {
    const g = d3.select(this);
    if (d.type === 'group-hub') {
      const hubR = 54;
      g.append('circle')
        .attr('r', hubR)
        .attr('fill', 'var(--purple)')
        .attr('opacity', 0.92)
        .attr('pointer-events', 'all')
        .attr('stroke', 'none')
        .attr('stroke-width', 0);
      g.append('text')
        .attr('class', 'tmd-graph-hub-code')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', '13px')
        .attr('font-weight', '800')
        .attr('pointer-events', 'none')
        .text('◎');
      appendNodeNameBelow(g, d.name ?? '', hubR + 14, 13);
      appendNodeSubtitle(
        g,
        `${formatInt(membersListed.length)} ${opts.t('members')}`,
        hubR + 30,
        11
      );
      appendNativeTitle(g, [
        d.name ?? '',
        `${formatInt(membersListed.length)} ${opts.t('members')}`,
        opts.t('graph_native_hub_group_hint'),
      ]);
    } else if (d.type === 'group-member') {
      const rMem = 19;
      g.append('circle')
        .attr('r', rMem)
        .attr('fill', 'var(--accent-soft)')
        .attr('stroke', 'var(--accent)')
        .attr('stroke-width', 2)
        .attr('pointer-events', 'all');
      const posN = opts.groupRows.filter((r) => r.investor_name === d.name).length;
      appendNodeNameBelow(g, d.name ?? '', rMem + 12, 11);
      appendNodeSubtitle(
        g,
        `${formatInt(posN)} ${opts.t('col_stocks')}`,
        rMem + 26,
        9
      );
      appendNativeTitle(g, [
        d.name ?? '',
        `${formatInt(posN)} ${opts.t('col_stocks')}`,
        opts.t('group_graph_click_member'),
      ]);
    } else {
      const r = groupStockR(d);
      const fill = graphNodeFillForType(d.investorType ?? '');
      const ring = graphNodeStrokeForFill(fill);
      const nLinks = d.groupStockLines?.length ?? 0;
      g.append('circle')
        .attr('r', r)
        .attr('fill', fill)
        .attr('stroke', ring || 'none')
        .attr('stroke-width', ring ? 1.5 : 0)
        .attr('pointer-events', 'all');
      g.append('text')
        .attr('class', 'tmd-graph-stock-ticker')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', Math.min(14, 8 + r * 0.26) + 'px')
        .attr('font-weight', '800')
        .attr('pointer-events', 'none')
        .text(d.name ?? '');
      appendNodeSubtitle(g, d.issuer ?? '', r + 12, 9);
      appendNodeSubtitle(
        g,
        `${formatInt(nLinks)} ${opts.t('graph_sub_group_links')}`,
        r + 26,
        9
      );
      const lines = d.groupStockLines ?? [];
      appendNativeTitle(g, [
        String(d.name ?? ''),
        d.issuer ?? '',
        lines.map((l) => `${l.member}: ${formatPct(l.pct)}`).join('\n'),
      ]);
    }
  });

  mountExplorerNetworkLegend(container, opts.t, EXPLORER_LEGEND_GROUP);

  let hoverIdGrp: string | null = null;
  let pinIdGrp: string | null = null;
  let currentZoomKGrp = 1;
  let clickTimerGrp: ReturnType<typeof setTimeout> | null = null;
  let panPointerDownGrp: { x: number; y: number } | null = null;
  let hoverClearTimerGrp: ReturnType<typeof setTimeout> | null = null;
  let lastEmittedGrp: string | undefined = undefined;
  let tableFocusTimerGrp: ReturnType<typeof setTimeout> | null = null;
  let tableFocusPendingSerialGrp: string | undefined = undefined;

  function cancelGroupTableFocusDebounce() {
    if (tableFocusTimerGrp) {
      clearTimeout(tableFocusTimerGrp);
      tableFocusTimerGrp = null;
    }
    tableFocusPendingSerialGrp = undefined;
  }

  function cancelGroupHoverClear() {
    if (hoverClearTimerGrp) {
      clearTimeout(hoverClearTimerGrp);
      hoverClearTimerGrp = null;
    }
  }

  function scheduleGroupHoverClear() {
    cancelGroupHoverClear();
    hoverClearTimerGrp = setTimeout(() => {
      hoverClearTimerGrp = null;
      hoverIdGrp = null;
      updateVisualsGrp();
      showTooltip(tt, '', false);
      if (tt) tt.style.maxWidth = '';
    }, GRAPH_HOVER_CLEAR_MS);
  }

  function computeGroupTableFocus(): {
    next: { memberName?: string; shareCode?: string } | null;
    serial: string;
  } {
    const c = hoverIdGrp ?? pinIdGrp;
    let next: { memberName?: string; shareCode?: string } | null = null;
    if (!c || c === hubId) next = null;
    else if (c.startsWith('stk_')) next = { shareCode: c.slice(4) };
    else if (c.startsWith('m')) {
      const mem = memberNodes.find((x) => x.id === c);
      if (mem?.name) next = { memberName: mem.name };
    }
    return { next, serial: JSON.stringify(next) };
  }

  function queueGroupTableFocusEmit() {
    if (!opts.onTableFocusChange) return;
    const { next, serial } = computeGroupTableFocus();
    if (hoverIdGrp == null) {
      cancelGroupTableFocusDebounce();
      if (lastEmittedGrp !== serial) {
        lastEmittedGrp = serial;
        opts.onTableFocusChange(next);
      }
      return;
    }
    if (tableFocusTimerGrp != null && tableFocusPendingSerialGrp === serial) {
      return;
    }
    tableFocusPendingSerialGrp = serial;
    if (tableFocusTimerGrp) clearTimeout(tableFocusTimerGrp);
    tableFocusTimerGrp = setTimeout(() => {
      tableFocusTimerGrp = null;
      tableFocusPendingSerialGrp = undefined;
      const { next: n2, serial: s2 } = computeGroupTableFocus();
      if (lastEmittedGrp !== s2) {
        lastEmittedGrp = s2;
        opts.onTableFocusChange(n2);
      }
    }, GRAPH_TABLE_FOCUS_DEBOUNCE_MS);
  }

  function updateVisualsGrp() {
    const center = hoverIdGrp ?? pinIdGrp;
    const fs = focusNeighborSet(adjGrp, center);
    const showAllLabels = currentZoomKGrp >= DETAIL_ZOOM_LABEL_K;
    const dim = center !== null && !showAllLabels;
    /** Keep label text readable on screen when the fit transform uses a small scale. */
    const kEff = Math.max(0.28, currentZoomKGrp);
    const inv = 1 / kEff;

    node.each(function (d) {
      const g = d3.select(this);
      const inFs = fs.has(d.id);
      const isCenter = !!center && d.id === center;
      g.style('opacity', dim ? (inFs ? 1 : 0.16) : 1);
      g.select('circle').each(function () {
        const el = d3.select(this);
        if (isCenter) {
          el.attr('stroke', 'var(--text)').attr('stroke-width', 2.2);
        } else if (d.type === 'group-member') {
          el.attr('stroke', 'var(--accent)').attr('stroke-width', 2);
        } else if (d.type === 'group-stock') {
          const fill = graphNodeFillForType(d.investorType ?? '');
          const ring = graphNodeStrokeForFill(fill);
          el.attr('stroke', ring || 'none').attr('stroke-width', ring ? 1.5 : 0);
        } else {
          el.attr('stroke', 'none').attr('stroke-width', 0);
        }
      });

      const baseShow = networkGraphLabelsVisible(center, inFs, showAllLabels);
      if (d.type === 'group-hub') {
        g.selectAll('.tmd-graph-hub-code').attr('opacity', 1).attr('font-size', `${Math.min(24, 13 * inv)}px`);
        g.selectAll('.tmd-graph-node-name').attr('opacity', 1).attr('font-size', `${Math.min(30, 15 * inv)}px`);
        g.selectAll('.tmd-graph-node-sub').attr('opacity', 1).attr('font-size', `${Math.min(20, 11 * inv)}px`);
      } else if (d.type === 'group-member') {
        g.selectAll('.tmd-graph-node-name')
          .attr('opacity', baseShow ? 1 : 0)
          .attr('font-size', `${Math.min(24, 12 * inv)}px`);
        g.selectAll('.tmd-graph-node-sub')
          .attr('opacity', baseShow ? 1 : 0)
          .attr('font-size', `${Math.min(18, 10 * inv)}px`);
      } else if (d.type === 'group-stock') {
        const r = groupStockR(d);
        const baseTicker = Math.min(14, 8 + r * 0.26);
        g.selectAll('.tmd-graph-stock-ticker')
          .attr('opacity', 1)
          .attr('font-size', `${Math.min(22, baseTicker * inv)}px`);
        g.selectAll('.tmd-graph-node-sub')
          .attr('opacity', baseShow ? 1 : 0)
          .attr('font-size', `${Math.min(18, 9.5 * inv)}px`);
      }
    });

    link
      .attr('stroke-opacity', (d) => {
        const [a, b] = linkEndpointResolved(d.source, d.target);
        return networkLinkStrokeOpacity(center, a, b, fs);
      })
      .attr('stroke-width', (d) => {
        const base =
          (d.source as SimNode).type === 'group-hub' ? 0.7 : 0.35 + linkScale((d as SimLink).pct) * 0.28;
        const [a, b] = linkEndpointResolved(d.source, d.target);
        return base * networkLinkWidthFocusFactor(center, a, b, fs);
      });
    queueGroupTableFocusEmit();
  }

  inner
    .select('.tmd-graph-pan-layer')
    .on('mousedown', (e) => {
      panPointerDownGrp = { x: e.clientX, y: e.clientY };
    })
    .on('click', (e) => {
      if (panPointerDownGrp == null) return;
      const dx = e.clientX - panPointerDownGrp.x;
      const dy = e.clientY - panPointerDownGrp.y;
      panPointerDownGrp = null;
      if (dx * dx + dy * dy > DETAIL_PAN_CLICK_MAX_DIST * DETAIL_PAN_CLICK_MAX_DIST) return;
      e.stopPropagation();
      cancelGroupHoverClear();
      hoverIdGrp = null;
      pinIdGrp = null;
      updateVisualsGrp();
      showTooltip(tt, '', false);
      if (tt) tt.style.maxWidth = '';
    });
  inner.on('mouseleave.pantrackGrp', () => {
    panPointerDownGrp = null;
  });

  node
    .filter((d) => d.type === 'group-hub')
    .on('mouseover', (e, d) => {
      cancelGroupHoverClear();
      hoverIdGrp = d.id;
      updateVisualsGrp();
      showTooltip(
        tt,
        `<div class="tt-ticker">${esc(d.name ?? '')}</div>
        ${explorerNetworkTooltipHintsHtml(opts.t)}`,
        true,
        e.clientX,
        e.clientY
      );
    })
    .on('mousemove', (e) => showTooltip(tt, '', true, e.clientX, e.clientY))
    .on('mouseleave', () => {
      scheduleGroupHoverClear();
    })
    .on('click', (e) => {
      e.stopPropagation();
      if (clickTimerGrp) clearTimeout(clickTimerGrp);
      clickTimerGrp = setTimeout(() => {
        clickTimerGrp = null;
        pinIdGrp = pinIdGrp === hubId ? null : hubId;
        updateVisualsGrp();
      }, DETAIL_CLICK_PIN_MS);
    })
    .on('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (clickTimerGrp) {
        clearTimeout(clickTimerGrp);
        clickTimerGrp = null;
      }
      pinIdGrp = null;
      cancelGroupHoverClear();
      hoverIdGrp = null;
      updateVisualsGrp();
      showTooltip(tt, '', false);
      if (tt) tt.style.maxWidth = '';
      opts.onGroupHubClick?.();
    });

  node
    .filter((d) => d.type === 'group-member')
    .on('mouseover', (e, d) => {
      cancelGroupHoverClear();
      hoverIdGrp = d.id;
      updateVisualsGrp();
      const positions = memberTopPositionsBlock(
        opts.groupRows,
        d.name ?? '',
        opts.t('group_tt_member_positions'),
        6
      );
      showTooltip(
        tt,
        `<div class="tt-ticker">${esc(d.name ?? '')}</div>
        ${positions}
        <div class="tt-issuer">${esc(opts.t('group_graph_click_member'))}</div>
        ${explorerNetworkTooltipHintsHtml(opts.t)}`,
        true,
        e.clientX,
        e.clientY
      );
      if (tt) tt.style.maxWidth = '360px';
    })
    .on('mousemove', (e) => showTooltip(tt, '', true, e.clientX, e.clientY))
    .on('mouseleave', () => {
      scheduleGroupHoverClear();
    })
    .on('click', (e, d) => {
      e.stopPropagation();
      if (clickTimerGrp) clearTimeout(clickTimerGrp);
      clickTimerGrp = setTimeout(() => {
        clickTimerGrp = null;
        pinIdGrp = pinIdGrp === d.id ? null : d.id;
        updateVisualsGrp();
      }, DETAIL_CLICK_PIN_MS);
    })
    .on('dblclick', (e, d) => {
      e.preventDefault();
      e.stopPropagation();
      if (clickTimerGrp) {
        clearTimeout(clickTimerGrp);
        clickTimerGrp = null;
      }
      pinIdGrp = null;
      cancelGroupHoverClear();
      hoverIdGrp = null;
      updateVisualsGrp();
      showTooltip(tt, '', false);
      if (tt) tt.style.maxWidth = '';
      opts.onInvestorClick(d.name ?? '');
    });

  node
    .filter((d) => d.type === 'group-stock')
    .on('mouseover', (e, d) => {
      cancelGroupHoverClear();
      hoverIdGrp = d.id;
      updateVisualsGrp();
      const lines = d.groupStockLines ?? [];
      const exclude = new Set(lines.map((l) => l.member));
      const others = otherHoldersBlock(
        allRows,
        String(d.name ?? ''),
        exclude,
        opts.t('group_tt_other_holders'),
        6
      );
      const groupLines =
        lines.length > 0
          ? `<div class="tt-section">${esc(opts.t('group_tt_group_members_on_stock'))}</div>${lines
              .map(
                (l) =>
                  `<div class="tt-row"><span class="tt-label">${esc(l.member)}</span><span class="tt-val">${formatPct(l.pct)} · ${formatInt(l.shares)}</span></div>`
              )
              .join('')}`
          : '';
      showTooltip(
        tt,
        `<div class="tt-ticker">${esc(d.name ?? '')}</div>
        <div class="tt-issuer">${esc(d.issuer ?? '')}</div>
        ${groupLines}
        <div class="tt-row"><span class="tt-label">${esc(opts.t('group_tt_max_in_group'))}</span><span class="tt-val">${formatPct(d.pct ?? 0)}</span></div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_total_shares')}</span><span class="tt-val">${formatInt(d.shares ?? 0)}</span></div>
        <div class="tt-issuer" style="margin-top:2px;font-size:11px">${esc(opts.t('group_tt_sum_group_members'))}</div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_type')}</span><span class="tt-val">${esc(opts.typeLabel(d.investorType ?? '') || 'N/A')}</span></div>
        ${others}
        ${explorerNetworkTooltipHintsHtml(opts.t)}`,
        true,
        e.clientX,
        e.clientY
      );
      if (tt) tt.style.maxWidth = '420px';
    })
    .on('mousemove', (e) => showTooltip(tt, '', true, e.clientX, e.clientY))
    .on('mouseleave', () => {
      scheduleGroupHoverClear();
    })
    .on('click', (e, d) => {
      e.stopPropagation();
      if (clickTimerGrp) clearTimeout(clickTimerGrp);
      clickTimerGrp = setTimeout(() => {
        clickTimerGrp = null;
        pinIdGrp = pinIdGrp === d.id ? null : d.id;
        updateVisualsGrp();
      }, DETAIL_CLICK_PIN_MS);
    })
    .on('dblclick', (e, d) => {
      e.preventDefault();
      e.stopPropagation();
      if (clickTimerGrp) {
        clearTimeout(clickTimerGrp);
        clickTimerGrp = null;
      }
      pinIdGrp = null;
      cancelGroupHoverClear();
      hoverIdGrp = null;
      updateVisualsGrp();
      showTooltip(tt, '', false);
      if (tt) tt.style.maxWidth = '';
      opts.onStockClick(String(d.name ?? ''));
    });

  const zoomGrp = attachNetworkZoom(
    container,
    svg,
    inner,
    opts.t,
    () => hostGrp.__tmdBrowseFit ?? d3.zoomIdentity,
    (event) => {
      currentZoomKGrp = event.transform.k;
      updateVisualsGrp();
    }
  );

  function applyGroupFitTransform() {
    const pad = 44;
    const hubPad = 62 + NODE_SUBTITLE_PAD * 2 + 64;
    const memPad = 21 + NODE_SUBTITLE_PAD * 2 + 48;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const d of nodes) {
      const x = d.x ?? 0;
      const y = d.y ?? 0;
      let er: number;
      if (d.type === 'group-hub') er = hubPad;
      else if (d.type === 'group-member') er = memPad;
      else er = groupStockR(d) + NODE_SUBTITLE_PAD * 2 + 40;
      const lx = 36;
      minX = Math.min(minX, x - er - lx);
      maxX = Math.max(maxX, x + er + lx);
      minY = Math.min(minY, y - er);
      maxY = Math.max(maxY, y + er);
    }
    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return;
    /** Allow zooming in past 1× when the laid-out graph is smaller than the viewport (was capped at 1, which kept the fit tiny). */
    const t = computeFitTransformFromBounds(minX, minY, maxX, maxY, width, height, pad, 1.85);
    hostGrp.__tmdBrowseFit = t;
    svg.call(zoomGrp.transform, t);
    currentZoomKGrp = t.k;
    updateVisualsGrp();
  }

  function syncGroupGeometry() {
    link
      .attr('x1', (d) => (d.source as SimNode).x ?? 0)
      .attr('y1', (d) => (d.source as SimNode).y ?? 0)
      .attr('x2', (d) => (d.target as SimNode).x ?? 0)
      .attr('y2', (d) => (d.target as SimNode).y ?? 0);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  }

  syncGroupGeometry();
  applyGroupFitTransform();

  hostGrp.__tmdGraphSimStop = () => {};
  attachGraphResize(container, width, () =>
    renderGroupNetwork(container, opts)
  );

  updateVisualsGrp();

  return () => {
    cancelGroupHoverClear();
    cancelGroupTableFocusDebounce();
    if (clickTimerGrp) {
      clearTimeout(clickTimerGrp);
      clickTimerGrp = null;
    }
    disposeGraph(container);
  };
}
