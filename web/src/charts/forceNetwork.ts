import * as d3 from 'd3';
import type { HolderRow } from '@/domain/holders';
import { formatInt, formatPct, esc } from '@/lib/format';
import {
  GRAPH_LINK_STROKE,
  graphNodeFillForType,
  graphNodeStrokeForFill,
} from '@/charts/d3common';

type SimNode = d3.SimulationNodeDatum & {
  id: string;
  name?: string;
  issuer?: string;
  pct?: number;
  shares?: number;
  investorType?: string;
  localForeign?: string;
  type: string;
};

type SimLink = d3.SimulationLinkDatum<SimNode> & { pct: number };

function showTooltip(
  el: HTMLElement | null,
  html: string,
  show: boolean,
  clientX?: number,
  clientY?: number
) {
  if (!el) return;
  if (!show) {
    el.classList.remove('show');
    return;
  }
  el.innerHTML = html;
  el.classList.add('show');
  if (clientX != null) el.style.left = `${clientX + 14}px`;
  if (clientY != null) el.style.top = `${clientY - 10}px`;
}

export function renderInvestorNetwork(
  container: HTMLElement,
  rows: HolderRow[],
  investorName: string,
  opts: {
    typeLabel: (tp: string) => string;
    t: (k: string) => string;
    onStockClick: (code: string) => void;
  }
) {
  container.querySelectorAll('svg').forEach((s) => s.remove());
  const width = container.clientWidth || 700;
  const height = 520;
  const investorNode: SimNode = {
    id: '__investor__',
    name: investorName,
    type: 'investor',
  };
  const stockNodes: SimNode[] = rows.map((r) => ({
    id: r.share_code,
    name: r.share_code,
    issuer: r.issuer_name,
    pct: r.percentage,
    shares: r.total_holding_shares,
    investorType: r.investor_type,
    type: 'stock',
  }));
  const nodes = [investorNode, ...stockNodes];
  const links: SimLink[] = stockNodes.map((s) => ({
    source: '__investor__',
    target: s.id,
    pct: s.pct ?? 0,
  }));

  const maxPct = d3.max(rows, (r) => r.percentage) || 1;
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

  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('overflow', 'visible');

  const sim = d3
    .forceSimulation(nodes)
    .velocityDecay(0.66)
    .alphaDecay(0.05)
    .alphaMin(0.001)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d: SimNode) => d.id)
        .distance((d) => 118 + (1 - (d as SimLink).pct / maxPct) * 52)
        .strength(0.92)
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
          if (d.type === 'investor') return 48;
          const r = radiusScale(d.pct ?? 0);
          return r + 36;
        })
        .iterations(2)
    );

  const link = svg
    .append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', GRAPH_LINK_STROKE)
    .attr('stroke-width', (d) => linkScale(d.pct))
    .attr('stroke-opacity', 0.95)
    .attr('stroke-linecap', 'round')
    .attr('pointer-events', 'none');

  const graphPad = 48;
  let draggingHub = false;
  const svgNode = svg.node()!;
  const node = svg
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('cursor', 'grab')
    .call(
      d3
        .drag<SVGGElement, SimNode>()
        .container(() => svgNode)
        .filter((event) => !event.ctrlKey && !event.button)
        .on('start', (e, d) => {
          if (!e.active) sim.alphaTarget(0.35).restart();
          if (d.type === 'investor') draggingHub = true;
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (e, d) => {
          const src = e.sourceEvent || e;
          const [px, py] = d3.pointer(src, svgNode);
          d.fx = Math.max(graphPad, Math.min(width - graphPad, px));
          d.fy = Math.max(graphPad, Math.min(height - graphPad, py));
        })
        .on('end', (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          if (d.type === 'investor') {
            draggingHub = false;
            d.fx = cx;
            d.fy = cy;
            d.x = cx;
            d.y = cy;
            sim.alpha(0.22).restart();
          } else {
            d.fx = null;
            d.fy = null;
          }
        })
    );

  const tt = document.getElementById('tooltip');
  node.each(function (d) {
    const g = d3.select(this);
    if (d.type === 'investor') {
      g.append('circle')
        .attr('r', 40)
        .attr('fill', 'var(--accent)')
        .attr('opacity', 0.95)
        .attr('pointer-events', 'all');
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', '10px')
        .attr('font-weight', '700')
        .attr('pointer-events', 'none')
        .text((d.name ?? '').slice(0, 18) + ((d.name?.length ?? 0) > 18 ? '…' : ''));
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
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', Math.min(14, 9 + r * 0.22) + 'px')
        .attr('font-weight', '800')
        .attr('pointer-events', 'none')
        .text(d.id);
    }
  });

  node
    .filter((d) => d.type === 'stock')
    .on('mouseover', (e, d) => {
      showTooltip(
        tt,
        `<div class="tt-ticker">${esc(d.id)}</div>
        <div class="tt-issuer">${esc(d.issuer ?? '')}</div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_stake_pct')}</span><span class="tt-val">${formatPct(d.pct ?? 0)}</span></div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_total_shares')}</span><span class="tt-val">${formatInt(d.shares ?? 0)}</span></div>
        <div class="tt-row"><span class="tt-label">${opts.t('col_type')}</span><span class="tt-val">${esc(opts.typeLabel(d.investorType ?? '') || 'N/A')}</span></div>`,
        true,
        e.clientX,
        e.clientY
      );
    })
    .on('mousemove', (e) => showTooltip(tt, '', true, e.clientX, e.clientY))
    .on('mouseout', () => showTooltip(tt, '', false))
    .on('click', (_e, d) => opts.onStockClick(d.id));

  sim.on('tick', () => {
    nodes.forEach((d) => {
      if (d.type === 'investor') {
        if (!draggingHub) {
          d.fx = cx;
          d.fy = cy;
          d.x = cx;
          d.y = cy;
        }
      } else {
        d.x = Math.max(graphPad, Math.min(width - graphPad, d.x ?? 0));
        d.y = Math.max(graphPad, Math.min(height - graphPad, d.y ?? 0));
      }
    });
    link
      .attr('x1', (d) => (d.source as SimNode).x ?? 0)
      .attr('y1', (d) => (d.source as SimNode).y ?? 0)
      .attr('x2', (d) => (d.target as SimNode).x ?? 0)
      .attr('y2', (d) => (d.target as SimNode).y ?? 0);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  return () => sim.stop();
}

export function renderStockNetwork(
  container: HTMLElement,
  rows: HolderRow[],
  code: string,
  opts: {
    typeLabel: (tp: string) => string;
    t: (k: string) => string;
    onInvestorClick: (name: string) => void;
  }
) {
  container.querySelectorAll('svg').forEach((s) => s.remove());
  container.style.minHeight = '520px';
  const width = container.clientWidth || 700;
  const height = 520;
  const stockNode: SimNode = { id: '__stock__', name: code, type: 'stock-center' };
  const holderNodes: SimNode[] = rows.map((r) => ({
    id: r.investor_name,
    name: r.investor_name,
    pct: r.percentage,
    shares: r.total_holding_shares,
    investorType: r.investor_type,
    localForeign: r.local_foreign,
    type: 'holder',
  }));
  const nodes = [stockNode, ...holderNodes];
  const links: SimLink[] = holderNodes.map((h) => ({
    source: '__stock__',
    target: h.id,
    pct: h.pct ?? 0,
  }));

  const maxPct = d3.max(rows, (r) => r.percentage) || 1;
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

  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .attr('overflow', 'visible')
    .style('width', '100%')
    .style('height', '520px')
    .style('display', 'block');

  const sim = d3
    .forceSimulation(nodes)
    .velocityDecay(0.66)
    .alphaDecay(0.05)
    .alphaMin(0.001)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d: SimNode) => d.id)
        .distance((d) => 118 + (1 - (d as SimLink).pct / maxPct) * 52)
        .strength(0.92)
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
          if (d.type === 'stock-center') return 46;
          return radiusScale(d.pct ?? 0) + 34;
        })
        .iterations(2)
    );

  const link = svg
    .append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', GRAPH_LINK_STROKE)
    .attr('stroke-width', (d) => linkScale(d.pct))
    .attr('stroke-opacity', 0.95)
    .attr('stroke-linecap', 'round')
    .attr('pointer-events', 'none');

  const graphPad = 48;
  let draggingHub = false;
  const svgNode = svg.node()!;
  const node = svg
    .append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('cursor', 'grab')
    .call(
      d3
        .drag<SVGGElement, SimNode>()
        .container(() => svgNode)
        .filter((event) => !event.ctrlKey && !event.button)
        .on('start', (e, d) => {
          if (!e.active) sim.alphaTarget(0.35).restart();
          if (d.type === 'stock-center') draggingHub = true;
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (e, d) => {
          const src = e.sourceEvent || e;
          const [px, py] = d3.pointer(src, svgNode);
          d.fx = Math.max(graphPad, Math.min(width - graphPad, px));
          d.fy = Math.max(graphPad, Math.min(height - graphPad, py));
        })
        .on('end', (e, d) => {
          if (!e.active) sim.alphaTarget(0);
          if (d.type === 'stock-center') {
            draggingHub = false;
            d.fx = cx;
            d.fy = cy;
            d.x = cx;
            d.y = cy;
            sim.alpha(0.22).restart();
          } else {
            d.fx = null;
            d.fy = null;
          }
        })
    );

  const tt = document.getElementById('tooltip');
  node.each(function (d) {
    const g = d3.select(this);
    if (d.type === 'stock-center') {
      g.append('circle')
        .attr('r', 42)
        .attr('fill', 'var(--green)')
        .attr('opacity', 0.95)
        .attr('pointer-events', 'all');
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', '14px')
        .attr('font-weight', '800')
        .attr('pointer-events', 'none')
        .text(d.name ?? '');
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
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .attr('fill', '#fff')
        .attr('font-size', Math.min(14, 9 + r * 0.22) + 'px')
        .attr('font-weight', '800')
        .attr('pointer-events', 'none')
        .text(formatPct(d.pct ?? 0));
    }
  });

  node
    .filter((d) => d.type === 'holder')
    .on('mouseover', (e, d) => {
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
        <div class="tt-row"><span class="tt-label">${opts.t('col_total_shares')}</span><span class="tt-val">${formatInt(d.shares ?? 0)}</span></div>`,
        true,
        e.clientX,
        e.clientY
      );
    })
    .on('mousemove', (e) => showTooltip(tt, '', true, e.clientX, e.clientY))
    .on('mouseout', () => showTooltip(tt, '', false))
    .on('click', (_e, d) => opts.onInvestorClick(d.name ?? ''));

  sim.on('tick', () => {
    nodes.forEach((d) => {
      if (d.type === 'stock-center') {
        if (!draggingHub) {
          d.fx = cx;
          d.fy = cy;
          d.x = cx;
          d.y = cy;
        }
      } else {
        d.x = Math.max(graphPad, Math.min(width - graphPad, d.x ?? 0));
        d.y = Math.max(graphPad, Math.min(height - graphPad, d.y ?? 0));
      }
    });
    link
      .attr('x1', (d) => (d.source as SimNode).x ?? 0)
      .attr('y1', (d) => (d.source as SimNode).y ?? 0)
      .attr('x2', (d) => (d.target as SimNode).x ?? 0)
      .attr('y2', (d) => (d.target as SimNode).y ?? 0);
    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  return () => sim.stop();
}
