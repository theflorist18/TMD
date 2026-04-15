import * as d3 from 'd3';
import type { HolderRow } from '@/domain/holders';
import { formatInt, formatPct, esc } from '@/lib/format';

function tt(
  el: HTMLElement | null,
  html: string,
  show: boolean,
  cx?: number,
  cy?: number
) {
  if (!el) return;
  if (!show) {
    el.classList.remove('show');
    return;
  }
  el.innerHTML = html;
  el.classList.add('show');
  if (cx != null) el.style.left = `${cx + 14}px`;
  if (cy != null) el.style.top = `${cy - 10}px`;
}

/** Investor portfolio allocation by stock (shares). */
export function renderInvestorPie(
  container: HTMLElement,
  rows: HolderRow[],
  opts: { t: (k: string) => string; onStockClick: (code: string) => void }
) {
  container.innerHTML = '';
  const size = 260;
  const radius = size / 2;
  const inner = radius * 0.55;
  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${size} ${size}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .append('g')
    .attr('transform', `translate(${radius},${radius})`);

  const totalShares = rows.reduce((s, r) => s + r.total_holding_shares, 0);
  const pieData = rows
    .map((r) => ({
      code: r.share_code,
      value: r.total_holding_shares,
      pct: r.percentage,
      type: r.investor_type,
    }))
    .sort((a, b) => b.value - a.value);

  const pie = d3.pie<(typeof pieData)[0]>().value((d) => d.value).sort(null).padAngle(0.02);
  const arc = d3.arc<d3.PieArcDatum<(typeof pieData)[0]>>().innerRadius(inner).outerRadius(radius - 4);
  const arcHover = d3
    .arc<d3.PieArcDatum<(typeof pieData)[0]>>()
    .innerRadius(inner)
    .outerRadius(radius);

  const color = d3
    .scaleOrdinal<string>()
    .domain(pieData.map((d) => d.code))
    .range(d3.quantize((t) => d3.interpolateRainbow(t * 0.8 + 0.1), Math.max(pieData.length, 2)));

  const tooltip = document.getElementById('tooltip');

  svg
    .selectAll('path')
    .data(pie(pieData))
    .join('path')
    .attr('d', arc)
    .attr('fill', (d) => color(d.data.code))
    .attr('stroke', 'var(--surface)')
    .attr('stroke-width', 1)
    .on('mouseover', function (e, d) {
      d3.select(this).transition().duration(150).attr('d', arcHover);
      const sharePct =
        totalShares > 0 ? ((d.data.value / totalShares) * 100).toFixed(1) : '0';
      tt(
        tooltip,
        `<div class="tt-ticker">${esc(d.data.code)}</div>
        <div class="tt-row"><span class="tt-label">Shares</span><span class="tt-val">${formatInt(d.data.value)}</span></div>
        <div class="tt-row"><span class="tt-label">Of portfolio</span><span class="tt-val">${sharePct}%</span></div>
        <div class="tt-row"><span class="tt-label">Stake in co.</span><span class="tt-val">${formatPct(d.data.pct)}</span></div>`,
        true,
        e.clientX,
        e.clientY
      );
    })
    .on('mousemove', (e) => tt(tooltip, '', true, e.clientX, e.clientY))
    .on('mouseout', function () {
      d3.select(this).transition().duration(150).attr('d', arc);
      tt(tooltip, '', false);
    })
    .attr('cursor', 'pointer')
    .on('click', (_e, d) => opts.onStockClick(d.data.code));

  if (pieData.length <= 8) {
    svg
      .selectAll('text.pie-label')
      .data(pie(pieData))
      .join('text')
      .attr('class', 'pie-label')
      .attr('transform', (d) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#fff')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .text((d) => d.data.code);
  }

  svg
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '-0.2em')
    .attr('fill', 'var(--text)')
    .attr('font-size', '18px')
    .attr('font-weight', '700')
    .text(String(pieData.length));
  svg
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '1.2em')
    .attr('fill', 'var(--text-dim)')
    .attr('font-size', '11px')
    .text(opts.t('pie_stocks'));
}

/** Stock ownership breakdown by investor (shares). */
export function renderStockPie(
  container: HTMLElement,
  rows: HolderRow[],
  opts: { t: (k: string) => string; onInvestorClick: (name: string) => void }
) {
  container.innerHTML = '';
  const size = 260;
  const radius = size / 2;
  const inner = radius * 0.55;
  const svg = d3
    .select(container)
    .append('svg')
    .attr('viewBox', `0 0 ${size} ${size}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .append('g')
    .attr('transform', `translate(${radius},${radius})`);

  const totalShares = rows.reduce((s, r) => s + r.total_holding_shares, 0);
  const pieData = rows
    .map((r) => ({
      name: r.investor_name,
      value: r.total_holding_shares,
      pct: r.percentage,
      type: r.investor_type,
    }))
    .sort((a, b) => b.value - a.value);

  const pie = d3.pie<(typeof pieData)[0]>().value((d) => d.value).sort(null).padAngle(0.02);
  const arc = d3.arc<d3.PieArcDatum<(typeof pieData)[0]>>().innerRadius(inner).outerRadius(radius - 4);
  const arcHover = d3
    .arc<d3.PieArcDatum<(typeof pieData)[0]>>()
    .innerRadius(inner)
    .outerRadius(radius);

  const color = d3
    .scaleOrdinal<string>()
    .domain(pieData.map((d) => d.name))
    .range(d3.quantize((t) => d3.interpolateRainbow(t * 0.8 + 0.1), Math.max(pieData.length, 2)));

  const tooltip = document.getElementById('tooltip');

  svg
    .selectAll('path')
    .data(pie(pieData))
    .join('path')
    .attr('d', arc)
    .attr('fill', (d) => color(d.data.name))
    .attr('stroke', 'var(--surface)')
    .attr('stroke-width', 1)
    .on('mouseover', function (e, d) {
      d3.select(this).transition().duration(150).attr('d', arcHover);
      const sharePct =
        totalShares > 0 ? ((d.data.value / totalShares) * 100).toFixed(1) : '0';
      tt(
        tooltip,
        `<div class="tt-ticker">${esc(d.data.name)}</div>
        <div class="tt-row"><span class="tt-label">Shares</span><span class="tt-val">${formatInt(d.data.value)}</span></div>
        <div class="tt-row"><span class="tt-label">Of holders</span><span class="tt-val">${sharePct}%</span></div>
        <div class="tt-row"><span class="tt-label">Stake</span><span class="tt-val">${formatPct(d.data.pct)}</span></div>`,
        true,
        e.clientX,
        e.clientY
      );
    })
    .on('mousemove', (e) => tt(tooltip, '', true, e.clientX, e.clientY))
    .on('mouseout', function () {
      d3.select(this).transition().duration(150).attr('d', arc);
      tt(tooltip, '', false);
    })
    .attr('cursor', 'pointer')
    .on('click', (_e, d) => opts.onInvestorClick(d.data.name));

  if (pieData.length <= 8) {
    svg
      .selectAll('text.pie-label')
      .data(pie(pieData))
      .join('text')
      .attr('class', 'pie-label')
      .attr('transform', (d) => `translate(${arc.centroid(d)})`)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', '#fff')
      .attr('font-size', '9px')
      .attr('font-weight', '600')
      .text((d) => (d.data.name.length > 10 ? d.data.name.slice(0, 9) + '…' : d.data.name));
  }

  svg
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '-0.2em')
    .attr('fill', 'var(--text)')
    .attr('font-size', '18px')
    .attr('font-weight', '700')
    .text(String(pieData.length));
  svg
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '1.2em')
    .attr('fill', 'var(--text-dim)')
    .attr('font-size', '11px')
    .text(opts.t('pie_holders'));
}
